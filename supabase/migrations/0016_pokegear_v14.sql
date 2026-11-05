-- ============================================================================
-- PokéGear Version 14 — tabletop battle control
-- ============================================================================
-- Run AFTER 0015_pokegear_v13_1.sql. Safe to run more than once.
-- (No temporary tables and no ALTER FUNCTION ... SET, so it runs in the
-- Supabase SQL editor as one script.)
--
--  * Attacks record the physical d20 roll (optional), Hit/Miss and the damage
--    the table decided. The app still never rolls or calculates anything.
--  * Battle log rows carry the round, d20, hit/miss and damage; the Game
--    Master can correct an attack afterwards and the target's KP is fixed by
--    the difference.
--  * Turns: the Game Master can go back a turn, give the turn to anyone, move
--    someone in the initiative order, and correct an initiative roll in the
--    middle of a fight. A trainer's own action still ends their turn.
--  * Enemy trainers: switching shows "withdraws X and sends out Y"; a revived
--    Pokémon of a trainer with nobody left comes back out; enemy Pokémon can
--    have a status (poisoned, asleep, …).
--  * Battle state: every player sees each teammate's Team (active + bench).
--    Players see only the active Pokémon of enemy trainers (bench hidden);
--    the Game Master sees everything.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Data
-- ---------------------------------------------------------------------------
alter table public.battle_logs
  add column if not exists round           integer,
  add column if not exists d20             smallint,
  add column if not exists hit             boolean,
  add column if not exists damage          integer,
  add column if not exists attacker_label  text,
  add column if not exists edited_at       timestamptz;

alter table public.battle_logs drop constraint if exists battle_logs_d20_check;
alter table public.battle_logs add constraint battle_logs_d20_check check (d20 is null or d20 between 1 and 20);

-- Every log line remembers the round it happened in.
create or replace function public.battle_logs_set_round()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.round is null and new.encounter_id is not null then
    select case when e.phase = 'fighting' and e.turn_position is not null then e.round end
    into new.round
    from public.battle_encounters e where e.id = new.encounter_id;
  end if;
  return new;
end;
$$;

drop trigger if exists battle_logs_set_round on public.battle_logs;
create trigger battle_logs_set_round
  before insert on public.battle_logs
  for each row execute procedure public.battle_logs_set_round();

