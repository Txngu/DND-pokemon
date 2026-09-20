import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Check } from "lucide-react";
import { SpriteImage } from "@/components/phone/SpriteImage";
import { pokemonSpriteUrl } from "@/lib/sprites";
import type { TrainerPokemon } from "@/types/database.types";

interface PokemonPickerSheetProps {
  open: boolean;
  pokemon: TrainerPokemon[];
  initialSelected: string[];
  onClose: () => void;
  onConfirm: (selectedIds: string[]) => void;
}

export function PokemonPickerSheet({ open, pokemon, initialSelected, onClose, onConfirm }: PokemonPickerSheetProps) {
  const [selected, setSelected] = React.useState<string[]>(initialSelected);

  React.useEffect(() => {
    if (open) setSelected(initialSelected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="absolute inset-0 z-40 flex flex-col justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div className="absolute inset-0 bg-black/60" onClick={onClose} />
          <motion.div
            className="glass relative z-10 flex max-h-[75%] flex-col rounded-t-3xl p-4 shadow-glass"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-mist">Choose Pokémon ({selected.length})</h2>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 touch-manipulation items-center justify-center rounded-full bg-white/5 text-mist"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto pb-2">
              {pokemon.length === 0 ? (
                <p className="py-8 text-center text-xs text-mist/40">You have no Pokémon to offer.</p>
              ) : (
                pokemon.map((p) => {
                  const isSelected = selected.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggle(p.id)}
                      className={
                        "flex w-full touch-manipulation items-center gap-3 rounded-2xl p-2.5 text-left " +
                        (isSelected ? "bg-volt/15 ring-1 ring-volt" : "bg-white/5")
                      }
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5">
                        <SpriteImage
                          src={pokemonSpriteUrl(p.species_id)}
                          alt={p.species.name}
                          className="h-8 w-8"
                          fallbackClassName="h-8 w-8"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-mist">{p.nickname || p.species.name}</p>
                        <p className="text-[10px] text-mist/40">Lv{p.level}</p>
                      </div>
                      {isSelected ? (
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-volt">
                          <Check className="h-3.5 w-3.5 text-screen-ink" />
                        </div>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>

            <button
              type="button"
              onClick={() => onConfirm(selected)}
              className="mt-2 w-full touch-manipulation rounded-2xl bg-volt py-3 text-sm font-semibold text-screen-ink active:scale-[0.98]"
            >
              Done
            </button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
