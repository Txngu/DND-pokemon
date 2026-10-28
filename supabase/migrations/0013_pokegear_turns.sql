-- ============================================================================
-- PokéGear 12.1 — tabletop turns
-- ============================================================================
-- Run AFTER 0012_pokegear_v12.sql. Safe to run more than once.
--
-- Battles now work like the table plays them:
--   1. Initiative: every trainer types their d20 roll in the app; the Game
--      Master enters one roll per enemy Pokémon (and can correct any roll).
--      Equal rolls roll again. The order then runs from highest to lowest.
--   2. Turns: whoever's turn it is does ONE thing — attack, use an item, or
--      switch Pokémon. An attack is "pick a target, type the damage"
--      (0 = missed). Nothing is calculated by the app any more: no moves,
--      stats, types, criticals or random misses. The Game Master does the
--      same for each enemy on its turn.
--   3. Sending out your first Pokémon, or replacing one that just fainted,
--      is free and doesn't use your turn.
--   Fainted enemies and trainers with no usable Pokémon are skipped. After
--   the last one in the order, the next round starts at the top.
--
-- The old automatic attack functions (battle_attack, admin_enemy_attack) are
-- switched off. Rewards, XP, items, the Pokémon Center etc. are unchanged.
-- (No temporary tables and no ALTER FUNCTION ... SET, so it runs in the
-- Supabase SQL editor.)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Data
-- ---------------------------------------------------------------------------
alter table public.battle_encounters
  add column if not exists phase          text not null default 'fighting',
  add column if not exists round          integer not null default 1,
  add column if not exists turn_position  integer;

alter table public.battle_encounters drop constraint if exists battle_encounters_phase_check;
alter table public.battle_encounters add constraint battle_encounters_phase_check
  check (phase in ('initiative', 'fighting'));

create table if not exists public.battle_turn_order (
  id                uuid primary key default gen_random_uuid(),
  encounter_id      uuid not null references public.battle_encounters (id) on delete cascade,
  battle_player_id  uuid references public.battle_players (id) on delete cascade,
  enemy_id          uuid references public.battle_enemies (id) on delete cascade,
  rolls             smallint[] not null default '{}',   -- first roll, then any tie re-rolls
  awaiting          boolean not null default true,       -- waiting for (another) d20 roll
  position          integer,                             -- 1 = acts first; null until the order is set
  created_at        timestamptz not null default clock_timestamp(),
  constraint battle_turn_order_one_actor check ((battle_player_id is null) <> (enemy_id is null))
);

create unique index if not exists battle_turn_order_player_uniq on public.battle_turn_order (battle_player_id) where battle_player_id is not null;
create unique index if not exists battle_turn_order_enemy_uniq on public.battle_turn_order (enemy_id) where enemy_id is not null;
create index if not exists battle_turn_order_encounter_idx on public.battle_turn_order (encounter_id, position);

alter table public.battle_turn_order enable row level security;
drop policy if exists "battle_turn_order_select" on public.battle_turn_order;
create policy "battle_turn_order_select" on public.battle_turn_order for select to authenticated
  using (public.is_admin() or public.is_battle_member(encounter_id));
-- No write policies: only the functions below change it.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'battle_turn_order'
  ) then
    alter publication supabase_realtime add table public.battle_turn_order;
  end if;
end $$;

-- New admin battles start with initiative; every trainer and enemy gets an
-- entry automatically (also trainers added in the middle of a fight).
create or replace function public.battle_encounter_start_initiative()
returns trigger
language plpgsql
as $$
begin
  if new.mode = 'auto' then
    new.phase := 'initiative';
    new.round := 1;
    new.turn_position := null;
  end if;
  return new;
end;
$$;

drop trigger if exists battle_encounters_start_initiative on public.battle_encounters;
create trigger battle_encounters_start_initiative
  before insert on public.battle_encounters
  for each row execute procedure public.battle_encounter_start_initiative();

