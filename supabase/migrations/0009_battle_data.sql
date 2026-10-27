-- ============================================================================
-- PokéGear 10.0 — Part 1: Battle data model
-- ============================================================================
-- Extends the Phase 9 battle tables (battle_encounters / battle_participants
-- / battle_logs) instead of replacing them. Existing "manual" encounters keep
-- working exactly as before; new admin-created encounters use mode = 'auto',
-- where every action is resolved server-side by the functions in
-- 0010_battle_engine.sql.
--
-- This file only adds data and tables. All of it is additive and safe to run
-- on a database that already has players, Pokémon and old encounters.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Campaign config: battle tuning knobs, stored as data like max_level.
-- ---------------------------------------------------------------------------
insert into public.game_config (key, value, description) values
  ('battle_damage_scale', '5',
   'Multiplier applied to the core damage formula. 5 gives hits of roughly 10-130 KP at levels 1-10.'),
  ('battle_crit_chance', '0.0625',
   'Chance (0-1) that an attack is a critical hit (x1.5 damage).'),
  ('player_self_edit', 'false',
   'When true, trainers may edit their own Pokémon''s KP and XP directly (the old tabletop behaviour). When false only the Game Master can.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Pokémon types
-- ---------------------------------------------------------------------------
create or replace function public.is_valid_pokemon_type(p_type text)
returns boolean
language sql
immutable
as $$
  select p_type in (
    'normal','fire','water','electric','grass','ice','fighting','poison','ground',
    'flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'
  );
$$;

alter table public.species
  add column if not exists type1 text,
  add column if not exists type2 text;

alter table public.species drop constraint if exists species_type1_valid;
alter table public.species add constraint species_type1_valid
  check (type1 is null or public.is_valid_pokemon_type(type1));
alter table public.species drop constraint if exists species_type2_valid;
alter table public.species add constraint species_type2_valid
  check (type2 is null or public.is_valid_pokemon_type(type2));

-- The Gible line, used as the example boss in the battle spec. Adding a
-- species is only a data insert; no evolution rule is assumed for it.
insert into public.species (id, name) values
  (443, 'Gible'), (444, 'Gabite'), (445, 'Garchomp')
on conflict (id) do nothing;

-- Only fills species whose types haven't been set yet, so a Game Master's
-- own edits are never overwritten if this migration is re-run.
update public.species s
set type1 = t.t1, type2 = t.t2
from (values
  (1,'grass','poison'),(2,'grass','poison'),(3,'grass','poison'),
  (4,'fire',null),(5,'fire',null),(6,'fire','flying'),
  (7,'water',null),(8,'water',null),(9,'water',null),
  (10,'bug',null),(11,'bug',null),(12,'bug','flying'),
  (13,'bug','poison'),(14,'bug','poison'),(15,'bug','poison'),
  (16,'normal','flying'),(17,'normal','flying'),(18,'normal','flying'),
  (19,'normal',null),(20,'normal',null),
  (21,'normal','flying'),(22,'normal','flying'),
  (23,'poison',null),(24,'poison',null),
  (25,'electric',null),(26,'electric',null),
  (27,'ground',null),(28,'ground',null),
  (29,'poison',null),(30,'poison',null),(31,'poison','ground'),
  (32,'poison',null),(33,'poison',null),(34,'poison','ground'),
  (35,'fairy',null),(36,'fairy',null),
  (37,'fire',null),(38,'fire',null),
  (39,'normal','fairy'),(40,'normal','fairy'),
  (41,'poison','flying'),(42,'poison','flying'),
  (43,'grass','poison'),(44,'grass','poison'),(45,'grass','poison'),
  (46,'bug','grass'),(47,'bug','grass'),
  (48,'bug','poison'),(49,'bug','poison'),
  (50,'ground',null),(51,'ground',null),
  (52,'normal',null),(53,'normal',null),
  (54,'water',null),(55,'water',null),
  (56,'fighting',null),(57,'fighting',null),
  (58,'fire',null),(59,'fire',null),
  (60,'water',null),(61,'water',null),(62,'water','fighting'),
  (63,'psychic',null),(64,'psychic',null),(65,'psychic',null),
  (66,'fighting',null),(67,'fighting',null),(68,'fighting',null),
  (69,'grass','poison'),(70,'grass','poison'),(71,'grass','poison'),
  (72,'water','poison'),(73,'water','poison'),
  (74,'rock','ground'),(75,'rock','ground'),(76,'rock','ground'),
  (77,'fire',null),(78,'fire',null),
  (79,'water','psychic'),(80,'water','psychic'),
  (81,'electric','steel'),(82,'electric','steel'),
  (83,'normal','flying'),(84,'normal','flying'),(85,'normal','flying'),
  (86,'water',null),(87,'water','ice'),
  (88,'poison',null),(89,'poison',null),
  (90,'water',null),(91,'water','ice'),
  (92,'ghost','poison'),(93,'ghost','poison'),(94,'ghost','poison'),
  (95,'rock','ground'),
  (96,'psychic',null),(97,'psychic',null),
  (98,'water',null),(99,'water',null),
  (100,'electric',null),(101,'electric',null),
  (102,'grass','psychic'),(103,'grass','psychic'),
  (104,'ground',null),(105,'ground',null),
  (106,'fighting',null),(107,'fighting',null),
  (108,'normal',null),
  (109,'poison',null),(110,'poison',null),
  (111,'ground','rock'),(112,'ground','rock'),
  (113,'normal',null),(114,'grass',null),(115,'normal',null),
  (116,'water',null),(117,'water',null),
  (118,'water',null),(119,'water',null),
  (120,'water',null),(121,'water','psychic'),
  (122,'psychic','fairy'),(123,'bug','flying'),(124,'ice','psychic'),
  (125,'electric',null),(126,'fire',null),(127,'bug',null),(128,'normal',null),
  (129,'water',null),(130,'water','flying'),(131,'water','ice'),
  (132,'normal',null),(133,'normal',null),
  (134,'water',null),(135,'electric',null),(136,'fire',null),
  (137,'normal',null),
  (138,'rock','water'),(139,'rock','water'),(140,'rock','water'),(141,'rock','water'),
  (142,'rock','flying'),(143,'normal',null),
  (144,'ice','flying'),(145,'electric','flying'),(146,'fire','flying'),
  (147,'dragon',null),(148,'dragon',null),(149,'dragon','flying'),
  (150,'psychic',null),(151,'psychic',null),
  (280,'psychic','fairy'),(281,'psychic','fairy'),(282,'psychic','fairy'),
  (403,'electric',null),(404,'electric',null),(405,'electric',null),
  (443,'dragon','ground'),(444,'dragon','ground'),(445,'dragon','ground'),
  (447,'fighting',null),(448,'fighting','steel')
) as t(id, t1, t2)
where s.id = t.id and s.type1 is null;

-- ---------------------------------------------------------------------------
-- Type chart. Only non-neutral pairs are stored; anything missing is x1.
-- ---------------------------------------------------------------------------
create table if not exists public.type_effectiveness (
  attack_type  text not null check (public.is_valid_pokemon_type(attack_type)),
  defend_type  text not null check (public.is_valid_pokemon_type(defend_type)),
  multiplier   numeric(3,2) not null check (multiplier >= 0),
  primary key (attack_type, defend_type)
);

alter table public.type_effectiveness enable row level security;
drop policy if exists "type_effectiveness_select_authenticated" on public.type_effectiveness;
create policy "type_effectiveness_select_authenticated"
  on public.type_effectiveness for select to authenticated using (true);
drop policy if exists "type_effectiveness_admin_write" on public.type_effectiveness;
create policy "type_effectiveness_admin_write"
  on public.type_effectiveness for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into public.type_effectiveness (attack_type, defend_type, multiplier) values
  ('normal','rock',0.5),('normal','ghost',0),('normal','steel',0.5),
  ('fire','fire',0.5),('fire','water',0.5),('fire','grass',2),('fire','ice',2),('fire','bug',2),('fire','rock',0.5),('fire','dragon',0.5),('fire','steel',2),
  ('water','fire',2),('water','water',0.5),('water','grass',0.5),('water','ground',2),('water','rock',2),('water','dragon',0.5),
  ('electric','water',2),('electric','electric',0.5),('electric','grass',0.5),('electric','ground',0),('electric','flying',2),('electric','dragon',0.5),
  ('grass','fire',0.5),('grass','water',2),('grass','grass',0.5),('grass','poison',0.5),('grass','ground',2),('grass','flying',0.5),('grass','bug',0.5),('grass','rock',2),('grass','dragon',0.5),('grass','steel',0.5),
  ('ice','fire',0.5),('ice','water',0.5),('ice','grass',2),('ice','ice',0.5),('ice','ground',2),('ice','flying',2),('ice','dragon',2),('ice','steel',0.5),
  ('fighting','normal',2),('fighting','ice',2),('fighting','poison',0.5),('fighting','flying',0.5),('fighting','psychic',0.5),('fighting','bug',0.5),('fighting','rock',2),('fighting','ghost',0),('fighting','dark',2),('fighting','steel',2),('fighting','fairy',0.5),
  ('poison','grass',2),('poison','poison',0.5),('poison','ground',0.5),('poison','rock',0.5),('poison','ghost',0.5),('poison','steel',0),('poison','fairy',2),
  ('ground','fire',2),('ground','electric',2),('ground','grass',0.5),('ground','poison',2),('ground','flying',0),('ground','bug',0.5),('ground','rock',2),('ground','steel',2),
  ('flying','electric',0.5),('flying','grass',2),('flying','fighting',2),('flying','bug',2),('flying','rock',0.5),('flying','steel',0.5),
  ('psychic','fighting',2),('psychic','poison',2),('psychic','psychic',0.5),('psychic','dark',0),('psychic','steel',0.5),
  ('bug','fire',0.5),('bug','grass',2),('bug','fighting',0.5),('bug','poison',0.5),('bug','flying',0.5),('bug','psychic',2),('bug','ghost',0.5),('bug','dark',2),('bug','steel',0.5),('bug','fairy',0.5),
  ('rock','fire',2),('rock','ice',2),('rock','fighting',0.5),('rock','ground',0.5),('rock','flying',2),('rock','bug',2),('rock','steel',0.5),
  ('ghost','normal',0),('ghost','psychic',2),('ghost','ghost',2),('ghost','dark',0.5),
  ('dragon','dragon',2),('dragon','steel',0.5),('dragon','fairy',0),
  ('dark','fighting',0.5),('dark','psychic',2),('dark','ghost',2),('dark','dark',0.5),('dark','fairy',0.5),
  ('steel','fire',0.5),('steel','water',0.5),('steel','electric',0.5),('steel','ice',2),('steel','rock',2),('steel','steel',0.5),('steel','fairy',2),
  ('fairy','fire',0.5),('fairy','fighting',2),('fairy','poison',0.5),('fairy','dragon',2),('fairy','dark',2),('fairy','steel',0.5)
on conflict (attack_type, defend_type) do nothing;

-- ---------------------------------------------------------------------------
-- Moves catalog. Damaging moves only: power drives damage, accuracy null
-- means the move never misses (Swift, Aerial Ace, ...).
-- ---------------------------------------------------------------------------
create table if not exists public.moves (
  id          smallserial primary key,
  name        text not null unique,
  type        text not null check (public.is_valid_pokemon_type(type)),
  category    text not null check (category in ('physical', 'special')),
  power       integer not null check (power > 0),
  accuracy    integer check (accuracy is null or accuracy between 1 and 100),
  description text
);

alter table public.moves enable row level security;
drop policy if exists "moves_select_authenticated" on public.moves;
create policy "moves_select_authenticated" on public.moves for select to authenticated using (true);
drop policy if exists "moves_admin_write" on public.moves;
create policy "moves_admin_write" on public.moves for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into public.moves (name, type, category, power, accuracy) values
  ('Tackle','normal','physical',40,100),('Scratch','normal','physical',40,100),('Quick Attack','normal','physical',40,100),
  ('Swift','normal','special',60,null),('Headbutt','normal','physical',70,100),('Slash','normal','physical',70,100),
  ('Body Slam','normal','physical',85,100),('Hyper Voice','normal','special',90,100),('Double-Edge','normal','physical',120,100),
  ('Hyper Beam','normal','special',150,90),
  ('Ember','fire','special',40,100),('Flame Wheel','fire','physical',60,100),('Fire Fang','fire','physical',65,95),
  ('Flamethrower','fire','special',90,100),('Fire Blast','fire','special',110,85),('Flare Blitz','fire','physical',120,100),
  ('Water Gun','water','special',40,100),('Bubble Beam','water','special',65,100),('Waterfall','water','physical',80,100),
  ('Surf','water','special',90,100),('Aqua Tail','water','physical',90,90),('Hydro Pump','water','special',110,80),
  ('Thunder Shock','electric','special',40,100),('Spark','electric','physical',65,100),('Thunder Fang','electric','physical',65,95),
  ('Thunderbolt','electric','special',90,100),('Wild Charge','electric','physical',90,100),('Thunder','electric','special',110,70),
  ('Vine Whip','grass','physical',45,100),('Razor Leaf','grass','physical',55,95),('Magical Leaf','grass','special',60,null),
  ('Seed Bomb','grass','physical',80,100),('Energy Ball','grass','special',90,100),('Leaf Blade','grass','physical',90,100),
  ('Solar Beam','grass','special',120,100),
  ('Powder Snow','ice','special',40,100),('Ice Shard','ice','physical',40,100),('Ice Fang','ice','physical',65,95),
  ('Ice Beam','ice','special',90,100),('Blizzard','ice','special',110,70),
  ('Karate Chop','fighting','physical',50,100),('Double Kick','fighting','physical',60,100),('Brick Break','fighting','physical',75,100),
  ('Aura Sphere','fighting','special',80,null),('Close Combat','fighting','physical',120,100),('Focus Blast','fighting','special',120,70),
  ('Acid','poison','special',40,100),('Poison Fang','poison','physical',50,100),('Sludge','poison','special',65,100),
  ('Poison Jab','poison','physical',80,100),('Sludge Bomb','poison','special',90,100),('Gunk Shot','poison','physical',120,80),
  ('Mud Shot','ground','special',55,95),('Bulldoze','ground','physical',60,100),('Dig','ground','physical',80,100),
  ('Earth Power','ground','special',90,100),('Earthquake','ground','physical',100,100),
  ('Gust','flying','special',40,100),('Wing Attack','flying','physical',60,100),('Aerial Ace','flying','physical',60,null),
  ('Air Slash','flying','special',75,95),('Drill Peck','flying','physical',80,100),('Hurricane','flying','special',110,70),
  ('Brave Bird','flying','physical',120,100),
  ('Confusion','psychic','special',50,100),('Psybeam','psychic','special',65,100),('Zen Headbutt','psychic','physical',80,90),
  ('Psychic','psychic','special',90,100),
  ('Struggle Bug','bug','special',50,100),('Bug Bite','bug','physical',60,100),('Signal Beam','bug','special',75,100),
  ('X-Scissor','bug','physical',80,100),('Bug Buzz','bug','special',90,100),('Megahorn','bug','physical',120,85),
  ('Rock Throw','rock','physical',50,90),('Rock Tomb','rock','physical',60,95),('Ancient Power','rock','special',60,100),
  ('Rock Slide','rock','physical',75,90),('Power Gem','rock','special',80,100),('Stone Edge','rock','physical',100,80),
  ('Shadow Sneak','ghost','physical',40,100),('Hex','ghost','special',65,100),('Shadow Claw','ghost','physical',70,100),
  ('Shadow Ball','ghost','special',80,100),
  ('Twister','dragon','special',40,100),('Dragon Breath','dragon','special',60,100),('Dragon Claw','dragon','physical',80,100),
  ('Dragon Pulse','dragon','special',85,100),('Outrage','dragon','physical',120,100),('Draco Meteor','dragon','special',130,90),
  ('Snarl','dark','special',55,95),('Bite','dark','physical',60,100),('Night Slash','dark','physical',70,100),
  ('Crunch','dark','physical',80,100),('Dark Pulse','dark','special',80,100),
  ('Bullet Punch','steel','physical',40,100),('Metal Claw','steel','physical',50,95),('Iron Head','steel','physical',80,100),
  ('Flash Cannon','steel','special',80,100),('Meteor Mash','steel','physical',90,90),('Iron Tail','steel','physical',100,75),
  ('Fairy Wind','fairy','special',40,100),('Draining Kiss','fairy','special',50,100),('Dazzling Gleam','fairy','special',80,100),
  ('Play Rough','fairy','physical',90,90),('Moonblast','fairy','special',95,100)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Trainer Pokémon: battle stats + move sets.
-- Stats are derived from level (40 + 6 x level) plus an admin-set bonus per
-- stat, so every level-up automatically raises them. Moves are optional: a
-- Pokémon with no assigned moves uses a sensible default set for its types
-- and level (see default_move_ids()).
-- ---------------------------------------------------------------------------
alter table public.trainer_pokemon
  add column if not exists bonus_attack     integer not null default 0,
  add column if not exists bonus_defense    integer not null default 0,
  add column if not exists bonus_sp_attack  integer not null default 0,
  add column if not exists bonus_sp_defense integer not null default 0,
  add column if not exists bonus_speed      integer not null default 0;

create table if not exists public.trainer_pokemon_moves (
  pokemon_id uuid not null references public.trainer_pokemon (id) on delete cascade,
  slot       smallint not null check (slot between 1 and 4),
  move_id    smallint not null references public.moves (id) on delete cascade,
  primary key (pokemon_id, slot)
);

alter table public.trainer_pokemon_moves enable row level security;
drop policy if exists "trainer_pokemon_moves_select" on public.trainer_pokemon_moves;
create policy "trainer_pokemon_moves_select" on public.trainer_pokemon_moves for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.trainer_pokemon tp where tp.id = pokemon_id and public.is_own_profile(tp.profile_id))
  );
