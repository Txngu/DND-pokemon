import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Minus, Plus } from "lucide-react";
import { ItemIcon } from "@/components/phone/ItemIcon";
import type { TrainerItem } from "@/types/database.types";

interface ItemPickerSheetProps {
  open: boolean;
  items: TrainerItem[];
  initialSelected: { item_id: string; quantity: number }[];
  onClose: () => void;
  onConfirm: (selected: { item_id: string; quantity: number }[]) => void;
}

export function ItemPickerSheet({ open, items, initialSelected, onClose, onConfirm }: ItemPickerSheetProps) {
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    if (open) {
      setQuantities(Object.fromEntries(initialSelected.map((s) => [s.item_id, s.quantity])));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const tradable = items.filter((i) => i.item.is_tradable);
  const selectedCount = Object.values(quantities).filter((q) => q > 0).length;

  function setQty(itemId: string, qty: number, max: number) {
    setQuantities((prev) => ({ ...prev, [itemId]: Math.max(0, Math.min(max, qty)) }));
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="absolute inset-0 z-40 flex flex-col justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div className="absolute inset-0 bg-black/60" onClick={onClose} />
          <motion.div
            className="glass relative z-10 flex max-h-[75%] flex-col rounded-t-3xl p-4 shadow-glass"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-mist">Choose items ({selectedCount})</h2>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 touch-manipulation items-center justify-center rounded-full bg-white/5 text-mist"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto pb-2">
              {tradable.length === 0 ? (
                <p className="py-8 text-center text-xs text-mist/40">You have no tradable items.</p>
              ) : (
                tradable.map((entry) => {
                  const qty = quantities[entry.item_id] ?? 0;
                  return (
                    <div key={entry.item_id} className="flex items-center gap-3 rounded-2xl bg-white/5 p-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5">
                        <ItemIcon item={entry.item} className="h-6 w-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-mist">{entry.item.name}</p>
                        <p className="text-[10px] text-mist/40">You have {entry.quantity}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setQty(entry.item_id, qty - 1, entry.quantity)}
                          disabled={qty <= 0}
                          className="flex h-7 w-7 touch-manipulation items-center justify-center rounded-full bg-white/10 text-mist disabled:opacity-30"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-5 text-center font-mono text-xs text-mist">{qty}</span>
                        <button
                          type="button"
                          onClick={() => setQty(entry.item_id, qty + 1, entry.quantity)}
                          disabled={qty >= entry.quantity}
                          className="flex h-7 w-7 touch-manipulation items-center justify-center rounded-full bg-white/10 text-mist disabled:opacity-30"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                onConfirm(
                  Object.entries(quantities)
                    .filter(([, q]) => q > 0)
                    .map(([item_id, quantity]) => ({ item_id, quantity }))
                )
              }
              className="mt-2 w-full touch-manipulation rounded-2xl bg-volt py-3 text-sm font-semibold text-screen-ink active:scale-[0.98]"
            >
              Done
            </button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
