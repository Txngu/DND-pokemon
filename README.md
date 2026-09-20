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

## Phase 4: PC storage system

New in `supabase/migrations/0003_pc_system.sql`:

- **`pc_boxes`** — every trainer automatically gets 8 boxes (`Box 1`…`Box 8`, 30 slots each) the moment their profile is created, via a trigger. Existing profiles from earlier phases are backfilled by the same migration.
- **`trainer_pokemon` gains a location**: `party_slot` (1–6) or `box_id` + `box_slot` (1–30) — never both, never neither, enforced by a `CHECK` constraint. Pre-existing Phase 3 Pokémon get placed into the party (then Box 1) automatically so nothing is lost.
- The Phase 3 update guard is extended so a trainer can now move their own Pokémon's location directly (party ⇄ box, box ⇄ box) — everything else about a Pokémon (level, species, stats…) is still admin-only.

### Why moves and swaps are two different code paths

Dropping a Pokémon onto an **empty** slot is a single-row update — the client does that directly.

Dropping onto an **occupied** slot needs both Pokémon to swap places atomically. Two separate client-side updates can't do this safely: the moment the first one lands, both Pokémon would briefly point at the same slot, which a uniqueness rule would (correctly) reject. So this goes through **`swap_pokemon_slots()`**, a `security definer` function that updates both rows in one transaction. The uniqueness rule itself (`EXCLUDE` constraints on `(profile_id, party_slot)` and `(box_id, box_slot)`, using `btree_gist`) is declared `DEFERRABLE`, and the function explicitly defers it for that transaction — so the momentary "both in the same place" state is allowed to exist for a few milliseconds mid-swap, and only checked once everything's settled, right before commit.

### PC app