drop policy if exists "trainer_pokemon_moves_admin_write" on public.trainer_pokemon_moves;
create policy "trainer_pokemon_moves_admin_write" on public.trainer_pokemon_moves for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Close a gap in the existing update guard: columns added after Phase 4
-- (xp, is_dead, is_shiny) were never protected, so a trainer could set
-- their own XP straight through the API. Same rules as before otherwise.
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

  -- auth.uid() is null only for trusted server contexts (SQL editor,
  -- service role); signed-out API clients are already stopped by RLS.
  if not public.is_admin() and auth.uid() is not null then
    new.profile_id       := old.profile_id;
    new.species_id       := old.species_id;
    new.nickname         := old.nickname;
    new.level            := old.level;
    new.nature           := old.nature;
    new.ability          := old.ability;
    new.held_item_id     := old.held_item_id;
    new.current_hp       := old.current_hp;
    new.max_hp           := old.max_hp;
    new.status           := old.status;
    new.caught_at        := old.caught_at;
    new.xp               := old.xp;
    new.is_dead          := old.is_dead;
    new.is_shiny         := old.is_shiny;
    new.bonus_attack     := old.bonus_attack;
    new.bonus_defense    := old.bonus_defense;
    new.bonus_sp_attack  := old.bonus_sp_attack;
    new.bonus_sp_defense := old.bonus_sp_defense;
    new.bonus_speed      := old.bonus_speed;
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
-- Items: battle effects, read by battle_use_item(). Data, not code, so a
-- Game Master can give a custom item a healing effect with one UPDATE.
--   {"heal": 20}                 restore up to 20 KP (conscious only)
--   {"heal_full": true}          restore to full KP (conscious only)
--   {"revive": 0.5}              revive a fainted Pokémon to 50% KP
--   {"cure": ["poisoned"]}       cure listed statuses; {"cure": true} = any
-- Keys combine, e.g. Full Restore = heal_full + cure.
-- ---------------------------------------------------------------------------
alter table public.items_catalog add column if not exists battle_effect jsonb;

