import type { ItemBattleEffect, PokemonStatus, PokemonType, RewardSplitMode } from "@/types/database.types";

export const POKEMON_TYPES: PokemonType[] = [
  "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground",
  "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy",
];

/** Classic type colors, used for move buttons and type pills. */
export const TYPE_COLORS: Record<PokemonType, string> = {
  normal: "#A8A77A",
  fire: "#EE8130",
  water: "#6390F0",
  electric: "#F7D02C",
  grass: "#7AC74C",
  ice: "#96D9D6",
  fighting: "#C22E28",
  poison: "#A33EA1",
  ground: "#E2BF65",
  flying: "#A98FF3",
  psychic: "#F95587",
  bug: "#A6B91A",
  rock: "#B6A136",
  ghost: "#735797",
  dragon: "#6F35FC",
  dark: "#705746",
  steel: "#B7B7CE",
  fairy: "#D685AD",
};

/** Types whose color is light enough to need dark text on top. */
export const LIGHT_TYPES = new Set<PokemonType>(["electric", "ice", "ground", "steel", "normal", "grass", "bug", "rock"]);

export function typeLabel(t: PokemonType) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Mirrors public.pokemon_stat(): 40 + 6 × level + bonus. */
export function pokemonStat(level: number, bonus = 0) {
  return Math.max(1, 40 + 6 * Math.max(level, 1) + bonus);
}

/** Suggested enemy max KP for a level (matches admin_create_battle's default). */
export function defaultEnemyHp(level: number) {
  return 60 + 20 * Math.max(level, 1);
}

/**
 * Mirrors public.calc_damage() with neutral typing and the average roll,
 * for the admin's "how hard will this hit?" preview. The real roll happens
 * server-side.
 */
export function estimateDamage(opts: {
  level: number;
  power: number;
  attack: number;
  defense: number;
  scale: number;
  stab?: boolean;
  effectiveness?: number;
}) {
  const eff = opts.effectiveness ?? 1;
  if (eff <= 0) return 0;
  const base = Math.floor(Math.floor(Math.floor((2 * Math.max(opts.level, 1)) / 5 + 2) * opts.power * opts.attack / Math.max(opts.defense, 1)) / 50) + 2;
  const avgRoll = 0.925;
  return Math.max(1, Math.floor(base * opts.scale * (opts.stab ? 1.5 : 1) * eff * avgRoll));
}

// ---------------------------------------------------------------------------
// Reward distribution — must match admin_give_battle_rewards() exactly.
// Players are always ordered the way get_battle_state() returns them
// (joined_at, id); with an uneven split the first players get the extra 1.
// ---------------------------------------------------------------------------
export function splitEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

export function distribute(mode: RewardSplitMode, value: number, count: number, custom: number[]): number[] {
  if (mode === "equal") return splitEvenly(value, count);
  if (mode === "per_player") return Array.from({ length: count }, () => value);
  return custom.slice(0, count).map((n) => (Number.isFinite(n) ? n : 0));
}

export function sum(values: number[]) {
  return values.reduce((a, b) => a + b, 0);
}

export function toWholeNumber(input: string) {
  const n = Math.floor(Number(input.replace(/[^\d]/g, "")));
  return Number.isFinite(n) ? n : 0;
}

export function formatMoney(n: number) {
  return `₽${n.toLocaleString("en-US")}`;
}

export function formatXp(n: number) {
  return `${n.toLocaleString("en-US")} XP`;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------
const STATUS_NAMES: Partial<Record<PokemonStatus, string>> = {
  poisoned: "poison",
  burned: "burn",
  paralyzed: "paralysis",
  asleep: "sleep",
  frozen: "freeze",
};

export function describeItemEffect(effect: ItemBattleEffect): string {
  const parts: string[] = [];
  if (effect.revive) parts.push(effect.revive >= 1 ? "Revives to full KP" : `Revives to ${Math.round(effect.revive * 100)}% KP`);
  if (effect.heal_full) parts.push("Restores all KP");
  else if (effect.heal) parts.push(`Restores ${effect.heal} KP`);
  if (effect.cure === true) parts.push("cures any status");
  else if (Array.isArray(effect.cure) && effect.cure.length) parts.push(`cures ${effect.cure.map((c) => STATUS_NAMES[c] ?? c).join(", ")}`);
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Client-side mirror of battle_use_item()'s "would this do anything?" check, used to disable targets. */
export function itemUsableOn(
  effect: ItemBattleEffect,
  p: { current_hp: number; max_hp: number; status: PokemonStatus; is_dead?: boolean }
): boolean {
  if (p.is_dead) return false;
  if (p.status === "fainted") return !!effect.revive;
  const canHeal = (effect.heal_full || !!effect.heal) && p.current_hp < p.max_hp;
  const canCure =
    p.status !== "healthy" &&
    (effect.cure === true || (Array.isArray(effect.cure) && effect.cure.includes(p.status)));
  return canHeal || canCure;
}
