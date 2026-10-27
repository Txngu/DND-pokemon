import * as React from "react";
import { ArrowLeft, Coins, Gift, Sparkles, Swords, Trophy } from "lucide-react";
import { AdminModal } from "@/components/admin/AdminModal";
import { adminButtonPrimary, adminButtonSecondary, adminInput, adminLabel } from "@/components/admin/adminStyles";
import { BattleSprite } from "@/components/battle/BattleBits";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { distribute, formatMoney, formatXp, splitEvenly, sum, toWholeNumber } from "@/lib/battle";
import { useGiveBattleRewards, type RewardLine } from "@/hooks/useEncounter";
import type { BattleState, RewardSplitMode } from "@/types/database.types";

const MODES: { value: RewardSplitMode; label: string; inputLabel: string }[] = [
  { value: "equal", label: "Divide equally", inputLabel: "Total" },
  { value: "per_player", label: "Same per player", inputLabel: "Per player" },
  { value: "custom", label: "Custom", inputLabel: "Intended total" },
];

interface RewardField {
  mode: RewardSplitMode;
  value: string;
  custom: string[];
}

function computed(field: RewardField, count: number) {
  const value = toWholeNumber(field.value);
  const custom = field.custom.map(toWholeNumber);
  const shares = distribute(field.mode, value, count, custom);
  const total = sum(shares);
  const mismatch = field.mode === "custom" && total !== value;
  return { value, shares, total, mismatch };
}

/**
 * The Game Master's "Battle Finished" popup. Nothing is paid until the
 * second step's "Give Rewards" — and then it's one server call that pays
 * every trainer in a single transaction (admin_give_battle_rewards), with
 * the exact distribution shown here passed along so the server can refuse
 * if anything changed in the meantime.
 */