insert into public.items_catalog (name, category, pokeapi_slug, description, value, sort_order) values
  ('Max Revive', 'medicine', 'max-revive', 'Revives a fainted Pokémon and fully restores its KP.', 4000, 7),
  ('Burn Heal', 'medicine', 'burn-heal', 'Heals a Pokémon of a burn.', 250, 11),
  ('Ice Heal', 'medicine', 'ice-heal', 'Thaws out a frozen Pokémon.', 250, 12)
on conflict (name) do nothing;

update public.items_catalog ic set battle_effect = e.effect
from (values
  ('Potion', '{"heal": 20}'::jsonb),
  ('Super Potion', '{"heal": 60}'::jsonb),
  ('Hyper Potion', '{"heal": 120}'::jsonb),
  ('Max Potion', '{"heal_full": true}'::jsonb),
  ('Full Restore', '{"heal_full": true, "cure": true}'::jsonb),
  ('Revive', '{"revive": 0.5}'::jsonb),
  ('Max Revive', '{"revive": 1}'::jsonb),
  ('Antidote', '{"cure": ["poisoned"]}'::jsonb),
  ('Paralyze Heal', '{"cure": ["paralyzed"]}'::jsonb),
  ('Awakening', '{"cure": ["asleep"]}'::jsonb),
  ('Burn Heal', '{"cure": ["burned"]}'::jsonb),
  ('Ice Heal', '{"cure": ["frozen"]}'::jsonb),
  ('Full Heal', '{"cure": true}'::jsonb)
) as e(name, effect)
where ic.name = e.name and ic.battle_effect is null;

