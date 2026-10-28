import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Copy, Leaf, Plus, Search, Shield, Sparkles, Trash2, User, Users } from "lucide-react";
import { AdminModal } from "@/components/admin/AdminModal";
import { adminButtonPrimary, adminButtonSecondary, adminInput, adminLabel } from "@/components/admin/adminStyles";
import { BattleSprite } from "@/components/battle/BattleBits";
import { SpeciesSearch } from "@/components/phone/SpeciesSearch";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { defaultEnemyHp } from "@/lib/battle";
import { useAllProfiles } from "@/hooks/useAdmin";
import { useSpecies } from "@/hooks/useBag";
import { useGameConfig } from "@/hooks/useBattle";
import {
  entriesFromRows,
  useGmPokemon,
  useGmTeams,
  useGmTrainers,
  useSaveEncounterTemplate,
  useStartEncounter,
  type EncounterDraft,
  type TemplateWithEntries,
} from "@/hooks/useEncounterManager";
import { ENCOUNTER_KINDS, type EncounterEntry, type EncounterKind } from "@/types/database.types";

/** Trainers already in an active encounter can't be put in a second one. */
export function useBusyPlayers(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "busy_players"],
    enabled,
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
}

/** Player chips (who fights). */
export function PlayerPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { data: profiles } = useAllProfiles();
  const { data: busy } = useBusyPlayers(true);
  const trainers = (profiles ?? []).filter((p) => p.role === "trainer").sort((a, b) => a.username.localeCompare(b.username));
  const set = new Set(value);
  return (
    <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-white/10 bg-white/[0.03] p-2">
      {trainers.map((t) => {
        const on = set.has(t.id);
        const isBusy = busy?.has(t.id);
        return (
          <button
            key={t.id}
            type="button"
            disabled={isBusy && !on}
            onClick={() => onChange(on ? value.filter((x) => x !== t.id) : [...value, t.id])}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium",
              on ? "bg-volt text-screen-ink" : "bg-white/5 text-slate-300 hover:bg-white/10",
              isBusy && "opacity-50"
            )}
            title={isBusy ? "Already in an active battle" : undefined}
          >
            {t.username}
            {isBusy ? " · in battle" : ""}
          </button>
        );
      })}
      {trainers.length === 0 ? <p className="text-xs text-slate-500">No trainers yet.</p> : null}
    </div>
  );
}

const EMPTY: EncounterDraft = { name: "", description: "", kind: "wild", catchingAllowed: true, playerIds: [], entries: [] };

/**
 * Create or edit an encounter (PokéGear 13). The same editor makes a quick
 * encounter (start right now, nothing saved) or a saved/story encounter
 * (start it later from "Saved", as often as you like).
 */
