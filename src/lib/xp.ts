/**
 * The one XP calculation used by every screen (PokéGear 13: XP per level).
 *
 * Every level starts at 0 XP. `curve` is game_config.xp_curve, where
 * curve[level + 1] is the XP a Pokémon at `level` needs to level up
 * ({ "2": 10, "3": 25, … "8": 200 } → Lv1 needs 10, Lv2 needs 25, …).
 * trainer_pokemon.xp is the XP collected toward the next level. The server
 * (public.xp_to_next / _add_pokemon_xp) uses exactly the same table.
 */
export type XpCurve = Record<string, number>;

/** XP a Pokémon at `level` needs to reach the next level, or null at the max level. */
export function xpToNext(curve: XpCurve, level: number, maxLevel: number): number | null {
  if (level >= maxLevel) return null;
  const exact = curve[String(Math.max(level, 1) + 1)];
  if (typeof exact === "number") return exact;
  const values = Object.values(curve).filter((v) => typeof v === "number");
  return values.length ? Math.max(...values) : 10;
}

export interface XpProgress {
  /** XP collected toward the next level. */
  current: number;
  /** XP needed for the next level, or null at the max level. */
  needed: number | null;
  /** XP still missing for the next level (0 at max). */
  missing: number;
  /** 0–100 */
  percent: number;
  atMax: boolean;
}

export function xpProgress(xp: number, level: number, curve: XpCurve, maxLevel: number): XpProgress {
  const needed = xpToNext(curve, level, maxLevel);
  if (needed === null) return { current: 0, needed: null, missing: 0, percent: 100, atMax: true };
  const current = Math.max(0, Math.min(xp, needed));
  return {
    current,
    needed,
    missing: Math.max(0, needed - current),
    percent: Math.max(0, Math.min(100, (current / needed) * 100)),
    atMax: false,
  };
}