insert into public.shop_listings (item_id, price, stock, is_enabled)
select ic.id, seed.price, null, true
from (values ('Burn Heal', 250), ('Ice Heal', 250)) as seed(name, price)
join public.items_catalog ic on ic.name = seed.name
on conflict (item_id) do nothing;

-- ---------------------------------------------------------------------------
-- battle_encounters: new columns for admin-driven ("auto") encounters.
-- `notes` (already present) doubles as the optional encounter description.
-- current_kp/max_kp/enemy_name/level are kept in sync from battle_enemies by
-- a trigger, so every existing list view keeps working unchanged.
-- ---------------------------------------------------------------------------
alter table public.battle_encounters
  add column if not exists mode               text not null default 'manual',
  add column if not exists enemy_auto_attack  boolean not null default true,
  add column if not exists enemy_damage_scale numeric(4,2) not null default 1.00,
  add column if not exists completed_at       timestamptz,
  add column if not exists rewarded_at        timestamptz;

alter table public.battle_encounters drop constraint if exists battle_encounters_mode_check;
alter table public.battle_encounters add constraint battle_encounters_mode_check check (mode in ('manual', 'auto'));
alter table public.battle_encounters drop constraint if exists battle_encounters_damage_scale_check;
alter table public.battle_encounters add constraint battle_encounters_damage_scale_check
  check (enemy_damage_scale > 0 and enemy_damage_scale <= 5);

