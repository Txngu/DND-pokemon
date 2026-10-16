import * as React from "react";
import { Plus, Swords, Users, ScrollText } from "lucide-react";
import { AdminModal } from "@/components/admin/AdminModal";
import { adminInput, adminLabel, adminButtonPrimary, adminButtonSecondary } from "@/components/admin/adminStyles";
import { KpEditor } from "@/components/phone/KpEditor";
import { HpBar } from "@/components/phone/HpBar";
import { SpriteImage } from "@/components/phone/SpriteImage";
import { pokemonSpriteUrl } from "@/lib/sprites";
import { toast } from "@/lib/toast";
import { usePhoneContext } from "@/hooks/usePhoneContext";
import { useSpecies } from "@/hooks/useBag";
import {
  useAllEncounters,
  useCreateEncounter,
  useAdjustEnemyKp,
  useEndEncounter,
  useBattleParticipants,
  useBattleLogs,
  useBattleRealtime,
  useEncountersRealtime,
} from "@/hooks/useBattle";

/** The Game Master's live encounter tracker. Everything updates via Realtime. */
export default function AdminBattleManager() {
  const { profile: me } = usePhoneContext();
  const { data: encounters, isLoading } = useAllEncounters();
  const { data: species } = useSpecies();
  const createEncounter = useCreateEncounter();
  const adjustEnemy = useAdjustEnemyKp();
  const endEncounter = useEndEncounter();

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [enemyName, setEnemyName] = React.useState("");
  const [enemySpecies, setEnemySpecies] = React.useState("");
  const [level, setLevel] = React.useState("5");
  const [maxKp, setMaxKp] = React.useState("50");
  const [notes, setNotes] = React.useState("");

  const selected = encounters?.find((e) => e.id === selectedId) ?? null;
  const { data: participants } = useBattleParticipants(selectedId);
  const { data: logs } = useBattleLogs(selectedId);
  useEncountersRealtime();
  useBattleRealtime(selectedId);

  function resetForm() {
    setName("");
    setEnemyName("");
    setEnemySpecies("");
    setLevel("5");
    setMaxKp("50");
    setNotes("");
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createEncounter.mutate(
      {
        name: name.trim(),
        enemyName: enemyName.trim(),
        enemySpeciesId: enemySpecies ? Number(enemySpecies) : null,
        level: Math.max(1, Number(level) || 1),
        maxKp: Math.max(1, Number(maxKp) || 1),
        notes: notes.trim(),
        createdBy: me.id,
      },
      {
        onSuccess: (encounter) => {
          toast(`Encounter "${encounter.name}" created`, "success");
          setCreateOpen(false);
          resetForm();
          setSelectedId(encounter.id);
        },
      }
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-50">Battle Manager</h1>
          <button type="button" className={`${adminButtonPrimary} flex items-center gap-1.5 !px-3 !py-1.5 text-xs`} onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            New
          </button>
        </div>

        <div className="space-y-2">
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : !encounters || encounters.length === 0 ? (
            <p className="text-sm text-slate-500">No encounters yet.</p>
          ) : (
            encounters.map((enc) => (
              <button
                key={enc.id}
                type="button"
                onClick={() => setSelectedId(enc.id)}
                className={
                  "block w-full rounded-xl border px-3 py-2.5 text-left transition-colors " +
                  (selectedId === enc.id ? "border-volt/50 bg-volt/10" : "border-white/10 bg-[#111623] hover:bg-white/5")
                }
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-100">{enc.name}</p>
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[10px] font-medium " +
                      (enc.status === "active" ? "bg-emerald-400/15 text-emerald-300" : "bg-white/10 text-slate-400")
                    }
                  >
                    {enc.status}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  {enc.enemy_name} · Lv{enc.level} · {enc.current_kp}/{enc.max_kp} KP
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      <div>
        {!selected ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-slate-500">
            Select an encounter to manage it live.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-[#111623] p-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-semibold text-slate-50">
                    <Swords className="h-4 w-4 text-rotom-red-light" />
                    {selected.name}
                  </h2>
                  <p className="text-sm text-slate-400">
                    {selected.enemy_name} · Level {selected.level}
                  </p>
                </div>
                {selected.status === "active" ? (
                  <button
                    type="button"
                    className={adminButtonSecondary}
                    onClick={() => endEncounter.mutate(selected.id, { onSuccess: () => toast("Encounter ended", "success") })}
                  >
                    End encounter
                  </button>
                ) : null}
              </div>

              <HpBar current={selected.current_kp} max={selected.max_kp} label="Enemy KP" className="mb-3" />

              {selected.status === "active" ? (
                <KpEditor
                  disabled={adjustEnemy.isPending}
                  onAdjust={(delta) =>
                    adjustEnemy.mutate(
                      { encounterId: selected.id, delta },
                      { onSuccess: () => toast(delta > 0 ? `Enemy +${delta} KP` : `Enemy ${delta} KP`, "info") }
                    )
                  }
                />
              ) : (
                <p className="text-xs text-slate-500">This encounter has ended.</p>
              )}

              {selected.notes ? <p className="mt-3 text-xs text-slate-500">{selected.notes}</p> : null}
            </div>

            <div className="rounded-xl border border-white/10 bg-[#111623] p-5">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-100">
                <Users className="h-4 w-4" />
                Participants ({participants?.length ?? 0})
              </h3>
              {!participants || participants.length === 0 ? (
                <p className="text-xs text-slate-500">No trainers have joined this encounter yet.</p>
              ) : (
                <div className="space-y-2">
                  {participants.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
                      <SpriteImage src={pokemonSpriteUrl(p.pokemon.species_id)} alt={p.pokemon.species.name} className="h-8 w-8" fallbackClassName="h-8 w-8" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-slate-100">
                          {p.pokemon.nickname || p.pokemon.species.name} <span className="text-slate-500">· {p.trainer.username}</span>
                        </p>
                        <HpBar current={p.pokemon.current_hp} max={p.pokemon.max_hp} className="mt-1" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-[#111623] p-5">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-100">
                <ScrollText className="h-4 w-4" />
                Battle log
              </h3>
              {!logs || logs.length === 0 ? (
                <p className="text-xs text-slate-500">No KP changes logged yet.</p>
              ) : (
                <div className="max-h-80 space-y-1.5 overflow-y-auto">
                  {logs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs">
                      <div className="min-w-0">
                        <span className="font-medium text-slate-100">{log.target_label}</span>{" "}
                        <span className="text-slate-400">
                          {log.delta > 0 ? "healed" : "took damage"} ({log.previous_kp} → {log.new_kp})
                        </span>
                        {log.note ? <span className="text-slate-500"> · {log.note}</span> : null}
                      </div>
                      <span className="shrink-0 font-mono text-[10px] text-slate-500">
                        {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <AdminModal open={createOpen} title="Create encounter" onClose={() => setCreateOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className={adminLabel}>Battle name</label>
            <input className={adminInput} required value={name} onChange={(e) => setName(e.target.value)} placeholder="Crystal Cave Boss" />
          </div>
          <div>
            <label className={adminLabel}>Enemy name</label>
            <input className={adminInput} required value={enemyName} onChange={(e) => setEnemyName(e.target.value)} placeholder="Luxray" />
          </div>
          <div>
            <label className={adminLabel}>Enemy species (optional, for sprite)</label>
            <select className={adminInput} value={enemySpecies} onChange={(e) => setEnemySpecies(e.target.value)}>
              <option value="">Custom / unknown</option>
              {species?.map((s) => (
                <option key={s.id} value={s.id}>
                  #{s.id} {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={adminLabel}>Level</label>
              <input className={adminInput} inputMode="numeric" value={level} onChange={(e) => setLevel(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className={adminLabel}>Max KP</label>
              <input className={adminInput} inputMode="numeric" value={maxKp} onChange={(e) => setMaxKp(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={adminLabel}>Notes</label>
            <textarea className={adminInput} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {createEncounter.isError ? <p className="text-xs text-rotom-red-light">{(createEncounter.error as Error).message}</p> : null}
          <button type="submit" className={`${adminButtonPrimary} w-full`} disabled={createEncounter.isPending}>
            {createEncounter.isPending ? "Creating…" : "Create encounter"}
          </button>
        </form>
      </AdminModal>
    </div>
  );
}
