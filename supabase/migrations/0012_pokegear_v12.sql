-- ============================================================================
-- PokéGear 12.0
-- ============================================================================
-- Run AFTER 0011_pokegear_v11.sql. Everything here is additive and safe to run
-- on a database that already has players and Pokémon.
--
--   1. "Confused" status + the Calming Remedy item that cures it
--   2. Shop prices (the campaign's own price list) and the shop line-up
--   3. Purchases also go into the money ledger
--   4. trainer_pokemon.updated_at
--   5. HP history: every change to a Pokémon's current KP is recorded, with
--      where it came from (battle, Pokémon Center, GM, player, ...)
--   6. damage_pokemon()          — GM or the owner deals damage
--      admin_set_pokemon_hp()    — GM sets KP / status directly
--   7. create_pokemon()          — the Pokémon creation form (GM for any
--      trainer; a trainer for themselves only when the GM allows it)
--
-- Note: `alter type ... add value` can't be USED in the same transaction it
-- is added in, so nothing below casts 'confused' at run time; the functions
-- only reference it when they are called later.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Confused status + Calming Remedy
-- ---------------------------------------------------------------------------
alter type public.pokemon_status add value if not exists 'confused';

insert into public.items_catalog
  (name, category, pokeapi_slug, icon_emoji, description, value, is_tradable, is_sellable, sort_order, battle_effect)
values
  ('Calming Remedy', 'medicine', null, '🌿', 'Calms a confused Pokémon and snaps it out of its confusion.',
   200, true, true, 13, '{"cure": ["confused"]}'::jsonb)
on conflict (name) do update
  set battle_effect = coalesce(public.items_catalog.battle_effect, excluded.battle_effect);

-- ---------------------------------------------------------------------------
-- 2. Shop prices. shop_listings.price is the one price the Shop, the
-- purchase sheet and purchase_item() all read; items_catalog.value is set to
-- the same number so the admin item data agrees.
-- Everything not on the list is taken off the shelf (is_enabled = false, so
-- the GM can switch any of it back on in the Shop's admin panel). Nothing is
-- deleted and nobody loses items they own.
-- ---------------------------------------------------------------------------
drop table if exists pg_temp._v12_prices;
create temporary table _v12_prices (name text primary key, price integer not null);
insert into _v12_prices values
  ('Poké Ball', 200),        -- Pokéball
  ('Great Ball', 600),       -- Superball
  ('Ultra Ball', 1200),      -- Hyperball
  ('Potion', 200),           -- Trank
  ('Super Potion', 500),     -- Supertrank
  ('Revive', 800),           -- Beleber
  ('Awakening', 200),        -- Aufwecker
  ('Antidote', 150),         -- Gegengift
  ('Paralyze Heal', 200),    -- Para-Heiler
  ('Ice Heal', 250),         -- Eisheiler
  ('Burn Heal', 250),        -- Feuerheiler
  ('Calming Remedy', 200),   -- Beruhiger
  ('Full Heal', 700);        -- Hyperheiler

do $$
declare
  v_missing text;
begin
  select string_agg(p.name, ', ') into v_missing
  from _v12_prices p left join public.items_catalog ic on ic.name = p.name
  where ic.id is null;
  if v_missing is not null then
    raise exception 'PokéGear 12: these shop items are missing from items_catalog: %', v_missing;
  end if;
end $$;

insert into public.shop_listings (item_id, price, stock, is_enabled)
select ic.id, p.price, null, true
from _v12_prices p join public.items_catalog ic on ic.name = p.name
on conflict (item_id) do update set price = excluded.price, is_enabled = true;

update public.items_catalog ic set value = p.price
from _v12_prices p where ic.name = p.name and ic.value is distinct from p.price;

update public.shop_listings sl set is_enabled = false
where sl.is_enabled
  and sl.item_id not in (select ic.id from public.items_catalog ic join _v12_prices p on p.name = ic.name);

drop table _v12_prices;

-- ---------------------------------------------------------------------------
-- 3. purchase_item — unchanged rules (price read from the listing, money
-- checked under a row lock, stock, atomic), plus a money ledger entry.
-- ---------------------------------------------------------------------------
create or replace function public.purchase_item(p_listing_id uuid, p_quantity integer default 1)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing    public.shop_listings;
  v_item       public.items_catalog;
  v_profile_id uuid;
  v_money      integer;
  v_total      integer;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Quantity must be at least 1';
  end if;
  if p_quantity > 999 then
    raise exception 'You can buy at most 999 at once';
  end if;

  select * into v_listing from public.shop_listings where id = p_listing_id for update;
  if v_listing.id is null then
    raise exception 'This item is no longer available in the Shop';
  end if;
  if not v_listing.is_enabled then
    raise exception 'This item is not currently for sale';
  end if;

  select * into v_item from public.items_catalog where id = v_listing.item_id;

  v_total := v_listing.price * p_quantity;

  select id, money into v_profile_id, v_money
  from public.profiles
  where auth_id = auth.uid()
  for update;

  if v_profile_id is null then
    raise exception 'Trainer profile not found';
  end if;

  if v_money < v_total then
    raise exception 'You do not have enough money to purchase this item.';
  end if;

  if v_listing.stock is not null then
    if v_listing.stock < p_quantity then
      raise exception 'Not enough stock left in the Shop';
    end if;
    update public.shop_listings set stock = stock - p_quantity where id = p_listing_id;
  end if;

  perform set_config('pokegear.bypass_profile_guard', 'on', true);
  update public.profiles set money = money - v_total where id = v_profile_id;

  insert into public.money_transactions (profile_id, amount, balance_after, kind, source_type, source_id, note, created_by)
  values (v_profile_id, -v_total, v_money - v_total, 'purchase', 'shop', p_listing_id,
          format('%sx %s at ₽%s', p_quantity, v_item.name, v_listing.price), v_profile_id);

  perform set_config('pokegear.suppress_item_notification', 'on', true);
  insert into public.trainer_items (profile_id, item_id, quantity)
  values (v_profile_id, v_item.id, p_quantity)
  on conflict (profile_id, item_id)
  do update set quantity = public.trainer_items.quantity + excluded.quantity;

  insert into public.notifications (profile_id, kind, title, body)
  values (
    v_profile_id,
    'purchase',
    'Purchase complete',
    format('You bought %sx %s for ₽%s.', p_quantity, v_item.name, v_total)
  );
end;
$$;

grant execute on function public.purchase_item(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. updated_at on trainer_pokemon (caught_at is the created timestamp).
-- ---------------------------------------------------------------------------
alter table public.trainer_pokemon
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_trainer_pokemon_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trainer_pokemon_touch_updated_at on public.trainer_pokemon;
create trigger trainer_pokemon_touch_updated_at
  before update on public.trainer_pokemon
  for each row execute procedure public.touch_trainer_pokemon_updated_at();

-- ---------------------------------------------------------------------------
-- 5. HP history. One trigger records every change to current KP, whatever
-- caused it, so there is a single place to look. The source comes from the
-- function doing the change (pokegear.hp_source); functions that already
-- existed are tagged below with ALTER FUNCTION ... SET, which needs no
-- change to their code. (If one of them is ever re-created with CREATE OR
-- REPLACE, re-run its ALTER FUNCTION line — it'll then log as 'other'.)
-- ---------------------------------------------------------------------------
create table if not exists public.pokemon_hp_events (
  id           uuid primary key default gen_random_uuid(),
  pokemon_id   uuid not null references public.trainer_pokemon (id) on delete cascade,
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  previous_hp  integer not null,
  new_hp       integer not null,
  max_hp       integer not null,
  delta        integer not null,
  source       text not null,
  actor_id     uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default clock_timestamp()
);

create index if not exists pokemon_hp_events_pokemon_idx on public.pokemon_hp_events (pokemon_id, created_at desc);
create index if not exists pokemon_hp_events_profile_idx on public.pokemon_hp_events (profile_id, created_at desc);

alter table public.pokemon_hp_events enable row level security;
drop policy if exists "pokemon_hp_events_select" on public.pokemon_hp_events;
create policy "pokemon_hp_events_select" on public.pokemon_hp_events for select to authenticated
  using (public.is_own_profile(profile_id) or public.is_admin());
-- No insert/update/delete policies: only the trigger below writes.

create or replace function public.log_pokemon_hp_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pokemon_hp_events (pokemon_id, profile_id, previous_hp, new_hp, max_hp, delta, source, actor_id)
  values (
    new.id, new.profile_id, old.current_hp, new.current_hp, new.max_hp, new.current_hp - old.current_hp,
    coalesce(nullif(current_setting('pokegear.hp_source', true), ''),
             case when auth.uid() is null then 'system' else 'other' end),
    public.my_profile_id()
  );
  return null;
end;
$$;

drop trigger if exists trainer_pokemon_log_hp on public.trainer_pokemon;
create trigger trainer_pokemon_log_hp
  after update of current_hp on public.trainer_pokemon
  for each row
  when (old.current_hp is distinct from new.current_hp)
  execute procedure public.log_pokemon_hp_change();

alter function public.battle_attack(uuid, smallint, uuid)                set pokegear.hp_source = 'battle';
alter function public.admin_enemy_attack(uuid, uuid, uuid)               set pokegear.hp_source = 'battle';
alter function public.battle_use_item(uuid, uuid, uuid)                  set pokegear.hp_source = 'battle_item';
alter function public._battle_status_chip(uuid, uuid)                    set pokegear.hp_source = 'status_effect';
alter function public.heal_pokemon(uuid)                                 set pokegear.hp_source = 'pokemon_center';
alter function public.revive_pokemon(uuid)                               set pokegear.hp_source = 'pokemon_center';
alter function public.heal_party(uuid[])                                 set pokegear.hp_source = 'pokemon_center';
alter function public.adjust_pokemon_kp(uuid, integer, text, uuid)       set pokegear.hp_source = 'kp_editor';
alter function public.admin_set_pokemon_dead(uuid, text)                 set pokegear.hp_source = 'gm';
alter function public._apply_pokemon_xp(uuid, integer, boolean)         set pokegear.hp_source = 'level_up';

-- ---------------------------------------------------------------------------
-- 6. Damage and direct KP setting
-- ---------------------------------------------------------------------------

-- The active auto battle a trainer is in, if any.
create or replace function public._active_encounter_for(p_profile_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id from public.battle_players bp
  join public.battle_encounters e on e.id = bp.encounter_id
  where bp.profile_id = p_profile_id and e.mode = 'auto' and e.status = 'active'
  order by e.created_at desc
  limit 1;
$$;

-- When a KP change happens outside the battle engine while the owner is in
-- a battle, write it to that battle's log (so everyone's battle screen
-- refreshes and the GM sees it), and let the battle end if nobody can fight.
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
end;
$$;

-- Deal damage. Allowed for the Game Master (any Pokémon) and for a trainer
-- on their OWN Pokémon (also during a battle). Damage only ever lowers KP;
-- KP stops at 0 and the Pokémon faints. Max KP is never touched.
create or replace function public.damage_pokemon(p_pokemon_id uuid, p_amount integer)
returns public.trainer_pokemon
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.trainer_pokemon;
  v_admin boolean := public.is_admin();
  v_new integer;
  v_result public.trainer_pokemon;
begin
  if p_amount is null then
    raise exception 'Enter how much damage to deal.';
  end if;
  if p_amount < 0 then
    raise exception 'Damage cannot be negative.';
  end if;

  select * into v_p from public.trainer_pokemon where id = p_pokemon_id for update;
  if v_p.id is null then
    raise exception 'Pokémon not found';
  end if;
  if not v_admin and not public.is_own_profile(v_p.profile_id) then
    raise exception 'You cannot modify this Pokémon.';
  end if;
  if v_p.is_dead then
    raise exception 'This Pokémon has died and cannot be changed.';
  end if;
  if v_p.status = 'fainted' or v_p.current_hp = 0 then
    raise exception 'This Pokémon has already fainted.';
  end if;
  if p_amount = 0 then
    return v_p;
  end if;

  v_new := greatest(0, v_p.current_hp - p_amount);

  perform set_config('pokegear.hp_source', case when v_admin then 'gm_damage' else 'player_damage' end, true);
  perform set_config('pokegear.bypass_pokemon_guard', 'on', true);
  update public.trainer_pokemon
  set current_hp = v_new,
      status = case when v_new = 0 then 'fainted'::public.pokemon_status else status end
  where id = p_pokemon_id
  returning * into v_result;

  perform public._battle_note_external_hp(v_result, v_p.current_hp,
    format('%s took %s damage (%s).', public._pokemon_label(v_p.id), v_p.current_hp - v_new,
           case when v_admin then 'Game Master' else 'recorded by its trainer' end));

  return v_result;
end;
$$;

grant execute on function public.damage_pokemon(uuid, integer) to authenticated;

-- Game Master: set current KP to an exact value (0 = fainted) and, if
-- given, a status. Raising KP above 0 on a fainted Pokémon revives it.
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
  end if;

  return v_result;
end;
$$;

grant execute on function public.admin_set_pokemon_hp(uuid, integer, public.pokemon_status) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Pokémon creation
-- ---------------------------------------------------------------------------
insert into public.game_config (key, value, description) values
  ('player_create_pokemon', 'false',
   'When true, trainers may create Pokémon for themselves with the creation form. The Game Master can always create Pokémon for any trainer.')
on conflict (key) do nothing;

-- First free PC slot of a trainer (making a new box if every box is full).
create or replace function public._find_pc_slot(p_profile_id uuid)
returns public.pokemon_location
language plpgsql
security definer
set search_path = public
as $$
declare
  v_box record;
  v_slot smallint;
  v_next integer;
  v_result public.pokemon_location;
begin
  for v_box in select id, capacity from public.pc_boxes where profile_id = p_profile_id order by box_number loop
    select gs into v_slot from generate_series(1, v_box.capacity) gs
    where not exists (select 1 from public.trainer_pokemon where box_id = v_box.id and box_slot = gs)
    order by gs limit 1;
    if v_slot is not null then
      v_result.box_id := v_box.id;
      v_result.box_slot := v_slot;
      return v_result;
    end if;
  end loop;
  select coalesce(max(box_number), 0) + 1 into v_next from public.pc_boxes where profile_id = p_profile_id;
  if v_next > 32 then
    raise exception 'This trainer''s PC is completely full';
  end if;
  insert into public.pc_boxes (profile_id, box_number, name) values (p_profile_id, v_next, 'Box ' || v_next)
  returning id into v_result.box_id;
  v_result.box_slot := 1;
  return v_result;
end;
$$;

-- Returns {"pokemon": <row>, "placed": "team"|"pc", "team_full": bool}.
-- p_to_pc = true puts it straight into the PC even if the Team has room.
create or replace function public.create_pokemon(
  p_profile_id uuid,
  p_species_id integer,
  p_nickname text,
  p_level integer,
  p_max_hp integer,
  p_current_hp integer,
  p_status public.pokemon_status default 'healthy',
  p_is_shiny boolean default false,
  p_to_pc boolean default false,
  p_nature text default null,
  p_ability text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean := public.is_admin();
  v_target public.profiles;
  v_max_level integer;
  v_nickname text := nullif(btrim(coalesce(p_nickname, '')), '');
  v_current integer := coalesce(p_current_hp, p_max_hp);
  v_status public.pokemon_status := coalesce(p_status, 'healthy');
  v_team_slot smallint;
  v_loc public.pokemon_location;
  v_row public.trainer_pokemon;
begin
  -- Who may create for whom (checked here, not in the UI).
  if p_profile_id is null then
    raise exception 'Choose a trainer for this Pokémon.';
  end if;
  select * into v_target from public.profiles where id = p_profile_id for update; -- also serializes slot picking
  if v_target.id is null then
    raise exception 'Trainer not found';
  end if;
  if v_admin then
    if v_target.role <> 'trainer' then
      raise exception 'Pokémon can only be created for a trainer, not for a Game Master account.';
    end if;
  else
    if not public.is_own_profile(p_profile_id) then
      raise exception 'You cannot create Pokémon for another trainer.';
    end if;
    if not public.get_config_bool('player_create_pokemon', false) then
      raise exception 'The Game Master hasn''t enabled Pokémon creation for trainers.';
    end if;
  end if;

  -- Validation
  if p_species_id is null or not exists (select 1 from public.species where id = p_species_id) then
    raise exception 'Choose a Pokémon species.';
  end if;
  if v_nickname is not null and char_length(v_nickname) > 24 then
    raise exception 'Nickname is too long (24 characters max).';
  end if;
  v_max_level := coalesce(public.get_config_int('max_level', 8), 8);
  if p_level is null or p_level < 1 or p_level > v_max_level then
    raise exception 'Level must be between 1 and %.', v_max_level;
  end if;
  if p_max_hp is null or p_max_hp < 1 then
    raise exception 'Maximum HP must be a positive number.';
  end if;
  if p_max_hp > 9999 then
    raise exception 'Maximum HP can be at most 9999.';
  end if;
  if v_current < 0 then
    raise exception 'Current HP cannot be below 0.';
  end if;
  if v_current > p_max_hp then
    raise exception 'Current HP cannot be greater than Maximum HP.';
  end if;
  if v_current = 0 then
    v_status := 'fainted';
  elsif v_status::text = 'fainted' then
    raise exception 'A fainted Pokémon must have 0 current HP.';
  end if;
  if p_nature is not null and btrim(p_nature) <> '' and p_nature not in (
    'Hardy','Lonely','Brave','Adamant','Naughty','Bold','Docile','Relaxed',
    'Impish','Lax','Timid','Hasty','Serious','Jolly','Naive','Modest','Mild',
    'Quiet','Bashful','Rash','Calm','Gentle','Sassy','Careful','Quirky') then
    raise exception 'Unknown nature: %', p_nature;
  end if;

  -- Where it goes: a free Team slot, otherwise (or if asked) the PC.
  if not coalesce(p_to_pc, false) then
    select gs into v_team_slot from generate_series(1, 6) gs
    where not exists (select 1 from public.trainer_pokemon where profile_id = p_profile_id and party_slot = gs)
    order by gs limit 1;
  end if;
  if v_team_slot is not null then
    v_loc.party_slot := v_team_slot;
  else
    v_loc := public._find_pc_slot(p_profile_id);
  end if;

  if not v_admin then
    -- A trainer making their own Pokémon gets no "Pokémon received!" ping;
    -- the GM still sees it in the activity log.
    perform set_config('pokegear.suppress_pokemon_notification', 'on', true);
  end if;

  insert into public.trainer_pokemon
    (profile_id, species_id, nickname, level, nature, ability, current_hp, max_hp, status,
     party_slot, box_id, box_slot, xp, is_shiny)
  values
    (p_profile_id, p_species_id, v_nickname, p_level,
     coalesce(nullif(btrim(coalesce(p_nature, '')), ''), 'Hardy'),
     coalesce(nullif(btrim(coalesce(p_ability, '')), ''), 'Unknown'),
     v_current, p_max_hp, v_status,
     v_loc.party_slot, v_loc.box_id, v_loc.box_slot,
     public.xp_for_level(p_level), coalesce(p_is_shiny, false))
  returning * into v_row;

  if not v_admin then
    perform set_config('pokegear.suppress_pokemon_notification', 'off', true);
    insert into public.admin_activity_log (admin_id, action, target_profile_id, details)
    values (v_target.id, 'pokemon_self_created', v_target.id,
            jsonb_build_object('species', (select name from public.species where id = p_species_id),
                               'level', p_level, 'max_hp', p_max_hp));
  end if;

  return jsonb_build_object(
    'pokemon', to_jsonb(v_row),
    'placed', case when v_row.party_slot is not null then 'team' else 'pc' end,
    'team_full', (v_team_slot is null and not coalesce(p_to_pc, false))
  );
end;
$$;

grant execute on function public.create_pokemon(uuid, integer, text, integer, integer, integer, public.pokemon_status, boolean, boolean, text, text) to authenticated;

-- "Pokémon received!" now says where it went.
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
      case when new.party_slot is not null
        then format('%s joined your team.', coalesce(new.nickname, v_species_name))
        else format('%s was sent to your PC (your team is full).', coalesce(new.nickname, v_species_name))
      end
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
-- Lock down internal helpers (same as 0010 / 0011).
-- ---------------------------------------------------------------------------
revoke execute on function public._active_encounter_for(uuid) from public, anon, authenticated;
revoke execute on function public._battle_note_external_hp(public.trainer_pokemon, integer, text) from public, anon, authenticated;
revoke execute on function public._find_pc_slot(uuid) from public, anon, authenticated;
revoke execute on function public.log_pokemon_hp_change() from public, anon, authenticated;
revoke execute on function public.touch_trainer_pokemon_updated_at() from public, anon, authenticated;
