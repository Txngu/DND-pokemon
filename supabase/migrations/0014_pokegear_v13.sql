-- ============================================================================
-- PokéGear Version 13 — Encounter Manager, catching, per-level XP
-- ============================================================================
-- Run AFTER 0013_pokegear_turns.sql. Safe to run more than once.
-- (No temporary tables and no ALTER FUNCTION ... SET: it runs in the
-- Supabase SQL editor as one script.)
--
--   1. XP per level: every level starts at 0 XP; Lv1 needs 10, Lv2 25, Lv3 45,
--      Lv4 70, Lv5 100, Lv6 140, Lv7 200 to level up. No carry-over: XP is
--      only ever spent up to the amount a Pokémon needs, so nothing is lost.
--      All Pokémon's XP is reset to 0 once (levels are kept).
--   2. Battle XP is a pool per trainer, split by the trainer over the
--      Pokémon that actually fought in that battle, until it is all used.
--   3. The GM's library: reusable Pokémon, trainers and teams.
--   4. Encounter templates (saved/story encounters) and quick encounters,
--      both started through one function. No limit of 6 enemy Pokémon.
--   5. Enemy trainers in battle: one active Pokémon each, one initiative
--      roll each; the next Pokémon comes out when the active one faints.
--   6. Catching: allowed per encounter; a trainer throws a Poké Ball on their
--      turn at a wild Pokémon; the GM decides Caught / Not caught.
-- ============================================================================

-- ===========================================================================
-- 1. XP per level
-- ===========================================================================

-- XP a Pokémon at p_level needs to reach the next level (null at the max).
-- game_config.xp_curve keeps its numbers: curve[level + 1] is the amount
-- needed at `level` ("2": 10 means Lv1 needs 10).
create or replace function public.xp_to_next(p_level integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_level >= public.get_config_int('max_level', 8) then null
    else coalesce(
      (public.get_xp_curve() ->> (greatest(p_level, 1) + 1)::text)::integer,
      (select max((v)::integer) from jsonb_each_text(public.get_xp_curve()) as e(k, v)),
      10
    )
  end;
$$;

grant execute on function public.xp_to_next(integer) to authenticated;

-- Under the per-level model every level starts at 0 XP. (Kept for callers
-- such as create_pokemon, which stores xp_for_level(level) for a new Pokémon.)
create or replace function public.xp_for_level(p_level integer)
returns integer
language sql
immutable
as $$
  select 0;
$$;

-- XP always stays between 0 and (needed − 1); 0 at the max level.
create or replace function public.enforce_xp_floor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_need integer := public.xp_to_next(new.level);
begin
  if new.xp is null or new.xp < 0 then
    new.xp := 0;
  end if;
  if v_need is null then
    new.xp := 0;
  elsif new.xp >= v_need then
    new.xp := v_need - 1;
  end if;
  return new;
end;
$$;

-- One-time switch: everyone's XP back to 0 (levels kept).
do $$
begin
  if exists (select 1 from public.game_config where key = 'xp_model' and value #>> '{}' = 'per_level') then
    return;
  end if;
  alter table public.trainer_pokemon disable trigger trainer_pokemon_dead_immutable;
  update public.trainer_pokemon set xp = 0 where xp <> 0;
  alter table public.trainer_pokemon enable trigger trainer_pokemon_dead_immutable;

  insert into public.game_config (key, value, description)
  values ('xp_model', '"per_level"', 'trainer_pokemon.xp is the XP collected toward the NEXT level (PokéGear 13). Do not change.')
  on conflict (key) do update set value = excluded.value, description = excluded.description;
end $$;

update public.game_config
set description = 'XP needed to level up (PokéGear 13): "2" is what a Lv1 Pokémon needs, "3" what a Lv2 needs, … Every level starts at 0 XP.'
where key = 'xp_curve';

-- The one XP engine. Spends at most what the Pokémon needs for its next
-- level; reaching it = level +1, XP back to 0, +max KP, level evolution
-- check. Returns {"used", "level_before", "level_after", "xp", "needed", "leveled_up", "evolved_to"}.
create or replace function public._add_pokemon_xp(p_pokemon_id uuid, p_amount integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.trainer_pokemon;
  v_need integer;
  v_used integer;
  v_hp integer := public.get_config_int('level_up_max_hp', 5);
  v_label text;
  v_evo smallint;
  v_after public.trainer_pokemon;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'XP amount must be positive';
  end if;
  select * into v_p from public.trainer_pokemon where id = p_pokemon_id for update;
  if v_p.id is null then raise exception 'Pokémon not found'; end if;
  if v_p.is_dead then raise exception 'This Pokémon has died and cannot gain XP'; end if;

  v_label := public._pokemon_label(p_pokemon_id);
  v_need := public.xp_to_next(v_p.level);
  if v_need is null then
    raise exception '% is already at the maximum level', v_label;
  end if;
  v_used := least(p_amount, greatest(v_need - v_p.xp, 1));

  perform set_config('pokegear.bypass_pokemon_guard', 'on', true);
  if v_p.xp + v_used >= v_need then
    update public.trainer_pokemon
    set level = level + 1,
        xp = 0,
        max_hp = max_hp + v_hp,
        current_hp = case when status = 'fainted' or current_hp <= 0 then current_hp else current_hp + v_hp end
    where id = p_pokemon_id;

    insert into public.notifications (profile_id, kind, title, body)
    values (v_p.profile_id, 'level_up', 'Level up!', format('%s reached level %s!', v_label, v_p.level + 1));

    select er.to_species_id into v_evo
    from public.evolution_rules er
    where er.method = 'level' and er.from_species_id = v_p.species_id and er.level_required <= v_p.level + 1
    order by er.level_required desc
    limit 1;
    if v_evo is not null then
      perform public.apply_evolution(p_pokemon_id, v_evo);
    end if;
  else
    update public.trainer_pokemon set xp = xp + v_used where id = p_pokemon_id;
  end if;

  select * into v_after from public.trainer_pokemon where id = p_pokemon_id;
  return jsonb_build_object(
    'pokemon_id', p_pokemon_id,
    'name', public._pokemon_label(p_pokemon_id),
    'used', v_used,
    'level_before', v_p.level,
    'level_after', v_after.level,
    'leveled_up', v_after.level > v_p.level,
    'xp', v_after.xp,
    'needed', public.xp_to_next(v_after.level),
    'species_before', v_p.species_id,
    'species_after', v_after.species_id,
    'evolved_to', case when v_after.species_id <> v_p.species_id then (select name from public.species where id = v_after.species_id) end
  );
end;
$$;

-- Kept for the GM's direct XP tool (grant_pokemon_xp): same rules.
create or replace function public._apply_pokemon_xp(p_pokemon_id uuid, p_amount integer, p_notify_xp boolean)
returns public.trainer_pokemon
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res jsonb;
  v_row public.trainer_pokemon;
begin
  v_res := public._add_pokemon_xp(p_pokemon_id, p_amount);
  select * into v_row from public.trainer_pokemon where id = p_pokemon_id;
  if p_notify_xp and not (v_res ->> 'leveled_up')::boolean then
    insert into public.notifications (profile_id, kind, title, body)
    values (v_row.profile_id, 'xp_gained', 'XP gained', format('%s gained %s XP.', v_res ->> 'name', v_res ->> 'used'));
  end if;
  return v_row;
end;
$$;

-- ===========================================================================
-- 2. Battle XP pools
-- ===========================================================================
alter table public.battle_reward_recipients
  add column if not exists xp_allocated  integer not null default 0,
  add column if not exists xp_forfeited  integer not null default 0;

-- Rewards already given to one Pokémon count as fully used.
update public.battle_reward_recipients
set xp_allocated = xp
where xp_claimed_at is not null and xp_allocated = 0 and xp_forfeited = 0;

alter table public.battle_reward_recipients drop constraint if exists battle_reward_recipients_xp_pool_check;
alter table public.battle_reward_recipients add constraint battle_reward_recipients_xp_pool_check
  check (xp_allocated >= 0 and xp_forfeited >= 0 and xp_allocated + xp_forfeited <= xp);

create table if not exists public.battle_xp_allocations (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references public.battle_reward_recipients (id) on delete cascade,
  encounter_id  uuid not null references public.battle_encounters (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  pokemon_id    uuid references public.trainer_pokemon (id) on delete set null,
  pokemon_name  text not null,
  amount        integer not null check (amount > 0),
  level_before  integer not null,
  level_after   integer not null,
  evolved_to    text,
  created_at    timestamptz not null default clock_timestamp()
);

create index if not exists battle_xp_allocations_recipient_idx on public.battle_xp_allocations (recipient_id, created_at);

alter table public.battle_xp_allocations enable row level security;
drop policy if exists "battle_xp_allocations_select" on public.battle_xp_allocations;
create policy "battle_xp_allocations_select" on public.battle_xp_allocations for select to authenticated
  using (public.is_own_profile(profile_id) or public.is_admin());

-- A trainer gives part of their battle XP to one Pokémon that fought in
-- that battle. Locked, validated and recorded in one step; spends at most
-- what that Pokémon needs for its next level — the rest stays in the pool.
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

  return v_res || jsonb_build_object('remaining', v_remaining - v_used);
end;
$$;

grant execute on function public.allocate_battle_xp(uuid, uuid, integer) to authenticated;

-- Game Master: close a pool that can't be used up (e.g. every Pokémon that
-- fought is at the max level). What's left is recorded as forfeited.
create or replace function public.admin_close_xp_pool(p_recipient_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._require_admin();
  v_r public.battle_reward_recipients;
  v_left integer;
begin
  select * into v_r from public.battle_reward_recipients where id = p_recipient_id for update;
  if v_r.id is null then raise exception 'Reward not found'; end if;
  v_left := v_r.xp - v_r.xp_allocated - v_r.xp_forfeited;
  if v_left <= 0 then raise exception 'This reward has no XP left.'; end if;
  update public.battle_reward_recipients
  set xp_forfeited = xp_forfeited + v_left, xp_claimed_at = now()
  where id = v_r.id;
  perform public._battle_log(v_r.encounter_id, 'xp_closed', 'system', null, null, '', 0, 0, v_admin, null, null, null,
    format('The Game Master closed %s''s XP reward (%s XP unused).', (select username from public.profiles where id = v_r.profile_id), v_left));
  return v_left;
end;
$$;

grant execute on function public.admin_close_xp_pool(uuid) to authenticated;

-- Every open XP pool of the caller, with the Pokémon that may receive it.
create or replace function public.get_my_xp_pools()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'recipient_id', r.id,
    'encounter_id', r.encounter_id,
    'encounter_name', e.name,
    'total', r.xp,
    'allocated', r.xp_allocated,
    'remaining', r.xp - r.xp_allocated - r.xp_forfeited,
    'allocations', coalesce((
      select jsonb_agg(jsonb_build_object('pokemon_name', a.pokemon_name, 'amount', a.amount,
        'level_before', a.level_before, 'level_after', a.level_after, 'evolved_to', a.evolved_to) order by a.created_at)
      from public.battle_xp_allocations a where a.recipient_id = r.id
    ), '[]'::jsonb),
    'pokemon', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tp.id, 'name', coalesce(tp.nickname, s.name), 'species_id', tp.species_id, 'is_shiny', tp.is_shiny,
        'level', tp.level, 'xp', tp.xp, 'needed', public.xp_to_next(tp.level), 'is_dead', tp.is_dead
      ) order by tp.party_slot nulls last, tp.level desc)
      from public.trainer_pokemon tp join public.species s on s.id = tp.species_id
      where tp.profile_id = r.profile_id
        and tp.id in (select bpp.pokemon_id from public.battle_participants bpp where bpp.encounter_id = r.encounter_id)
    ), '[]'::jsonb)
  ) order by r.created_at), '[]'::jsonb)
  from public.battle_reward_recipients r
  join public.battle_encounters e on e.id = r.encounter_id
  where r.profile_id = public.my_profile_id()
    and r.xp - r.xp_allocated - r.xp_forfeited > 0;
