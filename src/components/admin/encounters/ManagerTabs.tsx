import * as React from "react";
import { ArrowDown, ArrowUp, Copy, Pencil, Play, Plus, Search, Trash2, X } from "lucide-react";
import { AdminModal } from "@/components/admin/AdminModal";
import { adminButtonDanger, adminButtonPrimary, adminButtonSecondary, adminInput, adminLabel } from "@/components/admin/adminStyles";
import { BattleSprite, TypePill } from "@/components/battle/BattleBits";
import { SpeciesSearch } from "@/components/phone/SpeciesSearch";
import { StatusBadge } from "@/components/phone/StatusBadge";
import { PlayerPicker } from "@/components/admin/encounters/EncounterEditor";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useSpecies } from "@/hooks/useBag";
import { useGameConfig } from "@/hooks/useBattle";
import { useAdminResolveCatch } from "@/hooks/useEncounter";
import {
  useCatchRequests,
  useDeleteEncounterTemplate,
  useDeleteLibraryItem,
  useDuplicateEncounterTemplate,
  useEncounterTemplates,
  useGmPokemon,
  useGmTeams,
  useGmTrainers,
  useSaveGmPokemon,
  useSaveGmTeam,
  useSaveGmTrainer,
  useStartEncounter,
  type GmTeamWithMembers,
  type TemplateWithEntries,
} from "@/hooks/useEncounterManager";
import { ENCOUNTER_KINDS, type EncounterKind, type GmPokemon, type GmTrainer, type PokemonStatus } from "@/types/database.types";

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="flex min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5">
      <Search className="h-4 w-4 shrink-0 text-slate-500" />
      <input className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {value ? (
        <button type="button" onClick={() => onChange("")} className="text-slate-500" aria-label="Clear">
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

const kindLabel = (k: EncounterKind) => ENCOUNTER_KINDS.find((x) => x.value === k)?.label ?? k;

// ---------------------------------------------------------------------------
// Saved encounters
// ---------------------------------------------------------------------------
export function SavedEncountersTab({ onEdit, onStarted }: { onEdit: (t: TemplateWithEntries) => void; onStarted: (encounterId: string) => void }) {
  const { data: templates, isLoading } = useEncounterTemplates();
  const duplicate = useDuplicateEncounterTemplate();
  const del = useDeleteEncounterTemplate();
  const [query, setQuery] = React.useState("");
  const [kind, setKind] = React.useState<"" | EncounterKind>("");
  const [starting, setStarting] = React.useState<TemplateWithEntries | null>(null);
  const [deleting, setDeleting] = React.useState<TemplateWithEntries | null>(null);

  const q = query.trim().toLowerCase();
  const list = (templates ?? []).filter(
    (t) => (!kind || t.kind === kind) && (!q || t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q))
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <SearchBox value={query} onChange={setQuery} placeholder="Search saved encounters" />
        <select className={`${adminInput} !w-auto`} value={kind} onChange={(e) => setKind(e.target.value as EncounterKind | "")}>
          <option value="">All types</option>
          {ENCOUNTER_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      {isLoading ? <p className="text-sm text-slate-500">Loading…</p> : null}
      {!isLoading && list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 px-3 py-8 text-center text-sm text-slate-500">
          {templates?.length ? "No saved encounter matches." : "No saved encounters yet. Use “Create encounter” → “Save for later” to prepare one."}
        </p>
      ) : null}
      <div className="grid gap-2 md:grid-cols-2">
        {list.map((t) => (
          <div key={t.id} className="rounded-xl border border-white/10 bg-[#111623] p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-100">{t.name}</p>
                <p className="text-[11px] text-slate-400">
                  {kindLabel(t.kind)} · catching {t.catching_allowed ? "allowed" : "not allowed"} · {t.entries.length} entr{t.entries.length === 1 ? "y" : "ies"}
                </p>
                {t.description ? <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{t.description}</p> : null}
                <p className="mt-0.5 text-[10px] text-slate-500">
                  {t.times_started ? `Started ${t.times_started}× · last ${new Date(t.last_started_at!).toLocaleDateString()}` : "Never started"}
                </p>
              </div>
              <button type="button" className={`${adminButtonPrimary} flex shrink-0 items-center gap-1 !px-3 !py-1.5 text-xs`} onClick={() => setStarting(t)}>
                <Play className="h-3.5 w-3.5" /> Start
              </button>
            </div>
            <div className="mt-2 flex gap-1.5">
              <button type="button" className={`${adminButtonSecondary} flex items-center gap-1 !px-2.5 !py-1 text-xs`} onClick={() => onEdit(t)}>
                <Pencil className="h-3 w-3" /> Edit
              </button>
              <button
                type="button"
                className={`${adminButtonSecondary} flex items-center gap-1 !px-2.5 !py-1 text-xs`}
                disabled={duplicate.isPending}
                onClick={() => duplicate.mutate({ id: t.id }, { onSuccess: () => toast("Encounter duplicated", "success") })}
              >
                <Copy className="h-3 w-3" /> Duplicate
              </button>
              <button type="button" className={`${adminButtonSecondary} flex items-center gap-1 !px-2.5 !py-1 text-xs hover:!text-rotom-red-light`} onClick={() => setDeleting(t)}>
                <Trash2 className="h-3 w-3" /> Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <StartTemplateDialog template={starting} onClose={() => setStarting(null)} onStarted={onStarted} />

      <AdminModal open={!!deleting} title={`Delete “${deleting?.name}”?`} onClose={() => setDeleting(null)}>
        <p className="text-sm text-slate-300">The saved setup is removed. Battles already played with it stay in the history.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={adminButtonSecondary} onClick={() => setDeleting(null)}>
            Cancel
          </button>
          <button
            type="button"
            className={adminButtonDanger}
            disabled={del.isPending}
            onClick={() =>
              del.mutate(
                { id: deleting!.id },
                {
                  onSuccess: () => {
                    toast("Saved encounter deleted", "success");
                    setDeleting(null);
                  },
                }
              )
            }
          >
            Delete
          </button>
        </div>
      </AdminModal>
    </div>
  );
}

function StartTemplateDialog({ template, onClose, onStarted }: { template: TemplateWithEntries | null; onClose: () => void; onStarted: (id: string) => void }) {
  const start = useStartEncounter();
  const [players, setPlayers] = React.useState<string[]>([]);
  const [catching, setCatching] = React.useState(false);
  React.useEffect(() => {
    if (template) {
      setPlayers(template.default_player_ids);
      setCatching(template.catching_allowed);
    }
  }, [template]);
  return (
    <AdminModal open={!!template} title={`Start “${template?.name ?? ""}”`} onClose={onClose} width="max-w-lg">
      <div className="space-y-3">
        <div>
          <label className={adminLabel}>Who fights</label>
          <PlayerPicker value={players} onChange={setPlayers} />
        </div>
        <div>
          <label className={adminLabel}>Catching in this battle</label>
          <div className="flex gap-1.5">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setCatching(v)}
                className={cn("rounded-full px-4 py-1.5 text-xs font-semibold", catching === v ? "bg-volt text-screen-ink" : "bg-white/5 text-slate-300 hover:bg-white/10")}
              >
                {v ? "Allowed" : "Not allowed"}
              </button>
            ))}
          </div>
          {template && catching !== template.catching_allowed ? <p className="mt-1 text-[11px] text-amber-300">Different from the saved setting — only for this battle.</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-white/10 pt-3">
          <button type="button" className={adminButtonSecondary} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`${adminButtonPrimary} flex items-center gap-1.5`}
            disabled={!players.length || start.isPending}
            onClick={() =>
              start.mutate(
                { templateId: template!.id, playerIds: players, catchingAllowed: catching },
                {
                  onSuccess: (id) => {
                    toast("Encounter started — everyone rolls for initiative", "success");
                    onClose();
                    onStarted(id);
                  },
                }
              )
            }
          >
            <Play className="h-4 w-4" /> {start.isPending ? "Starting…" : "Start encounter"}
          </button>
        </div>
      </div>
    </AdminModal>
  );
}

