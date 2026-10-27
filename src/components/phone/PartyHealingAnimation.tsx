import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, HeartPulse, Sparkles } from "lucide-react";
import { SpriteImage } from "@/components/phone/SpriteImage";
import { PokeBall } from "@/components/phone/HealingAnimation";
import { pokemonSpriteUrl } from "@/lib/sprites";
import { cn } from "@/lib/utils";
import type { PartyHealResult } from "@/types/database.types";

/**
 * Pokémon Center animation for several Pokémon at once. The Poké Balls are
 * placed on the machine, then each one lights up in turn while its row
 * shows the KP filling back up ("healed" / "revived"), and finally the
 * classic "Your Pokémon are fully healed!". The RPC (heal_party) has already
 * run by the time results arrive here; this only presents them.
 *
 * `results` is null while the request is still in flight: the machine
 * idles until they land.
 */
export function PartyHealingAnimation({
  results,
  count,
  onDone,
}: {
  results: PartyHealResult[] | null;
  count: number;
  onDone: () => void;
}) {
  const [step, setStep] = React.useState(-1); // -1 = loading balls, 0..n-1 = healing that index, n = done
  const shown = results ?? [];
  const total = results ? results.length : count;

  React.useEffect(() => {
    if (!results) return;
    let i = -1;
    const timers: number[] = [];
    const next = () => {
      i += 1;
      setStep(i);
      if (i < results.length) {
        const r = results[i];
        timers.push(window.setTimeout(next, r.result === "unchanged" || r.result === "dead" ? 380 : 900));
      } else {
        timers.push(window.setTimeout(onDone, 2200));
      }
    };
    timers.push(window.setTimeout(next, 900));
    return () => timers.forEach(window.clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  const done = results !== null && step >= results.length;
  const restored = shown.filter((r) => r.result === "healed" || r.result === "revived").length;

  return (
    <motion.div
      className="absolute inset-0 z-50 flex flex-col items-center bg-screen-ink/95 px-6 pt-16 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <p className="flex items-center gap-2 font-display text-lg font-semibold text-mist">
        <HeartPulse className="h-5 w-5 text-rotom-red-light" />
        {done ? "All done!" : "Healing your team…"}
      </p>

      {/* The machine: one slot per Poké Ball */}
      <motion.div
        className="mt-5 grid grid-cols-3 gap-3 rounded-2xl border border-white/15 bg-gradient-to-b from-white/10 to-white/[0.03] p-4"
        animate={{
          boxShadow: done
            ? "0 0 36px 8px rgba(96,165,250,0.45)"
            : ["0 0 0px 0px rgba(96,165,250,0)", "0 0 24px 6px rgba(96,165,250,0.35)", "0 0 0px 0px rgba(96,165,250,0)"],
        }}
        transition={{ duration: 1.2, repeat: done ? 0 : Infinity }}
      >
        {Array.from({ length: Math.max(total, 1) }).map((_, i) => {
          const active = step === i;
          const finished = step > i;
          return (
            <div key={i} className="relative flex h-12 w-12 items-center justify-center rounded-full bg-black/30">
              <motion.div
                initial={{ y: -40, opacity: 0 }}
                animate={{ y: 0, opacity: 1, rotate: active ? [0, -10, 10, -6, 6, 0] : 0 }}
                transition={{ delay: i * 0.12, duration: active ? 0.6 : 0.35 }}
              >
                <PokeBall className="h-9 w-9" />
              </motion.div>
              {active || finished ? (
                <motion.div
                  className="absolute inset-0 rounded-full"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: finished ? 0.55 : [0.2, 0.9, 0.4] }}
                  transition={{ duration: 0.6 }}
                  style={{ boxShadow: "0 0 18px 6px rgba(96,165,250,0.75)" }}
                />
              ) : null}
            </div>
          );
        })}
      </motion.div>

      {/* Per-Pokémon results */}
      <div className="mt-5 w-full max-w-xs space-y-1.5">
        {shown.map((r, i) => {
          const reached = step >= i;
          const changed = r.result === "healed" || r.result === "revived";
          const pctBefore = r.max_hp ? (r.hp_before / r.max_hp) * 100 : 0;
          const pctAfter = r.max_hp ? (r.hp_after / r.max_hp) * 100 : 0;
          return (
            <motion.div
              key={r.id}
              className={cn("flex items-center gap-2.5 rounded-xl bg-white/5 px-2.5 py-1.5", !reached && "opacity-40")}
              initial={{ x: -12, opacity: 0 }}
              animate={{ x: 0, opacity: reached ? 1 : 0.4 }}
              transition={{ delay: 0.1 + i * 0.05 }}
            >
              <SpriteImage
                src={pokemonSpriteUrl(r.species_id)}
                alt={r.name}
                className={cn("h-8 w-8", r.result === "revived" && !reached && "grayscale", r.result === "dead" && "grayscale opacity-50")}
                fallbackClassName="h-8 w-8"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-mist">{r.name}</p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="h-full rounded-full bg-emerald-400"
                    initial={{ width: `${pctBefore}%` }}
                    animate={{ width: `${reached ? pctAfter : pctBefore}%` }}
                    transition={{ duration: 0.7, ease: "easeOut" }}
                  />
                </div>
              </div>
              <span
                className={cn(
                  "w-16 shrink-0 text-right text-[10px] font-semibold uppercase tracking-wide",
                  !reached
                    ? "text-mist/30"
                    : r.result === "revived"
                      ? "text-volt"
                      : r.result === "healed"
                        ? "text-emerald-300"
                        : "text-mist/40"
                )}
              >
                {!reached ? "…" : r.result === "revived" ? "Revived" : r.result === "healed" ? "Healed" : r.result === "dead" ? "—" : "Full"}
              </span>
              <AnimatePresence>
                {reached && changed ? (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-emerald-300">
                    <Check className="h-3.5 w-3.5" />
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {done ? (
          <motion.div
            className="mt-6 flex flex-col items-center gap-1 text-center"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 14 }}
          >
            <Sparkles className="h-6 w-6 text-volt" />
            <p className="font-display text-base font-semibold text-mist">
              {restored > 0 ? "Your Pokémon are fully healed!" : "Your Pokémon were already in perfect health!"}
            </p>
            <button type="button" onClick={onDone} className="mt-2 text-xs text-mist/50 underline-offset-2 hover:underline">
              Continue
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
