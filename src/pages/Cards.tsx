import * as React from "react";
import { AnimatePresence } from "framer-motion";
import { Check, Layers, Loader2, Plus, RotateCcw, Search, Star } from "lucide-react";
import { AppScreenHeader } from "@/components/phone/AppScreenHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { CollectionCardDetail, TcgCardFacts, TcgCardImage, TcgOverlay } from "@/components/tcg/TcgBits";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { normalizeName } from "@/lib/pokemonSearch";
import { TCG_LANGUAGES, TcgApiError, cardNumber, type TcgCard } from "@/lib/tcgdex";
import { usePhoneContext } from "@/hooks/usePhoneContext";
import { useUpdateProfile } from "@/hooks/useProfile";
import { useSpecies } from "@/hooks/useBag";
import { useDebounced } from "@/hooks/useDebounced";
import { useAddTcgCard, useTcgCard, useTcgCollection, useTcgSearch, useTcgSets, type TcgResult } from "@/hooks/useTcg";
import type { TcgCollectionEntry, TcgLanguage } from "@/types/database.types";

type Tab = "mine" | "find";

/**
 * Virtual Pokémon TCG cards (PokéGear 11). Real cards come from TCGdex; a
 * player adds the ones they own (or want to use) to their collection and
 * can link them to their RPG Pokémon. Separate from the RPG: removing a card
 * never touches a Pokémon, and vice versa.
 */
