import { Package } from "lucide-react";
import { SpriteImage } from "@/components/phone/SpriteImage";
import { itemSpriteUrl } from "@/lib/sprites";
import { cn } from "@/lib/utils";
import type { ItemCatalogEntry } from "@/types/database.types";

/**
 * Renders whatever icon an item actually has, in priority order: an
 * official PokeAPI sprite, a custom hosted image, a plain emoji, or a
 * generic fallback glyph. This is what lets an admin create fully custom
 * items (a D&D quest object, say) with zero image hosting required.
 */
export function ItemIcon({
  item,
  className,
}: {
  item: Pick<ItemCatalogEntry, "name" | "pokeapi_slug" | "icon_url" | "icon_emoji">;
  className?: string;
}) {
  if (item.pokeapi_slug) {
    return (
      <SpriteImage src={itemSpriteUrl(item.pokeapi_slug)} alt={item.name} className={className} fallbackClassName={className} />
    );
  }
  if (item.icon_url) {
    return <SpriteImage src={item.icon_url} alt={item.name} className={className} fallbackClassName={className} />;
  }
  if (item.icon_emoji) {
    return (
      <span className={cn("flex items-center justify-center leading-none", className)} style={{ fontSize: "1.6em" }}>
        {item.icon_emoji}
      </span>
    );
  }
  return (
    <div className={cn("flex items-center justify-center text-mist/30", className)}>
      <Package className="h-1/2 w-1/2" strokeWidth={1.5} />
    </div>
  );
}