-- Status lifecycle for auto encounters:
--   active -> completed (all enemies fainted) -> rewarded
--   active -> lost      (every trainer is out of usable Pokémon) -> rewarded/ended
--   any unrewarded state -> ended (cancelled by the Game Master)
-- Manual encounters keep using only active/ended.
alter table public.battle_encounters drop constraint if exists battle_encounters_status_check;
alter table public.battle_encounters add constraint battle_encounters_status_check
  check (status in ('active', 'completed', 'lost', 'rewarded', 'ended'));

create index if not exists battle_encounters_status_idx on public.battle_encounters (status, created_at desc);

-- ---------------------------------------------------------------------------
-- battle_enemies — one row per enemy Pokémon in an auto encounter.
-- ---------------------------------------------------------------------------
create table if not exists public.battle_enemies (
  id            uuid primary key default gen_random_uuid(),
  encounter_id  uuid not null references public.battle_encounters (id) on delete cascade,
  slot          smallint not null check (slot between 1 and 6),
  name          text not null,
  species_id    smallint references public.species (id),
  sprite_url    text,
  level         integer not null check (level >= 1),
  current_hp    integer not null check (current_hp >= 0),
  max_hp        integer not null check (max_hp > 0),
  attack        integer not null check (attack > 0),
  defense       integer not null check (defense > 0),
  sp_attack     integer not null check (sp_attack > 0),
  sp_defense    integer not null check (sp_defense > 0),
  speed         integer not null check (speed > 0),
  type1         text not null check (public.is_valid_pokemon_type(type1)),
  type2         text check (type2 is null or public.is_valid_pokemon_type(type2)),
  move_ids      smallint[] not null default '{}',
  fainted_at    timestamptz,
  created_at    timestamptz not null default now(),
  constraint battle_enemies_hp_range check (current_hp <= max_hp),
  unique (encounter_id, slot)
);