export function EncounterEditor({
  open,
  template,
  onClose,
  onStarted,
  onSaved,
}: {
  open: boolean;
  /** Edit this saved encounter (null = new). */
  template: TemplateWithEntries | null;
  onClose: () => void;
  onStarted: (encounterId: string) => void;
  onSaved?: (templateId: string) => void;
}) {
  const [draft, setDraft] = React.useState<EncounterDraft>(EMPTY);
  const [error, setError] = React.useState<string | null>(null);
  const save = useSaveEncounterTemplate();
  const start = useStartEncounter();
  const busy = save.isPending || start.isPending;

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setDraft(
      template
        ? {
            name: template.name,
            description: template.description ?? "",
            kind: template.kind,
            catchingAllowed: template.catching_allowed,
            playerIds: template.default_player_ids,
            entries: entriesFromRows(template.entries),
          }
        : EMPTY
    );
  }, [open, template]);

  const patch = (c: Partial<EncounterDraft>) => setDraft((d) => ({ ...d, ...c }));

  function fail(e: unknown) {
    setError(e instanceof Error ? e.message : "That didn't work.");
  }

  function doSave(thenStart: boolean) {
    setError(null);
    if (!draft.name.trim()) return setError("Give the encounter a name to save it.");
    if (!draft.entries.length) return setError("Add at least one trainer, team or Pokémon.");
    save.mutate(
      { id: template?.id ?? null, draft },
      {
        onSuccess: (id) => {
          toast(template ? "Encounter saved" : "Encounter saved — find it under Saved", "success");
          onSaved?.(id);
          if (!thenStart) return onClose();
          if (!draft.playerIds.length) return setError("Saved. Choose who fights to start it.");
          start.mutate(
            { templateId: id, playerIds: draft.playerIds },
            {
              onSuccess: (encId) => {
                toast("Encounter started — everyone rolls for initiative", "success");
                onStarted(encId);
              },
              onError: fail,
            }
          );
        },
        onError: fail,
      }
    );
  }

  function doQuickStart() {
    setError(null);
    if (!draft.entries.length) return setError("Add at least one trainer, team or Pokémon.");
    if (!draft.playerIds.length) return setError("Choose who fights.");
    start.mutate(
      {
        templateId: null,
        name: draft.name || null,
        description: draft.description || null,
        kind: draft.kind,
        catchingAllowed: draft.catchingAllowed,
        playerIds: draft.playerIds,
        entries: draft.entries,
      },
      {
        onSuccess: (encId) => {
          toast("Encounter started — everyone rolls for initiative", "success");
          onStarted(encId);
        },
        onError: fail,
      }
    );
  }

  return (
    <AdminModal open={open} title={template ? `Edit “${template.name}”` : "Create encounter"} onClose={onClose} width="max-w-4xl">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={adminLabel}>Name {template ? "" : "(needed to save)"}</label>
            <input className={adminInput} value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Pewter Gym Battle" maxLength={80} />
          </div>
          <div>
            <label className={adminLabel}>Type</label>
            <select className={adminInput} value={draft.kind} onChange={(e) => patch({ kind: e.target.value as EncounterKind })}>
              {ENCOUNTER_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={adminLabel}>Description (optional)</label>
            <input className={adminInput} value={draft.description} onChange={(e) => patch({ description: e.target.value })} placeholder="First Gym battle against Brock." />
          </div>
        </div>

        <div>
          <label className={adminLabel}>Can players catch Pokémon in this encounter?</label>
          <div className="flex gap-1.5">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => patch({ catchingAllowed: v })}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs font-semibold",
                  draft.catchingAllowed === v ? "bg-volt text-screen-ink" : "bg-white/5 text-slate-300 hover:bg-white/10"
                )}
              >
                {v ? "Yes" : "No"}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Only wild Pokémon can ever be caught; you decide each attempt.</p>
        </div>

        <div>
          <label className={adminLabel}>
            <Users className="mr-1 inline h-3.5 w-3.5" />
            Who fights {template ? "(default — you can change it when starting)" : ""}
          </label>
          <PlayerPicker value={draft.playerIds} onChange={(ids) => patch({ playerIds: ids })} />
        </div>

        <EntriesBuilder entries={draft.entries} onChange={(entries) => patch({ entries })} />

        {error ? <p className="rounded-lg bg-rotom-red/15 px-3 py-2 text-xs text-rotom-red-light">{error}</p> : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4">
          <button type="button" className={adminButtonSecondary} onClick={onClose}>
            Cancel
          </button>
          {!template ? (
            <button type="button" className={`${adminButtonSecondary} flex items-center gap-1.5`} disabled={busy} onClick={doQuickStart}>
              <Sparkles className="h-4 w-4" /> Start now (don&apos;t save)
            </button>
          ) : null}
          <button type="button" className={adminButtonSecondary} disabled={busy} onClick={() => doSave(false)}>
            {template ? "Save changes" : "Save for later"}
          </button>
          <button type="button" className={`${adminButtonPrimary} flex items-center gap-1.5`} disabled={busy} onClick={() => doSave(true)}>
            <Sparkles className="h-4 w-4" /> {busy ? "Working…" : "Save & start"}
          </button>
        </div>
      </div>
    </AdminModal>
  );
}

