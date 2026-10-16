import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { SpriteImage } from "@/components/phone/SpriteImage";
import { pokemonArtworkUrl } from "@/lib/sprites";

type Phase = "silhouette" | "glow" | "flash" | "reveal";

interface EvolutionAnimationProps {
  fromSpeciesId: number;
  toSpeciesId: number;
  fromName: string;
  toName: string;
  onDone: () => void;
}

/**
 * Pokémon-style evolution sequence (~4s): the old Pokémon as a silhouette,
 * a bright white glow with expanding light rings, a full-screen flash, then
 * the new Pokémon revealed with a "Congratulations!" message. Purely
 * visual — the actual species change already happened in the database
 * (apply_evolution) before this plays; it just presents it dramatically.
 */
export function EvolutionAnimation({ fromSpeciesId, toSpeciesId, fromName, toName, onDone }: EvolutionAnimationProps) {
  const [phase, setPhase] = React.useState<Phase>("silhouette");

  React.useEffect(() => {
    const timers = [
      window.setTimeout(() => setPhase("glow"), 900),
      window.setTimeout(() => setPhase("flash"), 2300),
      window.setTimeout(() => setPhase("reveal"), 2900),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, []);

  const showOld = phase === "silhouette" || phase === "glow";

  return (
    <motion.div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {phase === "glow" || phase === "flash" ? (
        <>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute rounded-full border border-white/60"
              initial={{ width: 80, height: 80, opacity: 0.8 }}
              animate={{ width: 520, height: 520, opacity: 0 }}
              transition={{ duration: 1.4, delay: i * 0.35, repeat: Infinity, ease: "easeOut" }}
            />
          ))}
        </>
      ) : null}

      <div className="relative flex h-64 w-64 items-center justify-center">
        <AnimatePresence mode="wait">
          {showOld ? (
            <motion.div
              key="old"
              className="absolute"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: phase === "glow" ? [1, 1.08, 1, 1.12, 1] : 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: phase === "glow" ? 1.4 : 0.6, ease: "easeInOut" }}
            >
              <SpriteImage src={pokemonArtworkUrl(fromSpeciesId)} alt={fromName} className="h-56 w-56" fallbackClassName="h-56 w-56" />
              <motion.div
                className="absolute inset-0"
                animate={{ backgroundColor: phase === "glow" ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,1)" }}
                transition={{ duration: 1.2 }}
              />
            </motion.div>
          ) : (
            <motion.div
              key="new"
              className="absolute"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 180, damping: 14 }}
            >
              <SpriteImage
                src={pokemonArtworkUrl(toSpeciesId)}
                alt={toName}
                className="h-56 w-56 drop-shadow-[0_0_30px_rgba(255,255,255,0.6)]"
                fallbackClassName="h-56 w-56"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {phase === "flash" ? (
          <motion.div
            className="absolute inset-0 bg-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          />
        ) : null}
      </AnimatePresence>

      {phase === "reveal" ? (
        <motion.div
          className="relative mt-4 flex flex-col items-center gap-2 px-6 text-center"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Sparkles className="h-6 w-6 text-volt" />
          <p className="font-display text-2xl font-semibold text-white">Congratulations!</p>
          <p className="text-sm text-white/70">
            Your {fromName} evolved into <span className="font-semibold text-white">{toName}</span>!
          </p>
          <button
            type="button"
            onClick={onDone}
            className="mt-3 touch-manipulation rounded-full bg-volt px-6 py-2 text-sm font-semibold text-screen-ink active:scale-95"
          >
            Continue
          </button>
        </motion.div>
      ) : null}
    </motion.div>
  );
}
