-- ============================================================================
-- PokéGear — Phase 4: PC Storage System
-- ============================================================================

-- Needed for EXCLUDE constraints on plain equality (=) below. Unlike a
-- partial UNIQUE index, an EXCLUDE constraint can be DEFERRABLE, which the
-- swap_pokemon_slots() function below relies on.
create extension if not exists btree_gist;


-- ---------------------------------------------------------------------------
-- Table: pc_boxes — every trainer gets a fixed set of boxes on creation.
-- ---------------------------------------------------------------------------
create table if not exists public.pc_boxes (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  box_number integer not null check (box_number between 1 and 32),
  name       text not null,
  capacity   integer not null default 30 check (capacity between 1 and 30),
  unique (profile_id, box_number)
);

create index if not exists pc_boxes_profile_id_idx on public.pc_boxes (profile_id);

-- Only `name` may ever change from a non-admin client.
create or replace function public.enforce_pc_box_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.profile_id := old.profile_id;
    new.box_number := old.box_number;
    new.capacity   := old.capacity;
  end if;
  return new;
end;
$$;

drop trigger if exists pc_box_update_guard on public.pc_boxes;
create trigger pc_box_update_guard
  before update on public.pc_boxes
  for each row execute procedure public.enforce_pc_box_update_guard();

-- Give every new trainer a starting set of 8 boxes automatically.
create or replace function public.create_default_pc_boxes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pc_boxes (profile_id, box_number, name)
  select new.id, n, 'Box ' || n
  from generate_series(1, 8) as n;
  return new;
end;
$$;

drop trigger if exists on_profile_created_make_boxes on public.profiles;
create trigger on_profile_created_make_boxes
  after insert on public.profiles
  for each row execute procedure public.create_default_pc_boxes();

-- Backfill boxes for any profile created before this migration (Phases 1-3).
insert into public.pc_boxes (profile_id, box_number, name)
select p.id, n, 'Box ' || n
from public.profiles p
cross join generate_series(1, 8) as n
where not exists (select 1 from public.pc_boxes b where b.profile_id = p.id)
on conflict (profile_id, box_number) do nothing;

-- ---------------------------------------------------------------------------
-- trainer_pokemon: add location columns.
-- A Pokémon is in exactly one place: the party (party_slot 1-6) OR a box
-- (box_id + box_slot). Never both, never neither.
-- ---------------------------------------------------------------------------
alter table public.trainer_pokemon
  add column if not exists party_slot smallint check (party_slot between 1 and 6),
  add column if not exists box_id     uuid references public.pc_boxes (id) on delete set null,
  add column if not exists box_slot   smallint check (box_slot between 1 and 30);

-- One Pokémon per party slot per trainer; one Pokémon per box slot.
--
-- These must be DEFERRABLE: swap_pokemon_slots() below updates two rows to
-- each other's location inside one transaction, which briefly makes both
-- rows share a location between the first UPDATE and the second. A plain
-- unique index checks immediately after every statement and would reject
-- that intermediate state, so we use EXCLUDE constraints instead — the only
-- constraint type in Postgres that supports both a partial WHERE clause and
-- DEFERRABLE (checked at COMMIT instead of per-statement).
alter table public.trainer_pokemon
  add constraint trainer_pokemon_party_slot_excl
  exclude using gist (profile_id with =, party_slot with =)
  where (party_slot is not null)
  deferrable initial immediate;

alter table public.trainer_pokemon
  add constraint trainer_pokemon_box_slot_excl
  exclude using gist (box_id with =, box_slot with =)
  where (box_id is not null)
  deferrable initial immediate;

-- Place any pre-Phase-4 Pokémon (Phase 3 seed data) into the party first,
-- then into Box 1, so existing data doesn't break the new "must be
-- somewhere" invariant below.
do $$
declare
  rec record;
  next_party smallint;
  next_box_slot smallint;
  first_box uuid;
begin
  for rec in
    select id, profile_id
    from public.trainer_pokemon
    where party_slot is null and box_id is null
    order by profile_id, caught_at
  loop
    select coalesce(max(party_slot), 0) + 1 into next_party
    from public.trainer_pokemon
    where profile_id = rec.profile_id and party_slot is not null;

    if next_party <= 6 then
      update public.trainer_pokemon set party_slot = next_party where id = rec.id;
    else
      select id into first_box from public.pc_boxes
      where profile_id = rec.profile_id and box_number = 1;

      select coalesce(max(box_slot), 0) + 1 into next_box_slot
      from public.trainer_pokemon
      where box_id = first_box;

      update public.trainer_pokemon
      set box_id = first_box, box_slot = next_box_slot
      where id = rec.id;
    end if;
  end loop;
end $$;