create or replace function public.battle_add_turn_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.battle_encounters where id = new.encounter_id and mode = 'auto' and status = 'active') then
    if tg_table_name = 'battle_players' then
      insert into public.battle_turn_order (encounter_id, battle_player_id) values (new.encounter_id, new.id)
      on conflict do nothing;
    else
      insert into public.battle_turn_order (encounter_id, enemy_id) values (new.encounter_id, new.id)
      on conflict do nothing;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists battle_players_add_turn_entry on public.battle_players;
create trigger battle_players_add_turn_entry
  after insert on public.battle_players
  for each row execute procedure public.battle_add_turn_entry();

drop trigger if exists battle_enemies_add_turn_entry on public.battle_enemies;
create trigger battle_enemies_add_turn_entry
  after insert on public.battle_enemies
  for each row execute procedure public.battle_add_turn_entry();

-- Battles that are running right now switch to the new system: everyone
-- is asked for an initiative roll.
insert into public.battle_turn_order (encounter_id, battle_player_id)
select bp.encounter_id, bp.id from public.battle_players bp
join public.battle_encounters e on e.id = bp.encounter_id
where e.mode = 'auto' and e.status = 'active'
  and not exists (select 1 from public.battle_turn_order t where t.battle_player_id = bp.id);

insert into public.battle_turn_order (encounter_id, enemy_id)
select be.encounter_id, be.id from public.battle_enemies be
join public.battle_encounters e on e.id = be.encounter_id
where e.mode = 'auto' and e.status = 'active'
  and not exists (select 1 from public.battle_turn_order t where t.enemy_id = be.id);

update public.battle_encounters e set phase = 'initiative', round = 1, turn_position = null
where e.mode = 'auto' and e.status = 'active' and e.phase = 'fighting'
  and not exists (select 1 from public.battle_turn_order t where t.encounter_id = e.id and t.position is not null);

-- ---------------------------------------------------------------------------
-- Turn helpers
-- ---------------------------------------------------------------------------
create or replace function public._turn_entry_name(p_entry public.battle_turn_order)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select pr.username from public.battle_players bp join public.profiles pr on pr.id = bp.profile_id where bp.id = p_entry.battle_player_id),
    (select be.name from public.battle_enemies be where be.id = p_entry.enemy_id),
    '?'
  );
$$;

create or replace function public._turn_can_act(p_entry public.battle_turn_order)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_entry.position is null then false
    when p_entry.enemy_id is not null then
      coalesce((select current_hp > 0 from public.battle_enemies where id = p_entry.enemy_id), false)
    else
      coalesce((select public._usable_pokemon_count(bp.profile_id) > 0 from public.battle_players bp where bp.id = p_entry.battle_player_id), false)
  end;
$$;

