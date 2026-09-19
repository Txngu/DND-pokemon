import { SpriteImage } from "@/components/phone/SpriteImage";
import { itemSpriteUrl } from "@/lib/sprites";
import type { TrainerItem } from "@/types/database.types";

export function ItemRow({ entry }: { entry: TrainerItem }) {
  return (
    <div className="glass flex items-center gap-3 rounded-2xl p-3 shadow-glass">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/5">
        <SpriteImage
          src={itemSpriteUrl(entry.item.pokeapi_slug)}
          alt={entry.item.name}
          className="h-8 w-8"
          fallbackClassName="h-8 w-8"
        />
      </div>
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-mist">{entry.item.name}</p>
      <p className="shrink-0 font-mono text-sm text-volt">×{entry.quantity}</p>
    </div>
  );
}
