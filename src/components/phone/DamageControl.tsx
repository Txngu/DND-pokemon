import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HeartCrack } from "lucide-react";
import { useDamagePokemon } from "@/hooks/usePokemonHp";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { TrainerPokemon } from "@/types/database.types";

/**
 * "Take damage" (PokéGear 12): the trainer records damage on their own
 * Pokémon, e.g. when the Game Master describes an attack out loud. It can
 * only lower KP; the server checks ownership and clamps at 0 (fainted).
 */
export function DamageControl({ pokemon, name }: { pokemon: TrainerPokemon; name: string }) {
  const damage = useDamagePokemon();
  const [value, setValue] = React.useState("");
  const [floater, setFloater] = React.useState<{ key: number; text: string } | null>(null);

  const amount = value.trim() === "" ? null : Number(value);
  const valid = amount !== null && Number.isInteger(amount) && amount > 0;
  const after = valid ? Math.max(0, pokemon.current_hp - amount!) : null;

  function apply() {
    if (!valid) return;
    damage.mutate(
      { pokemonId: pokemon.id, amount: amount! },
      {
        onSuccess: (updated) => {
          const lost = pokemon.current_hp - updated.current_hp;
          setFloater({ key: Date.now(), text: `-${lost}` });
          setValue("");
          if (updated.current_hp === 0) toast(`${name} fainted!`, "error");
          else toast(`${name} took ${lost} damage (${updated.current_hp}/${updated.max_hp} KP)`, "info");
        },
      }
    );
  }

  return (
    <div className="relative">
      <AnimatePresence>
        {floater ? (
          <motion.span
            key={floater.key}
            className="pointer-events-none absolute -top-3 right-2 font-display text-lg font-bold text-rotom-red-light"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: -12 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            onAnimationComplete={() => window.setTimeout(() => setFloater(null), 500)}
          >
            {floater.text}
          </motion.span>
        ) : null}
      </AnimatePresence>
      <p className="mb-1.5 text-[11px] text-mist/50">Take damage</p>
      <div className="flex items-center gap-2">
        <input
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
          placeholder="Damage"
          aria-label={`Damage to ${name}`}
          className="w-24 min-w-0 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-mist placeholder:text-mist/40 focus:outline-none focus:ring-1 focus:ring-volt"
        />
        <button
          type="button"
          onClick={apply}
          disabled={!valid || damage.isPending}
          className="flex shrink-0 touch-manipulation items-center gap-1.5 rounded-xl bg-rotom-red/80 px-3 py-2 text-xs font-semibold text-white active:scale-95 disabled:opacity-40"
        >
          <HeartCrack className="h-3.5 w-3.5" />
          Apply damage
        </button>
      </div>
      {valid ? (
        <p className={cn("mt-1.5 font-mono text-[11px]", after === 0 ? "text-rotom-red-light" : "text-mist/60")}>
          {pokemon.current_hp}/{pokemon.max_hp} → {after}/{pokemon.max_hp} KP{after === 0 ? " · faints" : ""}
        </p>
      ) : null}
    </div>
  );
}
