-- ============================================================================
-- PokéGear — Phase 3: Trainer Data, Bag & Pokémon System
-- ============================================================================

-- ---------------------------------------------------------------------------
-- SECURITY FIX (Phase 1 hardening)
-- The Phase 1 "profiles_update_own" policy lets a trainer UPDATE their own
-- row, but RLS is row-level only — it doesn't stop a trainer from calling
-- the API directly and setting their own `money` or `role` column. This
-- trigger closes that gap: any UPDATE on profiles from a non-admin silently
-- keeps the protected columns unchanged, no matter what the client sends.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_profile_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.role       := old.role;
    new.money      := old.money;
    new.auth_id    := old.auth_id;
    new.trainer_id := old.trainer_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_update_guard on public.profiles;
create trigger profiles_update_guard
  before update on public.profiles
  for each row execute procedure public.enforce_profile_update_guard();

-- Reusable ownership check, used by every trainer-data policy below.
create or replace function public.is_own_profile(p_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = p_profile_id and auth_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'item_category') then
    create type public.item_category as enum ('item', 'poke_ball', 'evolution_item', 'key_item');
  end if;
  if not exists (select 1 from pg_type where typname = 'pokemon_status') then
    create type public.pokemon_status as enum
      ('healthy', 'poisoned', 'burned', 'paralyzed', 'asleep', 'frozen', 'fainted');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Table: species — a small reference catalog (Gen 1). Sprites are derived
-- purely from the numeric id client-side (PokeAPI's sprite repo is keyed by
-- national dex number), so no sprite URL needs to be stored or maintained.
-- ---------------------------------------------------------------------------
create table if not exists public.species (
  id   smallint primary key,
  name text not null
);

insert into public.species (id, name) values
  (1,'Bulbasaur'),(2,'Ivysaur'),(3,'Venusaur'),(4,'Charmander'),(5,'Charmeleon'),
  (6,'Charizard'),(7,'Squirtle'),(8,'Wartortle'),(9,'Blastoise'),(10,'Caterpie'),
  (11,'Metapod'),(12,'Butterfree'),(13,'Weedle'),(14,'Kakuna'),(15,'Beedrill'),
  (16,'Pidgey'),(17,'Pidgeotto'),(18,'Pidgeot'),(19,'Rattata'),(20,'Raticate'),
  (21,'Spearow'),(22,'Fearow'),(23,'Ekans'),(24,'Arbok'),(25,'Pikachu'),
  (26,'Raichu'),(27,'Sandshrew'),(28,'Sandslash'),(29,'Nidoran-F'),(30,'Nidorina'),
  (31,'Nidoqueen'),(32,'Nidoran-M'),(33,'Nidorino'),(34,'Nidoking'),(35,'Clefairy'),
  (36,'Clefable'),(37,'Vulpix'),(38,'Ninetales'),(39,'Jigglypuff'),(40,'Wigglytuff'),
  (41,'Zubat'),(42,'Golbat'),(43,'Oddish'),(44,'Gloom'),(45,'Vileplume'),
  (46,'Paras'),(47,'Parasect'),(48,'Venonat'),(49,'Venomoth'),(50,'Diglett'),
  (51,'Dugtrio'),(52,'Meowth'),(53,'Persian'),(54,'Psyduck'),(55,'Golduck'),
  (56,'Mankey'),(57,'Primeape'),(58,'Growlithe'),(59,'Arcanine'),(60,'Poliwag'),
  (61,'Poliwhirl'),(62,'Poliwrath'),(63,'Abra'),(64,'Kadabra'),(65,'Alakazam'),
  (66,'Machop'),(67,'Machoke'),(68,'Machamp'),(69,'Bellsprout'),(70,'Weepinbell'),
  (71,'Victreebel'),(72,'Tentacool'),(73,'Tentacruel'),(74,'Geodude'),(75,'Graveler'),
  (76,'Golem'),(77,'Ponyta'),(78,'Rapidash'),(79,'Slowpoke'),(80,'Slowbro'),
  (81,'Magnemite'),(82,'Magneton'),(83,'Farfetchd'),(84,'Doduo'),(85,'Dodrio'),
  (86,'Seel'),(87,'Dewgong'),(88,'Grimer'),(89,'Muk'),(90,'Shellder'),
  (91,'Cloyster'),(92,'Gastly'),(93,'Haunter'),(94,'Gengar'),(95,'Onix'),
  (96,'Drowzee'),(97,'Hypno'),(98,'Krabby'),(99,'Kingler'),(100,'Voltorb'),
  (101,'Electrode'),(102,'Exeggcute'),(103,'Exeggutor'),(104,'Cubone'),(105,'Marowak'),
  (106,'Hitmonlee'),(107,'Hitmonchan'),(108,'Lickitung'),(109,'Koffing'),(110,'Weezing'),
  (111,'Rhyhorn'),(112,'Rhydon'),(113,'Chansey'),(114,'Tangela'),(115,'Kangaskhan'),
  (116,'Horsea'),(117,'Seadra'),(118,'Goldeen'),(119,'Seaking'),(120,'Staryu'),
  (121,'Starmie'),(122,'Mr. Mime'),(123,'Scyther'),(124,'Jynx'),(125,'Electabuzz'),
  (126,'Magmar'),(127,'Pinsir'),(128,'Tauros'),(129,'Magikarp'),(130,'Gyarados'),
  (131,'Lapras'),(132,'Ditto'),(133,'Eevee'),(134,'Vaporeon'),(135,'Jolteon'),
  (136,'Flareon'),(137,'Porygon'),(138,'Omanyte'),(139,'Omastar'),(140,'Kabuto'),
  (141,'Kabutops'),(142,'Aerodactyl'),(143,'Snorlax'),(144,'Articuno'),(145,'Zapdos'),
  (146,'Moltres'),(147,'Dratini'),(148,'Dragonair'),(149,'Dragonite'),(150,'Mewtwo'),
  (151,'Mew')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Table: items_catalog — master list of obtainable items. `pokeapi_slug`
