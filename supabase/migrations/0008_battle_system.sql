-- ============================================================================
-- PokéGear — Phase 9: D&D Pokémon Battle System (Modular & Expandable)
-- ============================================================================
-- Campaign rules (max level, XP curve, evolution rules) live in data, not
-- code, so a Game Master can change them later without an app rebuild.
-- "KP" in the campaign's own terminology is exactly HP: this reuses the
-- existing trainer_pokemon.current_hp/max_hp columns from Phase 3 rather
-- than renaming/duplicating them — the UI is simply labeled "KP".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- game_config — campaign-tunable values. Two keys seeded: max_level and the
-- XP curve (JSON map of "level reached" -> "XP required to reach it from
-- the previous level"), matching the spec's exponential-doubling table.
-- ---------------------------------------------------------------------------
create table if not exists public.game_config (
  key         text primary key,
  value       jsonb not null,
  description text
);

insert into public.game_config (key, value, description) values
  ('max_level', '10', 'Highest level a Pokémon can reach in this campaign.'),
  (
    'xp_curve',
    '{"2":10,"3":20,"4":40,"5":80,"6":160,"7":320,"8":640,"9":1280,"10":2560}',
    'XP required to advance TO each level, keyed by the target level.'
  )
on conflict (key) do nothing;

alter table public.game_config enable row level security;

drop policy if exists "game_config_select_authenticated" on public.game_config;
create policy "game_config_select_authenticated"
  on public.game_config for select
  to authenticated
  using (true);

drop policy if exists "game_config_admin_write" on public.game_config;
create policy "game_config_admin_write"
  on public.game_config for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.get_config_int(p_key text, p_default integer)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select value::text from public.game_config where key = p_key)::integer, p_default);
$$;

create or replace function public.get_xp_curve()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select value from public.game_config where key = 'xp_curve'), '{}'::jsonb);
$$;

-- ---------------------------------------------------------------------------
-- trainer_pokemon: KP system additions. `level`'s old fixed 1–100 CHECK is
-- relaxed to just "at least 1" — the real, changeable ceiling is
-- game_config.max_level, enforced in grant_pokemon_xp() below, not baked
-- into the schema.
-- ---------------------------------------------------------------------------
alter table public.trainer_pokemon drop constraint if exists trainer_pokemon_level_check;
alter table public.trainer_pokemon add constraint trainer_pokemon_level_check check (level >= 1);

alter table public.trainer_pokemon
  add column if not exists xp        integer not null default 0 check (xp >= 0),
  add column if not exists is_dead   boolean not null default false,
  add column if not exists is_shiny  boolean not null default false;

-- Dead is permanent and stronger than Fainted: once true, KP/level/species
-- are frozen (and it can never be un-set), enforced here so it holds even
-- against a direct admin table edit, not just through the app's functions.
create or replace function public.enforce_dead_pokemon_immutable()
returns trigger
language plpgsql
as $$
begin
  if old.is_dead then
    new.is_dead := true;
    new.current_hp := old.current_hp;
    new.level := old.level;
    new.xp := old.xp;
    new.species_id := old.species_id;
    new.status := old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists trainer_pokemon_dead_immutable on public.trainer_pokemon;
create trigger trainer_pokemon_dead_immutable
  before update on public.trainer_pokemon
  for each row execute procedure public.enforce_dead_pokemon_immutable();

-- ---------------------------------------------------------------------------
-- evolution_rules — fully database-driven. A Game Master can add, edit, or
-- delete rows here (via SQL today; an admin UI screen reads/writes the same
-- table) without any code change.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'evolution_method') then
    create type public.evolution_method as enum ('level', 'item', 'held_item', 'trade', 'friendship', 'custom');
  end if;
end $$;

create table if not exists public.evolution_rules (
  id               uuid primary key default gen_random_uuid(),
  from_species_id  smallint not null references public.species (id),
  to_species_id    smallint not null references public.species (id),
  method           public.evolution_method not null,
  level_required   smallint check (level_required is null or level_required >= 1),
  item_id          uuid references public.items_catalog (id),
  notes            text,
  constraint evolution_rules_level_needs_value check (method <> 'level' or level_required is not null),
  constraint evolution_rules_item_needs_value check (method not in ('item', 'held_item') or item_id is not null)
);

create index if not exists evolution_rules_from_species_idx on public.evolution_rules (from_species_id, method);

alter table public.evolution_rules enable row level security;

drop policy if exists "evolution_rules_select_authenticated" on public.evolution_rules;
create policy "evolution_rules_select_authenticated"
  on public.evolution_rules for select
  to authenticated
  using (true);

