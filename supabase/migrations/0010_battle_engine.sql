-- ============================================================================
-- PokéGear 10.0 — Part 2: Battle engine, rewards & security
-- ============================================================================
-- Every battle action a trainer can take is a security-definer function
-- here. The client only ever says *what* it wants to do ("use Thunderbolt on
-- enemy #2"); damage, HP, item counts, XP and money are all computed and
-- written server-side. Internal helpers (prefixed with _) are not callable
-- from the API at all.
--
-- Also in this file:
--   * low-notification cleanup: fainted / healed / revived / battle-ended /
--     battle XP no longer create persistent notifications;
--   * trainers can no longer edit their own KP or XP unless the Game Master
--     turns game_config.player_self_edit on;
--   * Pokémon Center party heal (heal_party).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Config helpers
-- ---------------------------------------------------------------------------
create or replace function public.get_config_numeric(p_key text, p_default numeric)
returns numeric
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select (value #>> '{}')::numeric from public.game_config where key = p_key), p_default);
$$;

create or replace function public.get_config_bool(p_key text, p_default boolean)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select (value #>> '{}')::boolean from public.game_config where key = p_key), p_default);
$$;

-- ---------------------------------------------------------------------------
-- Pure battle math (immutable / stable, safe to expose)
-- ---------------------------------------------------------------------------
create or replace function public.pokemon_stat(p_level integer, p_bonus integer)
returns integer
language sql
immutable
as $$
  select greatest(1, 40 + 6 * greatest(p_level, 1) + coalesce(p_bonus, 0));
$$;

create or replace function public.type_multiplier(p_attack_type text, p_def_type1 text, p_def_type2 text)
returns numeric
language sql
stable
set search_path = public
as $$
  select
    coalesce((select multiplier from public.type_effectiveness where attack_type = p_attack_type and defend_type = p_def_type1), 1)
    * case
        when p_def_type2 is null or p_def_type2 = p_def_type1 then 1
        else coalesce((select multiplier from public.type_effectiveness where attack_type = p_attack_type and defend_type = p_def_type2), 1)
      end;
$$;

-- Core damage formula: the main-series formula, multiplied by the campaign's
-- battle_damage_scale so hits land in the tens-to-hundreds range.
--   base = floor(floor(floor(2L/5 + 2) * Power * A / D) / 50) + 2
--   damage = base * scale * STAB(1.5) * type * crit(1.5) * roll(0.85-1.00) * burn(0.5, physical)
create or replace function public.calc_damage(
  p_level integer,
  p_power integer,
  p_attack integer,
  p_defense integer,
  p_effectiveness numeric,
  p_stab boolean,
  p_critical boolean,
  p_roll numeric,
  p_burned boolean,
  p_scale numeric
)
returns integer
language plpgsql
immutable
as $$
declare
  v_base numeric;
  v_damage numeric;
begin
  if p_effectiveness <= 0 then
    return 0;
  end if;
  v_base := floor(floor(floor(2 * greatest(p_level, 1) / 5.0 + 2) * p_power * greatest(p_attack, 1) / greatest(p_defense, 1)) / 50) + 2;
  v_damage := v_base * p_scale
    * case when p_stab then 1.5 else 1 end
    * p_effectiveness
    * case when p_critical then 1.5 else 1 end
    * p_roll
    * case when p_burned then 0.5 else 1 end;
  return greatest(1, floor(v_damage)::integer);
end;
$$;

-- Default move set for a typing + level: the strongest same-type moves the
-- Pokémon could plausibly know at that level, plus normal-type coverage.
create or replace function public.default_move_ids(p_type1 text, p_type2 text, p_level integer)
returns smallint[]
language sql
stable
set search_path = public
as $$
  with ranked as (
    select m.id, m.type,
      row_number() over (partition by m.type order by m.power desc, coalesce(m.accuracy, 101) desc, m.id) as rn
    from public.moves m
    where m.power <= 40 + 10 * greatest(p_level, 1)
      and m.type in (coalesce(p_type1, 'normal'), coalesce(p_type2, coalesce(p_type1, 'normal')), 'normal')
  ),
  picks as (
    select id, 1 as pri from ranked where type = coalesce(p_type1, 'normal') and rn = 1
    union all select id, 2 from ranked where p_type2 is not null and type = p_type2 and rn = 1
    union all select id, 3 from ranked where type = coalesce(p_type1, 'normal') and rn = 2
    union all select id, 4 from ranked where type = 'normal' and rn = 1
    union all select id, 5 from ranked where p_type2 is not null and type = p_type2 and rn = 2
    union all select id, 6 from ranked where type = 'normal' and rn = 2
    union all select id, 7 from ranked where type = coalesce(p_type1, 'normal') and rn = 3
    union all select id, 8 from ranked where type = 'normal' and rn = 3
  ),
  dedup as (
    select distinct on (id) id, pri from picks order by id, pri
  )
  select coalesce(
    nullif(array(select id from dedup order by pri limit 4), '{}'),
    array(select id from public.moves where name = 'Tackle')
  );
$$;

create or replace function public.suggest_moves(p_type1 text, p_type2 text, p_level integer)
returns setof public.moves
language sql
stable
set search_path = public
as $$
  select m.* from unnest(public.default_move_ids(p_type1, p_type2, p_level)) with ordinality u(id, ord)
  join public.moves m on m.id = u.id
  order by u.ord;
$$;

grant execute on function public.suggest_moves(text, text, integer) to authenticated;

create or replace function public.pokemon_move_ids(p_pokemon_id uuid)
returns smallint[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(array(select move_id from public.trainer_pokemon_moves where pokemon_id = p_pokemon_id order by slot), '{}'),
    (select public.default_move_ids(coalesce(s.type1, 'normal'), s.type2, tp.level)
     from public.trainer_pokemon tp join public.species s on s.id = tp.species_id
     where tp.id = p_pokemon_id)
  );
$$;

create or replace function public.moves_json(p_ids smallint[])
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'name', m.name, 'type', m.type, 'category', m.category,
    'power', m.power, 'accuracy', m.accuracy
  ) order by u.ord), '[]'::jsonb)
  from unnest(p_ids) with ordinality u(id, ord)
  join public.moves m on m.id = u.id;
