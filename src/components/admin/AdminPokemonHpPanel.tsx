import * as React from "react";
import { HeartCrack, X } from "lucide-react";
import { ConfirmDialog } from "@/components/phone/ConfirmDialog";
import { HpBar } from "@/components/phone/HpBar";
import { StatusBadge } from "@/components/phone/StatusBadge";
import { adminButtonDanger, adminButtonSecondary, adminInput, adminLabel } from "@/components/admin/adminStyles";
import { HP_SOURCE_LABELS, useAdminSetPokemonHp, useDamagePokemon, usePokemonHpHistory } from "@/hooks/usePokemonHp";
import { toast } from "@/lib/toast";
import type { PokemonStatus, TrainerPokemon } from "@/types/database.types";

const STATUSES: { value: PokemonStatus; label: string }[] = [
  { value: "healthy", label: "Healthy" },
  { value: "poisoned", label: "Poisoned" },
  { value: "burned", label: "Burned" },
  { value: "paralyzed", label: "Paralyzed" },
  { value: "asleep", label: "Asleep" },
  { value: "frozen", label: "Frozen" },
  { value: "confused", label: "Confused" },
];

/**
 * Game Master KP controls for one of a trainer's Pokémon (PokéGear 12):
 * deal damage (with confirmation), set KP to an exact value, set a status,
 * mark as fainted, and see the latest KP changes.
 */