alter table public.trainer_pokemon
  add constraint trainer_pokemon_single_location check (
    (party_slot is not null and box_id is null and box_slot is null)
    or
    (party_slot is null and box_id is not null and box_slot is not null)
  );

create index if not exists trainer_pokemon_box_id_idx on public.trainer_pokemon (box_id);

-- ---------------------------------------------------------------------------
-- Extend the Phase 3 update guard: trainers may now also move their own
-- Pokémon around (party_slot / box_id / box_slot), in addition to toggling
-- is_favorite. Every other column stays admin-only. A target box must
-- belong to the same trainer, or the move is rejected.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_trainer_pokemon_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('pokegear.bypass_pokemon_guard', true) = 'on' then
    return new;
  end if;

  if not public.is_admin() then
    new.profile_id   := old.profile_id;
    new.species_id   := old.species_id;
    new.nickname     := old.nickname;
    new.level        := old.level;
    new.nature       := old.nature;
    new.ability      := old.ability;
    new.held_item_id := old.held_item_id;
    new.current_hp   := old.current_hp;
    new.max_hp       := old.max_hp;
    new.status       := old.status;
    new.caught_at     := old.caught_at;
    -- is_favorite, party_slot, box_id, box_slot may change directly.

    if new.box_id is not null and not exists (
      select 1 from public.pc_boxes b
      where b.id = new.box_id and b.profile_id = new.profile_id
    ) then
      raise exception 'You do not own that PC box';
    end if;
  end if;

  if (new.party_slot is not null) = (new.box_id is not null) then
    raise exception 'A Pokémon must be in exactly one place: the party or a PC box';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function: swap_pokemon_slots — atomically swaps the locations of two of a
-- trainer's own Pokémon. This is how dropping one Pokémon onto a slot that's
-- already occupied works: two independent client-side UPDATEs would each run
-- in their own transaction and collide with the unique location indexes
-- above, so the swap has to happen as a single server-side operation.
-- ---------------------------------------------------------------------------
create or replace function public.swap_pokemon_slots(p_pokemon_a uuid, p_pokemon_b uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.trainer_pokemon;
  b public.trainer_pokemon;
begin
  select * into a from public.trainer_pokemon where id = p_pokemon_a for update;
  select * into b from public.trainer_pokemon where id = p_pokemon_b for update;

  if a.id is null or b.id is null then
    raise exception 'Pokémon not found';
  end if;

  if not (
    (public.is_own_profile(a.profile_id) or public.is_admin()) and
    (public.is_own_profile(b.profile_id) or public.is_admin())
  ) then
    raise exception 'Not authorized to move one of these Pokémon';
  end if;

  perform set_config('pokegear.bypass_pokemon_guard', 'on', true);

  -- Without this, the first of the two UPDATEs below would momentarily put
  -- both Pokémon in the same location and get rejected immediately by the
  -- EXCLUDE constraints above. Deferring them means they're only checked
  -- once, at the end of this transaction, by which point the swap is
  -- complete and both locations are unique again.
  set constraints public.trainer_pokemon_party_slot_excl, public.trainer_pokemon_box_slot_excl deferred;

  update public.trainer_pokemon
  set party_slot = b.party_slot, box_id = b.box_id, box_slot = b.box_slot
  where id = a.id;

  update public.trainer_pokemon
  set party_slot = a.party_slot, box_id = a.box_id, box_slot = a.box_slot
  where id = b.id;
end;
$$;

grant execute on function public.swap_pokemon_slots(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.pc_boxes enable row level security;

drop policy if exists "pc_boxes_select_own" on public.pc_boxes;
create policy "pc_boxes_select_own"
  on public.pc_boxes for select
  to authenticated
  using (public.is_own_profile(profile_id) or public.is_admin());

drop policy if exists "pc_boxes_update_own" on public.pc_boxes;
create policy "pc_boxes_update_own"
  on public.pc_boxes for update
  to authenticated
  using (public.is_own_profile(profile_id) or public.is_admin())
  with check (public.is_own_profile(profile_id) or public.is_admin());

drop policy if exists "pc_boxes_admin_insert" on public.pc_boxes;
create policy "pc_boxes_admin_insert"
  on public.pc_boxes for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "pc_boxes_admin_delete" on public.pc_boxes;
create policy "pc_boxes_admin_delete"
  on public.pc_boxes for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
-- * A trainer's PC is only ever visible through pc_boxes/trainer_pokemon
--   rows scoped to their own profile_id — the existing trainer_pokemon RLS
--   from Phase 3 (select/update own row, admin insert/delete) is unchanged
--   and already covers Pokémon stored in boxes, since box storage is just a
--   different value of the same location columns.
-- * Admins can move/withdraw/deposit on behalf of any trainer the same way
--   they already can edit any trainer_pokemon row — no separate admin path
--   needed.
