import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useGameConfig } from "@/hooks/useBattle";
import { xpProgress } from "@/lib/xp";

/**
 * XP bar for the current level (PokéGear 13: every level starts at 0), e.g.
 * Lv 4 with 35 of 70 XP → "35 / 70 XP". Reads the XP table from game_config,
 * the same table the server levels Pokémon up with. At the max level: "MAX".
 */
export function XpBar({ xp, level, className }: { xp: number; level: number; className?: string }) {
  const { data: config } = useGameConfig();

  if (!config) {
    return <div className={cn("h-1.5 animate-pulse rounded-full bg-white/10", className)} />;
  }

  const p = xpProgress(xp, level, config.xpCurve, config.maxLevel);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-circuit-violet"
          initial={false}
          animate={{ width: `${p.percent}%` }}
          transition={{ type: "spring", stiffness: 200, damping: 26 }}
        />
      </div>
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-mist/60">
        {p.atMax ? "MAX" : `${p.current} / ${p.needed} XP`}
      </span>
    </div>
  );
}
