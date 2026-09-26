import { ItemIcon } from "@/components/phone/ItemIcon";
import type { TrainerItem } from "@/types/database.types";

export function ItemRow({ entry }: { entry: TrainerItem }) {
  return (
    <div className="glass theme-accent-line flex items-center gap-3 rounded-2xl p-3 shadow-glass">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/5">
        <ItemIcon item={entry.item} className="h-8 w-8" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-mist">{entry.item.name}</p>
        {entry.item.description ? (
          <p className="truncate text-[11px] text-mist/50">{entry.item.description}</p>
        ) : null}
      </div>
      <p className="shrink-0 font-mono text-sm text-volt">×{entry.quantity}</p>
    </div>
  );
}
