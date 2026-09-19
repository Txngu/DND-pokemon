const SPRITE_BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites";

/** Small in-game sprite, used in list rows. */
export function pokemonSpriteUrl(speciesId: number): string {
  return `${SPRITE_BASE}/pokemon/${speciesId}.png`;
}

/** Large official artwork, used in the detail view. */
export function pokemonArtworkUrl(speciesId: number): string {
  return `${SPRITE_BASE}/pokemon/other/official-artwork/${speciesId}.png`;
}

/** Item icon, keyed by the item's PokeAPI slug (e.g. "ultra-ball", "fire-stone"). */
export function itemSpriteUrl(pokeapiSlug: string): string {
  return `${SPRITE_BASE}/items/${pokeapiSlug}.png`;
}
