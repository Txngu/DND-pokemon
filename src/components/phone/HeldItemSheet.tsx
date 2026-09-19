import { AnimatePresence, motion } from "framer-motion";
import { X, Ban } from "lucide-react";
import { ItemIcon } from "@/components/phone/ItemIcon";
import type { TrainerItem } from "@/types/database.types";

interface HeldItemSheetProps {
  open: boolean;
  items: TrainerItem[];
  currentItemId: string | null;
  onClose: () => void;
  onSelect: (itemId: string | null) => void;
}

export function HeldItemSheet({ open, items, currentItemId, onClose, onSelect }: HeldItemSheetProps) {
  const eligible = items.filter((i) =>
    ["medicine", "evolution", "battle", "other"].includes(i.item.category)
  );

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="absolute inset-0 z-30 flex flex-col justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/60"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="glass relative z-10 max-h-[70%] rounded-t-3xl p-4 shadow-glass"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-mist">Change held item</h2>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 touch-manipulation items-center justify-center rounded-full bg-white/5 text-mist"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-72 space-y-2 overflow-y-auto pb-2">
              <button
                type="button"
                onClick={() => onSelect(null)}
                disabled={!currentItemId}
                className="flex w-full touch-manipulation items-center gap-3 rounded-2xl bg-white/5 p-3 text-left disabled:opacity-40"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-mist/60">
                  <Ban className="h-4 w-4" />
                </div>
                <p className="text-sm font-medium text-mist">No held item</p>
              </button>

              {eligible.length === 0 ? (
                <p className="px-1 py-4 text-center text-xs text-mist/50">
                  No held-item-eligible items in your Bag yet.
                </p>
              ) : (
                eligible.map((entry) => (
                  <button
                    key={entry.item_id}
                    type="button"
                    onClick={() => onSelect(entry.item_id)}
                    disabled={entry.item_id === currentItemId}
                    className="flex w-full touch-manipulation items-center gap-3 rounded-2xl bg-white/5 p-3 text-left disabled:opacity-40"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5">
                      <ItemIcon item={entry.item} className="h-6 w-6" />
                    </div>
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-mist">{entry.item.name}</p>
                    <p className="shrink-0 font-mono text-xs text-mist/50">×{entry.quantity}</p>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
