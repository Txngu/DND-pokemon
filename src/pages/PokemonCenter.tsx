import * as React from "react";
import { AnimatePresence } from "framer-motion";
import { HeartPulse, Skull, Sparkles } from "lucide-react";
import { AppScreenHeader } from "@/components/phone/AppScreenHeader";
import { HealingAnimation } from "@/components/phone/HealingAnimation";
import { HpBar } from "@/components/phone/HpBar";
import { SpriteImage } from "@/components/phone/SpriteImage";
import { Skeleton } from "@/components/ui/skeleton";
import { pokemonSpriteUrl } from "@/lib/sprites";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useTrainerPokemon } from "@/hooks/useBag";
import { useHealPokemon, useRevivePokemon } from "@/hooks/useBattle";
import type { TrainerPokemon } from "@/types/database.types";

type Action = { pokemon: TrainerPokemon; mode: "heal" | "revive" };

function urgency(p: TrainerPokemon) {
  if (p.is_dead) return 3;
  if (p.status === "fainted") return 0;
  if (p.current_hp < p.max_hp) return 1;
  return 2;
}

export default function PokemonCenter() {
  const { data: pokemon, isLoading } = useTrainerPokemon();
  const heal = useHealPokemon();
  const revive = useRevivePokemon();
  const [action, setAction] = React.useState<Action | null>(null);

  const sorted = [...(pokemon ?? [])].sort((a, b) => urgency(a) - urgency(b) || b.level - a.level);

  function start(p: TrainerPokemon, mode: "heal" | "revive") {
    if (action) return;
    setAction({ pokemon: p, mode });
    const mutation = mode === "heal" ? heal : revive;
    // The RPC fires immediately, in parallel with the animation, so the
    // database is already correct even if the animation is interrupted. If
    // the server rejects it, drop the animation instead of playing it for
    // nothing (the global mutation error toast explains why).
    mutation.mutate(p.id, { onError: () => setAction(null) });
  }

  function finish() {
    if (!action) return;
    const name = action.pokemon.nickname || action.pokemon.species.name;
    toast(action.mode === "revive" ? `${name} was revived!` : `${name} was healed!`, "success");
    setAction(null);
  }

  return (
    <div className="relative flex h-full flex-col">
      <AppScreenHeader title="Pokémon Center" subtitle="Heal & revive your team" icon={<HeartPulse className="h-5 w-5" strokeWidth={1.75} />} />

      <div className="flex-1 space-y-2.5 overflow-y-auto px-5 py-4">
        {isLoading ? (
          <>
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <HeartPulse className="h-8 w-8 text-mist/20" strokeWidth={1.5} />
            <p className="max-w-[220px] text-xs text-mist/50">You don&apos;t have any Pokémon to heal yet.</p>
          </div>
        ) : (
          sorted.map((p) => {
            const fainted = p.status === "fainted" && !p.is_dead;
            const full = p.current_hp >= p.max_hp;
            return (
              <div key={p.id} className="glass theme-accent-line rounded-2xl p-3 shadow-glass">
                <div className="flex items-center gap-3">
                  <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/5">
                    <SpriteImage
                      src={pokemonSpriteUrl(p.species_id)}
                      alt={p.species.name}
                      className={cn("h-12 w-12", (fainted || p.is_dead) && "opacity-40 grayscale")}
                      fallbackClassName="h-12 w-12"
                    />
                    {p.is_dead ? <Skull className="absolute -right-1 -top-1 h-4 w-4 text-mist/70" /> : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate font-display text-sm font-semibold text-mist">{p.nickname || p.species.name}</p>
                      <span className="shrink-0 font-mono text-[10px] text-mist/50">Lv{p.level}</span>
                      {p.is_shiny ? <Sparkles className="h-3 w-3 shrink-0 text-volt" /> : null}
                    </div>
                    <HpBar current={p.current_hp} max={p.max_hp} className="mt-1" />
                    <p className="mt-1 text-[10px] uppercase tracking-wide">
                      {p.is_dead ? (
                        <span className="text-mist/50">Dead</span>
                      ) : fainted ? (
                        <span className="text-rotom-red-light">Fainted</span>
                      ) : full ? (
                        <span className="text-emerald-300">Healthy</span>
                      ) : (
                        <span className="text-amber-300">Injured</span>
                      )}
                    </p>
                  </div>
                </div>

                {!p.is_dead ? (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={full || fainted || !!action}
                      onClick={() => start(p, "heal")}
                      className="flex-1 touch-manipulation rounded-full bg-volt/15 py-2 text-xs font-semibold text-volt active:scale-95 disabled:opacity-35"
                    >
                      Heal
                    </button>
                    {fainted ? (
                      <button
                        type="button"
                        disabled={!!action}
                        onClick={() => start(p, "revive")}
                        className="flex-1 touch-manipulation rounded-full bg-volt py-2 text-xs font-semibold text-screen-ink active:scale-95 disabled:opacity-50"
                      >
                        Revive
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 text-center text-[11px] text-mist/40">This Pokémon has died and can&apos;t be revived.</p>
                )}
              </div>
            );
          })
        )}
      </div>

      <AnimatePresence>
        {action ? (
          <HealingAnimation
            speciesId={action.pokemon.species_id}
            pokemonName={action.pokemon.nickname || action.pokemon.species.name}
            mode={action.mode}
            onDone={finish}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