-- Move to the next one in the order who can still act (wrapping into the
-- next round). Caller holds the encounter row lock.
create or replace function public._battle_advance_turn(p_encounter_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.battle_encounters;
  v_next integer;
  v_round integer;
  v_entry public.battle_turn_order;
begin
  select * into v_enc from public.battle_encounters where id = p_encounter_id;
  if v_enc.status <> 'active' or v_enc.phase <> 'fighting' then
    return;
  end if;
  v_round := v_enc.round;

  select min(t.position) into v_next from public.battle_turn_order t
  where t.encounter_id = p_encounter_id and t.position > coalesce(v_enc.turn_position, 0) and public._turn_can_act(t);

  if v_next is null then
    select min(t.position) into v_next from public.battle_turn_order t
    where t.encounter_id = p_encounter_id and public._turn_can_act(t);
    if v_next is null then
      return; -- nobody can act; _battle_check_end decides the outcome
    end if;
    if v_enc.turn_position is not null then
      v_round := v_round + 1;
      perform public._battle_log(p_encounter_id, 'round', 'system', null, null, '', 0, 0, null, null, null, null,
        format('Round %s begins.', v_round));
    end if;
  end if;

  update public.battle_encounters set turn_position = v_next, round = v_round where id = p_encounter_id;
  select * into v_entry from public.battle_turn_order where encounter_id = p_encounter_id and position = v_next;
  perform public._battle_log(p_encounter_id, 'turn', 'system', null, null, '', 0, 0, null, null, null, null,
    format('It''s %s''s turn.', public._turn_entry_name(v_entry)));
end;
$$;

-- If whoever's turn it is can no longer act (fainted, out of Pokémon), move on.
create or replace function public._battle_ensure_turn(p_encounter_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.battle_encounters;
  v_cur public.battle_turn_order;
begin
  select * into v_enc from public.battle_encounters where id = p_encounter_id;
  if v_enc.id is null or v_enc.status <> 'active' or v_enc.phase <> 'fighting' then
    return;
  end if;
  select * into v_cur from public.battle_turn_order where encounter_id = p_encounter_id and position = v_enc.turn_position;
  if v_cur.id is null or not public._turn_can_act(v_cur) then
    perform public._battle_advance_turn(p_encounter_id);
  end if;
end;
$$;

-- After a roll comes in: wait for the others, ask tied rolls to roll again,
-- or fix the order and start the fight.
create or replace function public._battle_initiative_progress(p_encounter_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tie record;
  v_order text;
begin
  if exists (select 1 from public.battle_turn_order where encounter_id = p_encounter_id and awaiting) then
    return;
  end if;

  for v_tie in
    select t.rolls, string_agg(public._turn_entry_name(t), ' and ' order by t.created_at) as names
    from public.battle_turn_order t
    where t.encounter_id = p_encounter_id
    group by t.rolls having count(*) > 1
  loop
    update public.battle_turn_order set awaiting = true where encounter_id = p_encounter_id and rolls = v_tie.rolls;
    perform public._battle_log(p_encounter_id, 'initiative_tie', 'system', null, null, '', 0, 0, null, null, null, null,
      format('Tie! %s both rolled %s — roll again.', v_tie.names, v_tie.rolls[array_length(v_tie.rolls, 1)]));
  end loop;
  if exists (select 1 from public.battle_turn_order where encounter_id = p_encounter_id and awaiting) then
    return;
  end if;

  with ranked as (
    select id, row_number() over (order by rolls desc, created_at) as pos
    from public.battle_turn_order where encounter_id = p_encounter_id
  )
  update public.battle_turn_order t set position = r.pos from ranked r where r.id = t.id;

  select string_agg(format('%s (%s)', public._turn_entry_name(t), t.rolls[1]), ', ' order by t.position) into v_order
  from public.battle_turn_order t where t.encounter_id = p_encounter_id;

  update public.battle_encounters set phase = 'fighting', round = 1, turn_position = null where id = p_encounter_id;
  perform public._battle_log(p_encounter_id, 'initiative', 'system', null, null, '', 0, 0, null, null, null, null,
    format('The fight begins! Order: %s.', v_order));
  perform public._battle_advance_turn(p_encounter_id);
end;
$$;

-- Records one d20 roll on an entry (append for a first roll / tie re-roll;
-- the GM may also overwrite the latest roll during initiative).
create or replace function public._battle_record_roll(p_entry public.battle_turn_order, p_roll integer, p_overwrite boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.battle_encounters;
  v_new_pos integer;
begin
  if p_roll is null or p_roll < 1 or p_roll > 20 then
    raise exception 'A d20 roll is a number from 1 to 20.';
  end if;
  select * into v_enc from public.battle_encounters where id = p_entry.encounter_id;

  if v_enc.phase = 'initiative' then
    if p_entry.awaiting then
      update public.battle_turn_order set rolls = rolls || p_roll::smallint, awaiting = false where id = p_entry.id;
    elsif p_overwrite and array_length(p_entry.rolls, 1) > 0 then
      update public.battle_turn_order set rolls[array_length(p_entry.rolls, 1)] = p_roll::smallint where id = p_entry.id;
    else
      raise exception 'That roll is already in.';
    end if;
    perform public._battle_initiative_progress(p_entry.encounter_id);
    return;
  end if;

  -- Fight already running: someone who joined late takes their place by
  -- their roll (after anyone with the same roll), from the next time the
  -- order reaches that place.
  if p_entry.position is not null then
    raise exception 'The order is already set for this fight.';
  end if;
  select count(*) + 1 into v_new_pos from public.battle_turn_order
  where encounter_id = p_entry.encounter_id and position is not null and rolls[1] >= p_roll;
  update public.battle_turn_order set position = position + 1
  where encounter_id = p_entry.encounter_id and position >= v_new_pos;
  update public.battle_turn_order set rolls = array[p_roll::smallint], awaiting = false, position = v_new_pos where id = p_entry.id;
  if v_enc.turn_position is not null and v_enc.turn_position >= v_new_pos then
    update public.battle_encounters set turn_position = turn_position + 1 where id = v_enc.id;
  end if;
  perform public._battle_log(v_enc.id, 'initiative', 'system', null, null, '', 0, 0, null, null, null, null,
    format('%s joins the order with a %s.', public._turn_entry_name(p_entry), p_roll));
  perform public._battle_ensure_turn(v_enc.id);
end;
$$;

-- Locks the encounter for an action by the trainer whose turn it is.
create or replace function public._battle_require_my_turn(p_encounter_id uuid)
returns public.battle_players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bp public.battle_players;
  v_enc public.battle_encounters;
  v_cur public.battle_turn_order;
begin
  v_bp := public._battle_lock_for_player(p_encounter_id);
  select * into v_enc from public.battle_encounters where id = p_encounter_id;
  if v_enc.phase = 'initiative' then
    raise exception 'The fight hasn''t started yet — everyone rolls for initiative first.';
  end if;
  select * into v_cur from public.battle_turn_order where encounter_id = p_encounter_id and position = v_enc.turn_position;
  if v_cur.battle_player_id is distinct from v_bp.id then
    raise exception 'It''s not your turn — it''s %''s turn.', coalesce(public._turn_entry_name(v_cur), 'someone else');
  end if;
  return v_bp;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trainer actions
-- ---------------------------------------------------------------------------
create or replace function public.battle_submit_initiative(p_encounter_id uuid, p_roll integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bp public.battle_players;
  v_entry public.battle_turn_order;
begin
  v_bp := public._battle_lock_for_player(p_encounter_id);
  select * into v_entry from public.battle_turn_order where battle_player_id = v_bp.id for update;
  if v_entry.id is null then
    raise exception 'You''re not in this fight''s order.';
  end if;
  if not v_entry.awaiting then
    raise exception 'Your roll is already in.';
  end if;
  perform public._battle_record_roll(v_entry, p_roll, false);
end;
$$;

grant execute on function public.battle_submit_initiative(uuid, integer) to authenticated;

-- Attack on your turn: pick an enemy and type the damage (0 = missed).
create or replace function public.battle_turn_attack(p_encounter_id uuid, p_target_enemy_id uuid, p_damage integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bp public.battle_players;
  v_p public.trainer_pokemon;
  v_e public.battle_enemies;
  v_name text;
  v_dmg integer;
  v_new integer;
  v_events jsonb := '[]'::jsonb;
begin
  v_bp := public._battle_require_my_turn(p_encounter_id);
  if p_damage is null or p_damage < 0 then
    raise exception 'Damage can''t be negative (type 0 for a miss).';
  end if;
  if p_damage > 9999 then
    raise exception 'That''s a bit much — at most 9999 damage.';
  end if;

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
  if v_e.current_hp <= 0 then
    raise exception '% has already fainted.', v_e.name;
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
    'missed', p_damage = 0, 'damage', v_dmg,
    'hp_before', v_e.current_hp, 'hp_after', v_new, 'max_hp', v_e.max_hp, 'fainted', v_new = 0,
    'message', case when p_damage = 0 then format('%s attacked %s…', v_name, v_e.name) else format('%s attacked %s!', v_name, v_e.name) end,
    'detail', case when p_damage = 0 then 'It missed!' else format('%s damage!', v_dmg) end);
  perform public._battle_log(p_encounter_id, 'attack', 'enemy', null, v_e.id, v_e.name, v_e.current_hp, v_new,
    v_bp.profile_id, null, null, null,
    case when p_damage = 0 then format('%s attacked %s but missed.', v_name, v_e.name)
         else format('%s hit %s for %s damage.', v_name, v_e.name, v_dmg) end);

  if v_new = 0 then
    v_events := v_events || jsonb_build_object('type', 'faint', 'side', 'enemy', 'target_id', v_e.id,
      'message', format('%s fainted!', v_e.name));
    perform public._battle_log(p_encounter_id, 'faint', 'enemy', null, v_e.id, v_e.name, 0, 0, null, null, null, null,
      format('%s fainted!', v_e.name));
  end if;

  v_events := v_events || public._battle_check_end(p_encounter_id);
  perform public._battle_advance_turn(p_encounter_id);
  return jsonb_build_object('events', v_events);
end;
$$;

grant execute on function public.battle_turn_attack(uuid, uuid, integer) to authenticated;

-- Send out / switch Pokémon. Sending out the first one or replacing one
-- that fainted is free (any time); switching out a Pokémon that can still
-- fight is your action for the turn.
create or replace function public.battle_choose_pokemon(p_encounter_id uuid, p_pokemon_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bp public.battle_players;
  v_p public.trainer_pokemon;
  v_prev public.trainer_pokemon;
  v_name text;
  v_is_switch boolean := false;
  v_events jsonb := '[]'::jsonb;
begin
  v_bp := public._battle_lock_for_player(p_encounter_id);

  select * into v_p from public.trainer_pokemon where id = p_pokemon_id;
  if v_p.id is null or v_p.profile_id <> v_bp.profile_id then
    raise exception 'That Pokémon isn''t yours';
  end if;
  if v_p.party_slot is null then
    raise exception 'Only Pokémon in your Team can battle';
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
  if v_is_switch then
    v_bp := public._battle_require_my_turn(p_encounter_id);
  end if;

  update public.battle_players set active_pokemon_id = p_pokemon_id where id = v_bp.id;
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

  if v_is_switch then
    perform public._battle_advance_turn(p_encounter_id);
  else
    -- Their turn may have been skipped while they had nobody out.
    perform public._battle_ensure_turn(p_encounter_id);
  end if;
  return jsonb_build_object('events', v_events);
end;
$$;

-- Use a Bag item on one of your Team Pokémon — your action for the turn.
create or replace function public.battle_use_item(p_encounter_id uuid, p_item_id uuid, p_pokemon_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bp public.battle_players;
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
  v_msg text;
  v_events jsonb := '[]'::jsonb;
begin
  v_bp := public._battle_require_my_turn(p_encounter_id);

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
    raise exception 'You can only use items on Pokémon in your Team';
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
    else format('%s was cured of its %s!', v_name, case v_p.status::text
      when 'poisoned' then 'poison' when 'burned' then 'burn' when 'paralyzed' then 'paralysis'
      when 'asleep' then 'sleep' when 'frozen' then 'freeze' when 'confused' then 'confusion' else v_p.status::text end)
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

  perform public._battle_advance_turn(p_encounter_id);
  return jsonb_build_object('events', v_events);
end;
$$;

-- The old automatic attacks are switched off.
create or replace function public.battle_attack(p_encounter_id uuid, p_move_id smallint, p_target_enemy_id uuid default null)
returns jsonb
language plpgsql
as $$
begin
  raise exception 'Attacks are now entered by hand on your turn (pick a target and type the damage).';
end;
$$;
revoke execute on function public.battle_attack(uuid, smallint, uuid) from public, anon, authenticated;

create or replace function public.admin_enemy_attack(p_encounter_id uuid, p_enemy_id uuid, p_target_pokemon_id uuid default null)
returns jsonb
language plpgsql
as $$
begin
  raise exception 'Enemy attacks are now entered by hand on the enemy''s turn.';
end;
$$;
revoke execute on function public.admin_enemy_attack(uuid, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Game Master actions
-- ---------------------------------------------------------------------------

-- Enter an enemy's roll, or enter/correct a trainer's roll during initiative.
create or replace function public.admin_set_initiative(p_entry_id uuid, p_roll integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.battle_turn_order;
  v_enc public.battle_encounters;
begin
  perform public._require_admin();
  select * into v_entry from public.battle_turn_order where id = p_entry_id;
  if v_entry.id is null then
    raise exception 'Not found';
  end if;
  select * into v_enc from public.battle_encounters where id = v_entry.encounter_id for update;
  if v_enc.status <> 'active' then
    raise exception 'This battle is already over';
  end if;
  select * into v_entry from public.battle_turn_order where id = p_entry_id for update;
  perform public._battle_record_roll(v_entry, p_roll, true);
end;
$$;

grant execute on function public.admin_set_initiative(uuid, integer) to authenticated;

-- An enemy attacks on its turn: the GM picks the target and types the damage (0 = missed).
create or replace function public.admin_enemy_turn_attack(p_encounter_id uuid, p_target_pokemon_id uuid, p_damage integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.battle_encounters;
  v_cur public.battle_turn_order;
  v_e public.battle_enemies;
  v_p public.trainer_pokemon;
  v_name text;
  v_new integer;
  v_events jsonb := '[]'::jsonb;
begin
  perform public._require_admin();
  select * into v_enc from public.battle_encounters where id = p_encounter_id for update;
  if v_enc.id is null or v_enc.mode <> 'auto' then raise exception 'Battle not found'; end if;
  if v_enc.status <> 'active' then raise exception 'This battle is already over'; end if;
  if v_enc.phase <> 'fighting' then raise exception 'Everyone has to roll for initiative first.'; end if;
  if p_damage is null or p_damage < 0 then raise exception 'Damage can''t be negative (type 0 for a miss).'; end if;
  if p_damage > 9999 then raise exception 'At most 9999 damage.'; end if;

  select * into v_cur from public.battle_turn_order where encounter_id = p_encounter_id and position = v_enc.turn_position;
  if v_cur.enemy_id is null then
    raise exception 'It''s not an enemy''s turn — it''s %''s turn.', coalesce(public._turn_entry_name(v_cur), 'someone else');
  end if;
  select * into v_e from public.battle_enemies where id = v_cur.enemy_id;

  if not exists (select 1 from public.battle_players where encounter_id = p_encounter_id and active_pokemon_id = p_target_pokemon_id) then
    raise exception 'That Pokémon isn''t in this battle.';
  end if;
  select * into v_p from public.trainer_pokemon where id = p_target_pokemon_id for update;
  if v_p.is_dead or v_p.status = 'fainted' or v_p.current_hp <= 0 then
    raise exception '% has already fainted.', public._pokemon_label(v_p.id);
  end if;

  v_name := public._pokemon_label(v_p.id);
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
    'missed', p_damage = 0, 'damage', v_p.current_hp - v_new,
    'hp_before', v_p.current_hp, 'hp_after', v_new, 'max_hp', v_p.max_hp, 'fainted', v_new = 0,
    'message', format('%s attacked %s!', v_e.name, v_name),
    'detail', case when p_damage = 0 then format('%s avoided it!', v_name) else format('%s damage!', v_p.current_hp - v_new) end);
  perform public._battle_log(p_encounter_id, 'enemy_attack', 'trainer_pokemon', v_p.id, v_e.id, v_name,
    v_p.current_hp, v_new, null, null, null, null,
    case when p_damage = 0 then format('%s attacked %s but missed.', v_e.name, v_name)
         else format('%s hit %s for %s damage.', v_e.name, v_name, v_p.current_hp - v_new) end);
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

grant execute on function public.admin_enemy_turn_attack(uuid, uuid, integer) to authenticated;

-- Skip whoever's turn it is (someone stepped away, or nothing to do).
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
  select * into v_enc from public.battle_encounters where id = p_encounter_id for update;
  if v_enc.id is null or v_enc.status <> 'active' then raise exception 'This battle is already over'; end if;
  if v_enc.phase <> 'fighting' then raise exception 'Everyone has to roll for initiative first.'; end if;
  select * into v_cur from public.battle_turn_order where encounter_id = p_encounter_id and position = v_enc.turn_position;
  perform public._battle_log(p_encounter_id, 'skip', 'system', null, null, '', 0, 0, v_admin, null, null, null,
    format('The Game Master skipped %s''s turn.', coalesce(public._turn_entry_name(v_cur), '?')));
  perform public._battle_advance_turn(p_encounter_id);
end;
$$;

grant execute on function public.admin_skip_turn(uuid) to authenticated;

-- When the GM's KP edit knocks out the enemy whose turn it is, move on.
create or replace function public.battle_enemy_hp_turn_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.current_hp = 0 and old.current_hp > 0 then
    perform public._battle_ensure_turn(new.encounter_id);
  end if;
  return null;
end;
$$;

drop trigger if exists battle_enemies_turn_check on public.battle_enemies;
create trigger battle_enemies_turn_check
  after update of current_hp on public.battle_enemies
  for each row execute procedure public.battle_enemy_hp_turn_check();

-- KP changed outside the battle engine (Take damage / GM KP panel) while
-- the owner is in a battle: log it, let the battle end if needed, and move
-- the turn on if the trainer can no longer act.
create or replace function public._battle_note_external_hp(
  p_pokemon public.trainer_pokemon,
  p_previous integer,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc uuid;
  v_label text;
begin
  v_enc := public._active_encounter_for(p_pokemon.profile_id);
  if v_enc is null then
    return;
  end if;
  v_label := public._pokemon_label(p_pokemon.id);
  perform public._battle_log(v_enc, 'hp_change', 'trainer_pokemon', p_pokemon.id, null, v_label,
    p_previous, p_pokemon.current_hp, public.my_profile_id(), null, null, null, p_message);
  if p_pokemon.current_hp = 0 and p_previous > 0 then
    perform public._battle_log(v_enc, 'faint', 'trainer_pokemon', p_pokemon.id, null, v_label,
      0, 0, null, null, null, null, format('%s fainted!', v_label));
  end if;
  perform public._battle_check_end(v_enc);
  perform public._battle_ensure_turn(v_enc);
end;
$$;

-- ---------------------------------------------------------------------------
-- Battle state: now with the turn order; no moves or stats any more.
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
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'slot', e.slot, 'name', e.name, 'species_id', e.species_id, 'sprite_url', e.sprite_url,
        'level', e.level, 'current_hp', e.current_hp, 'max_hp', e.max_hp, 'type1', e.type1, 'type2', e.type2,
        'fainted', e.current_hp = 0
      ) order by e.slot)
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
    'order', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'kind', case when t.enemy_id is null then 'player' else 'enemy' end,
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
      ), '[]'::jsonb)
    ));
  end if;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lock down internal helpers.
-- ---------------------------------------------------------------------------
revoke execute on function public._turn_entry_name(public.battle_turn_order) from public, anon, authenticated;
revoke execute on function public._turn_can_act(public.battle_turn_order) from public, anon, authenticated;
revoke execute on function public._battle_advance_turn(uuid) from public, anon, authenticated;
revoke execute on function public._battle_ensure_turn(uuid) from public, anon, authenticated;
revoke execute on function public._battle_initiative_progress(uuid) from public, anon, authenticated;
revoke execute on function public._battle_record_roll(public.battle_turn_order, integer, boolean) from public, anon, authenticated;
revoke execute on function public._battle_require_my_turn(uuid) from public, anon, authenticated;
revoke execute on function public.battle_add_turn_entry() from public, anon, authenticated;
revoke execute on function public.battle_enemy_hp_turn_check() from public, anon, authenticated;