alter table public.battle_enemies
  add column if not exists status public.pokemon_status not null default 'healthy';

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------
-- Writes one attack line with its tabletop details; returns the row id.
create or replace function public._battle_log_attack(
  p_encounter_id uuid,
  p_action text,
  p_target_type text,
  p_target_pokemon_id uuid,
  p_enemy_id uuid,
  p_target_label text,
  p_prev integer,
  p_new integer,
  p_actor uuid,
  p_attacker_label text,
  p_d20 integer,
  p_hit boolean,
  p_damage integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.battle_logs
    (encounter_id, action, target_type, target_pokemon_id, enemy_id, target_label,
     previous_kp, new_kp, delta, author_id, actor_profile_id, message,
     d20, hit, damage, attacker_label, created_at)
  values
    (p_encounter_id, p_action, p_target_type, p_target_pokemon_id, p_enemy_id, coalesce(p_target_label, ''),
     p_prev, p_new, p_new - p_prev, p_actor, p_actor,
     public._attack_text(p_attacker_label, p_target_label, p_d20, p_hit, p_damage),
     p_d20, p_hit, p_damage, p_attacker_label, clock_timestamp())
  returning id into v_id;
  return v_id;
end;
$$;

-- "Pikachu hit Gengar for 20 damage. (d20: 14)"
create or replace function public._attack_text(p_attacker text, p_target text, p_d20 integer, p_hit boolean, p_damage integer)
returns text
language sql
immutable
as $$
  select case
           when not p_hit then format('%s attacked %s but missed.', p_attacker, p_target)
           when coalesce(p_damage, 0) = 0 then format('%s hit %s but did no damage.', p_attacker, p_target)
           else format('%s hit %s for %s damage.', p_attacker, p_target, p_damage)
         end
         || case when p_d20 is null then '' else format(' (d20: %s)', p_d20) end;
$$;

-- Checks the tabletop inputs of an attack; returns the hit flag to use.
create or replace function public._attack_inputs(p_damage integer, p_d20 integer, p_hit boolean)
returns boolean
language plpgsql
immutable
as $$
begin
  if p_damage is null or p_damage < 0 then
    raise exception 'Damage can''t be negative (type 0 for a miss).';
  end if;
  if p_damage > 9999 then
    raise exception 'That''s a bit much — at most 9999 damage.';
  end if;
  if p_d20 is not null and (p_d20 < 1 or p_d20 > 20) then
    raise exception 'A d20 roll is a number from 1 to 20.';
  end if;
  if p_hit is false and p_damage > 0 then
    raise exception 'A miss does no damage.';
  end if;
  return coalesce(p_hit, p_damage > 0);
end;
$$;

-- The "sends out" step for the battle screen, with what the screen needs to
-- show the new Pokémon (players can't see a trainer's bench beforehand).
create or replace function public._enemy_switch_event(p_trainer_row uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'type', 'enemy_switch', 'trainer_id', t.id, 'trainer_name', t.name,
    'enemy_id', ne.id, 'enemy_name', ne.name, 'species_id', ne.species_id,
    'enemy', jsonb_build_object(
      'id', ne.id, 'slot', ne.slot, 'name', ne.name, 'species_id', ne.species_id, 'sprite_url', ne.sprite_url,
      'level', ne.level, 'current_hp', ne.current_hp, 'max_hp', ne.max_hp, 'type1', ne.type1, 'type2', ne.type2,
      'status', ne.status, 'fainted', ne.current_hp = 0, 'enemy_trainer_id', ne.enemy_trainer_id,
      'team_position', ne.team_position, 'on_field', true, 'caught', false, 'caught_by_name', null, 'catchable', false),
    'message', format('%s sends out %s!', t.name, ne.name))
  from public.battle_enemy_trainers t
  join public.battle_enemies ne on ne.id = t.active_enemy_id
  where t.id = p_trainer_row;
$$;

-- Moves one turn-order entry to a new place (fight running). Whoever's turn
-- it is keeps the turn. Caller holds the encounter lock.
create or replace function public._battle_move_entry(p_entry_id uuid, p_position integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.battle_turn_order;
  v_enc public.battle_encounters;
  v_current uuid;
  v_count integer;
  v_pos integer;
begin
  select * into v_entry from public.battle_turn_order where id = p_entry_id;
  select * into v_enc from public.battle_encounters where id = v_entry.encounter_id;
  select id into v_current from public.battle_turn_order
  where encounter_id = v_enc.id and position = v_enc.turn_position;

  select count(*) into v_count from public.battle_turn_order where encounter_id = v_enc.id and position is not null;
  v_pos := greatest(1, least(v_count, p_position));

  with others as (
    select id, row_number() over (order by position, created_at) as rn
    from public.battle_turn_order
    where encounter_id = v_enc.id and position is not null and id <> v_entry.id
  )
  update public.battle_turn_order t
  set position = case when o.rn < v_pos then o.rn else o.rn + 1 end
  from others o where o.id = t.id;
  update public.battle_turn_order set position = v_pos where id = v_entry.id;

  if v_current is not null then
    update public.battle_encounters
    set turn_position = (select position from public.battle_turn_order where id = v_current)
    where id = v_enc.id;
  end if;
  return v_pos;
end;
$$;

-- Locks a running fight for a Game Master turn tool.
create or replace function public._battle_lock_fight_for_admin(p_encounter_id uuid)
returns public.battle_encounters
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.battle_encounters;
begin
  perform public._require_admin();
  select * into v_enc from public.battle_encounters where id = p_encounter_id for update;
  if v_enc.id is null or v_enc.mode <> 'auto' then raise exception 'Battle not found'; end if;
  if v_enc.status <> 'active' then raise exception 'This battle is already over'; end if;
  if v_enc.phase <> 'fighting' then raise exception 'Everyone has to roll for initiative first.'; end if;
  return v_enc;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Attacks with d20 + Hit/Miss
-- ---------------------------------------------------------------------------
-- New names (no default arguments), so the old three-argument functions
-- can stay as they are: re-running an older migration later can never
-- leave two look-alike functions that Postgres can't choose between.
create or replace function public.battle_record_attack(
  p_encounter_id uuid,
  p_target_enemy_id uuid,
  p_damage integer,
  p_d20 integer,
  p_hit boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bp public.battle_players;
  v_p public.trainer_pokemon;
  v_e public.battle_enemies;
  v_hit boolean;
  v_name text;
  v_dmg integer;
  v_new integer;
  v_switch jsonb;
  v_events jsonb := '[]'::jsonb;
begin
  v_bp := public._battle_require_my_turn(p_encounter_id);
  v_hit := public._attack_inputs(p_damage, p_d20, p_hit);

  select * into v_p from public.trainer_pokemon where id = v_bp.active_pokemon_id;
  if v_p.id is null then
    raise exception 'Send out a Pokémon first.';
  end if;
  if v_p.is_dead or v_p.status = 'fainted' or v_p.current_hp <= 0 then
    raise exception 'Your Pokémon can''t fight — send out another one first.';
  end if;

  select * into v_e from public.battle_enemies where id = p_target_enemy_id and encounter_id = p_encounter_id for update;
  if v_e.id is null then
    raise exception 'That enemy isn''t in this battle.';
  end if;
  if v_e.caught_by is not null then
    raise exception '% has been caught and left the battle.', v_e.name;
  end if;
  if v_e.current_hp <= 0 then
    raise exception '% has already fainted.', v_e.name;
  end if;
  if not public._enemy_on_field(v_e) then
    raise exception '% isn''t on the field — attack the trainer''s active Pokémon.', v_e.name;
  end if;

  v_name := public._pokemon_label(v_p.id);
  v_new := greatest(0, v_e.current_hp - p_damage);
  v_dmg := v_e.current_hp - v_new;

  update public.battle_enemies
  set current_hp = v_new, fainted_at = case when v_new = 0 then coalesce(fainted_at, now()) else null end
  where id = v_e.id;
  if v_dmg > 0 then
    update public.battle_players set damage_dealt = damage_dealt + v_dmg where id = v_bp.id;
  end if;

  v_events := v_events || jsonb_build_object(
    'type', 'attack', 'side', 'player',
    'attacker_id', v_p.id, 'attacker_name', v_name, 'attacker_profile_id', v_bp.profile_id,
    'target_id', v_e.id, 'target_name', v_e.name,
    'missed', not v_hit, 'damage', v_dmg, 'd20', p_d20,
    'hp_before', v_e.current_hp, 'hp_after', v_new, 'max_hp', v_e.max_hp, 'fainted', v_new = 0,
    'message', case when not v_hit then format('%s attacked %s…', v_name, v_e.name) else format('%s attacked %s!', v_name, v_e.name) end,
    'detail', case when not v_hit then 'It missed!' when v_dmg = 0 then 'It did no damage.' else format('%s damage!', v_dmg) end);
  perform public._battle_log_attack(p_encounter_id, 'attack', 'enemy', null, v_e.id, v_e.name, v_e.current_hp, v_new,
    v_bp.profile_id, v_name, p_d20, v_hit, v_dmg);

  if v_new = 0 then
    v_events := v_events || jsonb_build_object('type', 'faint', 'side', 'enemy', 'target_id', v_e.id,
      'message', format('%s fainted!', v_e.name));
    perform public._battle_log(p_encounter_id, 'faint', 'enemy', null, v_e.id, v_e.name, 0, 0, null, null, null, null,
      format('%s fainted!', v_e.name));
    -- A trainer's Pokémon fainted: their next one has just been sent out
    -- (by the trigger). Tell the battle screen so it can show it coming in.
    if v_e.enemy_trainer_id is not null then
      v_switch := public._enemy_switch_event(v_e.enemy_trainer_id);
      if v_switch is not null then
        v_events := v_events || v_switch;
      end if;
    end if;
  end if;

  v_events := v_events || public._battle_check_end(p_encounter_id);
  perform public._battle_advance_turn(p_encounter_id);
  return jsonb_build_object('events', v_events);
end;
$$;

grant execute on function public.battle_record_attack(uuid, uuid, integer, integer, boolean) to authenticated;

-- The old call (no d20) keeps working.
create or replace function public.battle_turn_attack(p_encounter_id uuid, p_target_enemy_id uuid, p_damage integer)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.battle_record_attack(p_encounter_id, p_target_enemy_id, p_damage, null, null);
$$;

grant execute on function public.battle_turn_attack(uuid, uuid, integer) to authenticated;

create or replace function public.admin_record_enemy_attack(
  p_encounter_id uuid,
  p_target_pokemon_id uuid,
  p_damage integer,
  p_d20 integer,
  p_hit boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._require_admin();
  v_enc public.battle_encounters;
  v_cur public.battle_turn_order;
  v_e public.battle_enemies;
  v_p public.trainer_pokemon;
  v_hit boolean;
  v_name text;
  v_attacker text;
  v_new integer;
  v_events jsonb := '[]'::jsonb;
begin
  v_enc := public._battle_lock_fight_for_admin(p_encounter_id);
  v_hit := public._attack_inputs(p_damage, p_d20, p_hit);

  select * into v_cur from public.battle_turn_order where encounter_id = p_encounter_id and position = v_enc.turn_position;
  if v_cur.enemy_id is not null then
    select * into v_e from public.battle_enemies where id = v_cur.enemy_id;
  elsif v_cur.enemy_trainer_id is not null then
    perform public._enemy_trainer_send_next(v_cur.enemy_trainer_id);
    select be.* into v_e from public.battle_enemies be
    join public.battle_enemy_trainers t on t.active_enemy_id = be.id where t.id = v_cur.enemy_trainer_id;
  else
    raise exception 'It''s not an enemy''s turn — it''s %''s turn.', coalesce(public._turn_entry_name(v_cur), 'someone else');
  end if;
  if v_e.id is null or v_e.current_hp <= 0 or v_e.caught_by is not null then
    raise exception 'That enemy can''t attack right now.';
  end if;

  if not exists (select 1 from public.battle_players where encounter_id = p_encounter_id and active_pokemon_id = p_target_pokemon_id) then
    raise exception 'That Pokémon isn''t in this battle.';
  end if;
  select * into v_p from public.trainer_pokemon where id = p_target_pokemon_id for update;
  if v_p.is_dead or v_p.status = 'fainted' or v_p.current_hp <= 0 then
    raise exception '% has already fainted.', public._pokemon_label(v_p.id);
  end if;

  v_name := public._pokemon_label(v_p.id);
  v_attacker := coalesce((select t.name || '''s ' from public.battle_enemy_trainers t where t.id = v_e.enemy_trainer_id), '') || v_e.name;
  v_new := greatest(0, v_p.current_hp - p_damage);
  perform set_config('pokegear.hp_source', 'battle', true);
  perform set_config('pokegear.bypass_pokemon_guard', 'on', true);
  update public.trainer_pokemon
  set current_hp = v_new, status = case when v_new = 0 then 'fainted'::public.pokemon_status else status end
  where id = v_p.id;

  v_events := v_events || jsonb_build_object(
    'type', 'attack', 'side', 'enemy',
    'attacker_id', v_e.id, 'attacker_name', v_e.name,
    'target_id', v_p.id, 'target_name', v_name, 'target_profile_id', v_p.profile_id,
    'missed', not v_hit, 'damage', v_p.current_hp - v_new, 'd20', p_d20,
    'hp_before', v_p.current_hp, 'hp_after', v_new, 'max_hp', v_p.max_hp, 'fainted', v_new = 0,
    'message', format('%s attacked %s!', v_e.name, v_name),
    'detail', case when not v_hit then format('%s avoided it!', v_name)
                   when v_p.current_hp - v_new = 0 then 'It did no damage.'
                   else format('%s damage!', v_p.current_hp - v_new) end);
  perform public._battle_log_attack(p_encounter_id, 'enemy_attack', 'trainer_pokemon', v_p.id, v_e.id, v_name,
    v_p.current_hp, v_new, null, v_attacker, p_d20, v_hit, v_p.current_hp - v_new);
  if v_new = 0 then
    v_events := v_events || jsonb_build_object('type', 'faint', 'side', 'player', 'target_id', v_p.id,
      'target_profile_id', v_p.profile_id, 'message', format('%s fainted!', v_name));
    perform public._battle_log(p_encounter_id, 'faint', 'trainer_pokemon', v_p.id, null, v_name, 0, 0, null, null, null, null,
      format('%s fainted!', v_name));
  end if;

  v_events := v_events || public._battle_check_end(p_encounter_id);
  perform public._battle_advance_turn(p_encounter_id);
  return jsonb_build_object('events', v_events);
end;
$$;

grant execute on function public.admin_record_enemy_attack(uuid, uuid, integer, integer, boolean) to authenticated;

create or replace function public.admin_enemy_turn_attack(p_encounter_id uuid, p_target_pokemon_id uuid, p_damage integer)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.admin_record_enemy_attack(p_encounter_id, p_target_pokemon_id, p_damage, null, null);
$$;

grant execute on function public.admin_enemy_turn_attack(uuid, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Correcting an attack afterwards (Game Master)
-- ---------------------------------------------------------------------------
-- New d20 / Hit or Miss / damage for one attack line. The target's KP moves
-- by the difference (never above max, never below 0).
create or replace function public.admin_edit_attack_log(
  p_log_id uuid,
  p_d20 integer,
  p_hit boolean,
  p_damage integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._require_admin();
  v_l public.battle_logs;
  v_enc public.battle_encounters;
  v_e public.battle_enemies;
  v_p public.trainer_pokemon;
  v_hit boolean;
  v_old integer;
  v_cur integer;
  v_max integer;
  v_base integer;
  v_new integer;
  v_applied integer;
  v_target text;
  v_before text;
  v_after text;
begin
  select * into v_l from public.battle_logs where id = p_log_id;
  if v_l.id is null then raise exception 'Log entry not found'; end if;
  if v_l.action not in ('attack', 'enemy_attack') then
    raise exception 'Only attacks can be corrected here.';
  end if;
  if v_l.damage is null or v_l.hit is null then
    raise exception 'This attack was recorded before Version 14 — fix the KP with the KP controls instead.';
  end if;
  select * into v_enc from public.battle_encounters where id = v_l.encounter_id for update;
  if v_enc.status <> 'active' then raise exception 'This battle is already over'; end if;
  select * into v_l from public.battle_logs where id = p_log_id for update;

  v_hit := public._attack_inputs(coalesce(p_damage, 0), p_d20, p_hit);
  v_old := v_l.damage;
  v_target := v_l.target_label;

  if v_l.target_type = 'enemy' then
    select * into v_e from public.battle_enemies where id = v_l.enemy_id for update;
    if v_e.id is null then raise exception 'That enemy is no longer in the battle.'; end if;
    if v_e.caught_by is not null then raise exception '% has been caught and left the battle.', v_e.name; end if;
    v_cur := v_e.current_hp; v_max := v_e.max_hp;
  else
    select * into v_p from public.trainer_pokemon where id = v_l.target_pokemon_id for update;
    if v_p.id is null then raise exception 'That Pokémon no longer exists.'; end if;
    if v_p.is_dead then raise exception 'This Pokémon has died and cannot be changed.'; end if;
    v_cur := v_p.current_hp; v_max := v_p.max_hp;
  end if;

  v_base := least(v_max, v_cur + v_old);
  v_new := greatest(0, v_base - coalesce(p_damage, 0));
  v_applied := v_base - v_new;

  if v_l.target_type = 'enemy' then
    update public.battle_enemies
    set current_hp = v_new, fainted_at = case when v_new = 0 then coalesce(fainted_at, now()) else null end
    where id = v_e.id;
    if v_l.action = 'attack' and v_l.actor_profile_id is not null then
      update public.battle_players set damage_dealt = greatest(0, damage_dealt + v_applied - v_old)
      where encounter_id = v_enc.id and profile_id = v_l.actor_profile_id;
    end if;
  else
    perform set_config('pokegear.hp_source', 'battle', true);
    perform set_config('pokegear.bypass_pokemon_guard', 'on', true);
    update public.trainer_pokemon
    set current_hp = v_new,
        status = case when v_new = 0 then 'fainted'::public.pokemon_status
                      when status = 'fainted' then 'healthy'::public.pokemon_status
                      else status end
    where id = v_p.id;
  end if;

  v_before := case when not v_l.hit then 'Miss' else format('Hit for %s', v_old) end;
  v_after := case when not v_hit then 'Miss' else format('Hit for %s', v_applied) end;

  update public.battle_logs
  set d20 = p_d20, hit = v_hit, damage = v_applied,
      new_kp = previous_kp - v_applied, delta = -v_applied,
      message = public._attack_text(coalesce(attacker_label, '?'), target_label, p_d20, v_hit, v_applied),
      edited_at = now()
  where id = v_l.id;

  perform public._battle_log(v_enc.id, 'correction', v_l.target_type, v_l.target_pokemon_id, v_l.enemy_id, v_target,
    v_cur, v_new, v_admin, null, null, null,
    format('Game Master corrected %s → %s: %s → %s. %s: %s → %s KP.',
      coalesce(v_l.attacker_label, '?'), v_target, v_before, v_after, v_target, v_cur, v_new));
  if v_new = 0 and v_cur > 0 then
    perform public._battle_log(v_enc.id, 'faint', v_l.target_type, v_l.target_pokemon_id, v_l.enemy_id, v_target, 0, 0,
      null, null, null, null, format('%s fainted!', v_target));
  end if;

  perform public._battle_check_end(v_enc.id);
  perform public._battle_ensure_turn(v_enc.id);
  return jsonb_build_object('hp_before', v_cur, 'hp_after', v_new, 'damage', v_applied, 'hit', v_hit);
end;
$$;

grant execute on function public.admin_edit_attack_log(uuid, integer, boolean, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Turn tools for the Game Master
-- ---------------------------------------------------------------------------
-- "Next turn" (kept under its old name; the log wording changes).
create or replace function public.admin_skip_turn(p_encounter_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._require_admin();
  v_enc public.battle_encounters;
  v_cur public.battle_turn_order;
begin
  v_enc := public._battle_lock_fight_for_admin(p_encounter_id);
  select * into v_cur from public.battle_turn_order where encounter_id = p_encounter_id and position = v_enc.turn_position;
  perform public._battle_log(p_encounter_id, 'skip', 'system', null, null, '', 0, 0, v_admin, null, null, null,
    format('The Game Master ended %s''s turn.', coalesce(public._turn_entry_name(v_cur), '?')));
  perform public._battle_advance_turn(p_encounter_id);
end;
$$;

grant execute on function public.admin_skip_turn(uuid) to authenticated;

-- Back to the previous one in the order who can act (into the previous
-- round if needed).
create or replace function public.admin_previous_turn(p_encounter_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._require_admin();
  v_enc public.battle_encounters;
  v_prev integer;
  v_round integer;
  v_entry public.battle_turn_order;
begin
  v_enc := public._battle_lock_fight_for_admin(p_encounter_id);
  v_round := v_enc.round;
  select max(t.position) into v_prev from public.battle_turn_order t
  where t.encounter_id = p_encounter_id and t.position < coalesce(v_enc.turn_position, 0) and public._turn_can_act(t);
  if v_prev is null then
    if v_enc.round <= 1 then
      raise exception 'This is already the first turn of the fight.';
    end if;
    select max(t.position) into v_prev from public.battle_turn_order t
    where t.encounter_id = p_encounter_id and public._turn_can_act(t);
    if v_prev is null then raise exception 'Nobody can act right now.'; end if;
    v_round := v_enc.round - 1;
  end if;

  update public.battle_encounters set turn_position = v_prev, round = v_round where id = p_encounter_id;
  select * into v_entry from public.battle_turn_order where encounter_id = p_encounter_id and position = v_prev;
  perform public._battle_log(p_encounter_id, 'turn', 'system', null, null, '', 0, 0, v_admin, null, null, null,
    format('The Game Master went back to %s''s turn%s.', public._turn_entry_name(v_entry),
      case when v_round <> v_enc.round then format(' (round %s)', v_round) else '' end));
end;
$$;

grant execute on function public.admin_previous_turn(uuid) to authenticated;

-- Give the turn to one combatant (a correction). The round stays.
create or replace function public.admin_set_turn(p_encounter_id uuid, p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._require_admin();
  v_enc public.battle_encounters;
  v_entry public.battle_turn_order;
begin
  v_enc := public._battle_lock_fight_for_admin(p_encounter_id);
  select * into v_entry from public.battle_turn_order where id = p_entry_id and encounter_id = p_encounter_id;
  if v_entry.id is null then raise exception 'That combatant isn''t in this fight.'; end if;
  if v_entry.position is null then raise exception '% hasn''t rolled for initiative yet.', public._turn_entry_name(v_entry); end if;
  if not public._turn_can_act(v_entry) then
    raise exception '% can''t act right now (fainted or out of Pokémon).', public._turn_entry_name(v_entry);
  end if;
  if v_entry.position = v_enc.turn_position then return; end if;
  update public.battle_encounters set turn_position = v_entry.position where id = p_encounter_id;
  perform public._battle_log(p_encounter_id, 'turn', 'system', null, null, '', 0, 0, v_admin, null, null, null,
    format('The Game Master gave the turn to %s.', public._turn_entry_name(v_entry)));
end;
$$;

grant execute on function public.admin_set_turn(uuid, uuid) to authenticated;

-- Move someone to another place in the initiative order (fight running).
create or replace function public.admin_move_turn_entry(p_entry_id uuid, p_position integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._require_admin();
  v_entry public.battle_turn_order;
  v_pos integer;
begin
  select * into v_entry from public.battle_turn_order where id = p_entry_id;
  if v_entry.id is null then raise exception 'Not found'; end if;
  perform public._battle_lock_fight_for_admin(v_entry.encounter_id);
  select * into v_entry from public.battle_turn_order where id = p_entry_id for update;
  if v_entry.position is null then raise exception '% hasn''t rolled for initiative yet.', public._turn_entry_name(v_entry); end if;
  if p_position is null then raise exception 'Choose a place in the order.'; end if;
  if p_position = v_entry.position then return v_entry.position; end if;
  v_pos := public._battle_move_entry(v_entry.id, p_position);
  perform public._battle_log(v_entry.encounter_id, 'initiative', 'system', null, null, '', 0, 0, v_admin, null, null, null,
    format('The Game Master moved %s to place %s in the order.', public._turn_entry_name(v_entry), v_pos));
  return v_pos;
end;
$$;

grant execute on function public.admin_move_turn_entry(uuid, integer) to authenticated;

-- Enter or correct a roll. During initiative as before; in a running fight
-- a corrected roll moves that combatant to where the new roll belongs
-- (whoever's turn it is keeps it).
create or replace function public.admin_set_initiative(p_entry_id uuid, p_roll integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._require_admin();
  v_entry public.battle_turn_order;
  v_enc public.battle_encounters;
  v_pos integer;
begin
  select * into v_entry from public.battle_turn_order where id = p_entry_id;
  if v_entry.id is null then
    raise exception 'Not found';
  end if;
  select * into v_enc from public.battle_encounters where id = v_entry.encounter_id for update;
  if v_enc.status <> 'active' then
    raise exception 'This battle is already over';
  end if;
  select * into v_entry from public.battle_turn_order where id = p_entry_id for update;

  if v_enc.phase = 'fighting' and v_entry.position is not null then
    if p_roll is null or p_roll < 1 or p_roll > 20 then
      raise exception 'A d20 roll is a number from 1 to 20.';
    end if;
    if v_entry.rolls[1] = p_roll then return; end if;
    update public.battle_turn_order set rolls = array[p_roll::smallint], awaiting = false where id = v_entry.id;
    select count(*) + 1 into v_pos from public.battle_turn_order
    where encounter_id = v_enc.id and position is not null and id <> v_entry.id and rolls[1] >= p_roll;
    v_pos := public._battle_move_entry(v_entry.id, v_pos);
    perform public._battle_log(v_enc.id, 'initiative', 'system', null, null, '', 0, 0, v_admin, null, null, null,
      format('The Game Master corrected %s''s initiative to %s (place %s).', public._turn_entry_name(v_entry), p_roll, v_pos));
    return;
  end if;

  perform public._battle_record_roll(v_entry, p_roll, true);
end;
$$;

grant execute on function public.admin_set_initiative(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Enemy trainers: switching, revive, status
-- ---------------------------------------------------------------------------
-- Game Master switches a trainer's active Pokémon. KP, status and fainted
-- state stay with each Pokémon; the turn order doesn't change.
create or replace function public.admin_set_trainer_active(p_trainer_row uuid, p_enemy_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._require_admin();
  v_enc public.battle_encounters;
  v_t public.battle_enemy_trainers;
  v_e public.battle_enemies;
  v_old public.battle_enemies;
begin
  select * into v_t from public.battle_enemy_trainers where id = p_trainer_row;
  if v_t.id is null then raise exception 'Trainer not found'; end if;
  select * into v_enc from public.battle_encounters where id = v_t.encounter_id for update;
  if v_enc.status <> 'active' then raise exception 'This battle is already over'; end if;
  select * into v_t from public.battle_enemy_trainers where id = p_trainer_row for update;
  select * into v_e from public.battle_enemies where id = p_enemy_id;
  if v_e.id is null or v_e.enemy_trainer_id is distinct from v_t.id then raise exception 'That Pokémon isn''t on this trainer''s team.'; end if;
  if v_e.caught_by is not null then raise exception '% has left the battle.', v_e.name; end if;
  if v_e.current_hp <= 0 then raise exception '% has fainted — revive it first to send it out.', v_e.name; end if;
  if v_t.active_enemy_id = v_e.id then return; end if;
  select * into v_old from public.battle_enemies where id = v_t.active_enemy_id;
  update public.battle_enemy_trainers set active_enemy_id = v_e.id where id = v_t.id;
  perform public._battle_log(v_t.encounter_id, 'trainer_switch', 'enemy', null, v_e.id, v_e.name, v_e.current_hp, v_e.current_hp,
    v_admin, null, null, null,
    case when v_old.id is not null and v_old.current_hp > 0
         then format('%s withdraws %s and sends out %s!', v_t.name, v_old.name, v_e.name)
         else format('%s sends out %s!', v_t.name, v_e.name) end);
end;
$$;

grant execute on function public.admin_set_trainer_active(uuid, uuid) to authenticated;

-- Enemy KP changes: a fainted active Pokémon is replaced; a revived Pokémon
-- of a trainer who had nobody left comes back out.
create or replace function public.battle_enemy_hp_turn_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.current_hp = 0 and old.current_hp > 0 then
    if new.enemy_trainer_id is not null then
      perform public._enemy_trainer_send_next(new.enemy_trainer_id);
    end if;
    perform public._battle_ensure_turn(new.encounter_id);
  elsif new.current_hp > 0 and old.current_hp = 0 and new.enemy_trainer_id is not null then
    perform public._enemy_trainer_send_next(new.enemy_trainer_id);
  end if;
  return null;
end;
$$;

-- Game Master: status of an enemy Pokémon (fainting comes from its KP).
create or replace function public.admin_set_enemy_status(p_enemy_id uuid, p_status public.pokemon_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._require_admin();
  v_e public.battle_enemies;
  v_enc public.battle_encounters;
begin
  select * into v_e from public.battle_enemies where id = p_enemy_id;
  if v_e.id is null then raise exception 'Enemy not found'; end if;
  select * into v_enc from public.battle_encounters where id = v_e.encounter_id for update;
  if v_enc.status <> 'active' then raise exception 'This battle is already over'; end if;
  if p_status is null or p_status = 'fainted' then
    raise exception 'Fainting comes from KP — set its KP to 0 instead.';
  end if;
  if v_e.status = p_status then return; end if;
  update public.battle_enemies set status = p_status where id = p_enemy_id;
  perform public._battle_log(v_e.encounter_id, 'status', 'enemy', null, v_e.id, v_e.name, v_e.current_hp, v_e.current_hp,
    v_admin, null, null, null,
    case when p_status = 'healthy' then format('%s is no longer %s.', v_e.name, v_e.status)
         else format('%s is now %s.', v_e.name, p_status) end);
end;
$$;

grant execute on function public.admin_set_enemy_status(uuid, public.pokemon_status) to authenticated;

-- Game Master's KP/status tool for a trainer's Pokémon (same as 0012). New:
-- a status-only change during a battle is written to that battle's log, so
-- every screen in the battle refreshes.
create or replace function public.admin_set_pokemon_hp(
  p_pokemon_id uuid,
  p_current_hp integer,
  p_status public.pokemon_status default null
)
returns public.trainer_pokemon
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.trainer_pokemon;
  v_status public.pokemon_status;
  v_result public.trainer_pokemon;
  v_enc uuid;
begin
  if not public.is_admin() then
    raise exception 'Only the Game Master can set KP directly.';
  end if;
  select * into v_p from public.trainer_pokemon where id = p_pokemon_id for update;
  if v_p.id is null then
    raise exception 'Pokémon not found';
  end if;
  if v_p.is_dead then
    raise exception 'This Pokémon has died and cannot be changed.';
  end if;
  if p_current_hp is null or p_current_hp < 0 then
    raise exception 'Current HP cannot be below 0.';
  end if;
  if p_current_hp > v_p.max_hp then
    raise exception 'Current HP cannot be greater than Maximum HP.';
  end if;

  if p_current_hp = 0 then
    v_status := 'fainted';
  elsif p_status::text = 'fainted' then
    raise exception 'A fainted Pokémon must have 0 HP.';
  elsif p_status is not null then
    v_status := p_status;
  elsif v_p.status = 'fainted' then
    v_status := 'healthy';
  else
    v_status := v_p.status;
  end if;

  perform set_config('pokegear.hp_source', 'gm_set_hp', true);
  perform set_config('pokegear.bypass_pokemon_guard', 'on', true);
  update public.trainer_pokemon
  set current_hp = p_current_hp, status = v_status
  where id = p_pokemon_id
  returning * into v_result;

  if v_result.current_hp <> v_p.current_hp then
    perform public._battle_note_external_hp(v_result, v_p.current_hp,
      format('The Game Master set %s''s KP to %s/%s.', public._pokemon_label(v_p.id), v_result.current_hp, v_result.max_hp));
  elsif v_result.status <> v_p.status then
    v_enc := public._active_encounter_for(v_p.profile_id);
    if v_enc is not null then
      perform public._battle_log(v_enc, 'status', 'trainer_pokemon', v_p.id, null, public._pokemon_label(v_p.id),
        v_p.current_hp, v_p.current_hp, public.my_profile_id(), null, null, null,
        case when v_result.status = 'healthy' then format('%s is no longer %s.', public._pokemon_label(v_p.id), v_p.status)
             else format('%s is now %s.', public._pokemon_label(v_p.id), v_result.status) end);
    end if;
  end if;

  return v_result;
end;
$$;

grant execute on function public.admin_set_pokemon_hp(uuid, integer, public.pokemon_status) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Battle state: teammates' Teams, hidden enemy bench, richer log
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
    -- Players see wild Pokémon and each enemy trainer's active Pokémon; an
    -- enemy trainer's bench stays hidden. The Game Master sees everything.
    'enemies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'slot', e.slot, 'name', e.name, 'species_id', e.species_id, 'sprite_url', e.sprite_url,
        'level', e.level, 'current_hp', e.current_hp, 'max_hp', e.max_hp, 'type1', e.type1, 'type2', e.type2,
        'status', e.status,
        'fainted', e.current_hp = 0,
        'enemy_trainer_id', e.enemy_trainer_id, 'team_position', e.team_position,
        'on_field', public._enemy_on_field(e),
        'caught', e.caught_by is not null,
        'caught_by_name', (select username from public.profiles where id = e.caught_by),
        'catchable', v_enc.catching_allowed and e.enemy_trainer_id is null and e.caught_by is null and e.species_id is not null
      ) order by e.slot)
      from public.battle_enemies e
      where e.encounter_id = p_encounter_id
        and (v_admin or e.enemy_trainer_id is null
             or exists (select 1 from public.battle_enemy_trainers t where t.id = e.enemy_trainer_id and t.active_enemy_id = e.id))
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
        ) end,
        -- PokéGear 14: everyone in the battle sees each trainer's Team.
        'team', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', m.id, 'name', coalesce(m.nickname, ms.name), 'species_id', m.species_id, 'level', m.level,
            'current_hp', m.current_hp, 'max_hp', m.max_hp, 'status', m.status, 'is_dead', m.is_dead,
            'is_shiny', m.is_shiny, 'party_slot', m.party_slot, 'type1', ms.type1, 'type2', ms.type2,
            'is_active', m.id = bp.active_pokemon_id
          ) order by m.party_slot)
          from public.trainer_pokemon m join public.species ms on ms.id = m.species_id
          where m.profile_id = bp.profile_id and m.party_slot is not null
        ), '[]'::jsonb)
      ) order by bp.joined_at, bp.id)
      from public.battle_players bp
      join public.profiles pr on pr.id = bp.profile_id
      left join public.trainer_pokemon tp on tp.id = bp.active_pokemon_id
      left join public.species s on s.id = tp.species_id
      where bp.encounter_id = p_encounter_id
    ), '[]'::jsonb),
    'enemy_trainers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'species_id', t.species_id, 'sprite_url', t.sprite_url, 'position', t.position,
        'active_enemy_id', t.active_enemy_id,
        'remaining', (select count(*) from public.battle_enemies be where be.enemy_trainer_id = t.id and be.current_hp > 0 and be.caught_by is null),
        'total', (select count(*) from public.battle_enemies be where be.enemy_trainer_id = t.id)
      ) order by t.position)
      from public.battle_enemy_trainers t where t.encounter_id = p_encounter_id
    ), '[]'::jsonb),
    'catches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'enemy_id', c.enemy_id, 'profile_id', c.profile_id,
        'username', (select username from public.profiles where id = c.profile_id),
        'pokemon_name', c.pokemon_name, 'ball_name', c.ball_name, 'status', c.status,
        'created_at', c.created_at, 'resolved_at', c.resolved_at, 'note', c.note
      ) order by c.created_at desc)
      from public.catch_attempts c
      where c.encounter_id = p_encounter_id and (v_admin or c.profile_id = v_me)
    ), '[]'::jsonb),
    'order', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'kind', case when t.battle_player_id is not null then 'player' when t.enemy_id is not null then 'enemy' else 'trainer' end,
        'enemy_trainer_id', t.enemy_trainer_id,
        'battle_player_id', t.battle_player_id,
        'profile_id', (select bp.profile_id from public.battle_players bp where bp.id = t.battle_player_id),
        'enemy_id', t.enemy_id,
        'name', public._turn_entry_name(t),
        'rolls', to_jsonb(t.rolls),
        'roll', t.rolls[1],
        'awaiting', t.awaiting,
        'position', t.position,
        'can_act', public._turn_can_act(t),
        'is_current', v_enc.phase = 'fighting' and t.position is not null and t.position = v_enc.turn_position
      ) order by t.position nulls last, t.rolls desc, t.created_at)
      from public.battle_turn_order t where t.encounter_id = p_encounter_id
    ), '[]'::jsonb),
    'logs', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.created_at, l.id)
      from (
        select id, action, target_type, target_label, previous_kp, new_kp, delta, move_name,
               is_critical, effectiveness, message, actor_profile_id, enemy_id, target_pokemon_id, created_at,
               round, d20, hit, damage, attacker_label, edited_at
        from public.battle_logs where encounter_id = p_encounter_id
        order by created_at desc, id desc limit 200
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
          'is_shiny', tp.is_shiny, 'party_slot', tp.party_slot, 'type1', s.type1, 'type2', s.type2
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
      ), '[]'::jsonb),
      'balls', coalesce((
        select jsonb_agg(jsonb_build_object(
          'item_id', ic.id, 'name', ic.name, 'quantity', ti.quantity,
          'pokeapi_slug', ic.pokeapi_slug, 'icon_url', ic.icon_url, 'icon_emoji', ic.icon_emoji
        ) order by ic.sort_order, ic.name)
        from public.trainer_items ti join public.items_catalog ic on ic.id = ti.item_id
        where ti.profile_id = v_me and ti.quantity > 0 and ic.category = 'poke_ball'
      ), '[]'::jsonb)
    ));
  end if;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Lock down internal helpers.
-- ---------------------------------------------------------------------------
revoke execute on function public.battle_logs_set_round() from public, anon, authenticated;
revoke execute on function public._battle_log_attack(uuid, text, text, uuid, uuid, text, integer, integer, uuid, text, integer, boolean, integer) from public, anon, authenticated;
revoke execute on function public._enemy_switch_event(uuid) from public, anon, authenticated;
revoke execute on function public._battle_move_entry(uuid, integer) from public, anon, authenticated;
revoke execute on function public._battle_lock_fight_for_admin(uuid) from public, anon, authenticated;
revoke execute on function public.battle_enemy_hp_turn_check() from public, anon, authenticated;
