import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { SpriteImage } from "@/components/phone/SpriteImage";
import { pokemonArtworkUrl } from "@/lib/sprites";

type Phase = "enter" | "glow" | "pulse" | "restored";

export function PokeBall({ className }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-full border-2 border-black/70 ${className ?? ""}`}>
      <div className="absolute inset-x-0 top-0 h-1/2 bg-rotom-red" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-white" />
      <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-black/70" />
      <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black/70 bg-white" />
    </div>
  );
}

interface HealingAnimationProps {
  speciesId: number;
  pokemonName: string;
  mode: "heal" | "revive";
  onDone: () => void;
}

/**
 * Short (~3s) Pokémon-Center-style animation: the Poké Ball is placed into
 * the healing machine, the machine glows, a blue healing pulse radiates out
 * while a progress bar fills, then sparkles and the restored Pokémon.
 * Purely presentational — the actual heal/revive RPC is fired by the caller
 * in parallel, so the database is already correct even if the trainer
 * closes the app mid-animation.
 */
export function HealingAnimation({ speciesId, pokemonName, mode, onDone }: HealingAnimationProps) {
  const [phase, setPhase] = React.useState<Phase>("enter");

  React.useEffect(() => {
    const timers = [
      window.setTimeout(() => setPhase("glow"), 650),
      window.setTimeout(() => setPhase("pulse"), 1250),
      window.setTimeout(() => setPhase("restored"), 2350),
      window.setTimeout(onDone, 3400),
    ];
    return () => timers.forEach(window.clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const glowing = phase === "glow" || phase === "pulse";

  return (
    <motion.div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-screen-ink/95 px-8 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <p className="font-display text-lg font-semibold text-mist">
        {mode === "revive" ? "Reviving" : "Healing"} {pokemonName}…
      </p>

      <div className="relative flex h-48 w-full max-w-xs items-center justify-center">
        <motion.div
          className="relative flex h-32 w-44 items-end justify-center rounded-2xl border border-white/20 bg-gradient-to-b from-white/10 to-white/[0.03]"
          animate={{
            boxShadow: glowing
              ? ["0 0 0px 0px rgba(96,165,250,0)", "0 0 40px 10px rgba(96,165,250,0.55)", "0 0 24px 6px rgba(96,165,250,0.4)"]
              : "0 0 0px 0px rgba(96,165,250,0)",
          }}
          transition={{ duration: 0.9, repeat: glowing ? Infinity : 0, repeatType: "reverse" }}
        >
          <div className="mb-3 h-2 w-24 rounded-full bg-white/15" />
          <AnimatePresence>
            {phase !== "restored" ? (
              <motion.div
                className="absolute"
                initial={{ x: -110, y: -20, opacity: 0 }}
                animate={{ x: 0, y: -8, opacity: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ type: "spring", stiffness: 140, damping: 16 }}
              >
                <motion.div
                  animate={glowing ? { rotate: [0, -6, 6, -4, 4, 0] } : { rotate: 0 }}
                  transition={{ duration: 0.9, repeat: glowing ? Infinity : 0 }}
                >
                  <PokeBall className="h-12 w-12" />
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>

        {phase === "pulse" ? (
          <>
            {[0, 1].map((i) => (
              <motion.div
                key={i}
                className="absolute rounded-full border-2 border-blue-400/60"
                initial={{ width: 90, height: 90, opacity: 0.8 }}
                animate={{ width: 260, height: 260, opacity: 0 }}
                transition={{ duration: 1.0, delay: i * 0.45, repeat: Infinity, ease: "easeOut" }}
              />
            ))}
          </>
        ) : null}

        {phase === "restored" ? (
          <motion.div
            className="absolute flex flex-col items-center"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 14 }}
          >
            <SpriteImage src={pokemonArtworkUrl(speciesId)} alt={pokemonName} className="h-32 w-32" fallbackClassName="h-32 w-32" />
            {[
              { x: -70, y: -50, d: 0 },
              { x: 70, y: -40, d: 0.1 },
              { x: -60, y: 30, d: 0.2 },
              { x: 64, y: 34, d: 0.3 },
            ].map((s, i) => (
              <motion.div
                key={i}
                className="absolute text-volt"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: [0, 1, 0], scale: [0, 1.2, 0], x: s.x, y: s.y }}
                transition={{ duration: 0.9, delay: s.d }}
              >
                <Sparkles className="h-5 w-5" />
              </motion.div>
            ))}
          </motion.div>
        ) : null}
      </div>

      <div className="w-full max-w-xs">
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-blue-400 to-cyan-300"
            initial={{ width: "0%" }}
            animate={{ width: phase === "enter" || phase === "glow" ? "12%" : "100%" }}
            transition={{ duration: phase === "pulse" ? 1.0 : 0.4, ease: "easeInOut" }}
          />
        </div>
        <p className="mt-2 h-4 text-center text-xs text-mist/60">{phase === "restored" ? "Fully restored!" : "Please wait…"}</p>
      </div>
    </motion.div>
  );
}
