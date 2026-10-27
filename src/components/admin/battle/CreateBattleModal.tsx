import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Plus, Sparkles, Trash2, Users, Wand2 } from "lucide-react";
import { AdminModal } from "@/components/admin/AdminModal";
import { adminButtonPrimary, adminButtonSecondary, adminInput, adminLabel } from "@/components/admin/adminStyles";
import { MoveOptions } from "@/components/admin/battle/PokemonBattleSetupPanel";
import { BattleSprite, TypePill } from "@/components/battle/BattleBits";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { POKEMON_TYPES, defaultEnemyHp, estimateDamage, pokemonStat, typeLabel } from "@/lib/battle";
import { useAllProfiles } from "@/hooks/useAdmin";
import { useSpecies } from "@/hooks/useBag";
import { useGameConfig } from "@/hooks/useBattle";
import { fetchSuggestedMoves, useAdminCreateBattle, useMoves, type EnemyDraftPayload } from "@/hooks/useEncounter";
import type { Move, PokemonType } from "@/types/database.types";

interface EnemyDraft {
  key: string;
  speciesId: string;
  name: string;
  level: string;
  maxHp: string;
  currentHp: string;
  attack: string;
  defense: string;
  spAttack: string;
  spDefense: string;
  speed: string;
  type1: string;
  type2: string;
  moves: string[];
  autoStats: boolean;
  autoHp: boolean;
  autoMoves: boolean;
}

const DAMAGE_PRESETS = [
  { value: 0.25, label: "Gentle", hint: "×0.25" },
  { value: 0.5, label: "Light", hint: "×0.5" },
  { value: 1, label: "Normal", hint: "×1" },
  { value: 1.5, label: "Brutal", hint: "×1.5" },
];

let keySeq = 0;
function newEnemy(level = 5): EnemyDraft {
  const stat = String(pokemonStat(level));
  return {
    key: `e${++keySeq}`,
    speciesId: "",
    name: "",
    level: String(level),
    maxHp: String(defaultEnemyHp(level)),
    currentHp: String(defaultEnemyHp(level)),
    attack: stat,
    defense: stat,
    spAttack: stat,
    spDefense: stat,
    speed: stat,
    type1: "normal",
    type2: "",
    moves: ["", "", "", ""],
    autoStats: true,
    autoHp: true,
    autoMoves: true,
  };
}

const num = (v: string, fallback = 0) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fallback;
};

