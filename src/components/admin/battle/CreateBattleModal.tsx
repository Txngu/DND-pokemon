import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Plus, Sparkles, Trash2, Users } from "lucide-react";
import { AdminModal } from "@/components/admin/AdminModal";
import { adminButtonPrimary, adminButtonSecondary, adminInput, adminLabel } from "@/components/admin/adminStyles";
import { BattleSprite, TypePill } from "@/components/battle/BattleBits";
import { SpeciesSearch } from "@/components/phone/SpeciesSearch";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { defaultEnemyHp } from "@/lib/battle";
import { useAllProfiles } from "@/hooks/useAdmin";
import { useSpecies } from "@/hooks/useBag";
import { useAdminCreateBattle, type EnemyDraftPayload } from "@/hooks/useEncounter";

/**
 * PokéGear 12.1: enemies are just a Pokémon, a name, a level and KP. There
 * are no stats or moves — at the table, the GM types each enemy's damage
 * on its turn.
 */
interface EnemyDraft {
  key: string;
  speciesId: string;
  name: string;
  level: string;
  maxHp: string;
  currentHp: string;
  autoHp: boolean;
}

let keySeq = 0;
function newEnemy(level = 5): EnemyDraft {
  return {
    key: `e${++keySeq}`,
    speciesId: "",
    name: "",
    level: String(level),
    maxHp: String(defaultEnemyHp(level)),
    currentHp: String(defaultEnemyHp(level)),
    autoHp: true,
  };
}

const num = (v: string, fallback = 0) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fallback;
};

