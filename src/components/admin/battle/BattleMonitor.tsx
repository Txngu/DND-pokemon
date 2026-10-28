import * as React from "react";
import { Ban, ChevronDown, ChevronRight, CircleDot, Crosshair, Dices, Flag, Gift, ScrollText, Skull, SkipForward, Swords, Trophy, UserPlus, Users } from "lucide-react";
import { adminButtonDanger, adminButtonPrimary, adminButtonSecondary, adminInput } from "@/components/admin/adminStyles";
import { KpEditor } from "@/components/phone/KpEditor";
import { ConfirmDialog } from "@/components/phone/ConfirmDialog";
import { BattleHpBar, BattleSprite, StatusChip } from "@/components/battle/BattleBits";
import { RewardModal } from "@/components/admin/battle/RewardModal";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { formatMoney, formatXp, sum } from "@/lib/battle";
import { useAllProfiles } from "@/hooks/useAdmin";
import {
  useAdminAddBattlePlayers,
  useAdminAdjustEnemyHp,
  useAdminEnemyTurnAttack,
  useAdminResolveCatch,
  useAdminSetBattleStatus,
  useAdminSetTrainerActive,
  useAdminSetInitiative,
  useAdminSkipTurn,
  useBattleState,
} from "@/hooks/useEncounter";
import type { BattleEncounter, BattleEnemyState, BattleEvent, BattleState } from "@/types/database.types";
import { ENCOUNTER_KINDS } from "@/types/database.types";

export const STATUS_STYLE: Record<BattleEncounter["status"], { label: string; cls: string }> = {
  active: { label: "Live", cls: "bg-emerald-400/15 text-emerald-300" },
  completed: { label: "Victory · needs rewards", cls: "bg-volt/20 text-volt" },
  lost: { label: "Defeat · needs rewards", cls: "bg-rotom-red/20 text-rotom-red-light" },
  rewarded: { label: "Rewarded", cls: "bg-circuit-violet/20 text-circuit-violet" },
  ended: { label: "Ended", cls: "bg-white/10 text-slate-400" },
};

function summarize(events: BattleEvent[]) {
  const hits = events.filter((e) => e.type === "attack");
  if (!hits.length) return events[0]?.message ?? "Done";
  return hits.map((h) => (h.missed ? `${h.attacker_name} missed ${h.target_name}` : `${h.attacker_name} → ${h.target_name} -${h.damage}`)).join(" · ");
}

/**
 * Live view of one admin-driven encounter for the Game Master: enemy HP
 * (adjustable), every trainer's active Pokémon and damage dealt, the full
 * battle log, outcome controls, and the reward popup once it's over.
 */
