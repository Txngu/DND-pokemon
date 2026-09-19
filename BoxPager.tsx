import * as React from "react";
import { ChevronLeft, ChevronRight, Pencil, Check } from "lucide-react";
import type { PcBox } from "@/types/database.types";

interface BoxPagerProps {
  box: PcBox;
  index: number;
  count: number;
  onPrev: () => void;
  onNext: () => void;
  onRename: (name: string) => void;
}

export function BoxPager({ box, index, count, onPrev, onNext, onRename }: BoxPagerProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(box.name);

  React.useEffect(() => {
    setDraft(box.name);
  }, [box.name]);

  function commit() {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== box.name) onRename(trimmed);
    else setDraft(box.name);
  }

  return (
    <div className="flex items-center justify-between px-4">
      <button
        type="button"
        onClick={onPrev}
        disabled={index === 0}
        className="flex h-8 w-8 touch-manipulation items-center justify-center rounded-full bg-white/5 text-mist disabled:opacity-30"
        aria-label="Previous box"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {editing ? (
        <div className="flex flex-1 items-center justify-center gap-1.5 px-2">
          <input
            autoFocus
            value={draft}
            maxLength={20}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commit()}
            onBlur={commit}
            className="w-32 rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-center text-sm text-mist focus:outline-none focus:ring-1 focus:ring-volt"
          />
          <button type="button" onClick={commit} className="text-volt">
            <Check className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex touch-manipulation items-center gap-1.5 rounded-full px-3 py-1 active:bg-white/5"
        >
          <span className="font-display text-sm font-semibold text-mist">{box.name}</span>
          <Pencil className="h-3 w-3 text-mist/40" />
        </button>
      )}

      <button
        type="button"
        onClick={onNext}
        disabled={index === count - 1}
        className="flex h-8 w-8 touch-manipulation items-center justify-center rounded-full bg-white/5 text-mist disabled:opacity-30"
        aria-label="Next box"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