$$;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable from the API)
-- ---------------------------------------------------------------------------
create or replace function public._pokemon_label(p_pokemon_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(tp.nickname, s.name)
  from public.trainer_pokemon tp join public.species s on s.id = tp.species_id
  where tp.id = p_pokemon_id;
$$;

create or replace function public._battle_log(
  p_encounter_id uuid,
  p_action text,
  p_target_type text,
  p_target_pokemon_id uuid,
  p_enemy_id uuid,
  p_label text,
  p_prev integer,
  p_new integer,
  p_actor uuid,
  p_move text,
  p_critical boolean,
  p_effectiveness numeric,
  p_message text
)
returns void
language sql
security definer
set search_path = public
as $$
  -- clock_timestamp(), not now(): one action writes several log lines in a
  -- single transaction, and now() would give them all the same time, so
  -- "X used Y" / "X fainted" / "Victory!" could come back in any order.
  insert into public.battle_logs
    (encounter_id, action, target_type, target_pokemon_id, enemy_id, target_label,
     previous_kp, new_kp, delta, author_id, actor_profile_id, move_name, is_critical, effectiveness, message, created_at)
  values
    (p_encounter_id, p_action, p_target_type, p_target_pokemon_id, p_enemy_id, coalesce(p_label, ''),
     coalesce(p_prev, 0), coalesce(p_new, 0), coalesce(p_new, 0) - coalesce(p_prev, 0),
     p_actor, p_actor, p_move, p_critical, p_effectiveness, p_message, clock_timestamp());
$$;

create or replace function public._effectiveness_text(p_eff numeric, p_target text)
returns text
language sql
immutable
as $$
  select case
    when p_eff = 0 then format('It doesn''t affect %s…', p_target)
    when p_eff > 1 then 'It''s super effective!'
    when p_eff < 1 then 'It''s not very effective…'
    else null
  end;
$$;

-- Usable = could still be sent out: in the party, alive, not fainted, KP > 0.
create or replace function public._usable_pokemon_count(p_profile_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.trainer_pokemon
  where profile_id = p_profile_id and party_slot is not null
    and not is_dead and status <> 'fainted' and current_hp > 0;
$$;

create or replace function public.is_in_active_battle(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.battle_players bp
    join public.battle_encounters e on e.id = bp.encounter_id
    where bp.profile_id = p_profile_id and e.mode = 'auto' and e.status = 'active'
  );
$$;

-- Status conditions that can stop a trainer's Pokémon from acting this
-- turn. Returns {"can_act": bool, "events": [...]}, and wakes/thaws the
-- Pokémon itself when that happens.
create or replace function public._battle_status_gate(p_encounter_id uuid, p_pokemon_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.trainer_pokemon;
  v_name text;
  v_events jsonb := '[]'::jsonb;
begin
  select * into v_p from public.trainer_pokemon where id = p_pokemon_id;
  v_name := public._pokemon_label(p_pokemon_id);

  if v_p.status = 'paralyzed' and random() < 0.25 then
    return jsonb_build_object('can_act', false, 'events', jsonb_build_array(jsonb_build_object(
      'type', 'blocked', 'side', 'player', 'pokemon_id', p_pokemon_id,
      'message', format('%s is paralyzed! It can''t move!', v_name))));
  elsif v_p.status in ('asleep', 'frozen') then
    if (v_p.status = 'asleep' and random() < 0.5) or (v_p.status = 'frozen' and random() < 0.2) then
      perform set_config('pokegear.bypass_pokemon_guard', 'on', true);
      update public.trainer_pokemon set status = 'healthy' where id = p_pokemon_id;
      v_events := v_events || jsonb_build_object(
        'type', 'status', 'pokemon_id', p_pokemon_id, 'status', 'healthy',
        'message', case when v_p.status = 'asleep' then format('%s woke up!', v_name) else format('%s thawed out!', v_name) end);
      perform public._battle_log(p_encounter_id, 'status', 'trainer_pokemon', p_pokemon_id, null, v_name,
        v_p.current_hp, v_p.current_hp, null, null, null, null, v_events -> 0 ->> 'message');
    else
      return jsonb_build_object('can_act', false, 'events', jsonb_build_array(jsonb_build_object(
        'type', 'blocked', 'side', 'player', 'pokemon_id', p_pokemon_id,
        'message', case when v_p.status = 'asleep' then format('%s is fast asleep.', v_name) else format('%s is frozen solid!', v_name) end)));
    end if;
  end if;

  return jsonb_build_object('can_act', true, 'events', v_events);
end;
$$;

-- A trainer's Pokémon attacks one enemy.
create or replace function public._battle_player_attack(
  p_encounter_id uuid,
  p_battle_player_id uuid,
  p_pokemon_id uuid,
  p_move_id smallint,
  p_enemy_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.trainer_pokemon;
  v_s public.species;
  v_m public.moves;
  v_e public.battle_enemies;
  v_actor uuid;
  v_name text;
  v_eff numeric;
  v_crit boolean := false;
  v_missed boolean := false;
  v_damage integer := 0;
  v_new_hp integer;
  v_atk integer;
  v_def integer;
  v_events jsonb := '[]'::jsonb;
  v_msg text;
begin
  select * into v_p from public.trainer_pokemon where id = p_pokemon_id;
  select * into v_s from public.species where id = v_p.species_id;
  select * into v_m from public.moves where id = p_move_id;
  select * into v_e from public.battle_enemies where id = p_enemy_id for update;
  select profile_id into v_actor from public.battle_players where id = p_battle_player_id;
  v_name := coalesce(v_p.nickname, v_s.name);

  if v_e.current_hp <= 0 then
    return v_events;
  end if;

  v_eff := public.type_multiplier(v_m.type, v_e.type1, v_e.type2);

  if v_m.accuracy is not null and random() * 100 >= v_m.accuracy then
    v_missed := true;
  elsif v_eff > 0 then
    v_crit := random() < public.get_config_numeric('battle_crit_chance', 0.0625);
    if v_m.category = 'physical' then
      v_atk := public.pokemon_stat(v_p.level, v_p.bonus_attack);
      v_def := v_e.defense;
    else
      v_atk := public.pokemon_stat(v_p.level, v_p.bonus_sp_attack);
      v_def := v_e.sp_defense;
    end if;
    v_damage := public.calc_damage(
      v_p.level, v_m.power, v_atk, v_def, v_eff,
      v_m.type in (coalesce(v_s.type1, 'normal'), v_s.type2),
      v_crit, (0.85 + random() * 0.15)::numeric,
      v_p.status = 'burned' and v_m.category = 'physical',
      public.get_config_numeric('battle_damage_scale', 5)
    );
  end if;

  v_new_hp := greatest(0, v_e.current_hp - v_damage);
  update public.battle_enemies
  set current_hp = v_new_hp,
      fainted_at = case when v_new_hp = 0 then now() else null end
  where id = v_e.id;

  if v_e.current_hp - v_new_hp > 0 then
    update public.battle_players set damage_dealt = damage_dealt + (v_e.current_hp - v_new_hp) where id = p_battle_player_id;
  end if;

  v_msg := format('%s used %s!', v_name, v_m.name);
  v_events := v_events || jsonb_build_object(
    'type', 'attack', 'side', 'player',
    'attacker_id', v_p.id, 'attacker_name', v_name, 'attacker_profile_id', v_actor,
    'move_name', v_m.name, 'move_type', v_m.type, 'move_category', v_m.category,
    'target_id', v_e.id, 'target_name', v_e.name,
    'missed', v_missed, 'damage', v_damage, 'effectiveness', v_eff, 'critical', v_crit,
    'hp_before', v_e.current_hp, 'hp_after', v_new_hp, 'max_hp', v_e.max_hp,
    'fainted', v_new_hp = 0,
    'message', v_msg,
    'detail', case
      when v_missed then format('%s''s attack missed!', v_name)
      else concat_ws(' ', case when v_crit then 'A critical hit!' end, public._effectiveness_text(v_eff, v_e.name))
    end
  );

  perform public._battle_log(p_encounter_id, 'attack', 'enemy', null, v_e.id, v_e.name,
    v_e.current_hp, v_new_hp, v_actor, v_m.name, v_crit, v_eff,
    case when v_missed then format('%s used %s, but it missed!', v_name, v_m.name)
         when v_eff = 0 then format('%s used %s, but it had no effect on %s.', v_name, v_m.name, v_e.name)
         else format('%s used %s on %s for %s damage.', v_name, v_m.name, v_e.name, v_damage) end);

  if v_new_hp = 0 then
    v_events := v_events || jsonb_build_object('type', 'faint', 'side', 'enemy', 'target_id', v_e.id,
      'message', format('%s fainted!', v_e.name));
    perform public._battle_log(p_encounter_id, 'faint', 'enemy', null, v_e.id, v_e.name, 0, 0, null, null, null, null,
      format('%s fainted!', v_e.name));
  end if;

  return v_events;
end;
$$;

-- One enemy attacks one trainer Pokémon. The enemy picks the move that
-- would hurt most 70% of the time, otherwise a random one of its moves.
create or replace function public._battle_enemy_attack(p_encounter_id uuid, p_enemy_id uuid, p_pokemon_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.battle_encounters;
  v_e public.battle_enemies;
  v_p public.trainer_pokemon;
  v_s public.species;
  v_name text;
  v_move_ids smallint[];
  v_m public.moves;
  v_eff numeric;
  v_crit boolean := false;
  v_missed boolean := false;
  v_damage integer := 0;
  v_new_hp integer;
  v_atk integer;
  v_def integer;
  v_events jsonb := '[]'::jsonb;
begin
  select * into v_enc from public.battle_encounters where id = p_encounter_id;
  select * into v_e from public.battle_enemies where id = p_enemy_id;
  select * into v_p from public.trainer_pokemon where id = p_pokemon_id for update;

  if v_e.id is null or v_e.current_hp <= 0 or v_p.id is null or v_p.is_dead
     or v_p.status = 'fainted' or v_p.current_hp <= 0 then
    return v_events;
  end if;

  select * into v_s from public.species where id = v_p.species_id;
  v_name := coalesce(v_p.nickname, v_s.name);

  v_move_ids := coalesce(nullif(v_e.move_ids, '{}'), public.default_move_ids(v_e.type1, v_e.type2, v_e.level));

  if random() < 0.7 then
    select m.* into v_m from public.moves m
    where m.id = any(v_move_ids)
    order by m.power
      * public.type_multiplier(m.type, coalesce(v_s.type1, 'normal'), v_s.type2)
      * case when m.type in (v_e.type1, v_e.type2) then 1.5 else 1 end
      * coalesce(m.accuracy, 100) desc
    limit 1;
  else
    select m.* into v_m from public.moves m where m.id = any(v_move_ids) order by random() limit 1;
  end if;

  v_eff := public.type_multiplier(v_m.type, coalesce(v_s.type1, 'normal'), v_s.type2);

  if v_m.accuracy is not null and random() * 100 >= v_m.accuracy then
    v_missed := true;
  elsif v_eff > 0 then
    v_crit := random() < public.get_config_numeric('battle_crit_chance', 0.0625);
    if v_m.category = 'physical' then
      v_atk := v_e.attack;
      v_def := public.pokemon_stat(v_p.level, v_p.bonus_defense);
    else
      v_atk := v_e.sp_attack;
      v_def := public.pokemon_stat(v_p.level, v_p.bonus_sp_defense);
    end if;
    v_damage := public.calc_damage(
      v_e.level, v_m.power, v_atk, v_def, v_eff,
      v_m.type in (v_e.type1, v_e.type2),
      v_crit, (0.85 + random() * 0.15)::numeric, false,
      public.get_config_numeric('battle_damage_scale', 5) * v_enc.enemy_damage_scale
    );
  end if;

  v_new_hp := greatest(0, v_p.current_hp - v_damage);
  perform set_config('pokegear.bypass_pokemon_guard', 'on', true);
  update public.trainer_pokemon
  set current_hp = v_new_hp,
      status = case when v_new_hp = 0 then 'fainted'::public.pokemon_status else status end
  where id = v_p.id;

  v_events := v_events || jsonb_build_object(
    'type', 'attack', 'side', 'enemy',
    'attacker_id', v_e.id, 'attacker_name', v_e.name,
    'move_name', v_m.name, 'move_type', v_m.type, 'move_category', v_m.category,
    'target_id', v_p.id, 'target_name', v_name, 'target_profile_id', v_p.profile_id,
    'missed', v_missed, 'damage', v_damage, 'effectiveness', v_eff, 'critical', v_crit,
    'hp_before', v_p.current_hp, 'hp_after', v_new_hp, 'max_hp', v_p.max_hp,
    'fainted', v_new_hp = 0,
    'message', format('%s used %s!', v_e.name, v_m.name),
    'detail', case
      when v_missed then format('%s avoided the attack!', v_name)
      else concat_ws(' ', case when v_crit then 'A critical hit!' end, public._effectiveness_text(v_eff, v_name))
    end
  );

  perform public._battle_log(p_encounter_id, 'enemy_attack', 'trainer_pokemon', v_p.id, v_e.id, v_name,
    v_p.current_hp, v_new_hp, null, v_m.name, v_crit, v_eff,
    case when v_missed then format('%s used %s, but %s avoided it!', v_e.name, v_m.name, v_name)
         when v_eff = 0 then format('%s used %s, but it had no effect on %s.', v_e.name, v_m.name, v_name)
         else format('%s used %s on %s for %s damage.', v_e.name, v_m.name, v_name, v_damage) end);

  if v_new_hp = 0 then
    v_events := v_events || jsonb_build_object('type', 'faint', 'side', 'player', 'target_id', v_p.id,
      'target_profile_id', v_p.profile_id, 'message', format('%s fainted!', v_name));
    perform public._battle_log(p_encounter_id, 'faint', 'trainer_pokemon', v_p.id, null, v_name, 0, 0, null, null, null, null,
      format('%s fainted!', v_name));
  end if;

  return v_events;
end;
$$;

-- End-of-turn poison/burn damage (1/8 of max KP) on a trainer's Pokémon.
create or replace function public._battle_status_chip(p_encounter_id uuid, p_pokemon_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.trainer_pokemon;
  v_name text;
  v_damage integer;
  v_new_hp integer;
  v_events jsonb := '[]'::jsonb;
begin
  select * into v_p from public.trainer_pokemon where id = p_pokemon_id for update;
  if v_p.id is null or v_p.status not in ('poisoned', 'burned') or v_p.current_hp <= 0 then
    return v_events;
  end if;
  v_name := public._pokemon_label(p_pokemon_id);
  v_damage := greatest(1, v_p.max_hp / 8);
  v_new_hp := greatest(0, v_p.current_hp - v_damage);

  perform set_config('pokegear.bypass_pokemon_guard', 'on', true);
  update public.trainer_pokemon
  set current_hp = v_new_hp,
      status = case when v_new_hp = 0 then 'fainted'::public.pokemon_status else status end
  where id = p_pokemon_id;

  v_events := v_events || jsonb_build_object(
    'type', 'chip', 'pokemon_id', p_pokemon_id, 'damage', v_damage,
    'hp_before', v_p.current_hp, 'hp_after', v_new_hp, 'max_hp', v_p.max_hp, 'fainted', v_new_hp = 0,
    'message', format('%s is hurt by its %s!', v_name, case when v_p.status = 'poisoned' then 'poison' else 'burn' end));
  perform public._battle_log(p_encounter_id, 'status_damage', 'trainer_pokemon', p_pokemon_id, null, v_name,
    v_p.current_hp, v_new_hp, null, null, null, null, v_events -> 0 ->> 'message');

  if v_new_hp = 0 then
    v_events := v_events || jsonb_build_object('type', 'faint', 'side', 'player', 'target_id', p_pokemon_id,
      'target_profile_id', v_p.profile_id, 'message', format('%s fainted!', v_name));
    perform public._battle_log(p_encounter_id, 'faint', 'trainer_pokemon', p_pokemon_id, null, v_name, 0, 0, null, null, null, null,
      format('%s fainted!', v_name));
  end if;
  return v_events;
end;
$$;

-- Victory when every enemy is down; defeat when no trainer has a usable
-- Pokémon left. Only ever moves an *active* encounter forward.
create or replace function public._battle_check_end(p_encounter_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.battle_encounters;
begin
  select * into v_enc from public.battle_encounters where id = p_encounter_id;
  if v_enc.status <> 'active' then
    return '[]'::jsonb;
  end if;

  if not exists (select 1 from public.battle_enemies where encounter_id = p_encounter_id and current_hp > 0) then
    update public.battle_encounters set status = 'completed', completed_at = now() where id = p_encounter_id;
    perform public._battle_log(p_encounter_id, 'victory', 'system', null, null, '', 0, 0, null, null, null, null,
      'All enemy Pokémon were defeated! Victory!');
    return jsonb_build_array(jsonb_build_object('type', 'victory', 'message', 'All enemy Pokémon were defeated!'));
  end if;

  if not exists (
    select 1 from public.battle_players bp
    where bp.encounter_id = p_encounter_id and public._usable_pokemon_count(bp.profile_id) > 0
  ) then
    update public.battle_encounters set status = 'lost', completed_at = now() where id = p_encounter_id;
    perform public._battle_log(p_encounter_id, 'defeat', 'system', null, null, '', 0, 0, null, null, null, null,
      'Every trainer is out of usable Pokémon…');
    return jsonb_build_array(jsonb_build_object('type', 'defeat', 'message', 'Every trainer is out of usable Pokémon…'));
  end if;

  return '[]'::jsonb;
end;
$$;

-- Locks the encounter and returns the caller's battle_players row, or raises.
create or replace function public._battle_lock_for_player(p_encounter_id uuid)
returns public.battle_players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.battle_encounters;
  v_bp public.battle_players;
begin
  select * into v_enc from public.battle_encounters where id = p_encounter_id for update;
  if v_enc.id is null or v_enc.mode <> 'auto' then
    raise exception 'Battle not found';
  end if;
  select * into v_bp from public.battle_players
  where encounter_id = p_encounter_id and profile_id = public.my_profile_id()
  for update;
  if v_bp.id is null then
    raise exception 'You are not part of this battle';
  end if;
  if v_enc.status <> 'active' then
    raise exception 'This battle is already over';
  end if;
  return v_bp;
end;
$$;

-- Picks which enemy retaliates: the one that was targeted if it's still
-- standing, otherwise the first enemy still standing.
create or replace function public._battle_counter_enemy(p_encounter_id uuid, p_preferred uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.battle_enemies
  where encounter_id = p_encounter_id and current_hp > 0
  order by (id = p_preferred) desc, slot
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Trainer-facing battle actions
-- ---------------------------------------------------------------------------

-- Send out (or switch to) a Pokémon. Switching away from a Pokémon that can
-- still fight costs the turn: an enemy gets a free attack on the newcomer.
create or replace function public.battle_choose_pokemon(p_encounter_id uuid, p_pokemon_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bp public.battle_players;
  v_enc public.battle_encounters;
  v_p public.trainer_pokemon;
  v_prev public.trainer_pokemon;
  v_name text;
  v_is_switch boolean := false;
  v_events jsonb := '[]'::jsonb;
  v_enemy uuid;
begin
  v_bp := public._battle_lock_for_player(p_encounter_id);
  select * into v_enc from public.battle_encounters where id = p_encounter_id;

  select * into v_p from public.trainer_pokemon where id = p_pokemon_id;
  if v_p.id is null or v_p.profile_id <> v_bp.profile_id then
    raise exception 'That Pokémon isn''t yours';
  end if;
  if v_p.party_slot is null then
    raise exception 'Only Pokémon in your party can battle';
  end if;
  if v_p.is_dead or v_p.status = 'fainted' or v_p.current_hp <= 0 then
    raise exception 'That Pokémon can''t battle right now';
  end if;
  if v_bp.active_pokemon_id = p_pokemon_id then
    raise exception 'That Pokémon is already in battle';
  end if;

  if v_bp.active_pokemon_id is not null then
    select * into v_prev from public.trainer_pokemon where id = v_bp.active_pokemon_id;
    v_is_switch := v_prev.id is not null and not v_prev.is_dead and v_prev.status <> 'fainted' and v_prev.current_hp > 0;
  end if;

  update public.battle_players set active_pokemon_id = p_pokemon_id where id = v_bp.id;
  -- Keep the Phase 9 participants table in sync: it's what makes the
  -- Pokémon visible to the rest of the table under existing RLS.
  insert into public.battle_participants (encounter_id, pokemon_id, profile_id)
  values (p_encounter_id, p_pokemon_id, v_bp.profile_id)
  on conflict (encounter_id, pokemon_id) do nothing;

  v_name := public._pokemon_label(p_pokemon_id);
  v_events := v_events || jsonb_build_object(
    'type', 'switch', 'pokemon_id', p_pokemon_id, 'pokemon_name', v_name, 'species_id', v_p.species_id,
    'profile_id', v_bp.profile_id,
    'message', case when v_is_switch
      then format('Come back, %s! Go, %s!', public._pokemon_label(v_prev.id), v_name)
      else format('Go, %s!', v_name) end);
  perform public._battle_log(p_encounter_id, 'switch', 'trainer_pokemon', p_pokemon_id, null, v_name,
    v_p.current_hp, v_p.current_hp, v_bp.profile_id, null, null, null, v_events -> 0 ->> 'message');

  if v_is_switch and v_enc.enemy_auto_attack then
    v_enemy := public._battle_counter_enemy(p_encounter_id, null);
    if v_enemy is not null then
      v_events := v_events || public._battle_enemy_attack(p_encounter_id, v_enemy, p_pokemon_id);
    end if;
  end if;

  v_events := v_events || public._battle_check_end(p_encounter_id);
  return jsonb_build_object('events', v_events);
end;
$$;

-- Attack an enemy with one of the active Pokémon's moves.
create or replace function public.battle_attack(p_encounter_id uuid, p_move_id smallint, p_target_enemy_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bp public.battle_players;
  v_enc public.battle_encounters;
  v_p public.trainer_pokemon;
  v_target public.battle_enemies;
  v_counter uuid;
  v_counter_speed integer;
  v_my_speed integer;
  v_enemy_first boolean := false;
  v_gate jsonb;
  v_events jsonb := '[]'::jsonb;
begin
  v_bp := public._battle_lock_for_player(p_encounter_id);
  select * into v_enc from public.battle_encounters where id = p_encounter_id;

  if v_bp.active_pokemon_id is null then
    raise exception 'Choose a Pokémon first';
  end if;
  select * into v_p from public.trainer_pokemon where id = v_bp.active_pokemon_id for update;
  if v_p.is_dead or v_p.status = 'fainted' or v_p.current_hp <= 0 then
    raise exception 'Your Pokémon can''t fight — switch to another one';
  end if;
  if not (p_move_id = any(public.pokemon_move_ids(v_p.id))) then
    raise exception 'Your Pokémon doesn''t know that move';
  end if;

  if p_target_enemy_id is null then
    select * into v_target from public.battle_enemies
    where encounter_id = p_encounter_id and current_hp > 0 order by slot limit 1;
  else
    select * into v_target from public.battle_enemies
    where id = p_target_enemy_id and encounter_id = p_encounter_id;
  end if;
  if v_target.id is null then
    raise exception 'That enemy isn''t in this battle';
  end if;
  if v_target.current_hp <= 0 then
    raise exception '% has already fainted', v_target.name;
  end if;

  if v_enc.enemy_auto_attack then
    v_counter := public._battle_counter_enemy(p_encounter_id, v_target.id);
    select speed into v_counter_speed from public.battle_enemies where id = v_counter;
    v_my_speed := public.pokemon_stat(v_p.level, v_p.bonus_speed) / case when v_p.status = 'paralyzed' then 2 else 1 end;
    v_enemy_first := v_counter is not null and v_counter_speed > v_my_speed;
  end if;

  if v_enemy_first then
    v_events := v_events || public._battle_enemy_attack(p_encounter_id, v_counter, v_p.id);
    select * into v_p from public.trainer_pokemon where id = v_p.id;
  end if;

  if not v_p.is_dead and v_p.status <> 'fainted' and v_p.current_hp > 0 then
    v_gate := public._battle_status_gate(p_encounter_id, v_p.id);
    v_events := v_events || (v_gate -> 'events');
    if (v_gate ->> 'can_act')::boolean then
      v_events := v_events || public._battle_player_attack(p_encounter_id, v_bp.id, v_p.id, p_move_id, v_target.id);
    end if;
  end if;

  if not v_enemy_first and v_counter is not null then
    -- The targeted enemy only strikes back if it's still standing.
    v_counter := public._battle_counter_enemy(p_encounter_id, v_target.id);
    if v_counter is not null and (v_counter = v_target.id or v_target.id is null
       or exists (select 1 from public.battle_enemies where id = v_target.id and current_hp > 0)) then
      v_events := v_events || public._battle_enemy_attack(p_encounter_id, v_counter, v_p.id);
    end if;
  end if;

  v_events := v_events || public._battle_status_chip(p_encounter_id, v_p.id);
  v_events := v_events || public._battle_check_end(p_encounter_id);
  return jsonb_build_object('events', v_events);
end;
$$;

-- Use a Bag item on one of your own party Pokémon during battle.
create or replace function public.battle_use_item(p_encounter_id uuid, p_item_id uuid, p_pokemon_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bp public.battle_players;
  v_enc public.battle_encounters;
  v_item public.items_catalog;
  v_effect jsonb;
  v_qty integer;
  v_p public.trainer_pokemon;
  v_name text;
  v_new_hp integer;
  v_new_status public.pokemon_status;
  v_revived boolean := false;
  v_cured boolean := false;
  v_healed boolean := false;
  v_cure jsonb;
  v_active public.trainer_pokemon;
  v_enemy uuid;
  v_msg text;
  v_events jsonb := '[]'::jsonb;
begin
  v_bp := public._battle_lock_for_player(p_encounter_id);
  select * into v_enc from public.battle_encounters where id = p_encounter_id;

  select * into v_item from public.items_catalog where id = p_item_id;
  v_effect := v_item.battle_effect;
  if v_item.id is null or v_effect is null then
    raise exception 'That item can''t be used in battle';
  end if;

  select quantity into v_qty from public.trainer_items
  where profile_id = v_bp.profile_id and item_id = p_item_id for update;
  if coalesce(v_qty, 0) < 1 then
    raise exception 'You don''t have any % left', v_item.name;
  end if;

  select * into v_p from public.trainer_pokemon where id = p_pokemon_id for update;
  if v_p.id is null or v_p.profile_id <> v_bp.profile_id then
    raise exception 'That Pokémon isn''t yours';
  end if;
  if v_p.party_slot is null then
    raise exception 'You can only use items on Pokémon in your party';
  end if;
  if v_p.is_dead then
    raise exception 'Nothing can help this Pokémon now';
  end if;

  v_name := coalesce(v_p.nickname, (select name from public.species where id = v_p.species_id));
  v_new_hp := v_p.current_hp;
  v_new_status := v_p.status;

  if v_p.status = 'fainted' then
    if v_effect ? 'revive' then
      v_new_hp := greatest(1, floor(v_p.max_hp * least(1, greatest(0.01, (v_effect ->> 'revive')::numeric)))::integer);
      v_new_status := 'healthy';
      v_revived := true;
    else
      raise exception '% has fainted — only a revive can help', v_name;
    end if;
  else
    if v_effect ? 'revive' and not (v_effect ? 'heal' or v_effect ? 'heal_full' or v_effect ? 'cure') then
      raise exception '% hasn''t fainted — it won''t have any effect', v_name;
    end if;
    if coalesce((v_effect ->> 'heal_full')::boolean, false) then
      v_new_hp := v_p.max_hp;
    elsif v_effect ? 'heal' then
      v_new_hp := least(v_p.max_hp, v_p.current_hp + (v_effect ->> 'heal')::integer);
    end if;
    v_healed := v_new_hp > v_p.current_hp;

    v_cure := v_effect -> 'cure';
    if v_cure is not null and v_p.status <> 'healthy' then
      if jsonb_typeof(v_cure) = 'boolean' and (v_cure #>> '{}')::boolean then
        v_new_status := 'healthy';
        v_cured := true;
      elsif jsonb_typeof(v_cure) = 'array' and v_cure ? v_p.status::text then
        v_new_status := 'healthy';
        v_cured := true;
      end if;
    end if;

    if not v_healed and not v_cured then
      raise exception 'It won''t have any effect on %', v_name;
    end if;
  end if;

  -- Spend exactly one item. The trainer_items row lock above means two
  -- simultaneous uses can't both spend the same last Potion.
  perform set_config('pokegear.suppress_item_notification', 'on', true);
  update public.trainer_items set quantity = quantity - 1
  where profile_id = v_bp.profile_id and item_id = p_item_id;
  delete from public.trainer_items where profile_id = v_bp.profile_id and item_id = p_item_id and quantity <= 0;

  perform set_config('pokegear.bypass_pokemon_guard', 'on', true);
  update public.trainer_pokemon set current_hp = v_new_hp, status = v_new_status where id = v_p.id;

  v_msg := case
    when v_revived then format('%s was revived!', v_name)
    when v_healed and v_cured then format('%s regained %s KP and was cured!', v_name, v_new_hp - v_p.current_hp)
    when v_healed then format('%s regained %s KP!', v_name, v_new_hp - v_p.current_hp)
    else format('%s was cured of its %s!', v_name, case v_p.status
      when 'poisoned' then 'poison' when 'burned' then 'burn' when 'paralyzed' then 'paralysis'
      when 'asleep' then 'sleep' when 'frozen' then 'freeze' else v_p.status::text end)
  end;

  v_events := v_events || jsonb_build_object(
    'type', 'item', 'item_id', p_item_id, 'item_name', v_item.name,
    'pokemon_id', v_p.id, 'pokemon_name', v_name, 'profile_id', v_bp.profile_id,
    'hp_before', v_p.current_hp, 'hp_after', v_new_hp, 'max_hp', v_p.max_hp,
    'revived', v_revived, 'cured', v_cured, 'status_after', v_new_status,
    'message', format('You used a %s!', v_item.name),
    'detail', v_msg);
  perform public._battle_log(p_encounter_id, 'item', 'trainer_pokemon', v_p.id, null, v_name,
    v_p.current_hp, v_new_hp, v_bp.profile_id, v_item.name, null, null, format('Used %s: %s', v_item.name, v_msg));

  -- Using an item takes the turn: an enemy attacks the Pokémon in battle.
  if v_enc.enemy_auto_attack and v_bp.active_pokemon_id is not null then
    select * into v_active from public.trainer_pokemon where id = v_bp.active_pokemon_id;
    if not v_active.is_dead and v_active.status <> 'fainted' and v_active.current_hp > 0 then
      v_enemy := public._battle_counter_enemy(p_encounter_id, null);
      if v_enemy is not null then
        v_events := v_events || public._battle_enemy_attack(p_encounter_id, v_enemy, v_active.id);
        v_events := v_events || public._battle_status_chip(p_encounter_id, v_active.id);
      end if;
    end if;
  end if;

  v_events := v_events || public._battle_check_end(p_encounter_id);
  return jsonb_build_object('events', v_events);
end;
$$;

grant execute on function public.battle_choose_pokemon(uuid, uuid) to authenticated;
grant execute on function public.battle_attack(uuid, smallint, uuid) to authenticated;
grant execute on function public.battle_use_item(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Reading battle state. One call returns everything the battle screen or
-- the admin monitor needs, filtered by who's asking: trainers see their own
-- party, moves and Bag; only the Game Master sees enemy stats and moves.
-- ---------------------------------------------------------------------------
create or replace function public.get_battle_state(p_encounter_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.my_profile_id();
  v_admin boolean := public.is_admin();
  v_enc public.battle_encounters;
  v_my_bp public.battle_players;
  v_result jsonb;
begin
  select * into v_enc from public.battle_encounters where id = p_encounter_id;
  if v_enc.id is null then
    raise exception 'Battle not found';
  end if;
  select * into v_my_bp from public.battle_players where encounter_id = p_encounter_id and profile_id = v_me;
  if not v_admin and v_my_bp.id is null then
    raise exception 'You are not part of this battle';
  end if;

  v_result := jsonb_build_object(
    'encounter', to_jsonb(v_enc),
    'is_admin', v_admin,
    'enemies', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id, 'slot', e.slot, 'name', e.name, 'species_id', e.species_id, 'sprite_url', e.sprite_url,
          'level', e.level, 'current_hp', e.current_hp, 'max_hp', e.max_hp, 'type1', e.type1, 'type2', e.type2,
          'fainted', e.current_hp = 0
        )
        || case when v_admin then jsonb_build_object(
          'attack', e.attack, 'defense', e.defense, 'sp_attack', e.sp_attack, 'sp_defense', e.sp_defense, 'speed', e.speed,
          'moves', public.moves_json(coalesce(nullif(e.move_ids, '{}'), public.default_move_ids(e.type1, e.type2, e.level)))
        ) else '{}'::jsonb end
        order by e.slot)
      from public.battle_enemies e where e.encounter_id = p_encounter_id
    ), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', bp.id, 'profile_id', bp.profile_id, 'username', pr.username, 'avatar', pr.avatar,
        'damage_dealt', bp.damage_dealt, 'joined_at', bp.joined_at,
        'usable_count', public._usable_pokemon_count(bp.profile_id),
        'active_pokemon', case when tp.id is null then null else jsonb_build_object(
          'id', tp.id, 'name', coalesce(tp.nickname, s.name), 'species_id', tp.species_id, 'level', tp.level,
          'current_hp', tp.current_hp, 'max_hp', tp.max_hp, 'status', tp.status, 'is_shiny', tp.is_shiny,
          'type1', s.type1, 'type2', s.type2
        ) end
      ) order by bp.joined_at, bp.id)
      from public.battle_players bp
      join public.profiles pr on pr.id = bp.profile_id
      left join public.trainer_pokemon tp on tp.id = bp.active_pokemon_id
      left join public.species s on s.id = tp.species_id
      where bp.encounter_id = p_encounter_id
    ), '[]'::jsonb),
    'logs', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.created_at, l.id)
      from (
        select id, action, target_type, target_label, previous_kp, new_kp, delta, move_name,
               is_critical, effectiveness, message, actor_profile_id, enemy_id, target_pokemon_id, created_at
        from public.battle_logs where encounter_id = p_encounter_id
        order by created_at desc, id desc limit 120
      ) l
    ), '[]'::jsonb),
    'reward', (
      select jsonb_build_object(
        'id', r.id, 'money_mode', r.money_mode, 'money_input', r.money_input, 'total_money', r.total_money,
        'xp_mode', r.xp_mode, 'xp_input', r.xp_input, 'total_xp', r.total_xp,
        'participant_count', r.participant_count, 'created_at', r.created_at,
        'recipients', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', rr.id, 'profile_id', rr.profile_id, 'username', pr.username,
            'money', rr.money, 'xp', rr.xp, 'xp_pokemon_id', rr.xp_pokemon_id, 'xp_pokemon_name', rr.xp_pokemon_name,
            'xp_claimed_at', rr.xp_claimed_at, 'level_before', rr.level_before, 'level_after', rr.level_after
          ) order by pr.username)
          from public.battle_reward_recipients rr join public.profiles pr on pr.id = rr.profile_id
          where rr.reward_id = r.id and (v_admin or rr.profile_id = v_me)
        ), '[]'::jsonb)
      )
      from public.battle_rewards r where r.encounter_id = p_encounter_id
    )
  );

  if v_my_bp.id is not null then
    v_result := v_result || jsonb_build_object('me', jsonb_build_object(
      'battle_player_id', v_my_bp.id,
      'profile_id', v_me,
      'active_pokemon_id', v_my_bp.active_pokemon_id,
      'damage_dealt', v_my_bp.damage_dealt,
      'party', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', tp.id, 'name', coalesce(tp.nickname, s.name), 'species_id', tp.species_id, 'level', tp.level,
          'current_hp', tp.current_hp, 'max_hp', tp.max_hp, 'status', tp.status, 'is_dead', tp.is_dead,
          'is_shiny', tp.is_shiny, 'party_slot', tp.party_slot, 'type1', s.type1, 'type2', s.type2,
          'speed', public.pokemon_stat(tp.level, tp.bonus_speed),
          'moves', public.moves_json(public.pokemon_move_ids(tp.id))
        ) order by tp.party_slot)
        from public.trainer_pokemon tp join public.species s on s.id = tp.species_id
        where tp.profile_id = v_me and tp.party_slot is not null
      ), '[]'::jsonb),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'item_id', ic.id, 'name', ic.name, 'quantity', ti.quantity, 'effect', ic.battle_effect,
          'pokeapi_slug', ic.pokeapi_slug, 'icon_url', ic.icon_url, 'icon_emoji', ic.icon_emoji,
          'description', ic.description
        ) order by ic.sort_order, ic.name)
        from public.trainer_items ti join public.items_catalog ic on ic.id = ti.item_id
        where ti.profile_id = v_me and ti.quantity > 0 and ic.battle_effect is not null
      ), '[]'::jsonb)
    ));
  end if;

  return v_result;