$$;

grant execute on function public.get_my_xp_pools() to authenticated;

-- The old "all XP to one Pokémon" claim is replaced by allocate_battle_xp.
create or replace function public.claim_battle_xp(p_recipient_id uuid, p_pokemon_id uuid)
returns jsonb
language plpgsql
as $$
begin
  raise exception 'Battle XP is now split between the Pokémon that fought — please update the app.';
end;
$$;
revoke execute on function public.claim_battle_xp(uuid, uuid) from public, anon, authenticated;

-- Same reward function as before; only the notification text changed
-- ("share the XP between the Pokémon that fought").
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
        v_body := v_body || ' Share the XP between the Pokémon that fought.';
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


-- ===========================================================================
-- 3. The Game Master's library: Pokémon, trainers, teams
-- ===========================================================================
create table if not exists public.gm_trainers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  description  text,
  species_id   smallint references public.species (id),   -- optional picture (a Pokémon sprite)
  sprite_url   text,                                       -- or an image link
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.gm_pokemon (
  id           uuid primary key default gen_random_uuid(),
  species_id   smallint references public.species (id),
  name         text not null check (char_length(btrim(name)) between 1 and 40),
  level        integer not null default 1 check (level >= 1),
  max_hp       integer not null check (max_hp between 1 and 9999),
  current_hp   integer not null check (current_hp >= 0),
  status       public.pokemon_status not null default 'healthy',
  trainer_id   uuid references public.gm_trainers (id) on delete set null,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint gm_pokemon_hp_range check (current_hp <= max_hp)
);

