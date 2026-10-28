import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Backpack, CircleDot, Sparkles, KeyRound, PawPrint, Cross, Swords, Gem, Box, Search, X } from "lucide-react";
import { AppScreenHeader } from "@/components/phone/AppScreenHeader";
import { PokemonCard } from "@/components/phone/PokemonCard";
import { PokemonDetailView } from "@/components/phone/PokemonDetailView";
import { ItemRow } from "@/components/phone/ItemRow";
import { Skeleton } from "@/components/ui/skeleton";
import { useTrainerPokemon, useTrainerItems, groupItemsByCategory } from "@/hooks/useBag";
import { usePhoneContext } from "@/hooks/usePhoneContext";
import { matchesPokemonQuery, normalizeName } from "@/lib/pokemonSearch";
import { cn } from "@/lib/utils";
import type { ItemCategory } from "@/types/database.types";

type TabKey = "pokemon" | ItemCategory;

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "pokemon", label: "Pokémon", icon: <PawPrint className="h-4 w-4" /> },
  { key: "poke_ball", label: "Poké Balls", icon: <CircleDot className="h-4 w-4" /> },
  { key: "medicine", label: "Medicine", icon: <Cross className="h-4 w-4" /> },
  { key: "battle", label: "Battle", icon: <Swords className="h-4 w-4" /> },
  { key: "evolution", label: "Evolution", icon: <Sparkles className="h-4 w-4" /> },
  { key: "key_item", label: "Key Items", icon: <KeyRound className="h-4 w-4" /> },
  { key: "quest", label: "Quest", icon: <Gem className="h-4 w-4" /> },
  { key: "other", label: "Other", icon: <Box className="h-4 w-4" /> },
];

export default function Bag() {
  const { profile } = usePhoneContext();
  const [tab, setTab] = React.useState<TabKey>("pokemon");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");

  const { data: pokemon, isLoading: pokemonLoading } = useTrainerPokemon();
  const { data: items, isLoading: itemsLoading } = useTrainerItems();
  const grouped = groupItemsByCategory(items);

  const selected = pokemon?.find((p) => p.id === selectedId) ?? null;

  if (selected) {
    return <PokemonDetailView pokemon={selected} onBack={() => setSelectedId(null)} />;
  }

  const sortedPokemon = [...(pokemon ?? [])]
    .filter((p) => matchesPokemonQuery(p, query))
    .sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || b.level - a.level);

  const q = normalizeName(query.trim());
  const pocketItems =
    tab === "pokemon"
      ? []
      : grouped[tab].filter(
          (entry) => !q || normalizeName(entry.item.name).includes(q) || normalizeName(entry.item.description ?? "").includes(q)
        );
  const counts: Record<TabKey, number> = {
    pokemon: pokemon?.length ?? 0,
    ...(Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.length])) as Record<ItemCategory, number>),
  };

  return (
    <div className="flex h-full flex-col">
      <AppScreenHeader title="Bag" icon={<Backpack className="h-5 w-5" strokeWidth={1.75} />} />

      <div className="flex items-center justify-between px-5 pt-3">
        <p className="text-xs text-mist/50">{profile.username}&apos;s Bag</p>
        <div className="rounded-full bg-white/5 px-3 py-1 font-mono text-xs font-medium text-volt">
          ₽{profile.money.toLocaleString()}
        </div>
      </div>

      {/* Category tabs: a 4-column grid, so every pocket is always visible
          and tappable at any screen size (no hidden horizontal scrolling). */}
      <div className="mt-3 grid grid-cols-4 gap-1.5 px-5" role="tablist" aria-label="Bag pockets">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "relative flex min-w-0 touch-manipulation flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-medium leading-tight transition-colors",
              tab === t.key ? "bg-volt text-screen-ink" : "bg-white/5 text-mist/70 active:bg-white/10"
            )}
          >
            {t.icon}
            <span className="w-full truncate text-center">{t.label}</span>
            {counts[t.key] > 0 ? (
              <span
                className={cn(
                  "absolute right-1 top-1 rounded-full px-1 font-mono text-[9px] leading-[14px]",
                  tab === t.key ? "bg-screen-ink/20 text-screen-ink" : "bg-white/10 text-mist/60"
                )}
              >
                {counts[t.key]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Search within the open pocket */}
      <div className="mx-5 mt-2.5 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
        <Search className="h-4 w-4 shrink-0 text-mist/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tab === "pokemon" ? "Search Pokémon or Pokédex no." : "Search items"}
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-mist placeholder:text-mist/40 focus:outline-none"
          aria-label="Search the Bag"
        />
        {query ? (
          <button type="button" onClick={() => setQuery("")} className="text-mist/40" aria-label="Clear search">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="space-y-2.5"
          >
            {tab === "pokemon" ? (
              pokemonLoading ? (
                <BagSkeleton />
              ) : sortedPokemon.length === 0 ? (
                <EmptyState message={query ? "No Pokémon match your search." : "No Pokémon yet. Your admin can add some to your party."} />
              ) : (
                sortedPokemon.map((p) => <PokemonCard key={p.id} pokemon={p} onClick={() => setSelectedId(p.id)} />)
              )
            ) : itemsLoading ? (
              <BagSkeleton />
            ) : pocketItems.length === 0 ? (
              <EmptyState message={query && grouped[tab].length > 0 ? "No items match your search." : "Nothing in this pocket yet."} />
            ) : (
              pocketItems.map((entry) => <ItemRow key={entry.id} entry={entry} />)
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function BagSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-16 w-full rounded-2xl" />
      ))}
    </>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      <Backpack className="h-8 w-8 text-mist/20" strokeWidth={1.5} />
      <p className="max-w-[220px] text-xs text-mist/50">{message}</p>
    </div>
  );
}
