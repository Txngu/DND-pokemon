-- ============================================================================
-- PokéGear — Phase 6: Player Trading System
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Small reusable helpers
-- ---------------------------------------------------------------------------
create or replace function public.my_profile_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.profiles where auth_id = auth.uid();
$$;

create type public.pokemon_location as (party_slot smallint, box_id uuid, box_slot smallint);

-- Finds the first open party slot, or failing that the first open box slot,
-- for a given trainer. Used only internally by confirm_trade() below — a
-- traded-in Pokémon has to land somewhere valid, same as any other move.
create or replace function public.find_open_slot(p_profile_id uuid)
returns public.pokemon_location
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot smallint;
  v_box record;
  result public.pokemon_location;
begin
  select gs into v_slot
  from generate_series(1, 6) gs
  where not exists (
    select 1 from public.trainer_pokemon where profile_id = p_profile_id and party_slot = gs
  )
  order by gs limit 1;

  if v_slot is not null then
    result.party_slot := v_slot;
    return result;
  end if;

  for v_box in select id, capacity from public.pc_boxes where profile_id = p_profile_id order by box_number
  loop
    select gs into v_slot
    from generate_series(1, v_box.capacity) gs
    where not exists (
      select 1 from public.trainer_pokemon where box_id = v_box.id and box_slot = gs
    )
    order by gs limit 1;

    if v_slot is not null then
      result.box_id := v_box.id;
      result.box_slot := v_slot;
      return result;
    end if;
  end loop;

  raise exception 'Recipient has no open party or PC slot to receive this Pokémon';
end;
$$;

-- ---------------------------------------------------------------------------
-- Privacy-safe trainer directory. A VIEW (not a table) that only ever
-- exposes username/trainer_id/avatar — never email, money, city, or role —
-- so "search for a trainer" can never leak private profile data. Views are
-- owned by the migration role, which bypasses the underlying profiles RLS
-- (the same way it already does for other reference-style reads), so every
-- authenticated trainer can search the whole directory while `profiles`
-- itself stays locked to each trainer's own row.
-- ---------------------------------------------------------------------------
create or replace view public.trainer_directory as
  select id as profile_id, username, trainer_id, avatar
  from public.profiles;

grant select on public.trainer_directory to authenticated;

-- ---------------------------------------------------------------------------
-- Core trade tables
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'trade_status') then
    create type public.trade_status as enum ('pending', 'accepted', 'declined', 'cancelled', 'completed');
  end if;
end $$;

create table if not exists public.trades (
  id                  uuid primary key default gen_random_uuid(),
  initiator_id        uuid not null references public.profiles (id) on delete cascade,
  recipient_id        uuid not null references public.profiles (id) on delete cascade,
  status              public.trade_status not null default 'pending',
  initiator_money     integer not null default 0 check (initiator_money >= 0),
  recipient_money     integer not null default 0 check (recipient_money >= 0),
  initiator_confirmed boolean not null default false,
  recipient_confirmed boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  completed_at        timestamptz,
  constraint trades_distinct_parties check (initiator_id <> recipient_id)
);

create index if not exists trades_initiator_idx on public.trades (initiator_id, status);
create index if not exists trades_recipient_idx on public.trades (recipient_id, status);

create or replace function public.touch_trade_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trades_touch_updated_at on public.trades;
create trigger trades_touch_updated_at
  before update on public.trades
  for each row execute procedure public.touch_trade_updated_at();

