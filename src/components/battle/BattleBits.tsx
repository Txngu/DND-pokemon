import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import { LIGHT_TYPES, TYPE_COLORS, typeLabel } from "@/lib/battle";
import { pokemonSpriteSources } from "@/lib/sprites";
import type { PokemonStatus, PokemonType } from "@/types/database.types";

/** Classic battle HP bar: green → amber → red, with a lagging "damage" trail. */
export function BattleHpBar({
  current,
  max,
  showNumbers,
  className,
}: {
  current: number;
  max: number;
  showNumbers?: boolean;
  className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  const color = pct > 50 ? "bg-emerald-400" : pct > 20 ? "bg-amber-400" : "bg-rotom-red-light";

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5">
        <span className="rounded bg-amber-300/90 px-1 font-mono text-[8px] font-bold leading-[12px] text-screen-ink">HP</span>
        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/10">
          {/* trail: follows slowly so a big hit visibly "drains" */}
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-white/40"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.9, delay: 0.25, ease: "easeOut" }}
          />
          <motion.div
            className={cn("absolute inset-y-0 left-0 rounded-full", color)}
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          />
        </div>
      </div>
      {showNumbers ? (
        <p className="mt-0.5 text-right font-mono text-[11px] tabular-nums text-mist/80">
          <AnimatedNumber value={current} /> / {max}
        </p>
      ) : null}
    </div>
  );
}

/** Counts up/down to a new value instead of jumping. */
export function AnimatedNumber({ value }: { value: number }) {
  const [shown, setShown] = React.useState(value);
  const from = React.useRef(value);

  React.useEffect(() => {
    const start = from.current;
    if (start === value) return;
    const t0 = performance.now();
    const duration = 600;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      setShown(Math.round(start + (value - start) * k));
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <>{shown}</>;
}

export function TypePill({ type, className }: { type: PokemonType | null | undefined; className?: string }) {
  if (!type) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide",
        LIGHT_TYPES.has(type) ? "text-screen-ink" : "text-white",
        className
      )}
      style={{ background: TYPE_COLORS[type] }}
    >
      {typeLabel(type)}
    </span>
  );
}

const STATUS_SHORT: Partial<Record<PokemonStatus, { label: string; color: string }>> = {
  poisoned: { label: "PSN", color: "#A33EA1" },
  burned: { label: "BRN", color: "#EE8130" },
  paralyzed: { label: "PAR", color: "#C8A400" },
  asleep: { label: "SLP", color: "#6B7280" },
  frozen: { label: "FRZ", color: "#5BB8C4" },
  fainted: { label: "FNT", color: "#4B5563" },
};

export function StatusChip({ status }: { status: PokemonStatus }) {
  const s = STATUS_SHORT[status];
  if (!s) return null;
  return (
    <span className="rounded px-1 py-[1px] font-mono text-[9px] font-bold text-white" style={{ background: s.color }}>
      {s.label}
    </span>
  );
}

/** Pokémon battle sprite with a graceful fallback for custom enemies. */
export function BattleSprite({
  speciesId,
  spriteUrl,
  back,
  shiny,
  alt,
  className,
}: {
  speciesId: number | null;
  spriteUrl?: string | null;
  back?: boolean;
  shiny?: boolean;
  alt: string;
  className?: string;
}) {
  const sources = React.useMemo(
    () => (spriteUrl ? [spriteUrl] : speciesId ? pokemonSpriteSources(speciesId, { view: back ? "back" : "front", shiny }) : []),
    [spriteUrl, speciesId, back, shiny]
  );
  const [index, setIndex] = React.useState(0);
  React.useEffect(() => setIndex(0), [sources]);
  const src = sources[index] ?? null;

  if (!src) {
    return (
      <div className={cn("flex items-center justify-center", className)}>
        <div className="flex h-2/3 w-2/3 items-center justify-center rounded-full bg-black/40 text-mist/40 ring-1 ring-white/10">
          <Swords className="h-1/2 w-1/2" strokeWidth={1.5} />
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      onError={() => setIndex((i) => i + 1)}
      className={cn("select-none object-contain [image-rendering:pixelated]", className)}
    />
  );
}

export interface Floater {
  id: number;
  targetId: string;
  text: string;
  tone: "damage" | "super" | "crit" | "weak" | "miss" | "heal" | "immune";
}

const FLOATER_STYLES: Record<Floater["tone"], string> = {
  damage: "text-white text-2xl",
  weak: "text-mist/80 text-xl",
  super: "text-orange-300 text-3xl",
  crit: "text-volt text-3xl",
  miss: "text-mist/70 text-lg italic",
  immune: "text-mist/60 text-base",
  heal: "text-emerald-300 text-2xl",
};

/** Damage / heal numbers that pop over a sprite and float away. */
export function FloaterLayer({ floaters, targetId }: { floaters: Floater[]; targetId: string | undefined }) {
  const mine = floaters.filter((f) => f.targetId === targetId);
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center">
      <AnimatePresence>
        {mine.map((f, i) => (
          <motion.span
            key={f.id}
            className={cn(
              "absolute top-0 font-display font-black tabular-nums drop-shadow-[0_2px_0_rgba(0,0,0,0.9)] [-webkit-text-stroke:1px_rgba(0,0,0,0.6)]",
              FLOATER_STYLES[f.tone]
            )}
            initial={{ opacity: 0, y: 14 + i * 4, scale: 0.4 }}
            animate={{ opacity: [0, 1, 1, 0], y: [14, -6, -18, -36], scale: [0.4, 1.25, 1, 1] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.25, times: [0, 0.18, 0.7, 1], ease: "easeOut" }}
          >
            {f.text}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}