drop policy if exists "evolution_rules_admin_write" on public.evolution_rules;
create policy "evolution_rules_admin_write"
  on public.evolution_rules for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- A handful of extra species referenced by the example evolution chains in
-- the spec, beyond the Gen-1-only seed from Phase 3. Adding more species is
-- just a data insert — the whole app already treats `species` generically.
insert into public.species (id, name) values
  (280, 'Ralts'), (281, 'Kirlia'), (282, 'Gardevoir'),
  (403, 'Shinx'), (404, 'Luxio'), (405, 'Luxray'),
  (447, 'Riolu'), (448, 'Lucario')
on conflict (id) do nothing;

insert into public.evolution_rules (from_species_id, to_species_id, method, level_required, notes) values
  (447, 448, 'level', 5, 'Riolu → Lucario at level 5'),
  (280, 281, 'level', 3, 'Ralts → Kirlia at level 3'),
  (281, 282, 'level', 7, 'Kirlia → Gardevoir at level 7')
on conflict do nothing;

insert into public.evolution_rules (from_species_id, to_species_id, method, item_id, notes)
select 133, 136, 'item', id, 'Eevee → Flareon with a Fire Stone'
from public.items_catalog where name = 'Fire Stone'
on conflict do nothing;

insert into public.evolution_rules (from_species_id, to_species_id, method, notes) values
  (64, 65, 'trade', 'Kadabra → Alakazam when traded')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- apply_evolution — internal helper shared by the level-up, item-evolution,