export function AdminPokemonHpPanel({ pokemon, onClose }: { pokemon: TrainerPokemon; onClose: () => void }) {
  const damage = useDamagePokemon();
  const setHp = useAdminSetPokemonHp();
  const { data: history } = usePokemonHpHistory(pokemon.id);
  const name = pokemon.nickname || pokemon.species.name;

  const [dmg, setDmg] = React.useState("");
  const [exact, setExact] = React.useState(String(pokemon.current_hp));
  const [status, setStatus] = React.useState<PokemonStatus>(pokemon.status === "fainted" ? "healthy" : pokemon.status);
  const [confirm, setConfirm] = React.useState<null | "damage" | "faint">(null);

  React.useEffect(() => {
    setExact(String(pokemon.current_hp));
    setStatus(pokemon.status === "fainted" ? "healthy" : pokemon.status);
  }, [pokemon.current_hp, pokemon.status]);

  const fainted = pokemon.status === "fainted" || pokemon.current_hp === 0;
  const dmgNum = Number(dmg);
  const dmgValid = dmg.trim() !== "" && Number.isInteger(dmgNum) && dmgNum > 0;
  const after = dmgValid ? Math.max(0, pokemon.current_hp - dmgNum) : null;
  const exactNum = Number(exact);
  const exactError =
    exact.trim() === "" || !Number.isInteger(exactNum)
      ? "Enter a whole number."
      : exactNum < 0
        ? "Current HP cannot be below 0."
        : exactNum > pokemon.max_hp
          ? "Current HP cannot be greater than Maximum HP."
          : null;

  function dealDamage() {
    damage.mutate(
      { pokemonId: pokemon.id, amount: dmgNum },
      {
        onSuccess: (u) => {
          setDmg("");
          toast(`${name}: ${pokemon.current_hp}/${pokemon.max_hp} → ${u.current_hp}/${u.max_hp} KP${u.current_hp === 0 ? " — fainted" : ""}`, "success");
        },
      }
    );
  }

  function applyExact() {
    if (exactError) return;
    setHp.mutate(
      { pokemonId: pokemon.id, currentHp: exactNum, status: exactNum === 0 ? null : status },
      { onSuccess: (u) => toast(`${name}: ${u.current_hp}/${u.max_hp} KP, ${u.status}`, "success") }
    );
  }

  if (pokemon.is_dead) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-slate-400">
        {name} has died — its KP can&apos;t be changed.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm font-semibold text-slate-100">KP · {name}</p>
        <StatusBadge status={pokemon.status} />
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300" aria-label="Close KP panel">
          <X className="h-4 w-4" />
        </button>
      </div>
      <HpBar current={pokemon.current_hp} max={pokemon.max_hp} />

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Damage */}
        <div>
          <label className={adminLabel}>Deal damage</label>
          <div className="flex gap-2">
            <input
              className={`${adminInput} w-24`}
              inputMode="numeric"
              placeholder="KP"
              value={dmg}
              disabled={fainted}
              onChange={(e) => setDmg(e.target.value.replace(/[^\d]/g, ""))}
            />
            <button
              type="button"
              className={`${adminButtonDanger} flex items-center gap-1.5 whitespace-nowrap`}
              disabled={!dmgValid || fainted || damage.isPending}
              onClick={() => setConfirm("damage")}
            >
              <HeartCrack className="h-3.5 w-3.5" />
              Deal damage
            </button>
          </div>
          <p className="mt-1 font-mono text-[11px] text-slate-400">
            {fainted
              ? "This Pokémon has already fainted."
              : after !== null
                ? `${pokemon.current_hp}/${pokemon.max_hp} → ${after}/${pokemon.max_hp}${after === 0 ? " · faints" : ""}`
                : `Current: ${pokemon.current_hp}/${pokemon.max_hp}`}
          </p>
        </div>

        {/* Exact KP + status */}
        <div>
          <label className={adminLabel}>Set KP / status</label>
          <div className="flex gap-2">
            <input
              className={`${adminInput} w-20`}
              inputMode="numeric"
              value={exact}
              onChange={(e) => setExact(e.target.value.replace(/[^\d]/g, ""))}
              aria-label="Exact current KP"
            />
            <select
              className={`${adminInput} min-w-0`}
              value={status}
              disabled={exactNum === 0}
              onChange={(e) => setStatus(e.target.value as PokemonStatus)}
              aria-label="Status"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button type="button" className={adminButtonSecondary} disabled={!!exactError || setHp.isPending} onClick={applyExact}>
              Set
            </button>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {exactError ?? (exactNum === 0 ? "0 KP = fainted." : fainted ? "Above 0 revives it." : `Max KP ${pokemon.max_hp}`)}
          </p>
        </div>
      </div>

      <button
        type="button"
        className="text-xs text-rotom-red-light hover:underline disabled:opacity-40"
        disabled={fainted || setHp.isPending}
        onClick={() => setConfirm("faint")}
      >
        Mark as fainted (0 KP)
      </button>

      {history && history.length > 0 ? (
        <div>
          <p className={adminLabel}>Recent KP changes</p>
          <ul className="space-y-0.5 text-[11px] text-slate-300">
            {history.map((h) => (
              <li key={h.id} className="flex gap-2">
                <span className="w-24 shrink-0 text-slate-500">{new Date(h.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
                <span className={h.delta < 0 ? "w-10 shrink-0 font-mono text-rotom-red-light" : "w-10 shrink-0 font-mono text-emerald-300"}>
                  {h.delta > 0 ? `+${h.delta}` : h.delta}
                </span>
                <span className="w-16 shrink-0 font-mono text-slate-400">
                  {h.previous_hp}→{h.new_hp}
                </span>
                <span className="min-w-0 truncate">{HP_SOURCE_LABELS[h.source] ?? h.source}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "faint" ? `Mark ${name} as fainted?` : `Deal ${dmgNum} damage to ${name}?`}
        message={
          confirm === "faint"
            ? `${pokemon.current_hp}/${pokemon.max_hp} → 0/${pokemon.max_hp} KP. It will need the Pokémon Center to recover.`
            : `${pokemon.current_hp}/${pokemon.max_hp} → ${after ?? pokemon.current_hp}/${pokemon.max_hp} KP${after === 0 ? " — it will faint." : "."}`
        }
        confirmLabel={confirm === "faint" ? "Mark fainted" : "Deal damage"}
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const which = confirm;
          setConfirm(null);
          if (which === "damage") dealDamage();
          else if (which === "faint")
            setHp.mutate({ pokemonId: pokemon.id, currentHp: 0 }, { onSuccess: () => toast(`${name} fainted`, "success") });
        }}
      />
    </div>
  );
}
