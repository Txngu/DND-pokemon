import * as React from "react";
import { Sparkles } from "lucide-react";
import { SpeciesSearch } from "@/components/phone/SpeciesSearch";
import { PokemonSprite } from "@/components/phone/PokemonSprite";
import { TypePill } from "@/components/battle/BattleBits";
import { adminButtonPrimary, adminButtonSecondary, adminInput, adminLabel } from "@/components/admin/adminStyles";
import { useSpecies } from "@/hooks/useBag";
import { useGameConfig } from "@/hooks/useBattle";
import { useCreatePokemon, type CreatePokemonResult } from "@/hooks/usePokemonHp";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { PokemonStatus, Profile } from "@/types/database.types";

const STATUS_OPTIONS: { value: PokemonStatus; label: string }[] = [
  { value: "healthy", label: "Healthy" },
  { value: "poisoned", label: "Poisoned" },
  { value: "burned", label: "Burned" },
  { value: "paralyzed", label: "Paralyzed" },
  { value: "asleep", label: "Asleep" },
  { value: "frozen", label: "Frozen" },
  { value: "confused", label: "Confused" },
  { value: "fainted", label: "Fainted" },
];

const NATURES = [
  "Hardy", "Lonely", "Brave", "Adamant", "Naughty", "Bold", "Docile", "Relaxed", "Impish", "Lax", "Timid", "Hasty", "Serious",
  "Jolly", "Naive", "Modest", "Mild", "Quiet", "Bashful", "Rash", "Calm", "Gentle", "Sassy", "Careful", "Quirky",
];

const TEAM_SIZE = 6;

/**
 * The Pokémon creation form (PokéGear 12). Used by the Game Master in the
 * admin panel (`tone="admin"`, with a trainer picker) and by a trainer on
 * their phone (`tone="phone"`, always for themselves). The server checks
 * every rule again — this form only gives early, friendly feedback.
 */