// ---------------------------------------------------------------------------
// Pokémon library
// ---------------------------------------------------------------------------
type SortKey = "newest" | "name" | "level";

export function LibraryPokemonTab() {
  const { data: library, isLoading } = useGmPokemon();
  const { data: trainers } = useGmTrainers();
  const { data: teams } = useGmTeams();
  const { data: templates } = useEncounterTemplates();
  const { data: species } = useSpecies();
  const del = useDeleteLibraryItem();
  const [query, setQuery] = React.useState("");
  const [type, setType] = React.useState("");
  const [level, setLevel] = React.useState("");
  const [trainer, setTrainer] = React.useState("");
  const [sort, setSort] = React.useState<SortKey>("newest");
  const [editing, setEditing] = React.useState<GmPokemon | "new" | null>(null);
  const [limit, setLimit] = React.useState(100);

  const sp = (id: number | null) => (id ? species?.find((s) => s.id === id) ?? null : null);
  const q = query.trim().toLowerCase();
  const teamsOf = (id: string) => (teams ?? []).filter((t) => t.members.some((m) => m.gm_pokemon_id === id));
  const usedIn = (id: string) => (templates ?? []).filter((t) => t.entries.some((e) => e.gm_pokemon_id === id));
  const list = (library ?? [])
    .filter((p) => {
      const s = sp(p.species_id);
      if (q && !(p.name.toLowerCase().includes(q) || (s?.name.toLowerCase().includes(q) ?? false) || String(p.species_id ?? "") === q.replace(/^#/, ""))) return false;
      if (type && s?.type1 !== type && s?.type2 !== type) return false;
      if (level && p.level !== Number(level)) return false;
      if (trainer === "none" ? !!p.trainer_id : trainer && p.trainer_id !== trainer) return false;
      return true;
    })
    .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : sort === "level" ? b.level - a.level || a.name.localeCompare(b.name) : b.created_at.localeCompare(a.created_at)));
  const types = [...new Set((species ?? []).flatMap((s) => [s.type1, s.type2]).filter(Boolean))].sort() as string[];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <SearchBox value={query} onChange={setQuery} placeholder="Search name, species or Pokédex no." />
        <select className={`${adminInput} !w-auto`} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select className={`${adminInput} !w-auto`} value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">All levels</option>
          {Array.from({ length: 8 }, (_, i) => i + 1).map((l) => (
            <option key={l} value={l}>
              Lv {l}
            </option>
          ))}
        </select>
        <select className={`${adminInput} !w-auto`} value={trainer} onChange={(e) => setTrainer(e.target.value)}>
          <option value="">Any trainer</option>
          <option value="none">No trainer</option>
          {(trainers ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select className={`${adminInput} !w-auto`} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="newest">Newest</option>
          <option value="name">Name</option>
          <option value="level">Level</option>
        </select>
        <button type="button" className={`${adminButtonPrimary} flex items-center gap-1.5`} onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Create Pokémon
        </button>
      </div>
      <p className="text-xs text-slate-400">
        {list.length} of {library?.length ?? 0} Pokémon. These are your enemy Pokémon; adding one to an encounter makes a copy for that battle, so your library never changes during a fight.
      </p>
      {isLoading ? <p className="text-sm text-slate-500">Loading…</p> : null}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-white/5 text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Pokémon</th>
              <th className="px-3 py-2 text-left font-medium">Level</th>
              <th className="px-3 py-2 text-left font-medium">KP</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Trainer · Teams</th>
              <th className="px-3 py-2 text-left font-medium">Encounters</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.slice(0, limit).map((p) => {
              const s = sp(p.species_id);
              const tms = teamsOf(p.id);
              const used = usedIn(p.id);
              return (
                <tr key={p.id} className="border-t border-white/5">
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <BattleSprite speciesId={p.species_id} alt={p.name} className="h-8 w-8 shrink-0" />
                      <div className="min-w-0">
                        <p className="truncate text-slate-100">{p.name}</p>
                        <p className="flex gap-1 text-[10px] text-slate-500">
                          {s ? s.name : "Custom"} <TypePill type={s?.type1} /> <TypePill type={s?.type2} />
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-slate-300">{p.level}</td>
                  <td className="px-3 py-1.5 font-mono text-slate-300">
                    {p.current_hp}/{p.max_hp}
                  </td>
                  <td className="px-3 py-1.5">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-3 py-1.5 text-xs text-slate-400">
                    {trainers?.find((t) => t.id === p.trainer_id)?.name ?? "—"}
                    {tms.length ? <span className="block text-[10px] text-slate-500">{tms.map((t) => t.name).join(", ")}</span> : null}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-slate-400">{used.length ? used.map((t) => t.name).join(", ") : "—"}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button type="button" className="rounded p-1 text-slate-400 hover:bg-white/5" title="Edit" onClick={() => setEditing(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-rotom-red-light"
                      title="Delete"
                      onClick={() => {
                        const msg = used.length || tms.length ? `Delete ${p.name}? It will also be removed from ${[...tms.map((t) => t.name), ...used.map((t) => t.name)].join(", ")}.` : `Delete ${p.name}?`;
                        if (window.confirm(msg)) del.mutate({ table: "gm_pokemon", id: p.id }, { onSuccess: () => toast(`${p.name} deleted`, "success") });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {list.length > limit ? (
        <button type="button" className={adminButtonSecondary} onClick={() => setLimit((l) => l + 100)}>
          Show more ({list.length - limit} more)
        </button>
      ) : null}
      <GmPokemonDialog pokemon={editing} trainers={trainers ?? []} onClose={() => setEditing(null)} />
    </div>
  );
}

const STATUSES: PokemonStatus[] = ["healthy", "poisoned", "burned", "paralyzed", "asleep", "frozen", "confused", "fainted"];

function GmPokemonDialog({ pokemon, trainers, onClose }: { pokemon: GmPokemon | "new" | null; trainers: GmTrainer[]; onClose: () => void }) {
  const save = useSaveGmPokemon();
  const { data: config } = useGameConfig();
  const { data: species } = useSpecies();
  const maxLevel = config?.maxLevel ?? 8;
  const editing = pokemon && pokemon !== "new" ? pokemon : null;
  const [speciesId, setSpeciesId] = React.useState<number | null>(null);
  const [name, setName] = React.useState("");
  const [level, setLevel] = React.useState(1);
  const [maxHp, setMaxHp] = React.useState("60");
  const [curHp, setCurHp] = React.useState("60");
  const [status, setStatus] = React.useState<PokemonStatus>("healthy");
  const [trainerId, setTrainerId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [copies, setCopies] = React.useState("1");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!pokemon) return;
    setError(null);
    setCopies("1");
    setSpeciesId(editing?.species_id ?? null);
    setName(editing?.name ?? "");
    setLevel(editing?.level ?? 1);
    setMaxHp(String(editing?.max_hp ?? 60));
    setCurHp(String(editing?.current_hp ?? 60));
    setStatus(editing?.status ?? "healthy");
    setTrainerId(editing?.trainer_id ?? "");
    setNotes(editing?.notes ?? "");
  }, [pokemon, editing]);

  function submit() {
    const mx = Number(maxHp);
    const cur = Number(curHp);
    const n = Number(copies);
    const finalName = name.trim() || species?.find((s) => s.id === speciesId)?.name || "";
    if (!finalName) return setError("Choose a species or type a name.");
    if (!Number.isInteger(mx) || mx < 1 || mx > 9999) return setError("Max KP must be between 1 and 9999.");
    if (!Number.isInteger(cur) || cur < 0 || cur > mx) return setError("Current KP must be between 0 and max KP.");
    if (!editing && (!Number.isInteger(n) || n < 1 || n > 50)) return setError("Make between 1 and 50 copies.");
    save.mutate(
      {
        id: editing?.id ?? null,
        values: { species_id: speciesId, name: finalName, level, max_hp: mx, current_hp: cur, status, trainer_id: trainerId || null, notes: notes.trim() || null },
        copies: n,
      },
      {
        onSuccess: (rows) => {
          toast(editing ? `${finalName} saved` : rows.length > 1 ? `${rows.length} × ${finalName} created` : `${finalName} created`, "success");
          onClose();
        },
        onError: (e) => setError(e instanceof Error ? e.message : "Couldn't save."),
      }
    );
  }

  return (
    <AdminModal open={!!pokemon} title={editing ? `Edit ${editing.name}` : "Create Pokémon"} onClose={onClose} width="max-w-lg">
      <div className="space-y-3">
        <div>
          <label className={adminLabel}>Species</label>
          <SpeciesSearch value={speciesId} onChange={(id) => setSpeciesId(id)} allowClear clearLabel="Custom (no sprite)" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={adminLabel}>Name / nickname</label>
            <input className={adminInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="Species name" maxLength={40} />
          </div>
          <div>
            <label className={adminLabel}>Level</label>
            <select className={adminInput} value={level} onChange={(e) => setLevel(Number(e.target.value))}>
              {Array.from({ length: maxLevel }, (_, i) => i + 1).map((l) => (
                <option key={l} value={l}>
                  Level {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={adminLabel}>Max KP</label>
            <input
              className={adminInput}
              inputMode="numeric"
              value={maxHp}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                if (curHp === maxHp) setCurHp(v);
                setMaxHp(v);
              }}
            />
          </div>
          <div>
            <label className={adminLabel}>Current KP</label>
            <input className={adminInput} inputMode="numeric" value={curHp} onChange={(e) => setCurHp(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div>
            <label className={adminLabel}>Status</label>
            <select className={adminInput} value={status} onChange={(e) => setStatus(e.target.value as PokemonStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={adminLabel}>Trainer (optional)</label>
            <select className={adminInput} value={trainerId} onChange={(e) => setTrainerId(e.target.value)}>
              <option value="">— none (wild) —</option>
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={adminLabel}>Notes (optional)</label>
          <input className={adminInput} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Only you see this" />
        </div>
        {!editing ? (
          <div className="w-32">
            <label className={adminLabel}>How many copies</label>
            <input className={adminInput} inputMode="numeric" value={copies} onChange={(e) => setCopies(e.target.value.replace(/\D/g, "").slice(0, 2))} />
          </div>
        ) : null}
        {error ? <p className="rounded-lg bg-rotom-red/15 px-3 py-2 text-xs text-rotom-red-light">{error}</p> : null}
        <div className="flex justify-end gap-2 border-t border-white/10 pt-3">
          <button type="button" className={adminButtonSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={adminButtonPrimary} disabled={save.isPending} onClick={submit}>
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </AdminModal>
  );
}

// ---------------------------------------------------------------------------
// Trainers
// ---------------------------------------------------------------------------
export function TrainersTab() {
  const { data: trainers, isLoading } = useGmTrainers();
  const { data: teams } = useGmTeams();
  const { data: library } = useGmPokemon();
  const { data: templates } = useEncounterTemplates();
  const del = useDeleteLibraryItem();
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<GmTrainer | "new" | null>(null);
  const q = query.trim().toLowerCase();
  const list = (trainers ?? []).filter((t) => !q || t.name.toLowerCase().includes(q));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <SearchBox value={query} onChange={setQuery} placeholder="Search trainers" />
        <button type="button" className={`${adminButtonPrimary} flex items-center gap-1.5`} onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Create trainer
        </button>
      </div>
      {isLoading ? <p className="text-sm text-slate-500">Loading…</p> : null}
      {!isLoading && list.length === 0 ? <p className="rounded-xl border border-dashed border-white/10 px-3 py-8 text-center text-sm text-slate-500">No trainers yet.</p> : null}
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {list.map((t) => {
          const tms = (teams ?? []).filter((x) => x.trainer_id === t.id);
          const mons = (library ?? []).filter((x) => x.trainer_id === t.id);
          const used = (templates ?? []).filter((x) => x.entries.some((e) => e.trainer_id === t.id));
          return (
            <div key={t.id} className={cn("rounded-xl border border-white/10 bg-[#111623] p-3", !t.is_active && "opacity-60")}>
              <div className="flex items-start gap-2">
                {t.species_id ? <BattleSprite speciesId={t.species_id} alt="" className="h-10 w-10 shrink-0" /> : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-100">
                    {t.name}
                    {!t.is_active ? <span className="ml-1 text-[10px] text-slate-500">(inactive)</span> : null}
                  </p>
                  {t.description ? <p className="line-clamp-2 text-xs text-slate-400">{t.description}</p> : null}
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {tms.length} team{tms.length === 1 ? "" : "s"} · {mons.length} Pokémon · in {used.length} saved encounter{used.length === 1 ? "" : "s"}
                  </p>
                </div>
                <button type="button" className="rounded p-1 text-slate-400 hover:bg-white/5" title="Edit" onClick={() => setEditing(t)}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-rotom-red-light"
                  title="Delete"
                  onClick={() => {
                    const msg = used.length
                      ? `Delete ${t.name}? They will also be removed from ${used.map((x) => x.name).join(", ")}. Their Pokémon and teams stay (without a trainer).`
                      : `Delete ${t.name}? Their Pokémon and teams stay (without a trainer).`;
                    if (window.confirm(msg)) del.mutate({ table: "gm_trainers", id: t.id }, { onSuccess: () => toast(`${t.name} deleted`, "success") });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <TrainerDialog trainer={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function TrainerDialog({ trainer, onClose }: { trainer: GmTrainer | "new" | null; onClose: () => void }) {
  const save = useSaveGmTrainer();
  const editing = trainer && trainer !== "new" ? trainer : null;
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [speciesId, setSpeciesId] = React.useState<number | null>(null);
  const [active, setActive] = React.useState(true);
  React.useEffect(() => {
    if (!trainer) return;
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
    setSpeciesId(editing?.species_id ?? null);
    setActive(editing?.is_active ?? true);
  }, [trainer, editing]);
  return (
    <AdminModal open={!!trainer} title={editing ? `Edit ${editing.name}` : "Create trainer"} onClose={onClose} width="max-w-md">
      <div className="space-y-3">
        <div>
          <label className={adminLabel}>Name</label>
          <input className={adminInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="Brock" maxLength={60} />
        </div>
        <div>
          <label className={adminLabel}>Description (optional)</label>
          <input className={adminInput} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Pewter City Gym Leader" />
        </div>
        <div>
          <label className={adminLabel}>Picture (optional — a Pokémon sprite)</label>
          <SpeciesSearch value={speciesId} onChange={(id) => setSpeciesId(id)} allowClear clearLabel="No picture" />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" className="h-4 w-4 accent-volt" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
        </label>
        <div className="flex justify-end gap-2 border-t border-white/10 pt-3">
          <button type="button" className={adminButtonSecondary} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={adminButtonPrimary}
            disabled={!name.trim() || save.isPending}
            onClick={() =>
              save.mutate(
                { id: editing?.id ?? null, values: { name: name.trim(), description: description.trim() || null, species_id: speciesId, sprite_url: editing?.sprite_url ?? null, is_active: active } },
                {
                  onSuccess: () => {
                    toast("Trainer saved", "success");
                    onClose();
                  },
                }
              )
            }
          >
            Save
          </button>
        </div>
      </div>
    </AdminModal>
  );
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------
export function TeamsTab() {
  const { data: teams, isLoading } = useGmTeams();
  const { data: trainers } = useGmTrainers();
  const { data: library } = useGmPokemon();
  const del = useDeleteLibraryItem();
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<GmTeamWithMembers | "new" | null>(null);
  const q = query.trim().toLowerCase();
  const list = (teams ?? []).filter((t) => !q || t.name.toLowerCase().includes(q));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <SearchBox value={query} onChange={setQuery} placeholder="Search teams" />
        <button type="button" className={`${adminButtonPrimary} flex items-center gap-1.5`} onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Create team
        </button>
      </div>
      {isLoading ? <p className="text-sm text-slate-500">Loading…</p> : null}
      {!isLoading && list.length === 0 ? <p className="rounded-xl border border-dashed border-white/10 px-3 py-8 text-center text-sm text-slate-500">No teams yet.</p> : null}
      <div className="grid gap-2 md:grid-cols-2">
        {list.map((t) => (
          <div key={t.id} className="rounded-xl border border-white/10 bg-[#111623] p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-100">{t.name}</p>
                <p className="text-[11px] text-slate-400">
                  {t.trainer_id ? `${trainers?.find((x) => x.id === t.trainer_id)?.name ?? "?"}'s team` : "No trainer (wild group)"} · {t.members.length} Pokémon
                </p>
              </div>
              <button type="button" className="rounded p-1 text-slate-400 hover:bg-white/5" title="Edit" onClick={() => setEditing(t)}>
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-rotom-red-light"
                title="Delete"
                onClick={() => {
                  if (window.confirm(`Delete ${t.name}? Its Pokémon stay in your library; saved encounters using this team lose it.`))
                    del.mutate({ table: "gm_teams", id: t.id }, { onSuccess: () => toast(`${t.name} deleted`, "success") });
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {t.members.map((m) => {
                const p = library?.find((x) => x.id === m.gm_pokemon_id);
                return p ? (
                  <span key={m.gm_pokemon_id} className="flex items-center gap-1 rounded-full bg-white/5 py-0.5 pl-0.5 pr-2 text-[11px] text-slate-300">
                    <BattleSprite speciesId={p.species_id} alt="" className="h-5 w-5" />
                    {p.name} <span className="font-mono text-slate-500">Lv{p.level}</span>
                  </span>
                ) : null;
              })}
            </div>
          </div>
        ))}
      </div>
      <TeamDialog team={editing} trainers={trainers ?? []} library={library ?? []} onClose={() => setEditing(null)} />
    </div>
  );
}

function TeamDialog({ team, trainers, library, onClose }: { team: GmTeamWithMembers | "new" | null; trainers: GmTrainer[]; library: GmPokemon[]; onClose: () => void }) {
  const save = useSaveGmTeam();
  const editing = team && team !== "new" ? team : null;
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [trainerId, setTrainerId] = React.useState("");
  const [members, setMembers] = React.useState<string[]>([]);
  const [query, setQuery] = React.useState("");
  React.useEffect(() => {
    if (!team) return;
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
    setTrainerId(editing?.trainer_id ?? "");
    setMembers(editing ? [...editing.members].sort((a, b) => a.position - b.position).map((m) => m.gm_pokemon_id) : []);
    setQuery("");
  }, [team, editing]);
  const q = query.trim().toLowerCase();
  const available = library.filter((p) => !members.includes(p.id) && (!q || p.name.toLowerCase().includes(q)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= members.length) return;
    const next = [...members];
    [next[i], next[j]] = [next[j], next[i]];
    setMembers(next);
  };
  return (
    <AdminModal open={!!team} title={editing ? `Edit ${editing.name}` : "Create team"} onClose={onClose} width="max-w-2xl">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={adminLabel}>Team name</label>
            <input className={adminInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="Brock's Gym Team" maxLength={60} />
          </div>
          <div>
            <label className={adminLabel}>Trainer (optional)</label>
            <select className={adminInput} value={trainerId} onChange={(e) => setTrainerId(e.target.value)}>
              <option value="">— none (wild group) —</option>
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={adminLabel}>Description (optional)</label>
            <input className={adminInput} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className={adminLabel}>In the team (order = order they come out) · {members.length}</label>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-white/[0.03] p-1.5">
              {members.length === 0 ? <p className="px-2 py-3 text-center text-xs text-slate-500">Add Pokémon from the right.</p> : null}
              {members.map((id, i) => {
                const p = library.find((x) => x.id === id);
                return (
                  <div key={id} className="flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-1 text-xs">
                    <span className="w-4 font-mono text-slate-500">{i + 1}</span>
                    <BattleSprite speciesId={p?.species_id ?? null} alt="" className="h-6 w-6" />
                    <span className="min-w-0 flex-1 truncate text-slate-100">{p?.name ?? "?"}</span>
                    <button type="button" className="text-slate-400 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className="text-slate-400 disabled:opacity-30" disabled={i === members.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className="text-slate-400 hover:text-rotom-red-light" onClick={() => setMembers(members.filter((x) => x !== id))}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <label className={adminLabel}>Your Pokémon</label>
            <SearchBox value={query} onChange={setQuery} placeholder="Search" />
            <div className="mt-1 max-h-56 space-y-1 overflow-y-auto">
              {available.slice(0, 150).map((p) => (
                <button key={p.id} type="button" onClick={() => setMembers([...members, p.id])} className="flex w-full items-center gap-1.5 rounded-md bg-white/5 px-2 py-1 text-left text-xs hover:bg-white/10">
                  <Plus className="h-3.5 w-3.5 text-volt" />
                  <BattleSprite speciesId={p.species_id} alt="" className="h-6 w-6" />
                  <span className="min-w-0 flex-1 truncate text-slate-100">{p.name}</span>
                  <span className="font-mono text-[10px] text-slate-500">Lv{p.level}</span>
                </button>
              ))}
              {library.length === 0 ? <p className="px-2 py-3 text-xs text-slate-500">Create Pokémon in the Pokémon tab first.</p> : null}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-white/10 pt-3">
          <button type="button" className={adminButtonSecondary} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={adminButtonPrimary}
            disabled={!name.trim() || save.isPending}
            onClick={() =>
              save.mutate(
                { id: editing?.id ?? null, values: { name: name.trim(), description: description.trim() || null, trainer_id: trainerId || null }, memberIds: members },
                {
                  onSuccess: () => {
                    toast("Team saved", "success");
                    onClose();
                  },
                }
              )
            }
          >
            Save
          </button>
        </div>
      </div>
    </AdminModal>
  );
}

// ---------------------------------------------------------------------------
// Catch requests (every encounter)
// ---------------------------------------------------------------------------
export function CatchRequestsTab() {
  const { data: requests, isLoading } = useCatchRequests();
  const resolve = useAdminResolveCatch();
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("pending");
  const q = query.trim().toLowerCase();
  const list = (requests ?? []).filter(
    (r) =>
      (!status || r.status === status) &&
      (!q || r.pokemon_name.toLowerCase().includes(q) || (r.player?.username ?? "").toLowerCase().includes(q) || (r.encounter?.name ?? "").toLowerCase().includes(q))
  );
  const label = { pending: "Pending", caught: "Caught", not_caught: "Not caught", cancelled: "Closed" } as const;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <SearchBox value={query} onChange={setQuery} placeholder="Search player, Pokémon or encounter" />
        <select className={`${adminInput} !w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="caught">Caught</option>
          <option value="not_caught">Not caught</option>
          <option value="cancelled">Closed</option>
        </select>
      </div>
      {isLoading ? <p className="text-sm text-slate-500">Loading…</p> : null}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-white/5 text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Player</th>
              <th className="px-3 py-2 text-left font-medium">Pokémon</th>
              <th className="px-3 py-2 text-left font-medium">Encounter</th>
              <th className="px-3 py-2 text-left font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-xs text-slate-500">
                  {status === "pending" ? "No catch attempts waiting." : "Nothing here."}
                </td>
              </tr>
            ) : null}
            {list.map((r) => (
              <tr key={r.id} className="border-t border-white/5">
                <td className="px-3 py-1.5 text-slate-100">{r.player?.username ?? "?"}</td>
                <td className="px-3 py-1.5 text-slate-100">
                  {r.pokemon_name} <span className="text-[11px] text-slate-500">({r.ball_name ?? "Poké Ball"})</span>
                </td>
                <td className="px-3 py-1.5 text-slate-400">
                  {r.encounter?.name ?? "?"}
                  <span className="block text-[10px] text-slate-500">{new Date(r.created_at).toLocaleString()}</span>
                </td>
                <td className="px-3 py-1.5">
                  {r.status === "pending" ? (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className={`${adminButtonPrimary} !px-3 !py-1 text-xs`}
                        disabled={resolve.isPending}
                        onClick={() => resolve.mutate({ attemptId: r.id, caught: true }, { onSuccess: () => toast(`✅ ${r.pokemon_name} caught by ${r.player?.username}`, "success") })}
                      >
                        ✅ Caught
                      </button>
                      <button
                        type="button"
                        className={`${adminButtonSecondary} !px-3 !py-1 text-xs`}
                        disabled={resolve.isPending}
                        onClick={() => resolve.mutate({ attemptId: r.id, caught: false }, { onSuccess: () => toast(`❌ ${r.pokemon_name} broke free`, "info") })}
                      >
                        ❌ Not caught
                      </button>
                    </div>
                  ) : (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        r.status === "caught" ? "bg-emerald-400/15 text-emerald-300" : r.status === "not_caught" ? "bg-rotom-red/15 text-rotom-red-light" : "bg-white/10 text-slate-400"
                      )}
                      title={r.note ?? undefined}
                    >
                      {label[r.status]}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