export function BattleMonitor({
  encounterId,
  autoOpenReward,
  onRewardPromptHandled,
}: {
  encounterId: string;
  autoOpenReward: boolean;
  onRewardPromptHandled: () => void;
}) {
  const { data: state, isLoading, error } = useBattleState(encounterId);
  const [rewardOpen, setRewardOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState<null | "completed" | "lost" | "ended">(null);
  const setStatus = useAdminSetBattleStatus();

  React.useEffect(() => {
    if (autoOpenReward && state && (state.encounter.status === "completed" || state.encounter.status === "lost") && !state.reward) {
      setRewardOpen(true);
      onRewardPromptHandled();
    }
  }, [autoOpenReward, state, onRewardPromptHandled]);

  if (isLoading || !state) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-white/10 text-sm text-slate-500">
        {error ? (error as Error).message : "Loading battle…"}
      </div>
    );
  }

  const enc = state.encounter;
  const status = STATUS_STYLE[enc.status];
  const totalDamage = sum(state.players.map((p) => p.damage_dealt));
  const awaitingReward = (enc.status === "completed" || enc.status === "lost") && !state.reward;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-white/10 bg-[#111623] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-50">
              <Swords className="h-4 w-4 text-rotom-red-light" />
              {enc.name}
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", status.cls)}>{status.label}</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Started {new Date(enc.created_at).toLocaleString()} · {state.players.length} trainer{state.players.length === 1 ? "" : "s"}
              {enc.status === "active" ? (enc.phase === "initiative" ? " · rolling for initiative" : ` · round ${enc.round}`) : ""}
              {" · "}
              {ENCOUNTER_KINDS.find((k) => k.value === enc.kind)?.label ?? "Encounter"} · catching {enc.catching_allowed ? "allowed" : "not allowed"}
            </p>
            {enc.notes ? <p className="mt-1 text-xs text-slate-500">{enc.notes}</p> : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {awaitingReward ? (
              <button type="button" className={`${adminButtonPrimary} flex items-center gap-1.5`} onClick={() => setRewardOpen(true)}>
                <Gift className="h-4 w-4" /> Give rewards
              </button>
            ) : null}
            {enc.status === "active" ? (
              <>
                <button type="button" className={`${adminButtonSecondary} flex items-center gap-1.5 !py-1.5 text-xs`} onClick={() => setConfirm("completed")}>
                  <Trophy className="h-3.5 w-3.5" /> Declare victory
                </button>
                <button type="button" className={`${adminButtonSecondary} flex items-center gap-1.5 !py-1.5 text-xs`} onClick={() => setConfirm("lost")}>
                  <Flag className="h-3.5 w-3.5" /> Declare defeat
                </button>
              </>
            ) : null}
            {enc.status === "active" || awaitingReward ? (
              <button type="button" className={`${adminButtonSecondary} flex items-center gap-1.5 !py-1.5 text-xs`} onClick={() => setConfirm("ended")}>
                <Ban className="h-3.5 w-3.5" /> Cancel encounter
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {enc.status === "active" && state.order.length > 0 ? <TurnCard state={state} /> : null}

      {state.catches.length > 0 ? <CatchCard state={state} /> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <EnemiesCard state={state} />
        <PlayersCard state={state} totalDamage={totalDamage} />
      </div>

      {state.reward ? <RewardSummary state={state} /> : null}

      <LogCard state={state} />

      <RewardModal state={state} open={rewardOpen} onClose={() => setRewardOpen(false)} />

      <ConfirmDialog
        open={!!confirm}
        title={confirm === "completed" ? "Declare victory?" : confirm === "lost" ? "Declare defeat?" : "Cancel this encounter?"}
        message={
          confirm === "ended"
            ? "The battle closes for everyone and no rewards can be given for it."
            : "The battle stops for every trainer and you'll be asked for rewards next."
        }
        confirmLabel={confirm === "completed" ? "Victory" : confirm === "lost" ? "Defeat" : "Cancel encounter"}
        destructive={confirm === "ended"}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const s = confirm!;
          setConfirm(null);
          setStatus.mutate(
            { encounterId, status: s },
            {
              onSuccess: () => {
                toast(s === "ended" ? "Encounter cancelled" : "Battle closed", "success");
                if (s !== "ended") setRewardOpen(true);
              },
            }
          );
        }}
      />
    </div>
  );
}

function EnemiesCard({ state }: { state: BattleState }) {
  const active = state.encounter.status === "active";
  const trainers = state.enemy_trainers;
  const wild = state.enemies.filter((e) => !e.enemy_trainer_id);
  const standing = state.enemies.filter((e) => !e.fainted && !e.caught).length;

  return (
    <div className="rounded-xl border border-white/10 bg-[#111623] p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-100">
        <Skull className="h-4 w-4" /> Enemies
        <span className="ml-auto text-xs font-normal text-slate-400">
          {standing} of {state.enemies.length} standing
        </span>
      </h3>
      <div className="space-y-2">
        {trainers.map((t) => (
          <EnemyGroup
            key={t.id}
            title={t.name}
            subtitle={`${t.remaining}/${t.total} Pokémon left`}
            speciesId={t.species_id}
            enemies={state.enemies.filter((e) => e.enemy_trainer_id === t.id).sort((a, b) => (a.team_position ?? 0) - (b.team_position ?? 0))}
            activeId={t.active_enemy_id}
            trainerRowId={t.id}
            battleActive={active}
          />
        ))}
        {wild.length ? (
          <EnemyGroup
            title={trainers.length ? "Wild Pokémon" : "Enemy Pokémon"}
            subtitle={`${wild.filter((e) => !e.fainted && !e.caught).length}/${wild.length} standing`}
            speciesId={null}
            enemies={wild}
            activeId={null}
            trainerRowId={null}
            battleActive={active}
          />
        ) : null}
      </div>
    </div>
  );
}

/** One trainer's team, or the wild Pokémon — collapsible, so 30+ enemies stay manageable. */
function EnemyGroup({
  title,
  subtitle,
  speciesId,
  enemies,
  activeId,
  trainerRowId,
  battleActive,
}: {
  title: string;
  subtitle: string;
  speciesId: number | null;
  enemies: BattleEnemyState[];
  activeId: string | null;
  trainerRowId: string | null;
  battleActive: boolean;
}) {
  const [open, setOpen] = React.useState(enemies.length <= 8);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const adjust = useAdminAdjustEnemyHp();
  const sendOut = useAdminSetTrainerActive();

  return (
    <div className="rounded-lg bg-white/[0.04]">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        {speciesId ? <BattleSprite speciesId={speciesId} alt="" className="h-6 w-6" /> : null}
        <span className={cn("text-sm font-semibold", trainerRowId ? "text-rotom-red-light" : "text-slate-100")}>{title}</span>
        <span className="ml-auto text-[11px] text-slate-400">{subtitle}</span>
      </button>
      {open ? (
        <div className="space-y-1 px-2 pb-2">
          {enemies.map((e) => {
            const isActive = e.id === activeId;
            return (
              <div key={e.id} className={cn("rounded-md bg-white/5", (e.fainted || e.caught) && "opacity-55")}>
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
                >
                  <BattleSprite speciesId={e.species_id} spriteUrl={e.sprite_url} alt={e.name} className={cn("h-8 w-8 shrink-0", (e.fainted || e.caught) && "grayscale")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-100">{e.name}</span>
                      <span className="font-mono text-[10px] text-slate-400">Lv{e.level}</span>
                      {isActive && !e.fainted ? <span className="rounded bg-volt/20 px-1 text-[9px] font-bold uppercase text-volt">Active</span> : null}
                      {e.caught ? (
                        <span className="rounded bg-sky-400/20 px-1 text-[9px] font-bold uppercase text-sky-200">Caught by {e.caught_by_name}</span>
                      ) : e.fainted ? (
                        <span className="text-[9px] font-semibold uppercase text-rotom-red-light">Fainted</span>
                      ) : null}
                    </div>
                    <BattleHpBar current={e.current_hp} max={e.max_hp} showNumbers className="mt-0.5" />
                  </div>
                </button>
                {expanded === e.id && battleActive && !e.caught ? (
                  <div className="space-y-1.5 px-2 pb-2">
                    <KpEditor
                      compact
                      disabled={adjust.isPending}
                      onAdjust={(delta) => adjust.mutate({ enemyId: e.id, delta }, { onSuccess: () => toast(`${e.name} ${delta > 0 ? "+" : ""}${delta} KP`, "info") })}
                    />
                    {trainerRowId && !isActive && !e.fainted ? (
                      <button
                        type="button"
                        className={`${adminButtonSecondary} !px-3 !py-1 text-xs`}
                        disabled={sendOut.isPending}
                        onClick={() => sendOut.mutate({ trainerRowId, enemyId: e.id }, { onSuccess: () => toast(`${title} sends out ${e.name}!`, "info") })}
                      >
                        Send out {e.name}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Catch attempts in this battle: the GM decides. */
function CatchCard({ state }: { state: BattleState }) {
  const resolve = useAdminResolveCatch();
  const pending = state.catches.filter((c) => c.status === "pending");
  const done = state.catches.filter((c) => c.status !== "pending");
  return (
    <div className="rounded-xl border border-sky-400/30 bg-sky-400/[0.05] p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-100">
        <CircleDot className="h-4 w-4 text-sky-300" /> Catch attempts
        {pending.length ? <span className="rounded-full bg-sky-400/25 px-2 text-[11px] text-sky-200">{pending.length} waiting</span> : null}
      </h3>
      <div className="space-y-1.5">
        {pending.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 text-slate-100">
              <b>{c.username}</b> threw a {c.ball_name ?? "Poké Ball"} at <b>{c.pokemon_name}</b>
            </span>
            <button
              type="button"
              className={`${adminButtonPrimary} !px-3 !py-1 text-xs`}
              disabled={resolve.isPending}
              onClick={() => resolve.mutate({ attemptId: c.id, caught: true }, { onSuccess: (r) => toast(`✅ ${r.pokemon_name} caught by ${c.username}${r.placed === "pc" ? " (sent to PC)" : ""}`, "success") })}
            >
              ✅ Caught
            </button>
            <button
              type="button"
              className={`${adminButtonSecondary} !px-3 !py-1 text-xs`}
              disabled={resolve.isPending}
              onClick={() => resolve.mutate({ attemptId: c.id, caught: false }, { onSuccess: () => toast(`❌ ${c.pokemon_name} broke free`, "info") })}
            >
              ❌ Not caught
            </button>
          </div>
        ))}
        {done.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-1.5 text-xs text-slate-400">
            <span className="min-w-0 flex-1">
              {c.username} → {c.pokemon_name}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                c.status === "caught" ? "bg-emerald-400/15 text-emerald-300" : c.status === "not_caught" ? "bg-rotom-red/15 text-rotom-red-light" : "bg-white/10 text-slate-400"
              )}
            >
              {c.status === "caught" ? "Caught" : c.status === "not_caught" ? "Not caught" : c.note ?? "Closed"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Initiative and turns (PokéGear 12.1): enter each enemy's d20 roll (and fix a
 * trainer's roll if needed), see whose turn it is, attack with the enemy
 * whose turn it is, or skip a turn.
 */
function TurnCard({ state }: { state: BattleState }) {
  const setRoll = useAdminSetInitiative();
  const skip = useAdminSkipTurn();
  const enc = state.encounter;
  const order = state.order;
  const current = order.find((o) => o.is_current) ?? null;
  const initiative = enc.phase === "initiative";

  return (
    <div className="rounded-xl border border-volt/30 bg-volt/[0.04] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-100">
          <Dices className="h-4 w-4 text-volt" />
          {initiative ? "Initiative — waiting for d20 rolls" : `Round ${enc.round} · ${current ? `${current.name}'s turn` : "…"}`}
        </h3>
        {!initiative && current ? (
          <button
            type="button"
            className={`${adminButtonSecondary} ml-auto flex items-center gap-1.5 !px-3 !py-1 text-xs`}
            disabled={skip.isPending}
            onClick={() => skip.mutate({ encounterId: enc.id }, { onSuccess: () => toast(`Skipped ${current.name}'s turn`, "info") })}
          >
            <SkipForward className="h-3.5 w-3.5" /> Skip turn
          </button>
        ) : null}
      </div>

      <div className="grid gap-1.5 sm:grid-cols-2">
        {order.map((o) => (
          <RollRow
            key={o.id}
            entry={o}
            editable={(initiative || o.position === null) && (o.kind !== "player" || o.awaiting || initiative)}
            busy={setRoll.isPending}
            onSet={(roll) => setRoll.mutate({ entryId: o.id, roll }, { onSuccess: () => toast(`${o.name}: ${roll}`, "success") })}
            dimmed={!initiative && !o.can_act}
          />
        ))}
      </div>
      {initiative ? (
        <p className="mt-2 text-[11px] text-slate-400">
          Trainers type their roll on their phone; you enter one roll per enemy (you can also enter or fix a trainer&apos;s roll). Equal rolls roll
          again. The fight starts automatically when every roll is in.
        </p>
      ) : null}

      {!initiative && current?.kind === "enemy" ? <EnemyTurnForm state={state} enemyName={current.name} /> : null}
      {!initiative && current?.kind === "trainer" ? (
        <EnemyTurnForm
          state={state}
          enemyName={(() => {
            const t = state.enemy_trainers.find((x) => x.id === current.enemy_trainer_id);
            const e = state.enemies.find((x) => x.id === t?.active_enemy_id);
            return t && e ? `${t.name}'s ${e.name}` : current.name;
          })()}
        />
      ) : null}
      {!initiative && current?.kind === "player" ? (
        <p className="mt-3 text-xs text-slate-400">Waiting for {current.name} to act on their phone (attack, item or switch).</p>
      ) : null}
    </div>
  );
}

function RollRow({
  entry,
  editable,
  busy,
  onSet,
  dimmed,
}: {
  entry: BattleState["order"][number];
  editable: boolean;
  busy: boolean;
  onSet: (roll: number) => void;
  dimmed: boolean;
}) {
  const [value, setValue] = React.useState("");
  const n = Number(value);
  const valid = value !== "" && Number.isInteger(n) && n >= 1 && n <= 20;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs",
        entry.is_current ? "bg-volt/20 ring-1 ring-volt/50" : "bg-white/5",
        dimmed && "opacity-40"
      )}
    >
      <span className="w-5 shrink-0 font-mono text-slate-500">{entry.position ?? "–"}</span>
      <span className={cn("min-w-0 flex-1 truncate", entry.kind === "player" ? "text-slate-100" : "text-rotom-red-light")}>
        {entry.name}
        {entry.kind === "trainer" ? <span className="ml-1 text-[10px] text-slate-500">(trainer)</span> : null}
      </span>
      <span className="shrink-0 font-mono text-slate-300">
        {entry.rolls.length ? entry.rolls.join(" / ") : "—"}
        {entry.awaiting ? <span className="ml-1 text-amber-300">{entry.rolls.length ? "re-roll" : "waiting"}</span> : null}
      </span>
      {editable ? (
        <span className="flex shrink-0 items-center gap-1">
          <input
            className={`${adminInput} !w-12 !px-1.5 !py-0.5 text-center text-xs`}
            inputMode="numeric"
            placeholder="d20"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
            aria-label={`Roll for ${entry.name}`}
          />
          <button
            type="button"
            className={`${adminButtonPrimary} !px-2 !py-0.5 text-xs`}
            disabled={!valid || busy}
            onClick={() => {
              onSet(n);
              setValue("");
            }}
          >
            {entry.awaiting ? "Set" : "Fix"}
          </button>
        </span>
      ) : null}
    </div>
  );
}

/** The enemy whose turn it is attacks: target, Hit/Miss, damage. */
function EnemyTurnForm({ state, enemyName }: { state: BattleState; enemyName: string }) {
  const attack = useAdminEnemyTurnAttack();
  const targets = state.players.filter((p) => p.active_pokemon && p.active_pokemon.current_hp > 0 && p.active_pokemon.status !== "fainted");
  const [targetId, setTargetId] = React.useState("");
  const [dmg, setDmg] = React.useState("");
  const target = targets.find((p) => p.active_pokemon!.id === targetId) ?? targets[0] ?? null;
  const n = Number(dmg);
  const valid = dmg !== "" && Number.isInteger(n) && n >= 1 && n <= 9999;

  function send(damage: number) {
    if (!target) return;
    attack.mutate(
      { encounterId: state.encounter.id, targetPokemonId: target.active_pokemon!.id, damage },
      {
        onSuccess: (r) => {
          toast(summarize(r.events), "info");
          setDmg("");
        },
      }
    );
  }

  if (!target) {
    return <p className="mt-3 text-xs text-amber-300">{enemyName} has no target right now — no trainer has a Pokémon out. Skip the turn or wait.</p>;
  }
  const ap = target.active_pokemon!;
  return (
    <div className="mt-3 rounded-lg bg-rotom-red/10 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-rotom-red-light">
        <Crosshair className="h-3.5 w-3.5" /> {enemyName} attacks
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select className={`${adminInput} !w-auto !py-1 text-xs`} value={ap.id} onChange={(e) => setTargetId(e.target.value)}>
          {targets.map((p) => (
            <option key={p.id} value={p.active_pokemon!.id}>
              {p.username}&apos;s {p.active_pokemon!.name} ({p.active_pokemon!.current_hp}/{p.active_pokemon!.max_hp})
            </option>
          ))}
        </select>
        <input
          className={`${adminInput} !w-20 !py-1 text-xs`}
          inputMode="numeric"
          placeholder="Damage"
          value={dmg}
          onChange={(e) => setDmg(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
        />
        <button type="button" className={`${adminButtonDanger} !px-3 !py-1 text-xs`} disabled={!valid || attack.isPending} onClick={() => send(n)}>
          Hit for {valid ? n : "…"}
        </button>
        <button type="button" className={`${adminButtonSecondary} !px-3 !py-1 text-xs`} disabled={attack.isPending} onClick={() => send(0)}>
          Miss
        </button>
      </div>
      {valid ? (
        <p className="mt-1 font-mono text-[11px] text-slate-400">
          {ap.name}: {ap.current_hp}/{ap.max_hp} → {Math.max(0, ap.current_hp - n)}/{ap.max_hp}
          {ap.current_hp - n <= 0 ? " · faints" : ""}
        </p>
      ) : null}
    </div>
  );
}

function PlayersCard({ state, totalDamage }: { state: BattleState; totalDamage: number }) {
  const { data: profiles } = useAllProfiles();
  const addPlayers = useAdminAddBattlePlayers();
  const [adding, setAdding] = React.useState("");
  const inBattle = new Set(state.players.map((p) => p.profile_id));
  const candidates = (profiles ?? []).filter((p) => !inBattle.has(p.id));

  return (
    <div className="rounded-xl border border-white/10 bg-[#111623] p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-100">
        <Users className="h-4 w-4" /> Trainers ({state.players.length})
        <span className="ml-auto text-xs font-normal text-slate-400">
          Total damage <b className="font-mono text-slate-200">{totalDamage}</b>
        </span>
      </h3>
      <div className="space-y-2">
        {state.players.map((p) => {
          const ap = p.active_pokemon;
          const share = totalDamage > 0 ? Math.round((p.damage_dealt / totalDamage) * 100) : 0;
          return (
            <div key={p.id} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/5">
                {ap ? <BattleSprite speciesId={ap.species_id} shiny={ap.is_shiny} alt={ap.name} className={cn("h-10 w-10", ap.current_hp <= 0 && "grayscale")} /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium text-slate-100">{p.username}</p>
                  {ap ? (
                    <span className="truncate text-xs text-slate-400">
                      · {ap.name} Lv{ap.level}
                    </span>
                  ) : (
                    <span className="text-xs text-amber-300">· choosing a Pokémon…</span>
                  )}
                  {ap ? <StatusChip status={ap.status} /> : null}
                </div>
                {ap ? <BattleHpBar current={ap.current_hp} max={ap.max_hp} showNumbers className="mt-0.5" /> : null}
                <p className="text-[10px] text-slate-500">
                  {p.usable_count} usable Pokémon left{p.usable_count === 0 ? " — out of the fight" : ""}
                </p>
              </div>
              <div className="w-20 shrink-0 text-right">
                <p className="font-mono text-sm font-semibold text-volt">{p.damage_dealt}</p>
                <p className="text-[10px] text-slate-500">damage · {share}%</p>
              </div>
            </div>
          );
        })}
      </div>

      {state.encounter.status === "active" && candidates.length > 0 ? (
        <div className="mt-3 flex items-center gap-2">
          <select className={`${adminInput} !py-1 text-xs`} value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">Add a trainer mid-battle…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.username}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={`${adminButtonSecondary} flex shrink-0 items-center gap-1 !px-3 !py-1 text-xs`}
            disabled={!adding || addPlayers.isPending}
            onClick={() =>
              addPlayers.mutate(
                { encounterId: state.encounter.id, playerIds: [adding] },
                {
                  onSuccess: () => {
                    toast("Trainer added — their battle screen is opening", "success");
                    setAdding("");
                  },
                }
              )
            }
          >
            <UserPlus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      ) : null}
    </div>
  );
}

function RewardSummary({ state }: { state: BattleState }) {
  const r = state.reward!;
  return (
    <div className="rounded-xl border border-circuit-violet/30 bg-circuit-violet/[0.06] p-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-100">
        <Gift className="h-4 w-4 text-circuit-violet" /> Rewards given {new Date(r.created_at).toLocaleString()}
      </h3>
      <p className="mb-2 text-xs text-slate-400">
        {formatMoney(r.total_money)} ({r.money_mode.replace("_", " ")}) and {formatXp(r.total_xp)} ({r.xp_mode.replace("_", " ")}) across{" "}
        {r.participant_count} trainer{r.participant_count === 1 ? "" : "s"}.
      </p>
      <div className="overflow-hidden rounded-lg border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium">Trainer</th>
              <th className="px-3 py-1.5 text-right font-medium">Money</th>
              <th className="px-3 py-1.5 text-right font-medium">XP</th>
              <th className="px-3 py-1.5 text-left font-medium">XP went to</th>
            </tr>
          </thead>
          <tbody>
            {r.recipients.map((x) => (
              <tr key={x.id} className="border-t border-white/5">
                <td className="px-3 py-1.5 text-slate-200">{x.username}</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatMoney(x.money)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatXp(x.xp)}</td>
                <td className="px-3 py-1.5 text-slate-300">
                  {x.xp === 0 ? (
                    <span className="text-slate-500">—</span>
                  ) : x.xp_claimed_at ? (
                    <>
                      {x.xp_pokemon_name ?? "a Pokémon"}
                      {x.level_before !== null && x.level_after !== null && x.level_after > x.level_before ? (
                        <span className="text-volt"> (Lv{x.level_before} → Lv{x.level_after})</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-amber-300">Waiting for the trainer to choose</span>
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

function LogCard({ state }: { state: BattleState }) {
  const logs = [...state.logs].reverse();
  return (
    <div className="rounded-xl border border-white/10 bg-[#111623] p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-100">
        <ScrollText className="h-4 w-4" /> Battle log
      </h3>
      {logs.length === 0 ? (
        <p className="text-xs text-slate-500">Nothing has happened yet.</p>
      ) : (
        <div className="max-h-96 space-y-1 overflow-y-auto">
          {logs.map((l) => {
            const damage = l.target_type === "enemy" && l.delta < 0 ? -l.delta : null;
            return (
              <div key={l.id} className="flex items-start justify-between gap-3 rounded-md bg-white/[0.04] px-3 py-1.5 text-xs">
                <span
                  className={cn(
                    "min-w-0",
                    l.action === "faint" ? "text-rotom-red-light" : l.action === "victory" || l.action === "reward" ? "font-semibold text-volt" : "text-slate-300"
                  )}
                >
                  {l.message ?? `${l.target_label}: ${l.previous_kp} → ${l.new_kp}`}
                  {l.is_critical ? <span className="ml-1 text-volt">critical!</span> : null}
                  {l.effectiveness !== null && Number(l.effectiveness) > 1 ? <span className="ml-1 text-orange-300">super effective</span> : null}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {damage ? <span className="font-mono font-semibold text-rotom-red-light">-{damage}</span> : null}
                  <span className="font-mono text-[10px] text-slate-500">
                    {new Date(l.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
