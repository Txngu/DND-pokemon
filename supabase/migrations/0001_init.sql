-- ============================================================================
-- PokéGear — Phase 1: Foundation schema
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enum: user_role
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('trainer', 'admin');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Table: cities
-- ---------------------------------------------------------------------------
create table if not exists public.cities (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique
);

insert into public.cities (name)
values
  ('Harmonia City'),
  ('Blütenhain'),
  ('Wind City'),
  ('Crystal City')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Table: profiles
-- One row per Supabase auth user. Created automatically via trigger below.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id               uuid primary key default gen_random_uuid(),
  auth_id          uuid not null unique references auth.users (id) on delete cascade,
  username         text not null unique,
  email            text not null,
  avatar           text,
  wallpaper        text,
  city_id          uuid references public.cities (id) on delete set null,
  money            integer not null default 3000 check (money >= 0),
  trainer_id       text not null unique default lpad((floor(random() * 100000))::text, 5, '0'),
  favorite_pokemon text,
  role             public.user_role not null default 'trainer',
  created_at       timestamptz not null default now()
);

create index if not exists profiles_city_id_idx on public.profiles (city_id);

-- ---------------------------------------------------------------------------
-- Helper: is_admin() — used inside RLS policies, avoids recursive profile
-- lookups by checking the JWT-embedded role once resolved via profiles.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where auth_id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Auto-create a profile row whenever a new auth user is created.
-- Admin accounts are created manually in Supabase (Auth > Users), then this
-- trigger still fires to give them a profile row with role defaulted to
-- 'trainer' — an admin should promote themselves via SQL editor:
--   update public.profiles set role = 'admin' where email = '...';
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (auth_id, username, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (auth_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.cities enable row level security;
alter table public.profiles enable row level security;

-- cities: readable by any authenticated user, writable only by admins
drop policy if exists "cities_select_authenticated" on public.cities;
create policy "cities_select_authenticated"
  on public.cities for select
  to authenticated
  using (true);

drop policy if exists "cities_admin_write" on public.cities;
create policy "cities_admin_write"
  on public.cities for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- profiles: users can read/update only their own row; admins get full access
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth_id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth_id = auth.uid() or public.is_admin())
  with check (auth_id = auth.uid() or public.is_admin());

drop policy if exists "profiles_admin_insert" on public.profiles;
create policy "profiles_admin_insert"
  on public.profiles for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "profiles_admin_delete" on public.profiles;
create policy "profiles_admin_delete"
  on public.profiles for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
-- * Public sign-up is disabled in Supabase Auth settings (Authentication >
--   Providers > Email > "Allow new users to sign up" = OFF). Admins create
--   trainer accounts manually via Authentication > Users > Invite/Add user.
-- * Promote an account to admin with:
--     update public.profiles set role = 'admin' where email = 'someone@example.com';