create table if not exists public.gm_teams (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  description  text,
  trainer_id   uuid references public.gm_trainers (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.gm_team_members (
  team_id        uuid not null references public.gm_teams (id) on delete cascade,
  gm_pokemon_id  uuid not null references public.gm_pokemon (id) on delete cascade,
  position       integer not null check (position >= 1),
  primary key (team_id, gm_pokemon_id)
);

create index if not exists gm_pokemon_trainer_idx on public.gm_pokemon (trainer_id);
create index if not exists gm_teams_trainer_idx on public.gm_teams (trainer_id);
create index if not exists gm_team_members_pokemon_idx on public.gm_team_members (gm_pokemon_id);

-- Levels follow the campaign's max level; KP and names are tidied.
create or replace function public.gm_pokemon_validate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max integer := public.get_config_int('max_level', 8);
begin
  if new.level > v_max then
    raise exception 'Level must be between 1 and %.', v_max;
  end if;
  new.name := btrim(new.name);
  if new.current_hp = 0 then
    new.status := 'fainted';
  elsif new.status = 'fainted' then
    new.status := 'healthy';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists gm_pokemon_validate on public.gm_pokemon;
create trigger gm_pokemon_validate before insert or update on public.gm_pokemon
  for each row execute procedure public.gm_pokemon_validate();

create or replace function public.gm_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists gm_trainers_touch on public.gm_trainers;
create trigger gm_trainers_touch before update on public.gm_trainers for each row execute procedure public.gm_touch_updated_at();
drop trigger if exists gm_teams_touch on public.gm_teams;
create trigger gm_teams_touch before update on public.gm_teams for each row execute procedure public.gm_touch_updated_at();

-- ===========================================================================
-- 4. Encounter templates (saved / story encounters)
-- ===========================================================================
create table if not exists public.encounter_templates (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (char_length(btrim(name)) between 1 and 80),
  description        text,
  kind               text not null default 'wild',
  catching_allowed   boolean not null default false,
  default_player_ids uuid[] not null default '{}',
  created_by         uuid references public.profiles (id) on delete set null,
  times_started      integer not null default 0,
  last_started_at    timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create or replace function public.is_valid_encounter_kind(p_kind text)
returns boolean
language sql
immutable
as $$
  select p_kind in ('wild', 'trainer', 'gym', 'rival', 'boss', 'arena', 'story', 'team', 'custom');
$$;

alter table public.encounter_templates drop constraint if exists encounter_templates_kind_check;
alter table public.encounter_templates add constraint encounter_templates_kind_check check (public.is_valid_encounter_kind(kind));

-- What the encounter contains, in order:
--   trainer → a trainer with one of their teams (team_id; empty = their first team, or their Pokémon)
--   team    → a team (its trainer fights with it; a team without a trainer = wild Pokémon)
--   pokemon → one Pokémon from the library, fighting as a wild Pokémon
--   wild    → quick wild Pokémon typed in place (species/name/level/KP) × quantity
create table if not exists public.encounter_template_entries (
  id             uuid primary key default gen_random_uuid(),
  template_id    uuid not null references public.encounter_templates (id) on delete cascade,
  position       integer not null,
  entry_kind     text not null check (entry_kind in ('trainer', 'team', 'pokemon', 'wild')),
  trainer_id     uuid references public.gm_trainers (id) on delete cascade,
  team_id        uuid references public.gm_teams (id) on delete cascade,
  gm_pokemon_id  uuid references public.gm_pokemon (id) on delete cascade,
  species_id     smallint references public.species (id),
  name           text,
  level          integer check (level is null or level >= 1),
  max_hp         integer check (max_hp is null or max_hp between 1 and 9999),
  quantity       integer not null default 1 check (quantity between 1 and 50)
);

create index if not exists encounter_template_entries_template_idx on public.encounter_template_entries (template_id, position);

drop trigger if exists encounter_templates_touch on public.encounter_templates;
create trigger encounter_templates_touch before update on public.encounter_templates for each row execute procedure public.gm_touch_updated_at();

-- Game Master only: players never see the GM's preparation.
do $$
declare
  t text;
begin
  foreach t in array array['gm_trainers', 'gm_pokemon', 'gm_teams', 'gm_team_members', 'encounter_templates', 'encounter_template_entries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
  end loop;
end $$;

-- Battle instances remember where they came from and their settings.
alter table public.battle_encounters
  add column if not exists template_id       uuid references public.encounter_templates (id) on delete set null,
  add column if not exists kind              text not null default 'wild',
  add column if not exists catching_allowed  boolean not null default false;

alter table public.battle_encounters drop constraint if exists battle_encounters_kind_check;
alter table public.battle_encounters add constraint battle_encounters_kind_check check (public.is_valid_encounter_kind(kind));

-- No more limit of 6 enemy Pokémon per encounter.
alter table public.battle_enemies drop constraint if exists battle_enemies_slot_check;
alter table public.battle_enemies add constraint battle_enemies_slot_check check (slot >= 1);

-- Enemy trainers taking part in one battle (copies, so editing the library
-- or the template never changes a running/finished battle).
create table if not exists public.battle_enemy_trainers (
  id               uuid primary key default gen_random_uuid(),
  encounter_id     uuid not null references public.battle_encounters (id) on delete cascade,
  gm_trainer_id    uuid references public.gm_trainers (id) on delete set null,
  name             text not null,
  species_id       smallint references public.species (id),
  sprite_url       text,
  position         integer not null,
  active_enemy_id  uuid,
  created_at       timestamptz not null default clock_timestamp()
);

create index if not exists battle_enemy_trainers_encounter_idx on public.battle_enemy_trainers (encounter_id, position);

alter table public.battle_enemies
  add column if not exists enemy_trainer_id   uuid references public.battle_enemy_trainers (id) on delete cascade,
  add column if not exists gm_pokemon_id      uuid references public.gm_pokemon (id) on delete set null,
  add column if not exists team_position      integer,
  add column if not exists caught_by          uuid references public.profiles (id) on delete set null,
  add column if not exists caught_at          timestamptz,
  add column if not exists caught_pokemon_id  uuid references public.trainer_pokemon (id) on delete set null;

alter table public.battle_enemy_trainers drop constraint if exists battle_enemy_trainers_active_fk;
alter table public.battle_enemy_trainers add constraint battle_enemy_trainers_active_fk
  foreign key (active_enemy_id) references public.battle_enemies (id) on delete set null;

alter table public.battle_enemy_trainers enable row level security;
drop policy if exists "battle_enemy_trainers_select" on public.battle_enemy_trainers;
create policy "battle_enemy_trainers_select" on public.battle_enemy_trainers for select to authenticated
  using (public.is_admin() or public.is_battle_member(encounter_id));

-- Where a trainer's Pokémon came from (caught in which battle).
alter table public.trainer_pokemon
  add column if not exists origin               text,
  add column if not exists origin_encounter_id  uuid references public.battle_encounters (id) on delete set null;

-- Turn order: an enemy trainer has one place in it (not each of its Pokémon).
alter table public.battle_turn_order
  add column if not exists enemy_trainer_id uuid references public.battle_enemy_trainers (id) on delete cascade;
alter table public.battle_turn_order drop constraint if exists battle_turn_order_one_actor;
alter table public.battle_turn_order add constraint battle_turn_order_one_actor
  check (num_nonnulls(battle_player_id, enemy_id, enemy_trainer_id) = 1);
create unique index if not exists battle_turn_order_trainer_uniq on public.battle_turn_order (enemy_trainer_id) where enemy_trainer_id is not null;

do $$
declare
  t text;
begin
  foreach t in array array['battle_enemy_trainers', 'battle_reward_recipients'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Turn entries: players, wild enemies, enemy trainers (not trainers' Pokémon).
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
    elsif tg_table_name = 'battle_enemy_trainers' then
      insert into public.battle_turn_order (encounter_id, enemy_trainer_id) values (new.encounter_id, new.id)
      on conflict do nothing;
    elsif new.enemy_trainer_id is null then
      insert into public.battle_turn_order (encounter_id, enemy_id) values (new.encounter_id, new.id)
      on conflict do nothing;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists battle_enemy_trainers_add_turn_entry on public.battle_enemy_trainers;
create trigger battle_enemy_trainers_add_turn_entry
  after insert on public.battle_enemy_trainers
  for each row execute procedure public.battle_add_turn_entry();

-- ---------------------------------------------------------------------------
-- Building the enemy side of a battle from a list of entries.
-- Entries (jsonb array), in order:
--   {"kind":"trainer","trainer_id":…,"team_id":…?}
--   {"kind":"team","team_id":…}
--   {"kind":"pokemon","gm_pokemon_id":…}
--   {"kind":"wild","species_id":…?,"name":…?,"level":…,"max_hp":…,"quantity":…}
-- ---------------------------------------------------------------------------
create or replace function public._battle_add_enemy(
  p_encounter_id uuid,
  p_trainer_row uuid,
  p_team_position integer,
  p_gm_pokemon_id uuid,
  p_species_id smallint,
  p_name text,
  p_level integer,
  p_max_hp integer,
  p_current_hp integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_species public.species;
  v_slot integer;
  v_id uuid;
  v_name text;
  v_max integer := public.get_config_int('max_level', 8);
begin
  if p_species_id is not null then
    select * into v_species from public.species where id = p_species_id;
    if v_species.id is null then raise exception 'Unknown Pokémon species'; end if;
  end if;
  v_name := coalesce(nullif(btrim(coalesce(p_name, '')), ''), v_species.name);
  if v_name is null then raise exception 'Every enemy Pokémon needs a species or a name.'; end if;
  if p_level is null or p_level < 1 or p_level > v_max then
    raise exception '%: level must be between 1 and %.', v_name, v_max;
  end if;
  if p_max_hp is null or p_max_hp < 1 or p_max_hp > 9999 then
    raise exception '%: max KP must be between 1 and 9999.', v_name;
  end if;

  select coalesce(max(slot), 0) + 1 into v_slot from public.battle_enemies where encounter_id = p_encounter_id;
  if v_slot > 200 then raise exception 'An encounter can have at most 200 enemy Pokémon.'; end if;

  insert into public.battle_enemies
    (encounter_id, slot, name, species_id, level, current_hp, max_hp,
     attack, defense, sp_attack, sp_defense, speed, type1, type2, move_ids,
     enemy_trainer_id, gm_pokemon_id, team_position, fainted_at)
  values (
    p_encounter_id, v_slot, v_name, v_species.id, p_level,
    greatest(0, least(coalesce(p_current_hp, p_max_hp), p_max_hp)), p_max_hp,
    1, 1, 1, 1, 1, coalesce(v_species.type1, 'normal'), v_species.type2, '{}',
    p_trainer_row, p_gm_pokemon_id, p_team_position,
    case when coalesce(p_current_hp, p_max_hp) <= 0 then now() end
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public._battle_build_enemies(p_encounter_id uuid, p_entries jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e jsonb;
  v_kind text;
  v_trainer public.gm_trainers;
  v_team public.gm_teams;
  v_gp public.gm_pokemon;
  v_row uuid;
  v_pos integer := 0;
  v_tpos integer;
  v_qty integer;
  v_count integer := 0;
  r record;
  i integer;
begin
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'Add at least one trainer, team or Pokémon to the encounter.';
  end if;

  for v_e in select * from jsonb_array_elements(p_entries) loop
    v_kind := v_e ->> 'kind';
    v_trainer := null; v_team := null; v_gp := null;

    if v_kind in ('trainer', 'team') then
      if v_kind = 'trainer' then
        select * into v_trainer from public.gm_trainers where id = nullif(v_e ->> 'trainer_id', '')::uuid;
        if v_trainer.id is null then raise exception 'A trainer in this encounter no longer exists.'; end if;
        if nullif(v_e ->> 'team_id', '') is not null then
          select * into v_team from public.gm_teams where id = (v_e ->> 'team_id')::uuid;
          if v_team.id is null then raise exception 'A team in this encounter no longer exists.'; end if;
        else
          select * into v_team from public.gm_teams where trainer_id = v_trainer.id order by created_at limit 1;
        end if;
      else
        select * into v_team from public.gm_teams where id = nullif(v_e ->> 'team_id', '')::uuid;
        if v_team.id is null then raise exception 'A team in this encounter no longer exists.'; end if;
        if v_team.trainer_id is not null then
          select * into v_trainer from public.gm_trainers where id = v_team.trainer_id;
        end if;
      end if;

      if v_trainer.id is not null then
        v_pos := v_pos + 1;
        insert into public.battle_enemy_trainers (encounter_id, gm_trainer_id, name, species_id, sprite_url, position)
        values (p_encounter_id, v_trainer.id, v_trainer.name, v_trainer.species_id, v_trainer.sprite_url, v_pos)
        returning id into v_row;
      else
        v_row := null;
      end if;

      v_tpos := 0;
      for r in
        select gp.* from public.gm_pokemon gp
        where (v_team.id is not null and gp.id in (select gm_pokemon_id from public.gm_team_members where team_id = v_team.id))
           or (v_team.id is null and gp.trainer_id = v_trainer.id)
        order by coalesce((select m.position from public.gm_team_members m where m.team_id = v_team.id and m.gm_pokemon_id = gp.id), 0), gp.created_at
      loop
        v_tpos := v_tpos + 1;
        perform public._battle_add_enemy(p_encounter_id, v_row, v_tpos, r.id, r.species_id, r.name, r.level, r.max_hp, r.current_hp);
        v_count := v_count + 1;
      end loop;
      if v_tpos = 0 then
        raise exception '% has no Pokémon.', coalesce(v_trainer.name, v_team.name);
      end if;
      if v_row is not null then
        update public.battle_enemy_trainers
        set active_enemy_id = (
          select id from public.battle_enemies where enemy_trainer_id = v_row and current_hp > 0 order by team_position limit 1
        )
        where id = v_row;
      end if;

    elsif v_kind = 'pokemon' then
      select * into v_gp from public.gm_pokemon where id = nullif(v_e ->> 'gm_pokemon_id', '')::uuid;
      if v_gp.id is null then raise exception 'A Pokémon in this encounter no longer exists.'; end if;
      perform public._battle_add_enemy(p_encounter_id, null, null, v_gp.id, v_gp.species_id, v_gp.name, v_gp.level, v_gp.max_hp, v_gp.current_hp);
      v_count := v_count + 1;

    elsif v_kind = 'wild' then
      v_qty := coalesce(nullif(v_e ->> 'quantity', '')::integer, 1);
      if v_qty < 1 or v_qty > 50 then raise exception 'Quantity must be between 1 and 50.'; end if;
      for i in 1 .. v_qty loop
        perform public._battle_add_enemy(
          p_encounter_id, null, null, null,
          nullif(v_e ->> 'species_id', '')::smallint,
          nullif(v_e ->> 'name', ''),
          coalesce(nullif(v_e ->> 'level', '')::integer, 1),
          nullif(v_e ->> 'max_hp', '')::integer,
          nullif(v_e ->> 'max_hp', '')::integer);
      end loop;
      v_count := v_count + v_qty;
    else
      raise exception 'Unknown encounter entry: %', coalesce(v_kind, '?');
    end if;
  end loop;

  return v_count;
end;
$$;

-- Validates a list of entries without starting anything (used when saving).
create or replace function public._encounter_entries_check(p_entries jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e jsonb;
  v_kind text;
  v_max integer := public.get_config_int('max_level', 8);
begin
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'Add at least one trainer, team or Pokémon to the encounter.';
  end if;
  for v_e in select * from jsonb_array_elements(p_entries) loop
    v_kind := v_e ->> 'kind';
    if v_kind = 'trainer' then
      if not exists (select 1 from public.gm_trainers where id = nullif(v_e ->> 'trainer_id', '')::uuid) then
        raise exception 'Choose a trainer.';
      end if;
      if nullif(v_e ->> 'team_id', '') is not null and not exists (select 1 from public.gm_teams where id = (v_e ->> 'team_id')::uuid) then
        raise exception 'A chosen team no longer exists.';
      end if;
    elsif v_kind = 'team' then
      if not exists (select 1 from public.gm_teams where id = nullif(v_e ->> 'team_id', '')::uuid) then
        raise exception 'Choose a team.';
      end if;
    elsif v_kind = 'pokemon' then
      if not exists (select 1 from public.gm_pokemon where id = nullif(v_e ->> 'gm_pokemon_id', '')::uuid) then
        raise exception 'A chosen Pokémon no longer exists.';
      end if;
    elsif v_kind = 'wild' then
      if nullif(v_e ->> 'species_id', '') is null and nullif(btrim(coalesce(v_e ->> 'name', '')), '') is null then
        raise exception 'Every wild Pokémon needs a species or a name.';
      end if;
      if coalesce(nullif(v_e ->> 'level', '')::integer, 0) not between 1 and v_max then
        raise exception 'Wild Pokémon level must be between 1 and %.', v_max;
      end if;
      if coalesce(nullif(v_e ->> 'max_hp', '')::integer, 0) not between 1 and 9999 then
        raise exception 'Wild Pokémon max KP must be between 1 and 9999.';
      end if;
      if coalesce(nullif(v_e ->> 'quantity', '')::integer, 1) not between 1 and 50 then
        raise exception 'Quantity must be between 1 and 50.';
      end if;
    else
      raise exception 'Unknown encounter entry: %', coalesce(v_kind, '?');
    end if;
  end loop;
end;
$$;

-- Save (create or update) a template with its entries.
create or replace function public.admin_save_encounter_template(
  p_template_id uuid,
  p_name text,
  p_description text,
  p_kind text,
  p_catching_allowed boolean,
  p_default_player_ids uuid[],
  p_entries jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._require_admin();
  v_id uuid := p_template_id;
  v_e jsonb;
  v_pos integer := 0;
begin
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'Give the encounter a name.';
  end if;
  if not public.is_valid_encounter_kind(coalesce(p_kind, '')) then
    raise exception 'Unknown encounter type';
  end if;
  perform public._encounter_entries_check(p_entries);

  if v_id is null then
    insert into public.encounter_templates (name, description, kind, catching_allowed, default_player_ids, created_by)
    values (btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), p_kind, coalesce(p_catching_allowed, false),
            coalesce(p_default_player_ids, '{}'), v_admin)
    returning id into v_id;
  else
    update public.encounter_templates
    set name = btrim(p_name), description = nullif(btrim(coalesce(p_description, '')), ''), kind = p_kind,
        catching_allowed = coalesce(p_catching_allowed, false), default_player_ids = coalesce(p_default_player_ids, '{}')
    where id = v_id;
    if not found then raise exception 'Saved encounter not found'; end if;
    delete from public.encounter_template_entries where template_id = v_id;
  end if;

  for v_e in select * from jsonb_array_elements(p_entries) loop
    v_pos := v_pos + 1;
    insert into public.encounter_template_entries
      (template_id, position, entry_kind, trainer_id, team_id, gm_pokemon_id, species_id, name, level, max_hp, quantity)
    values (
      v_id, v_pos, v_e ->> 'kind',
      nullif(v_e ->> 'trainer_id', '')::uuid, nullif(v_e ->> 'team_id', '')::uuid, nullif(v_e ->> 'gm_pokemon_id', '')::uuid,
      nullif(v_e ->> 'species_id', '')::smallint, nullif(btrim(coalesce(v_e ->> 'name', '')), ''),
      nullif(v_e ->> 'level', '')::integer, nullif(v_e ->> 'max_hp', '')::integer,
      coalesce(nullif(v_e ->> 'quantity', '')::integer, 1)
    );
  end loop;
  return v_id;
end;
$$;

grant execute on function public.admin_save_encounter_template(uuid, text, text, text, boolean, uuid[], jsonb) to authenticated;

create or replace function public._template_entries_json(p_template_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'kind', e.entry_kind, 'trainer_id', e.trainer_id, 'team_id', e.team_id, 'gm_pokemon_id', e.gm_pokemon_id,
    'species_id', e.species_id, 'name', e.name, 'level', e.level, 'max_hp', e.max_hp, 'quantity', e.quantity
  )) order by e.position), '[]'::jsonb)
  from public.encounter_template_entries e where e.template_id = p_template_id;
$$;

create or replace function public.admin_duplicate_encounter_template(p_template_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.encounter_templates;
begin
  perform public._require_admin();
  select * into v_t from public.encounter_templates where id = p_template_id;
  if v_t.id is null then raise exception 'Saved encounter not found'; end if;
  return public.admin_save_encounter_template(null, left(v_t.name || ' (copy)', 80), v_t.description, v_t.kind,
    v_t.catching_allowed, v_t.default_player_ids, public._template_entries_json(v_t.id));
end;
$$;

grant execute on function public.admin_duplicate_encounter_template(uuid) to authenticated;

-- Start a battle: from a saved template (p_template_id) or a quick one
-- (p_entries). Every start is a new battle; the template is never changed
-- (apart from its "started N times" counter).
create or replace function public.admin_start_encounter(
  p_template_id uuid,
  p_name text,
  p_description text,
  p_kind text,
  p_catching_allowed boolean,
  p_player_ids uuid[],
  p_entries jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._require_admin();
  v_t public.encounter_templates;
  v_name text;
  v_desc text;
  v_kind text;
  v_catch boolean;
  v_entries jsonb;
  v_players uuid[];
  v_busy text;
  v_enc uuid;
  v_count integer;
  v_trainers integer;
  v_first_species smallint;
  v_summary text;
  v_pid uuid;
begin
  if p_template_id is not null then
    select * into v_t from public.encounter_templates where id = p_template_id for update;
    if v_t.id is null then raise exception 'Saved encounter not found'; end if;
    v_entries := public._template_entries_json(v_t.id);
  else
    v_entries := p_entries;
  end if;
  v_name := coalesce(nullif(btrim(coalesce(p_name, '')), ''), v_t.name);
  v_desc := coalesce(nullif(btrim(coalesce(p_description, '')), ''), v_t.description);
  v_kind := coalesce(nullif(p_kind, ''), v_t.kind, 'wild');
  v_catch := coalesce(p_catching_allowed, v_t.catching_allowed, false);
  if not public.is_valid_encounter_kind(v_kind) then raise exception 'Unknown encounter type'; end if;

  select array_agg(distinct x) into v_players from unnest(coalesce(p_player_ids, '{}')) x where x is not null;
  if v_players is null then raise exception 'Choose at least one trainer to fight.'; end if;
  if exists (select 1 from unnest(v_players) x where not exists (select 1 from public.profiles p where p.id = x)) then
    raise exception 'One of the chosen trainers no longer exists';
  end if;
  select string_agg(p.username, ', ') into v_busy
  from public.profiles p where p.id = any(v_players) and public.is_in_active_battle(p.id);
  if v_busy is not null then raise exception 'Already in an active battle: %', v_busy; end if;

  perform public._encounter_entries_check(v_entries);

  insert into public.battle_encounters
    (name, enemy_name, enemy_species_id, level, current_kp, max_kp, notes, status, created_by,
     mode, enemy_auto_attack, enemy_damage_scale, template_id, kind, catching_allowed)
  values ('…', '…', null, 1, 1, 1, v_desc, 'active', v_admin, 'auto', false, 1, v_t.id, v_kind, v_catch)
  returning id into v_enc;

  v_count := public._battle_build_enemies(v_enc, v_entries);
  select count(*) into v_trainers from public.battle_enemy_trainers where encounter_id = v_enc;
  select species_id into v_first_species from public.battle_enemies where encounter_id = v_enc order by slot limit 1;

  v_summary := case
    when v_trainers > 0 then (select string_agg(name, ', ' order by position) from public.battle_enemy_trainers where encounter_id = v_enc)
    else (select name from public.battle_enemies where encounter_id = v_enc order by slot limit 1)
         || case when v_count > 1 then format(' & %s more', v_count - 1) else '' end
  end;
  update public.battle_encounters
  set name = coalesce(v_name, case when v_trainers > 0 then 'Battle vs ' else 'Wild ' end || v_summary),
      enemy_name = v_summary, enemy_species_id = v_first_species
  where id = v_enc;

  foreach v_pid in array v_players loop
    insert into public.battle_players (encounter_id, profile_id) values (v_enc, v_pid);
  end loop;

  if v_t.id is not null then
    update public.encounter_templates set times_started = times_started + 1, last_started_at = now() where id = v_t.id;
  end if;

  perform public._battle_log(v_enc, 'start', 'system', null, null, '', 0, 0, v_admin, null, null, null,
    case
      when v_trainers = 1 then format('%s wants to battle!', v_summary)
      when v_trainers > 1 then format('%s want to battle!', v_summary)
      when v_count > 1 then format('A group of %s wild Pokémon appeared!', v_count)
      else format('A wild %s appeared!', v_summary) end);

  insert into public.admin_activity_log (admin_id, action, details)
  values (v_admin, 'battle_started', jsonb_build_object('encounter_id', v_enc, 'template_id', v_t.id, 'enemies', v_count,
    'trainers', v_trainers, 'players', array_length(v_players, 1), 'catching_allowed', v_catch));

  return v_enc;
end;
$$;

grant execute on function public.admin_start_encounter(uuid, text, text, text, boolean, uuid[], jsonb) to authenticated;

-- ===========================================================================
-- 5. Enemy trainers in battle
-- ===========================================================================
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
    (select bt.name from public.battle_enemy_trainers bt where bt.id = p_entry.enemy_trainer_id),
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
      coalesce((select current_hp > 0 and caught_by is null from public.battle_enemies where id = p_entry.enemy_id), false)
    when p_entry.enemy_trainer_id is not null then
      exists (select 1 from public.battle_enemies where enemy_trainer_id = p_entry.enemy_trainer_id and current_hp > 0 and caught_by is null)
    else
      coalesce((select public._usable_pokemon_count(bp.profile_id) > 0 from public.battle_players bp where bp.id = p_entry.battle_player_id), false)
  end;
$$;

-- An enemy is "on the field" (can be attacked) if it's standing, not caught,
-- and either wild or its trainer's active Pokémon.
create or replace function public._enemy_on_field(p_enemy public.battle_enemies)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_enemy.current_hp > 0 and p_enemy.caught_by is null and (
    p_enemy.enemy_trainer_id is null
    or exists (select 1 from public.battle_enemy_trainers t where t.id = p_enemy.enemy_trainer_id and t.active_enemy_id = p_enemy.id)
  );
$$;

-- Victory once no enemy is left standing (caught Pokémon have left the fight).
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

  if not exists (select 1 from public.battle_enemies where encounter_id = p_encounter_id and current_hp > 0 and caught_by is null) then
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

-- When a trainer's active Pokémon faints, their next one comes out.
create or replace function public._enemy_trainer_send_next(p_trainer_row uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.battle_enemy_trainers;
  v_next public.battle_enemies;
begin
  select * into v_t from public.battle_enemy_trainers where id = p_trainer_row for update;
  if v_t.id is null then return; end if;
  if v_t.active_enemy_id is not null and exists (
    select 1 from public.battle_enemies where id = v_t.active_enemy_id and current_hp > 0 and caught_by is null
  ) then
    return;
  end if;
  select * into v_next from public.battle_enemies
  where enemy_trainer_id = v_t.id and current_hp > 0 and caught_by is null
  order by team_position, slot limit 1;
  update public.battle_enemy_trainers set active_enemy_id = v_next.id where id = v_t.id;
  if v_next.id is not null then
    perform public._battle_log(v_t.encounter_id, 'trainer_switch', 'enemy', null, v_next.id, v_next.name, v_next.current_hp, v_next.current_hp,
      null, null, null, null, format('%s sends out %s!', v_t.name, v_next.name));
  else
    perform public._battle_log(v_t.encounter_id, 'trainer_out', 'system', null, null, '', 0, 0, null, null, null, null,
      format('%s has no Pokémon left!', v_t.name));
  end if;
end;
$$;

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
  end if;
  return null;
end;
$$;

-- Game Master: switch an enemy trainer's active Pokémon (free).
create or replace function public.admin_set_trainer_active(p_trainer_row uuid, p_enemy_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._require_admin();
  v_t public.battle_enemy_trainers;
  v_e public.battle_enemies;
begin
  select * into v_t from public.battle_enemy_trainers where id = p_trainer_row for update;
  if v_t.id is null then raise exception 'Trainer not found'; end if;
  select * into v_e from public.battle_enemies where id = p_enemy_id;
  if v_e.id is null or v_e.enemy_trainer_id is distinct from v_t.id then raise exception 'That Pokémon isn''t on this trainer''s team.'; end if;
  if v_e.current_hp <= 0 or v_e.caught_by is not null then raise exception '% can''t battle.', v_e.name; end if;
  if v_t.active_enemy_id = v_e.id then return; end if;
  update public.battle_enemy_trainers set active_enemy_id = v_e.id where id = v_t.id;
  perform public._battle_log(v_t.encounter_id, 'trainer_switch', 'enemy', null, v_e.id, v_e.name, v_e.current_hp, v_e.current_hp,
    v_admin, null, null, null, format('%s sends out %s!', v_t.name, v_e.name));
end;
$$;

grant execute on function public.admin_set_trainer_active(uuid, uuid) to authenticated;

-- Attack on your turn: target must be on the field.
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
  end if;

  v_events := v_events || public._battle_check_end(p_encounter_id);
  perform public._battle_advance_turn(p_encounter_id);
  return jsonb_build_object('events', v_events);
end;
$$;

-- The enemy (or enemy trainer) whose turn it is attacks.
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

-- ===========================================================================
-- 6. Catching (the Game Master decides)
-- ===========================================================================
create table if not exists public.catch_attempts (
  id                 uuid primary key default gen_random_uuid(),
  encounter_id       uuid not null references public.battle_encounters (id) on delete cascade,
  enemy_id           uuid not null references public.battle_enemies (id) on delete cascade,
  profile_id         uuid not null references public.profiles (id) on delete cascade,
  ball_item_id       uuid references public.items_catalog (id) on delete set null,
  ball_name          text,
  pokemon_name       text not null,
  status             text not null default 'pending' check (status in ('pending', 'caught', 'not_caught', 'cancelled')),
  resolved_by        uuid references public.profiles (id) on delete set null,
  resolved_at        timestamptz,
  result_pokemon_id  uuid references public.trainer_pokemon (id) on delete set null,
  note               text,
  created_at         timestamptz not null default clock_timestamp()
);

create index if not exists catch_attempts_encounter_idx on public.catch_attempts (encounter_id, created_at desc);
create index if not exists catch_attempts_status_idx on public.catch_attempts (status, created_at desc);
create unique index if not exists catch_attempts_one_pending on public.catch_attempts (enemy_id, profile_id) where status = 'pending';

alter table public.catch_attempts enable row level security;
drop policy if exists "catch_attempts_select" on public.catch_attempts;
create policy "catch_attempts_select" on public.catch_attempts for select to authenticated
  using (public.is_own_profile(profile_id) or public.is_admin());
-- No write policies: only the functions below write.

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'catch_attempts') then
    alter publication supabase_realtime add table public.catch_attempts;
  end if;
end $$;

-- A trainer throws a Poké Ball at a wild Pokémon on their turn. The ball is
-- used up; the Game Master decides the result.
create or replace function public.battle_attempt_catch(p_encounter_id uuid, p_enemy_id uuid, p_ball_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bp public.battle_players;
  v_enc public.battle_encounters;
  v_e public.battle_enemies;
  v_ball public.items_catalog;
  v_qty integer;
  v_me text;
  v_msg text;
begin
  v_bp := public._battle_require_my_turn(p_encounter_id);
  select * into v_enc from public.battle_encounters where id = p_encounter_id;
  if not v_enc.catching_allowed then
    raise exception 'Catching isn''t allowed in this encounter.';
  end if;

  select * into v_e from public.battle_enemies where id = p_enemy_id and encounter_id = p_encounter_id for update;
  if v_e.id is null then raise exception 'That Pokémon isn''t in this battle.'; end if;
  if v_e.enemy_trainer_id is not null then raise exception 'You can''t catch another trainer''s Pokémon!'; end if;
  if v_e.caught_by is not null then raise exception '% has already been caught.', v_e.name; end if;
  if v_e.species_id is null then raise exception '% can''t be caught.', v_e.name; end if;
  if exists (select 1 from public.catch_attempts where enemy_id = v_e.id and profile_id = v_bp.profile_id and status = 'pending') then
    raise exception 'You''re already waiting for the Game Master''s decision on %.', v_e.name;
  end if;

  select * into v_ball from public.items_catalog where id = p_ball_item_id;
  if v_ball.id is null or v_ball.category <> 'poke_ball' then raise exception 'Choose a Poké Ball.'; end if;
  select quantity into v_qty from public.trainer_items where profile_id = v_bp.profile_id and item_id = v_ball.id for update;
  if coalesce(v_qty, 0) < 1 then raise exception 'You don''t have any % left.', v_ball.name; end if;

  perform set_config('pokegear.suppress_item_notification', 'on', true);
  update public.trainer_items set quantity = quantity - 1 where profile_id = v_bp.profile_id and item_id = v_ball.id;
  delete from public.trainer_items where profile_id = v_bp.profile_id and item_id = v_ball.id and quantity <= 0;

  insert into public.catch_attempts (encounter_id, enemy_id, profile_id, ball_item_id, ball_name, pokemon_name)
  values (p_encounter_id, v_e.id, v_bp.profile_id, v_ball.id, v_ball.name, v_e.name);

  select username into v_me from public.profiles where id = v_bp.profile_id;
  v_msg := format('%s threw a %s at %s!', v_me, v_ball.name, v_e.name);
  perform public._battle_log(p_encounter_id, 'catch_attempt', 'enemy', null, v_e.id, v_e.name, v_e.current_hp, v_e.current_hp,
    v_bp.profile_id, v_ball.name, null, null, v_msg);

  perform public._battle_advance_turn(p_encounter_id);
  return jsonb_build_object('events', jsonb_build_array(jsonb_build_object(
    'type', 'status', 'message', v_msg, 'detail', 'Waiting for the Game Master…')));
end;
$$;

grant execute on function public.battle_attempt_catch(uuid, uuid, uuid) to authenticated;

-- The Game Master decides. Caught → the Pokémon becomes the trainer's
-- (Team if there's room, otherwise PC), leaves the battle, and every other
-- pending attempt on it is closed. All in one transaction.
create or replace function public.admin_resolve_catch(p_attempt_id uuid, p_caught boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := public._require_admin();
  v_a public.catch_attempts;
  v_enc public.battle_encounters;
  v_e public.battle_enemies;
  v_player public.profiles;
  v_loc public.pokemon_location;
  v_max integer := public.get_config_int('max_level', 8);
  v_species_name text;
  v_new public.trainer_pokemon;
  v_where text;
begin
  if p_caught is null then raise exception 'Choose Caught or Not caught.'; end if;
  select * into v_a from public.catch_attempts where id = p_attempt_id;
  if v_a.id is null then raise exception 'Catch attempt not found'; end if;
  select * into v_enc from public.battle_encounters where id = v_a.encounter_id for update;
  select * into v_e from public.battle_enemies where id = v_a.enemy_id for update;
  select * into v_a from public.catch_attempts where id = p_attempt_id for update;
  if v_a.status <> 'pending' then
    raise exception 'This catch attempt was already decided (%).', replace(v_a.status, '_', ' ');
  end if;

  if not p_caught then
    update public.catch_attempts set status = 'not_caught', resolved_by = v_admin, resolved_at = now() where id = v_a.id;
    perform public._battle_log(v_enc.id, 'catch_failed', 'enemy', null, v_e.id, v_e.name, v_e.current_hp, v_e.current_hp,
      v_admin, null, null, null, format('%s broke free from %s''s %s!', v_e.name,
      (select username from public.profiles where id = v_a.profile_id), coalesce(v_a.ball_name, 'Poké Ball')));
    return jsonb_build_object('status', 'not_caught', 'pokemon_name', v_e.name);
  end if;

  if not v_enc.catching_allowed then raise exception 'Catching isn''t allowed in this encounter.'; end if;
  if v_e.id is null then raise exception 'That Pokémon is no longer in the encounter.'; end if;
  if v_e.enemy_trainer_id is not null then raise exception 'A trainer''s Pokémon can''t be caught.'; end if;
  if v_e.caught_by is not null then raise exception '% has already been caught.', v_e.name; end if;
  if v_e.species_id is null then raise exception '% can''t be caught.', v_e.name; end if;
  select * into v_player from public.profiles where id = v_a.profile_id for update;
  if v_player.id is null then raise exception 'That trainer no longer exists.'; end if;

  select name into v_species_name from public.species where id = v_e.species_id;
  v_loc := public.find_or_make_slot(v_player.id);

  perform set_config('pokegear.suppress_pokemon_notification', 'on', true);
  insert into public.trainer_pokemon
    (profile_id, species_id, nickname, level, nature, ability, current_hp, max_hp, status,
     party_slot, box_id, box_slot, xp, is_shiny, origin, origin_encounter_id)
  values (
    v_player.id, v_e.species_id,
    case when v_e.name <> v_species_name then left(v_e.name, 24) end,
    least(v_e.level, v_max), 'Hardy', 'Unknown',
    v_e.current_hp, v_e.max_hp,
    case when v_e.current_hp <= 0 then 'fainted'::public.pokemon_status else 'healthy'::public.pokemon_status end,
    v_loc.party_slot, v_loc.box_id, v_loc.box_slot, 0, false, 'caught', v_enc.id
  )
  returning * into v_new;
  perform set_config('pokegear.suppress_pokemon_notification', 'off', true);

  update public.battle_enemies set caught_by = v_player.id, caught_at = now(), caught_pokemon_id = v_new.id where id = v_e.id;
  update public.catch_attempts set status = 'caught', resolved_by = v_admin, resolved_at = now(), result_pokemon_id = v_new.id where id = v_a.id;
  update public.catch_attempts
  set status = 'cancelled', resolved_by = v_admin, resolved_at = now(), note = format('Caught by %s', v_player.username)
  where enemy_id = v_e.id and status = 'pending';

  v_where := case when v_new.party_slot is not null then 'It joined your Team.' else 'Your Team is full, so it was sent to your PC.' end;
  insert into public.notifications (profile_id, kind, title, body)
  values (v_player.id, 'pokemon_caught', 'Pokémon caught!', format('You caught %s! %s', v_e.name, v_where));

  perform public._battle_log(v_enc.id, 'catch_success', 'enemy', null, v_e.id, v_e.name, v_e.current_hp, v_e.current_hp,
    v_admin, null, null, null, format('Gotcha! %s caught %s!', v_player.username, v_e.name));

  insert into public.admin_activity_log (admin_id, action, target_profile_id, details)
  values (v_admin, 'pokemon_caught', v_player.id, jsonb_build_object('species', v_species_name, 'level', v_new.level, 'encounter_id', v_enc.id));

  perform public._battle_check_end(v_enc.id);
  perform public._battle_ensure_turn(v_enc.id);

  return jsonb_build_object('status', 'caught', 'pokemon_name', v_e.name, 'pokemon_id', v_new.id,
    'placed', case when v_new.party_slot is not null then 'team' else 'pc' end);
end;
$$;

grant execute on function public.admin_resolve_catch(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Battle state: + enemy trainers, catch attempts, Poké Balls, on-field flags.
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
        'fainted', e.current_hp = 0,
        'enemy_trainer_id', e.enemy_trainer_id, 'team_position', e.team_position,
        'on_field', public._enemy_on_field(e),
        'caught', e.caught_by is not null,
        'caught_by_name', (select username from public.profiles where id = e.caught_by),
        'catchable', v_enc.catching_allowed and e.enemy_trainer_id is null and e.caught_by is null and e.species_id is not null
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
-- Lock down internal helpers.
-- ---------------------------------------------------------------------------
revoke execute on function public._add_pokemon_xp(uuid, integer) from public, anon, authenticated;
revoke execute on function public._apply_pokemon_xp(uuid, integer, boolean) from public, anon, authenticated;
revoke execute on function public._battle_add_enemy(uuid, uuid, integer, uuid, smallint, text, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public._battle_build_enemies(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public._encounter_entries_check(jsonb) from public, anon, authenticated;
revoke execute on function public._template_entries_json(uuid) from public, anon, authenticated;
revoke execute on function public._enemy_on_field(public.battle_enemies) from public, anon, authenticated;
revoke execute on function public._enemy_trainer_send_next(uuid) from public, anon, authenticated;
revoke execute on function public._turn_entry_name(public.battle_turn_order) from public, anon, authenticated;
revoke execute on function public._turn_can_act(public.battle_turn_order) from public, anon, authenticated;
revoke execute on function public._battle_check_end(uuid) from public, anon, authenticated;
revoke execute on function public.battle_add_turn_entry() from public, anon, authenticated;
revoke execute on function public.battle_enemy_hp_turn_check() from public, anon, authenticated;
revoke execute on function public.gm_pokemon_validate() from public, anon, authenticated;
