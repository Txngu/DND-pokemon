import * as React from "react";
import { SpriteImage } from "@/components/phone/SpriteImage";
import { pokemonSpriteSources, type SpriteView } from "@/lib/sprites";

/**
 * The standard way to show a Pokémon picture anywhere in PokéGear: pass the
 * species and which view you need; the sprite resolver (lib/sprites.ts)
 * picks the right 2D sprite and its fallbacks.
 */
export function PokemonSprite({
  speciesId,
  view = "front",
  shiny,
  female,
  alt,
  className,
}: {
  speciesId: number;
  view?: SpriteView;
  shiny?: boolean;
  female?: boolean;
  alt: string;
  className?: string;
}) {
  const sources = React.useMemo(
    () => pokemonSpriteSources(speciesId, { view, shiny, female }),
    [speciesId, view, shiny, female]
  );
  return <SpriteImage src={sources[0]} fallbackSrcs={sources.slice(1)} alt={alt} className={className} fallbackClassName={className} />;
}
