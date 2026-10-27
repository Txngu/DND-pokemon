import { Star, Skull, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { PokemonSprite } from "@/components/phone/PokemonSprite";
import { HpBar } from "@/components/phone/HpBar";
import { StatusBadge } from "@/components/phone/StatusBadge";
import { cn } from "@/lib/utils";
import type { TrainerPokemon } from "@/types/database.types";

export function PokemonCard({ pokemon, onClick }: { pokemon: TrainerPokemon; onClick: () => void }) {
  const displayName = pokemon.nickname || pokemon.species.name;
  const down = pokemon.is_dead || pokemon.status === "fainted";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      className="glass theme-accent-line flex w-full touch-manipulation items-center gap-3 rounded-2xl p-3 text-left shadow-glass active:bg-white/10"
    >
      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/5">
        <PokemonSprite
          speciesId={pokemon.species_id}
          shiny={pokemon.is_shiny}
          alt={pokemon.species.name}
          className={cn("h-12 w-12", down && "opacity-40 grayscale")}
        />
        {pokemon.is_dead ? <Skull className="absolute -right-1 -top-1 h-4 w-4 text-mist/70" /> : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate font-display text-sm font-semibold text-mist">{displayName}</p>
          {pokemon.is_favorite ? <Star className="h-3.5 w-3.5 shrink-0 fill-volt text-volt" /> : null}
          {pokemon.is_shiny ? <Sparkles className="h-3 w-3 shrink-0 text-volt" /> : null}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="shrink-0 font-mono text-[10px] text-mist/50">Lv{pokemon.level}</span>
          <HpBar current={pokemon.current_hp} max={pokemon.max_hp} className="flex-1" />
        </div>
      </div>

      {pokemon.is_dead ? (
        <span className="shrink-0 rounded-full bg-mist/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-mist/50">Dead</span>
      ) : pokemon.status !== "healthy" ? (
        <StatusBadge status={pokemon.status} className="shrink-0" />
      ) : null}
    </motion.button>
  );
}