end;
$$;

grant execute on function public.get_battle_state(uuid) to authenticated;

-- The encounter the battle screen should show for the caller: an active one
-- first, otherwise a finished one still waiting for the Game Master's reward.
create or replace function public.get_my_battle()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('encounter_id', e.id, 'status', e.status, 'name', e.name)
  from public.battle_players bp
  join public.battle_encounters e on e.id = bp.encounter_id
  where bp.profile_id = public.my_profile_id()
    and e.mode = 'auto'
    and e.status in ('active', 'completed', 'lost')
  order by (e.status = 'active') desc, e.created_at desc
  limit 1;
$$;

grant execute on function public.get_my_battle() to authenticated;

-- Battle profile (types, stats, moves) for one Pokémon, for detail views.
create or replace function public.pokemon_battle_profile(p_pokemon_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_p public.trainer_pokemon;
  v_s public.species;
begin
  select * into v_p from public.trainer_pokemon where id = p_pokemon_id;
  if v_p.id is null then raise exception 'Pokémon not found'; end if;
  if not (public.is_own_profile(v_p.profile_id) or public.is_admin()) then
    raise exception 'Not authorized';
  end if;
  select * into v_s from public.species where id = v_p.species_id;
  return jsonb_build_object(
    'type1', v_s.type1, 'type2', v_s.type2,
    'stats', jsonb_build_object(
      'attack', public.pokemon_stat(v_p.level, v_p.bonus_attack),
      'defense', public.pokemon_stat(v_p.level, v_p.bonus_defense),
      'sp_attack', public.pokemon_stat(v_p.level, v_p.bonus_sp_attack),
      'sp_defense', public.pokemon_stat(v_p.level, v_p.bonus_sp_defense),
      'speed', public.pokemon_stat(v_p.level, v_p.bonus_speed)
    ),
    'bonus', jsonb_build_object(
      'attack', v_p.bonus_attack, 'defense', v_p.bonus_defense, 'sp_attack', v_p.bonus_sp_attack,
      'sp_defense', v_p.bonus_sp_defense, 'speed', v_p.bonus_speed
    ),
    'custom_moves', exists (select 1 from public.trainer_pokemon_moves where pokemon_id = p_pokemon_id),
    'moves', public.moves_json(public.pokemon_move_ids(p_pokemon_id))
  );
end;
$$;

grant execute on function public.pokemon_battle_profile(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Game Master functions
-- ---------------------------------------------------------------------------
create or replace function public._require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only the Game Master can do that';
  end if;
  return public.my_profile_id();
end;
$$;

-- Moves + stat bonuses for one trainer Pokémon. p_move_ids = null or {}
-- clears custom moves (back to the automatic default set).
create or replace function public.admin_set_pokemon_battle_setup(
  p_pokemon_id uuid,
  p_move_ids smallint[],
  p_bonus jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids smallint[] := coalesce(p_move_ids, '{}');
  i integer;
begin
  perform public._require_admin();
  if not exists (select 1 from public.trainer_pokemon where id = p_pokemon_id) then
    raise exception 'Pokémon not found';
  end if;
  if array_length(v_ids, 1) > 4 then
    raise exception 'A Pokémon can know at most 4 moves';
  end if;
  if (select count(distinct x) from unnest(v_ids) x) <> coalesce(array_length(v_ids, 1), 0) then
    raise exception 'The same move can''t be listed twice';
  end if;
  if exists (select 1 from unnest(v_ids) x where not exists (select 1 from public.moves m where m.id = x)) then
    raise exception 'Unknown move';
  end if;

  delete from public.trainer_pokemon_moves where pokemon_id = p_pokemon_id;
  for i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
    insert into public.trainer_pokemon_moves (pokemon_id, slot, move_id) values (p_pokemon_id, i, v_ids[i]);
  end loop;

  if p_bonus is not null then
    update public.trainer_pokemon set
      bonus_attack = coalesce((p_bonus ->> 'attack')::integer, bonus_attack),
      bonus_defense = coalesce((p_bonus ->> 'defense')::integer, bonus_defense),
      bonus_sp_attack = coalesce((p_bonus ->> 'sp_attack')::integer, bonus_sp_attack),
      bonus_sp_defense = coalesce((p_bonus ->> 'sp_defense')::integer, bonus_sp_defense),
      bonus_speed = coalesce((p_bonus ->> 'speed')::integer, bonus_speed)
    where id = p_pokemon_id;
  end if;

  return public.pokemon_battle_profile(p_pokemon_id);
end;
$$;

grant execute on function public.admin_set_pokemon_battle_setup(uuid, smallint[], jsonb) to authenticated;

-- Create and start an encounter in one atomic step.
-- p_enemies: [{ "species_id", "name", "level", "max_hp", "current_hp",
--               "attack", "defense", "sp_attack", "sp_defense", "speed",
--               "type1", "type2", "move_ids": [..], "sprite_url" }, ...]
-- Any omitted stat defaults from level; omitted types come from the species;
-- omitted moves fall back to the default set for the enemy's types.
create or replace function public.admin_create_battle(
  p_name text,
  p_description text,
  p_player_ids uuid[],
  p_enemies jsonb,
  p_enemy_auto_attack boolean default true,
  p_enemy_damage_scale numeric default 1
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._require_admin();
  v_players uuid[];
  v_busy text;
  v_enc_id uuid;
  v_enemy jsonb;
  v_slot integer := 0;
  v_species public.species;
  v_level integer;
  v_max_hp integer;
  v_cur_hp integer;
  v_name text;
  v_t1 text;
  v_t2 text;
  v_moves smallint[];
  v_first_name text;
  v_count integer;
  v_summary text;
  v_pid uuid;
begin
  select array_agg(distinct x) into v_players from unnest(coalesce(p_player_ids, '{}')) x where x is not null;
  if v_players is null or array_length(v_players, 1) is null then
    raise exception 'Choose at least one trainer';
  end if;
  if exists (select 1 from unnest(v_players) x where not exists (select 1 from public.profiles p where p.id = x)) then
    raise exception 'One of the chosen trainers no longer exists';
  end if;

  select string_agg(p.username, ', ') into v_busy
  from public.profiles p where p.id = any(v_players) and public.is_in_active_battle(p.id);
  if v_busy is not null then
    raise exception 'Already in an active battle: %', v_busy;
  end if;

  if p_enemies is null or jsonb_typeof(p_enemies) <> 'array' or jsonb_array_length(p_enemies) = 0 then
    raise exception 'Add at least one enemy Pokémon';
  end if;
  v_count := jsonb_array_length(p_enemies);
  if v_count > 6 then
    raise exception 'An encounter can have at most 6 enemy Pokémon';
  end if;
  if p_enemy_damage_scale is null or p_enemy_damage_scale <= 0 or p_enemy_damage_scale > 5 then
    raise exception 'Enemy damage multiplier must be between 0 and 5';
  end if;

  insert into public.battle_encounters
    (name, enemy_name, enemy_species_id, level, current_kp, max_kp, notes, status, created_by,
     mode, enemy_auto_attack, enemy_damage_scale)
  values ('…', '…', null, 1, 1, 1, nullif(trim(coalesce(p_description, '')), ''), 'active', v_admin,
          'auto', coalesce(p_enemy_auto_attack, true), p_enemy_damage_scale)
  returning id into v_enc_id;

  for v_enemy in select * from jsonb_array_elements(p_enemies) loop
    v_slot := v_slot + 1;
    v_species := null;
    if nullif(v_enemy ->> 'species_id', '') is not null then
      select * into v_species from public.species where id = (v_enemy ->> 'species_id')::smallint;
      if v_species.id is null then
        raise exception 'Enemy %: unknown species', v_slot;
      end if;
    end if;

    v_name := coalesce(nullif(trim(v_enemy ->> 'name'), ''), v_species.name);
    if v_name is null then
      raise exception 'Enemy %: give it a name or a species', v_slot;
    end if;
    v_level := coalesce(nullif(v_enemy ->> 'level', '')::integer, 5);
    if v_level < 1 then raise exception 'Enemy %: level must be at least 1', v_slot; end if;
    v_max_hp := coalesce(nullif(v_enemy ->> 'max_hp', '')::integer, 60 + 20 * v_level);
    if v_max_hp < 1 then raise exception 'Enemy %: max KP must be at least 1', v_slot; end if;
    v_cur_hp := coalesce(nullif(v_enemy ->> 'current_hp', '')::integer, v_max_hp);
    if v_cur_hp < 1 or v_cur_hp > v_max_hp then
      raise exception 'Enemy %: current KP must be between 1 and %', v_slot, v_max_hp;
    end if;
    v_t1 := coalesce(nullif(v_enemy ->> 'type1', ''), v_species.type1, 'normal');
    v_t2 := nullif(v_enemy ->> 'type2', '');
    if v_t2 is null and nullif(v_enemy ->> 'type1', '') is null then
      v_t2 := v_species.type2;
    end if;
    if v_t2 = v_t1 then v_t2 := null; end if;
    if not public.is_valid_pokemon_type(v_t1) or (v_t2 is not null and not public.is_valid_pokemon_type(v_t2)) then
      raise exception 'Enemy %: unknown type', v_slot;
    end if;

    select coalesce(array_agg(x::smallint), '{}') into v_moves
    from jsonb_array_elements_text(coalesce(v_enemy -> 'move_ids', '[]'::jsonb)) x where x <> '';
    if array_length(v_moves, 1) > 4 then
      raise exception 'Enemy %: at most 4 moves', v_slot;
    end if;
    if exists (select 1 from unnest(v_moves) x where not exists (select 1 from public.moves m where m.id = x)) then
      raise exception 'Enemy %: unknown move', v_slot;
    end if;
    if coalesce(array_length(v_moves, 1), 0) = 0 then
      v_moves := public.default_move_ids(v_t1, v_t2, v_level);
    end if;

    insert into public.battle_enemies
      (encounter_id, slot, name, species_id, sprite_url, level, current_hp, max_hp,
       attack, defense, sp_attack, sp_defense, speed, type1, type2, move_ids)
    values (
      v_enc_id, v_slot, v_name, v_species.id, nullif(v_enemy ->> 'sprite_url', ''), v_level, v_cur_hp, v_max_hp,
      greatest(1, coalesce(nullif(v_enemy ->> 'attack', '')::integer, public.pokemon_stat(v_level, 0))),
      greatest(1, coalesce(nullif(v_enemy ->> 'defense', '')::integer, public.pokemon_stat(v_level, 0))),
      greatest(1, coalesce(nullif(v_enemy ->> 'sp_attack', '')::integer, public.pokemon_stat(v_level, 0))),
      greatest(1, coalesce(nullif(v_enemy ->> 'sp_defense', '')::integer, public.pokemon_stat(v_level, 0))),
      greatest(1, coalesce(nullif(v_enemy ->> 'speed', '')::integer, public.pokemon_stat(v_level, 0))),
      v_t1, v_t2, v_moves
    );

    if v_slot = 1 then
      v_first_name := v_name;
      update public.battle_encounters set enemy_species_id = v_species.id where id = v_enc_id;
    end if;
  end loop;

  v_summary := v_first_name || case when v_count > 1 then format(' & %s more', v_count - 1) else '' end;
  update public.battle_encounters
  set name = coalesce(nullif(trim(coalesce(p_name, '')), ''), 'Wild ' || v_summary),
      enemy_name = v_summary
  where id = v_enc_id;

  foreach v_pid in array v_players loop
    insert into public.battle_players (encounter_id, profile_id) values (v_enc_id, v_pid);
  end loop;

  perform public._battle_log(v_enc_id, 'start', 'system', null, null, '', 0, 0, v_admin, null, null, null,
    case when v_count > 1 then format('A group of %s wild Pokémon appeared!', v_count)
         else format('A wild %s appeared!', v_first_name) end);

  insert into public.admin_activity_log (admin_id, action, details)
  values (v_admin, 'battle_started', jsonb_build_object('encounter_id', v_enc_id, 'enemies', v_count, 'players', array_length(v_players, 1)));

  return v_enc_id;
end;
$$;

grant execute on function public.admin_create_battle(text, text, uuid[], jsonb, boolean, numeric) to authenticated;

-- Pull more trainers into an encounter that's already running.
create or replace function public.admin_add_battle_players(p_encounter_id uuid, p_player_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._require_admin();
  v_enc public.battle_encounters;
  v_pid uuid;
  v_added integer := 0;
begin
  select * into v_enc from public.battle_encounters where id = p_encounter_id for update;
  if v_enc.id is null or v_enc.mode <> 'auto' then raise exception 'Battle not found'; end if;
  if v_enc.status <> 'active' then raise exception 'This battle is already over'; end if;

  foreach v_pid in array coalesce(p_player_ids, '{}') loop
    if exists (select 1 from public.battle_players where encounter_id = p_encounter_id and profile_id = v_pid) then
      continue;
    end if;
    if public.is_in_active_battle(v_pid) then
      raise exception '% is already in another active battle', (select username from public.profiles where id = v_pid);
    end if;
    insert into public.battle_players (encounter_id, profile_id) values (p_encounter_id, v_pid);
    perform public._battle_log(p_encounter_id, 'join', 'system', null, null, '', 0, 0, v_admin, null, null, null,
      format('%s joined the battle!', (select username from public.profiles where id = v_pid)));
    v_added := v_added + 1;
  end loop;
  return v_added;
end;
$$;

grant execute on function public.admin_add_battle_players(uuid, uuid[]) to authenticated;

-- Game Master override of an enemy's KP (healing it, or applying damage
-- from something that happened at the table).
create or replace function public.admin_adjust_enemy_hp(p_enemy_id uuid, p_delta integer, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._require_admin();
  v_e public.battle_enemies;
  v_enc public.battle_encounters;
  v_new integer;
  v_events jsonb := '[]'::jsonb;
begin
  select * into v_e from public.battle_enemies where id = p_enemy_id;
  if v_e.id is null then raise exception 'Enemy not found'; end if;
  select * into v_enc from public.battle_encounters where id = v_e.encounter_id for update;
  if v_enc.status <> 'active' then raise exception 'This battle is already over'; end if;
  select * into v_e from public.battle_enemies where id = p_enemy_id for update;

  v_new := greatest(0, least(v_e.max_hp, v_e.current_hp + coalesce(p_delta, 0)));
  update public.battle_enemies
  set current_hp = v_new, fainted_at = case when v_new = 0 then coalesce(fainted_at, now()) else null end
  where id = p_enemy_id;

  perform public._battle_log(v_e.encounter_id, 'gm_adjust', 'enemy', null, v_e.id, v_e.name, v_e.current_hp, v_new,
    v_admin, null, null, null,
    coalesce(nullif(p_note, ''), format('Game Master set %s''s KP: %s → %s', v_e.name, v_e.current_hp, v_new)));
  if v_new = 0 and v_e.current_hp > 0 then
    perform public._battle_log(v_e.encounter_id, 'faint', 'enemy', null, v_e.id, v_e.name, 0, 0, null, null, null, null,
      format('%s fainted!', v_e.name));
  end if;

  v_events := public._battle_check_end(v_e.encounter_id);
  return jsonb_build_object('events', v_events);
end;
$$;

grant execute on function public.admin_adjust_enemy_hp(uuid, integer, text) to authenticated;

-- Game Master triggers an enemy attack manually (useful when the encounter
-- was created with enemy auto-attack switched off). With no target given,
-- a random trainer's Pokémon currently in battle is attacked.
create or replace function public.admin_enemy_attack(p_encounter_id uuid, p_enemy_id uuid, p_target_pokemon_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.battle_encounters;
  v_target uuid := p_target_pokemon_id;
  v_events jsonb;
begin
  perform public._require_admin();
  select * into v_enc from public.battle_encounters where id = p_encounter_id for update;
  if v_enc.id is null or v_enc.mode <> 'auto' then raise exception 'Battle not found'; end if;
  if v_enc.status <> 'active' then raise exception 'This battle is already over'; end if;
  if not exists (select 1 from public.battle_enemies where id = p_enemy_id and encounter_id = p_encounter_id and current_hp > 0) then
    raise exception 'That enemy can''t attack';
  end if;

  if v_target is null then
    select bp.active_pokemon_id into v_target
    from public.battle_players bp join public.trainer_pokemon tp on tp.id = bp.active_pokemon_id
    where bp.encounter_id = p_encounter_id and tp.current_hp > 0 and tp.status <> 'fainted' and not tp.is_dead
    order by random() limit 1;
  elsif not exists (
    select 1 from public.battle_players where encounter_id = p_encounter_id and active_pokemon_id = v_target
  ) then
    raise exception 'That Pokémon isn''t in this battle';
  end if;
  if v_target is null then
    raise exception 'No trainer Pokémon is in battle right now';
  end if;

  v_events := public._battle_enemy_attack(p_encounter_id, p_enemy_id, v_target);
  v_events := v_events || public._battle_check_end(p_encounter_id);
  return jsonb_build_object('events', v_events);
end;
$$;

grant execute on function public.admin_enemy_attack(uuid, uuid, uuid) to authenticated;

-- Force the outcome: 'completed' (declare victory), 'lost', or 'ended'
-- (cancel without rewards). Rewarded encounters can't be changed.
create or replace function public.admin_set_battle_status(p_encounter_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._require_admin();
  v_enc public.battle_encounters;
begin
  if p_status not in ('completed', 'lost', 'ended') then
    raise exception 'Unknown battle status';
  end if;
  select * into v_enc from public.battle_encounters where id = p_encounter_id for update;
  if v_enc.id is null then raise exception 'Battle not found'; end if;
  if v_enc.status in ('rewarded', 'ended') then
    raise exception 'This battle is already closed';
  end if;

  update public.battle_encounters
  set status = p_status,
      completed_at = case when p_status in ('completed', 'lost') then coalesce(completed_at, now()) else completed_at end,
      ended_at = case when p_status = 'ended' then now() else ended_at end
  where id = p_encounter_id;

  perform public._battle_log(p_encounter_id, 'gm_status', 'system', null, null, '', 0, 0, v_admin, null, null, null,
    case p_status
      when 'completed' then 'The Game Master declared victory!'
      when 'lost' then 'The Game Master ended the battle as a defeat.'
      else 'The Game Master ended the encounter.' end);
end;
$$;

grant execute on function public.admin_set_battle_status(uuid, text) to authenticated;

-- Phase 9's end-encounter, minus the "Battle ended" notification (trainers
-- see the battle end on their battle screen instead).
create or replace function public.admin_end_encounter(p_encounter_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only the Game Master can end an encounter';
  end if;
  update public.battle_encounters
  set status = 'ended', ended_at = now()
  where id = p_encounter_id and status not in ('rewarded', 'ended');
end;
$$;

-- Phase 9 manual joins stay as they were, but never into an auto encounter.
create or replace function public.join_battle(p_encounter_id uuid, p_pokemon_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.my_profile_id();
  v_owner uuid;
begin
  select profile_id into v_owner from public.trainer_pokemon where id = p_pokemon_id;
  if v_owner is distinct from v_profile_id and not public.is_admin() then
    raise exception 'You can only bring your own Pokémon into a battle';
  end if;
  if not exists (select 1 from public.battle_encounters where id = p_encounter_id and status = 'active' and mode = 'manual') then
    raise exception 'This encounter is no longer open to join';
  end if;
  if exists (
    select 1 from public.trainer_pokemon
    where id = p_pokemon_id and (is_dead or status = 'fainted')
  ) then
    raise exception 'Fainted or dead Pokémon cannot enter a battle';
  end if;

  insert into public.battle_participants (encounter_id, pokemon_id, profile_id)
  values (p_encounter_id, p_pokemon_id, v_owner)
  on conflict (encounter_id, pokemon_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rewards
-- ---------------------------------------------------------------------------

-- Splits a total into n whole-number shares that always add back up to the
-- total exactly: the remainder goes one-by-one to the first shares.
create or replace function public.split_evenly(p_total integer, p_count integer)
returns integer[]
language sql
immutable
as $$
  select array(
    select (p_total / p_count) + case when i <= (p_total % p_count) then 1 else 0 end
    from generate_series(1, p_count) as i
    order by i
  );
$$;

-- Gives money + XP to every trainer in a finished encounter in ONE
-- transaction: either everybody is paid exactly their share, or nobody is.
--
--   p_money_mode / p_xp_mode:
--     'equal'      p_*_value is the TOTAL, divided between the trainers
--     'per_player' p_*_value is what EACH trainer gets
--     'custom'     p_*_value is the intended TOTAL; amounts per trainer come
--                  from p_custom = [{"profile_id", "money", "xp"}, ...] and
--                  must add up to it exactly
--   p_expected (optional): the per-trainer distribution the admin reviewed,
--     [{"profile_id", "money", "xp"}]. If what the server computes differs
--     in any way, nothing is paid and the admin is asked to review again.
--
-- Trainers are ordered by when they joined the battle; with an uneven
-- split, the first trainers in that order get the extra ₽1 / 1 XP.
create or replace function public.admin_give_battle_rewards(
  p_encounter_id uuid,
  p_money_mode text,
  p_money_value integer,
  p_xp_mode text,
  p_xp_value integer,
  p_custom jsonb default null,
  p_expected jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._require_admin();
  v_enc public.battle_encounters;
  v_ids uuid[];
  v_n integer;
  v_money integer[];
  v_xp integer[];
  v_total_money integer;
  v_total_xp integer;
  v_reward_id uuid;
  v_balance integer;
  v_dist jsonb := '[]'::jsonb;
  v_exp record;
  v_body text;
  i integer;
begin
  if p_money_mode not in ('equal', 'per_player', 'custom') or p_xp_mode not in ('equal', 'per_player', 'custom') then
    raise exception 'Unknown reward distribution mode';
  end if;
  if coalesce(p_money_value, -1) < 0 or coalesce(p_xp_value, -1) < 0 then
    raise exception 'Rewards can''t be negative';
  end if;

  -- Lock the encounter: a second click / second admin waits here, then sees
  -- the reward already exists and stops.
  select * into v_enc from public.battle_encounters where id = p_encounter_id for update;
  if v_enc.id is null or v_enc.mode <> 'auto' then raise exception 'Battle not found'; end if;
  if exists (select 1 from public.battle_rewards where encounter_id = p_encounter_id) or v_enc.status = 'rewarded' then
    raise exception 'Rewards for this battle have already been given';
  end if;
  if v_enc.status = 'ended' then
    raise exception 'This encounter was cancelled, so it has no rewards';
  end if;
  if v_enc.status not in ('completed', 'lost') then
    raise exception 'Rewards can only be given once the battle is over';
  end if;

  select array_agg(profile_id order by joined_at, id) into v_ids
  from public.battle_players where encounter_id = p_encounter_id;
  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then raise exception 'Nobody took part in this battle'; end if;

  if p_money_mode = 'custom' or p_xp_mode = 'custom' then
    if p_custom is null or jsonb_typeof(p_custom) <> 'array' then
      raise exception 'Custom amounts are missing';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_custom) c
      where not ((c ->> 'profile_id')::uuid = any(v_ids))
    ) or (select count(distinct c ->> 'profile_id') from jsonb_array_elements(p_custom) c) <> v_n
       or jsonb_array_length(p_custom) <> v_n then
      raise exception 'Custom amounts must list every trainer in the battle exactly once';
    end if;
  end if;

  -- Money shares
  if p_money_mode = 'equal' then
    v_money := public.split_evenly(p_money_value, v_n);
  elsif p_money_mode = 'per_player' then
    v_money := array_fill(p_money_value, array[v_n]);
  else
    select array_agg(coalesce((c ->> 'money')::integer, 0) order by array_position(v_ids, (c ->> 'profile_id')::uuid))
    into v_money from jsonb_array_elements(p_custom) c;
    if exists (select 1 from unnest(v_money) x where x < 0) then
      raise exception 'Rewards can''t be negative';
    end if;
    if (select sum(x) from unnest(v_money) x) <> p_money_value then
      raise exception '⚠️ The player rewards must add up to ₽%.', to_char(p_money_value, 'FM999,999,999,999');
    end if;
  end if;

  -- XP shares
  if p_xp_mode = 'equal' then
    v_xp := public.split_evenly(p_xp_value, v_n);
  elsif p_xp_mode = 'per_player' then
    v_xp := array_fill(p_xp_value, array[v_n]);
  else
    select array_agg(coalesce((c ->> 'xp')::integer, 0) order by array_position(v_ids, (c ->> 'profile_id')::uuid))
    into v_xp from jsonb_array_elements(p_custom) c;
    if exists (select 1 from unnest(v_xp) x where x < 0) then
      raise exception 'Rewards can''t be negative';
    end if;
    if (select sum(x) from unnest(v_xp) x) <> p_xp_value then
      raise exception '⚠️ The player XP rewards must add up to % XP.', to_char(p_xp_value, 'FM999,999,999,999');
    end if;
  end if;

  select sum(x) into v_total_money from unnest(v_money) x;
  select sum(x) into v_total_xp from unnest(v_xp) x;

  -- Check against what the admin reviewed, if provided.
  if p_expected is not null then
    if jsonb_typeof(p_expected) <> 'array' or jsonb_array_length(p_expected) <> v_n then
      raise exception 'The reward distribution changed since you reviewed it. Please review it again.';
    end if;
    for i in 1 .. v_n loop
      select (e ->> 'money')::integer as money, (e ->> 'xp')::integer as xp into v_exp
      from jsonb_array_elements(p_expected) e where (e ->> 'profile_id')::uuid = v_ids[i];
      if v_exp is null or v_exp.money is distinct from v_money[i] or v_exp.xp is distinct from v_xp[i] then
        raise exception 'The reward distribution changed since you reviewed it. Please review it again.';
      end if;
    end loop;
  end if;

  insert into public.battle_rewards
    (encounter_id, admin_id, money_mode, money_input, total_money, xp_mode, xp_input, total_xp, participant_count)
  values (p_encounter_id, v_admin, p_money_mode, p_money_value, v_total_money, p_xp_mode, p_xp_value, v_total_xp, v_n)
  returning id into v_reward_id;

  -- Money goes in through the trusted-function bypass, so the generic
  -- "An admin gave you ₽X" trigger notification doesn't also fire: each
  -- trainer gets exactly one notification, the battle reward below.
  perform set_config('pokegear.bypass_profile_guard', 'on', true);

  for i in 1 .. v_n loop
    if v_money[i] > 0 then
      update public.profiles set money = money + v_money[i] where id = v_ids[i] returning money into v_balance;
      insert into public.money_transactions (profile_id, amount, balance_after, kind, source_type, source_id, note, created_by)
      values (v_ids[i], v_money[i], v_balance, 'battle_reward', 'battle_encounter', p_encounter_id,
              format('Battle reward: %s', v_enc.name), v_admin);
    end if;

    insert into public.battle_reward_recipients (reward_id, encounter_id, profile_id, money, xp, xp_claimed_at)
    values (v_reward_id, p_encounter_id, v_ids[i], v_money[i], v_xp[i], case when v_xp[i] = 0 then now() end);

    if v_money[i] > 0 or v_xp[i] > 0 then
      v_body := concat_ws(' · ',
        case when v_xp[i] > 0 then format('+%s XP', to_char(v_xp[i], 'FM999,999,999')) end,
        case when v_money[i] > 0 then format('+₽%s', to_char(v_money[i], 'FM999,999,999')) end);
      v_body := v_body || E'\n' || case when v_enc.status = 'completed'
        then format('Defeating %s earned you these rewards!', v_enc.name)
        else format('Your efforts against %s earned you these rewards!', v_enc.name) end;
      if v_xp[i] > 0 then
        v_body := v_body || ' Choose which Pokémon receives the XP.';
      end if;
      insert into public.notifications (profile_id, kind, title, body)
      values (v_ids[i], 'battle_reward', 'Battle Reward!', v_body);
    end if;

    v_dist := v_dist || jsonb_build_object('profile_id', v_ids[i], 'money', v_money[i], 'xp', v_xp[i]);
  end loop;

  update public.battle_encounters set status = 'rewarded', rewarded_at = now() where id = p_encounter_id;

  perform public._battle_log(p_encounter_id, 'reward', 'system', null, null, '', 0, 0, v_admin, null, null, null,
    format('Rewards given: ₽%s and %s XP across %s trainer(s).', v_total_money, v_total_xp, v_n));

  insert into public.admin_activity_log (admin_id, action, details)
  values (v_admin, 'battle_rewarded', jsonb_build_object(
    'encounter_id', p_encounter_id, 'battle', v_enc.name,
    'money_mode', p_money_mode, 'total_money', v_total_money,
    'xp_mode', p_xp_mode, 'total_xp', v_total_xp, 'distribution', v_dist));

  return jsonb_build_object('reward_id', v_reward_id, 'total_money', v_total_money, 'total_xp', v_total_xp, 'distribution', v_dist);
end;
$$;

grant execute on function public.admin_give_battle_rewards(uuid, text, integer, text, integer, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- XP. grant_pokemon_xp()'s logic moves into an internal function so the
-- battle-reward claim can reuse it without a duplicate "XP gained"
-- notification, and so the public wrapper can be locked down.
-- ---------------------------------------------------------------------------
create or replace function public._apply_pokemon_xp(p_pokemon_id uuid, p_amount integer, p_notify_xp boolean)
returns public.trainer_pokemon
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pokemon public.trainer_pokemon;
  v_max_level integer := public.get_config_int('max_level', 10);
  v_curve jsonb := public.get_xp_curve();
  v_new_xp integer;
  v_new_level integer;
  v_threshold integer;
  v_leveled boolean := false;
  v_evo_species smallint;
  v_label text;
  v_result public.trainer_pokemon;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'XP amount must be positive';
  end if;

  select * into v_pokemon from public.trainer_pokemon where id = p_pokemon_id for update;
  if v_pokemon.id is null then raise exception 'Pokémon not found'; end if;
  if v_pokemon.is_dead then raise exception 'This Pokémon has died and cannot gain XP'; end if;

  v_label := public._pokemon_label(p_pokemon_id);

  if v_pokemon.level >= v_max_level then
    v_new_xp := v_pokemon.xp;
    v_new_level := v_pokemon.level;
  else
    v_new_xp := v_pokemon.xp + p_amount;
    v_new_level := v_pokemon.level;

    loop
      exit when v_new_level >= v_max_level;
      v_threshold := (v_curve ->> (v_new_level + 1)::text)::integer;
      exit when v_threshold is null or v_new_xp < v_threshold;

      v_new_xp := v_new_xp - v_threshold;
      v_new_level := v_new_level + 1;
      v_leveled := true;

      insert into public.notifications (profile_id, kind, title, body)
      values (v_pokemon.profile_id, 'level_up', 'Level up!', format('%s reached level %s!', v_label, v_new_level));

      select er.to_species_id into v_evo_species
      from public.evolution_rules er
      join public.trainer_pokemon tp on tp.id = p_pokemon_id
      where er.method = 'level' and er.from_species_id = tp.species_id and er.level_required <= v_new_level
      order by er.level_required desc
      limit 1;

      if v_evo_species is not null then
        perform public.apply_evolution(p_pokemon_id, v_evo_species);
      end if;
      v_evo_species := null;
    end loop;
  end if;

  perform set_config('pokegear.bypass_pokemon_guard', 'on', true);
  update public.trainer_pokemon set xp = v_new_xp, level = v_new_level where id = p_pokemon_id returning * into v_result;

  if not v_leveled and p_notify_xp then
    insert into public.notifications (profile_id, kind, title, body)
    values (v_pokemon.profile_id, 'xp_gained', 'XP gained', format('%s gained %s XP.', v_label, p_amount));
  end if;

  return v_result;
end;
$$;

-- Direct XP grants: Game Master only, unless player_self_edit is on.
create or replace function public.grant_pokemon_xp(p_pokemon_id uuid, p_amount integer, p_note text default null)
returns public.trainer_pokemon
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select profile_id into v_owner from public.trainer_pokemon where id = p_pokemon_id;
  if v_owner is null then raise exception 'Pokémon not found'; end if;
  if not (
    public.is_admin()
    or (public.is_own_profile(v_owner) and public.get_config_bool('player_self_edit', false))
  ) then
    raise exception 'Only the Game Master can give XP directly';
  end if;
  return public._apply_pokemon_xp(p_pokemon_id, p_amount, true);
end;
$$;

-- A trainer assigns a battle reward's XP to one of their Pokémon. The
-- recipient row is locked and stamped, so a refresh, a double tap or a
-- second device can never apply the same XP twice.
create or replace function public.claim_battle_xp(p_recipient_id uuid, p_pokemon_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.battle_reward_recipients;
  v_p public.trainer_pokemon;
  v_max_level integer := public.get_config_int('max_level', 10);
  v_after public.trainer_pokemon;
  v_name text;
begin
  select * into v_r from public.battle_reward_recipients where id = p_recipient_id for update;
  if v_r.id is null or not public.is_own_profile(v_r.profile_id) then
    raise exception 'Reward not found';
  end if;
  if v_r.xp_claimed_at is not null then
    raise exception 'This XP has already been given to a Pokémon';
  end if;

  select * into v_p from public.trainer_pokemon where id = p_pokemon_id;
  if v_p.id is null or v_p.profile_id <> v_r.profile_id then
    raise exception 'That Pokémon isn''t yours';
  end if;
  if v_p.is_dead then
    raise exception 'This Pokémon has died and cannot gain XP';
  end if;
  if v_p.level >= v_max_level and exists (
    select 1 from public.trainer_pokemon
    where profile_id = v_r.profile_id and not is_dead and level < v_max_level
  ) then
    raise exception '% is already at the maximum level — choose another Pokémon', public._pokemon_label(v_p.id);
  end if;

  v_name := public._pokemon_label(v_p.id);
  v_after := public._apply_pokemon_xp(v_p.id, v_r.xp, false);

  update public.battle_reward_recipients
  set xp_pokemon_id = v_p.id, xp_pokemon_name = v_name, xp_claimed_at = now(),
      level_before = v_p.level, level_after = v_after.level
  where id = v_r.id;

  return jsonb_build_object(
    'pokemon_id', v_p.id, 'name', v_name, 'xp', v_r.xp,
    'level_before', v_p.level, 'level_after', v_after.level,
    'species_before', v_p.species_id, 'species_after', v_after.species_id,
    'species_after_name', (select name from public.species where id = v_after.species_id)
  );
end;
$$;

grant execute on function public.claim_battle_xp(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- KP editing outside battle: Game Master only unless player_self_edit is
-- on, never for a trainer in an active battle, and no "fainted"
-- notification (the KP bar already shows it).
-- ---------------------------------------------------------------------------
create or replace function public.adjust_pokemon_kp(
  p_pokemon_id uuid,
  p_delta integer,
  p_note text default null,
  p_encounter_id uuid default null
)
returns public.trainer_pokemon
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pokemon public.trainer_pokemon;
  v_label text;
  v_new_kp integer;
  v_result public.trainer_pokemon;
begin
  select * into v_pokemon from public.trainer_pokemon where id = p_pokemon_id for update;
  if v_pokemon.id is null then
    raise exception 'Pokémon not found';
  end if;
  if not public.is_admin() then
    if not public.is_own_profile(v_pokemon.profile_id) then
      raise exception 'Not authorized to change this Pokémon''s KP';
    end if;
    if not public.get_config_bool('player_self_edit', false) then
      raise exception 'Only the Game Master can change KP directly';
    end if;
    if public.is_in_active_battle(v_pokemon.profile_id) then
      raise exception 'KP can''t be edited during a battle';
    end if;
  end if;
  if v_pokemon.is_dead then
    raise exception 'This Pokémon has died and cannot be changed';
  end if;
  if v_pokemon.status = 'fainted' then
    raise exception 'This Pokémon has fainted — take it to the Pokémon Center to revive it';
  end if;

  v_new_kp := greatest(0, least(v_pokemon.max_hp, v_pokemon.current_hp + p_delta));
  v_label := public._pokemon_label(p_pokemon_id);

  perform set_config('pokegear.bypass_pokemon_guard', 'on', true);
  update public.trainer_pokemon
  set current_hp = v_new_kp,
      status = case when v_new_kp = 0 then 'fainted'::public.pokemon_status else status end
  where id = p_pokemon_id
  returning * into v_result;

  insert into public.battle_logs
    (encounter_id, target_type, target_pokemon_id, target_label, previous_kp, new_kp, delta, author_id, note)
  values (
    p_encounter_id, 'trainer_pokemon', p_pokemon_id, v_label,
    v_pokemon.current_hp, v_new_kp, v_new_kp - v_pokemon.current_hp, public.my_profile_id(), p_note
  );

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pokémon Center. Single heal/revive keep working; both now clear status
-- conditions, stay quiet in the notification feed, and are closed while
-- the trainer is in an active battle (no free mid-fight healing).
-- ---------------------------------------------------------------------------
create or replace function public._center_guard(p_profile_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() and public.is_in_active_battle(p_profile_id) then
    raise exception 'The Pokémon Center can''t treat your team while you''re in a battle';
  end if;
end;
$$;

create or replace function public.heal_pokemon(p_pokemon_id uuid)
returns public.trainer_pokemon
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pokemon public.trainer_pokemon;
  v_result public.trainer_pokemon;
begin
  select * into v_pokemon from public.trainer_pokemon where id = p_pokemon_id for update;
  if v_pokemon.id is null then raise exception 'Pokémon not found'; end if;
  if not (public.is_own_profile(v_pokemon.profile_id) or public.is_admin()) then
    raise exception 'Not authorized';
  end if;
  perform public._center_guard(v_pokemon.profile_id);
  if v_pokemon.is_dead then raise exception 'This Pokémon has died and cannot be healed'; end if;
  if v_pokemon.status = 'fainted' then raise exception 'A fainted Pokémon needs to be revived, not healed'; end if;

  perform set_config('pokegear.bypass_pokemon_guard', 'on', true);
  update public.trainer_pokemon set current_hp = max_hp, status = 'healthy' where id = p_pokemon_id returning * into v_result;

  if v_pokemon.current_hp < v_pokemon.max_hp or v_pokemon.status <> 'healthy' then
    insert into public.battle_logs (target_type, target_pokemon_id, target_label, previous_kp, new_kp, delta, author_id, note, action)
    values ('trainer_pokemon', p_pokemon_id, public._pokemon_label(p_pokemon_id), v_pokemon.current_hp, v_result.max_hp,
            v_result.max_hp - v_pokemon.current_hp, public.my_profile_id(), 'Healed at the Pokémon Center', 'center_heal');
  end if;

  return v_result;
end;
$$;

create or replace function public.revive_pokemon(p_pokemon_id uuid)
returns public.trainer_pokemon
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pokemon public.trainer_pokemon;
  v_result public.trainer_pokemon;
begin
  select * into v_pokemon from public.trainer_pokemon where id = p_pokemon_id for update;
  if v_pokemon.id is null then raise exception 'Pokémon not found'; end if;
  if not (public.is_own_profile(v_pokemon.profile_id) or public.is_admin()) then
    raise exception 'Not authorized';
  end if;
  perform public._center_guard(v_pokemon.profile_id);
  if v_pokemon.is_dead then raise exception 'This Pokémon has died and cannot be revived'; end if;
  if v_pokemon.status <> 'fainted' then raise exception 'This Pokémon has not fainted'; end if;

  perform set_config('pokegear.bypass_pokemon_guard', 'on', true);
  update public.trainer_pokemon set current_hp = max_hp, status = 'healthy' where id = p_pokemon_id returning * into v_result;

  insert into public.battle_logs (target_type, target_pokemon_id, target_label, previous_kp, new_kp, delta, author_id, note, action)
  values ('trainer_pokemon', p_pokemon_id, public._pokemon_label(p_pokemon_id), 0, v_result.max_hp, v_result.max_hp,
          public.my_profile_id(), 'Revived at the Pokémon Center', 'center_revive');

  return v_result;
end;
$$;

-- Heal / revive several Pokémon at once. p_pokemon_ids = null means "my
-- whole party". Returns one entry per Pokémon in party order, so the UI can
-- animate them one at a time:
--   [{"id","name","species_id","result": "revived"|"healed"|"unchanged"|"dead",
--     "hp_before","hp_after","max_hp","status_before"}]
create or replace function public.heal_party(p_pokemon_ids uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.my_profile_id();
  v_p public.trainer_pokemon;
  v_result text;
  v_out jsonb := '[]'::jsonb;
begin
  if v_me is null then raise exception 'Not signed in'; end if;
  perform public._center_guard(v_me);

  if p_pokemon_ids is not null and exists (
    select 1 from unnest(p_pokemon_ids) x
    where not exists (select 1 from public.trainer_pokemon tp where tp.id = x and tp.profile_id = v_me)
  ) then
    raise exception 'You can only heal your own Pokémon';
  end if;

  perform set_config('pokegear.bypass_pokemon_guard', 'on', true);

  for v_p in
    select * from public.trainer_pokemon
    where profile_id = v_me
      and (case when p_pokemon_ids is null then party_slot is not null else id = any(p_pokemon_ids) end)
    order by party_slot nulls last, caught_at
    for update
  loop
    if v_p.is_dead then
      v_result := 'dead';
    elsif v_p.status = 'fainted' then
      v_result := 'revived';
    elsif v_p.current_hp < v_p.max_hp or v_p.status <> 'healthy' then
      v_result := 'healed';
    else
      v_result := 'unchanged';
    end if;

    if v_result in ('revived', 'healed') then
      update public.trainer_pokemon set current_hp = max_hp, status = 'healthy' where id = v_p.id;
      insert into public.battle_logs (target_type, target_pokemon_id, target_label, previous_kp, new_kp, delta, author_id, note, action)
      values ('trainer_pokemon', v_p.id, public._pokemon_label(v_p.id), v_p.current_hp, v_p.max_hp, v_p.max_hp - v_p.current_hp,
              v_me, case when v_result = 'revived' then 'Revived at the Pokémon Center' else 'Healed at the Pokémon Center' end,
              case when v_result = 'revived' then 'center_revive' else 'center_heal' end);
    end if;

    v_out := v_out || jsonb_build_object(
      'id', v_p.id, 'name', public._pokemon_label(v_p.id), 'species_id', v_p.species_id,
      'result', v_result, 'hp_before', v_p.current_hp,
      'hp_after', case when v_result in ('revived', 'healed') then v_p.max_hp else v_p.current_hp end,
      'max_hp', v_p.max_hp, 'status_before', v_p.status);
  end loop;

  return v_out;
end;
$$;

grant execute on function public.heal_party(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Fix: "Pokémon received!" (an important notification) compared
-- current_setting(...) <> 'on', which is NULL — never true — on a
-- connection where the flag was never set, so ad-hoc admin Pokémon grants
-- could silently skip their notification. Same behaviour, null-safe.
-- ---------------------------------------------------------------------------
create or replace function public.notify_pokemon_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_species_name text;
begin
  select name into v_species_name from public.species where id = new.species_id;

  if coalesce(current_setting('pokegear.suppress_pokemon_notification', true), '') <> 'on' then
    insert into public.notifications (profile_id, kind, title, body)
    values (
      new.profile_id,
      'pokemon_received',
      'Pokémon received!',
      format('%s joined your team.', coalesce(new.nickname, v_species_name))
    );

    insert into public.admin_activity_log (admin_id, action, target_profile_id, details)
    values (
      public.my_profile_id(),
      'pokemon_granted',
      new.profile_id,
      jsonb_build_object('species', v_species_name, 'level', new.level)
    );
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- SECURITY FIX: the Phase 8 profiles guard computed
--   v_bypassed := current_setting('pokegear.bypass_profile_guard', true) = 'on'
-- which is NULL (not false) on a connection where the flag was never set.
-- `if not v_bypassed` is then also NULL, so the whole guard was skipped and a
-- trainer could set their own money — or their own role to 'admin' — with a
-- plain table update. Identical logic, null-safe.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_profile_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- No signed-in user = SQL editor / service role (e.g. promoting an admin
  -- with `update profiles set role = 'admin'`): trusted, as before. API
  -- requests from signed-out clients never get here — RLS blocks them.
  v_bypassed boolean := coalesce(current_setting('pokegear.bypass_profile_guard', true), '') = 'on'
                        or auth.uid() is null;
  v_admin_id uuid;
begin
  if not v_bypassed then
    if not public.is_admin() then
      new.role       := old.role;
      new.money      := old.money;
      new.auth_id    := old.auth_id;
      new.trainer_id := old.trainer_id;
      new.created_at := old.created_at;
    else
      v_admin_id := public.my_profile_id();

      if new.money > old.money then
        insert into public.notifications (profile_id, kind, title, body)
        values (new.id, 'admin_reward', 'Admin reward', format('An admin gave you ₽%s.', new.money - old.money));
        insert into public.admin_activity_log (admin_id, action, target_profile_id, details)
        values (v_admin_id, 'money_added', new.id, jsonb_build_object('amount', new.money - old.money));
      elsif new.money < old.money then
        insert into public.admin_activity_log (admin_id, action, target_profile_id, details)
        values (v_admin_id, 'money_removed', new.id, jsonb_build_object('amount', old.money - new.money));
      end if;

      if new.city_id is distinct from old.city_id then
        insert into public.admin_activity_log (admin_id, action, target_profile_id, details)
        values (v_admin_id, 'user_city_changed', new.id, jsonb_build_object('city_id', new.city_id));
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Admin direct money edits (Users page) also go into the new ledger, so a
-- trainer's transaction history is complete going forward.
create or replace function public.log_admin_money_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.money is distinct from old.money
     and coalesce(current_setting('pokegear.bypass_profile_guard', true), '') <> 'on'
     and public.is_admin() then
    insert into public.money_transactions (profile_id, amount, balance_after, kind, source_type, note, created_by)
    values (new.id, new.money - old.money, new.money, 'admin_adjustment', 'admin', 'Adjusted by an admin', public.my_profile_id());
  end if;
  return null;
end;
$$;

drop trigger if exists profiles_log_admin_money on public.profiles;
create trigger profiles_log_admin_money
  after update of money on public.profiles
  for each row execute procedure public.log_admin_money_change();

-- ---------------------------------------------------------------------------
-- Lock down internal helpers. Postgres grants EXECUTE on new functions to
-- PUBLIC by default (and Supabase also to anon/authenticated), which for
-- these security-definer helpers would let anyone call them directly.
-- apply_evolution (Phase 9) had the same gap: anyone could evolve any
-- Pokémon into any species through the API.
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public._pokemon_label(uuid)',
    'public._battle_log(uuid, text, text, uuid, uuid, text, integer, integer, uuid, text, boolean, numeric, text)',
    'public._battle_status_gate(uuid, uuid)',
    'public._battle_player_attack(uuid, uuid, uuid, smallint, uuid)',
    'public._battle_enemy_attack(uuid, uuid, uuid)',
    'public._battle_status_chip(uuid, uuid)',
    'public._battle_check_end(uuid)',
    'public._battle_lock_for_player(uuid)',
    'public._battle_counter_enemy(uuid, uuid)',
    'public._apply_pokemon_xp(uuid, integer, boolean)',
    'public._center_guard(uuid)',
    'public._usable_pokemon_count(uuid)',
    'public._require_admin()',
    'public.apply_evolution(uuid, smallint)'
  ] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Notes for the Game Master
-- ---------------------------------------------------------------------------
-- * Hits too strong / too weak overall?
--     update public.game_config set value = '3' where key = 'battle_damage_scale';
--   Per encounter, the "Enemy damage" multiplier in the Battle Manager scales
--   only what enemies deal to trainers.
-- * Let trainers edit their own KP/XP again (old tabletop behaviour):
--     update public.game_config set value = 'true' where key = 'player_self_edit';
-- * Give a custom item a battle effect:
--     update public.items_catalog set battle_effect = '{"heal": 40}' where name = 'Oran Berry';