create index if not exists battle_enemies_encounter_idx on public.battle_enemies (encounter_id, slot);

alter table public.battle_enemies enable row level security;
drop policy if exists "battle_enemies_select_authenticated" on public.battle_enemies;
create policy "battle_enemies_select_authenticated" on public.battle_enemies for select to authenticated using (true);
drop policy if exists "battle_enemies_admin_write" on public.battle_enemies;
create policy "battle_enemies_admin_write" on public.battle_enemies for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.sync_encounter_enemy_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_encounter_id uuid := coalesce(new.encounter_id, old.encounter_id);
begin
  update public.battle_encounters e
  set current_kp = coalesce(t.cur, 0),
      max_kp = greatest(coalesce(t.mx, 1), 1),
      level = greatest(coalesce(t.lvl, e.level), 1)
  from (
    select sum(current_hp) as cur, sum(max_hp) as mx, max(level) as lvl
    from public.battle_enemies where encounter_id = v_encounter_id
  ) t
  where e.id = v_encounter_id and e.mode = 'auto';
  return null;
end;
$$;

drop trigger if exists battle_enemies_sync_totals on public.battle_enemies;
create trigger battle_enemies_sync_totals
  after insert or update of current_hp, max_hp, level or delete on public.battle_enemies
  for each row execute procedure public.sync_encounter_enemy_totals();

