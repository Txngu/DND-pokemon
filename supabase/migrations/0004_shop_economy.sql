-- ============================================================================
-- PokéGear — Phase 5: Shop & Item Economy
-- ============================================================================

-- ---------------------------------------------------------------------------
-- item_category: Phase 3 shipped a narrow 4-value enum. Phase 5 needs the
-- fuller category list from the spec (Poké Ball, Medicine, Evolution,
-- Battle, Key Item, Quest, Other). Postgres can't ADD/rename enum values and
-- use them in the same transaction, so instead of ALTER TYPE we build a new
-- enum, migrate the column over to it, then drop the old one — the standard
-- safe pattern for changing an enum's value set.
-- ---------------------------------------------------------------------------
create type public.item_category_new as enum
  ('poke_ball', 'medicine', 'evolution', 'battle', 'key_item', 'quest', 'other');

alter table public.items_catalog add column category_new public.item_category_new;

update public.items_catalog
set category_new = (
  case
    when category = 'poke_ball' then 'poke_ball'
    when category = 'key_item' then 'key_item'
    when category = 'evolution_item' then 'evolution'
    when category = 'item' and name in (
      'Potion','Super Potion','Hyper Potion','Max Potion','Full Restore',
      'Revive','Antidote','Paralyze Heal','Awakening','Full Heal'
    ) then 'medicine'
    else 'other'
  end
)::text::public.item_category_new;

alter table public.items_catalog alter column category_new set not null;
alter table public.items_catalog drop column category;
drop type public.item_category;
alter type public.item_category_new rename to item_category;
alter table public.items_catalog rename column category_new to category;

-- ---------------------------------------------------------------------------
-- items_catalog: make room for fully custom, non-official items. A sprite
-- can now come from three places, tried in order by the client: an official
-- PokeAPI slug, a custom hosted image URL, or a plain emoji — so a D&D-style
-- "Ancient Relic" needs no real artwork at all.
-- ---------------------------------------------------------------------------
alter table public.items_catalog
  alter column pokeapi_slug drop not null,
  add column if not exists icon_url     text,
  add column if not exists icon_emoji   text,
  add column if not exists value        integer check (value is null or value >= 0),
  add column if not exists is_tradable  boolean not null default true,
  add column if not exists is_sellable  boolean not null default true,
  add column if not exists created_at   timestamptz not null default now();

alter table public.items_catalog
  add constraint items_catalog_has_icon check (
    pokeapi_slug is not null or icon_url is not null or icon_emoji is not null
  );