export function CreatePokemonForm({
  tone,
  profileId: fixedProfileId,
  trainers,
  teamCountFor,
  onDone,
  onCancel,
}: {
  tone: "admin" | "phone";
  /** Phone: the trainer's own profile. Admin: the preselected trainer. */
  profileId: string;
  /** Admin only: trainers the GM can choose from. */
  trainers?: Profile[];
  /** How many Pokémon the chosen trainer has in their Team (to warn when it's full). */
  teamCountFor: (profileId: string) => number | undefined;
  onDone?: (result: CreatePokemonResult) => void;
  onCancel?: () => void;
}) {
  const admin = tone === "admin";
  const { data: species = [] } = useSpecies();
  const { data: config } = useGameConfig();
  const create = useCreatePokemon();
  const maxLevel = config?.maxLevel ?? 8;

  const [profileId, setProfileId] = React.useState(fixedProfileId);
  const [speciesId, setSpeciesId] = React.useState<number | null>(null);
  const [nickname, setNickname] = React.useState("");
  const [level, setLevel] = React.useState(1);
  const [maxHp, setMaxHp] = React.useState("");
  const [currentHp, setCurrentHp] = React.useState("");
  const [currentTouched, setCurrentTouched] = React.useState(false);
  const [status, setStatus] = React.useState<PokemonStatus>("healthy");
  const [shiny, setShiny] = React.useState(false);
  const [toPc, setToPc] = React.useState(false);
  const [nature, setNature] = React.useState("Hardy");
  const [ability, setAbility] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => setProfileId(fixedProfileId), [fixedProfileId]);

  const selected = speciesId != null ? species.find((s) => s.id === speciesId) ?? null : null;
  const maxNum = Number(maxHp);
  // Until the current KP is edited it follows the max KP (a fresh, healthy Pokémon).
  const curText = currentTouched ? currentHp : maxHp;
  const curNum = Number(curText);
  const teamCount = teamCountFor(profileId);
  const teamFull = teamCount !== undefined && teamCount >= TEAM_SIZE;
  const target = trainers?.find((t) => t.id === profileId);

  function onCurrentChange(v: string) {
    setCurrentTouched(true);
    setCurrentHp(v);
    const n = Number(v);
    if (v.trim() !== "" && Number.isFinite(n)) {
      if (n === 0) setStatus("fainted");
      else if (status === "fainted") setStatus("healthy");
    }
  }

  function onStatusChange(s: PokemonStatus) {
    setStatus(s);
    if (s === "fainted") {
      setCurrentTouched(true);
      setCurrentHp("0");
    } else if (curText.trim() !== "" && curNum === 0) {
      setCurrentTouched(true);
      setCurrentHp(maxHp);
    }
  }

  function validate(): string | null {
    if (!profileId) return "Choose a trainer for this Pokémon.";
    if (admin && target && target.role !== "trainer") return "Pokémon can only be created for a trainer.";
    if (!selected) return "Choose a Pokémon species.";
    if (nickname.trim().length > 24) return "Nickname is too long (24 characters max).";
    if (!Number.isInteger(level) || level < 1 || level > maxLevel) return `Level must be between 1 and ${maxLevel}.`;
    if (maxHp.trim() === "" || !Number.isInteger(maxNum) || maxNum < 1) return "Maximum KP must be a positive whole number.";
    if (maxNum > 9999) return "Maximum KP can be at most 9999.";
    if (curText.trim() === "" || !Number.isInteger(curNum)) return "Current KP must be a whole number.";
    if (curNum < 0) return "Current KP cannot be below 0.";
    if (curNum > maxNum) return "Current KP cannot be greater than Maximum KP.";
    if (status === "fainted" && curNum > 0) return "A fainted Pokémon must have 0 current KP.";
    return null;
  }

  function save() {
    const problem = validate();
    setError(problem);
    if (problem || !selected) return;
    create.mutate(
      {
        profileId,
        speciesId: selected.id,
        nickname,
        level,
        maxHp: maxNum,
        currentHp: curNum,
        status: curNum === 0 ? "fainted" : status,
        isShiny: shiny,
        toPc: toPc && !teamFull,
        nature: admin ? nature : null,
        ability: admin ? ability.trim() || null : null,
      },
      {
        onSuccess: (result) => {
          const name = nickname.trim() || selected.name;
          if (result.placed === "team") {
            toast(admin && target ? `${name} joined ${target.username}'s Team` : `${name} joined your Team`, "success");
          } else if (result.team_full) {
            toast(
              admin && target
                ? `${target.username}'s team is full. ${name} has been placed in their PC.`
                : "Your team is full. The Pokémon has been placed in your PC.",
              "info"
            );
          } else {
            toast(`${name} was placed in the PC`, "success");
          }
          setSpeciesId(null);
          setNickname("");
          setCurrentTouched(false);
          setCurrentHp("");
          setStatus("healthy");
          setShiny(false);
          setToPc(false);
          onDone?.(result);
        },
        onError: (e) => setError(e instanceof Error ? e.message : "Couldn't create the Pokémon."),
      }
    );
  }

  // Styling for the two places the form lives.
  const input = admin
    ? adminInput
    : "w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-mist placeholder:text-mist/40 focus:outline-none focus:ring-1 focus:ring-volt";
  const label = admin ? adminLabel : "mb-1 block text-[11px] uppercase tracking-wide text-mist/50";
  const muted = admin ? "text-slate-400" : "text-mist/50";

  return (
    <div className="space-y-3">
      {admin && trainers ? (
        <div>
          <label className={label}>Trainer</label>
          <select className={input} value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            {trainers
              .filter((t) => t.role === "trainer")
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.username}
                </option>
              ))}
          </select>
        </div>
      ) : null}

      <div>
        <label className={label}>Pokémon</label>
        <SpeciesSearch tone={tone} value={speciesId} onChange={(id) => setSpeciesId(id)} placeholder="Search by name or Pokédex no." />
      </div>

      {selected ? (
        <div className={cn("flex items-center gap-3 rounded-xl p-2.5", admin ? "bg-white/5" : "bg-white/5")}>
          <PokemonSprite speciesId={selected.id} shiny={shiny} alt={selected.name} className="h-16 w-16 shrink-0" />
          <div className="min-w-0">
            <p className={cn("truncate font-semibold", admin ? "text-slate-100" : "text-mist")}>
              #{String(selected.id).padStart(3, "0")} {selected.name}
            </p>
            <p className={cn("mb-1 text-[11px]", muted)}>Types</p>
            <div className="flex flex-wrap gap-1">
              <TypePill type={selected.type1} />
              <TypePill type={selected.type2} />
              {!selected.type1 ? <span className={cn("text-[11px]", muted)}>Unknown</span> : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Nickname</label>
          <input
            className={input}
            value={nickname}
            maxLength={24}
            onChange={(e) => setNickname(e.target.value)}
            placeholder={selected ? selected.name : "Optional"}
          />
        </div>
        <div>
          <label className={label}>Level</label>
          <select className={input} value={level} onChange={(e) => setLevel(Number(e.target.value))}>
            {Array.from({ length: maxLevel }, (_, i) => i + 1).map((l) => (
              <option key={l} value={l}>
                Level {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Max KP</label>
          <input className={input} inputMode="numeric" value={maxHp} onChange={(e) => setMaxHp(e.target.value.replace(/[^\d]/g, ""))} placeholder="e.g. 60" />
        </div>
        <div>
          <label className={label}>Current KP</label>
          <input
            className={input}
            inputMode="numeric"
            value={curText}
            onChange={(e) => onCurrentChange(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="Same as max"
          />
        </div>
        <div>
          <label className={label}>Status</label>
          <select className={input} value={status} onChange={(e) => onStatusChange(e.target.value as PokemonStatus)}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <label className={cn("flex items-center gap-2 self-end pb-2 text-sm", admin ? "text-slate-300" : "text-mist/80")}>
          <input type="checkbox" checked={shiny} onChange={(e) => setShiny(e.target.checked)} className="h-4 w-4 accent-volt" />
          <Sparkles className="h-3.5 w-3.5 text-volt" /> Shiny
        </label>
        {admin ? (
          <>
            <div>
              <label className={label}>Nature</label>
              <select className={input} value={nature} onChange={(e) => setNature(e.target.value)}>
                {NATURES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Ability</label>
              <input className={input} value={ability} onChange={(e) => setAbility(e.target.value)} placeholder="Optional" />
            </div>
          </>
        ) : null}
      </div>

      {teamFull ? (
        <p className={cn("rounded-lg px-3 py-2 text-xs", admin ? "bg-amber-400/10 text-amber-200" : "bg-amber-400/10 text-amber-200")}>
          {admin && target ? `${target.username}'s Team is full (6/6)` : "Your Team is full (6/6)"} — this Pokémon will be placed in the PC.
        </p>
      ) : (
        <label className={cn("flex items-center gap-2 text-xs", muted)}>
          <input type="checkbox" checked={toPc} onChange={(e) => setToPc(e.target.checked)} className="h-4 w-4 accent-volt" />
          Put it in the PC instead of the Team
        </label>
      )}

      {error ? <p className="rounded-lg bg-rotom-red/15 px-3 py-2 text-xs text-rotom-red-light">{error}</p> : null}

      <div className="flex gap-2">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className={admin ? adminButtonSecondary : "flex-1 rounded-2xl bg-white/10 py-3 text-sm font-semibold text-mist active:scale-[0.98]"}
          >
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          onClick={save}
          disabled={create.isPending}
          className={admin ? adminButtonPrimary : "flex-1 rounded-2xl bg-volt py-3 text-sm font-semibold text-screen-ink active:scale-[0.98] disabled:opacity-50"}
        >
          {create.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
