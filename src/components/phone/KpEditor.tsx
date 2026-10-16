import * as React from "react";
import { cn } from "@/lib/utils";

const QUICK = [-10, -5, -1, 1, 5, 10];

/**
 * Quick-adjust controls for KP (the campaign's name for HP): six preset
 * buttons plus a custom-value input with separate Damage / Heal actions.
 * Purely presentational — the caller decides what "apply" actually does
 * (adjust a player's Pokémon, or the Game Master's enemy), so this same
 * component serves both the trainer and admin sides.
 */
export function KpEditor({
  onAdjust,
  disabled,
  compact,
}: {
  onAdjust: (delta: number) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [custom, setCustom] = React.useState("");
  const amount = Math.max(0, Math.round(Number(custom)) || 0);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-6 gap-1.5">
        {QUICK.map((d) => (
          <button
            key={d}
            type="button"
            disabled={disabled}
            onClick={() => onAdjust(d)}
            className={cn(
              "touch-manipulation rounded-lg py-2 font-mono text-xs font-semibold active:scale-95 disabled:opacity-40",
              d < 0 ? "bg-rotom-red/20 text-rotom-red-light" : "bg-emerald-400/15 text-emerald-300",
              compact && "py-1.5"
            )}
          >
            {d > 0 ? `+${d}` : d}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Custom"
          className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-center font-mono text-sm text-mist placeholder:text-mist/30 focus:outline-none focus:ring-1 focus:ring-volt"
        />
        <button
          type="button"
          disabled={disabled || amount <= 0}
          onClick={() => {
            onAdjust(-amount);
            setCustom("");
          }}
          className="touch-manipulation rounded-lg bg-rotom-red/25 px-3 py-2 text-xs font-semibold text-rotom-red-light active:scale-95 disabled:opacity-40"
        >
          Damage
        </button>
        <button
          type="button"
          disabled={disabled || amount <= 0}
          onClick={() => {
            onAdjust(amount);
            setCustom("");
          }}
          className="touch-manipulation rounded-lg bg-emerald-400/20 px-3 py-2 text-xs font-semibold text-emerald-300 active:scale-95 disabled:opacity-40"
        >
          Heal
        </button>
      </div>
    </div>
  );
}
