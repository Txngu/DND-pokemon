/**
 * The one XP calculation used by every screen (PokéGear 11).
 *
 * `curve` is game_config.xp_curve: the TOTAL XP needed to reach each level,
 * e.g. { "2": 10, "3": 25, "4": 45, ... "8": 200 }. trainer_pokemon.xp is the
 * Pokémon's total XP. The server (public.xp_for_level / _apply_pokemon_xp)
 * uses exactly the same table, so the bar always matches what the database
 * will do.
 */
export type XpCurve = Record<string, number>;

/** Total XP needed to *be* `level` (level 1 = 0). */
export function xpForLevel(curve: XpCurve, level: number, maxLevel: number): number {
  if (level <= 1) return 0;
  const capped = Math.min(level, maxLevel);
  const exact = curve[String(capped)];
  if (typeof exact === "number") return exact;
  const values = Object.values(curve).filter((v) => typeof v === "number");
  return values.length ? Math.max(...values) : 0;
}

export interface XpProgress {
  /** Total XP right now. */
  total: number;
  /** Total XP needed for the next level, or null at the max level. */
  nextTotal: number | null;
  /** Total XP at which the current level started. */
  levelStart: number;
  /** 0–100, progress through the current level. */
  percent: number;
  atMax: boolean;
}

export function xpProgress(xp: number, level: number, curve: XpCurve, maxLevel: number): XpProgress {
  const levelStart = xpForLevel(curve, level, maxLevel);
  const total = Math.max(xp, levelStart);
  if (level >= maxLevel) {
    return { total, nextTotal: null, levelStart, percent: 100, atMax: true };
  }
  const nextTotal = xpForLevel(curve, level + 1, maxLevel);
  const span = Math.max(1, nextTotal - levelStart);
  const percent = Math.max(0, Math.min(100, ((total - levelStart) / span) * 100));
  return { total, nextTotal, levelStart, percent, atMax: false };
}
