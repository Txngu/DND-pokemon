import * as React from "react";
import { Ban, Crosshair, Flag, Gift, ScrollText, Skull, Swords, Trophy, UserPlus, Users } from "lucide-react";
import { adminButtonDanger, adminButtonPrimary, adminButtonSecondary, adminInput } from "@/components/admin/adminStyles";
import { KpEditor } from "@/components/phone/KpEditor";
import { ConfirmDialog } from "@/components/phone/ConfirmDialog";
import { BattleHpBar, BattleSprite, StatusChip, TypePill } from "@/components/battle/BattleBits";
import { RewardModal } from "@/components/admin/battle/RewardModal";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { formatMoney, formatXp, sum } from "@/lib/battle";
import { useAllProfiles } from "@/hooks/useAdmin";
import {
  useAdminAddBattlePlayers,
  useAdminAdjustEnemyHp,
  useAdminEnemyAttack,
  useAdminSetBattleStatus,
  useBattleState,
} from "@/hooks/useEncounter";
import type { BattleEncounter, BattleEvent, BattleState } from "@/types/database.types";

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
  return hits.map((h) => (h.missed ? `${h.attacker_name}: ${h.move_name} missed` : `${h.attacker_name}: ${h.move_name} → -${h.damage}`)).join(" · ");
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
              Started {new Date(enc.created_at).toLocaleString()} · {state.players.length} trainer{state.players.length === 1 ? "" : "s"} ·{" "}
              {enc.enemy_auto_attack ? "enemies counter-attack" : "enemies attack on your command"} · enemy damage ×{Number(enc.enemy_damage_scale)}
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
  const adjust = useAdminAdjustEnemyHp();
  const attack = useAdminEnemyAttack();
  const active = state.encounter.status === "active";
  const targets = state.players.filter((p) => p.active_pokemon && p.active_pokemon.current_hp > 0 && p.active_pokemon.status !== "fainted");
  const [targetFor, setTargetFor] = React.useState<Record<string, string>>({});

  return (
    <div className="rounded-xl border border-white/10 bg-[#111623] p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-100">
        <Skull className="h-4 w-4" /> Enemies
      </h3>
      <div className="space-y-3">
        {state.enemies.map((e) => (
          <div key={e.id} className={cn("rounded-lg bg-white/5 p-3", e.fainted && "opacity-60")}>
            <div className="flex items-center gap-3">
              <BattleSprite speciesId={e.species_id} spriteUrl={e.sprite_url} alt={e.name} className={cn("h-14 w-14", e.fainted && "grayscale")} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-semibold text-slate-100">{e.name}</p>
                  <span className="font-mono text-[10px] text-slate-400">Lv{e.level}</span>
                  <TypePill type={e.type1} />
                  <TypePill type={e.type2} />
                  {e.fainted ? <span className="text-[10px] font-semibold uppercase text-rotom-red-light">Fainted</span> : null}
                </div>
                <BattleHpBar current={e.current_hp} max={e.max_hp} showNumbers className="mt-1" />
                <p className="text-[10px] text-slate-500">
                  Atk {e.attack} · Def {e.defense} · SpA {e.sp_attack} · SpD {e.sp_defense} · Spe {e.speed}
                </p>
                {e.moves?.length ? <p className="truncate text-[10px] text-slate-500">Moves: {e.moves.map((m) => m.name).join(", ")}</p> : null}
              </div>
            </div>
            {active ? (
              <div className="mt-2 space-y-2">
                <KpEditor
                  compact
                  disabled={adjust.isPending}
                  onAdjust={(delta) => adjust.mutate({ enemyId: e.id, delta }, { onSuccess: () => toast(`${e.name} ${delta > 0 ? "+" : ""}${delta} KP`, "info") })}
                />
                {!e.fainted ? (
                  <div className="flex items-center gap-2">
                    <select
                      className={`${adminInput} !py-1 text-xs`}
                      value={targetFor[e.id] ?? ""}
                      onChange={(ev) => setTargetFor((t) => ({ ...t, [e.id]: ev.target.value }))}
                    >
                      <option value="">Random trainer Pokémon</option>
                      {targets.map((p) => (
                        <option key={p.id} value={p.active_pokemon!.id}>
                          {p.username}&apos;s {p.active_pokemon!.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={attack.isPending || targets.length === 0}
                      className={`${adminButtonDanger} flex shrink-0 items-center gap-1 !px-3 !py-1 text-xs`}
                      onClick={() =>
                        attack.mutate(
                          { encounterId: state.encounter.id, enemyId: e.id, targetPokemonId: targetFor[e.id] || null },
                          { onSuccess: (r) => toast(summarize(r.events), "info") }
                        )
                      }
                    >
                      <Crosshair className="h-3.5 w-3.5" /> Attack
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
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