// ---------------------------------------------------------------------------
// The list of trainers / teams / Pokémon in an encounter
// ---------------------------------------------------------------------------
type Adding = null | "trainer" | "team" | "pokemon" | "wild";

export function EntriesBuilder({ entries, onChange }: { entries: EncounterEntry[]; onChange: (e: EncounterEntry[]) => void }) {
  const { data: trainers } = useGmTrainers();
  const { data: teams } = useGmTeams();
  const { data: library } = useGmPokemon();
  const { data: species } = useSpecies();
  const [adding, setAdding] = React.useState<Adding>(null);

  const trainerName = (id: string) => trainers?.find((t) => t.id === id)?.name ?? "(deleted trainer)";
  const teamOf = (id: string | null | undefined) => (id ? teams?.find((t) => t.id === id) ?? null : null);
  const speciesName = (id: number | null | undefined) => (id ? species?.find((s) => s.id === id)?.name ?? `#${id}` : null);

  function countOf(e: EncounterEntry): number {
    if (e.kind === "wild") return e.quantity;
    if (e.kind === "pokemon") return 1;
    if (e.kind === "team") return teamOf(e.team_id)?.members.length ?? 0;
    const team = teamOf(e.team_id) ?? teams?.find((t) => t.trainer_id === e.trainer_id) ?? null;
    return team ? team.members.length : (library ?? []).filter((p) => p.trainer_id === e.trainer_id).length;
  }

  function describe(e: EncounterEntry): { icon: React.ReactNode; title: string; detail: string } {
    switch (e.kind) {
      case "trainer": {
        const team = teamOf(e.team_id);
        return { icon: <User className="h-4 w-4 text-rotom-red-light" />, title: trainerName(e.trainer_id), detail: team ? `with ${team.name}` : "with their first team" };
      }
      case "team": {
        const team = teamOf(e.team_id);
        const tr = team?.trainer_id ? trainerName(team.trainer_id) : null;
        return { icon: <Shield className="h-4 w-4 text-amber-300" />, title: team?.name ?? "(deleted team)", detail: tr ? `${tr}'s team` : "wild Pokémon (no trainer)" };
      }
      case "pokemon": {
        const p = library?.find((x) => x.id === e.gm_pokemon_id);
        return { icon: <Leaf className="h-4 w-4 text-emerald-300" />, title: p ? p.name : "(deleted Pokémon)", detail: p ? `Lv${p.level} · ${p.max_hp} KP · from your library (wild)` : "" };
      }
      default:
        return {
          icon: <Leaf className="h-4 w-4 text-emerald-300" />,
          title: `${e.quantity > 1 ? `${e.quantity} × ` : ""}${e.name || speciesName(e.species_id) || "Pokémon"}`,
          detail: `Wild · Lv${e.level} · ${e.max_hp} KP each`,
        };
    }
  }

  const total = entries.reduce((s, e) => s + countOf(e), 0);
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= entries.length) return;
    const next = [...entries];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className={`${adminLabel} !mb-0`}>
          Enemies · {entries.length} entr{entries.length === 1 ? "y" : "ies"} · {total} Pokémon
        </label>
        <div className="flex flex-wrap gap-1.5">
          {(["trainer", "team", "pokemon", "wild"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setAdding(adding === k ? null : k)}
              className={cn(`${adminButtonSecondary} flex items-center gap-1 !px-3 !py-1 text-xs`, adding === k && "!bg-volt !text-screen-ink")}
            >
              <Plus className="h-3.5 w-3.5" />
              {k === "trainer" ? "Trainer" : k === "team" ? "Team" : k === "pokemon" ? "From library" : "Wild Pokémon"}
            </button>
          ))}
        </div>
      </div>

      {adding === "trainer" ? (
        <AddTrainer
          onAdd={(e) => {
            onChange([...entries, e]);
            setAdding(null);
          }}
        />
      ) : adding === "team" ? (
        <AddTeam
          onAdd={(e) => {
            onChange([...entries, e]);
            setAdding(null);
          }}
        />
      ) : adding === "pokemon" ? (
        <AddFromLibrary onAdd={(ids) => onChange([...entries, ...ids.map((id): EncounterEntry => ({ kind: "pokemon", gm_pokemon_id: id }))])} onDone={() => setAdding(null)} />
      ) : adding === "wild" ? (
        <AddWild onAdd={(e) => onChange([...entries, e])} />
      ) : null}

      <div className="space-y-1.5">
        {entries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-xs text-slate-500">
            Nothing yet — add trainers (with their team), teams, Pokémon from your library, or quick wild Pokémon.
          </p>
        ) : null}
        {entries.map((e, i) => {
          const d = describe(e);
          return (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
              {d.icon}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-100">{d.title}</p>
                <p className="truncate text-[11px] text-slate-400">
                  {d.detail} · {countOf(e)} Pokémon
                </p>
              </div>
              <button type="button" title="Move up" onClick={() => move(i, -1)} className="rounded p-1 text-slate-400 hover:bg-white/5 disabled:opacity-30" disabled={i === 0}>
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Move down"
                onClick={() => move(i, 1)}
                className="rounded p-1 text-slate-400 hover:bg-white/5 disabled:opacity-30"
                disabled={i === entries.length - 1}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button type="button" title="Duplicate" onClick={() => onChange([...entries.slice(0, i + 1), e, ...entries.slice(i + 1)])} className="rounded p-1 text-slate-400 hover:bg-white/5">
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button type="button" title="Remove" onClick={() => onChange(entries.filter((_, k) => k !== i))} className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-rotom-red-light">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AddTrainer({ onAdd }: { onAdd: (e: EncounterEntry) => void }) {
  const { data: trainers } = useGmTrainers();
  const { data: teams } = useGmTeams();
  const [trainerId, setTrainerId] = React.useState("");
  const [teamId, setTeamId] = React.useState("");
  const theirTeams = (teams ?? []).filter((t) => t.trainer_id === trainerId);
  if (!trainers?.length) return <p className="rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-400">No trainers yet — create one in the Trainers tab.</p>;
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg bg-white/[0.04] p-3">
      <div className="min-w-[160px] flex-1">
        <label className={adminLabel}>Trainer</label>
        <select className={adminInput} value={trainerId} onChange={(e) => {
            setTrainerId(e.target.value);
            setTeamId("");
          }}>
          <option value="">Choose…</option>
          {trainers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.is_active ? "" : " (inactive)"}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-[160px] flex-1">
        <label className={adminLabel}>Team</label>
        <select className={adminInput} value={teamId} onChange={(e) => setTeamId(e.target.value)} disabled={!trainerId}>
          <option value="">{theirTeams.length ? "Their first team" : "Their Pokémon (no team)"}</option>
          {(teams ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.members.length})
            </option>
          ))}
        </select>
      </div>
      <button type="button" className={adminButtonPrimary} disabled={!trainerId} onClick={() => onAdd({ kind: "trainer", trainer_id: trainerId, team_id: teamId || null })}>
        Add
      </button>
    </div>
  );
}

