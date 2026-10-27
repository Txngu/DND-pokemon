import type { TcgLanguage } from "@/types/database.types";

/**
 * Minimal client for TCGdex (https://tcgdex.dev), the free Pokémon TCG
 * database used for virtual cards. No API key exists or is needed, and the
 * API allows browser requests from any site, so nothing secret lives here.
 * Everything shown comes from TCGdex as returned — nothing is invented.
 */
const BASE = "https://api.tcgdex.net/v2";

export const TCG_LANGUAGES: { code: TcgLanguage; label: string }[] = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "it", label: "Italiano" },
  { code: "es", label: "Español" },
  { code: "pt-br", label: "Português (BR)" },
];

export interface TcgCardBrief {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

export interface TcgAttack {
  cost?: string[];
  name: string;
  effect?: string;
  damage?: number | string;
}

export interface TcgCard extends TcgCardBrief {
  category?: string;
  illustrator?: string;
  rarity?: string;
  set: { id: string; name: string; cardCount?: { official?: number; total?: number } };
  dexId?: number[];
  hp?: number;
  types?: string[];
  evolveFrom?: string;
  description?: string;
  stage?: string;
  suffix?: string;
  attacks?: TcgAttack[];
  abilities?: { type?: string; name: string; effect?: string }[];
  weaknesses?: { type: string; value?: string }[];
  resistances?: { type: string; value?: string }[];
  retreat?: number;
  effect?: string;
  trainerType?: string;
  energyType?: string;
  regulationMark?: string;
}

export interface TcgSetBrief {
  id: string;
  name: string;
  cardCount?: { official?: number; total?: number };
}

export class TcgApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new TcgApiError("Couldn't reach the card database. Check your connection and try again.", 0);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new TcgApiError(`The card database answered with an error (${res.status}). Try again in a moment.`, res.status);
  return (await res.json()) as T;
}

/** Card image URL from TCGdex's image base. `low` for grids, `high` for detail. */
export function cardImageUrl(base: string | null | undefined, quality: "low" | "high"): string | null {
  return base ? `${base}/${quality}.webp` : null;
}

/** "025/198", "#25" or "25" → the variants TCGdex may store ("25", "025"). */
function numberVariants(input: string): string[] {
  const raw = input.trim().replace(/^#/, "").split("/")[0].trim();
  if (!raw) return [];
  const stripped = raw.replace(/^0+(?=\d)/, "");
  const variants = new Set([raw, stripped]);
  if (/^\d+$/.test(stripped)) {
    variants.add(stripped.padStart(3, "0"));
    variants.add(stripped.padStart(2, "0"));
  }
  return [...variants];
}

export interface CardSearchParams {
  lang: TcgLanguage;
  name?: string;
  setId?: string;
  number?: string;
  page: number;
  perPage: number;
}

/** One page of search results (brief entries: id, localId, name, image). */
export async function searchCards(p: CardSearchParams, signal?: AbortSignal): Promise<TcgCardBrief[]> {
  const q = new URLSearchParams();
  if (p.name?.trim()) q.set("name", p.name.trim());
  if (p.setId) q.set("set.id", `eq:${p.setId}`);
  const nums = p.number ? numberVariants(p.number) : [];
  if (nums.length) q.set("localId", `eq:${nums.join("|")}`);
  q.set("pagination:page", String(p.page));
  q.set("pagination:itemsPerPage", String(p.perPage));
  const data = await getJson<TcgCardBrief[]>(`/${p.lang}/cards?${q.toString()}`, signal);
  return data ?? [];
}

/** Full card by exact TCGdex id (e.g. "sv01-025"), or null if it doesn't exist. */
export async function getCard(lang: TcgLanguage, id: string, signal?: AbortSignal): Promise<TcgCard | null> {
  const clean = id.trim();
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(clean)) return null;
  return getJson<TcgCard>(`/${lang}/cards/${encodeURIComponent(clean)}`, signal);
}

export async function getSets(lang: TcgLanguage): Promise<TcgSetBrief[]> {
  const data = await getJson<TcgSetBrief[]>(`/${lang}/sets`);
  return data ?? [];
}

/** What tcg_add_card() stores: the card exactly as TCGdex returned it. */
export function cardPayload(card: TcgCard) {
  return {
    id: card.id,
    localId: card.localId,
    name: card.name,
    image: card.image ?? null,
    category: card.category ?? null,
    illustrator: card.illustrator ?? null,
    rarity: card.rarity ?? null,
    set: { id: card.set?.id ?? null, name: card.set?.name ?? null, cardCount: card.set?.cardCount ?? null },
    dexId: card.dexId ?? [],
    hp: card.hp ?? null,
    types: card.types ?? [],
    evolveFrom: card.evolveFrom ?? null,
    description: card.description ?? null,
    stage: card.stage ?? null,
    suffix: card.suffix ?? null,
    attacks: card.attacks ?? null,
    abilities: card.abilities ?? null,
    weaknesses: card.weaknesses ?? null,
    resistances: card.resistances ?? null,
    retreat: card.retreat ?? null,
    effect: card.effect ?? null,
    trainerType: card.trainerType ?? null,
    energyType: card.energyType ?? null,
    regulationMark: card.regulationMark ?? null,
  };
}

/** "125/197" when the set's official count is known, otherwise "125". */
export function cardNumber(localId: string | null | undefined, official?: number | null) {
  if (!localId) return "";
  return official ? `${localId}/${official}` : localId;
}