-- ---------------------------------------------------------------------------
-- battle_players — which trainers the Game Master put into an encounter,
-- and which of their Pokémon is currently out.
-- ---------------------------------------------------------------------------
create table if not exists public.battle_players (
  id                 uuid primary key default gen_random_uuid(),
  encounter_id       uuid not null references public.battle_encounters (id) on delete cascade,
  profile_id         uuid not null references public.profiles (id) on delete cascade,
  active_pokemon_id  uuid references public.trainer_pokemon (id) on delete set null,
  damage_dealt       integer not null default 0 check (damage_dealt >= 0),
  joined_at          timestamptz not null default now(),
  unique (encounter_id, profile_id)
);

create index if not exists battle_players_profile_idx on public.battle_players (profile_id);
create index if not exists battle_players_encounter_idx on public.battle_players (encounter_id);

-- Security definer so the policy below can look at battle_players without
-- recursing into its own RLS.
create or replace function public.is_battle_member(p_encounter_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.battle_players
    where encounter_id = p_encounter_id and profile_id = public.my_profile_id()
  );
$$;

alter table public.battle_players enable row level security;
drop policy if exists "battle_players_select" on public.battle_players;
create policy "battle_players_select" on public.battle_players for select to authenticated
  using (public.is_admin() or public.is_battle_member(encounter_id));
drop policy if exists "battle_players_admin_write" on public.battle_players;
create policy "battle_players_admin_write" on public.battle_players for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- battle_logs: richer entries for the auto battle log. The original columns
-- stay as they were; old rows simply have nulls in the new ones.
-- ---------------------------------------------------------------------------
alter table public.battle_logs
  add column if not exists action            text,
  add column if not exists actor_profile_id  uuid references public.profiles (id) on delete set null,
  add column if not exists enemy_id          uuid references public.battle_enemies (id) on delete set null,
  add column if not exists move_name         text,
  add column if not exists is_critical       boolean,
  add column if not exists effectiveness     numeric(4,2),
  add column if not exists message           text;

alter table public.battle_logs drop constraint if exists battle_logs_target_type_check;
alter table public.battle_logs add constraint battle_logs_target_type_check
  check (target_type in ('trainer_pokemon', 'enemy', 'system'));

-- Manual-mode joins stay self-service; auto encounters are admin-assigned
-- only, so a trainer can no longer insert themselves into one directly.
drop policy if exists "battle_participants_join_own" on public.battle_participants;
create policy "battle_participants_join_own"
  on public.battle_participants for insert to authenticated
  with check (
    public.is_admin()
    or (
      public.is_own_profile(profile_id)
      and exists (select 1 from public.battle_encounters e where e.id = encounter_id and e.mode = 'manual')
    )
  );