create table if not exists public.trade_pokemon (
  id         uuid primary key default gen_random_uuid(),
  trade_id   uuid not null references public.trades (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  pokemon_id uuid not null references public.trainer_pokemon (id) on delete cascade,
  unique (trade_id, pokemon_id)
);

create index if not exists trade_pokemon_trade_id_idx on public.trade_pokemon (trade_id);
create index if not exists trade_pokemon_pokemon_id_idx on public.trade_pokemon (pokemon_id);

create table if not exists public.trade_items (
  id         uuid primary key default gen_random_uuid(),
  trade_id   uuid not null references public.trades (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  item_id    uuid not null references public.items_catalog (id) on delete restrict,
  quantity   integer not null check (quantity > 0),
  unique (trade_id, profile_id, item_id)
);

create index if not exists trade_items_trade_id_idx on public.trade_items (trade_id);

-- ---------------------------------------------------------------------------
-- Offer validation triggers — these fire no matter which code path inserts a
-- row, so set_trade_offer() below isn't the only thing standing between a
-- trainer and an invalid offer.
-- ---------------------------------------------------------------------------
create or replace function public.validate_trade_pokemon()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trade public.trades;
  v_owner uuid;
begin
  select * into v_trade from public.trades where id = new.trade_id;

  if v_trade.status <> 'accepted' then
    raise exception 'Offers can only be changed while a trade is active';
  end if;

  if new.profile_id <> v_trade.initiator_id and new.profile_id <> v_trade.recipient_id then
    raise exception 'You are not a party to this trade';
  end if;

  select profile_id into v_owner from public.trainer_pokemon where id = new.pokemon_id;
  if v_owner is distinct from new.profile_id then
    raise exception 'You can only offer your own Pokémon';
  end if;

  if exists (
    select 1
    from public.trade_pokemon tp
    join public.trades t on t.id = tp.trade_id
    where tp.pokemon_id = new.pokemon_id
      and tp.trade_id <> new.trade_id
      and t.status in ('pending', 'accepted')
  ) then
    raise exception 'That Pokémon is already offered in another active trade';
  end if;

  return new;
end;
$$;

drop trigger if exists trade_pokemon_validate on public.trade_pokemon;
create trigger trade_pokemon_validate
  before insert on public.trade_pokemon
  for each row execute procedure public.validate_trade_pokemon();

create or replace function public.validate_trade_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trade  public.trades;
  v_item   public.items_catalog;
  v_owned  integer;
begin
  select * into v_trade from public.trades where id = new.trade_id;

  if v_trade.status <> 'accepted' then
    raise exception 'Offers can only be changed while a trade is active';
  end if;

  if new.profile_id <> v_trade.initiator_id and new.profile_id <> v_trade.recipient_id then
    raise exception 'You are not a party to this trade';
  end if;

  select * into v_item from public.items_catalog where id = new.item_id;
  if not v_item.is_tradable then
    raise exception '% cannot be traded', v_item.name;
  end if;

  select quantity into v_owned from public.trainer_items
  where profile_id = new.profile_id and item_id = new.item_id;

  if coalesce(v_owned, 0) < new.quantity then
    raise exception 'You do not have % of that item to offer', new.quantity;
  end if;

  return new;
end;
$$;

drop trigger if exists trade_items_validate on public.trade_items;
create trigger trade_items_validate
  before insert on public.trade_items
  for each row execute procedure public.validate_trade_items();

-- ---------------------------------------------------------------------------
-- Row Level Security — trainers can only ever READ trades they're part of.
-- Every write goes through the functions below; there is deliberately no
-- direct insert/update/delete policy for the 'authenticated' role on any of
-- these three tables, so the business rules below can't be bypassed by a
-- client calling the table API directly.
-- ---------------------------------------------------------------------------
create or replace function public.is_own_trade(p_trade_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.trades t
    where t.id = p_trade_id
      and (t.initiator_id = public.my_profile_id() or t.recipient_id = public.my_profile_id())
  ) or public.is_admin();
$$;

alter table public.trades enable row level security;
alter table public.trade_pokemon enable row level security;
alter table public.trade_items enable row level security;

drop policy if exists "trades_select_own" on public.trades;
create policy "trades_select_own"
  on public.trades for select
  to authenticated
  using (initiator_id = public.my_profile_id() or recipient_id = public.my_profile_id() or public.is_admin());

drop policy if exists "trades_admin_write" on public.trades;
create policy "trades_admin_write"
  on public.trades for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "trade_pokemon_select_own" on public.trade_pokemon;
create policy "trade_pokemon_select_own"
  on public.trade_pokemon for select
  to authenticated
  using (public.is_own_trade(trade_id));

drop policy if exists "trade_pokemon_admin_write" on public.trade_pokemon;
create policy "trade_pokemon_admin_write"
  on public.trade_pokemon for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "trade_items_select_own" on public.trade_items;
create policy "trade_items_select_own"
  on public.trade_items for select
  to authenticated
  using (public.is_own_trade(trade_id));

drop policy if exists "trade_items_admin_write" on public.trade_items;
create policy "trade_items_admin_write"
  on public.trade_items for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- trainer_pokemon's own RLS (from Phase 3) only lets a trainer see their own
-- Pokémon. A trade detail view needs to show the OTHER party's offered
-- Pokémon too (name, sprite, level) — so this adds one more permissive SELECT
-- policy (Postgres OR's multiple permissive policies together) that opens
-- read-only visibility of a Pokémon specifically when it's currently
-- offered in a trade the caller is part of. It grants nothing beyond that:
-- no visibility into a stranger's Pokémon outside of an active shared trade.
drop policy if exists "trainer_pokemon_select_traded" on public.trainer_pokemon;
create policy "trainer_pokemon_select_traded"
  on public.trainer_pokemon for select
  to authenticated
  using (
    exists (
      select 1 from public.trade_pokemon tp
      where tp.pokemon_id = trainer_pokemon.id
        and public.is_own_trade(tp.trade_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Function: send_trade_request
-- ---------------------------------------------------------------------------
create or replace function public.send_trade_request(p_recipient_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.my_profile_id();
  v_trade_id uuid;
  v_my_username text;
begin
  if v_me is null then
    raise exception 'Trainer profile not found';
  end if;
  if v_me = p_recipient_profile_id then
    raise exception 'You cannot trade with yourself';
  end if;
  if not exists (select 1 from public.profiles where id = p_recipient_profile_id) then
    raise exception 'Trainer not found';
  end if;
  if exists (
    select 1 from public.trades
    where status in ('pending', 'accepted')
      and ((initiator_id = v_me and recipient_id = p_recipient_profile_id)
        or (initiator_id = p_recipient_profile_id and recipient_id = v_me))
  ) then
    raise exception 'You already have an active trade with this trainer';
  end if;

  insert into public.trades (initiator_id, recipient_id)
  values (v_me, p_recipient_profile_id)
  returning id into v_trade_id;

  select username into v_my_username from public.profiles where id = v_me;

  insert into public.notifications (profile_id, kind, title, body)
  values (
    p_recipient_profile_id,
    'trade_request',
    'New trade request',
    format('%s wants to trade with you.', v_my_username)
  );

  return v_trade_id;
end;
$$;

grant execute on function public.send_trade_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Function: respond_trade_request
-- ---------------------------------------------------------------------------
create or replace function public.respond_trade_request(p_trade_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trade public.trades;
  v_me uuid := public.my_profile_id();
  v_my_username text;
begin
  select * into v_trade from public.trades where id = p_trade_id for update;
  if v_trade.id is null then
    raise exception 'Trade not found';
  end if;
  if v_me <> v_trade.recipient_id then
    raise exception 'Only the recipient can respond to this request';
  end if;
  if v_trade.status <> 'pending' then
    raise exception 'This request has already been handled';
  end if;

  select username into v_my_username from public.profiles where id = v_me;

  if p_accept then
    update public.trades set status = 'accepted' where id = p_trade_id;
    insert into public.notifications (profile_id, kind, title, body)
    values (v_trade.initiator_id, 'trade_accepted', 'Trade accepted', format('%s accepted your trade request.', v_my_username));
  else
    update public.trades set status = 'declined' where id = p_trade_id;
    insert into public.notifications (profile_id, kind, title, body)
    values (v_trade.initiator_id, 'trade_declined', 'Trade declined', format('%s declined your trade request.', v_my_username));
  end if;
end;
$$;

grant execute on function public.respond_trade_request(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Function: cancel_trade
-- ---------------------------------------------------------------------------
create or replace function public.cancel_trade(p_trade_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trade public.trades;
  v_me uuid := public.my_profile_id();
  v_other uuid;
  v_my_username text;
begin
  select * into v_trade from public.trades where id = p_trade_id for update;
  if v_trade.id is null then
    raise exception 'Trade not found';
  end if;
  if v_me <> v_trade.initiator_id and v_me <> v_trade.recipient_id then
    raise exception 'You are not a party to this trade';
  end if;
  if v_trade.status not in ('pending', 'accepted') then
    raise exception 'This trade can no longer be cancelled';
  end if;

  v_other := case when v_me = v_trade.initiator_id then v_trade.recipient_id else v_trade.initiator_id end;
  select username into v_my_username from public.profiles where id = v_me;

  update public.trades set status = 'cancelled' where id = p_trade_id;

  insert into public.notifications (profile_id, kind, title, body)
  values (v_other, 'trade_cancelled', 'Trade cancelled', format('%s cancelled the trade.', v_my_username));
end;
$$;

grant execute on function public.cancel_trade(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Function: set_trade_offer — replaces the caller's entire offer for this
-- trade in one call. Changing an offer always resets both confirmations:
-- once the deal changes, both sides have to agree to it again.
-- ---------------------------------------------------------------------------
create or replace function public.set_trade_offer(
  p_trade_id uuid,
  p_pokemon_ids uuid[],
  p_items jsonb,
  p_money integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trade public.trades;
  v_me uuid := public.my_profile_id();
  v_my_money integer;
  v_pokemon_id uuid;
  v_item record;
begin
  select * into v_trade from public.trades where id = p_trade_id for update;
  if v_trade.id is null then
    raise exception 'Trade not found';
  end if;
  if v_me <> v_trade.initiator_id and v_me <> v_trade.recipient_id then
    raise exception 'You are not a party to this trade';
  end if;
  if v_trade.status <> 'accepted' then
    raise exception 'This trade is not open for offers';
  end if;
  if p_money is null or p_money < 0 then
    raise exception 'Money offered must be zero or more';
  end if;

  select money into v_my_money from public.profiles where id = v_me;
  if p_money > v_my_money then
    raise exception 'You do not have that much money';
  end if;

  delete from public.trade_pokemon where trade_id = p_trade_id and profile_id = v_me;
  delete from public.trade_items where trade_id = p_trade_id and profile_id = v_me;

  if p_pokemon_ids is not null then
    foreach v_pokemon_id in array p_pokemon_ids loop
      insert into public.trade_pokemon (trade_id, profile_id, pokemon_id) values (p_trade_id, v_me, v_pokemon_id);
    end loop;
  end if;

  if p_items is not null then
    for v_item in select * from jsonb_to_recordset(p_items) as x(item_id uuid, quantity integer) loop
      insert into public.trade_items (trade_id, profile_id, item_id, quantity)
      values (p_trade_id, v_me, v_item.item_id, v_item.quantity);
    end loop;
  end if;

  update public.trades set
    initiator_money = case when initiator_id = v_me then p_money else initiator_money end,
    recipient_money = case when recipient_id = v_me then p_money else recipient_money end,
    initiator_confirmed = false,
    recipient_confirmed = false
  where id = p_trade_id;
end;
$$;

grant execute on function public.set_trade_offer(uuid, uuid[], jsonb, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Function: confirm_trade — the only place a trade actually changes hands.
-- Confirms the caller's side; if the other side had already confirmed, the
-- whole swap executes atomically in the same transaction. Any failure here
-- (a Pokémon no longer available, insufficient items, no open PC slot)
-- raises an exception, which rolls back everything — nothing is half-moved.
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

  -- Lock both profiles in a fixed order (by id) regardless of who is who,
  -- so two trades between the same pair can never deadlock against
  -- each other.
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

  -- Both sides have confirmed — re-validate everything defensively, then
  -- execute the whole swap.
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

  -- Transfer Pokémon.
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
  end loop;

  -- Transfer items.
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

  -- Transfer money, in whichever direction(s) were offered.
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

grant execute on function public.confirm_trade(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
-- * There is intentionally no client-facing way to write to trades,
--   trade_pokemon, or trade_items directly — every rule in this file
--   (ownership, tradability, no double-offering a Pokémon, resetting
--   confirmations on change, atomic completion) lives in these functions,
--   not in the client. A malicious or buggy client can, at worst, call
--   these functions with bad arguments and get a clean error back.
-- * search the trainer_directory view like any other table, e.g.:
--     select * from trainer_directory
--     where username ilike '%ash%' or trainer_id = '00042'
--     limit 10;
