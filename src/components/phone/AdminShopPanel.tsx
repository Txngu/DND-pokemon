import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2, X } from "lucide-react";
import { ItemIcon } from "@/components/phone/ItemIcon";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAllShopListings,
  useCreateShopItem,
  useDeleteShopListing,
  useUpdateShopListing,
} from "@/hooks/useShop";
import type { ItemCategory, ShopListing } from "@/types/database.types";

const CATEGORY_OPTIONS: { value: ItemCategory; label: string }[] = [
  { value: "poke_ball", label: "Poké Ball" },
  { value: "medicine", label: "Medicine" },
  { value: "evolution", label: "Evolution" },
  { value: "battle", label: "Battle" },
  { value: "key_item", label: "Key Item" },
  { value: "quest", label: "Quest" },
  { value: "other", label: "Other" },
];

export function AdminShopPanel() {
  const { data: listings, isLoading } = useAllShopListings(true);
  const [creating, setCreating] = React.useState(false);

  const sorted = [...(listings ?? [])].sort((a, b) => a.item.name.localeCompare(b.item.name));

  return (
    <div className="space-y-2.5">
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="flex w-full touch-manipulation items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 py-3 text-sm font-medium text-mist/70 active:bg-white/5"
      >
        <Plus className="h-4 w-4" />
        New custom item
      </button>

      {isLoading ? (
        <>
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </>
      ) : (
        sorted.map((listing) => <AdminListingRow key={listing.id} listing={listing} />)
      )}

      <CreateItemSheet open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function AdminListingRow({ listing }: { listing: ShopListing }) {
  const updateListing = useUpdateShopListing();
  const deleteListing = useDeleteShopListing();
  const [price, setPrice] = React.useState(String(listing.price));
  const [stock, setStock] = React.useState(listing.stock === null ? "" : String(listing.stock));
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  function commitPrice() {
    const parsed = Math.max(0, Math.round(Number(price)));
    if (!Number.isFinite(parsed)) {
      setPrice(String(listing.price));
      return;
    }
    if (parsed !== listing.price) updateListing.mutate({ listingId: listing.id, patch: { price: parsed } });
  }

  function commitStock() {
    if (stock.trim() === "") {
      if (listing.stock !== null) updateListing.mutate({ listingId: listing.id, patch: { stock: null } });
      return;
    }
    const parsed = Math.max(0, Math.round(Number(stock)));
    if (!Number.isFinite(parsed)) {
      setStock(listing.stock === null ? "" : String(listing.stock));
      return;
    }
    if (parsed !== listing.stock) updateListing.mutate({ listingId: listing.id, patch: { stock: parsed } });
  }

  return (
    <div className="glass rounded-2xl p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5">
          <ItemIcon item={listing.item} className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-mist">{listing.item.name}</p>
          <p className="text-[10px] uppercase tracking-wide text-mist/40">
            {CATEGORY_OPTIONS.find((c) => c.value === listing.item.category)?.label}
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-mist/50">
          <input
            type="checkbox"
            checked={listing.is_enabled}
            onChange={(e) => updateListing.mutate({ listingId: listing.id, patch: { is_enabled: e.target.checked } })}
            className="h-4 w-4 accent-volt"
          />
          Enabled
        </label>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <div className="flex-1">
          <label className="text-[10px] uppercase tracking-wide text-mist/40">Price</label>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={commitPrice}
            inputMode="numeric"
            className="mt-0.5 w-full rounded-lg border border-white/15 bg-white/5 px-2 py-1 font-mono text-sm text-mist focus:outline-none focus:ring-1 focus:ring-volt"
          />
        </div>
        <div className="flex-1">
          <label className="text-[10px] uppercase tracking-wide text-mist/40">Stock (blank = ∞)</label>
          <input
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            onBlur={commitStock}
            inputMode="numeric"
            placeholder="∞"
            className="mt-0.5 w-full rounded-lg border border-white/15 bg-white/5 px-2 py-1 font-mono text-sm text-mist focus:outline-none focus:ring-1 focus:ring-volt"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirmingDelete) {
              deleteListing.mutate(listing.id);
            } else {
              setConfirmingDelete(true);
              setTimeout(() => setConfirmingDelete(false), 3000);
            }
          }}
          className={
            "mt-4 flex h-8 shrink-0 touch-manipulation items-center gap-1 rounded-lg px-2 text-xs font-medium " +
            (confirmingDelete ? "bg-rotom-red text-white" : "bg-white/5 text-mist/60")
          }
        >
          <Trash2 className="h-3.5 w-3.5" />
          {confirmingDelete ? "Confirm?" : ""}
        </button>
      </div>
    </div>
  );
}

function CreateItemSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createItem = useCreateShopItem();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState<ItemCategory>("other");
  const [iconEmoji, setIconEmoji] = React.useState("");
  const [value, setValue] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [stock, setStock] = React.useState("");
  const [isTradable, setIsTradable] = React.useState(true);
  const [isSellable, setIsSellable] = React.useState(true);

  function reset() {
    setName("");
    setDescription("");
    setCategory("other");
    setIconEmoji("");
    setValue("");
    setPrice("");
    setStock("");
    setIsTradable(true);
    setIsSellable(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !price.trim()) return;
    createItem.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        category,
        iconEmoji: iconEmoji.trim() || null,
        value: value.trim() ? Math.round(Number(value)) : null,
        isTradable,
        isSellable,
        price: Math.max(0, Math.round(Number(price)) || 0),
        stock: stock.trim() ? Math.max(0, Math.round(Number(stock))) : null,
      },
      {
        onSuccess: () => {
          reset();
          onClose();
        },
      }
    );
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
          <motion.div className="absolute inset-0 bg-black/70" onClick={onClose} />
          <motion.div
            className="glass relative z-10 max-h-[85%] overflow-y-auto rounded-t-3xl p-4 shadow-glass"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-mist">Create custom item</h2>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 touch-manipulation items-center justify-center rounded-full bg-white/5 text-mist"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <Field label="Name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-mist focus:outline-none focus:ring-1 focus:ring-volt"
                  placeholder="Ancient Relic"
                />
              </Field>

              <Field label="Description">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-mist focus:outline-none focus:ring-1 focus:ring-volt"
                  placeholder="A strange trinket the quest-giver asked you to find."
                />
              </Field>

              <div className="flex gap-2">
                <Field label="Category" className="flex-1">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ItemCategory)}
                    className="w-full rounded-lg border border-white/15 bg-screen-surface px-3 py-2 text-sm text-mist focus:outline-none focus:ring-1 focus:ring-volt"
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Icon (emoji)" className="w-24">
                  <input
                    value={iconEmoji}
                    onChange={(e) => setIconEmoji(e.target.value)}
                    maxLength={4}
                    className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-center text-lg focus:outline-none focus:ring-1 focus:ring-volt"
                    placeholder="🗝️"
                  />
                </Field>
              </div>

              <div className="flex gap-2">
                <Field label="Shop price" className="flex-1">
                  <input
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required
                    inputMode="numeric"
                    className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 font-mono text-sm text-mist focus:outline-none focus:ring-1 focus:ring-volt"
                    placeholder="500"
                  />
                </Field>
                <Field label="Stock (blank = ∞)" className="flex-1">
                  <input
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    inputMode="numeric"
                    className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 font-mono text-sm text-mist focus:outline-none focus:ring-1 focus:ring-volt"
                    placeholder="∞"
                  />
                </Field>
                <Field label="Value (optional)" className="flex-1">
                  <input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    inputMode="numeric"
                    className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 font-mono text-sm text-mist focus:outline-none focus:ring-1 focus:ring-volt"
                    placeholder="—"
                  />
                </Field>
              </div>

              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-xs text-mist/70">
                  <input
                    type="checkbox"
                    checked={isTradable}
                    onChange={(e) => setIsTradable(e.target.checked)}
                    className="h-4 w-4 accent-volt"
                  />
                  Tradable
                </label>
                <label className="flex items-center gap-1.5 text-xs text-mist/70">
                  <input
                    type="checkbox"
                    checked={isSellable}
                    onChange={(e) => setIsSellable(e.target.checked)}
                    className="h-4 w-4 accent-volt"
                  />
                  Sellable
                </label>
              </div>

              {createItem.isError ? (
                <p className="text-xs text-rotom-red-light">{(createItem.error as Error).message}</p>
              ) : null}

              <button
                type="submit"
                disabled={createItem.isPending}
                className="w-full touch-manipulation rounded-2xl bg-volt py-3 text-sm font-semibold text-screen-ink active:scale-[0.98] disabled:opacity-50"
              >
                {createItem.isPending ? "Creating…" : "Create & list in Shop"}
              </button>
            </form>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[10px] uppercase tracking-wide text-mist/40">{label}</label>
      {children}
    </div>
  );
}
