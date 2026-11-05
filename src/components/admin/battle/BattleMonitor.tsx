import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  Ban,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Crosshair,
  Dices,
  Flag,
  Gift,
  Pencil,
  ScrollText,
  Skull,
  SkipBack,
  SkipForward,
  Swords,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import { adminButtonDanger, adminButtonPrimary, adminButtonSecondary, adminInput } from "@/components/admin/adminStyles";
import { KpEditor } from "@/components/phone/KpEditor";
import { ConfirmDialog } from "@/components/phone/ConfirmDialog";
import { BattleHpBar, BattleSprite, StatusChip } from "@/components/battle/BattleBits";
import { combatantFor, type Combatant } from "@/components/battle/BattleScreen";
import { useAdminSetPokemonHp } from "@/hooks/usePokemonHp";
import { RewardModal } from "@/components/admin/battle/RewardModal";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { formatMoney, formatXp, sum } from "@/lib/battle";
import { useAllProfiles } from "@/hooks/useAdmin";
import {
  useAdminAddBattlePlayers,
  useAdminAdjustEnemyHp,
  useAdminEditAttackLog,
  useAdminEnemyTurnAttack,
  useAdminMoveTurnEntry,
  useAdminPreviousTurn,
  useAdminResolveCatch,
  useAdminSetBattleStatus,
  useAdminSetEnemyStatus,
  useAdminSetTrainerActive,
  useAdminSetInitiative,
  useAdminSetTurn,
  useAdminSkipTurn,
  useBattleState,
} from "@/hooks/useEncounter";
import type {
  BattleEncounter,
  BattleEnemyState,
  BattleEvent,
  BattleLogEntry,
  BattleState,
  BattleTeamMember,
  PokemonStatus,
} from "@/types/database.types";
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
  const setStatus = useAdminSetEnemyStatus();
  const active = enemies.find((e) => e.id === activeId) ?? null;
  const switchable = enemies.filter((e) => e.id !== activeId && !e.fainted && !e.caught);

  function switchTo(e: BattleEnemyState) {
    if (!trainerRowId) return;
    sendOut.mutate(
      { trainerRowId, enemyId: e.id },
      {
        onSuccess: () =>
          toast(active && !active.fainted ? `${active.name} → withdrawn · ${e.name} → sent out!` : `${title} sends out ${e.name}!`, "info"),
      }
    );
  }

  return (
    <div className="rounded-lg bg-white/[0.04]">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        {speciesId ? <BattleSprite speciesId={speciesId} alt="" className="h-6 w-6" /> : null}
        <span className={cn("text-sm font-semibold", trainerRowId ? "text-rotom-red-light" : "text-slate-100")}>{title}</span>
        <span className="ml-auto text-[11px] text-slate-400">{subtitle}</span>
      </button>
      {open && trainerRowId && battleActive ? (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-2 text-xs">
          <span className="text-slate-400">
            Active: <b className="text-slate-100">{active && !active.fainted ? active.name : "none"}</b>
          </span>
          <select
            className={`${adminInput} ml-auto !w-auto !py-1 text-xs`}
            value=""
            disabled={sendOut.isPending || switchable.length === 0}
            onChange={(ev) => {
              const e = switchable.find((x) => x.id === ev.target.value);
              if (e) switchTo(e);
            }}
            aria-label={`Switch ${title}'s Pokémon`}
          >
            <option value="">{switchable.length ? "Switch Pokémon…" : "No other Pokémon can battle"}</option>
            {switchable.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.current_hp}/{e.max_hp})
              </option>
            ))}
          </select>
        </div>
      ) : null}
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
                      {trainerRowId && !isActive && !e.fainted && !e.caught ? (
                        <span className="rounded bg-white/10 px-1 text-[9px] font-bold uppercase text-slate-400">Bench</span>
                      ) : null}
                      {e.status !== "healthy" && !e.fainted ? <StatusChip status={e.status} /> : null}
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
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        Status
                        <select
                          className={`${adminInput} !w-auto !py-0.5 text-xs`}
                          value={e.status === "fainted" ? "healthy" : e.status}
                          disabled={setStatus.isPending || e.fainted}
                          onChange={(ev) => setStatus.mutate({ enemyId: e.id, status: ev.target.value as PokemonStatus })}
                        >
                          {STATUS_OPTIONS.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </label>
                      {trainerRowId && !isActive && !e.fainted ? (
                        <button type="button" className={`${adminButtonSecondary} !px-3 !py-1 text-xs`} disabled={sendOut.isPending} onClick={() => switchTo(e)}>
                          Switch in {e.name}
                        </button>
                      ) : null}
                      {trainerRowId && e.fainted ? (
                        <span className="text-[11px] text-slate-500">Fainted — raise its KP (revive) to switch it in again.</span>
                      ) : null}
                    </div>
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

/** Status options the Game Master can set (fainting comes from KP). */
const STATUS_OPTIONS: PokemonStatus[] = ["healthy", "poisoned", "burned", "paralyzed", "asleep", "frozen", "confused"];

/**
 * Initiative and turns (PokéGear 12.1 / 14): enter or correct any d20 roll,
 * see whose turn it is and which Pokémon they have out, go to the previous
 * or next turn, give the turn to someone, move someone in the order, and
 * record the attack of the enemy whose turn it is.
 */
function TurnCard({ state }: { state: BattleState }) {
  const setRoll = useAdminSetInitiative();
  const next = useAdminSkipTurn();
  const prev = useAdminPreviousTurn();
  const setTurn = useAdminSetTurn();
  const move = useAdminMoveTurnEntry();
  const enc = state.encounter;
  const order = state.order;
  const current = order.find((o) => o.is_current) ?? null;
  const initiative = enc.phase === "initiative";
  const placed = order.filter((o) => o.position !== null);
  const busy = setRoll.isPending || next.isPending || prev.isPending || setTurn.isPending || move.isPending;
  const c = current ? combatantFor(state, current) : null;

  return (
    <div className="rounded-xl border border-volt/30 bg-volt/[0.04] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-100">
          <Dices className="h-4 w-4 text-volt" />
          {initiative ? "Initiative — waiting for d20 rolls" : `Round ${enc.round}`}
        </h3>
        {!initiative ? (
          <div className="ml-auto flex gap-1.5">
            <button
              type="button"
              className={`${adminButtonSecondary} flex items-center gap-1.5 !px-3 !py-1 text-xs`}
              disabled={busy}
              onClick={() => prev.mutate({ encounterId: enc.id }, { onSuccess: () => toast("Back to the previous turn", "info") })}
            >
              <SkipBack className="h-3.5 w-3.5" /> Previous
            </button>
            <button
              type="button"
              className={`${adminButtonPrimary} flex items-center gap-1.5 !px-3 !py-1 text-xs`}
              disabled={busy || !current}
              onClick={() => next.mutate({ encounterId: enc.id }, { onSuccess: () => toast(`${current?.name ?? "That"}'s turn ended`, "info") })}
            >
              <SkipForward className="h-3.5 w-3.5" /> Next turn
            </button>
          </div>
        ) : null}
      </div>

      {!initiative && current && c ? (
        <div
          className={cn(
            "mb-3 flex flex-wrap items-center gap-3 rounded-lg px-3 py-2",
            c.side === "enemies" ? "bg-rotom-red/15 ring-1 ring-rotom-red/40" : "bg-sky-400/10 ring-1 ring-sky-400/30"
          )}
        >
          <BattleSprite speciesId={c.speciesId} spriteUrl={c.spriteUrl} shiny={c.shiny} alt="" className="h-12 w-12 shrink-0" />
          <div className="min-w-[150px] flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Current turn · place {current.position} · {c.side === "enemies" ? "enemy side" : "players"}
            </p>
            <p className="truncate text-base font-bold text-slate-50">{current.name}</p>
            <p className="truncate text-xs text-slate-300">
              Active Pokémon: <b>{c.pokemonName ?? "none yet"}</b>
              {c.status && c.status !== "healthy" ? <span className="ml-1"><StatusChip status={c.status} /></span> : null}
            </p>
          </div>
          {c.currentHp !== null && c.maxHp ? (
            <div className="w-full sm:w-32 sm:shrink-0">
              <BattleHpBar current={Math.max(0, c.currentHp)} max={c.maxHp} showNumbers />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-1.5">
        {order.map((o) => (
          <RollRow
            key={o.id}
            entry={o}
            combatant={combatantFor(state, o)}
            fighting={!initiative}
            canMoveUp={!initiative && o.position !== null && o.position > 1}
            canMoveDown={!initiative && o.position !== null && o.position < placed.length}
            busy={busy}
            onSet={(roll) =>
              setRoll.mutate(
                { entryId: o.id, roll },
                { onSuccess: () => toast(initiative || o.position === null ? `${o.name}: ${roll}` : `${o.name}'s initiative is now ${roll}`, "success") }
              )
            }
            onGiveTurn={() => setTurn.mutate({ encounterId: enc.id, entryId: o.id }, { onSuccess: () => toast(`It's ${o.name}'s turn`, "info") })}
            onMove={(delta) => move.mutate({ entryId: o.id, position: (o.position ?? 1) + delta })}
          />
        ))}
      </div>
      {initiative ? (
        <p className="mt-2 text-[11px] text-slate-400">
          Trainers type their roll on their phone; you enter one roll per enemy (you can also enter or fix a trainer&apos;s roll). Equal rolls roll
          again. The fight starts automatically when every roll is in — you can still change the order afterwards.
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-slate-400">
          ▲▼ move someone in the order · <b>Turn</b> gives them the turn · fixing a roll moves them to where the new roll belongs. Switching an
          enemy Pokémon never changes the order or the turn.
        </p>
      )}

      {!initiative && (current?.kind === "enemy" || current?.kind === "trainer") ? (
        <EnemyTurnForm
          state={state}
          enemyName={current.kind === "trainer" && c?.pokemonName ? `${current.name}'s ${c.pokemonName}` : current.name}
        />
      ) : null}
      {!initiative && current?.kind === "player" ? (
        <p className="mt-3 text-xs text-slate-400">
          Waiting for {current.name} to act on their phone (attack, item or switch) — their action ends their turn. Use <b>Next turn</b> if they
          do something at the table instead.
        </p>
      ) : null}
    </div>
  );
}

function RollRow({
  entry,
  combatant,
  fighting,
  canMoveUp,
  canMoveDown,
  busy,
  onSet,
  onGiveTurn,
  onMove,
}: {
  entry: BattleState["order"][number];
  combatant: Combatant;
  fighting: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  busy: boolean;
  onSet: (roll: number) => void;
  onGiveTurn: () => void;
  onMove: (delta: number) => void;
}) {
  const [value, setValue] = React.useState("");
  const n = Number(value);
  const valid = value !== "" && Number.isInteger(n) && n >= 1 && n <= 20;
  const dimmed = fighting && !entry.can_act;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg px-3 py-1.5 text-xs",
        entry.is_current ? "bg-volt/20 ring-1 ring-volt/50" : "bg-white/5",
        dimmed && "opacity-45"
      )}
    >
      <span className="w-5 shrink-0 font-mono text-slate-500">{entry.position ?? "–"}</span>
      <BattleSprite speciesId={combatant.speciesId} spriteUrl={combatant.spriteUrl} shiny={combatant.shiny} alt="" className="h-7 w-7 shrink-0" />
      <span className="min-w-[120px] flex-1">
        <span className={cn("block truncate font-medium", entry.kind === "player" ? "text-slate-100" : "text-rotom-red-light")}>
          {entry.name}
          {entry.kind === "trainer" ? <span className="ml-1 text-[10px] text-slate-500">(trainer)</span> : null}
          {entry.is_current ? <span className="ml-1.5 text-[10px] font-bold uppercase text-volt">Now</span> : null}
        </span>
        <span className="block truncate text-[10px] text-slate-400">
          {combatant.pokemonName
            ? `${combatant.pokemonName}${combatant.currentHp !== null && combatant.maxHp ? ` · ${Math.max(0, combatant.currentHp)}/${combatant.maxHp}` : ""}`
            : entry.kind === "player"
              ? "no Pokémon out yet"
              : "—"}
        </span>
      </span>
      <span className="shrink-0 font-mono text-slate-300">
        {entry.rolls.length ? entry.rolls.join(" / ") : "—"}
        {entry.awaiting ? <span className="ml-1 text-amber-300">{entry.rolls.length ? "re-roll" : "waiting"}</span> : null}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1">
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
        {fighting && entry.position !== null ? (
          <>
            <button
              type="button"
              className={`${adminButtonSecondary} !px-1.5 !py-0.5 text-xs`}
              disabled={busy || !canMoveUp}
              onClick={() => onMove(-1)}
              aria-label={`Move ${entry.name} up`}
              title="Move up"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={`${adminButtonSecondary} !px-1.5 !py-0.5 text-xs`}
              disabled={busy || !canMoveDown}
              onClick={() => onMove(1)}
              aria-label={`Move ${entry.name} down`}
              title="Move down"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={`${adminButtonSecondary} !px-2 !py-0.5 text-xs`}
              disabled={busy || entry.is_current || !entry.can_act}
              onClick={onGiveTurn}
              title={`Give the turn to ${entry.name}`}
            >
              Turn
            </button>
          </>
        ) : null}
      </span>
    </div>
  );
}

/** The enemy whose turn it is attacks: target, d20 (optional), Hit/Miss, damage. */
function EnemyTurnForm({ state, enemyName }: { state: BattleState; enemyName: string }) {
  const attack = useAdminEnemyTurnAttack();
  const targets = state.players.filter((p) => p.active_pokemon && p.active_pokemon.current_hp > 0 && p.active_pokemon.status !== "fainted");
  const [targetId, setTargetId] = React.useState("");
  const [dmg, setDmg] = React.useState("");
  const [roll, setRoll] = React.useState("");
  const target = targets.find((p) => p.active_pokemon!.id === targetId) ?? targets[0] ?? null;
  const n = Number(dmg);
  const valid = dmg !== "" && Number.isInteger(n) && n >= 0 && n <= 9999;
  const r = Number(roll);
  const rollValid = roll === "" || (Number.isInteger(r) && r >= 1 && r <= 20);

  function send(hit: boolean, damage: number) {
    if (!target || !rollValid) return;
    attack.mutate(
      { encounterId: state.encounter.id, targetPokemonId: target.active_pokemon!.id, damage, hit, d20: roll === "" ? null : r },
      {
        onSuccess: (res) => {
          toast(summarize(res.events), "info");
          setDmg("");
          setRoll("");
        },
      }
    );
  }

  if (!target) {
    return <p className="mt-3 text-xs text-amber-300">{enemyName} has no target right now — no trainer has a Pokémon out. Use Next turn or wait.</p>;
  }
  const ap = target.active_pokemon!;
  return (
    <div className="mt-3 rounded-lg bg-rotom-red/10 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-rotom-red-light">
        <Crosshair className="h-3.5 w-3.5" /> {enemyName} attacks
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select className={`${adminInput} !w-auto !py-1 text-xs`} value={ap.id} onChange={(e) => setTargetId(e.target.value)} aria-label="Target">
          {targets.map((p) => (
            <option key={p.id} value={p.active_pokemon!.id}>
              {p.username}&apos;s {p.active_pokemon!.name} ({p.active_pokemon!.current_hp}/{p.active_pokemon!.max_hp})
            </option>
          ))}
        </select>
        <input
          className={cn(adminInput, "!w-16 !py-1 text-center text-xs", !rollValid && "!border-rotom-red")}
          inputMode="numeric"
          placeholder="d20"
          aria-label="d20 roll (optional)"
          value={roll}
          onChange={(e) => setRoll(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
        />
        <input
          className={`${adminInput} !w-20 !py-1 text-xs`}
          inputMode="numeric"
          placeholder="Damage"
          aria-label="Damage"
          value={dmg}
          onChange={(e) => setDmg(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
        />
        <button type="button" className={`${adminButtonDanger} !px-3 !py-1 text-xs`} disabled={!valid || !rollValid || attack.isPending} onClick={() => send(true, n)}>
          {valid ? (n === 0 ? "Hit — no damage" : `Hit for ${n}`) : "Hit for …"}
        </button>
        <button type="button" className={`${adminButtonSecondary} !px-3 !py-1 text-xs`} disabled={!rollValid || attack.isPending} onClick={() => send(false, 0)}>
          Miss
        </button>
      </div>
      {!rollValid ? <p className="mt-1 text-[11px] text-rotom-red-light">A d20 roll is 1–20 (or leave it empty).</p> : null}
      {valid && n > 0 ? (
        <p className="mt-1 font-mono text-[11px] text-slate-400">
          {ap.name}: {ap.current_hp}/{ap.max_hp} → {Math.max(0, ap.current_hp - n)}/{ap.max_hp}
          {ap.current_hp - n <= 0 ? " · faints" : ""}
        </p>
      ) : null}
      <p className="mt-1 text-[10px] text-slate-500">The d20 is only written to the log — the app never decides hits or damage.</p>
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
            <div key={p.id} className="rounded-lg bg-white/5 px-3 py-2">
              <div className="flex items-center gap-3">
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
              <PlayerTeam team={p.team ?? []} battleActive={state.encounter.status === "active"} />
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

/** A trainer's Team in the battle: active + bench, with the GM's KP / status tools. */
function PlayerTeam({ team, battleActive }: { team: BattleTeamMember[]; battleActive: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const setHp = useAdminSetPokemonHp();
  const bench = team.filter((m) => !m.is_active);
  if (team.length === 0) return null;
  return (
    <div className="mt-1.5">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200">
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Team ({team.length}) · bench {bench.length}
      </button>
      {open ? (
        <div className="mt-1 space-y-1">
          {[...team]
            .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.party_slot - b.party_slot)
            .map((m) => {
              const down = m.is_dead || m.current_hp <= 0 || m.status === "fainted";
              return (
                <div key={m.id} className={cn("rounded-md bg-white/5", down && "opacity-60")}>
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                    className="flex w-full items-center gap-2 px-2 py-1 text-left"
                    disabled={m.is_dead || !battleActive}
                  >
                    <BattleSprite speciesId={m.species_id} shiny={m.is_shiny} alt={m.name} className={cn("h-7 w-7 shrink-0", down && "grayscale")} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-100">{m.name}</span>
                        <span className="font-mono text-[10px] text-slate-400">Lv{m.level}</span>
                        {m.is_active ? (
                          <span className="rounded bg-volt/20 px-1 text-[9px] font-bold uppercase text-volt">Active</span>
                        ) : (
                          <span className="rounded bg-white/10 px-1 text-[9px] font-bold uppercase text-slate-400">Bench</span>
                        )}
                        <StatusChip status={m.status} />
                        {m.is_dead ? <span className="text-[9px] font-semibold uppercase text-slate-400">Dead</span> : null}
                      </div>
                      <BattleHpBar current={Math.max(0, m.current_hp)} max={m.max_hp} showNumbers className="mt-0.5" />
                    </div>
                  </button>
                  {expanded === m.id && battleActive && !m.is_dead ? (
                    <div className="space-y-1.5 px-2 pb-2">
                      <KpEditor
                        compact
                        disabled={setHp.isPending}
                        onAdjust={(delta) => {
                          const hp = Math.max(0, Math.min(m.max_hp, m.current_hp + delta));
                          if (hp === m.current_hp) return;
                          setHp.mutate(
                            { pokemonId: m.id, currentHp: hp },
                            { onSuccess: () => toast(`${m.name}: ${m.current_hp} → ${hp} KP${m.current_hp === 0 && hp > 0 ? " (revived)" : ""}`, "info") }
                          );
                        }}
                      />
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        Status
                        <select
                          className={`${adminInput} !w-auto !py-0.5 text-xs`}
                          value={m.status === "fainted" ? "healthy" : m.status}
                          disabled={setHp.isPending || down}
                          onChange={(ev) => setHp.mutate({ pokemonId: m.id, currentHp: m.current_hp, status: ev.target.value as PokemonStatus })}
                        >
                          {STATUS_OPTIONS.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                        {down ? <span className="text-slate-500">(raise KP to revive first)</span> : null}
                      </label>
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
  const [editing, setEditing] = React.useState<string | null>(null);
  const active = state.encounter.status === "active";
  return (
    <div className="rounded-xl border border-white/10 bg-[#111623] p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-100">
        <ScrollText className="h-4 w-4" /> Battle log
        {active ? <span className="ml-auto text-[11px] font-normal text-slate-500">Click ✎ on an attack to correct it</span> : null}
      </h3>
      {logs.length === 0 ? (
        <p className="text-xs text-slate-500">Nothing has happened yet.</p>
      ) : (
        <div className="max-h-[28rem] space-y-1 overflow-y-auto">
          {logs.map((l) => {
            const isAttack = (l.action === "attack" || l.action === "enemy_attack") && l.hit !== null && l.damage !== null;
            return (
              <div key={l.id} className="rounded-md bg-white/[0.04] px-3 py-1.5 text-xs">
                <div className="flex items-start gap-3">
                  <span className="w-8 shrink-0 font-mono text-[10px] text-slate-500">{l.round ? `R${l.round}` : "—"}</span>
                  <span
                    className={cn(
                      "min-w-0 flex-1",
                      l.action === "faint"
                        ? "text-rotom-red-light"
                        : l.action === "victory" || l.action === "reward"
                          ? "font-semibold text-volt"
                          : l.action === "trainer_switch" || l.action === "switch"
                            ? "text-sky-200"
                            : l.action === "correction"
                              ? "text-amber-200"
                              : l.action === "turn" || l.action === "round" || l.action === "skip"
                                ? "text-slate-500"
                                : "text-slate-300"
                    )}
                  >
                    {l.message ?? `${l.target_label}: ${l.previous_kp} → ${l.new_kp}`}
                    {l.edited_at ? <span className="ml-1 text-[10px] text-amber-300">(corrected)</span> : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {isAttack ? (
                      <span className={cn("font-mono font-semibold", l.hit ? "text-rotom-red-light" : "text-slate-400")}>
                        {l.hit ? `Hit −${l.damage}` : "Miss"}
                      </span>
                    ) : null}
                    <span className="font-mono text-[10px] text-slate-500">
                      {new Date(l.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                    {isAttack && active ? (
                      <button
                        type="button"
                        className="rounded px-1 text-slate-400 hover:bg-white/10 hover:text-slate-100"
                        onClick={() => setEditing(editing === l.id ? null : l.id)}
                        aria-label="Correct this attack"
                        title="Correct this attack"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </span>
                </div>
                {editing === l.id ? <AttackCorrection log={l} onDone={() => setEditing(null)} /> : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Correct one attack: new d20 / Hit or Miss / damage. The target's KP moves by the difference. */
function AttackCorrection({ log, onDone }: { log: BattleLogEntry; onDone: () => void }) {
  const edit = useAdminEditAttackLog();
  const [roll, setRoll] = React.useState(log.d20 ? String(log.d20) : "");
  const [hit, setHit] = React.useState<boolean>(!!log.hit);
  const [dmg, setDmg] = React.useState(String(log.damage ?? 0));
  const r = Number(roll);
  const rollValid = roll === "" || (Number.isInteger(r) && r >= 1 && r <= 20);
  const n = Number(dmg);
  const dmgValid = !hit || (dmg !== "" && Number.isInteger(n) && n >= 0 && n <= 9999);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-amber-300/[0.06] p-2">
      <span className="text-[11px] text-slate-400">
        {log.attacker_label} → {log.target_label}:
      </span>
      <input
        className={cn(adminInput, "!w-14 !py-0.5 text-center text-xs", !rollValid && "!border-rotom-red")}
        inputMode="numeric"
        placeholder="d20"
        aria-label="d20"
        value={roll}
        onChange={(e) => setRoll(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
      />
      <div className="flex overflow-hidden rounded-md border border-white/10 text-xs">
        <button type="button" className={cn("px-2 py-0.5", hit ? "bg-rotom-red/30 text-white" : "text-slate-400")} onClick={() => setHit(true)}>
          Hit
        </button>
        <button type="button" className={cn("px-2 py-0.5", !hit ? "bg-white/15 text-white" : "text-slate-400")} onClick={() => setHit(false)}>
          Miss
        </button>
      </div>
      {hit ? (
        <input
          className={cn(adminInput, "!w-20 !py-0.5 text-xs", !dmgValid && "!border-rotom-red")}
          inputMode="numeric"
          placeholder="Damage"
          aria-label="Damage"
          value={dmg}
          onChange={(e) => setDmg(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
        />
      ) : null}
      <button
        type="button"
        className={`${adminButtonPrimary} !px-3 !py-0.5 text-xs`}
        disabled={!rollValid || !dmgValid || edit.isPending}
        onClick={() =>
          edit.mutate(
            { logId: log.id, d20: roll === "" ? null : r, hit, damage: hit ? n : 0 },
            {
              onSuccess: (res) => {
                toast(`${log.target_label}: ${res.hp_before} → ${res.hp_after} KP`, "success");
                onDone();
              },
            }
          )
        }
      >
        Save correction
      </button>
      <button type="button" className={`${adminButtonSecondary} !px-3 !py-0.5 text-xs`} onClick={onDone}>
        Cancel
      </button>
      <p className="w-full text-[10px] text-slate-500">
        The target&apos;s KP is changed by the difference (now recorded: {log.hit ? `hit for ${log.damage}` : "miss"}).
      </p>
    </div>
  );
}
