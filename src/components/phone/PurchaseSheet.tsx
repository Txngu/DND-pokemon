import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Minus, Plus } from "lucide-react";
import { ItemIcon } from "@/components/phone/ItemIcon";
import type { ShopListing } from "@/types/database.types";

interface PurchaseSheetProps {
  listing: ShopListing | null;
  money: number;
  pending: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onConfirm: (quantity: number) => void;
}

export function PurchaseSheet({ listing, money, pending, errorMessage, onClose, onConfirm }: PurchaseSheetProps) {
  const [quantity, setQuantity] = React.useState(1);

  React.useEffect(() => {
    setQuantity(1);
  }, [listing?.id]);

  if (!listing) return null;

  const maxQty = listing.stock ?? 99;
  const total = listing.price * quantity;
  const remaining = money - total;
  const canAfford = remaining >= 0;

  return (
    <AnimatePresence>
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
          className="glass relative z-10 rounded-t-3xl p-4 shadow-glass"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-mist">Confirm purchase</h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 touch-manipulation items-center justify-center rounded-full bg-white/5 text-mist"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/5">
              <ItemIcon item={listing.item} className="h-8 w-8" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-mist">{listing.item.name}</p>
              <p className="font-mono text-xs text-volt">₽{listing.price.toLocaleString()} each</p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="flex h-9 w-9 touch-manipulation items-center justify-center rounded-full bg-white/5 text-mist disabled:opacity-30"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-10 text-center font-mono text-lg text-mist">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
              disabled={quantity >= maxQty}
              className="flex h-9 w-9 touch-manipulation items-center justify-center rounded-full bg-white/5 text-mist disabled:opacity-30"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 space-y-1.5 rounded-2xl bg-white/5 p-3 text-sm">
            <div className="flex justify-between text-mist/60">
              <span>Total</span>
              <span className="font-mono text-mist">₽{total.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-mist/60">
              <span>Balance after</span>
              <span className={`font-mono ${canAfford ? "text-mist" : "text-rotom-red-light"}`}>
                ₽{remaining.toLocaleString()}
              </span>
            </div>
          </div>

          {!canAfford ? (
            <p className="mt-2 text-center text-xs text-rotom-red-light">Not enough money for this purchase.</p>
          ) : errorMessage ? (
            <p className="mt-2 text-center text-xs text-rotom-red-light">{errorMessage}</p>
          ) : null}

          <button
            type="button"
            onClick={() => onConfirm(quantity)}
            disabled={!canAfford || pending}
            className="mt-4 w-full touch-manipulation rounded-2xl bg-volt py-3 text-sm font-semibold text-screen-ink active:scale-[0.98] disabled:opacity-40"
          >
            {pending ? "Purchasing…" : `Buy for ₽${total.toLocaleString()}`}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
