import { cn } from "@/lib/utils";

export function HpBar({ current, max, className }: { current: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  const color = pct > 50 ? "bg-emerald-400" : pct > 20 ? "bg-amber-400" : "bg-rotom-red-light";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="shrink-0 font-mono text-[10px] text-mist/60">
        {current}/{max}
      </span>
    </div>
  );
}
