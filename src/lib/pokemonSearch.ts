import type { Species, TrainerPokemon } from "@/types/database.types";

/** Lower-case, no accents, letters/digits only: "Mr. Mime" → "mrmime", "Flabébé" → "flabebe", "Nidoran♀" → "nidoran". */
export function normalizeName(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Filters species by name or National Pokédex number.
 * "char" → Charmander, Charmeleon, Charizard…; "025" / "#25" → Pikachu.
 * Names that START with the query come first, then names containing it.
 */
export function searchSpecies(all: Species[], query: string, limit = 20): Species[] {
  const q = query.trim();
  if (!q) return [];
  const num = q.replace(/^#/, "");
  if (/^\d+$/.test(num)) {
    const id = Number(num);
    return all.filter((s) => s.id === id);
  }
  const n = normalizeName(q);
  if (!n) return [];
  const starts: Species[] = [];
  const contains: Species[] = [];
  for (const s of all) {
    const name = normalizeName(s.name);
    if (name.startsWith(n)) starts.push(s);
    else if (name.includes(n)) contains.push(s);
  }
  return [...starts, ...contains].slice(0, limit);
}

/** Matches an owned Pokémon by nickname, species name or Pokédex number ("25", "#025"). */
export function matchesPokemonQuery(p: TrainerPokemon, query: string) {
  const q = query.trim();
  if (!q) return true;
  const num = q.replace(/^#/, "");
  if (/^\d+$/.test(num)) return p.species_id === Number(num);
  const n = normalizeName(q);
  if (!n) return true;
  return normalizeName(p.species.name).includes(n) || (!!p.nickname && normalizeName(p.nickname).includes(n));
}
