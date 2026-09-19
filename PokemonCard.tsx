import { Star } from "lucide-react";
import { motion } from "framer-motion";
import { SpriteImage } from "@/components/phone/SpriteImage";
import { HpBar } from "@/components/phone/HpBar";
import { StatusBadge } from "@/components/phone/StatusBadge";
import { pokemonSpriteUrl } from "@/lib/sprites";
import type { TrainerPokemon } from "@/types/database.types";

export function PokemonCard({ pokemon, onClick }: { pokemon: TrainerPokemon; onClick: () => void }) {
  const displayName = pokemon.nickname || pokemon.species.name;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      className="glass flex w-full touch-manipulation items-center gap-3 rounded-2xl p-3 text-left shadow-glass active:bg-white/10"
    >
      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/5">
        <SpriteImage
          src={pokemonSpriteUrl(pokemon.species_id)}
          alt={pokemon.species.name}
          className="h-12 w-12"
          fallbackClassName="h-12 w-12"
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate font-display text-sm font-semibold text-mist">{displayName}</p>
          {pokemon.is_favorite ? <Star className="h-3.5 w-3.5 shrink-0 fill-volt text-volt" /> : null}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="shrink-0 font-mono text-[10px] text-mist/50">Lv{pokemon.level}</span>
          <HpBar current={pokemon.current_hp} max={pokemon.max_hp} className="flex-1" />
        </div>
      </div>

      {pokemon.status !== "healthy" ? <StatusBadge status={pokemon.status} className="shrink-0" /> : null}
    </motion.button>
  );
}
