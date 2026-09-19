import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Star } from "lucide-react";
import { SpriteImage } from "@/components/phone/SpriteImage";
import { pokemonSpriteUrl } from "@/lib/sprites";
import { cn } from "@/lib/utils";
import type { TrainerPokemon } from "@/types/database.types";

interface PcSlotProps {
  slotId: string;
  pokemon: TrainerPokemon | null;
  isSelected: boolean;
  onTap: (slotId: string) => void;
}

export function PcSlot({ slotId, pokemon, isSelected, onTap }: PcSlotProps) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: slotId });
  const {
    setNodeRef: setDragRef,
    listeners,
    attributes,
    isDragging,
  } = useDraggable({
    id: pokemon?.id ?? `empty-${slotId}`,
    disabled: !pokemon,
  });

  return (
    <button
      ref={setDropRef}
      type="button"
      onClick={() => onTap(slotId)}
      className={cn(
        "relative flex aspect-square touch-manipulation items-center justify-center rounded-xl border transition-colors",
        isOver ? "border-volt bg-volt/10" : "border-white/10 bg-white/5",
        isSelected && "ring-2 ring-volt ring-offset-1 ring-offset-screen-ink"
      )}
    >
      {pokemon ? (
        <div
          ref={setDragRef}
          {...listeners}
          {...attributes}
          className={cn("flex h-full w-full touch-none items-center justify-center", isDragging && "opacity-30")}
        >
          <SpriteImage
            src={pokemonSpriteUrl(pokemon.species_id)}
            alt={pokemon.species.name}
            className="h-8 w-8"
            fallbackClassName="h-8 w-8"
          />
          <span className="absolute bottom-0.5 right-1 font-mono text-[8px] text-mist/70">Lv{pokemon.level}</span>
          {pokemon.is_favorite ? (
            <Star className="absolute left-1 top-0.5 h-2.5 w-2.5 fill-volt text-volt" />
          ) : null}
        </div>
      ) : null}
    </button>
  );
}
