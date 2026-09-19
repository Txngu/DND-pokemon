import * as React from "react";
import { Star, Swords, Sparkles, Package } from "lucide-react";
import { motion } from "framer-motion";
import { AppScreenHeader } from "@/components/phone/AppScreenHeader";
import { SpriteImage } from "@/components/phone/SpriteImage";
import { HpBar } from "@/components/phone/HpBar";
import { StatusBadge } from "@/components/phone/StatusBadge";
import { HeldItemSheet } from "@/components/phone/HeldItemSheet";
import { pokemonArtworkUrl, itemSpriteUrl } from "@/lib/sprites";
import { useTrainerItems, useToggleFavorite, useSetHeldItem } from "@/hooks/useBag";
import type { TrainerPokemon } from "@/types/database.types";

export function PokemonDetailView({ pokemon, onBack }: { pokemon: TrainerPokemon; onBack: () => void }) {
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const { data: items = [] } = useTrainerItems();
  const toggleFavorite = useToggleFavorite();
  const setHeldItem = useSetHeldItem();

  const displayName = pokemon.nickname || pokemon.species.name;

  const stats = [
    { icon: Sparkles, label: "Nature", value: pokemon.nature },
    { icon: Swords, label: "Ability", value: pokemon.ability },
  ];

  return (
    <div className="relative flex h-full flex-col">
      <AppScreenHeader title={displayName} subtitle={`Lv${pokemon.level} · ${pokemon.species.name}`} onBack={onBack} />

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="flex flex-col items-center gap-2 pb-4">
          <div className="glass flex h-40 w-40 items-center justify-center rounded-3xl">
            <SpriteImage
              src={pokemonArtworkUrl(pokemon.species_id)}
              alt={pokemon.species.name}
              className="h-32 w-32"
              fallbackClassName="h-32 w-32"
            />
          </div>

          <button
            type="button"
            onClick={() => toggleFavorite.mutate({ pokemonId: pokemon.id, isFavorite: !pokemon.is_favorite })}
            disabled={toggleFavorite.isPending}
            className="mt-1 flex touch-manipulation items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium text-mist active:scale-95 disabled:opacity-50"
          >
            <Star className={pokemon.is_favorite ? "h-4 w-4 fill-volt text-volt" : "h-4 w-4 text-mist/60"} />
            {pokemon.is_favorite ? "Favorite" : "Set as favorite"}
          </button>
        </div>

        <div className="mb-3">
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-mist/50">HP</p>
          <div className="glass flex items-center justify-between rounded-2xl p-3">
            <HpBar current={pokemon.current_hp} max={pokemon.max_hp} className="flex-1" />
            <StatusBadge status={pokemon.status} className="ml-3 shrink-0" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {stats.map(({ icon: Icon, label, value }) => (
            <div key={label} className="glass rounded-2xl p-3">
              <div className="mb-1 flex items-center gap-1.5 text-mist/50">
                <Icon className="h-3.5 w-3.5" />
                <span className="text-[10px] uppercase tracking-wide">{label}</span>
              </div>
              <p className="truncate text-sm font-medium text-mist">{value}</p>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="glass mt-2.5 flex w-full touch-manipulation items-center gap-3 rounded-2xl p-3 text-left active:bg-white/10"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5">
            {pokemon.held_item ? (
              <SpriteImage
                src={itemSpriteUrl(pokemon.held_item.pokeapi_slug)}
                alt={pokemon.held_item.name}
                className="h-7 w-7"
                fallbackClassName="h-7 w-7"
              />
            ) : (
              <Package className="h-5 w-5 text-mist/40" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wide text-mist/50">Held item</p>
            <p className="truncate text-sm font-medium text-mist">{pokemon.held_item?.name ?? "None — tap to set"}</p>
          </div>
        </button>

        {setHeldItem.isError ? (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-xs text-rotom-red-light">
            {(setHeldItem.error as Error).message}
          </motion.p>
        ) : null}

        <div className="mt-6 flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-xs text-mist/50">
          <span>Caught</span>
          <span className="font-mono">{new Date(pokemon.caught_at).toLocaleDateString()}</span>
        </div>
      </div>

      <HeldItemSheet
        open={sheetOpen}
        items={items}
        currentItemId={pokemon.held_item_id}
        onClose={() => setSheetOpen(false)}
        onSelect={(itemId) => {
          setHeldItem.mutate({ pokemonId: pokemon.id, itemId }, { onSuccess: () => setSheetOpen(false) });
        }}
      />
    </div>
  );
}
