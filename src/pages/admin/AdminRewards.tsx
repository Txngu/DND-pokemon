import * as React from "react";
import { Send, Coins, Backpack, PawPrint, Plus, X } from "lucide-react";
import { RecipientPicker } from "@/components/admin/RecipientPicker";
import { adminInput, adminLabel, adminButtonPrimary, adminButtonSecondary } from "@/components/admin/adminStyles";
import { usePhoneContext } from "@/hooks/usePhoneContext";
import { useSpecies } from "@/hooks/useBag";
import { useAllItemsCatalog, useCreateRewardDraft, useSendRewardBatch, useRewardBatches } from "@/hooks/useAdmin";
import type { RecipientSelection } from "@/hooks/useAdmin";
import type { RewardKind } from "@/types/database.types";
import { toast } from "@/lib/toast";

const KIND_TABS: { value: RewardKind; label: string; icon: typeof Coins }[] = [
  { value: "money", label: "Money", icon: Coins },
  { value: "items", label: "Items", icon: Backpack },
  { value: "pokemon", label: "Pokémon", icon: PawPrint },
];

export default function AdminRewards() {
  const { profile: me } = usePhoneContext();
  const { data: catalog } = useAllItemsCatalog();
  const { data: species } = useSpecies();
  const createDraft = useCreateRewardDraft();
  const sendBatch = useSendRewardBatch();
  const { data: batches, isLoading: batchesLoading } = useRewardBatches();

  const [kind, setKind] = React.useState<RewardKind>("money");
  const [message, setMessage] = React.useState("");
  const [recipients, setRecipients] = React.useState<RecipientSelection>({ mode: "all" });

  const [amount, setAmount] = React.useState("1000");
  const [itemRows, setItemRows] = React.useState<{ itemId: string; quantity: string }[]>([{ itemId: "", quantity: "1" }]);
  const [pkSpecies, setPkSpecies] = React.useState("1");
  const [pkLevel, setPkLevel] = React.useState("5");
  const [pkNature, setPkNature] = React.useState("Hardy");
  const [pkAbility, setPkAbility] = React.useState("");
  const [pkHeldItem, setPkHeldItem] = React.useState("");
  const [pkMaxHp, setPkMaxHp] = React.useState("20");
  const [pkStatus, setPkStatus] = React.useState("healthy");

  function buildPayload(): Record<string, unknown> {
    if (kind === "money") return { amount: Math.max(0, Math.round(Number(amount)) || 0) };
    if (kind === "items") {
      return {
        items: itemRows
          .filter((r) => r.itemId)
          .map((r) => ({ item_id: r.itemId, quantity: Math.max(1, Math.round(Number(r.quantity)) || 1) })),
      };
    }
    return {
      species_id: Number(pkSpecies),
      level: Math.max(1, Math.min(100, Number(pkLevel) || 5)),
      nature: pkNature,
      ability: pkAbility.trim() || "Unknown",
      held_item_id: pkHeldItem || null,
      max_hp: Math.max(1, Number(pkMaxHp) || 20),
      status: pkStatus,
    };
  }

  function recipientsValid() {
    if (recipients.mode === "user") return !!recipients.profileId;
    if (recipients.mode === "users") return (recipients.profileIds?.length ?? 0) > 0;
    if (recipients.mode === "city") return !!recipients.cityId;
    return true;
  }

  function handleSaveDraft() {
    if (!recipientsValid()) {
      toast("Choose at least one recipient", "error");
      return;
    }
    createDraft.mutate(
      { kind, message, payload: buildPayload(), recipients, adminId: me.id },
      { onSuccess: () => toast("Draft saved", "success") }
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-50">Rewards</h1>
        <p className="text-sm text-slate-400">Prepare a reward, then send it immediately when you're ready. No scheduling.</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#111623] p-5">
        <div className="mb-4 flex gap-2">
          {KIND_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setKind(t.value)}
              className={
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium " +
                (kind === t.value ? "bg-volt text-screen-ink" : "bg-white/5 text-slate-300 hover:bg-white/10")
              }
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {kind === "money" ? (
          <div className="max-w-xs">
            <label className={adminLabel}>Amount</label>
            <input className={adminInput} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        ) : null}

        {kind === "items" ? (
          <div className="space-y-2">
            <label className={adminLabel}>Items</label>
            {itemRows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  className={adminInput}
                  value={row.itemId}
                  onChange={(e) => setItemRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, itemId: e.target.value } : r)))}
                >
                  <option value="">Choose item…</option>
                  {catalog?.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name}
                    </option>
                  ))}
                </select>
                <input
                  className={`${adminInput} w-20`}
                  inputMode="numeric"
                  value={row.quantity}
                  onChange={(e) => setItemRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, quantity: e.target.value } : r)))}
                />
                <button
                  type="button"
                  onClick={() => setItemRows((rows) => rows.filter((_, idx) => idx !== i))}
                  className="text-slate-500 hover:text-rotom-red-light"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setItemRows((rows) => [...rows, { itemId: "", quantity: "1" }])}
              className="flex items-center gap-1 text-xs font-medium text-volt"
            >
              <Plus className="h-3.5 w-3.5" />
              Add another item
            </button>
          </div>
        ) : null}

        {kind === "pokemon" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className={adminLabel}>Species</label>
              <select className={adminInput} value={pkSpecies} onChange={(e) => setPkSpecies(e.target.value)}>
                {species?.map((s) => (
                  <option key={s.id} value={s.id}>
                    #{s.id} {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={adminLabel}>Level</label>
              <input className={adminInput} inputMode="numeric" value={pkLevel} onChange={(e) => setPkLevel(e.target.value)} />
            </div>
            <div>
              <label className={adminLabel}>Nature</label>
              <input className={adminInput} value={pkNature} onChange={(e) => setPkNature(e.target.value)} />
            </div>
            <div>
              <label className={adminLabel}>Ability</label>
              <input className={adminInput} value={pkAbility} onChange={(e) => setPkAbility(e.target.value)} />
            </div>
            <div>
              <label className={adminLabel}>Held item</label>
              <select className={adminInput} value={pkHeldItem} onChange={(e) => setPkHeldItem(e.target.value)}>
                <option value="">None</option>
                {catalog?.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={adminLabel}>Max HP</label>
              <input className={adminInput} inputMode="numeric" value={pkMaxHp} onChange={(e) => setPkMaxHp(e.target.value)} />
            </div>
            <div>
              <label className={adminLabel}>Status</label>
              <select className={adminInput} value={pkStatus} onChange={(e) => setPkStatus(e.target.value)}>
                {["healthy", "poisoned", "burned", "paralyzed", "asleep", "frozen", "fainted"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        <div className="mt-4">
          <label className={adminLabel}>Message</label>
          <textarea
            className={adminInput}
            rows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Weekly tournament reward!"
          />
        </div>

        <div className="mt-4">
          <RecipientPicker value={recipients} onChange={setRecipients} />
        </div>

        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={createDraft.isPending}
          className={`${adminButtonSecondary} mt-5`}
        >
          Save as draft
        </button>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#111623]">
        <div className="border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-100">Reward history</h2>
        </div>
        <div className="divide-y divide-white/5">
          {batchesLoading ? (
            <div className="p-4 text-sm text-slate-500">Loading…</div>
          ) : !batches || batches.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">No rewards yet.</div>
          ) : (
            batches.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium capitalize text-slate-100">{b.kind}</span>
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-[10px] font-medium " +
                        (b.status === "sent" ? "bg-emerald-400/15 text-emerald-300" : "bg-amber-400/15 text-amber-300")
                      }
                    >
                      {b.status}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">{b.recipient_mode}</span>
                  </div>
                  {b.message ? <p className="mt-0.5 truncate text-xs text-slate-400">{b.message}</p> : null}
                  <p className="mt-0.5 font-mono text-[10px] text-slate-500">
                    {new Date(b.created_at).toLocaleString()}
                  </p>
                </div>
                {b.status === "draft" ? (
                  <button
                    type="button"
                    onClick={() =>
                      sendBatch.mutate(b.id, {
                        onSuccess: (count) => toast(`Reward sent to ${count} trainer${count === 1 ? "" : "s"}`, "success"),
                      })
                    }
                    disabled={sendBatch.isPending}
                    className={`${adminButtonPrimary} flex shrink-0 items-center gap-1.5`}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Send
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