-- and trade-evolution paths below. Keeps level/XP/KP exactly as they were;
-- only the species changes.
-- ---------------------------------------------------------------------------
create or replace function public.apply_evolution(p_pokemon_id uuid, p_to_species_id smallint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pokemon public.trainer_pokemon;
  v_from_name text;
  v_to_name text;
begin
  select * into v_pokemon from public.trainer_pokemon where id = p_pokemon_id;
  select name into v_from_name from public.species where id = v_pokemon.species_id;
  select name into v_to_name from public.species where id = p_to_species_id;

  perform set_config('pokegear.bypass_pokemon_guard', 'on', true);
  update public.trainer_pokemon set species_id = p_to_species_id where id = p_pokemon_id;

  insert into public.notifications (profile_id, kind, title, body)
  values (
    v_pokemon.profile_id,
    'evolution',
    'Evolution!',
    format('%s evolved into %s!', coalesce(v_pokemon.nickname, v_from_name), v_to_name)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Battle tables
-- ---------------------------------------------------------------------------
create table if not exists public.battle_encounters (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  enemy_name     text not null,
  enemy_species_id smallint references public.species (id),
  enemy_sprite_url text,
  level          integer not null default 1 check (level >= 1),
  current_kp     integer not null check (current_kp >= 0),
  max_kp         integer not null check (max_kp > 0),
  notes          text,
  status         text not null default 'active' check (status in ('active', 'ended')),
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  ended_at       timestamptz,
  constraint battle_encounters_kp_range check (current_kp <= max_kp)
);

create table if not exists public.battle_participants (
  id           uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.battle_encounters (id) on delete cascade,
  pokemon_id   uuid not null references public.trainer_pokemon (id) on delete cascade,
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  joined_at    timestamptz not null default now(),
  unique (encounter_id, pokemon_id)
);

create table if not exists public.battle_logs (
  id                uuid primary key default gen_random_uuid(),
  encounter_id      uuid references public.battle_encounters (id) on delete cascade,
  target_type       text not null check (target_type in ('trainer_pokemon', 'enemy')),
  target_pokemon_id uuid references public.trainer_pokemon (id) on delete set null,
  target_label      text not null,
  previous_kp       integer not null,
  new_kp            integer not null,
  delta             integer not null,
  author_id         uuid references public.profiles (id) on delete set null,
  note              text,
  created_at        timestamptz not null default now()
);

create index if not exists battle_logs_encounter_idx on public.battle_logs (encounter_id, created_at);
create index if not exists battle_participants_encounter_idx on public.battle_participants (encounter_id);

alter table public.battle_encounters enable row level security;
alter table public.battle_participants enable row level security;
alter table public.battle_logs enable row level security;

-- Encounters and their logs are shared "at the table" data: every trainer
-- can see them (there's nothing private about a battle everyone's in), but
-- only an admin (the Game Master) can create/edit/end one or adjust the
-- enemy's KP directly. Log rows are never deleted (append-only) and are
-- only ever written through the functions below, never by a raw client
-- insert, which is what actually guarantees "never delete logs."
drop policy if exists "battle_encounters_select_authenticated" on public.battle_encounters;
create policy "battle_encounters_select_authenticated"
  on public.battle_encounters for select
  to authenticated
  using (true);

drop policy if exists "battle_encounters_admin_write" on public.battle_encounters;
create policy "battle_encounters_admin_write"
  on public.battle_encounters for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "battle_logs_select_authenticated" on public.battle_logs;
create policy "battle_logs_select_authenticated"
  on public.battle_logs for select
  to authenticated
  using (true);

drop policy if exists "battle_logs_admin_write" on public.battle_logs;
create policy "battle_logs_admin_write"
  on public.battle_logs for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "battle_participants_select_authenticated" on public.battle_participants;
create policy "battle_participants_select_authenticated"
  on public.battle_participants for select
  to authenticated
  using (true);

drop policy if exists "battle_participants_join_own" on public.battle_participants;
create policy "battle_participants_join_own"
  on public.battle_participants for insert
  to authenticated
  with check (public.is_own_profile(profile_id) or public.is_admin());

drop policy if exists "battle_participants_leave_own" on public.battle_participants;
create policy "battle_participants_leave_own"
  on public.battle_participants for delete
  to authenticated
  using (public.is_own_profile(profile_id) or public.is_admin());

-- A pokemon actively in a shared battle becomes visible to every trainer
-- (not just its owner) while that encounter is active — the same "shared
-- visibility for a shared, consensual context" pattern already used for
-- Pokémon actively offered in a trade (Phase 6). Nothing outside an active
-- encounter is affected.
drop policy if exists "trainer_pokemon_select_in_battle" on public.trainer_pokemon;
create policy "trainer_pokemon_select_in_battle"
  on public.trainer_pokemon for select
  to authenticated
  using (
    exists (
      select 1 from public.battle_participants bp
      join public.battle_encounters be on be.id = bp.encounter_id
      where bp.pokemon_id = trainer_pokemon.id and be.status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- Function: adjust_pokemon_kp — the only way a trainer's own Pokémon's KP
-- ever changes during play (damage/heal, quick buttons or a custom value).
-- Always logs. Fainted Pokémon are frozen until explicitly revived; Dead
-- Pokémon are frozen permanently, enforced independently by the trigger
-- above as well as here.
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
  v_species_name text;
  v_label text;
  v_new_kp integer;
  v_result public.trainer_pokemon;
begin
  select * into v_pokemon from public.trainer_pokemon where id = p_pokemon_id for update;
  if v_pokemon.id is null then
    raise exception 'Pokémon not found';
  end if;
  if not (public.is_own_profile(v_pokemon.profile_id) or public.is_admin()) then
    raise exception 'Not authorized to change this Pokémon''s KP';
  end if;
  if v_pokemon.is_dead then
    raise exception 'This Pokémon has died and cannot be changed';
  end if;
  if v_pokemon.status = 'fainted' then
    raise exception 'This Pokémon has fainted — take it to the Pokémon Center to revive it';
  end if;

  v_new_kp := greatest(0, least(v_pokemon.max_hp, v_pokemon.current_hp + p_delta));

  select name into v_species_name from public.species where id = v_pokemon.species_id;
  v_label := coalesce(v_pokemon.nickname, v_species_name);

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

  if v_new_kp = 0 and v_pokemon.status <> 'fainted' then
    insert into public.notifications (profile_id, kind, title, body)
    values (v_pokemon.profile_id, 'fainted', 'Pokémon fainted', format('%s has fainted!', v_label));
  end if;

  return v_result;
end;
$$;

grant execute on function public.adjust_pokemon_kp(uuid, integer, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Function: heal_pokemon — Pokémon Center "Heal" (for a conscious Pokémon).
-- ---------------------------------------------------------------------------
create or replace function public.heal_pokemon(p_pokemon_id uuid)
returns public.trainer_pokemon
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pokemon public.trainer_pokemon;
  v_species_name text;
  v_label text;
  v_result public.trainer_pokemon;
begin
  select * into v_pokemon from public.trainer_pokemon where id = p_pokemon_id for update;
  if v_pokemon.id is null then raise exception 'Pokémon not found'; end if;
  if not (public.is_own_profile(v_pokemon.profile_id) or public.is_admin()) then
    raise exception 'Not authorized';
  end if;
  if v_pokemon.is_dead then raise exception 'This Pokémon has died and cannot be healed'; end if;
  if v_pokemon.status = 'fainted' then raise exception 'A fainted Pokémon needs to be revived, not healed'; end if;

  select name into v_species_name from public.species where id = v_pokemon.species_id;
  v_label := coalesce(v_pokemon.nickname, v_species_name);

  perform set_config('pokegear.bypass_pokemon_guard', 'on', true);
  update public.trainer_pokemon set current_hp = max_hp where id = p_pokemon_id returning * into v_result;

  if v_pokemon.current_hp < v_pokemon.max_hp then
    insert into public.battle_logs (target_type, target_pokemon_id, target_label, previous_kp, new_kp, delta, author_id, note)
    values ('trainer_pokemon', p_pokemon_id, v_label, v_pokemon.current_hp, v_result.max_hp, v_result.max_hp - v_pokemon.current_hp, public.my_profile_id(), 'Healed at the Pokémon Center');

    insert into public.notifications (profile_id, kind, title, body)
    values (v_pokemon.profile_id, 'healed', 'Pokémon healed', format('%s was healed to full KP.', v_label));
  end if;

  return v_result;
end;
$$;

grant execute on function public.heal_pokemon(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Function: revive_pokemon — Pokémon Center "Revive" (fainted only).
-- ---------------------------------------------------------------------------
create or replace function public.revive_pokemon(p_pokemon_id uuid)
returns public.trainer_pokemon
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pokemon public.trainer_pokemon;
  v_species_name text;
  v_label text;
  v_result public.trainer_pokemon;
begin
  select * into v_pokemon from public.trainer_pokemon where id = p_pokemon_id for update;
  if v_pokemon.id is null then raise exception 'Pokémon not found'; end if;
  if not (public.is_own_profile(v_pokemon.profile_id) or public.is_admin()) then
    raise exception 'Not authorized';
  end if;
  if v_pokemon.is_dead then raise exception 'This Pokémon has died and cannot be revived'; end if;
  if v_pokemon.status <> 'fainted' then raise exception 'This Pokémon has not fainted'; end if;

  select name into v_species_name from public.species where id = v_pokemon.species_id;
  v_label := coalesce(v_pokemon.nickname, v_species_name);

  perform set_config('pokegear.bypass_pokemon_guard', 'on', true);
  update public.trainer_pokemon
  set current_hp = max_hp, status = 'healthy'
  where id = p_pokemon_id
  returning * into v_result;

  insert into public.battle_logs (target_type, target_pokemon_id, target_label, previous_kp, new_kp, delta, author_id, note)
  values ('trainer_pokemon', p_pokemon_id, v_label, 0, v_result.max_hp, v_result.max_hp, public.my_profile_id(), 'Revived at the Pokémon Center');

  insert into public.notifications (profile_id, kind, title, body)
  values (v_pokemon.profile_id, 'revived', 'Pokémon revived!', format('%s was revived to full KP.', v_label));

  return v_result;
end;
$$;

grant execute on function public.revive_pokemon(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Function: admin_set_pokemon_dead — permanent, admin/GM-only.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_pokemon_dead(p_pokemon_id uuid, p_note text default null)
returns public.trainer_pokemon
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pokemon public.trainer_pokemon;
  v_species_name text;
  v_label text;
  v_result public.trainer_pokemon;
begin
  if not public.is_admin() then
    raise exception 'Only the Game Master can mark a Pokémon as dead';
  end if;

  select * into v_pokemon from public.trainer_pokemon where id = p_pokemon_id for update;
  if v_pokemon.id is null then raise exception 'Pokémon not found'; end if;

  select name into v_species_name from public.species where id = v_pokemon.species_id;
  v_label := coalesce(v_pokemon.nickname, v_species_name);

  perform set_config('pokegear.bypass_pokemon_guard', 'on', true);
  update public.trainer_pokemon set is_dead = true, current_hp = 0 where id = p_pokemon_id returning * into v_result;

  insert into public.battle_logs (target_type, target_pokemon_id, target_label, previous_kp, new_kp, delta, author_id, note)
  values ('trainer_pokemon', p_pokemon_id, v_label, v_pokemon.current_hp, 0, -v_pokemon.current_hp, public.my_profile_id(), coalesce(p_note, 'Marked as dead'));

  insert into public.notifications (profile_id, kind, title, body)
  values (v_pokemon.profile_id, 'pokemon_died', 'A Pokémon has died', format('%s did not survive.', v_label));

  return v_result;
end;
$$;

grant execute on function public.admin_set_pokemon_dead(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Function: grant_pokemon_xp — awards XP, resolves level-ups (possibly
-- several at once from one large grant) against the configurable XP curve
-- and max level, and checks for a 'level' evolution after each level gained.
-- ---------------------------------------------------------------------------
create or replace function public.grant_pokemon_xp(p_pokemon_id uuid, p_amount integer, p_note text default null)
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
  v_species_name text;
  v_label text;
  v_result public.trainer_pokemon;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'XP amount must be positive';
  end if;

  select * into v_pokemon from public.trainer_pokemon where id = p_pokemon_id for update;
  if v_pokemon.id is null then raise exception 'Pokémon not found'; end if;
  if not (public.is_own_profile(v_pokemon.profile_id) or public.is_admin()) then
    raise exception 'Not authorized';
  end if;
  if v_pokemon.is_dead then raise exception 'This Pokémon has died and cannot gain XP'; end if;

  select name into v_species_name from public.species where id = v_pokemon.species_id;
  v_label := coalesce(v_pokemon.nickname, v_species_name);

  if v_pokemon.level >= v_max_level then
    -- Already capped: XP is tracked but never advances the level further.
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

      -- Check a level-based evolution against the (possibly already
      -- updated, for a multi-stage chain) current species.
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

  if not v_leveled then
    insert into public.notifications (profile_id, kind, title, body)
    values (v_pokemon.profile_id, 'xp_gained', 'XP gained', format('%s gained %s XP.', v_label, p_amount));
  end if;

  return v_result;
end;
$$;

grant execute on function public.grant_pokemon_xp(uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Function: evolve_with_item — player-triggered item / held-item evolution.
-- The "Evolve" button only makes sense to show when a matching rule and the
-- required item both exist, which the client checks by reading
-- evolution_rules + trainer_items/held_item_id directly; this function is
-- the authoritative, re-validated version of that same check.
-- ---------------------------------------------------------------------------
create or replace function public.evolve_with_item(p_pokemon_id uuid, p_rule_id uuid)
returns public.trainer_pokemon
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pokemon public.trainer_pokemon;
  v_rule public.evolution_rules;
  v_result public.trainer_pokemon;
begin
  select * into v_pokemon from public.trainer_pokemon where id = p_pokemon_id for update;
  if v_pokemon.id is null then raise exception 'Pokémon not found'; end if;
  if not (public.is_own_profile(v_pokemon.profile_id) or public.is_admin()) then
    raise exception 'Not authorized';
  end if;
  if v_pokemon.is_dead then raise exception 'This Pokémon has died and cannot evolve'; end if;

  select * into v_rule from public.evolution_rules where id = p_rule_id;
  if v_rule.id is null or v_rule.from_species_id <> v_pokemon.species_id then
    raise exception 'This evolution does not apply to this Pokémon';
  end if;

  if v_rule.method = 'item' then
    update public.trainer_items set quantity = quantity - 1
    where profile_id = v_pokemon.profile_id and item_id = v_rule.item_id and quantity > 0;
    if not found then
      raise exception 'The required item is not in the Bag';
    end if;
  elsif v_rule.method = 'held_item' then
    if v_pokemon.held_item_id is distinct from v_rule.item_id then
      raise exception 'This Pokémon is not holding the required item';
    end if;
    perform set_config('pokegear.bypass_pokemon_guard', 'on', true);
    update public.trainer_pokemon set held_item_id = null where id = p_pokemon_id;
  else
    raise exception 'This evolution rule is not item-based';
  end if;

  perform public.apply_evolution(p_pokemon_id, v_rule.to_species_id);
  select * into v_result from public.trainer_pokemon where id = p_pokemon_id;
  return v_result;
end;
$$;

grant execute on function public.evolve_with_item(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Battle participants: join
-- ---------------------------------------------------------------------------
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
  if not exists (select 1 from public.battle_encounters where id = p_encounter_id and status = 'active') then
    raise exception 'This encounter is no longer active';
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

grant execute on function public.join_battle(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Function: admin_adjust_enemy_kp — Game Master live enemy KP tracking.
-- ---------------------------------------------------------------------------
create or replace function public.admin_adjust_enemy_kp(p_encounter_id uuid, p_delta integer, p_note text default null)
returns public.battle_encounters
language plpgsql
security definer
set search_path = public
as $$
declare
  v_encounter public.battle_encounters;
  v_new_kp integer;
  v_result public.battle_encounters;
begin
  if not public.is_admin() then
    raise exception 'Only the Game Master can adjust enemy KP';
  end if;

  select * into v_encounter from public.battle_encounters where id = p_encounter_id for update;
  if v_encounter.id is null then raise exception 'Encounter not found'; end if;

  v_new_kp := greatest(0, least(v_encounter.max_kp, v_encounter.current_kp + p_delta));

  update public.battle_encounters set current_kp = v_new_kp where id = p_encounter_id returning * into v_result;

  insert into public.battle_logs (encounter_id, target_type, target_label, previous_kp, new_kp, delta, author_id, note)
  values (p_encounter_id, 'enemy', v_encounter.enemy_name, v_encounter.current_kp, v_new_kp, v_new_kp - v_encounter.current_kp, public.my_profile_id(), p_note);

  return v_result;
end;
$$;

grant execute on function public.admin_adjust_enemy_kp(uuid, integer, text) to authenticated;

create or replace function public.admin_end_encounter(p_encounter_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_ids uuid[];
begin
  if not public.is_admin() then
    raise exception 'Only the Game Master can end an encounter';
  end if;

  update public.battle_encounters set status = 'ended', ended_at = now() where id = p_encounter_id;

  select array_agg(distinct profile_id) into v_profile_ids
  from public.battle_participants where encounter_id = p_encounter_id;

  if v_profile_ids is not null then
    insert into public.notifications (profile_id, kind, title, body)
    select unnest(v_profile_ids), 'battle_ended', 'Battle ended', 'The encounter has ended.';
  end if;
end;
$$;

grant execute on function public.admin_end_encounter(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Extend send_admin_reward (Phase 8) so its 'pokemon' branch — used by both
-- the Admin → Rewards composer and the Users page's one-click "Give
-- Pokémon" — can also set xp and is_shiny from the payload. Those columns
-- didn't exist when this function was first written.
-- ---------------------------------------------------------------------------
create or replace function public.send_admin_reward(p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch          public.reward_batches;
  v_recipient_ids  uuid[];
  v_recipient      record;
  v_item           record;
  v_slot           public.pokemon_location;
  v_max_hp         integer;
  v_count          integer := 0;
  v_admin_id       uuid;
  v_notif_body     text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can send rewards';
  end if;

  v_admin_id := public.my_profile_id();

  select * into v_batch from public.reward_batches where id = p_batch_id for update;
  if v_batch.id is null then
    raise exception 'Reward not found';
  end if;
  if v_batch.status <> 'draft' then
    raise exception 'This reward has already been sent';
  end if;

  if v_batch.recipient_mode = 'user' then
    v_recipient_ids := array[(v_batch.recipient_target ->> 'profile_id')::uuid];
  elsif v_batch.recipient_mode = 'users' then
    select array_agg(elem::uuid) into v_recipient_ids
    from jsonb_array_elements_text(v_batch.recipient_target -> 'profile_ids') as elem;
  elsif v_batch.recipient_mode = 'city' then
    select array_agg(id) into v_recipient_ids
    from public.profiles where city_id = (v_batch.recipient_target ->> 'city_id')::uuid;
  else
    select array_agg(id) into v_recipient_ids from public.profiles;
  end if;

  if v_recipient_ids is null or array_length(v_recipient_ids, 1) is null then
    raise exception 'No recipients matched for this reward';
  end if;

  v_notif_body := nullif(v_batch.message, '');

  perform set_config('pokegear.bypass_profile_guard', 'on', true);
  perform set_config('pokegear.suppress_item_notification', 'on', true);
  perform set_config('pokegear.suppress_pokemon_notification', 'on', true);

  for v_recipient in select id from public.profiles where id = any(v_recipient_ids) loop
    if v_batch.kind = 'money' then
      update public.profiles
      set money = money + greatest((v_batch.payload ->> 'amount')::integer, 0)
      where id = v_recipient.id;

    elsif v_batch.kind = 'items' then
      for v_item in
        select * from jsonb_to_recordset(v_batch.payload -> 'items') as x(item_id uuid, quantity integer)
      loop
        insert into public.trainer_items (profile_id, item_id, quantity)
        values (v_recipient.id, v_item.item_id, greatest(v_item.quantity, 0))
        on conflict (profile_id, item_id) do update set quantity = public.trainer_items.quantity + excluded.quantity;
      end loop;

    elsif v_batch.kind = 'pokemon' then
      v_max_hp := coalesce((v_batch.payload ->> 'max_hp')::integer, 20);
      v_slot := public.find_open_slot(v_recipient.id);
      insert into public.trainer_pokemon
        (profile_id, species_id, nickname, level, nature, ability, held_item_id,
         current_hp, max_hp, status, party_slot, box_id, box_slot, xp, is_shiny)
      values (
        v_recipient.id,
        (v_batch.payload ->> 'species_id')::smallint,
        nullif(v_batch.payload ->> 'nickname', ''),
        coalesce((v_batch.payload ->> 'level')::integer, 5),
        coalesce(nullif(v_batch.payload ->> 'nature', ''), 'Hardy'),
        coalesce(nullif(v_batch.payload ->> 'ability', ''), 'Unknown'),
        nullif(v_batch.payload ->> 'held_item_id', '')::uuid,
        coalesce((v_batch.payload ->> 'current_hp')::integer, v_max_hp),
        v_max_hp,
        coalesce(nullif(v_batch.payload ->> 'status', ''), 'healthy')::public.pokemon_status,
        v_slot.party_slot, v_slot.box_id, v_slot.box_slot,
        coalesce((v_batch.payload ->> 'xp')::integer, 0),
        coalesce((v_batch.payload ->> 'is_shiny')::boolean, false)
      );
    end if;

    insert into public.reward_deliveries (batch_id, recipient_id) values (p_batch_id, v_recipient.id);

    insert into public.notifications (profile_id, kind, title, body)
    values (
      v_recipient.id,
      'admin_reward',
      'Reward received!',
      coalesce(v_notif_body, 'You received a reward from an admin.')
    );

    v_count := v_count + 1;
  end loop;

  update public.reward_batches set status = 'sent', sent_at = now() where id = p_batch_id;

  insert into public.admin_activity_log (admin_id, action, details)
  values (
    v_admin_id,
    'reward_sent',
    jsonb_build_object('batch_id', p_batch_id, 'kind', v_batch.kind, 'recipient_count', v_count, 'message', v_batch.message)
  );

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Extend confirm_trade (Phase 6/7) with a post-transfer trade-evolution
-- check for each Pokémon that just changed hands.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_trade(p_trade_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trade    public.trades;
  v_me       uuid := public.my_profile_id();
  v_other    uuid;
  v_first    uuid;
  v_second   uuid;
  v_tp       record;
  v_ti       record;
  v_owner    uuid;
  v_owned    integer;
  v_slot     public.pokemon_location;
  v_my_name  text;
  v_evo_species smallint;
begin
  select * into v_trade from public.trades where id = p_trade_id for update;
  if v_trade.id is null then
    raise exception 'Trade not found';
  end if;
  if v_me <> v_trade.initiator_id and v_me <> v_trade.recipient_id then
    raise exception 'You are not a party to this trade';
  end if;
  if v_trade.status <> 'accepted' then
    raise exception 'This trade is not ready to confirm';
  end if;

  v_other := case when v_me = v_trade.initiator_id then v_trade.recipient_id else v_trade.initiator_id end;

  v_first := least(v_me, v_other);
  v_second := greatest(v_me, v_other);
  perform 1 from public.profiles where id = v_first for update;
  perform 1 from public.profiles where id = v_second for update;

  if v_me = v_trade.initiator_id then
    update public.trades set initiator_confirmed = true where id = p_trade_id;
  else
    update public.trades set recipient_confirmed = true where id = p_trade_id;
  end if;

  select * into v_trade from public.trades where id = p_trade_id;

  if not (v_trade.initiator_confirmed and v_trade.recipient_confirmed) then
    select username into v_my_name from public.profiles where id = v_me;
    insert into public.notifications (profile_id, kind, title, body)
    values (v_other, 'trade_waiting', 'Trade needs your confirmation', format('%s confirmed the trade. Your turn!', v_my_name));
    return;
  end if;

  for v_tp in select * from public.trade_pokemon where trade_id = p_trade_id loop
    select profile_id into v_owner from public.trainer_pokemon where id = v_tp.pokemon_id for update;
    if v_owner is distinct from v_tp.profile_id then
      raise exception 'A traded Pokémon is no longer available';
    end if;
  end loop;

  for v_ti in select * from public.trade_items where trade_id = p_trade_id loop
    select quantity into v_owned from public.trainer_items
    where profile_id = v_ti.profile_id and item_id = v_ti.item_id
    for update;
    if coalesce(v_owned, 0) < v_ti.quantity then
      raise exception 'An offered item is no longer available in sufficient quantity';
    end if;
  end loop;

  if v_trade.initiator_money > 0 then
    select money into v_owned from public.profiles where id = v_trade.initiator_id for update;
    if v_owned < v_trade.initiator_money then
      raise exception 'Insufficient funds to complete the trade';
    end if;
  end if;
  if v_trade.recipient_money > 0 then
    select money into v_owned from public.profiles where id = v_trade.recipient_id for update;
    if v_owned < v_trade.recipient_money then
      raise exception 'Insufficient funds to complete the trade';
    end if;
  end if;

  perform set_config('pokegear.bypass_pokemon_guard', 'on', true);
  for v_tp in select * from public.trade_pokemon where trade_id = p_trade_id loop
    v_slot := public.find_open_slot(
      case when v_tp.profile_id = v_trade.initiator_id then v_trade.recipient_id else v_trade.initiator_id end
    );
    update public.trainer_pokemon
    set profile_id = case when v_tp.profile_id = v_trade.initiator_id then v_trade.recipient_id else v_trade.initiator_id end,
        party_slot = v_slot.party_slot,
        box_id = v_slot.box_id,
        box_slot = v_slot.box_slot,
        is_favorite = false
    where id = v_tp.pokemon_id;

    -- Trade-triggered evolution, checked against the species as it stands
    -- right after the ownership transfer.
    select er.to_species_id into v_evo_species
    from public.evolution_rules er
    join public.trainer_pokemon tp on tp.id = v_tp.pokemon_id
    where er.method = 'trade' and er.from_species_id = tp.species_id
    limit 1;

    if v_evo_species is not null then
      perform public.apply_evolution(v_tp.pokemon_id, v_evo_species);
      -- apply_evolution notifies the Pokémon's (new) owner; the trainer who
      -- traded it away gets told as well, per "notify both players".
      insert into public.notifications (profile_id, kind, title, body)
      values (
        v_tp.profile_id, 'evolution', 'Evolution!',
        format('The Pokémon you traded evolved into %s!', (select name from public.species where id = v_evo_species))
      );
    end if;
    v_evo_species := null;
  end loop;

  perform set_config('pokegear.suppress_item_notification', 'on', true);
  for v_ti in select * from public.trade_items where trade_id = p_trade_id loop
    update public.trainer_items set quantity = quantity - v_ti.quantity
    where profile_id = v_ti.profile_id and item_id = v_ti.item_id;

    delete from public.trainer_items
    where profile_id = v_ti.profile_id and item_id = v_ti.item_id and quantity <= 0;

    insert into public.trainer_items (profile_id, item_id, quantity)
    values (
      case when v_ti.profile_id = v_trade.initiator_id then v_trade.recipient_id else v_trade.initiator_id end,
      v_ti.item_id,
      v_ti.quantity
    )
    on conflict (profile_id, item_id) do update set quantity = public.trainer_items.quantity + excluded.quantity;
  end loop;

  perform set_config('pokegear.bypass_profile_guard', 'on', true);
  if v_trade.initiator_money > 0 then
    update public.profiles set money = money - v_trade.initiator_money where id = v_trade.initiator_id;
    update public.profiles set money = money + v_trade.initiator_money where id = v_trade.recipient_id;
  end if;
  if v_trade.recipient_money > 0 then
    update public.profiles set money = money - v_trade.recipient_money where id = v_trade.recipient_id;
    update public.profiles set money = money + v_trade.recipient_money where id = v_trade.initiator_id;
  end if;

  update public.trades set status = 'completed', completed_at = now() where id = p_trade_id;

  insert into public.notifications (profile_id, kind, title, body)
  values
    (v_trade.initiator_id, 'trade_completed', 'Trade completed', 'Your trade has been completed successfully.'),
    (v_trade.recipient_id, 'trade_completed', 'Trade completed', 'Your trade has been completed successfully.');
end;
$$;

-- ---------------------------------------------------------------------------
-- Realtime: broadcast changes so every connected player sees KP changes,
-- new log entries, revives, and encounter updates without refreshing.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'battle_encounters'
  ) then
    alter publication supabase_realtime add table public.battle_encounters;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'battle_logs'
  ) then
    alter publication supabase_realtime add table public.battle_logs;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trainer_pokemon'
  ) then
    alter publication supabase_realtime add table public.trainer_pokemon;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'battle_participants'
  ) then
    alter publication supabase_realtime add table public.battle_participants;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
-- * Change the level cap or XP curve any time without touching the app:
--     update public.game_config set value = '12' where key = 'max_level';
--     update public.game_config set value = value || '{"11": 5000, "12": 10000}'::jsonb
--       where key = 'xp_curve';
-- * Add a new evolution rule (e.g. a custom homebrew evolution):
--     insert into public.evolution_rules (from_species_id, to_species_id, method, level_required)
--     values (1, 2, 'level', 4);
-- * Held-item evolutions are fully supported (evolve_with_item handles
--   method = 'held_item'); none is seeded since none of the seeded species
--   has a natural example, but adding one is just another row above.
