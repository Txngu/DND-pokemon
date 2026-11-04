-- ============================================================================
-- PokéGear 13.1
-- ============================================================================
-- Run AFTER 0014_pokegear_v13.sql. Safe to run more than once.
--
--   1. Battle XP that no Pokémon can take any more (every Pokémon that fought
--      is at the max level, or gone) is dropped automatically instead of
--      waiting in the trainer's XP window.
--   2. When an enemy trainer's Pokémon faints and the next one comes out,
--      the attack result says so, so the battle screen can show it.
-- ============================================================================

-- Can any Pokémon that fought in this battle still take XP?
create or replace function public._xp_pool_has_taker(p_recipient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.battle_reward_recipients r
    join public.battle_participants bpp on bpp.encounter_id = r.encounter_id
    join public.trainer_pokemon tp on tp.id = bpp.pokemon_id and tp.profile_id = r.profile_id
    where r.id = p_recipient_id
      and not tp.is_dead
      and public.xp_to_next(tp.level) is not null
  );
$$;

-- Drop what's left of a pool when nobody can take it. Returns the XP dropped.
create or replace function public._xp_pool_drop_if_stuck(p_recipient_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.battle_reward_recipients;
  v_left integer;
begin
  select * into v_r from public.battle_reward_recipients where id = p_recipient_id for update;
  if v_r.id is null then return 0; end if;
  v_left := v_r.xp - v_r.xp_allocated - v_r.xp_forfeited;
  if v_left <= 0 or public._xp_pool_has_taker(v_r.id) then
    return 0;
  end if;
  update public.battle_reward_recipients
  set xp_forfeited = xp_forfeited + v_left, xp_claimed_at = now()
  where id = v_r.id;
  perform public._battle_log(v_r.encounter_id, 'xp_dropped', 'system', null, null, '', 0, 0, null, null, null, null,
    format('%s XP for %s was dropped: none of the Pokémon that fought can gain XP any more (max level).',
           v_left, (select username from public.profiles where id = v_r.profile_id)));
  return v_left;
end;
$$;

-- New rewards: checked as soon as they're handed out.
create or replace function public.battle_reward_recipient_xp_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.xp > 0 and new.xp_claimed_at is null then
    perform public._xp_pool_drop_if_stuck(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists battle_reward_recipients_xp_check on public.battle_reward_recipients;
create trigger battle_reward_recipients_xp_check
  after insert on public.battle_reward_recipients
  for each row execute procedure public.battle_reward_recipient_xp_check();

-- After each allocation (the last Pokémon may just have reached the max level).
create or replace function public.allocate_battle_xp(p_recipient_id uuid, p_pokemon_id uuid, p_amount integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.battle_reward_recipients;
  v_p public.trainer_pokemon;
  v_remaining integer;
  v_res jsonb;
  v_used integer;
  v_dropped integer;
begin
  select * into v_r from public.battle_reward_recipients where id = p_recipient_id for update;
  if v_r.id is null or not public.is_own_profile(v_r.profile_id) then
    raise exception 'Reward not found';
  end if;
  v_remaining := v_r.xp - v_r.xp_allocated - v_r.xp_forfeited;
  if v_remaining <= 0 then
    raise exception 'All XP from this reward has already been given out.';
  end if;
  if p_amount is null or p_amount < 1 then
    raise exception 'Give at least 1 XP.';
  end if;
  if p_amount > v_remaining then
    raise exception 'Only % XP left in this reward.', v_remaining;
  end if;

  select * into v_p from public.trainer_pokemon where id = p_pokemon_id;
  if v_p.id is null or v_p.profile_id <> v_r.profile_id then
    raise exception 'That Pokémon isn''t yours.';
  end if;
  if not exists (
    select 1 from public.battle_participants
    where encounter_id = v_r.encounter_id and pokemon_id = p_pokemon_id
  ) then
    raise exception '% didn''t fight in this battle, so it can''t get this XP.', public._pokemon_label(p_pokemon_id);
  end if;

  v_res := public._add_pokemon_xp(p_pokemon_id, p_amount);
  v_used := (v_res ->> 'used')::integer;

  insert into public.battle_xp_allocations
    (recipient_id, encounter_id, profile_id, pokemon_id, pokemon_name, amount, level_before, level_after, evolved_to)
  values (v_r.id, v_r.encounter_id, v_r.profile_id, p_pokemon_id, v_res ->> 'name', v_used,
          (v_res ->> 'level_before')::integer, (v_res ->> 'level_after')::integer, v_res ->> 'evolved_to');

  update public.battle_reward_recipients
  set xp_allocated = xp_allocated + v_used,
      xp_pokemon_id = p_pokemon_id,
      xp_pokemon_name = v_res ->> 'name',
      level_before = coalesce(level_before, (v_res ->> 'level_before')::integer),
      level_after = (v_res ->> 'level_after')::integer,
      xp_claimed_at = case when xp_allocated + v_used + xp_forfeited >= xp then now() else null end
  where id = v_r.id;

  v_dropped := public._xp_pool_drop_if_stuck(v_r.id);

  return v_res || jsonb_build_object('remaining', v_remaining - v_used - v_dropped, 'dropped', v_dropped);
end;
$$;

grant execute on function public.allocate_battle_xp(uuid, uuid, integer) to authenticated;

-- Pools that are already stuck right now are dropped once.
do $$
declare
  r record;
begin
  for r in
    select id from public.battle_reward_recipients
    where xp - xp_allocated - xp_forfeited > 0
  loop
    perform public._xp_pool_drop_if_stuck(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Attack result now includes the enemy trainer sending out their next Pokémon.
-- ---------------------------------------------------------------------------
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
  v_switch jsonb;
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
    -- A trainer's Pokémon fainted: their next one has just been sent out
    -- (by the trigger). Tell the battle screen so it can show it coming in.
    if v_e.enemy_trainer_id is not null then
      select jsonb_build_object(
        'type', 'enemy_switch', 'trainer_id', t.id, 'trainer_name', t.name,
        'enemy_id', ne.id, 'enemy_name', ne.name, 'species_id', ne.species_id,
        'message', format('%s sends out %s!', t.name, ne.name))
      into v_switch
      from public.battle_enemy_trainers t
      join public.battle_enemies ne on ne.id = t.active_enemy_id
      where t.id = v_e.enemy_trainer_id;
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


revoke execute on function public._xp_pool_has_taker(uuid) from public, anon, authenticated;
revoke execute on function public._xp_pool_drop_if_stuck(uuid) from public, anon, authenticated;
revoke execute on function public.battle_reward_recipient_xp_check() from public, anon, authenticated;
