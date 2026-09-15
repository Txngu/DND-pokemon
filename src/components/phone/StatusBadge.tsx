import { cn } from "@/lib/utils";
import type { PokemonStatus } from "@/types/database.types";

const STATUS_STYLES: Record<PokemonStatus, { label: string; classes: string }> = {
  healthy: { label: "Healthy", classes: "bg-emerald-400/15 text-emerald-300" },
  poisoned: { label: "Poisoned", classes: "bg-fuchsia-400/15 text-fuchsia-300" },
  burned: { label: "Burned", classes: "bg-orange-400/15 text-orange-300" },
  paralyzed: { label: "Paralyzed", classes: "bg-yellow-400/15 text-yellow-300" },
  asleep: { label: "Asleep", classes: "bg-indigo-400/15 text-indigo-300" },
  frozen: { label: "Frozen", classes: "bg-cyan-400/15 text-cyan-300" },
  fainted: { label: "Fainted", classes: "bg-mist/10 text-mist/50" },
};

export function StatusBadge({ status, className }: { status: PokemonStatus; className?: string }) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        style.classes,
        className
      )}
    >
      {style.label}
    </span>
  );
}