-- ---------------------------------------------------------------------------
-- Table: shop_listings — whether/how an item is currently for sale. Kept
-- separate from items_catalog on purpose: an item can exist (and be owned,
-- traded, shown in the Bag) without ever being sold in the Shop, and an
-- admin can pull an item from sale without deleting it out from under
-- trainers who already own it.
-- ---------------------------------------------------------------------------
create table if not exists public.shop_listings (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null unique references public.items_catalog (id) on delete restrict,
  price      integer not null check (price >= 0),
  stock      integer check (stock is null or stock >= 0), -- null = unlimited stock
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.shop_listings enable row level security;

drop policy if exists "shop_listings_select_authenticated" on public.shop_listings;
create policy "shop_listings_select_authenticated"
  on public.shop_listings for select
  to authenticated
  using (true);

drop policy if exists "shop_listings_admin_write" on public.shop_listings;
create policy "shop_listings_admin_write"
  on public.shop_listings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Table: notifications — a per-trainer event feed. Purchases are the first
-- thing that writes to it (this doubles as the Phase 5 "purchase record"
-- requirement), but it's generic enough for future admin/system messages.
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind       text not null default 'info',
  title      text not null,
  body       text not null default '',
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_profile_id_idx on public.notifications (profile_id, created_at desc);

alter table public.notifications enable row level security;

-- A trainer may only ever flip `read` on their own notifications.
create or replace function public.enforce_notification_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.profile_id := old.profile_id;
    new.kind       := old.kind;
    new.title      := old.title;
    new.body       := old.body;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_update_guard on public.notifications;
create trigger notifications_update_guard
  before update on public.notifications
  for each row execute procedure public.enforce_notification_update_guard();

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (public.is_own_profile(profile_id) or public.is_admin());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  to authenticated
  using (public.is_own_profile(profile_id) or public.is_admin())
  with check (public.is_own_profile(profile_id) or public.is_admin());

drop policy if exists "notifications_admin_insert" on public.notifications;
create policy "notifications_admin_insert"
  on public.notifications for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "notifications_admin_delete" on public.notifications;
create policy "notifications_admin_delete"
  on public.notifications for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Extend the Phase 3 profiles guard so a trusted function (purchase_item
-- below) can deduct money on the caller's own behalf, while a trainer still
-- can never set `money` directly via a raw client update.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_profile_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('pokegear.bypass_profile_guard', true) = 'on' then
    return new;
  end if;

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

-- ---------------------------------------------------------------------------
-- Function: purchase_item — the entire purchase flow in one atomic
-- transaction. The trainer's own profile is looked up from auth.uid()
-- server-side (never taken as a parameter), so there is no way to spend
-- someone else's money or credit someone else's Bag by construction.
-- ---------------------------------------------------------------------------
create or replace function public.purchase_item(p_listing_id uuid, p_quantity integer default 1)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing   public.shop_listings;
  v_item      public.items_catalog;
  v_profile_id uuid;
  v_money      integer;
  v_total      integer;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Quantity must be at least 1';
  end if;

  -- Lock the listing first so two simultaneous purchases can't both read
  -- the same stock count and both succeed.
  select * into v_listing from public.shop_listings where id = p_listing_id for update;
  if v_listing.id is null then
    raise exception 'This item is no longer available in the Shop';
  end if;
  if not v_listing.is_enabled then
    raise exception 'This item is not currently for sale';
  end if;

  select * into v_item from public.items_catalog where id = v_listing.item_id;

  v_total := v_listing.price * p_quantity;

  -- Lock the caller's own profile row (derived from the JWT, never a
  -- parameter) so two purchases in flight at once can't both pass the
  -- money check against a now-stale balance.
  select id, money into v_profile_id, v_money
  from public.profiles
  where auth_id = auth.uid()
  for update;

  if v_profile_id is null then
    raise exception 'Trainer profile not found';
  end if;

  if v_money < v_total then
    raise exception 'Not enough money for this purchase';
  end if;

  if v_listing.stock is not null then
    if v_listing.stock < p_quantity then
      raise exception 'Not enough stock left in the Shop';
    end if;
    update public.shop_listings set stock = stock - p_quantity where id = p_listing_id;
  end if;

  perform set_config('pokegear.bypass_profile_guard', 'on', true);
  update public.profiles set money = money - v_total where id = v_profile_id;

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
-- Seed: shop listings for existing Phase 3 items, plus a few new items to
-- populate the Battle and Quest categories and demonstrate custom
-- (non-official) items with emoji icons instead of PokeAPI sprites.
-- ---------------------------------------------------------------------------
insert into public.items_catalog (name, category, pokeapi_slug, icon_emoji, description, value, is_tradable, is_sellable, sort_order) values
  ('X Attack', 'battle', 'x-attack', null, 'Sharply raises a Pokémon''s Attack stat in battle.', 500, true, true, 20),
  ('X Defense', 'battle', 'x-defense', null, 'Sharply raises a Pokémon''s Defense stat in battle.', 500, true, true, 21),
  ('X Speed', 'battle', 'x-speed', null, 'Sharply raises a Pokémon''s Speed stat in battle.', 350, true, true, 22),
  ('Mysterious Key', 'quest', null, '🗝️', 'An ornate key of unknown origin. It hums faintly when held near old ruins.', 5000, false, false, 1),
  ('Village Elder''s Charm', 'quest', null, '📿', 'A charm entrusted to you by the village elder. Quest reward only — not for sale.', null, false, false, 2)
on conflict (name) do nothing;

insert into public.shop_listings (item_id, price, stock, is_enabled)
select ic.id, seed.price, seed.stock, true
from (values
  ('Poké Ball', 200, null),
  ('Great Ball', 600, null),
  ('Ultra Ball', 1200, null),
  ('Potion', 200, null),
  ('Super Potion', 700, null),
  ('Hyper Potion', 1500, null),
  ('Max Potion', 2500, null),
  ('Full Restore', 3000, null),
  ('Revive', 1500, null),
  ('Antidote', 100, null),
  ('Paralyze Heal', 200, null),
  ('Awakening', 250, null),
  ('Full Heal', 400, null),
  ('Repel', 350, null),
  ('Escape Rope', 550, null),
  ('Rare Candy', 4800, 20),
  ('Fire Stone', 3000, 10),
  ('Water Stone', 3000, 10),
  ('Thunder Stone', 3000, 10),
  ('Leaf Stone', 3000, 10),
  ('Moon Stone', 3000, 10),
  ('Sun Stone', 3000, 10),
  ('Dusk Stone', 3000, 10),
  ('Shiny Stone', 3000, 10),
  ('King''s Rock', 5000, 3),
  ('Metal Coat', 5000, 3),
  ('Dragon Scale', 5000, 3),
  ('Up-Grade', 5000, 3),
  ('X Attack', 500, null),
  ('X Defense', 550, null),
  ('X Speed', 350, null),
  ('Mysterious Key', 5000, 1)
) as seed(name, price, stock)
join public.items_catalog ic on ic.name = seed.name
on conflict (item_id) do nothing;

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
-- * Master Ball, Safari Ball, Premier Ball, and all Key Items intentionally
--   have no shop_listings row — they exist in items_catalog (so they can
--   still be owned, gifted by an admin, or traded later) but are simply not
--   for sale, the same way they aren't purchasable in the games. This is
--   also how you take an item off the shelf without deleting it: remove
--   its shop_listings row (or set is_enabled = false to keep the row for
--   later re-enabling).
-- * "Village Elder's Charm" ships with is_sellable = false and no shop
--   listing at all — a pure quest item, the kind of fully custom object the
--   D&D campaign needs, obtainable only by an admin granting it directly:
--     insert into public.trainer_items (profile_id, item_id, quantity)
--     values (
--       (select id from public.profiles where username = '...'),
--       (select id from public.items_catalog where name = 'Village Elder''s Charm'),
--       1
--     );