export default function Cards() {
  const [tab, setTab] = React.useState<Tab>("mine");
  const { data: collection } = useTcgCollection();

  return (
    <div className="relative flex h-full flex-col">
      <AppScreenHeader title="TCG Cards" subtitle="Your virtual card collection" icon={<Layers className="h-5 w-5" strokeWidth={1.75} />} />
      <div className="mx-4 mt-3 flex rounded-xl bg-white/5 p-0.5">
        {(
          [
            ["mine", `My Cards${collection ? ` (${collection.reduce((n, c) => n + c.quantity, 0)})` : ""}`],
            ["find", "Find Cards"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn("flex-1 touch-manipulation rounded-lg py-1.5 text-xs font-semibold", tab === value ? "bg-volt text-screen-ink" : "text-mist/70")}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "mine" ? <MyCards onFind={() => setTab("find")} /> : <FindCards />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// My Cards
// ---------------------------------------------------------------------------
function MyCards({ onFind }: { onFind: () => void }) {
  const { data: collection = [], isLoading } = useTcgCollection();
  const { data: species = [] } = useSpecies();
  const [query, setQuery] = React.useState("");
  const [pokemon, setPokemon] = React.useState("");
  const [setId, setSetId] = React.useState("");
  const [rarity, setRarity] = React.useState("");
  const [favOnly, setFavOnly] = React.useState(false);
  const [sort, setSort] = React.useState<"recent" | "name" | "set">("recent");
  const [open, setOpen] = React.useState<TcgCollectionEntry | null>(null);
  const debounced = useDebounced(query, 150);

  const speciesName = React.useCallback((id: number) => species.find((s) => s.id === id)?.name ?? `#${id}`, [species]);
  const pokemonOptions = React.useMemo(() => {
    const ids = new Set<number>();
    for (const c of collection) for (const d of c.dex_ids) ids.add(d);
    return [...ids].map((id) => [id, speciesName(id)] as const).sort((a, b) => a[1].localeCompare(b[1]));
  }, [collection, speciesName]);
  const setOptions = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const c of collection) if (c.set_id) m.set(c.set_id, c.set_name ?? c.set_id);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [collection]);
  const rarityOptions = React.useMemo(() => [...new Set(collection.map((c) => c.rarity).filter(Boolean) as string[])].sort(), [collection]);

  const shown = React.useMemo(() => {
    const q = normalizeName(debounced);
    const list = collection.filter((c) => {
      if (favOnly && !c.is_favorite) return false;
      if (pokemon && !c.dex_ids.includes(Number(pokemon))) return false;
      if (setId && c.set_id !== setId) return false;
      if (rarity && c.rarity !== rarity) return false;
      if (!q) return true;
      const hay = [c.name, c.set_name ?? "", c.set_id ?? "", c.card_id, c.local_id ?? "", ...c.dex_ids.map(speciesName)].map(normalizeName);
      return hay.some((h) => h.includes(q));
    });
    return [...list].sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "set"
          ? (a.set_name ?? "").localeCompare(b.set_name ?? "") || (a.local_id ?? "").localeCompare(b.local_id ?? "", undefined, { numeric: true })
          : b.added_at.localeCompare(a.added_at)
    );
  }, [collection, debounced, favOnly, pokemon, setId, rarity, sort, speciesName]);

  return (
    <>
      <div className="space-y-2 px-4 pt-3">
        <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3">
          <Search className="h-4 w-4 text-mist/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your cards…"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-mist placeholder:text-mist/40 focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <select value={pokemon} onChange={(e) => setPokemon(e.target.value)} className="rounded-lg border border-white/15 bg-screen-deep px-2 py-1.5 text-mist">
            <option value="">All Pokémon</option>
            {pokemonOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select value={setId} onChange={(e) => setSetId(e.target.value)} className="rounded-lg border border-white/15 bg-screen-deep px-2 py-1.5 text-mist">
            <option value="">All sets</option>
            {setOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select value={rarity} onChange={(e) => setRarity(e.target.value)} className="rounded-lg border border-white/15 bg-screen-deep px-2 py-1.5 text-mist">
            <option value="">All rarities</option>
            {rarityOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-lg border border-white/15 bg-screen-deep px-2 py-1.5 text-mist">
            <option value="recent">Recently added</option>
            <option value="name">Name</option>
            <option value="set">Set</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => setFavOnly((v) => !v)}
          className={cn("flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold", favOnly ? "bg-volt text-screen-ink" : "bg-white/5 text-mist")}
        >
          <Star className="h-3.5 w-3.5" /> Favorites only
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isLoading ? (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[63/88] w-full rounded-lg" />
            ))}
          </div>
        ) : collection.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Layers className="h-8 w-8 text-mist/20" strokeWidth={1.5} />
            <p className="max-w-[230px] text-xs text-mist/50">No cards yet. Find a card you own and add it to your virtual collection.</p>
            <button type="button" onClick={onFind} className="rounded-full bg-volt px-4 py-2 text-xs font-semibold text-screen-ink">
              Find cards
            </button>
          </div>
        ) : shown.length === 0 ? (
          <p className="py-10 text-center text-xs text-mist/50">No cards match.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {shown.map((c) => (
              <button key={c.id} type="button" onClick={() => setOpen(c)} className="relative touch-manipulation text-left">
                <TcgCardImage image={c.image_url} name={c.name} />
                <div className="absolute right-1 top-1 flex gap-1">
                  {c.is_favorite ? <Star className="h-4 w-4 fill-volt text-volt drop-shadow" /> : null}
                  {c.quantity > 1 ? <span className="rounded-full bg-screen-ink/85 px-1.5 text-[10px] font-bold text-mist">×{c.quantity}</span> : null}
                </div>
                <p className="mt-1 truncate text-[11px] font-medium text-mist">{c.name}</p>
                <p className="truncate text-[9px] text-mist/45">
                  {c.set_name} · {cardNumber(c.local_id, c.set_total)}
                  {c.lang !== "en" ? ` · ${c.lang.toUpperCase()}` : ""}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>{open ? <CollectionCardDetail entry={open} onClose={() => setOpen(null)} /> : null}</AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// Find Cards
// ---------------------------------------------------------------------------
function FindCards() {
  const { profile } = usePhoneContext();
  const updateProfile = useUpdateProfile();
  const lang: TcgLanguage = profile.tcg_language ?? "en";
  const { data: collection = [] } = useTcgCollection();
  const add = useAddTcgCard();

  const [mode, setMode] = React.useState<"search" | "id">("search");
  const [name, setName] = React.useState("");
  const [setId, setSetId] = React.useState("");
  const [number, setNumber] = React.useState("");
  const [cardIdInput, setCardIdInput] = React.useState("");
  const [cardIdQuery, setCardIdQuery] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<TcgCard | null>(null);

  const sets = useTcgSets(lang);
  const params = { lang, name: useDebounced(name, 400), setId, number: useDebounced(number, 400) };
  const ready = params.name.trim().length >= 2 || !!params.setId || !!params.number.trim();
  const search = useTcgSearch(params, mode === "search" && ready);
  const byId = useTcgCard(lang, mode === "id" ? cardIdQuery : null);

  const owned = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const c of collection) m.set(`${c.card_id}|${c.lang}`, c.quantity);
    return m;
  }, [collection]);

  function addCard(card: TcgCard) {
    add.mutate(
      { card, lang },
      { onSuccess: (row) => toast(row.quantity > 1 ? `Added another ${card.name} (×${row.quantity})` : `${card.name} added to your cards`, "success") }
    );
  }

  const results = search.data?.pages.flat() ?? [];
  const error = (mode === "search" ? search.error : byId.error) as Error | null;

  return (
    <>
      <div className="space-y-2 px-4 pt-3">
        <div className="flex gap-2">
          <div className="flex flex-1 rounded-xl bg-white/5 p-0.5">
            {(
              [
                ["search", "Search"],
                ["id", "Card ID"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={cn("flex-1 touch-manipulation rounded-lg py-1 text-[11px] font-semibold", mode === value ? "bg-white/15 text-mist" : "text-mist/50")}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            value={lang}
            onChange={(e) => {
              setSetId("");
              updateProfile.mutate({ tcg_language: e.target.value as TcgLanguage });
            }}
            className="rounded-xl border border-white/15 bg-screen-deep px-2 text-[11px] text-mist"
            aria-label="Card language"
          >
            {TCG_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        {mode === "search" ? (
          <>
            <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3">
              <Search className="h-4 w-4 text-mist/40" />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Search card or Pokémon name…"
                className="min-w-0 flex-1 bg-transparent py-2 text-sm text-mist placeholder:text-mist/40 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-[1fr_88px] gap-2 text-xs">
              <select value={setId} onChange={(e) => setSetId(e.target.value)} className="min-w-0 rounded-lg border border-white/15 bg-screen-deep px-2 py-1.5 text-mist">
                <option value="">{sets.isLoading ? "Loading sets…" : "Any set"}</option>
                {[...(sets.data ?? [])]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.id})
                    </option>
                  ))}
              </select>
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="No. e.g. 025"
                className="min-w-0 rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-mist placeholder:text-mist/40 focus:outline-none"
                inputMode="text"
              />
            </div>
          </>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = cardIdInput.trim();
              setCardIdQuery(v || null);
            }}
          >
            <input
              value={cardIdInput}
              onChange={(e) => setCardIdInput(e.target.value)}
              placeholder="Card ID, e.g. sv01-025"
              className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 font-mono text-sm text-mist placeholder:text-mist/40 focus:outline-none"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button type="submit" className="shrink-0 rounded-xl bg-volt px-4 text-xs font-semibold text-screen-ink">
              Search card
            </button>
          </form>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {error ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="max-w-[260px] text-xs text-rotom-red-light">{error instanceof TcgApiError ? error.message : "Something went wrong loading cards."}</p>
            <button
              type="button"
              onClick={() => (mode === "search" ? search.refetch() : byId.refetch())}
              className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-[11px] text-mist"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Try again
            </button>
          </div>
        ) : mode === "id" ? (
          !cardIdQuery ? (
            <p className="py-8 text-center text-xs text-mist/50">Enter the exact card ID (it&apos;s shown in each card&apos;s details) and tap Search card.</p>
          ) : byId.isLoading ? (
            <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-mist/40" />
          ) : !byId.data ? (
            <p className="py-8 text-center text-sm font-semibold text-mist/70">Card not found</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <ResultTile
                result={{ brief: byId.data, card: byId.data }}
                ownedCount={owned.get(`${byId.data.id}|${lang}`) ?? 0}
                adding={add.isPending}
                onOpen={setPreview}
                onAdd={addCard}
              />
            </div>
          )
        ) : !ready ? (
          <p className="py-8 text-center text-xs text-mist/50">
            Type at least 2 letters of a card or Pokémon name — or pick a set or card number — to search.
          </p>
        ) : search.isLoading ? (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[63/88] w-full rounded-lg" />
            ))}
          </div>
        ) : results.length === 0 ? (
          <p className="py-8 text-center text-xs text-mist/50">No cards found. Try a different name, set or number.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {results.map((r) => (
                <ResultTile
                  key={r.brief.id}
                  result={r}
                  ownedCount={owned.get(`${r.brief.id}|${lang}`) ?? 0}
                  adding={add.isPending}
                  onOpen={setPreview}
                  onAdd={addCard}
                />
              ))}
            </div>
            {search.hasNextPage ? (
              <button
                type="button"
                disabled={search.isFetchingNextPage}
                onClick={() => search.fetchNextPage()}
                className="mt-3 w-full touch-manipulation rounded-xl bg-white/5 py-2 text-xs font-semibold text-mist active:bg-white/10 disabled:opacity-50"
              >
                {search.isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            ) : null}
          </>
        )}
      </div>

      <AnimatePresence>
        {preview ? (
          <TcgOverlay title={preview.name} onClose={() => setPreview(null)}>
            <div className="mx-auto w-full max-w-[280px]">
              <TcgCardImage image={preview.image} name={preview.name} quality="high" className="shadow-glass" />
            </div>
            <button
              type="button"
              disabled={add.isPending}
              onClick={() => addCard(preview)}
              className="mx-auto mt-3 flex w-full max-w-[280px] touch-manipulation items-center justify-center gap-1.5 rounded-2xl bg-volt py-2.5 text-sm font-bold text-screen-ink active:scale-[0.98] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {owned.get(`${preview.id}|${lang}`) ? `Add another copy (you have ${owned.get(`${preview.id}|${lang}`)})` : "Add to Collection"}
            </button>
            <p className="mt-1 text-center font-mono text-[10px] text-mist/40">Card ID: {preview.id}</p>
            <div className="mt-3">
              <TcgCardFacts card={preview} />
            </div>
          </TcgOverlay>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function ResultTile({
  result,
  ownedCount,
  adding,
  onOpen,
  onAdd,
}: {
  result: TcgResult;
  ownedCount: number;
  adding: boolean;
  onOpen: (card: TcgCard) => void;
  onAdd: (card: TcgCard) => void;
}) {
  const { brief, card } = result;
  return (
    <div className="glass flex flex-col rounded-xl p-1.5">
      <button type="button" disabled={!card} onClick={() => card && onOpen(card)} className="touch-manipulation text-left">
        <TcgCardImage image={card?.image ?? brief.image} name={brief.name} />
        <p className="mt-1 truncate text-xs font-semibold text-mist">{brief.name}</p>
        {card ? (
          <div className="space-y-0.5 text-[10px] text-mist/55">
            <p className="truncate">{card.set?.name}</p>
            <p className="truncate">
              No. {cardNumber(card.localId, card.set?.cardCount?.official)}
              {card.hp ? ` · HP ${card.hp}` : ""}
            </p>
            <p className="truncate">
              {card.rarity ?? ""}
              {card.types?.length ? `${card.rarity ? " · " : ""}${card.types.join("/")}` : ""}
            </p>
          </div>
        ) : (
          <p className="text-[10px] text-mist/40">Details unavailable right now</p>
        )}
      </button>
      <button
        type="button"
        disabled={!card || adding}
        onClick={() => card && onAdd(card)}
        className={cn(
          "mt-1.5 flex touch-manipulation items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold active:scale-95 disabled:opacity-40",
          ownedCount ? "bg-white/10 text-mist" : "bg-volt text-screen-ink"
        )}
      >
        {ownedCount ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        {ownedCount ? `Owned ×${ownedCount} · add` : "Add to Collection"}
      </button>
    </div>
  );
}
