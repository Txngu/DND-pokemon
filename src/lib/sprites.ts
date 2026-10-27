/**
 * The ONE place PokéGear decides which Pokémon image to show (PokéGear 11).
 *
 * Everything uses PokéAPI's 2D pixel sprites. Each view asks for a list of
 * candidate URLs, best first; <PokemonSprite> walks the list until one
 * loads, so a missing variant (no female sprite, no gen-8 icon for newer
 * Pokémon, no shiny back sprite…) quietly falls back instead of breaking.
 *
 *   view "icon"   small box icon      → PC grid, search results, pickers
 *   view "front"  front battle sprite → Team, lists, cards
 *   view "back"   back battle sprite  → your own Pokémon in battle
 *   view "large"  front sprite, shown big with crisp pixels → detail views
 */
const SPRITE_BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites";

export type SpriteView = "icon" | "front" | "back" | "large";

export interface SpriteOptions {
  view?: SpriteView;
  shiny?: boolean;
  /** Only meaningful for species with a visible gender difference; falls back automatically. */
  female?: boolean;
}

function front(id: number, shiny: boolean, female: boolean): string[] {
  const urls: string[] = [];
  if (shiny && female) urls.push(`${SPRITE_BASE}/pokemon/shiny/female/${id}.png`);
  if (shiny) urls.push(`${SPRITE_BASE}/pokemon/shiny/${id}.png`);
  if (female) urls.push(`${SPRITE_BASE}/pokemon/female/${id}.png`);
  urls.push(`${SPRITE_BASE}/pokemon/${id}.png`);
  return urls;
}

/** Candidate image URLs for a species, best first. */
export function pokemonSpriteSources(speciesId: number, opts: SpriteOptions = {}): string[] {
  const { view = "front", shiny = false, female = false } = opts;
  if (view === "back") {
    const urls: string[] = [];
    if (shiny && female) urls.push(`${SPRITE_BASE}/pokemon/back/shiny/female/${speciesId}.png`);
    if (shiny) urls.push(`${SPRITE_BASE}/pokemon/back/shiny/${speciesId}.png`);
    if (female) urls.push(`${SPRITE_BASE}/pokemon/back/female/${speciesId}.png`);
    urls.push(`${SPRITE_BASE}/pokemon/back/${speciesId}.png`);
    return [...urls, ...front(speciesId, shiny, female)];
  }
  if (view === "icon") {
    // Box icons exist up to Gen 8; shiny Pokémon use their (shiny) front sprite so the colour shows.
    const icon = shiny ? [] : [`${SPRITE_BASE}/pokemon/versions/generation-viii/icons/${speciesId}.png`];
    return [...icon, ...front(speciesId, shiny, female)];
  }
  return front(speciesId, shiny, female);
}

/** True for PokéAPI pixel sprites, which should be scaled with crisp pixels. */
export function isPixelSprite(url: string): boolean {
  return url.startsWith(`${SPRITE_BASE}/pokemon/`);
}

/** Front sprite URL (first choice). Kept for older call sites; prefer <PokemonSprite>. */
export function pokemonSpriteUrl(speciesId: number): string {
  return pokemonSpriteSources(speciesId, { view: "front" })[0];
}

/**
 * Big image for detail screens. Since PokéGear 11 this is the 2D pixel
 * sprite too (shown large), not the official artwork.
 */
export function pokemonArtworkUrl(speciesId: number): string {
  return pokemonSpriteSources(speciesId, { view: "large" })[0];
}

/** Battle sprite: front for enemies, back for the trainer's own Pokémon. */
export function pokemonBattleSpriteUrl(speciesId: number, opts: { back?: boolean; shiny?: boolean } = {}): string {
  return pokemonSpriteSources(speciesId, { view: opts.back ? "back" : "front", shiny: opts.shiny })[0];
}

/** Item icon, keyed by the item's PokeAPI slug (e.g. "ultra-ball", "fire-stone"). */
export function itemSpriteUrl(pokeapiSlug: string): string {
  return `${SPRITE_BASE}/items/${pokeapiSlug}.png`;
}
