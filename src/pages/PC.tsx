import * as React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { AnimatePresence, motion } from "framer-motion";
import { HardDrive, X } from "lucide-react";
import { AppScreenHeader } from "@/components/phone/AppScreenHeader";
import { PcSlot } from "@/components/phone/PcSlot";
import { BoxPager } from "@/components/phone/BoxPager";
import { DragGhost } from "@/components/phone/DragGhost";
import { SpriteImage } from "@/components/phone/SpriteImage";
import { PokemonDetailView } from "@/components/phone/PokemonDetailView";
import { Skeleton } from "@/components/ui/skeleton";
import { pokemonSpriteUrl } from "@/lib/sprites";
import { useTrainerPokemon } from "@/hooks/useBag";
import {
  usePcBoxes,
  useMovePokemon,
  useSwapPokemon,
  useRenameBox,
  locationOf,
  locationsEqual,
  type PokemonLocation,
} from "@/hooks/usePc";
import type { TrainerPokemon } from "@/types/database.types";

const PARTY_SLOTS = 6;

interface SlotInfo {
  location: PokemonLocation;
  occupant: TrainerPokemon | null;
}

export default function PC() {
  const { data: pokemon = [], isLoading: pokemonLoading } = useTrainerPokemon();
  const { data: boxes = [], isLoading: boxesLoading } = usePcBoxes();
  const movePokemon = useMovePokemon();
  const swapPokemon = useSwapPokemon();
  const renameBox = useRenameBox();

  const [boxIndex, setBoxIndex] = React.useState(0);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const currentBox = boxes[boxIndex];

  const slotMap = React.useMemo(() => {
    const map = new Map<string, SlotInfo>();
    for (let slot = 1; slot <= PARTY_SLOTS; slot++) {
      map.set(`party:${slot}`, { location: { type: "party", slot }, occupant: null });
    }
    if (currentBox) {
      for (let slot = 1; slot <= currentBox.capacity; slot++) {
        map.set(`box:${currentBox.id}:${slot}`, {
          location: { type: "box", boxId: currentBox.id, slot },
          occupant: null,
        });
      }
    }
    for (const p of pokemon) {
      if (p.party_slot != null) {
        const entry = map.get(`party:${p.party_slot}`);
        if (entry) entry.occupant = p;
      } else if (currentBox && p.box_id === currentBox.id && p.box_slot != null) {
        const entry = map.get(`box:${p.box_id}:${p.box_slot}`);
        if (entry) entry.occupant = p;
      }
    }
    return map;
  }, [pokemon, currentBox]);

  const detailPokemon = pokemon.find((p) => p.id === detailId) ?? null;
  const activePokemon = pokemon.find((p) => p.id === activeId) ?? null;
  const selectedPokemon = pokemon.find((p) => p.id === selectedId) ?? null;

  if (detailPokemon) {
    return <PokemonDetailView pokemon={detailPokemon} onBack={() => setDetailId(null)} />;
  }

  function performMove(fromPokemonId: string, destSlotId: string) {
    const dest = slotMap.get(destSlotId);
    const moving = pokemon.find((p) => p.id === fromPokemonId);
    if (!dest || !moving) return;

    const currentLocation = locationOf(moving);
    if (locationsEqual(currentLocation, dest.location)) return;

    if (dest.occupant) {
      if (dest.occupant.id === fromPokemonId) return;
      swapPokemon.mutate({ pokemonA: fromPokemonId, pokemonB: dest.occupant.id });
    } else {
      movePokemon.mutate({ pokemonId: fromPokemonId, destination: dest.location });
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    performMove(String(active.id), String(over.id));
  }

  function handleSlotTap(slotId: string) {
    const slot = slotMap.get(slotId);
    if (!slot) return;
    if (selectedId) {
      performMove(selectedId, slotId);
      setSelectedId(null);
    } else if (slot.occupant) {
      setSelectedId(slot.occupant.id);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex h-full flex-col">
        <AppScreenHeader title="PC" subtitle="Pokémon Storage" icon={<HardDrive className="h-5 w-5" strokeWidth={1.75} />} />

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {pokemonLoading || boxesLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-32 w-full rounded-2xl" />
              <Skeleton className="h-64 w-full rounded-2xl" />
            </div>
          ) : (
            <>
              <p className="mb-2 text-[11px] uppercase tracking-wide text-mist/50">Party</p>
              <div className="glass grid grid-cols-3 gap-2 rounded-2xl p-3">
                {Array.from({ length: PARTY_SLOTS }, (_, i) => i + 1).map((slot) => {
                  const id = `party:${slot}`;
                  const occ = slotMap.get(id)?.occupant ?? null;
                  return (
                    <PcSlot key={id} slotId={id} pokemon={occ} isSelected={occ?.id === selectedId} onTap={handleSlotTap} />
                  );
                })}
              </div>

              <div className="mb-2 mt-5">
                {currentBox ? (
                  <BoxPager
                    box={currentBox}
                    index={boxIndex}
                    count={boxes.length}
                    onPrev={() => setBoxIndex((i) => Math.max(0, i - 1))}
                    onNext={() => setBoxIndex((i) => Math.min(boxes.length - 1, i + 1))}
                    onRename={(name) => renameBox.mutate({ boxId: currentBox.id, name })}
                  />
                ) : null}
              </div>

              {currentBox ? (
                <div className="glass grid grid-cols-5 gap-2 rounded-2xl p-3">
                  {Array.from({ length: currentBox.capacity }, (_, i) => i + 1).map((slot) => {
                    const id = `box:${currentBox.id}:${slot}`;
                    const occ = slotMap.get(id)?.occupant ?? null;
                    return (
                      <PcSlot key={id} slotId={id} pokemon={occ} isSelected={occ?.id === selectedId} onTap={handleSlotTap} />
                    );
                  })}
                </div>
              ) : null}

              <p className="mt-4 px-1 text-center text-[11px] text-mist/40">
                Drag a Pokémon to move it, or tap one then tap a slot to send it there.
              </p>
            </>
          )}
        </div>

        <AnimatePresence>
          {selectedPokemon ? (
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
              className="glass mx-4 mb-4 flex items-center gap-3 rounded-2xl p-3 shadow-glass"
            >
              <SpriteImage
                src={pokemonSpriteUrl(selectedPokemon.species_id)}
                alt={selectedPokemon.species.name}
                className="h-9 w-9"
                fallbackClassName="h-9 w-9"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-mist">
                  {selectedPokemon.nickname || selectedPokemon.species.name}
                </p>
                <p className="text-[11px] text-mist/50">Tap a slot to move it</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailId(selectedPokemon.id)}
                className="touch-manipulation rounded-full bg-volt px-3 py-1.5 text-xs font-semibold text-screen-ink active:scale-95"
              >
                Details
              </button>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="flex h-8 w-8 touch-manipulation items-center justify-center rounded-full bg-white/5 text-mist"
                aria-label="Cancel selection"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <DragOverlay>{activePokemon ? <DragGhost pokemon={activePokemon} /> : null}</DragOverlay>
    </DndContext>
  );
}
