import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Backpack, CircleDot, Sparkles, KeyRound, PawPrint } from "lucide-react";
import { AppScreenHeader } from "@/components/phone/AppScreenHeader";
import { PokemonCard } from "@/components/phone/PokemonCard";
import { PokemonDetailView } from "@/components/phone/PokemonDetailView";
import { ItemRow } from "@/components/phone/ItemRow";
import { Skeleton } from "@/components/ui/skeleton";
import { useTrainerPokemon, useTrainerItems, groupItemsByCategory } from "@/hooks/useBag";
import { usePhoneContext } from "@/hooks/usePhoneContext";
import type { ItemCategory } from "@/types/database.types";

type TabKey = "pokemon" | ItemCategory;

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "pokemon", label: "Pokémon", icon: <PawPrint className="h-4 w-4" /> },
  { key: "poke_ball", label: "Poké Balls", icon: <CircleDot className="h-4 w-4" /> },
  { key: "item", label: "Items", icon: <Backpack className="h-4 w-4" /> },
  { key: "evolution_item", label: "Evolution", icon: <Sparkles className="h-4 w-4" /> },
  { key: "key_item", label: "Key Items", icon: <KeyRound className="h-4 w-4" /> },
];

export default function Bag() {
  const { profile } = usePhoneContext();
  const [tab, setTab] = React.useState<TabKey>("pokemon");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const { data: pokemon, isLoading: pokemonLoading } = useTrainerPokemon();
  const { data: items, isLoading: itemsLoading } = useTrainerItems();
  const grouped = groupItemsByCategory(items);

  const selected = pokemon?.find((p) => p.id === selectedId) ?? null;

  if (selected) {
    return <PokemonDetailView pokemon={selected} onBack={() => setSelectedId(null)} />;
  }

  const sortedPokemon = [...(pokemon ?? [])].sort(
    (a, b) => Number(b.is_favorite) - Number(a.is_favorite) || b.level - a.level
  );

  return (
    <div className="flex h-full flex-col">
      <AppScreenHeader title="Bag" icon={<Backpack className="h-5 w-5" strokeWidth={1.75} />} />

      <div className="flex items-center justify-between px-5 pt-3">
        <p className="text-xs text-mist/50">{profile.username}&apos;s Bag</p>
        <div className="rounded-full bg-white/5 px-3 py-1 font-mono text-xs font-medium text-volt">
          ₽{profile.money.toLocaleString()}
        </div>
      </div>

      {/* Category tabs */}
      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              "flex touch-manipulation items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors " +
              (tab === t.key ? "bg-volt text-screen-ink" : "bg-white/5 text-mist/70 active:bg-white/10")
            }
          >
            {t.icon}
            {t.label}
          </button>
        ))}
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
                <EmptyState message="No Pokémon yet. Your admin can add some to your party." />
              ) : (
                sortedPokemon.map((p) => <PokemonCard key={p.id} pokemon={p} onClick={() => setSelectedId(p.id)} />)
              )
            ) : itemsLoading ? (
              <BagSkeleton />
            ) : grouped[tab].length === 0 ? (
              <EmptyState message="Nothing in this pocket yet." />
            ) : (
              grouped[tab].map((entry) => <ItemRow key={entry.id} entry={entry} />)
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
