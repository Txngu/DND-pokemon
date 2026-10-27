import { PokemonSprite } from "@/components/phone/PokemonSprite";
import type { TrainerPokemon } from "@/types/database.types";

export function DragGhost({ pokemon }: { pokemon: TrainerPokemon }) {
  return (
    <div className="flex h-14 w-14 scale-110 items-center justify-center rounded-xl border border-volt/60 bg-screen-surface shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
      <PokemonSprite speciesId={pokemon.species_id} view="icon" shiny={pokemon.is_shiny} alt={pokemon.species.name} className="h-10 w-10" />
    </div>
  );
}
