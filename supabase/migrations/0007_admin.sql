-- ============================================================================
-- PokéGear — Phase 8: Admin Dashboard, Rewards & Production Polish
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'reward_kind') then
    create type public.reward_kind as enum ('money', 'items', 'pokemon');
  end if;
  if not exists (select 1 from pg_type where typname = 'reward_status') then
    create type public.reward_status as enum ('draft', 'sent');
  end if;
  if not exists (select 1 from pg_type where typname = 'reward_recipient_mode') then
    create type public.reward_recipient_mode as enum ('user', 'users', 'all', 'city');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Table: reward_batches — a prepared reward, created as a draft and only
-- ever delivered by an explicit admin button press (send_admin_reward()
-- below). No scheduling of any kind: a batch is either not sent yet, or it's
-- sent, immediately, the moment an admin asks for it to be.
-- ---------------------------------------------------------------------------
create table if not exists public.reward_batches (
  id                uuid primary key default gen_random_uuid(),
  admin_id          uuid not null references public.profiles (id) on delete cascade,
  kind              public.reward_kind not null,
  status            public.reward_status not null default 'draft',
  message           text not null default '',
  payload           jsonb not null default '{}'::jsonb,
  recipient_mode    public.reward_recipient_mode not null,
  recipient_target  jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  sent_at           timestamptz
);

create table if not exists public.reward_deliveries (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references public.reward_batches (id) on delete cascade,
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  delivered_at  timestamptz not null default now()
);

create index if not exists reward_deliveries_batch_id_idx on public.reward_deliveries (batch_id);
create index if not exists reward_deliveries_recipient_id_idx on public.reward_deliveries (recipient_id);

-- ---------------------------------------------------------------------------
-- Table: admin_activity_log — a permanent audit trail of admin actions.
-- Populated by triggers on the tables admins actually write to (below), not
-- by the client remembering to log itself, so it can't be bypassed by a
-- client that simply doesn't bother calling a "log this" endpoint.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_activity_log (
  id                 uuid primary key default gen_random_uuid(),
  admin_id           uuid references public.profiles (id) on delete set null,
  action             text not null,
  target_profile_id  uuid references public.profiles (id) on delete set null,
  details            jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create index if not exists admin_activity_log_created_at_idx on public.admin_activity_log (created_at desc);

-- ---------------------------------------------------------------------------
-- RLS — every one of these three tables is admin-only, full stop. There is
-- no trainer-facing read or write path at all; a trainer's own copy of "what
-- did I receive" is the notification they already got when it was sent.
-- ---------------------------------------------------------------------------
alter table public.reward_batches enable row level security;
alter table public.reward_deliveries enable row level security;
alter table public.admin_activity_log enable row level security;

drop policy if exists "reward_batches_admin_only" on public.reward_batches;
create policy "reward_batches_admin_only"
  on public.reward_batches for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "reward_deliveries_admin_only" on public.reward_deliveries;
create policy "reward_deliveries_admin_only"
  on public.reward_deliveries for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admin_activity_log_admin_only" on public.admin_activity_log;
create policy "admin_activity_log_admin_only"
  on public.admin_activity_log for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Function: send_admin_reward — the only way a reward batch is ever
-- delivered. Resolves the recipient list server-side from recipient_mode so
-- "all users" / "a whole city" can never be spoofed from the client, applies
-- the reward to every recipient, records one delivery row per recipient,
-- sends each of them a notification carrying the admin's own message, and
-- writes a single activity-log entry summarizing the whole batch.
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
         current_hp, max_hp, status, party_slot, box_id, box_slot)
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
        v_slot.party_slot, v_slot.box_id, v_slot.box_slot
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