export function CreateBattleModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { data: profiles } = useAllProfiles();
  const { data: species } = useSpecies();
  const create = useAdminCreateBattle();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [playerIds, setPlayerIds] = React.useState<Set<string>>(new Set());
  const [search, setSearch] = React.useState("");
  const [enemies, setEnemies] = React.useState<EnemyDraft[]>(() => [newEnemy()]);

  const reset = React.useCallback(() => {
    setName("");
    setDescription("");
    setPlayerIds(new Set());
    setSearch("");
    setEnemies([newEnemy()]);
  }, []);

  // Trainers already in an active encounter can't be added to a second one.
  const { data: busyIds } = useQuery({
    queryKey: ["admin", "busy_players"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("battle_players")
        .select("profile_id, encounter:encounter_id!inner(status, mode)")
        .eq("encounter.status", "active")
        .eq("encounter.mode", "auto");
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.profile_id as string));
    },
  });

  const trainers = (profiles ?? [])
    .filter((p) => p.username.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => Number(a.role === "admin") - Number(b.role === "admin") || a.username.localeCompare(b.username));

  function togglePlayer(id: string) {
    setPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function patch(key: string, changes: Partial<EnemyDraft>) {
    setEnemies((list) => list.map((e) => (e.key === key ? { ...e, ...changes } : e)));
  }

  function onSpecies(e: EnemyDraft, speciesId: string) {
    const sp = species?.find((s) => String(s.id) === speciesId);
    const prevSpecies = species?.find((s) => String(s.id) === e.speciesId);
    const changes: Partial<EnemyDraft> = { speciesId };
    if (sp && (!e.name || e.name === prevSpecies?.name)) changes.name = sp.name;
    patch(e.key, changes);
  }

  function onLevel(e: EnemyDraft, value: string) {
    const level = Math.max(1, num(value, 1));
    const changes: Partial<EnemyDraft> = { level: value };
    if (e.autoHp) {
      changes.maxHp = String(defaultEnemyHp(level));
      changes.currentHp = String(defaultEnemyHp(level));
    }
    patch(e.key, changes);
  }

  const errors: string[] = [];
  if (playerIds.size === 0) errors.push("Choose at least one trainer.");
  enemies.forEach((e, i) => {
    if (!e.name.trim() && !e.speciesId) errors.push(`Enemy ${i + 1}: pick a species or type a name.`);
    if (num(e.maxHp) < 1) errors.push(`Enemy ${i + 1}: max KP must be at least 1.`);
    if (num(e.currentHp) < 1 || num(e.currentHp) > num(e.maxHp)) errors.push(`Enemy ${i + 1}: current KP must be between 1 and max KP.`);
  });

  function handleSubmit() {
    if (errors.length) return;
    const payload: EnemyDraftPayload[] = enemies.map((e) => ({
      species_id: e.speciesId ? Number(e.speciesId) : null,
      name: e.name.trim(),
      level: Math.max(1, num(e.level, 1)),
      max_hp: num(e.maxHp),
      current_hp: num(e.currentHp),
    }));
    create.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        playerIds: [...playerIds],
        enemies: payload,
      },
      {
        onSuccess: (id) => {
          toast("Encounter started — everyone rolls for initiative first", "success");
          reset();
          onCreated(id);
        },
      }
    );
  }

  return (
    <AdminModal open={open} title="New battle encounter" onClose={onClose} width="max-w-4xl">
      <div className="space-y-5">
        {/* Basics */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={adminLabel}>Encounter name (optional)</label>
            <input className={adminInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="Defaults to “Wild <enemy>”" />
          </div>
          <div>
            <label className={adminLabel}>Description (optional)</label>
            <input className={adminInput} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Crystal Cave, floor 3" />
          </div>
        </div>

        {/* Players */}
        <section>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <label className={`${adminLabel} !mb-0 flex items-center gap-1.5`}>
              <Users className="h-3.5 w-3.5" /> Trainers ({playerIds.size} selected)
            </label>
            <div className="flex items-center gap-2">
              <input className={`${adminInput} !w-40 !py-1 text-xs`} placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <button
                type="button"
                className="text-xs text-volt hover:underline"
                onClick={() => setPlayerIds(new Set(trainers.filter((t) => t.role !== "admin" && !busyIds?.has(t.id)).map((t) => t.id)))}
              >
                All trainers
              </button>
              <button type="button" className="text-xs text-slate-400 hover:underline" onClick={() => setPlayerIds(new Set())}>
                Clear
              </button>
            </div>
          </div>
          <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-white/10 bg-white/[0.03] p-2">
            {trainers.map((t) => {
              const busy = busyIds?.has(t.id);
              const on = playerIds.has(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={busy}
                  onClick={() => togglePlayer(t.id)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    on ? "bg-volt text-screen-ink" : "bg-white/5 text-slate-300 hover:bg-white/10",
                    busy && "cursor-not-allowed opacity-40"
                  )}
                  title={busy ? "Already in an active battle" : undefined}
                >
                  {t.username}
                  {t.role === "admin" ? " (GM)" : ""}
                  {busy ? " · in battle" : ""}
                </button>
              );
            })}
            {trainers.length === 0 ? <p className="text-xs text-slate-500">No trainers match.</p> : null}
          </div>
        </section>

        {/* Enemies */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <label className={`${adminLabel} !mb-0`}>Enemy Pokémon ({enemies.length}/6)</label>
            <button
              type="button"
              disabled={enemies.length >= 6}
              onClick={() => setEnemies((l) => [...l, newEnemy(num(l[l.length - 1]?.level, 5))])}
              className={`${adminButtonSecondary} flex items-center gap-1 !px-3 !py-1 text-xs`}
            >
              <Plus className="h-3.5 w-3.5" /> Add enemy
            </button>
          </div>

          {enemies.map((e, idx) => (
            <EnemyEditor
              key={e.key}
              index={idx}
              enemy={e}
              species={species}
              canRemove={enemies.length > 1}
              canDuplicate={enemies.length < 6}
              onPatch={(c) => patch(e.key, c)}
              onSpecies={(v) => onSpecies(e, v)}
              onLevel={(v) => onLevel(e, v)}
              onRemove={() => setEnemies((l) => l.filter((x) => x.key !== e.key))}
              onDuplicate={() => setEnemies((l) => [...l.slice(0, idx + 1), { ...e, key: `e${++keySeq}` }, ...l.slice(idx + 1)])}
            />
          ))}
        </section>

        <p className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400">
          When the encounter starts, every trainer rolls a d20 on their phone and you enter one roll per enemy. Turns go from the highest roll
          down; on an enemy&apos;s turn you pick its target and type the damage (0 = miss) in the battle monitor.
        </p>

        {errors.length && (playerIds.size > 0 || enemies.some((e) => e.speciesId || e.name)) ? (
          <ul className="space-y-0.5 text-xs text-amber-300">
            {errors.map((er) => (
              <li key={er}>• {er}</li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4">
          <button type="button" className={adminButtonSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={`${adminButtonPrimary} flex items-center gap-1.5`} disabled={errors.length > 0 || create.isPending} onClick={handleSubmit}>
            <Sparkles className="h-4 w-4" />
            {create.isPending ? "Starting…" : `Start encounter${playerIds.size ? ` (${playerIds.size} trainer${playerIds.size > 1 ? "s" : ""})` : ""}`}
          </button>
        </div>
      </div>
    </AdminModal>
  );
}

function EnemyEditor({
  index,
  enemy: e,
  species,
  canRemove,
  canDuplicate,
  onPatch,
  onSpecies,
  onLevel,
  onRemove,
  onDuplicate,
}: {
  index: number;
  enemy: EnemyDraft;
  species: ReturnType<typeof useSpecies>["data"];
  canRemove: boolean;
  canDuplicate: boolean;
  onPatch: (c: Partial<EnemyDraft>) => void;
  onSpecies: (v: string) => void;
  onLevel: (v: string) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const sp = e.speciesId ? species?.find((s) => String(s.id) === e.speciesId) : null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0e1220] p-3">
      <div className="flex gap-3">
        <div className="hidden h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-white/5 sm:flex">
          <BattleSprite speciesId={e.speciesId ? Number(e.speciesId) : null} alt={e.name} className="h-20 w-20" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <span className="mb-2 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">#{index + 1}</span>
            <div className="min-w-[150px] flex-1">
              <p className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-500">Species</p>
              <SpeciesSearch
                value={e.speciesId ? Number(e.speciesId) : null}
                onChange={(id) => onSpecies(id ? String(id) : "")}
                allowClear
                clearLabel="Custom (no sprite)"
                placeholder="Search Pokémon… (empty = custom)"
              />
            </div>
            <div className="min-w-[120px] flex-1">
              <p className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-500">Name</p>
              <input className={`${adminInput} !py-1.5`} value={e.name} onChange={(ev) => onPatch({ name: ev.target.value })} placeholder="Garchomp" />
            </div>
            <div className="w-16">
              <p className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-500">Level</p>
              <input className={`${adminInput} !px-2 !py-1.5`} inputMode="numeric" value={e.level} onChange={(ev) => onLevel(ev.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="w-20">
              <p className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-500">Max KP</p>
              <input
                className={`${adminInput} !px-2 !py-1.5`}
                inputMode="numeric"
                value={e.maxHp}
                onChange={(ev) => {
                  const v = ev.target.value.replace(/\D/g, "");
                  onPatch({ maxHp: v, currentHp: e.currentHp === e.maxHp ? v : e.currentHp, autoHp: false });
                }}
              />
            </div>
            <div className="w-20">
              <p className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-500">Current KP</p>
              <input className={`${adminInput} !px-2 !py-1.5`} inputMode="numeric" value={e.currentHp} onChange={(ev) => onPatch({ currentHp: ev.target.value.replace(/\D/g, ""), autoHp: false })} />
            </div>
            <div className="mb-1 flex gap-1">
              <button type="button" title="Duplicate" disabled={!canDuplicate} onClick={onDuplicate} className="rounded p-1.5 text-slate-400 hover:bg-white/5 disabled:opacity-30">
                <Copy className="h-4 w-4" />
              </button>
              <button type="button" title="Remove" disabled={!canRemove} onClick={onRemove} className="rounded p-1.5 text-slate-400 hover:bg-white/5 hover:text-rotom-red-light disabled:opacity-30">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          {sp ? (
            <div className="flex gap-1">
              <TypePill type={sp.type1} />
              <TypePill type={sp.type2} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
