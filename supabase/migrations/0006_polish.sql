-- ============================================================================
-- PokéGear — Phase 7: Notifications, City Themes & Trainer Experience
-- ============================================================================

-- ---------------------------------------------------------------------------
-- City theme metadata. The *values* (which color, which badge, which
-- wallpaper) live here in Supabase and load dynamically; the client only
-- knows how to turn a wallpaper_key into an actual CSS background, the same
-- separation already used for Pokémon/item sprites.
-- ---------------------------------------------------------------------------
alter table public.cities
  add column if not exists theme_key     text not null default 'default',
  add column if not exists accent_color  text not null default '#8B7CFF',
  add column if not exists badge_emoji   text not null default '🌐',
  add column if not exists wallpaper_key text not null default 'default-dusk';

update public.cities set
  theme_key = 'harmonia', accent_color = '#3B6CE0', badge_emoji = '🏯', wallpaper_key = 'harmonia-castle'
where name = 'Harmonia City';

update public.cities set
  theme_key = 'blutenhain', accent_color = '#3FB6A8', badge_emoji = '🌸', wallpaper_key = 'blutenhain-bloom'
where name = 'Blütenhain';

update public.cities set
  theme_key = 'windcity', accent_color = '#C0463C', badge_emoji = '🍂', wallpaper_key = 'windcity-autumn'
where name = 'Wind City';

update public.cities set
  theme_key = 'crystalcity', accent_color = '#8B7CFF', badge_emoji = '💎', wallpaper_key = 'crystalcity-night'
where name = 'Crystal City';

-- ---------------------------------------------------------------------------
-- Lightweight, honest notification preferences: these filter what shows up
-- in the trainer's own notification feed client-side. (Trade/purchase/admin
-- writes still happen server-side regardless, same as real push-notification
-- systems still log the event even if you've muted the banner.)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{"trades":true,"purchases":true,"system":true}'::jsonb;

-- ---------------------------------------------------------------------------
-- Trainers may now clear their own notifications (in addition to the
-- existing admin-delete policy from Phase 5).
-- ---------------------------------------------------------------------------
drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own"
  on public.notifications for delete
  to authenticated
  using (public.is_own_profile(profile_id));

-- ---------------------------------------------------------------------------
-- Grant notifications. trainer_pokemon only ever gains a new row when an
-- admin gives one directly (trades only ever transfer existing rows), so
-- this can notify unconditionally with no risk of double-notifying a trade.
-- ---------------------------------------------------------------------------
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
  insert into public.notifications (profile_id, kind, title, body)
  values (
    new.profile_id,
    'pokemon_received',
    'Pokémon received!',
    format('%s joined your team.', coalesce(new.nickname, v_species_name))
  );
  return new;
end;
$$;

drop trigger if exists trainer_pokemon_notify_grant on public.trainer_pokemon;
create trigger trainer_pokemon_notify_grant
  after insert on public.trainer_pokemon
  for each row execute procedure public.notify_pokemon_grant();

-- ---------------------------------------------------------------------------
-- Item grant notifications. purchase_item() and confirm_trade() both also
-- write to trainer_items, but they already send their own specific
-- notification ("Purchase complete", "Trade completed") — so both now set a
-- suppression flag around their trainer_items writes, and this trigger only
-- fires for everything else (i.e. a genuine ad-hoc admin grant).
-- ---------------------------------------------------------------------------
create or replace function public.notify_item_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_name text;
  v_delta integer;
begin
  if current_setting('pokegear.suppress_item_notification', true) = 'on' then
    return new;
  end if;

  v_delta := new.quantity - coalesce(old.quantity, 0);
  if v_delta <= 0 then
    return new;
  end if;

  select name into v_item_name from public.items_catalog where id = new.item_id;
  insert into public.notifications (profile_id, kind, title, body)
  values (
    new.profile_id,
    'item_received',
    'Item received!',
    format('You received %sx %s.', v_delta, v_item_name)
  );
  return new;
end;
$$;

drop trigger if exists trainer_items_notify_grant on public.trainer_items;
create trigger trainer_items_notify_grant
  after insert or update on public.trainer_items
  for each row execute procedure public.notify_item_grant();

-- ---------------------------------------------------------------------------
-- Admin money-reward notifications, folded into the existing Phase 3/5
-- profile guard trigger (which already runs on every profiles UPDATE).
-- purchase_item()/confirm_trade() set pokegear.bypass_profile_guard around
-- their own money changes, so this only fires for a genuine direct admin
-- adjustment.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_profile_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bypassed boolean := current_setting('pokegear.bypass_profile_guard', true) = 'on';
begin
  if not v_bypassed then
    if not public.is_admin() then
      new.role       := old.role;
      new.money      := old.money;
      new.auth_id    := old.auth_id;
      new.trainer_id := old.trainer_id;
      new.created_at := old.created_at;
    elsif new.money > old.money then
      insert into public.notifications (profile_id, kind, title, body)
      values (
        new.id,
        'admin_reward',
        'Admin reward',
        format('An admin gave you ₽%s.', new.money - old.money)
      );
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Re-point purchase_item() and confirm_trade() to suppress the generic
-- item-grant notification around their own trainer_items writes.
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
-- Notes
-- ---------------------------------------------------------------------------
-- * notification_prefs is intentionally simple: {"trades":bool,
--   "purchases":bool, "system":bool}. The client filters the feed by mapping
--   each notification's `kind` into one of these three buckets. Server-side
--   writes are unaffected by preference — muting a category hides it from
--   your feed, it doesn't stop the underlying event from being recorded.
-- * Assign a wallpaper to a trainer directly:
--     update public.profiles set wallpaper = 'crystalcity-night'
--     where username = 'misty123';
--   Valid preset keys live in the client (src/lib/cityThemes.ts); an admin
--   can also set any real image URL here instead of a preset key.