export function CreateBattleModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { data: profiles } = useAllProfiles();
  const { data: species } = useSpecies();
  const { data: moves } = useMoves();
  const { data: config } = useGameConfig();
  const create = useAdminCreateBattle();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [playerIds, setPlayerIds] = React.useState<Set<string>>(new Set());
  const [search, setSearch] = React.useState("");
  const [enemies, setEnemies] = React.useState<EnemyDraft[]>(() => [newEnemy()]);
  const [autoAttack, setAutoAttack] = React.useState(true);
  const [damageScale, setDamageScale] = React.useState(1);

  const reset = React.useCallback(() => {
    setName("");
    setDescription("");
    setPlayerIds(new Set());
    setSearch("");
    setEnemies([newEnemy()]);
    setAutoAttack(true);
    setDamageScale(1);
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

  // Selected trainers' party, for the damage preview.
  const selectedKey = [...playerIds].sort().join(",");
  const { data: partyStats } = useQuery({
    queryKey: ["admin", "party_stats", selectedKey],
    enabled: open && playerIds.size > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trainer_pokemon")
        .select("level, max_hp")
        .in("profile_id", [...playerIds])
        .not("party_slot", "is", null)
        .eq("is_dead", false);
      if (error) throw error;
      const rows = data ?? [];
      if (!rows.length) return null;
      return {
        avgLevel: Math.round(rows.reduce((s, r) => s + r.level, 0) / rows.length),
        minHp: Math.min(...rows.map((r) => r.max_hp)),
        maxHp: Math.max(...rows.map((r) => r.max_hp)),
      };
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

  async function suggestMoves(key: string, t1: string, t2: string, level: number) {
    try {
      const suggested = await fetchSuggestedMoves(t1 || "normal", t2 || null, level);
      const ids = suggested.map((m) => String(m.id));
      setEnemies((list) =>
        list.map((e) => (e.key === key ? { ...e, moves: [0, 1, 2, 3].map((i) => ids[i] ?? ""), autoMoves: true } : e))
      );
    } catch {
      // leave moves as they are; the server falls back to defaults anyway
    }
  }

  function onSpecies(e: EnemyDraft, speciesId: string) {
    const sp = species?.find((s) => String(s.id) === speciesId);
    const prevSpecies = species?.find((s) => String(s.id) === e.speciesId);
    const changes: Partial<EnemyDraft> = { speciesId };
    if (sp) {
      if (!e.name || e.name === prevSpecies?.name) changes.name = sp.name;
      changes.type1 = sp.type1 ?? "normal";
      changes.type2 = sp.type2 ?? "";
    }
    patch(e.key, changes);
    if (e.autoMoves) suggestMoves(e.key, changes.type1 ?? e.type1, changes.type2 ?? e.type2, num(e.level, 5));
  }

  function onLevel(e: EnemyDraft, value: string) {
    const level = Math.max(1, num(value, 1));
    const changes: Partial<EnemyDraft> = { level: value };
    if (e.autoStats) {
      const s = String(pokemonStat(level));
      Object.assign(changes, { attack: s, defense: s, spAttack: s, spDefense: s, speed: s });
    }
    if (e.autoHp) {
      changes.maxHp = String(defaultEnemyHp(level));
      changes.currentHp = String(defaultEnemyHp(level));
    }
    patch(e.key, changes);
    if (e.autoMoves && value) suggestMoves(e.key, e.type1, e.type2, level);
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
      attack: Math.max(1, num(e.attack, 1)),
      defense: Math.max(1, num(e.defense, 1)),
      sp_attack: Math.max(1, num(e.spAttack, 1)),
      sp_defense: Math.max(1, num(e.spDefense, 1)),
      speed: Math.max(1, num(e.speed, 1)),
      type1: e.type1,
      type2: e.type2 || null,
      move_ids: e.moves.filter(Boolean).map(Number),
    }));
    create.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        playerIds: [...playerIds],
        enemies: payload,
        enemyAutoAttack: autoAttack,
        enemyDamageScale: damageScale,
      },
      {
        onSuccess: (id) => {
          toast("Encounter started — the trainers' battle screens are opening", "success");
          reset();
          onCreated(id);
        },
      }
    );
  }

  const baseScale = config?.damageScale ?? 5;

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
              speciesList={species ?? []}
              moves={moves}
              partyStats={partyStats ?? null}
              baseScale={baseScale}
              enemyScale={damageScale}
              canRemove={enemies.length > 1}
              canDuplicate={enemies.length < 6}
              onPatch={(c) => patch(e.key, c)}
              onSpecies={(v) => onSpecies(e, v)}
              onLevel={(v) => onLevel(e, v)}
              onSuggestMoves={() => suggestMoves(e.key, e.type1, e.type2, num(e.level, 5))}
              onRemove={() => setEnemies((l) => l.filter((x) => x.key !== e.key))}
              onDuplicate={() => setEnemies((l) => [...l.slice(0, idx + 1), { ...e, key: `e${++keySeq}` }, ...l.slice(idx + 1)])}
            />
          ))}
        </section>

        {/* Behaviour */}
        <section className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-200">
            <input type="checkbox" className="mt-0.5 accent-[rgb(255,210,63)]" checked={autoAttack} onChange={(e) => setAutoAttack(e.target.checked)} />
            <span>
              Enemies fight back automatically
              <span className="block text-xs text-slate-500">
                After each trainer action, an enemy counter-attacks. Turn off to trigger enemy attacks yourself.
              </span>
            </span>
          </label>
          <div>
            <p className="mb-1 text-sm text-slate-200">Enemy damage</p>
            <div className="flex flex-wrap gap-1.5">
              {DAMAGE_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setDamageScale(p.value)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium",
                    damageScale === p.value ? "bg-volt text-screen-ink" : "bg-white/5 text-slate-300 hover:bg-white/10"
                  )}
                >
                  {p.label} <span className="opacity-60">{p.hint}</span>
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">Scales only what enemies deal to trainers&apos; Pokémon.</p>
          </div>
        </section>

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
  speciesList,
  moves,
  partyStats,
  baseScale,
  enemyScale,
  canRemove,
  canDuplicate,
  onPatch,
  onSpecies,
  onLevel,
  onSuggestMoves,
  onRemove,
  onDuplicate,
}: {
  index: number;
  enemy: EnemyDraft;
  speciesList: { id: number; name: string; type1: PokemonType | null; type2: PokemonType | null }[];
  moves: Move[] | undefined;
  partyStats: { avgLevel: number; minHp: number; maxHp: number } | null;
  baseScale: number;
  enemyScale: number;
  canRemove: boolean;
  canDuplicate: boolean;
  onPatch: (c: Partial<EnemyDraft>) => void;
  onSpecies: (v: string) => void;
  onLevel: (v: string) => void;
  onSuggestMoves: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const level = Math.max(1, num(e.level, 1));
  const chosenMoves = e.moves.map((id) => moves?.find((m) => String(m.id) === id)).filter(Boolean) as Move[];

  // Preview: this enemy's strongest move against an average trainer Pokémon,
  // and a typical trainer hit against this enemy.
  const preview = React.useMemo(() => {
    const defLevel = partyStats?.avgLevel ?? level;
    const best = chosenMoves
      .map((m) => {
        const stab = m.type === e.type1 || m.type === e.type2;
        const atk = m.category === "physical" ? num(e.attack, 1) : num(e.spAttack, 1);
        return estimateDamage({ level, power: m.power, attack: atk, defense: pokemonStat(defLevel), scale: baseScale * enemyScale, stab });
      })
      .sort((a, b) => b - a)[0];
    const trainerHit = estimateDamage({
      level: defLevel,
      power: 80,
      attack: pokemonStat(defLevel),
      defense: Math.min(num(e.defense, 1), num(e.spDefense, 1)) || 1,
      scale: baseScale,
      stab: true,
    });
    return { enemyHit: best ?? null, trainerHit, hitsToKo: Math.ceil(num(e.currentHp, 1) / Math.max(trainerHit, 1)) };
  }, [chosenMoves, e.type1, e.type2, e.attack, e.spAttack, e.defense, e.spDefense, e.currentHp, level, partyStats, baseScale, enemyScale]);

  const statField = (label: string, key: "attack" | "defense" | "spAttack" | "spDefense" | "speed") => (
    <div>
      <p className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <input className={`${adminInput} !px-2 !py-1.5`} inputMode="numeric" value={e[key]} onChange={(ev) => onPatch({ [key]: ev.target.value.replace(/\D/g, ""), autoStats: false } as Partial<EnemyDraft>)} />
    </div>
  );

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
              <select className={`${adminInput} !py-1.5`} value={e.speciesId} onChange={(ev) => onSpecies(ev.target.value)}>
                <option value="">Custom (no sprite)</option>
                {speciesList.map((s) => (
                  <option key={s.id} value={s.id}>
                    #{s.id} {s.name}
                  </option>
                ))}
              </select>
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

          <div className="flex flex-wrap items-end gap-2">
            <div className="w-28">
              <p className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-500">Type</p>
              <select className={`${adminInput} !py-1.5`} value={e.type1} onChange={(ev) => onPatch({ type1: ev.target.value })}>
                {POKEMON_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {typeLabel(t)}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-28">
              <p className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-500">2nd type</p>
              <select className={`${adminInput} !py-1.5`} value={e.type2} onChange={(ev) => onPatch({ type2: ev.target.value })}>
                <option value="">—</option>
                {POKEMON_TYPES.filter((t) => t !== e.type1).map((t) => (
                  <option key={t} value={t}>
                    {typeLabel(t)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid flex-1 grid-cols-5 gap-1.5">
              {statField("Atk", "attack")}
              {statField("Def", "defense")}
              {statField("SpA", "spAttack")}
              {statField("SpD", "spDefense")}
              {statField("Spe", "speed")}
            </div>
          </div>

          <div>
            <div className="mb-0.5 flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Moves {e.autoMoves ? "· suggested" : ""}</p>
              <button type="button" onClick={onSuggestMoves} className="flex items-center gap-1 text-[11px] text-volt hover:underline">
                <Wand2 className="h-3 w-3" /> Suggest for type & level
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {e.moves.map((id, i) => (
                <select
                  key={i}
                  className={`${adminInput} !px-2 !py-1.5 text-xs`}
                  value={id}
                  onChange={(ev) => onPatch({ moves: e.moves.map((v, k) => (k === i ? ev.target.value : v)), autoMoves: false })}
                >
                  <option value="">— none —</option>
                  <MoveOptions moves={moves} />
                </select>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-slate-400">
            <span className="flex gap-1">
              <TypePill type={e.type1 as PokemonType} />
              {e.type2 ? <TypePill type={e.type2 as PokemonType} /> : null}
            </span>
            {preview.enemyHit !== null ? (
              <span>
                Hits trainers for ≈ <b className="text-slate-200">{preview.enemyHit} KP</b>
                {partyStats ? (
                  <>
                    {" "}
                    (their Pokémon: Lv~{partyStats.avgLevel}, {partyStats.minHp}–{partyStats.maxHp} KP)
                  </>
                ) : null}
              </span>
            ) : (
              <span>No moves chosen — defaults for its type are used.</span>
            )}
            <span>
              Typical trainer hit ≈ <b className="text-slate-200">{preview.trainerHit}</b> → ~{preview.hitsToKo} hits to defeat
            </span>
            {preview.enemyHit !== null && partyStats && preview.enemyHit >= partyStats.minHp ? (
              <span className="w-full text-amber-300">
                ⚠️ One hit would knock out their weakest Pokémon ({partyStats.minHp} KP). Consider a gentler “Enemy damage” setting below or lower Atk/SpA.
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
