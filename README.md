# PokéGear — Phase 1: Foundation

A mobile-first Pokémon trainer companion app styled after the Scarlet/Violet Rotom Phone, built with React, TypeScript, Vite, Tailwind, shadcn/ui, and Supabase.

Phase 1 delivers: invite-only auth, protected routes, the phone UI shell (lock screen, home screen, dock), a persistent trainer profile, and navigation stubs for Bag / PC / Shop / Trade / Notifications / Settings. Those four core apps are intentionally placeholders — they land in a later phase.

## Stack

- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn/ui (Radix primitives)
- Supabase (Postgres, Auth, RLS)
- React Router 6
- TanStack Query
- Framer Motion

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

Create a project at [supabase.com](https://supabase.com), then:

1. Go to **SQL Editor** and run the migration in `supabase/migrations/0001_init.sql`. This creates the `cities` and `profiles` tables, seeds the four starting cities, sets up RLS, and adds a trigger that auto-creates a profile row whenever an auth user is created.
2. Go to **Authentication > Providers > Email** and turn **off** "Allow new users to sign up." PokéGear is invite-only — trainers are created manually.
3. Go to **Authentication > Users > Add user** to create trainer/admin accounts. Use "Auto Confirm User" so they can sign in immediately without an email step.
4. Promote an account to admin by running this in the SQL Editor:
   ```sql
   update public.profiles set role = 'admin' where email = 'someone@example.com';
   ```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from **Project Settings > API**.

### 4. Run the dev server locally (optional)

```bash
npm run dev
```

Visit `http://localhost:5173`. Sign in with a trainer account created in step 2.

## Deploying to GitHub Pages (no server needed)

Everything PokéGear needs at runtime is Supabase — there's no backend of your own to host. That means you can serve the built app as static files straight from GitHub Pages, for free.

1. **Push this project to a GitHub repo.**
   ```bash
   git init
   git add .
   git commit -m "PokéGear Phase 1"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

2. **Add your Supabase credentials as repo secrets** (so the build has them without committing `.env`): go to **Settings > Secrets and variables > Actions > New repository secret** and add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

3. **Turn on Pages**: go to **Settings > Pages**, and under "Build and deployment", set **Source** to **GitHub Actions**.

4. **Push (or re-push) to `main`.** The workflow in `.github/workflows/deploy.yml` will install dependencies, build the app with your secrets baked in, and deploy it. Watch progress under the **Actions** tab.

5. Once it finishes, your site is live at `https://<your-username>.github.io/<your-repo>/` (shown in the workflow's deploy step and under **Settings > Pages**).

A couple of things that make this work without a server:
- The router uses `HashRouter` instead of `BrowserRouter`, so in-app navigation (`/#/profile`, `/#/bag`, ...) doesn't need any server-side rewrite rules — GitHub Pages only serves static files and can't do that.
- `vite.config.ts` builds with a relative asset base (`base: "./"`), so the bundle works regardless of which subpath your repo is served from.

If you'd rather use Vercel or Netlify instead of GitHub Pages, this project works there unmodified too — both auto-detect Vite, just add the same two env vars in their dashboard.

## Project structure

```
src/
  components/
    ui/            shadcn primitives (Button, Card, Input, Avatar, ...)
    phone/          Phone chrome: PhoneFrame, LockScreen, HomeScreen, Dock, AppIcon, ...
    ProtectedRoute.tsx
  hooks/
    useAuth.tsx     Session state, sign in / sign out
    useProfile.ts   Profile + cities queries/mutations (TanStack Query)
    usePhoneContext.ts
  pages/            One file per route (Login, Home, Profile, Bag, PC, Shop, Trade, ...)
  lib/
    supabase.ts     Supabase client
    utils.ts        cn() class helper
  types/
    database.types.ts  Hand-written types mirroring the SQL schema
supabase/
  migrations/
    0001_init.sql   Schema, RLS policies, seed data, triggers
```

## Auth model

- **No public sign-up.** The sign-up flow is disabled at the Supabase Auth level, not just hidden in the UI.
- **Login only**, via email + password (`useAuth().signIn`).
- **Sessions persist** across reloads via Supabase's local storage-backed session (`persistSession: true`, custom `storageKey`).
- **Protected routes**: `<ProtectedRoute />` redirects unauthenticated visitors to `/login`; pass `adminOnly` to gate a route to `role = 'admin'` profiles.
- **Roles**: `profiles.role` is `'trainer' | 'admin'`. New users default to `'trainer'` via the `handle_new_user` trigger; promote to admin manually in SQL.

## Row Level Security

- `cities`: readable by any authenticated user; writable only by admins.
- `profiles`: a user can `select`/`update` only the row where `auth_id = auth.uid()`; admins (checked via a `security definer` `is_admin()` function, to avoid recursive RLS lookups) can read/update/insert/delete any row.

## Design notes

The phone chrome (`PhoneFrame`) mimics the Rotom Phone: a deep red bezel with a single glowing "eye," wrapping a dark rounded screen. Icons use a glassmorphism treatment (blurred translucent tiles) closer to iOS, per the brief. Typography: Rubik for display/headings, Inter for body text, JetBrains Mono for time/IDs/data. The lock screen unlocks via an actual drag gesture (Framer Motion `drag="y"`), not a button.

## Navigation architecture (Phase 2)

Lock state and route state are intentionally decoupled:

- `PhoneLockProvider` (`src/hooks/usePhoneLock.tsx`) holds `locked` in a React context mounted **once per session**, above the router outlet (see `App.tsx`), not inside any individual page component.
- `PhoneLayout` reads that context and renders either the `LockScreen` or the routed app (`AnimatedOutlet` → `Outlet`) — the Lock Screen is never a route and is never part of React Router's navigation stack.
- Every app screen's back arrow (`AppScreenHeader`) calls `navigate("/")` directly rather than `navigate(-1)`, so it always lands on the Home Screen regardless of browser history, and can never land back on the Lock Screen.

This fixes a Phase 1 bug where the unlocked/locked flag lived as local `useState` inside the Home route component; navigating to `/bag` and back to `/` remounted that component and reset it to `locked`, popping the Lock Screen back up. Since the flag now lives above the routed pages, opening any app and pressing back always returns to the Home Screen, never the Lock Screen.

## Phase 3: trainer data, Bag & Pokémon

New tables (`supabase/migrations/0002_bag_pokemon.sql`):

- **`species`** — a small Gen 1 reference catalog (id = national dex number, name). Sprites need no stored URL at all: they're derived client-side from the numeric id via PokeAPI's public sprite repo (`src/lib/sprites.ts`), so there's no manual image upload step, ever.
- **`items_catalog`** — master list of items across all four Bag categories (Poké Ball, Item, Evolution Item, Key Item), seeded with ~39 classic items. Each row carries a `pokeapi_slug` used the same way, to resolve its icon automatically.
- **`trainer_pokemon`** — one row per owned Pokémon: species, nickname, level, nature, ability, held item, HP, status, favorite flag.
- **`trainer_items`** — one row per (trainer, item) stack, with a `quantity`. This is what powers the "Ultra Ball × 5" style counts in the Bag.

**Everything persists in Supabase** — refreshing the page, or logging out and back in, restores the exact same Pokémon, items, and money, because none of it is ever held only in frontend state; TanStack Query just caches what's read from Supabase.

### Security model for Phase 3

- Trainers can **read** their own `trainer_pokemon` and `trainer_items` rows only (RLS), and admins can read/write any row — this is what "give/remove Pokémon", "give/remove items" will hook into later, with no schema changes needed.
- Trainers can **only** change two things directly: a Pokémon's `is_favorite` flag, and its held item (via the `set_held_item()` function below). Every other column — level, HP, species, nature, ability — is admin-only, enforced by a Postgres trigger (`enforce_trainer_pokemon_update_guard`), not just app-level convention. Inserting or deleting a `trainer_pokemon`/`trainer_items` row ("giving"/"removing" one) is admin-only at the RLS level.
- **`set_held_item(pokemon_id, item_id)`** is a `security definer` function that atomically swaps a Pokémon's held item: it returns whatever was previously held back into the Bag, and removes the newly held item's count, in one transaction — so Bag counts can never drift out of sync with what's actually equipped.
- **Security fix carried over from Phase 1**: the original `profiles` RLS policy allowed a trainer to update their own row, but only checked row ownership — not which columns changed. That meant a trainer could, in principle, call the API directly and set their own `money` or `role`. A new trigger (`enforce_profile_update_guard`) now silently keeps `money`, `role`, `auth_id`, `trainer_id`, and `created_at` pinned to their existing values unless the caller is an admin, regardless of what a client sends. Money can now only ever change via an admin, or later, gameplay logic running with admin/service privileges — never directly from a trainer's own client.

### Bag app

Five tabs — Pokémon, Poké Balls, Items, Evolution Items, Key Items — each showing live counts (`useTrainerItems` + `groupItemsByCategory`). Tapping a Pokémon opens a detail view in place (not a new route), so its own back arrow returns to the Bag list rather than jumping all the way home — `AppScreenHeader` now accepts an optional `onBack` override for exactly this kind of nested screen.

### Adding data for a trainer to see

There's no admin UI yet (Phase 3 only asks the database to be *ready* for one), so give a trainer a Pokémon/items/money directly in the Supabase SQL editor — examples are included as comments at the bottom of `0002_bag_pokemon.sql`.

## What's next (out of scope for Phase 1)

Bag, PC, Shop, and Trade currently render placeholder screens reachable from the home grid and dock. Building out their real functionality (inventory, box storage, purchasing, trading) is Phase 2+.