- **Party** (6 slots) always visible at the top; **box** grid (30 slots) below it, with prev/next arrows and a tap-to-rename box name.
- **Two ways to move a Pokémon**, both fully touch-friendly: drag it with [@dnd-kit](https://dndkit.com/) (works with touch and mouse), or tap it once to select (it gets a ring highlight — the "selection state" from the spec) and tap a destination slot.
- Tapping a selected Pokémon's **Details** button opens the same detail view as the Bag, with its own back arrow returning to the PC (not Home).
- Renaming a box, moving, and swapping all write straight to Supabase — refresh mid-session and everything is exactly where you left it.

### Privacy

Same model as Bag/Pokémon in Phase 3: RLS scopes every `pc_boxes` and `trainer_pokemon` row to `auth.uid()`'s own profile, and only admins can read or write another trainer's rows — including box renames, since even renaming is gated by the same ownership check.

## Phase 5: Shop & item economy

New in `supabase/migrations/0004_shop_economy.sql`:

- **Item categories expanded** from Phase 3's 4 values to the full spec list: Poké Ball, Medicine, Evolution, Battle, Key Item, Quest, Other. Changing an enum's value set safely in Postgres means building a new enum and migrating the column over rather than `ALTER TYPE` in place — existing items are automatically remapped (e.g. old `evolution_item` → `evolution`, old generic `item` → `medicine` or `other` depending on which item it actually was).
- **`items_catalog` now supports fully custom items**: `pokeapi_slug` is optional, and there's `icon_url` and `icon_emoji` as alternatives — an admin can create a D&D quest item with just an emoji and no real artwork at all. New fields: `value`, `is_tradable`, `is_sellable`, `created_at`.
- **`shop_listings`** is a separate table from `items_catalog` on purpose: an item can exist (be owned, held, shown in the Bag) without ever being for sale, and pulling something off the shelf (or changing its price/stock) never touches or endangers what trainers already own. Master Ball, Safari Ball, and all Key Items are seeded with *no* listing at all, same as in the actual games.
- **`notifications`** — a general per-trainer event feed. Purchases write to it automatically (satisfying the "create a notification/purchase record" step), and the Notifications app is no longer a placeholder — it now shows this real feed, with unread dots and tap-to-mark-read.

### The purchase transaction

`purchase_item(listing_id, quantity)` is a single `security definer` Postgres function that does the entire flow from the spec in one atomic transaction: lock the listing and the caller's own profile row, verify the listing is enabled, check money, check stock, deduct money, decrement stock, upsert the item into `trainer_items`, and write a notification — all or nothing. A couple of things worth calling out:

- **The trainer's profile is looked up from `auth.uid()` inside the function, never passed in as a parameter.** There's no `profile_id` argument to tamper with — a trainer can only ever spend their own money by construction, not because of an extra permission check that could be gotten wrong.
- **Both the listing row and the profile row are locked (`FOR UPDATE`)** before any check happens, so two rapid purchases (e.g. a double-tap) can't both read the same stock count or the same balance and both succeed — the second one blocks until the first fully commits, then sees the updated numbers.
- **Money deduction reuses the Phase 4 bypass-flag pattern**: the profiles table still has a trigger blocking a trainer from setting their own `money` directly, so `purchase_item` briefly sets a session flag the trigger checks for, exactly like `set_held_item()` already does for Pokémon.

### Admin shop management

Unlike Phases 3–4 (where "admin compatibility" meant designing the database for a future admin UI), Phase 5's admin capabilities are wired up as an actual in-app panel: open the Shop as an admin account and tap **Manage** to edit price/stock/enabled inline on any listing, delete a listing, or create a brand-new custom item (name, description, category, emoji icon, optional PokeAPI slug, value, tradable/sellable flags, price, and stock) in one form — which is exactly the "Custom Items" workflow the spec describes for adding D&D-style objects that aren't official Pokémon items at all.

## Phase 6: Player trading

New in `supabase/migrations/0005_trading.sql`. This is the most safety-critical phase so far — a bug here means someone could lose a Pokémon or duplicate items — so the design leans hard on the database, not client trust.

### Privacy-safe search

`trainer_directory` is a Postgres **view**, not a table: it only ever exposes `username`, `trainer_id`, and `avatar`. The real `profiles` table (with email, money, role, city…) stays exactly as locked down as before. Searching by username or Trainer ID queries this view — there's no code path that can leak private profile fields through search.

### Everything goes through functions, not direct table writes

`trades`, `trade_pokemon`, and `trade_items` have **no insert/update/delete RLS policy for regular trainers at all** — only `SELECT`. Every action (send a request, accept/decline, cancel, change your offer, confirm) is a `security definer` Postgres function. This means the rules — you can only offer your own Pokémon, a non-tradable item can never be selected, a Pokémon can't be offered in two trades at once, changing your offer resets both confirmations — are enforced by the database itself, not just by the UI. A malicious client calling the API directly gets nothing more than what these functions allow.

### The atomic trade completion

`confirm_trade()` marks the caller's side confirmed; if the *other* side had already confirmed, the entire trade executes in that same function call — one transaction:

1. Lock both trades' participant profile rows (in a fixed order, so two trades between the same pair can never deadlock) and the trade row itself.
2. Re-verify, right before moving anything, that every offered Pokémon still belongs to who offered it and every offered item still exists in sufficient quantity — a trainer could have spent an item or lost a Pokémon some other way since the offer was set.
3. Move every Pokémon to its new owner, placing it into their party if there's room or their first open PC box slot otherwise (reusing the Phase 4 slot-finding logic) — a traded-in Pokémon needs a valid location just like any other move.
4. Move every item's quantity, and any money offered, in whichever direction(s) were agreed.
5. Mark the trade `completed` and notify both sides.

If **any** of these steps fails — insufficient funds, a Pokémon that's vanished, no open PC slot — the function raises an exception and Postgres rolls back the *entire* transaction. Nothing is half-moved; the trade simply stays exactly as it was and the trainer sees a clear error. This is what "if the trade fails, original inventories remain unchanged" means in practice: it's a property of the transaction, not something the app has to carefully re-implement.

### Trade Review

The trade screen shows both sides' current offers — Pokémon, items with quantities, and money — with a live "Confirmed / Not confirmed" badge per side, satisfying the "Your Pokémon ↔ Their Pokémon" review step before either party can lock in.

### Notifications

All five required events write a notification through the same `notifications` table from Phase 5: new request, accepted, declined, cancelled, and completed (plus one bonus one — "your turn to confirm" — when only one side has confirmed so far).

## Phase 7: Notifications, city themes & trainer experience

New in `supabase/migrations/0006_polish.sql`:

- **City themes load dynamically from Supabase**: `cities` gained `theme_key`, `accent_color`, `badge_emoji`, and `wallpaper_key`, seeded per-city (Harmonia = royal blue castle, Blütenhain = teal blossom, Wind City = crimson autumn, Crystal City = violet night). The client only knows how to turn those values into CSS (`src/lib/cityThemes.ts`) — the actual choice of color/badge/wallpaper per city is data, not hardcoded per-city logic.
- **Wallpaper system**: `profiles.wallpaper` (from Phase 1) is now a real, working system. A trainer's own choice always wins; if unset, it falls back to their city's default. Values are either one of six built-in gradient presets (no image hosting needed) or, for an admin who wants something fully custom, a raw image URL — `PhoneFrame` detects which. A dark scrim between the wallpaper and all screen content (strengthened this phase) keeps text legible regardless of which wallpaper is active.
- **Automatic "received" notifications**: giving a trainer a Pokémon or items directly (the admin workflow from Phases 3–4) now notifies them automatically, without an admin UI having to remember to do it — a database trigger, not application code, is what makes this reliable. Purchases and trades already had their own specific notification text (from Phases 5–6) and continue to use that instead of a generic one; a session-scoped suppression flag (the same pattern as the Phase 4/5 bypass flags) stops the generic trigger from double-firing under those flows.
- **Admin money rewards** are detected the same way: the existing profile-guard trigger now notices when an admin (not `purchase_item`/`confirm_trade`) raises a trainer's money, and writes a notification for it — again, no extra admin action required, it falls out of the existing guard.
- **Notification preferences** (`profiles.notification_prefs`): three simple toggles — Trades / Purchases / Everything else — control what's shown in the trainer's own feed. Worth being precise about scope here: these are a *client-side filter*, not a server-side write suppression. Muting "Purchases" hides purchase notifications from your feed; it doesn't stop `purchase_item` from recording one, the same way muting a push-notification category on a real phone doesn't stop the app from logging the event.
- Trainers can now delete their own notifications (Phase 5 only allowed admins to).

### Notifications app

Every notification carries a title, message, timestamp, read/unread state, and type-specific icon (purchase, trade, Pokémon received, item received, admin reward). Mark-as-read (tap), mark-all-read, and clear-read (behind a confirm dialog, and deliberately only clears *read* ones so an unactioned trade request can't be lost by accident) are all wired to real Supabase writes. The Notifications app icon on the Home Screen carries a live unread-count badge.

### Polish

- **Toasts**: a lightweight module-level toast store (`src/lib/toast.ts`) that any code can call — including a global fallback wired into TanStack Query's `MutationCache`, so *any* mutation failure anywhere in the app surfaces a toast automatically, not just the ones a screen explicitly renders inline. Success toasts were added at the moments that matter most: purchases, sending/accepting/declining/cancelling/confirming a trade, saving a trade offer, toggling a favorite, changing a held item, renaming a PC box, and updating settings.
- **Confirmation dialogs** (`ConfirmDialog`): used for signing out and for clearing read notifications — both moments where an accidental tap would be annoying to undo.
- **Profile** now also shows a city badge (emoji + accent-colored chip, loaded from Supabase), a Pokédex count (distinct species owned, computed from the trainer's actual Pokémon), and "Trainer since."
- **Settings** now has a real wallpaper picker, profile preferences (favorite Pokémon, avatar), and the notification preference toggles — all persisted, with the account fields that must stay protected (role, Trainer ID) explicitly called out as not editable here, matching what the database already enforces.

One honest scope note: "optional UI accents" from the city theme is applied to the avatar ring (Home Screen and Profile) and the city badge chip — I didn't extend it further into a full re-theme of every accent color across the app (the volt-yellow accent used throughout Phases 2–6 stays as the primary accent everywhere else), since that would have meant touching dozens of already-built components for a genuinely optional, cosmetic requirement. The wallpaper and badge are where the city identity shows up most, and both are fully wired.

## What's next (out of scope for Phase 1)

Bag, PC, Shop, and Trade currently render placeholder screens reachable from the home grid and dock. Building out their real functionality (inventory, box storage, purchasing, trading) is Phase 2+.