function AddTeam({ onAdd }: { onAdd: (e: EncounterEntry) => void }) {
  const { data: teams } = useGmTeams();
  const [teamId, setTeamId] = React.useState("");
  if (!teams?.length) return <p className="rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-400">No teams yet — create one in the Teams tab.</p>;
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg bg-white/[0.04] p-3">
      <div className="min-w-[200px] flex-1">
        <label className={adminLabel}>Team (a team with a trainer fights as that trainer; without one it&apos;s wild Pokémon)</label>
        <select className={adminInput} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">Choose…</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.members.length})
            </option>
          ))}
        </select>
      </div>
      <button type="button" className={adminButtonPrimary} disabled={!teamId} onClick={() => onAdd({ kind: "team", team_id: teamId })}>
        Add
      </button>
    </div>
  );
}

function AddFromLibrary({ onAdd, onDone }: { onAdd: (ids: string[]) => void; onDone: () => void }) {
  const { data: library } = useGmPokemon();
  const { data: species } = useSpecies();
  const [query, setQuery] = React.useState("");
  const [picked, setPicked] = React.useState<string[]>([]);
  const q = query.trim().toLowerCase();
  const list = (library ?? []).filter((p) => {
    if (!q) return true;
    const sp = species?.find((s) => s.id === p.species_id)?.name.toLowerCase() ?? "";
    return p.name.toLowerCase().includes(q) || sp.includes(q) || String(p.species_id ?? "") === q.replace(/^#/, "");
  });
  if (!library?.length) return <p className="rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-400">Your library is empty — create Pokémon in the Pokémon tab.</p>;
  return (
    <div className="space-y-2 rounded-lg bg-white/[0.04] p-3">
      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5">
        <Search className="h-4 w-4 text-slate-500" />
        <input className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or species" />
      </div>
      <div className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
        {list.slice(0, 200).map((p) => {
          const on = picked.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPicked(on ? picked.filter((x) => x !== p.id) : [...picked, p.id])}
              className={cn("flex items-center gap-2 rounded-md px-2 py-1 text-left text-xs", on ? "bg-volt/20 ring-1 ring-volt/50" : "bg-white/5 hover:bg-white/10")}
            >
              <BattleSprite speciesId={p.species_id} alt={p.name} className="h-7 w-7 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-slate-100">{p.name}</span>
              <span className="font-mono text-[10px] text-slate-400">
                Lv{p.level} · {p.max_hp}KP
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className={adminButtonSecondary} onClick={onDone}>
          Close
        </button>
        <button
          type="button"
          className={adminButtonPrimary}
          disabled={!picked.length}
          onClick={() => {
            onAdd(picked);
            setPicked([]);
            onDone();
          }}
        >
          Add {picked.length || ""}
        </button>
      </div>
    </div>
  );
}

function AddWild({ onAdd }: { onAdd: (e: EncounterEntry) => void }) {
  const { data: config } = useGameConfig();
  const maxLevel = config?.maxLevel ?? 8;
  const [speciesId, setSpeciesId] = React.useState<number | null>(null);
  const [name, setName] = React.useState("");
  const [level, setLevel] = React.useState(1);
  const [hp, setHp] = React.useState(String(defaultEnemyHp(1)));
  const [qty, setQty] = React.useState("1");
  const hpN = Number(hp);
  const qtyN = Number(qty);
  const ok = (speciesId || name.trim()) && Number.isInteger(hpN) && hpN >= 1 && hpN <= 9999 && Number.isInteger(qtyN) && qtyN >= 1 && qtyN <= 50;
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg bg-white/[0.04] p-3">
      <div className="min-w-[180px] flex-1">
        <label className={adminLabel}>Pokémon</label>
        <SpeciesSearch value={speciesId} onChange={(id) => setSpeciesId(id)} />
      </div>
      <div className="w-32">
        <label className={adminLabel}>Name (optional)</label>
        <input className={adminInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="Species name" />
      </div>
      <div className="w-24">
        <label className={adminLabel}>Level</label>
        <select className={adminInput} value={level} onChange={(e) => setLevel(Number(e.target.value))}>
          {Array.from({ length: maxLevel }, (_, i) => i + 1).map((l) => (
            <option key={l} value={l}>
              Lv {l}
            </option>
          ))}
        </select>
      </div>
      <div className="w-20">
        <label className={adminLabel}>Max KP</label>
        <input className={adminInput} inputMode="numeric" value={hp} onChange={(e) => setHp(e.target.value.replace(/\D/g, ""))} />
      </div>
      <div className="w-16">
        <label className={adminLabel}>How many</label>
        <input className={adminInput} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, "").slice(0, 2))} />
      </div>
      <button
        type="button"
        className={adminButtonPrimary}
        disabled={!ok}
        onClick={() => {
          onAdd({ kind: "wild", species_id: speciesId, name: name.trim() || null, level, max_hp: hpN, quantity: qtyN });
          setQty("1");
        }}
      >
        Add
      </button>
    </div>
  );
}