grant execute on function public.send_admin_reward(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Extend the Phase 7 grant-notification triggers: add a suppression flag
-- for Pokémon grants (reward batches use it; a plain ad-hoc admin grant from
-- the Users page does not, so it still notifies as before) and log every
-- non-suppressed (i.e. genuinely ad-hoc, one-off) grant to the activity log.
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

  if current_setting('pokegear.suppress_pokemon_notification', true) <> 'on' then
    insert into public.notifications (profile_id, kind, title, body)
    values (
      new.profile_id,
      'pokemon_received',
      'Pokémon received!',
      format('%s joined your team.', coalesce(new.nickname, v_species_name))
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
  select name into v_item_name from public.items_catalog where id = new.item_id;

  if v_delta > 0 then
    insert into public.notifications (profile_id, kind, title, body)
    values (new.profile_id, 'item_received', 'Item received!', format('You received %sx %s.', v_delta, v_item_name));

    insert into public.admin_activity_log (admin_id, action, target_profile_id, details)
    values (
      public.my_profile_id(),
      'item_granted',
      new.profile_id,
      jsonb_build_object('item', v_item_name, 'quantity', v_delta)
    );
  elsif v_delta < 0 and public.is_admin() then
    insert into public.admin_activity_log (admin_id, action, target_profile_id, details)
    values (
      public.my_profile_id(),
      'item_removed',
      new.profile_id,
      jsonb_build_object('item', v_item_name, 'quantity', -v_delta)
    );
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Extend the profiles guard trigger once more: log money changes and city
-- re-assignments an admin makes to someone else's profile. Still skipped
-- entirely when the bypass flag is set (purchases, trades, reward batches),
-- since those aren't "admin activity" — direct admin edits from the Users
-- page are.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_profile_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bypassed boolean := current_setting('pokegear.bypass_profile_guard', true) = 'on';
  v_admin_id uuid;
begin
  if not v_bypassed then
    if not public.is_admin() then
      new.role       := old.role;
      new.money      := old.money;
      new.auth_id    := old.auth_id;
      new.trainer_id := old.trainer_id;
      new.created_at := old.created_at;
    else
      v_admin_id := public.my_profile_id();

      if new.money > old.money then
        insert into public.notifications (profile_id, kind, title, body)
        values (new.id, 'admin_reward', 'Admin reward', format('An admin gave you ₽%s.', new.money - old.money));
        insert into public.admin_activity_log (admin_id, action, target_profile_id, details)
        values (v_admin_id, 'money_added', new.id, jsonb_build_object('amount', new.money - old.money));
      elsif new.money < old.money then
        insert into public.admin_activity_log (admin_id, action, target_profile_id, details)
        values (v_admin_id, 'money_removed', new.id, jsonb_build_object('amount', old.money - new.money));
      end if;

      if new.city_id is distinct from old.city_id then
        insert into public.admin_activity_log (admin_id, action, target_profile_id, details)
        values (v_admin_id, 'user_city_changed', new.id, jsonb_build_object('city_id', new.city_id));
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Log shop/catalog admin actions. Both tables are already admin-write-only
-- via RLS, so any row reaching these triggers is inherently an admin action.
-- ---------------------------------------------------------------------------
create or replace function public.log_item_catalog_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_activity_log (admin_id, action, details)
  values (public.my_profile_id(), 'item_created', jsonb_build_object('item_id', new.id, 'name', new.name));
  return new;
end;
$$;

drop trigger if exists items_catalog_log_create on public.items_catalog;
create trigger items_catalog_log_create
  after insert on public.items_catalog
  for each row execute procedure public.log_item_catalog_change();

create or replace function public.log_shop_listing_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_name text;
begin
  select name into v_item_name from public.items_catalog where id = new.item_id;
  insert into public.admin_activity_log (admin_id, action, details)
  values (
    public.my_profile_id(),
    case when TG_OP = 'INSERT' then 'shop_item_created' else 'shop_item_edited' end,
    jsonb_build_object('item', v_item_name, 'price', new.price, 'stock', new.stock, 'is_enabled', new.is_enabled)
  );
  return new;
end;
$$;

drop trigger if exists shop_listings_log_change on public.shop_listings;
create trigger shop_listings_log_change
  after insert or update on public.shop_listings
  for each row execute procedure public.log_shop_listing_change();

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
-- * User creation, deletion, and password resets are NOT handled here.
--   Those require Supabase's service-role Admin API, which must never be
--   reachable from the browser — see supabase/functions/admin-users, a Supabase
--   Edge Function that performs those three actions after independently
--   verifying (server-side, against this database) that the caller is an
--   admin. It logs to admin_activity_log itself once it does.
