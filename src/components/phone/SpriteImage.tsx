import * as React from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { isPixelSprite } from "@/lib/sprites";

interface SpriteImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  /** Tried in order if `src` fails to load (e.g. a missing shiny/female/icon variant). */
  fallbackSrcs?: string[];
}

/**
 * Renders a sprite fetched from PokeAPI's sprite repo. Walks through
 * `fallbackSrcs` if an image 404s, and only then shows a small placeholder
 * glyph instead of a broken image icon. Pixel sprites are scaled with crisp
 * edges rather than blurred.
 */
export function SpriteImage({ src, alt, className, fallbackClassName, fallbackSrcs }: SpriteImageProps) {
  const candidates = React.useMemo(() => [src, ...(fallbackSrcs ?? [])], [src, fallbackSrcs]);
  const [index, setIndex] = React.useState(0);

  // A different Pokémon/variant was requested: start from its first choice again.
  const key = candidates.join("|");
  React.useEffect(() => {
    setIndex(0);
  }, [key]);

  if (index >= candidates.length) {
    return (
      <div className={cn("flex items-center justify-center text-mist/30", fallbackClassName, className)}>
        <ImageOff className="h-1/2 w-1/2" strokeWidth={1.5} />
      </div>
    );
  }

  const current = candidates[index];
  return (
    <img
      src={current}
      alt={alt}
      loading="lazy"
      onError={() => setIndex((i) => i + 1)}
      className={cn("select-none object-contain", isPixelSprite(current) && "[image-rendering:pixelated]", className)}
      draggable={false}
    />
  );
}