-- matches PokeAPI's sprite repo naming so item sprites resolve automatically.
-- ---------------------------------------------------------------------------
create table if not exists public.items_catalog (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  category      public.item_category not null,
  pokeapi_slug  text not null,
  description   text,
  sort_order    integer not null default 0
);

insert into public.items_catalog (name, category, pokeapi_slug, sort_order) values
  -- Poké Balls
  ('Poké Ball', 'poke_ball', 'poke-ball', 1),
  ('Great Ball', 'poke_ball', 'great-ball', 2),
  ('Ultra Ball', 'poke_ball', 'ultra-ball', 3),
  ('Master Ball', 'poke_ball', 'master-ball', 4),
  ('Safari Ball', 'poke_ball', 'safari-ball', 5),
  ('Premier Ball', 'poke_ball', 'premier-ball', 6),
  -- Items
  ('Potion', 'item', 'potion', 1),
  ('Super Potion', 'item', 'super-potion', 2),
  ('Hyper Potion', 'item', 'hyper-potion', 3),
  ('Max Potion', 'item', 'max-potion', 4),
  ('Full Restore', 'item', 'full-restore', 5),
  ('Revive', 'item', 'revive', 6),
  ('Antidote', 'item', 'antidote', 7),
  ('Paralyze Heal', 'item', 'paralyze-heal', 8),
  ('Awakening', 'item', 'awakening', 9),
  ('Full Heal', 'item', 'full-heal', 10),
  ('Repel', 'item', 'repel', 11),
  ('Escape Rope', 'item', 'escape-rope', 12),
  ('Rare Candy', 'item', 'rare-candy', 13),
  -- Evolution Items
  ('Fire Stone', 'evolution_item', 'fire-stone', 1),
  ('Water Stone', 'evolution_item', 'water-stone', 2),
  ('Thunder Stone', 'evolution_item', 'thunder-stone', 3),
  ('Leaf Stone', 'evolution_item', 'leaf-stone', 4),
  ('Moon Stone', 'evolution_item', 'moon-stone', 5),
  ('Sun Stone', 'evolution_item', 'sun-stone', 6),
  ('Dusk Stone', 'evolution_item', 'dusk-stone', 7),
  ('Shiny Stone', 'evolution_item', 'shiny-stone', 8),
  ('King''s Rock', 'evolution_item', 'kings-rock', 9),
  ('Metal Coat', 'evolution_item', 'metal-coat', 10),
  ('Dragon Scale', 'evolution_item', 'dragon-scale', 11),
  ('Up-Grade', 'evolution_item', 'up-grade', 12),
  -- Key Items
  ('Bicycle', 'key_item', 'bicycle', 1),
  ('Old Rod', 'key_item', 'old-rod', 2),
  ('Good Rod', 'key_item', 'good-rod', 3),
  ('Super Rod', 'key_item', 'super-rod', 4),
  ('Town Map', 'key_item', 'town-map', 5),
  ('Silph Scope', 'key_item', 'silph-scope', 6),
  ('Poké Flute', 'key_item', 'poke-flute', 7),
  ('S.S. Ticket', 'key_item', 'ss-ticket', 8)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Table: trainer_pokemon
