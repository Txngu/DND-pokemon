import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * XP progress toward the *next* level. `needed` is the threshold for the
 * next level (from the configurable game_config XP curve), or null when the
 * Pokémon is at the campaign's max level (bar shows as full, "MAX").
 */
export function XpBar({ xp, needed, className }: { xp: number; needed: number | null; className?: string }) {
  const atMax = needed === null;
  const pct = atMax ? 100 : Math.max(0, Math.min(100, (xp / needed) * 100));

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-circuit-violet"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 200, damping: 26 }}
        />
      </div>
      <span className="shrink-0 font-mono text-[10px] text-mist/60">{atMax ? "MAX" : `XP ${xp}/${needed}`}</span>
    </div>
  );
}