export function RewardModal({ state, open, onClose }: { state: BattleState; open: boolean; onClose: () => void }) {
  const give = useGiveBattleRewards();
  const players = state.players; // same order the server uses (joined_at, id)
  const n = players.length;

  const [step, setStep] = React.useState<"edit" | "confirm">("edit");
  const [money, setMoney] = React.useState<RewardField>({ mode: "equal", value: "", custom: [] });
  const [xp, setXp] = React.useState<RewardField>({ mode: "per_player", value: "", custom: [] });

  React.useEffect(() => {
    if (open) {
      setStep("edit");
      setMoney({ mode: n > 1 ? "equal" : "per_player", value: "", custom: players.map(() => "") });
      setXp({ mode: "per_player", value: "", custom: players.map(() => "") });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, state.encounter.id]);

  const m = computed(money, n);
  const x = computed(xp, n);
  const totalDamage = sum(players.map((p) => p.damage_dealt));
  const nothing = m.total === 0 && x.total === 0;
  const invalid = m.mismatch || x.mismatch || nothing;

  const lines: RewardLine[] = players.map((p, i) => ({ profile_id: p.profile_id, money: m.shares[i] ?? 0, xp: x.shares[i] ?? 0 }));

  function handleGive() {
    give.mutate(
      {
        encounterId: state.encounter.id,
        moneyMode: money.mode,
        moneyValue: m.value,
        xpMode: xp.mode,
        xpValue: x.value,
        custom: money.mode === "custom" || xp.mode === "custom" ? lines : null,
        expected: lines,
      },
      {
        onSuccess: (res) => {
          toast(`Rewards sent: ${formatMoney(res.total_money)} and ${formatXp(res.total_xp)} to ${n} trainer${n > 1 ? "s" : ""}`, "success");
          onClose();
        },
      }
    );
  }

  const enemiesLabel = state.enemies.map((e) => `${e.name} (Lv${e.level})`).join(", ");
  const won = state.encounter.status === "completed";

  return (
    <AdminModal open={open} title={step === "edit" ? "Battle finished — rewards" : "Confirm battle rewards"} onClose={onClose} width="max-w-2xl">
      {step === "edit" ? (
        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-start gap-3">
              <div className="flex -space-x-3">
                {state.enemies.slice(0, 4).map((e) => (
                  <div key={e.id} className="h-12 w-12 rounded-full bg-white/5 ring-2 ring-[#111623]">
                    <BattleSprite speciesId={e.species_id} spriteUrl={e.sprite_url} alt={e.name} className="h-12 w-12 grayscale-[40%]" />
                  </div>
                ))}
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <p className="flex items-center gap-1.5 font-semibold text-slate-100">
                  {won ? <Trophy className="h-4 w-4 text-volt" /> : <Swords className="h-4 w-4 text-slate-400" />}
                  {state.encounter.name} · {won ? "Victory" : "Defeat"}
                </p>
                <p className="truncate text-xs text-slate-400">Enemy Pokémon: {enemiesLabel}</p>
                <p className="text-xs text-slate-400">
                  Trainers: {players.map((p) => p.username).join(", ")} · Damage dealt: <b className="text-slate-200">{totalDamage}</b>
                </p>
              </div>
            </div>
          </div>

          <RewardFieldEditor
            icon={<Coins className="h-4 w-4 text-volt" />}
            title="Money reward"
            unit="₽"
            field={money}
            setField={setMoney}
            count={n}
            players={players.map((p) => p.username)}
            mismatchText={m.mismatch ? `⚠️ The player rewards must add up to ${formatMoney(m.value)}.` : null}
          />
          <RewardFieldEditor
            icon={<Sparkles className="h-4 w-4 text-circuit-violet" />}
            title="EXP reward"
            unit="XP"
            field={xp}
            setField={setXp}
            count={n}
            players={players.map((p) => p.username)}
            mismatchText={x.mismatch ? `⚠️ The player XP rewards must add up to ${formatXp(x.value)}.` : null}
          />

          {/* Distribution preview */}
          <div>
            <label className={adminLabel}>Each trainer receives</label>
            <div className="overflow-hidden rounded-lg border border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-[11px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium">Trainer</th>
                    <th className="px-3 py-1.5 text-right font-medium">Damage</th>
                    <th className="px-3 py-1.5 text-right font-medium">Money</th>
                    <th className="px-3 py-1.5 text-right font-medium">XP</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p, i) => (
                    <tr key={p.id} className="border-t border-white/5">
                      <td className="px-3 py-1.5 text-slate-200">{p.username}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-400">{p.damage_dealt}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-100">{formatMoney(m.shares[i] ?? 0)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-100">{formatXp(x.shares[i] ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-white/10 bg-white/[0.03]">
                  <tr>
                    <td className="px-3 py-1.5 text-xs font-semibold uppercase text-slate-400">Total</td>
                    <td className="px-3 py-1.5 text-right font-mono text-slate-400">{totalDamage}</td>
                    <td className={cn("px-3 py-1.5 text-right font-mono font-semibold", m.mismatch ? "text-amber-300" : "text-volt")}>{formatMoney(m.total)}</td>
                    <td className={cn("px-3 py-1.5 text-right font-mono font-semibold", x.mismatch ? "text-amber-300" : "text-circuit-violet")}>{formatXp(x.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {money.mode === "equal" && n > 1 && m.value % n !== 0 ? (
              <p className="mt-1 text-[11px] text-slate-500">
                {formatMoney(m.value)} doesn&apos;t split evenly: the first {m.value % n} trainer{m.value % n > 1 ? "s get" : " gets"} ₽1 extra so nothing is lost.
              </p>
            ) : null}
            {xp.mode === "equal" && n > 1 && x.value % n !== 0 ? (
              <p className="mt-1 text-[11px] text-slate-500">
                {formatXp(x.value)} doesn&apos;t split evenly: the first {x.value % n} trainer{x.value % n > 1 ? "s get" : " gets"} 1 XP extra.
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t border-white/10 pt-3">
            <button type="button" className={adminButtonSecondary} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={adminButtonPrimary} disabled={invalid} onClick={() => setStep("confirm")}>
              Review rewards
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
            <p>
              <span className="text-slate-400">Battle:</span> <b className="text-slate-100">{state.encounter.name}</b>
            </p>
            <p>
              <span className="text-slate-400">Participants:</span> <b className="text-slate-100">{n}</b>
            </p>
            <p>
              <span className="text-slate-400">Money:</span>{" "}
              <b className="text-volt">{formatMoney(m.total)} total</b>
              <span className="text-slate-400"> → {describeSplit(m.shares, formatMoney)}</span>
            </p>
            <p>
              <span className="text-slate-400">XP:</span>{" "}
              <b className="text-circuit-violet">{formatXp(x.total)} total</b>
              <span className="text-slate-400"> → {describeSplit(x.shares, formatXp)}</span>
            </p>
          </div>

          <div>
            <label className={adminLabel}>Distribution</label>
            <div className="space-y-1">
              {players.map((p, i) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                  <span className="text-slate-200">{p.username}</span>
                  <span className="font-mono text-slate-100">
                    {formatMoney(m.shares[i] ?? 0)} + {formatXp(x.shares[i] ?? 0)}
                  </span>
                </div>
              ))}
            </div>
            {x.total > 0 ? (
              <p className="mt-2 text-[11px] text-slate-500">Each trainer then chooses which of their Pokémon receives the XP.</p>
            ) : null}
          </div>

          <div className="flex justify-between gap-2 border-t border-white/10 pt-3">
            <button type="button" className={`${adminButtonSecondary} flex items-center gap-1`} disabled={give.isPending} onClick={() => setStep("edit")}>
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <div className="flex gap-2">
              <button type="button" className={adminButtonSecondary} disabled={give.isPending} onClick={onClose}>
                Cancel
              </button>
              <button type="button" className={`${adminButtonPrimary} flex items-center gap-1.5`} disabled={give.isPending} onClick={handleGive}>
                <Gift className="h-4 w-4" />
                {give.isPending ? "Giving…" : "Give Rewards"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminModal>
  );
}

function describeSplit(shares: number[], fmt: (n: number) => string) {
  if (shares.length === 0) return "";
  if (shares.every((s) => s === shares[0])) return `${fmt(shares[0])} × ${shares.length} player${shares.length > 1 ? "s" : ""}`;
  return shares.map(fmt).join(" / ");
}

function RewardFieldEditor({
  icon,
  title,
  unit,
  field,
  setField,
  count,
  players,
  mismatchText,
}: {
  icon: React.ReactNode;
  title: string;
  unit: "₽" | "XP";
  field: RewardField;
  setField: React.Dispatch<React.SetStateAction<RewardField>>;
  count: number;
  players: string[];
  mismatchText: string | null;
}) {
  const mode = MODES.find((x) => x.value === field.mode)!;
  const value = toWholeNumber(field.value);
  const hint =
    field.mode === "equal" && count > 1 && value > 0
      ? `${unit === "₽" ? formatMoney(value) : formatXp(value)} ÷ ${count} = ${splitEvenly(value, count)
          .filter((v, i, a) => a.indexOf(v) === i)
          .map((v) => (unit === "₽" ? formatMoney(v) : formatXp(v)))
          .join(" / ")} each`
      : field.mode === "per_player" && count > 1 && value > 0
        ? `${unit === "₽" ? formatMoney(value) : formatXp(value)} × ${count} = ${unit === "₽" ? formatMoney(value * count) : formatXp(value * count)} total`
        : null;

  function fillEvenly() {
    const shares = splitEvenly(value, count);
    setField((f) => ({ ...f, custom: shares.map(String) }));
  }

  return (
    <div className="rounded-xl border border-white/10 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-100">
          {icon}
          {title}
        </p>
        {count > 1 ? (
          <div className="flex rounded-lg bg-white/5 p-0.5">
            {MODES.map((x) => (
              <button
                key={x.value}
                type="button"
                onClick={() => setField((f) => ({ ...f, mode: x.value }))}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium",
                  field.mode === x.value ? "bg-volt text-screen-ink" : "text-slate-300 hover:bg-white/5"
                )}
              >
                {x.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-44">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">{unit === "₽" ? "₽" : ""}</span>
          <input
            className={cn(adminInput, unit === "₽" ? "pl-7" : "pr-10", "font-mono")}
            inputMode="numeric"
            placeholder="0"
            value={field.value}
            onChange={(e) => setField((f) => ({ ...f, value: e.target.value.replace(/[^\d]/g, "") }))}
            aria-label={`${title}: ${count > 1 ? mode.inputLabel : "amount"}`}
          />
          {unit === "XP" ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">XP</span> : null}
        </div>
        <span className="text-xs text-slate-400">{count > 1 ? mode.inputLabel : "Amount"}</span>
        {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
      </div>

      {field.mode === "custom" && count > 1 ? (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Per trainer</p>
            <button type="button" onClick={fillEvenly} className="text-[11px] text-volt hover:underline" disabled={!value}>
              Fill evenly from total
            </button>
          </div>
          {players.map((name, i) => (
            <div key={name + i} className="flex items-center gap-2">
              <span className="w-32 truncate text-sm text-slate-300">{name}</span>
              <input
                className={`${adminInput} !w-36 font-mono`}
                inputMode="numeric"
                placeholder="0"
                value={field.custom[i] ?? ""}
                onChange={(e) =>
                  setField((f) => {
                    const custom = [...f.custom];
                    custom[i] = e.target.value.replace(/[^\d]/g, "");
                    return { ...f, custom };
                  })
                }
              />
            </div>
          ))}
          <p className={cn("text-xs", mismatchText ? "text-amber-300" : "text-slate-500")}>
            Allocated: {unit === "₽" ? formatMoney(sum(field.custom.map(toWholeNumber))) : formatXp(sum(field.custom.map(toWholeNumber)))} of{" "}
            {unit === "₽" ? formatMoney(value) : formatXp(value)}
          </p>
          {mismatchText ? <p className="text-sm font-medium text-amber-300">{mismatchText}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
