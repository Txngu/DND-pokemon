import * as React from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpriteImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackClassName?: string;
}

/**
 * Renders an official sprite fetched from PokeAPI's sprite repo. Falls back
 * to a small placeholder glyph if a given sprite 404s (some rarer item
 * slugs don't have art) rather than showing a broken image icon.
 */
export function SpriteImage({ src, alt, className, fallbackClassName }: SpriteImageProps) {
  const [errored, setErrored] = React.useState(false);

  if (errored) {
    return (
      <div className={cn("flex items-center justify-center text-mist/30", fallbackClassName, className)}>
        <ImageOff className="h-1/2 w-1/2" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setErrored(true)}
      className={cn("select-none object-contain", className)}
      draggable={false}
    />
  );
}