-- ---------------------------------------------------------------------------
create table if not exists public.trainer_pokemon (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  species_id    smallint not null references public.species (id),
  nickname      text,
  level         integer not null default 5 check (level between 1 and 100),
  nature        text not null default 'Hardy' check (nature in (
                  'Hardy','Lonely','Brave','Adamant','Naughty','Bold','Docile','Relaxed',
                  'Impish','Lax','Timid','Hasty','Serious','Jolly','Naive','Modest','Mild',
                  'Quiet','Bashful','Rash','Calm','Gentle','Sassy','Careful','Quirky'
                )),
  ability       text not null,
  held_item_id  uuid references public.items_catalog (id) on delete set null,
  current_hp    integer not null,
  max_hp        integer not null check (max_hp > 0),
  status        public.pokemon_status not null default 'healthy',
  is_favorite   boolean not null default false,
  caught_at     timestamptz not null default now(),
  constraint trainer_pokemon_hp_range check (current_hp >= 0 and current_hp <= max_hp)
);

create index if not exists trainer_pokemon_profile_id_idx on public.trainer_pokemon (profile_id);
create index if not exists trainer_pokemon_species_id_idx on public.trainer_pokemon (species_id);

-- Trainers may only ever change `is_favorite` directly. Every other column
-- (level, HP, species, held_item_id, ...) is admin-only or goes through the
-- set_held_item() function below, which keeps Bag item counts consistent.
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
    new.caught_at    := old.caught_at;
  end if;

  return new;
end;
$$;

drop trigger if exists trainer_pokemon_update_guard on public.trainer_pokemon;
create trigger trainer_pokemon_update_guard
  before update on public.trainer_pokemon
  for each row execute procedure public.enforce_trainer_pokemon_update_guard();

-- ---------------------------------------------------------------------------
-- Table: trainer_items — one row per (trainer, item) stack.
-- ---------------------------------------------------------------------------
create table if not exists public.trainer_items (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  item_id    uuid not null references public.items_catalog (id) on delete cascade,
  quantity   integer not null default 0 check (quantity >= 0),
  unique (profile_id, item_id)
);

create index if not exists trainer_items_profile_id_idx on public.trainer_items (profile_id);

-- ---------------------------------------------------------------------------
-- Function: set_held_item — the only supported way for a trainer to change
-- a Pokémon's held item. Atomically returns the previously held item to the
-- Bag and removes the newly held one, so Bag counts always stay accurate.
-- Runs as the function owner (bypassing RLS on trainer_items, same pattern
-- Supabase uses for other trusted server-side mutations), but still checks
-- ownership manually against the caller's auth.uid().
-- ---------------------------------------------------------------------------
create or replace function public.set_held_item(p_pokemon_id uuid, p_item_id uuid default null)
returns public.trainer_pokemon
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_old_item   uuid;
  v_result     public.trainer_pokemon;
