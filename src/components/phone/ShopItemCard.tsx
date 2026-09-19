import { ItemIcon } from "@/components/phone/ItemIcon";
import type { ShopListing } from "@/types/database.types";

export function ShopItemCard({ listing, onBuy }: { listing: ShopListing; onBuy: () => void }) {
  const soldOut = listing.stock !== null && listing.stock <= 0;

  return (
    <div className="glass flex items-center gap-3 rounded-2xl p-3 shadow-glass">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/5">
        <ItemIcon item={listing.item} className="h-9 w-9" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-mist">{listing.item.name}</p>
        {listing.item.description ? (
          <p className="line-clamp-1 text-[11px] text-mist/50">{listing.item.description}</p>
        ) : null}
        <div className="mt-1 flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-volt">₽{listing.price.toLocaleString()}</span>
          <span className="text-[10px] text-mist/40">
            {listing.stock === null ? "In stock" : soldOut ? "Sold out" : `${listing.stock} left`}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onBuy}
        disabled={soldOut}
        className="shrink-0 touch-manipulation rounded-full bg-volt px-3.5 py-2 text-xs font-semibold text-screen-ink active:scale-95 disabled:opacity-40"
      >
        {soldOut ? "Sold out" : "Buy"}
      </button>
    </div>
  );
}
