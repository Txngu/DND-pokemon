import * as React from "react";
import { Plus } from "lucide-react";
import { ItemIcon } from "@/components/phone/ItemIcon";
import { adminInput, adminLabel, adminButtonPrimary } from "@/components/admin/adminStyles";
import { useAllItemsCatalog, useCreateCatalogItem } from "@/hooks/useAdmin";
import { toast } from "@/lib/toast";
import type { ItemCategory } from "@/types/database.types";

const CATEGORY_OPTIONS: { value: ItemCategory; label: string }[] = [
  { value: "poke_ball", label: "Poké Ball" },
  { value: "medicine", label: "Medicine" },
  { value: "evolution", label: "Evolution" },
  { value: "battle", label: "Battle" },
  { value: "key_item", label: "Key Item" },
  { value: "quest", label: "Quest" },
  { value: "other", label: "Other" },
];

export default function AdminItems() {
  const { data: catalog, isLoading } = useAllItemsCatalog();
  const createItem = useCreateCatalogItem();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState<ItemCategory>("quest");
  const [iconEmoji, setIconEmoji] = React.useState("");
  const [pokeapiSlug, setPokeapiSlug] = React.useState("");
  const [value, setValue] = React.useState("");
  const [isTradable, setIsTradable] = React.useState(true);
  const [isSellable, setIsSellable] = React.useState(true);
  const [categoryFilter, setCategoryFilter] = React.useState<ItemCategory | "all">("all");

  function reset() {
    setName("");
    setDescription("");
    setCategory("quest");
    setIconEmoji("");
    setPokeapiSlug("");
    setValue("");
    setIsTradable(true);
    setIsSellable(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    createItem.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        category,
        iconEmoji: iconEmoji.trim() || null,
        pokeapiSlug: pokeapiSlug.trim() || null,
        value: value.trim() ? Math.round(Number(value)) : null,
        isTradable,
        isSellable,
      },
      {
        onSuccess: () => {
          toast(`"${name.trim()}" created`, "success");
          reset();
        },
      }
    );
  }

  const filtered = (catalog ?? []).filter((it) => categoryFilter === "all" || it.category === categoryFilter);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-50">Items</h1>
        <p className="text-sm text-slate-400">
          Create fully custom items — quest objects, campaign rewards, anything — not just official Pokémon items.
          New items are immediately usable in the Bag, Shop, admin rewards, and player trading.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-white/10 bg-[#111623] p-5">
        <h2 className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-slate-100">
          <Plus className="h-4 w-4" />
          New custom item
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={adminLabel}>Name</label>
            <input className={adminInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mysterious Crystal" required />
          </div>
          <div>
            <label className={adminLabel}>Category</label>
            <select className={adminInput} value={category} onChange={(e) => setCategory(e.target.value as ItemCategory)}>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={adminLabel}>Description</label>
            <textarea
              className={adminInput}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A strange crystal containing an unknown energy."
            />
          </div>
          <div>
            <label className={adminLabel}>Icon (emoji)</label>
            <input className={adminInput} value={iconEmoji} onChange={(e) => setIconEmoji(e.target.value)} maxLength={4} placeholder="🔮" />
          </div>
          <div>
            <label className={adminLabel}>Or official sprite slug (optional)</label>
            <input
              className={adminInput}
              value={pokeapiSlug}
              onChange={(e) => setPokeapiSlug(e.target.value)}
              placeholder="e.g. rare-candy"
            />
          </div>
          <div>
            <label className={adminLabel}>Value (optional)</label>
            <input className={adminInput} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="flex items-end gap-4 pb-1">
            <label className="flex items-center gap-1.5 text-sm text-slate-300">
              <input type="checkbox" checked={isTradable} onChange={(e) => setIsTradable(e.target.checked)} className="h-4 w-4 accent-volt" />
              Tradable
            </label>
            <label className="flex items-center gap-1.5 text-sm text-slate-300">
              <input type="checkbox" checked={isSellable} onChange={(e) => setIsSellable(e.target.checked)} className="h-4 w-4 accent-volt" />
              Sellable
            </label>
          </div>
        </div>

        {createItem.isError ? <p className="mt-3 text-xs text-rotom-red-light">{(createItem.error as Error).message}</p> : null}

        <button type="submit" className={`${adminButtonPrimary} mt-4`} disabled={createItem.isPending}>
          {createItem.isPending ? "Creating…" : "Create item"}
        </button>
      </form>

      <div className="rounded-xl border border-white/10 bg-[#111623]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-100">Catalog ({filtered.length})</h2>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCategoryFilter("all")}
              className={
                "rounded-full px-2.5 py-1 text-[11px] font-medium " +
                (categoryFilter === "all" ? "bg-volt text-screen-ink" : "bg-white/5 text-slate-400")
              }
            >
              All
            </button>
            {CATEGORY_OPTIONS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategoryFilter(c.value)}
                className={
                  "rounded-full px-2.5 py-1 text-[11px] font-medium " +
                  (categoryFilter === c.value ? "bg-volt text-screen-ink" : "bg-white/5 text-slate-400")
                }
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="divide-y divide-white/5">
          {isLoading ? (
            <div className="p-4 text-sm text-slate-500">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">No items in this category yet.</div>
          ) : (
            filtered.map((it) => (
              <div key={it.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5">
                  <ItemIcon item={it} className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-100">{it.name}</p>
                  <p className="truncate text-[11px] text-slate-500">{it.description || "No description"}</p>
                </div>
                <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                  {it.category}
                </span>
                {!it.is_tradable ? (
                  <span className="shrink-0 rounded-full bg-rotom-red/15 px-2 py-0.5 text-[10px] text-rotom-red-light">Not tradable</span>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