drop policy if exists "battle_participants_leave_own" on public.battle_participants;
create policy "battle_participants_leave_own"
  on public.battle_participants for delete to authenticated
  using (
    public.is_admin()
    or (
      public.is_own_profile(profile_id)
      and exists (select 1 from public.battle_encounters e where e.id = encounter_id and e.mode = 'manual')
    )
  );

-- ---------------------------------------------------------------------------
-- money_transactions — a permanent per-trainer money ledger. Written only by
-- trusted functions (battle rewards today); trainers can read their own.
-- ---------------------------------------------------------------------------
create table if not exists public.money_transactions (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references public.profiles (id) on delete cascade,
  amount         integer not null,
  balance_after  integer not null,
  kind           text not null,
  source_type    text,
  source_id      uuid,
  note           text,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists money_transactions_profile_idx on public.money_transactions (profile_id, created_at desc);
create index if not exists money_transactions_source_idx on public.money_transactions (source_type, source_id);

alter table public.money_transactions enable row level security;
drop policy if exists "money_transactions_select_own" on public.money_transactions;
create policy "money_transactions_select_own" on public.money_transactions for select to authenticated
  using (public.is_own_profile(profile_id) or public.is_admin());
-- No insert/update/delete policy at all: rows only ever come from
-- security-definer functions, and are never edited or removed.

-- ---------------------------------------------------------------------------
-- Battle rewards. One battle_rewards row per encounter (unique), so a
-- reward can never be issued twice — not by a double click, not by a
-- refresh, not by two admins at once.
-- ---------------------------------------------------------------------------
create table if not exists public.battle_rewards (
  id                 uuid primary key default gen_random_uuid(),
  encounter_id       uuid not null unique references public.battle_encounters (id) on delete cascade,
  admin_id           uuid references public.profiles (id) on delete set null,
  money_mode         text not null check (money_mode in ('equal', 'per_player', 'custom')),
  money_input        integer not null check (money_input >= 0),
  total_money        integer not null check (total_money >= 0),
  xp_mode            text not null check (xp_mode in ('equal', 'per_player', 'custom')),
  xp_input           integer not null check (xp_input >= 0),
  total_xp           integer not null check (total_xp >= 0),
  participant_count  integer not null check (participant_count > 0),
  created_at         timestamptz not null default now()
);

create table if not exists public.battle_reward_recipients (
  id              uuid primary key default gen_random_uuid(),
  reward_id       uuid not null references public.battle_rewards (id) on delete cascade,
  encounter_id    uuid not null references public.battle_encounters (id) on delete cascade,
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  money           integer not null check (money >= 0),
  xp              integer not null check (xp >= 0),
  xp_pokemon_id   uuid references public.trainer_pokemon (id) on delete set null,
  xp_pokemon_name text,
  xp_claimed_at   timestamptz,
  level_before    integer,
  level_after     integer,
  created_at      timestamptz not null default now(),
  unique (encounter_id, profile_id)
);

create index if not exists battle_reward_recipients_profile_idx
  on public.battle_reward_recipients (profile_id, xp_claimed_at);

alter table public.battle_rewards enable row level security;
alter table public.battle_reward_recipients enable row level security;

drop policy if exists "battle_rewards_select" on public.battle_rewards;
create policy "battle_rewards_select" on public.battle_rewards for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.battle_reward_recipients r where r.reward_id = battle_rewards.id and public.is_own_profile(r.profile_id))
  );

drop policy if exists "battle_reward_recipients_select" on public.battle_reward_recipients;
create policy "battle_reward_recipients_select" on public.battle_reward_recipients for select to authenticated
  using (public.is_admin() or public.is_own_profile(profile_id));
-- Again, no write policies: only give_battle_rewards()/claim_battle_xp()
-- (security definer) ever write these rows.

-- ---------------------------------------------------------------------------
-- Realtime for the new tables.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['battle_enemies', 'battle_players', 'battle_reward_recipients'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