begin
  select profile_id, held_item_id into v_profile_id, v_old_item
  from public.trainer_pokemon
  where id = p_pokemon_id
  for update;

  if v_profile_id is null then
    raise exception 'Pokémon not found';
  end if;

  if not (public.is_own_profile(v_profile_id) or public.is_admin()) then
    raise exception 'Not authorized to modify this Pokémon';
  end if;

  if v_old_item is not null then
    insert into public.trainer_items (profile_id, item_id, quantity)
    values (v_profile_id, v_old_item, 1)
    on conflict (profile_id, item_id)
    do update set quantity = public.trainer_items.quantity + 1;
  end if;

  if p_item_id is not null then
    update public.trainer_items
    set quantity = quantity - 1
    where profile_id = v_profile_id and item_id = p_item_id and quantity > 0;

    if not found then
      raise exception 'That item is not in your Bag';
    end if;
  end if;

  perform set_config('pokegear.bypass_pokemon_guard', 'on', true);

  update public.trainer_pokemon
  set held_item_id = p_item_id
  where id = p_pokemon_id
  returning * into v_result;

  return v_result;
end;
$$;

grant execute on function public.set_held_item(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.species enable row level security;
alter table public.items_catalog enable row level security;
alter table public.trainer_pokemon enable row level security;
alter table public.trainer_items enable row level security;

-- species: readable by anyone signed in, writable only by admins
drop policy if exists "species_select_authenticated" on public.species;
create policy "species_select_authenticated"
  on public.species for select
  to authenticated
  using (true);

drop policy if exists "species_admin_write" on public.species;
create policy "species_admin_write"
  on public.species for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- items_catalog: readable by anyone signed in, writable only by admins
drop policy if exists "items_catalog_select_authenticated" on public.items_catalog;
create policy "items_catalog_select_authenticated"
  on public.items_catalog for select
  to authenticated
  using (true);

drop policy if exists "items_catalog_admin_write" on public.items_catalog;
create policy "items_catalog_admin_write"
  on public.items_catalog for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- trainer_pokemon: trainers see/update only their own; admins do anything.
-- Insert/delete ("give"/"remove" a Pokémon) is admin-only by design.
drop policy if exists "trainer_pokemon_select_own" on public.trainer_pokemon;
create policy "trainer_pokemon_select_own"
  on public.trainer_pokemon for select
  to authenticated
  using (public.is_own_profile(profile_id) or public.is_admin());

drop policy if exists "trainer_pokemon_update_own" on public.trainer_pokemon;
create policy "trainer_pokemon_update_own"
  on public.trainer_pokemon for update
  to authenticated
  using (public.is_own_profile(profile_id) or public.is_admin())
  with check (public.is_own_profile(profile_id) or public.is_admin());

drop policy if exists "trainer_pokemon_admin_insert" on public.trainer_pokemon;
create policy "trainer_pokemon_admin_insert"
  on public.trainer_pokemon for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "trainer_pokemon_admin_delete" on public.trainer_pokemon;
create policy "trainer_pokemon_admin_delete"
  on public.trainer_pokemon for delete
  to authenticated
  using (public.is_admin());

-- trainer_items: trainers can only ever SELECT their own stack. All writes
-- ("give"/"remove" items) are admin-only, or routed through set_held_item().
drop policy if exists "trainer_items_select_own" on public.trainer_items;
create policy "trainer_items_select_own"
  on public.trainer_items for select
  to authenticated
  using (public.is_own_profile(profile_id) or public.is_admin());

drop policy if exists "trainer_items_admin_write" on public.trainer_items;
create policy "trainer_items_admin_write"
  on public.trainer_items for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Notes for admins (manual data entry until an admin UI exists)
-- ---------------------------------------------------------------------------
-- Give a trainer a Pokémon:
--   insert into public.trainer_pokemon
--     (profile_id, species_id, nickname, level, nature, ability, current_hp, max_hp)
--   values
--     ((select id from public.profiles where username = 'ash'), 25, null, 12, 'Jolly', 'Static', 32, 32);
--
-- Give a trainer items:
--   insert into public.trainer_items (profile_id, item_id, quantity)
--   values (
--     (select id from public.profiles where username = 'ash'),
--     (select id from public.items_catalog where name = 'Ultra Ball'),
--     5
--   )
--   on conflict (profile_id, item_id) do update set quantity = trainer_items.quantity + excluded.quantity;
--
-- Give or remove money:
--   update public.profiles set money = money + 500 where username = 'ash';
--   update public.profiles set money = greatest(money - 200, 0) where username = 'ash';
