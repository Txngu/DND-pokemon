import * as React from "react";
import { AnimatePresence, motion, useAnimationControls, type AnimationControls, type TargetAndTransition } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Backpack, ChevronDown, ChevronLeft, Dices, Swords, Trophy, Users, Zap, Skull, X } from "lucide-react";
import { StatusBar } from "@/components/phone/StatusBar";
import { ItemIcon } from "@/components/phone/ItemIcon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { describeItemEffect, itemUsableOn } from "@/lib/battle";
import { useBattleAction, useBattleState, useSubmitInitiative, type BattleAction } from "@/hooks/useEncounter";
import {
  BattleHpBar,
  BattleSprite,
  FloaterLayer,
  StatusChip,
  TypePill,
  sleep,
  type Floater,
} from "@/components/battle/BattleBits";
import { toast } from "@/lib/toast";
import type {
  BattleBall,
  BattleBagItem,
  BattleEnemyState,
  BattleEvent,
  BattlePartyPokemon,
  BattleState,
  BattleTurnEntry,
  PokemonStatus,
} from "@/types/database.types";

type Panel = "main" | "fight" | "bag" | "party" | "field";

interface Overrides {
  enemyHp: Record<string, number>;
  myHp: Record<string, number>;
  myStatus: Record<string, PokemonStatus>;
  activeId?: string | null;
  /** PokéGear 13.1: which enemies stand in the arena during a playback, so a
   *  live refresh can't swap a trainer's Pokémon before the animation does. */
  arenaIds?: string[];
  /** PokéGear 14: a trainer's next Pokémon, known from the playback before
   *  the refresh (players can't see a trainer's bench). */
  sentOut?: Record<string, BattleEnemyState>;
}

const NO_OVERRIDES: Overrides = { enemyHp: {}, myHp: {}, myStatus: {} };

interface Message {
  text: string;
  sub?: string | null;
  tone?: "error";
}

/**
 * The trainer's battle screen for an admin-created encounter, played like
 * the table plays it (PokéGear 12.1): everyone rolls a d20 for initiative,
 * then turns go from the highest roll down. On your turn you do one thing —
 * attack (pick a target, Hit or Miss, type the damage your card does), use
 * an item, or switch. The app never calculates damage; the server checks
 * whose turn it is and applies what was typed. Results are played back as
 * an animation (lunge, hit, floating number, HP drain, faint).
 */
export function BattleScreen({ encounterId }: { encounterId: string }) {
  const navigate = useNavigate();
  const { data: state, isLoading, error, refetch } = useBattleState(encounterId);
  const action = useBattleAction();

  const [panel, setPanel] = React.useState<Panel>("main");
  const [targetId, setTargetId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<Message | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [ov, setOv] = React.useState<Overrides>(NO_OVERRIDES);
  const [floaters, setFloaters] = React.useState<Floater[]>([]);
  const [pendingItem, setPendingItem] = React.useState<BattleBagItem | null>(null);
  const [pendingBall, setPendingBall] = React.useState<BattleBall | null>(null);
  const [introDone, setIntroDone] = React.useState(false);
  const submitRoll = useSubmitInitiative();

  const playerCtl = useAnimationControls();
  const enemyCtls = React.useRef(new Map<string, AnimationControls>());
  const floaterSeq = React.useRef(0);

  const registerEnemy = React.useCallback((id: string, ctl: AnimationControls | null) => {
    if (ctl) enemyCtls.current.set(id, ctl);
    else enemyCtls.current.delete(id);
  }, []);

  const pop = React.useCallback((targetId: string, text: string, tone: Floater["tone"]) => {
    const id = ++floaterSeq.current;
    setFloaters((f) => [...f, { id, targetId, text, tone }]);
    window.setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 1400);
  }, []);

  // ---------------------------------------------------------------------
  // Derived view of the battle, with playback overrides layered on top.
  // ---------------------------------------------------------------------
  const me = state?.me;
  const enemies: BattleEnemyState[] = React.useMemo(() => {
    const known = state?.enemies ?? [];
    const extra = Object.values(ov.sentOut ?? {}).filter((x) => !known.some((e) => e.id === x.id));
    return [...known, ...extra].map((e) => {
      const hp = ov.enemyHp[e.id] ?? e.current_hp;
      return { ...e, current_hp: hp, fainted: hp <= 0 };
    });
  }, [state?.enemies, ov.enemyHp, ov.sentOut]);
  const party: BattlePartyPokemon[] = React.useMemo(
    () =>
      (me?.party ?? []).map((p) => ({
        ...p,
        current_hp: ov.myHp[p.id] ?? p.current_hp,
        status: ov.myStatus[p.id] ?? p.status,
      })),
    [me?.party, ov.myHp, ov.myStatus]
  );
  const activeId = ov.activeId !== undefined ? ov.activeId : me?.active_pokemon_id ?? null;
  const active = party.find((p) => p.id === activeId) ?? null;
  const activeDown = !!active && (active.status === "fainted" || active.current_hp <= 0 || active.is_dead);
  const usable = party.filter((p) => !p.is_dead && p.status !== "fainted" && p.current_hp > 0);
  const status = state?.encounter.status;
  const over = status !== "active";
  // PokéGear 13: only Pokémon on the field (wild ones, and each enemy
  // trainer's active Pokémon) can be attacked; caught ones have left.
  const aliveEnemies = enemies.filter((e) => !e.fainted && e.on_field);
  // (on_field comes from the server state, which only refreshes after a
  // playback, so a Pokémon that faints on screen stays for its animation.)
  // PokéGear 13.1: during my own playback the arena line-up is held by the
  // animation (an enemy trainer's next Pokémon walks in on its "sends out"
  // step); otherwise it follows the live server state.
  const arenaEnemies = ov.arenaIds
    ? ov.arenaIds.map((id) => enemies.find((e) => e.id === id)).filter((e): e is BattleEnemyState => !!e && !e.caught)
    : enemies.filter((e) => !e.caught && e.on_field);
  const shownEnemies = arenaEnemies.slice(0, 6);
  const hiddenCount = arenaEnemies.length - shownEnemies.length;
  const target = aliveEnemies.find((e) => e.id === targetId) ?? aliveEnemies[0] ?? null;
  // Enemy trainers' benches are hidden from players, so count from the trainers.
  const wildEnemies = enemies.filter((e) => !e.enemy_trainer_id);
  const enemyTotals = {
    total: wildEnemies.length + (state?.enemy_trainers ?? []).reduce((n, t) => n + t.total, 0),
    left: wildEnemies.filter((e) => !e.fainted && !e.caught).length + (state?.enemy_trainers ?? []).reduce((n, t) => n + t.remaining, 0),
  };
  const trainerOf = (e: BattleEnemyState | null) => (e?.enemy_trainer_id ? state?.enemy_trainers.find((t) => t.id === e.enemy_trainer_id) ?? null : null);
  const catchable = enemies.filter((e) => e.catchable);
  const myCatches = state?.catches.filter((c) => c.profile_id === me?.profile_id) ?? [];
  const waitingCatches = myCatches.filter((c) => c.status === "pending");
  const allies = (state?.players ?? []).filter((p) => p.profile_id !== me?.profile_id);
  const busy = playing || action.isPending;

  // Catch results arrive live when the Game Master decides.
  const catchStatus = React.useRef<Map<string, string> | null>(null);
  React.useEffect(() => {
    if (!state) return;
    const mine = state.catches.filter((c) => c.profile_id === me?.profile_id);
    const prev = catchStatus.current;
    if (prev) {
      for (const c of mine) {
        if (prev.get(c.id) === "pending" && c.status !== "pending") {
          if (c.status === "caught") {
            setMessage({ text: `🎉 ${c.pokemon_name} was caught!`, sub: "Check your Team or PC." });
            toast(`🎉 You caught ${c.pokemon_name}!`, "success");
          } else if (c.status === "not_caught") {
            setMessage({ text: `${c.pokemon_name} escaped!`, sub: `Your ${c.ball_name ?? "Poké Ball"} didn't hold it.` });
          } else {
            setMessage({ text: `${c.pokemon_name} was caught by someone else.` });
          }
          window.setTimeout(() => setMessage(null), 3500);
        }
      }
    }
    catchStatus.current = new Map(mine.map((c) => [c.id, c.status]));
  }, [state, me?.profile_id]);

  // PokéGear 13.1: an enemy trainer's Pokémon switching in because of
  // someone else (another trainer's knockout, the Game Master) is announced
  // too. My own turns announce it during playback instead.
  const prevTrainerActive = React.useRef<Map<string, string | null> | null>(null);
  React.useEffect(() => {
    if (!state) return;
    const prev = prevTrainerActive.current;
    if (prev && !playing) {
      for (const t of state.enemy_trainers) {
        if (!prev.has(t.id) || !t.active_enemy_id || prev.get(t.id) === t.active_enemy_id) continue;
        const sent = state.enemies.find((e) => e.id === t.active_enemy_id);
        if (!sent) continue;
        // "Brock withdraws Geodude and sends out Onix!" when the GM switched.
        const logLine = [...state.logs].reverse().find((l) => l.action === "trainer_switch" && l.enemy_id === sent.id)?.message;
        const text = logLine ?? `${t.name} sends out ${sent.name}!`;
        setMessage({ text });
        window.setTimeout(() => setMessage((m) => (m?.text === text ? null : m)), 2500);
      }
    }
    prevTrainerActive.current = new Map(state.enemy_trainers.map((t) => [t.id, t.active_enemy_id]));
  }, [state, playing]);

  // Enemies already shown once don't play their entrance again; anything
  // that arrives later (a trainer's next Pokémon) does.
  const seenEnemies = React.useRef<Set<string> | null>(null);
  const shownIds = shownEnemies.map((e) => e.id).join(",");
  React.useEffect(() => {
    if (!state) return;
    if (!seenEnemies.current) seenEnemies.current = new Set();
    for (const id of shownIds.split(",")) if (id) seenEnemies.current.add(id);
  }, [state, shownIds]);

  // Turn order (initiative)
  const order: BattleTurnEntry[] = state?.order ?? [];
  const phase = state?.encounter.phase ?? "fighting";
  const myEntry = order.find((o) => o.battle_player_id === me?.battle_player_id) ?? null;
  const current = order.find((o) => o.is_current) ?? null;
  const myTurn = phase === "fighting" && !!me && current?.battle_player_id === me.battle_player_id;
  const needsRoll = !!myEntry && myEntry.awaiting && (phase === "initiative" || myEntry.position === null);

  // Keep a valid target selected.
  React.useEffect(() => {
    if (target && target.id !== targetId) setTargetId(target.id);
  }, [target, targetId]);

  // Intro message, once per mount.
  React.useEffect(() => {
    if (!state || introDone) return;
    setIntroDone(true);
    const startLog = state.logs.find((l) => l.action === "start");
    if (!me?.active_pokemon_id && state.encounter.status === "active") {
      setMessage({ text: startLog?.message ?? `A wild ${state.encounter.enemy_name} appeared!` });
      window.setTimeout(() => {
        setMessage(null);
        setPanel("party");
      }, 1600);
    }
  }, [state, introDone, me?.active_pokemon_id]);

  // When there's no Pokémon out yet, or mine just went down, open the party
  // picker — once per knockout, so the trainer can still back out and use a
  // Revive from the Bag instead.
  const forcedFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    const key = !activeId ? "none" : activeDown ? `down-${activeId}` : null;
    if (!key) {
      forcedFor.current = null;
      return;
    }
    if (!busy && !over && state && usable.length > 0 && introDone && forcedFor.current !== key) {
      forcedFor.current = key;
      setPanel("party");
    }
  }, [busy, over, state, activeDown, activeId, usable.length, introDone]);

  // Damage that happens without me acting (other trainers' attacks, GM
  // actions) still gets a floating number.
  const prevEnemyHp = React.useRef<Record<string, number>>({});
  const prevMyHp = React.useRef<Record<string, number>>({});
  React.useEffect(() => {
    if (!state) return;
    if (!playing) {
      for (const e of state.enemies) {
        const before = prevEnemyHp.current[e.id];
        if (before !== undefined && e.current_hp < before) {
          pop(e.id, `-${before - e.current_hp}`, "damage");
          enemyCtls.current.get(e.id)?.start(hitShake);
        }
      }
      for (const p of state.me?.party ?? []) {
        const before = prevMyHp.current[p.id];
        if (before !== undefined && p.current_hp < before && p.id === state.me?.active_pokemon_id) {
          pop(p.id, `-${before - p.current_hp}`, "damage");
          playerCtl.start(hitShake);
        }
      }
    }
    prevEnemyHp.current = Object.fromEntries(state.enemies.map((e) => [e.id, e.current_hp]));
    prevMyHp.current = Object.fromEntries((state.me?.party ?? []).map((p) => [p.id, p.current_hp]));
  }, [state, playing, pop, playerCtl]);

  // ---------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------
  async function playEvents(events: BattleEvent[]) {
    const myProfile = me?.profile_id;
    for (const ev of events) {
      switch (ev.type) {
        case "switch": {
          setMessage({ text: ev.message });
          if (ev.profile_id === myProfile) {
            if (activeId) await playerCtl.start({ scale: 0.2, opacity: 0, transition: { duration: 0.25 } });
            setOv((o) => ({ ...o, activeId: ev.pokemon_id }));
            await sleep(60);
            await playerCtl.start({ scale: [0.2, 1.12, 1], opacity: 1, y: 0, transition: { duration: 0.45 } });
          }
          await sleep(500);
          break;
        }
        case "attack": {
          setMessage({ text: ev.message });
          await sleep(350);
          const attackerCtl = ev.side === "player" ? playerCtl : enemyCtls.current.get(ev.attacker_id ?? "");
          const targetCtl = ev.side === "player" ? enemyCtls.current.get(ev.target_id ?? "") : playerCtl;
          await attackerCtl?.start(ev.side === "player" ? playerLunge : enemyLunge);
          if (ev.missed) {
            pop(ev.target_id!, "Miss", "miss");
          } else if ((ev.damage ?? 0) === 0) {
            pop(ev.target_id!, "No effect", "immune");
          } else {
            const tone: Floater["tone"] = ev.critical
              ? "crit"
              : (ev.effectiveness ?? 1) > 1
                ? "super"
                : (ev.effectiveness ?? 1) < 1
                  ? "weak"
                  : "damage";
            targetCtl?.start(hitShake);
            pop(ev.target_id!, `-${ev.damage}`, tone);
            await sleep(320);
            if (ev.side === "player") {
              setOv((o) => ({ ...o, enemyHp: { ...o.enemyHp, [ev.target_id!]: ev.hp_after! } }));
            } else {
              setOv((o) => ({ ...o, myHp: { ...o.myHp, [ev.target_id!]: ev.hp_after! } }));
            }
          }
          await sleep(650);
          if (ev.detail) {
            setMessage({ text: ev.detail });
            await sleep(900);
          }
          break;
        }
        case "faint": {
          setMessage({ text: ev.message });
          const ctl = ev.side === "enemy" ? enemyCtls.current.get(ev.target_id ?? "") : playerCtl;
          if (ev.side === "player") {
            setOv((o) => ({ ...o, myHp: { ...o.myHp, [ev.target_id!]: 0 }, myStatus: { ...o.myStatus, [ev.target_id!]: "fainted" } }));
          }
          await ctl?.start({ y: 48, opacity: 0, transition: { duration: 0.6, ease: "easeIn" } });
          await sleep(700);
          break;
        }
        case "enemy_switch": {
          // The trainer's fainted Pokémon leaves and the next one walks in
          // (EnemySlot plays the entrance when it first appears).
          setMessage({ text: ev.message });
          const trainerId = ev.trainer_id;
          const newId = ev.enemy_id;
          const sent = ev.enemy;
          if (newId) {
            setOv((o) => {
              const sentOut = sent ? { ...(o.sentOut ?? {}), [sent.id]: sent } : o.sentOut;
              const ids = o.arenaIds ?? [];
              const keep = ids.filter((id) => id !== newId && enemies.find((e) => e.id === id)?.enemy_trainer_id !== trainerId);
              const at = ids.findIndex((id) => enemies.find((e) => e.id === id)?.enemy_trainer_id === trainerId);
              const next = [...keep];
              next.splice(at < 0 ? next.length : Math.min(at, next.length), 0, newId);
              return { ...o, arenaIds: next, sentOut };
            });
          }
          await sleep(1200);
          break;
        }
        case "item": {
          setMessage({ text: ev.message });
          await sleep(450);
          const gain = (ev.hp_after ?? 0) - (ev.hp_before ?? 0);
          if (gain > 0) pop(ev.pokemon_id!, `+${gain}`, "heal");
          setOv((o) => ({
            ...o,
            myHp: { ...o.myHp, [ev.pokemon_id!]: ev.hp_after! },
            myStatus: { ...o.myStatus, [ev.pokemon_id!]: ev.status_after ?? "healthy" },
          }));
          if (ev.revived && ev.pokemon_id === activeId) {
            await playerCtl.start({ y: 0, opacity: 1, scale: [0.6, 1.1, 1], transition: { duration: 0.5 } });
          }
          await sleep(600);
          if (ev.detail) {
            setMessage({ text: ev.detail });
            await sleep(900);
          }
          break;
        }
        case "chip": {
          setMessage({ text: ev.message });
          playerCtl.start(hitShake);
          pop(ev.pokemon_id!, `-${ev.damage}`, "damage");
          await sleep(300);
          setOv((o) => ({ ...o, myHp: { ...o.myHp, [ev.pokemon_id!]: ev.hp_after! } }));
          await sleep(900);
          break;
        }
        case "blocked":
        case "status": {
          setMessage({ text: ev.message });
          await sleep(1000);
          break;
        }
        case "victory":
        case "defeat": {
          setMessage({ text: ev.message });
          await sleep(1400);
          break;
        }
      }
    }
  }

  async function run(act: BattleAction) {
    if (busy || !state) return;
    setPanel("main");
    setPlaying(true);
    // Freeze what's on screen so the refetch that follows the action can't
    // jump the bars to their final values before the animation gets there.
    setOv({
      enemyHp: Object.fromEntries(enemies.map((e) => [e.id, e.current_hp])),
      myHp: Object.fromEntries(party.map((p) => [p.id, p.current_hp])),
      myStatus: Object.fromEntries(party.map((p) => [p.id, p.status])),
      activeId,
      arenaIds: arenaEnemies.map((e) => e.id),
    });
    try {
      const result = await action.mutateAsync(act);
      await playEvents(result.events ?? []);
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "That didn't work.", tone: "error" });
      await sleep(2200);
    } finally {
      await refetch();
      // Sprites that fainted/shrank during playback come back if the
      // server says they're still standing.
      playerCtl.set({ y: 0, opacity: 1, scale: 1, x: 0 });
      for (const [id, ctl] of enemyCtls.current) {
        const e = enemies.find((x) => x.id === id);
        if (e) ctl.set({ x: 0, y: 0, opacity: 1, scale: 1 });
      }
      setOv(NO_OVERRIDES);
      setMessage(null);
      setPlaying(false);
    }
  }

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  if (isLoading || !state) {
    return (
      <div className="flex h-full flex-col gap-3 p-5 pt-14">
        {error ? (
          <p className="text-center text-sm text-rotom-red-light">{(error as Error).message}</p>
        ) : (
          <>
            <Skeleton className="h-64 w-full rounded-3xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-28 w-full rounded-2xl" />
          </>
        )}
      </div>
    );
  }

  const idleText = over
    ? status === "completed"
      ? "Victory!"
      : status === "lost"
        ? "The battle was lost…"
        : "The battle has ended."
    : needsRoll
      ? (myEntry?.rolls.length ?? 0) > 0
        ? "It's a tie — roll your d20 again!"
        : "Roll your d20 for initiative!"
      : phase === "initiative"
        ? "Waiting for everyone's initiative roll…"
        : !active
      ? "Choose a Pokémon to send out!"
      : activeDown
        ? usable.length
          ? `${active.name} can't fight. Choose another Pokémon!`
          : "You're out of usable Pokémon — your allies fight on!"
        : myTurn
          ? `Your turn! What will ${active.name} do?`
          : `Waiting — it's ${current?.name ?? "someone else"}'s turn.`;
  const lastLog = [...state.logs].reverse().find((l) => l.message && l.actor_profile_id !== me?.profile_id);
  const shown: Message = message ?? { text: idleText, sub: lastLog?.message ?? null };

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <StatusBar />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-2">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex h-9 w-9 touch-manipulation items-center justify-center rounded-full bg-white/5 text-mist active:bg-white/10"
          aria-label="Minimize battle"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-semibold text-mist">{state.encounter.name}</p>
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-mist/50">
            <span className={cn("h-1.5 w-1.5 rounded-full", over ? "bg-mist/40" : "animate-pulse bg-emerald-400")} />
            {over ? "Finished" : "Live battle"}
            {state.players.length > 1 ? ` · ${state.players.length} trainers` : ""}
          </p>
        </div>
        {me ? (
          <div className="shrink-0 rounded-full bg-white/5 px-2.5 py-1 font-mono text-[10px] text-mist/70" title="Damage you've dealt">
            <Zap className="mr-0.5 inline h-3 w-3 text-volt" />
            {me.damage_dealt}
          </div>
        ) : null}
      </div>

      <TurnStrip state={state} order={order} phase={phase} round={state.encounter.round} meId={me?.battle_player_id ?? null} />
      {waitingCatches.length ? (
        <p className="mx-3 mt-1.5 rounded-xl bg-sky-400/15 px-3 py-1.5 text-[11px] text-sky-200">
          ⏳ Waiting for the Game Master: {waitingCatches.map((c) => c.pokemon_name).join(", ")}
        </p>
      ) : null}

      {/* Arena */}
      <div className="relative mx-3 mt-2 h-[36%] min-h-[190px] shrink-0 overflow-hidden rounded-3xl ring-1 ring-white/10">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#2b2f6b_0%,#4a4f9a_38%,#6aa37a_62%,#3f7a52_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(120%_70%_at_50%_0%,rgba(255,255,255,0.18),transparent_60%)]" />
        <div className="absolute inset-x-0 top-[58%] h-px bg-white/15" />

        {/* Enemy side */}
        <div className={cn("absolute right-2 top-[16%] flex h-[42%] items-end justify-center", shownEnemies.length > 3 ? "w-[50%]" : "w-[60%]")}>
          <div className="absolute bottom-0 h-[22%] w-[92%] rounded-[50%] bg-[radial-gradient(closest-side,rgba(0,0,0,0.35),rgba(0,0,0,0.05))]" />
          <div className="relative flex h-full w-full flex-wrap content-end items-end justify-center">
            {hiddenCount > 0 ? (
              <span className="absolute -top-5 right-0 z-10 rounded-full bg-screen-ink/80 px-2 py-0.5 text-[10px] text-mist/80">+{hiddenCount} more</span>
            ) : null}
            <AnimatePresence initial={false}>
            {shownEnemies.map((e) => (
              <EnemySlot
                key={e.id}
                enemy={e}
                count={shownEnemies.length}
                selected={e.id === target?.id && aliveEnemies.length > 1}
                onSelect={() => !e.fainted && setTargetId(e.id)}
                register={registerEnemy}
                floaters={floaters}
                entering={!!seenEnemies.current && !seenEnemies.current.has(e.id)}
              />
            ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Enemy info box */}
        {target ? (
          <div className="absolute left-2 top-2 w-[46%] rounded-xl bg-screen-ink/80 p-2 shadow-glass ring-1 ring-white/10 backdrop-blur">
            {trainerOf(target) ? (
              <p className="truncate text-[9px] uppercase tracking-wide text-rotom-red-light">
                {trainerOf(target)!.name} · {trainerOf(target)!.remaining}/{trainerOf(target)!.total} left
              </p>
            ) : null}
            <div className="flex items-baseline justify-between gap-1">
              <p className="truncate font-display text-[13px] font-semibold text-mist">{target.name}</p>
              <span className="shrink-0 font-mono text-[10px] text-mist/60">Lv{target.level}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1">
              <TypePill type={target.type1} />
              <TypePill type={target.type2} />
              {target.status !== "healthy" ? <StatusChip status={target.status} /> : null}
            </div>
            <BattleHpBar current={target.current_hp} max={target.max_hp} className="mt-1.5" />
            {enemyTotals.total > 12 || (state.enemy_trainers.length > 0 && enemyTotals.total > 1) ? (
              <p className="mt-1 text-[10px] text-mist/55">
                {enemyTotals.left} of {enemyTotals.total} enemies left
              </p>
            ) : null}
            {state.enemy_trainers.length === 0 && enemies.length > 1 && enemies.length <= 12 ? (
              <div className="mt-1.5 flex gap-1">
                {enemies.map((e) => (
                  <span
                    key={e.id}
                    className={cn(
                      "h-1.5 flex-1 rounded-full",
                      e.fainted || e.caught ? "bg-white/15" : e.id === target.id ? "bg-volt" : "bg-emerald-400/70"
                    )}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Player side */}
        <div className="absolute bottom-[4%] left-1 flex h-[46%] w-[48%] items-end justify-center">
          <div className="absolute bottom-0 h-[20%] w-[95%] rounded-[50%] bg-[radial-gradient(closest-side,rgba(0,0,0,0.4),rgba(0,0,0,0.05))]" />
          <motion.div className="relative h-full w-full" animate={playerCtl} initial={{ opacity: 1 }}>
            {active ? (
              <BattleSprite
                speciesId={active.species_id}
                shiny={active.is_shiny}
                back
                alt={active.name}
                className={cn("h-full w-full", activeDown && "opacity-0")}
              />
            ) : null}
            <FloaterLayer floaters={floaters} targetId={active?.id} />
          </motion.div>
        </div>

        {/* Player info box */}
        {active ? (
          <div className="absolute bottom-2 right-2 w-[48%] rounded-xl bg-screen-ink/80 p-2 shadow-glass ring-1 ring-white/10 backdrop-blur">
            <div className="flex items-baseline justify-between gap-1">
              <p className="truncate font-display text-[13px] font-semibold text-mist">{active.name}</p>
              <span className="shrink-0 font-mono text-[10px] text-mist/60">Lv{active.level}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1">
              <TypePill type={active.type1} />
              <TypePill type={active.type2} />
              <StatusChip status={active.status} />
            </div>
            <BattleHpBar current={Math.max(0, active.current_hp)} max={active.max_hp} showNumbers className="mt-1" />
          </div>
        ) : null}

        {/* Allies */}
        {allies.length > 0 ? (
          <div className="absolute left-2 top-[44%] flex max-w-[50%] flex-col gap-1">
            {allies.slice(0, 5).map((a) => (
              <div key={a.id} className="flex items-center gap-1 rounded-full bg-screen-ink/70 py-0.5 pl-0.5 pr-2 ring-1 ring-white/10">
                {a.active_pokemon ? (
                  <BattleSprite speciesId={a.active_pokemon.species_id} shiny={a.active_pokemon.is_shiny} alt="" className="h-5 w-5" />
                ) : (
                  <Users className="m-0.5 h-4 w-4 text-mist/40" />
                )}
                <span className="max-w-[86px] truncate text-[9px] text-mist/70">
                  {a.username}
                  {a.active_pokemon ? <span className="text-mist/45"> · {a.active_pokemon.name}</span> : null}
                </span>
                {a.active_pokemon ? (
                  <span
                    className={cn(
                      "font-mono text-[9px]",
                      a.active_pokemon.current_hp <= 0 ? "text-mist/40" : "text-emerald-300"
                    )}
                  >
                    {a.active_pokemon.current_hp}/{a.active_pokemon.max_hp}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <AnimatePresence>{over && !playing ? <FinishedOverlay state={state} /> : null}</AnimatePresence>
      </div>

      {/* Message box */}
      <div className="mx-3 mt-2 min-h-[64px] rounded-2xl border border-white/10 bg-screen-ink/80 px-4 py-2.5 shadow-glass">
        <AnimatePresence mode="wait">
          <motion.div key={shown.text} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <p className={cn("text-sm font-medium leading-snug", shown.tone === "error" ? "text-rotom-red-light" : "text-mist")}>
              {shown.tone === "error" ? "⚠️ " : ""}
              {shown.text}
            </p>
            {shown.sub ? <p className="mt-0.5 line-clamp-1 text-[11px] text-mist/45">{shown.sub}</p> : null}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="relative min-h-0 flex-1 px-3 pb-3 pt-2">
        {over ? (
          <div className="flex h-full flex-col gap-2">
            <BattleLog state={state} className="flex-1" />
            <button
              type="button"
              onClick={() => navigate("/")}
              className="touch-manipulation rounded-2xl bg-white/10 py-3 text-sm font-semibold text-mist active:scale-[0.98]"
            >
              Back to home
            </button>
          </div>
        ) : needsRoll && myEntry ? (
          <InitiativePanel
            entry={myEntry}
            order={order}
            busy={submitRoll.isPending}
            onSubmit={(roll) =>
              submitRoll.mutate(
                { encounterId, roll },
                { onError: (e) => setMessage({ text: e instanceof Error ? e.message : "That didn't work.", tone: "error" }) }
              )
            }
            onChoosePokemon={!activeId ? () => setPanel("party") : undefined}
          />
        ) : panel === "main" ? (
          <div className="grid h-full max-h-[150px] grid-cols-2 gap-2">
            <MainButton
              label="Attack"
              icon={<Swords className="h-5 w-5" />}
              className="bg-gradient-to-br from-rotom-red to-rotom-red-dark text-white"
              disabled={busy || !myTurn || !active || activeDown || aliveEnemies.length === 0}
              onClick={() => setPanel("fight")}
            />
            <MainButton
              label="Bag"
              icon={<Backpack className="h-5 w-5" />}
              className="bg-gradient-to-br from-amber-400 to-amber-600 text-screen-ink"
              disabled={busy || !myTurn}
              onClick={() => setPanel("bag")}
            />
            <MainButton
              label="Pokémon"
              icon={<PokeballIcon />}
              className="bg-gradient-to-br from-emerald-400 to-emerald-600 text-screen-ink"
              disabled={busy}
              onClick={() => setPanel("party")}
            />
            <MainButton
              label="Battle"
              icon={<Users className="h-5 w-5" />}
              className="bg-gradient-to-br from-sky-400 to-indigo-500 text-white"
              disabled={false}
              onClick={() => setPanel("field")}
            />
          </div>
        ) : null}

        <AnimatePresence>
          {!over && panel === "fight" && active ? (
            <SheetPanel title={`${active.name} attacks`} onBack={() => setPanel("main")} key="fight">
              <AttackPanel
                enemies={aliveEnemies}
                trainerName={(e) => trainerOf(e)?.name ?? null}
                targetId={target?.id ?? null}
                onTarget={setTargetId}
                busy={busy}
                onAttack={(enemyId, damage, hit, d20) => run({ kind: "attack", encounterId, targetEnemyId: enemyId, damage, hit, d20 })}
              />
            </SheetPanel>
          ) : null}

          {!over && panel === "bag" ? (
            <SheetPanel
              title={pendingItem ? `Use ${pendingItem.name} on…` : pendingBall ? `Throw a ${pendingBall.name} at…` : "Bag"}
              onBack={() => (pendingItem ? setPendingItem(null) : pendingBall ? setPendingBall(null) : setPanel("main"))}
              key="bag"
            >
              {pendingBall ? (
                <CatchTargetList
                  enemies={catchable}
                  waitingIds={new Set(waitingCatches.map((c) => c.enemy_id))}
                  busy={busy}
                  onPick={(e) => {
                    const ball = pendingBall;
                    setPendingBall(null);
                    run({ kind: "catch", encounterId, enemyId: e.id, ballItemId: ball.item_id });
                  }}
                />
              ) : !pendingItem ? (
                <>
                {state.encounter.catching_allowed ? (
                  <BallList balls={me?.balls ?? []} canCatch={catchable.length > 0} busy={busy} onPick={setPendingBall} />
                ) : null}
                {(me?.items ?? []).length === 0 ? (
                  <p className="py-6 text-center text-xs text-mist/50">No battle items in your Bag.</p>
                ) : (
                  <div className="space-y-1.5">
                    {(me?.items ?? []).map((it) => (
                      <button
                        key={it.item_id}
                        type="button"
                        disabled={busy}
                        onClick={() => setPendingItem(it)}
                        className="flex w-full touch-manipulation items-center gap-3 rounded-xl bg-white/5 p-2.5 text-left active:bg-white/10 disabled:opacity-50"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5">
                          <ItemIcon item={it} className="h-7 w-7" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-mist">{it.name}</p>
                          <p className="truncate text-[11px] text-mist/50">{describeItemEffect(it.effect)}</p>
                        </div>
                        <span className="shrink-0 font-mono text-xs text-mist/70">×{it.quantity}</span>
                      </button>
                    ))}
                  </div>
                )}
                </>
              ) : (
                <PartyList
                  party={party}
                  activeId={activeId}
                  isDisabled={(p) => !itemUsableOn(pendingItem.effect, p)}
                  disabledHint="No effect"
                  busy={busy}
                  onPick={(p) => {
                    const item = pendingItem;
                    setPendingItem(null);
                    run({ kind: "item", encounterId, itemId: item.item_id, pokemonId: p.id });
                  }}
                />
              )}
            </SheetPanel>
          ) : null}

          {!over && panel === "party" ? (
            <SheetPanel
              title={!activeId ? "Choose your Pokémon" : activeDown ? "Choose your next Pokémon" : "Switch Pokémon"}
              onBack={activeId ? () => setPanel("main") : undefined}
              key="party"
            >
              {activeId && !activeDown ? (
                <p className="mb-2 text-[11px] text-mist/50">
                  {myTurn ? "Switching uses your turn." : "You can switch on your turn (it uses your turn)."}
                </p>
              ) : null}
              {usable.length === 0 ? (
                <p className="py-4 text-center text-xs text-mist/50">None of your party Pokémon can battle right now.</p>
              ) : null}
              <PartyList
                party={party}
                activeId={activeId}
                isDisabled={(p) =>
                  p.id === activeId || p.is_dead || p.status === "fainted" || p.current_hp <= 0 || (!!activeId && !activeDown && !myTurn)
                }
                disabledHint={(p) =>
                  p.id === activeId ? "In battle" : p.is_dead ? "Dead" : p.status === "fainted" || p.current_hp <= 0 ? "Fainted" : "Your turn"
                }
                busy={busy}
                onPick={(p) => run({ kind: "switch", encounterId, pokemonId: p.id })}
              />
            </SheetPanel>
          ) : null}

        </AnimatePresence>
      </div>

      {/* The whole battle (PokéGear 14) — taller than the other sheets. */}
      <AnimatePresence>
        {panel === "field" && !over ? (
          <SheetPanel title="Battle" onBack={() => setPanel("main")} key="field" tall>
            <BattlefieldView state={state} meProfileId={me?.profile_id ?? null} />
          </SheetPanel>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------------
const playerLunge: TargetAndTransition = { x: [0, 26, 0], y: [0, -14, 0], transition: { duration: 0.32, ease: "easeOut" } };
const enemyLunge: TargetAndTransition = { x: [0, -24, 0], y: [0, 12, 0], transition: { duration: 0.32, ease: "easeOut" } };
const hitShake: TargetAndTransition = {
  x: [0, -7, 7, -5, 5, 0],
  opacity: [1, 0.25, 1, 0.25, 1],
  filter: ["brightness(1)", "brightness(2.2)", "brightness(1)", "brightness(2.2)", "brightness(1)"],
  transition: { duration: 0.45 },
};

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
function EnemySlot({
  enemy,
  count,
  selected,
  onSelect,
  register,
  floaters,
  entering = false,
}: {
  enemy: BattleEnemyState;
  count: number;
  selected: boolean;
  onSelect: () => void;
  register: (id: string, ctl: AnimationControls | null) => void;
  floaters: Floater[];
  /** First time this Pokémon is on screen mid-battle: play its entrance. */
  entering?: boolean;
}) {
  const ctl = useAnimationControls();
  // Only the value at mount matters (a sprite enters once).
  const [enterOnMount] = React.useState(entering);
  React.useEffect(() => {
    register(enemy.id, ctl);
    return () => register(enemy.id, null);
  }, [enemy.id, ctl, register]);
  React.useEffect(() => {
    if (enterOnMount) void ctl.start({ x: 0, y: 0, opacity: [0, 1, 1], scale: [0.2, 1.12, 1], transition: { duration: 0.5 } });
  }, [enterOnMount, ctl]);

  const size = count === 1 ? "h-full w-[70%]" : count === 2 ? "h-[85%] w-1/2" : count === 3 ? "h-[62%] w-1/3" : "h-1/2 w-1/3";

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      disabled={enemy.fainted}
      className={cn("relative flex touch-manipulation items-end justify-center", size)}
      aria-label={`Target ${enemy.name}`}
      exit={{ opacity: 0, scale: 0.3, transition: { duration: 0.35 } }}
    >
      {selected ? (
        <motion.div
          className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 text-volt drop-shadow"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 0.9, repeat: Infinity }}
        >
          <ChevronDown className="h-4 w-4" strokeWidth={3} />
        </motion.div>
      ) : null}
      <motion.div className="relative h-full w-full" animate={ctl} initial={enterOnMount ? { opacity: 0, scale: 0.2 } : { opacity: 1 }}>
        <BattleSprite
          speciesId={enemy.species_id}
          spriteUrl={enemy.sprite_url}
          alt={enemy.name}
          className={cn("h-full w-full transition-opacity", enemy.fainted && "opacity-0")}
        />
        <FloaterLayer floaters={floaters} targetId={enemy.id} />
      </motion.div>
    </motion.button>
  );
}

function MainButton({
  label,
  icon,
  className,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  className: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex touch-manipulation items-center justify-center gap-2 rounded-2xl font-display text-base font-bold uppercase tracking-wide shadow-glass ring-1 ring-white/15 disabled:opacity-40",
        className
      )}
    >
      {icon}
      {label}
    </motion.button>
  );
}

function SheetPanel({ title, onBack, children, tall }: { title: string; onBack?: () => void; children: React.ReactNode; tall?: boolean }) {
  return (
    <motion.div
      className={cn(
        "absolute inset-x-3 bottom-3 z-30 flex flex-col rounded-2xl border border-white/10 bg-screen-deep/95 p-3 shadow-glass backdrop-blur",
        tall ? "top-16 z-40" : "top-2"
      )}
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 30, opacity: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
    >
      <div className="mb-2 flex items-center gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex h-7 w-7 touch-manipulation items-center justify-center rounded-full bg-white/5 text-mist active:bg-white/10"
            aria-label="Back"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : null}
        <p className="font-display text-sm font-semibold text-mist">{title}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </motion.div>
  );
}

function PartyList({
  party,
  activeId,
  isDisabled,
  disabledHint,
  busy,
  onPick,
}: {
  party: BattlePartyPokemon[];
  activeId: string | null;
  isDisabled: (p: BattlePartyPokemon) => boolean;
  disabledHint: string | ((p: BattlePartyPokemon) => string);
  busy: boolean;
  onPick: (p: BattlePartyPokemon) => void;
}) {
  if (party.length === 0) return <p className="py-6 text-center text-xs text-mist/50">Your party is empty.</p>;
  return (
    <div className="space-y-1.5">
      {party.map((p) => {
        const disabled = isDisabled(p);
        const down = p.is_dead || p.status === "fainted" || p.current_hp <= 0;
        return (
          <button
            key={p.id}
            type="button"
            disabled={disabled || busy}
            onClick={() => onPick(p)}
            className={cn(
              "flex w-full touch-manipulation items-center gap-2.5 rounded-xl p-2 text-left active:bg-white/10 disabled:cursor-default",
              p.id === activeId ? "bg-volt/10 ring-1 ring-volt/40" : "bg-white/5",
              disabled && "opacity-55"
            )}
          >
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5">
              <BattleSprite speciesId={p.species_id} shiny={p.is_shiny} alt={p.name} className={cn("h-10 w-10", down && "grayscale")} />
              {p.is_dead ? <Skull className="absolute -right-1 -top-1 h-3.5 w-3.5 text-mist/70" /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-medium text-mist">{p.name}</p>
                <span className="shrink-0 font-mono text-[10px] text-mist/50">Lv{p.level}</span>
                <StatusChip status={p.status} />
              </div>
              <BattleHpBar current={Math.max(0, p.current_hp)} max={p.max_hp} className="mt-1" />
            </div>
            <div className="w-14 shrink-0 text-right font-mono text-[10px] text-mist/60">
              {disabled ? (typeof disabledHint === "string" ? disabledHint : disabledHint(p)) : `${p.current_hp}/${p.max_hp}`}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function BattleLog({ state, className }: { state: BattleState; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const logs = state.logs.filter((l) => l.message);
  React.useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [logs.length]);

  return (
    <div ref={ref} className={cn("space-y-1 overflow-y-auto rounded-xl bg-black/20 p-2", className)}>
      {logs.length === 0 ? <p className="py-4 text-center text-xs text-mist/40">Nothing has happened yet.</p> : null}
      {logs.map((l) => (
        <div key={l.id} className="flex gap-2 text-[11px] leading-snug">
          <span className="w-7 shrink-0 font-mono text-[9px] text-mist/35" title={new Date(l.created_at).toLocaleTimeString()}>
            {l.round ? `R${l.round}` : "—"}
          </span>
          <span
            className={cn(
              "min-w-0",
              l.action === "faint"
                ? "text-rotom-red-light"
                : l.action === "victory" || l.action === "reward"
                  ? "font-semibold text-volt"
                  : l.action === "item"
                    ? "text-emerald-300"
                    : l.action === "trainer_switch" || l.action === "switch"
                      ? "text-sky-200"
                      : l.action === "turn" || l.action === "round"
                        ? "text-mist/45"
                        : "text-mist/80"
            )}
          >
            {l.message}
            {l.is_critical ? <span className="ml-1 text-volt">(critical)</span> : null}
            {l.edited_at ? <span className="ml-1 text-[9px] text-amber-300">(corrected)</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The whole battle at a glance (PokéGear 14): every trainer on your side with
// their active Pokémon and bench, the enemy side, the order and the log.
// ---------------------------------------------------------------------------
function BattlefieldView({ state, meProfileId }: { state: BattleState; meProfileId: string | null }) {
  const [tab, setTab] = React.useState<"field" | "order" | "log">("field");
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 grid grid-cols-3 gap-1 rounded-xl bg-white/5 p-1" role="tablist">
        {(
          [
            ["field", "Field"],
            ["order", "Order"],
            ["log", "Log"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn("touch-manipulation rounded-lg py-1.5 text-xs font-semibold", tab === k ? "bg-white/15 text-mist" : "text-mist/55")}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "field" ? <FieldTab state={state} meProfileId={meProfileId} /> : null}
        {tab === "order" ? <OrderTab state={state} meProfileId={meProfileId} /> : null}
        {tab === "log" ? <BattleLog state={state} className="min-h-full" /> : null}
      </div>
    </div>
  );
}

function SideHeading({ children, tone }: { children: React.ReactNode; tone: "friend" | "enemy" }) {
  return (
    <p className={cn("mb-1 mt-1 text-[10px] font-bold uppercase tracking-wider", tone === "friend" ? "text-sky-300" : "text-rotom-red-light")}>{children}</p>
  );
}

function MonRow({
  name,
  level,
  speciesId,
  spriteUrl,
  shiny,
  currentHp,
  maxHp,
  status,
  active,
  dead,
}: {
  name: string;
  level: number;
  speciesId: number | null;
  spriteUrl?: string | null;
  shiny?: boolean;
  currentHp: number;
  maxHp: number;
  status: PokemonStatus | null;
  active: boolean;
  dead?: boolean;
}) {
  const down = dead || currentHp <= 0 || status === "fainted";
  return (
    <div className={cn("flex items-center gap-2 rounded-lg px-1.5 py-1", active ? "bg-volt/10 ring-1 ring-volt/40" : "bg-white/[0.03]", down && !active && "opacity-50")}>
      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
        <BattleSprite speciesId={speciesId} spriteUrl={spriteUrl} shiny={shiny} alt="" className={cn("h-8 w-8", down && "grayscale")} />
        {dead ? <Skull className="absolute -right-1 -top-1 h-3 w-3 text-mist/70" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="truncate text-xs font-medium text-mist">{name}</p>
          <span className="shrink-0 font-mono text-[9px] text-mist/45">Lv{level}</span>
          {status && status !== "healthy" ? <StatusChip status={status} /> : null}
          {active ? <span className="ml-auto shrink-0 rounded bg-volt/25 px-1 text-[8px] font-bold uppercase text-volt">Active</span> : null}
        </div>
        <BattleHpBar current={Math.max(0, currentHp)} max={maxHp} className="mt-0.5" />
      </div>
      <span className="w-12 shrink-0 text-right font-mono text-[10px] text-mist/60">
        {dead ? "Dead" : `${Math.max(0, currentHp)}/${maxHp}`}
      </span>
    </div>
  );
}

function FieldTab({ state, meProfileId }: { state: BattleState; meProfileId: string | null }) {
  const players = [...state.players].sort((a, b) => Number(b.profile_id === meProfileId) - Number(a.profile_id === meProfileId));
  const wild = state.enemies.filter((e) => !e.enemy_trainer_id && !e.caught);
  return (
    <div className="space-y-2 pb-1">
      <SideHeading tone="friend">Your side</SideHeading>
      {players.map((p) => {
        const team = [...(p.team ?? [])].sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.party_slot - b.party_slot);
        const mine = p.profile_id === meProfileId;
        return (
          <div key={p.id} className="rounded-xl bg-white/5 p-2">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-mist">
              {mine ? "You" : p.username}
              {!mine ? <span className="rounded bg-sky-400/15 px-1 text-[9px] font-medium text-sky-200">Teammate</span> : null}
              <span className="ml-auto text-[10px] font-normal text-mist/45">{p.usable_count} can fight</span>
            </p>
            {!p.active_pokemon ? <p className="mb-1 text-[10px] text-amber-300">Choosing a Pokémon…</p> : null}
            <div className="space-y-1">
              {team.map((m) => (
                <MonRow
                  key={m.id}
                  name={m.name}
                  level={m.level}
                  speciesId={m.species_id}
                  shiny={m.is_shiny}
                  currentHp={m.current_hp}
                  maxHp={m.max_hp}
                  status={m.status}
                  active={m.is_active}
                  dead={m.is_dead}
                />
              ))}
            </div>
          </div>
        );
      })}

      <SideHeading tone="enemy">Enemy side</SideHeading>
      {state.enemy_trainers.map((t) => {
        const a = state.enemies.find((e) => e.id === t.active_enemy_id) ?? null;
        const benchLeft = Math.max(0, t.remaining - (a && a.current_hp > 0 ? 1 : 0));
        return (
          <div key={t.id} className="rounded-xl bg-rotom-red/[0.07] p-2">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-rotom-red-light">
              {t.name}
              <span className="ml-auto text-[10px] font-normal text-mist/50">
                {t.remaining}/{t.total} left
              </span>
            </p>
            {a ? (
              <MonRow
                name={a.name}
                level={a.level}
                speciesId={a.species_id}
                spriteUrl={a.sprite_url}
                currentHp={a.current_hp}
                maxHp={a.max_hp}
                status={a.status}
                active
              />
            ) : (
              <p className="text-[10px] text-mist/45">No Pokémon left.</p>
            )}
            {benchLeft > 0 ? <p className="mt-1 text-[10px] text-mist/45">+{benchLeft} more on the bench</p> : null}
          </div>
        );
      })}
      {wild.length ? (
        <div className="rounded-xl bg-rotom-red/[0.07] p-2">
          <p className="mb-1 text-xs font-semibold text-rotom-red-light">Wild Pokémon</p>
          <div className="space-y-1">
            {wild.map((e) => (
              <MonRow
                key={e.id}
                name={e.name}
                level={e.level}
                speciesId={e.species_id}
                spriteUrl={e.sprite_url}
                currentHp={e.current_hp}
                maxHp={e.max_hp}
                status={e.status}
                active={!e.fainted}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OrderTab({ state, meProfileId }: { state: BattleState; meProfileId: string | null }) {
  if (state.order.length === 0) return <p className="py-6 text-center text-xs text-mist/50">No turn order yet.</p>;
  return (
    <div className="space-y-1">
      {state.order.map((o) => {
        const c = combatantFor(state, o);
        const me = o.profile_id === meProfileId;
        return (
          <div
            key={o.id}
            className={cn(
              "flex items-center gap-2 rounded-lg px-2 py-1.5",
              o.is_current ? "bg-volt/15 ring-1 ring-volt/50" : "bg-white/[0.04]",
              !o.can_act && state.encounter.phase === "fighting" && "opacity-45"
            )}
          >
            <span className="w-5 shrink-0 text-center font-mono text-xs text-mist/50">{o.position ?? "–"}</span>
            <BattleSprite speciesId={c.speciesId} spriteUrl={c.spriteUrl} shiny={c.shiny} alt="" className="h-7 w-7 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-xs font-semibold", c.side === "enemies" ? "text-rotom-red-light" : me ? "text-sky-200" : "text-mist")}>
                {me ? "You" : o.name}
                {o.is_current ? <span className="ml-1 text-[9px] font-bold uppercase text-volt">· Now</span> : null}
              </p>
              <p className="truncate text-[10px] text-mist/55">
                {c.pokemonName ? `${c.pokemonName}${c.currentHp !== null && c.maxHp ? ` · ${Math.max(0, c.currentHp)}/${c.maxHp}` : ""}` : "—"}
              </p>
            </div>
            <span className="shrink-0 font-mono text-[11px] text-mist/70">{o.awaiting ? "…" : o.rolls.join("/") || "—"}</span>
          </div>
        );
      })}
    </div>
  );
}

function FinishedOverlay({ state }: { state: BattleState }) {
  const status = state.encounter.status;
  const won = status === "completed" || (status === "rewarded" && !!state.encounter.completed_at);
  return (
    <motion.div
      className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-screen-ink/80 px-6 text-center backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div initial={{ scale: 0.4, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 220, damping: 12 }}>
        {status === "lost" ? (
          <Skull className="h-12 w-12 text-mist/60" />
        ) : status === "ended" ? (
          <X className="h-12 w-12 text-mist/60" />
        ) : (
          <Trophy className="h-12 w-12 text-volt drop-shadow-[0_0_18px_rgba(255,210,63,0.6)]" />
        )}
      </motion.div>
      <p className="font-display text-2xl font-bold text-mist">
        {status === "lost" ? "Defeat…" : status === "ended" ? "Encounter ended" : won ? "Victory!" : "Battle over"}
      </p>
      {state.me ? <p className="text-xs text-mist/60">You dealt {state.me.damage_dealt} damage.</p> : null}
      {status === "completed" || status === "lost" ? (
        <p className="mt-1 max-w-[240px] text-xs text-mist/50">Waiting for the Game Master to hand out rewards…</p>
      ) : null}
    </motion.div>
  );
}

function PokeballIcon() {
  return (
    <span className="relative inline-block h-5 w-5 overflow-hidden rounded-full border-2 border-current">
      <span className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-current" />
      <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-current bg-emerald-500" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Turns (PokéGear 12.1)
// ---------------------------------------------------------------------------

/** Who stands behind a place in the order right now (PokéGear 14). */
export interface Combatant {
  side: "players" | "enemies";
  pokemonName: string | null;
  speciesId: number | null;
  spriteUrl: string | null;
  shiny: boolean;
  currentHp: number | null;
  maxHp: number | null;
  status: PokemonStatus | null;
}

export function combatantFor(state: BattleState, entry: BattleTurnEntry): Combatant {
  if (entry.kind === "player") {
    const p = state.players.find((x) => x.id === entry.battle_player_id);
    const ap = p?.active_pokemon ?? null;
    return {
      side: "players",
      pokemonName: ap?.name ?? null,
      speciesId: ap?.species_id ?? null,
      spriteUrl: null,
      shiny: ap?.is_shiny ?? false,
      currentHp: ap?.current_hp ?? null,
      maxHp: ap?.max_hp ?? null,
      status: ap?.status ?? null,
    };
  }
  const enemyId =
    entry.kind === "enemy" ? entry.enemy_id : (state.enemy_trainers.find((t) => t.id === entry.enemy_trainer_id)?.active_enemy_id ?? null);
  const e = state.enemies.find((x) => x.id === enemyId) ?? null;
  return {
    side: "enemies",
    pokemonName: e?.name ?? null,
    speciesId: e?.species_id ?? null,
    spriteUrl: e?.sprite_url ?? null,
    shiny: false,
    currentHp: e?.current_hp ?? null,
    maxHp: e?.max_hp ?? null,
    status: e && e.current_hp <= 0 ? "fainted" : (e?.status ?? null),
  };
}

/**
 * Whose turn it is — the trainer (or wild Pokémon) and the Pokémon they have
 * out — plus everyone in initiative order (PokéGear 14).
 */
function TurnStrip({
  state,
  order,
  phase,
  round,
  meId,
}: {
  state: BattleState;
  order: BattleTurnEntry[];
  phase: "initiative" | "fighting";
  round: number;
  meId: string | null;
}) {
  if (order.length === 0) return null;
  const current = order.find((o) => o.is_current) ?? null;
  const mine = !!current && current.battle_player_id === meId;
  const c = current ? combatantFor(state, current) : null;
  const trainerTurn = current?.kind === "trainer";
  return (
    <div className="mx-3 mt-2 rounded-2xl bg-screen-ink/70 px-2.5 py-2 ring-1 ring-white/10" data-testid="turn-banner">
      {phase === "initiative" ? (
        <p className="mb-1.5 text-[11px] font-semibold text-mist/80">🎲 Initiative — everyone rolls a d20</p>
      ) : current && c ? (
        <div
          className={cn(
            "mb-1.5 flex items-center gap-2 rounded-xl px-2 py-1",
            mine ? "bg-volt/15 ring-1 ring-volt/50" : c.side === "enemies" ? "bg-rotom-red/15 ring-1 ring-rotom-red/40" : "bg-sky-400/10 ring-1 ring-sky-400/30"
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center">
            {c.speciesId || c.spriteUrl ? (
              <BattleSprite speciesId={c.speciesId} spriteUrl={c.spriteUrl} shiny={c.shiny} alt="" className="h-9 w-9" />
            ) : (
              <Users className="h-5 w-5 text-mist/40" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-mist/55">
              Current turn · #{current.position} · Round {round} · {c.side === "enemies" ? "Enemy" : mine ? "You" : "Your team"}
            </p>
            <p className={cn("truncate font-display text-sm font-bold", mine ? "text-volt" : c.side === "enemies" ? "text-rotom-red-light" : "text-mist")}>
              {mine ? "Your turn!" : current.name}
              {c.pokemonName && (current.kind !== "enemy" || trainerTurn) ? (
                <span className="font-sans text-[11px] font-medium text-mist/70"> · ⚡ {c.pokemonName}</span>
              ) : null}
            </p>
          </div>
          {c.currentHp !== null && c.maxHp ? (
            <div className="w-[74px] shrink-0">
              <BattleHpBar current={Math.max(0, c.currentHp)} max={c.maxHp} showNumbers />
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mb-1.5 text-[11px] font-semibold text-mist/80">Round {round}</p>
      )}
      <div className="no-scrollbar flex gap-1 overflow-x-auto" aria-label="Initiative order">
        {order.map((o) => (
          <span
            key={o.id}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px]",
              o.is_current
                ? "bg-volt font-semibold text-screen-ink"
                : !o.can_act && phase === "fighting"
                  ? "bg-white/5 text-mist/35 line-through"
                  : o.kind === "enemy" || o.kind === "trainer"
                    ? "bg-rotom-red/20 text-rotom-red-light"
                    : o.battle_player_id === meId
                      ? "bg-sky-400/20 text-sky-200"
                      : "bg-white/10 text-mist/80"
            )}
          >
            {o.position ? <span className="font-mono opacity-60">{o.position}.</span> : null}
            <span className="max-w-[90px] truncate">{o.battle_player_id === meId ? "You" : o.name}</span>
            <span className="font-mono">{o.awaiting ? "…" : o.roll ?? "?"}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Ask the trainer for their d20 initiative roll (or a tie re-roll). */
function InitiativePanel({
  entry,
  order,
  busy,
  onSubmit,
  onChoosePokemon,
}: {
  entry: BattleTurnEntry;
  order: BattleTurnEntry[];
  busy: boolean;
  onSubmit: (roll: number) => void;
  onChoosePokemon?: () => void;
}) {
  const [value, setValue] = React.useState("");
  const n = Number(value);
  const valid = value !== "" && Number.isInteger(n) && n >= 1 && n <= 20;
  const reroll = entry.rolls.length > 0;
  const tiedWith = reroll
    ? order.filter((o) => o.id !== entry.id && o.awaiting && o.rolls.join("/") === entry.rolls.join("/")).map((o) => o.name)
    : [];
  const waiting = order.filter((o) => o.awaiting && o.id !== entry.id).map((o) => o.name);

  return (
    <div className="flex h-full flex-col gap-2 rounded-2xl bg-white/5 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-mist">
        <Dices className="h-4 w-4 text-volt" />
        {reroll ? `Tie${tiedWith.length ? ` with ${tiedWith.join(", ")}` : ""} — roll again!` : "Roll your d20 for initiative"}
      </p>
      <p className="text-[11px] text-mist/50">Highest roll goes first. Type the number you rolled (1–20).</p>
      <div className="flex gap-2">
        <input
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid) onSubmit(n);
          }}
          placeholder="d20"
          aria-label="Your d20 roll"
          className="w-20 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-center font-mono text-lg text-mist placeholder:text-mist/30 focus:outline-none focus:ring-1 focus:ring-volt"
        />
        <button
          type="button"
          disabled={!valid || busy}
          onClick={() => onSubmit(n)}
          className="flex-1 touch-manipulation rounded-xl bg-volt py-2.5 text-sm font-bold text-screen-ink active:scale-[0.98] disabled:opacity-40"
        >
          {busy ? "Sending…" : valid ? `I rolled ${n}` : "Enter your roll"}
        </button>
      </div>
      {waiting.length ? <p className="text-[10px] text-mist/40">Still rolling: {waiting.join(", ")}</p> : null}
      {onChoosePokemon ? (
        <button type="button" onClick={onChoosePokemon} className="mt-auto text-left text-[11px] font-semibold text-sky-300">
          Choose your Pokémon while you wait →
        </button>
      ) : null}
    </div>
  );
}

/**
 * Attack on your turn: pick the target, then Hit or Miss. On a hit, type the
 * damage your attack does (the table decides it with the d20 and your card).
 */
function AttackPanel({
  enemies,
  trainerName,
  targetId,
  onTarget,
  busy,
  onAttack,
}: {
  enemies: BattleEnemyState[];
  trainerName: (e: BattleEnemyState) => string | null;
  targetId: string | null;
  onTarget: (id: string) => void;
  busy: boolean;
  onAttack: (enemyId: string, damage: number, hit: boolean, d20: number | null) => void;
}) {
  const [hit, setHit] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [roll, setRoll] = React.useState("");
  const target = enemies.find((e) => e.id === targetId) ?? enemies[0] ?? null;
  const n = Number(value);
  // A hit can do 0 damage (e.g. it had no effect).
  const valid = value !== "" && Number.isInteger(n) && n >= 0 && n <= 9999;
  const r = Number(roll);
  const rollValid = roll === "" || (Number.isInteger(r) && r >= 1 && r <= 20);
  const d20 = roll === "" || !rollValid ? null : r;
  if (!target) return <p className="py-6 text-center text-xs text-mist/50">No enemy left to attack.</p>;

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-[11px] text-mist/50">Target</p>
        <div className="flex flex-wrap gap-1.5">
          {enemies.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onTarget(e.id)}
              className={cn(
                "touch-manipulation rounded-xl px-3 py-1.5 text-xs font-semibold",
                e.id === target.id ? "bg-volt text-screen-ink" : "bg-white/10 text-mist active:bg-white/15"
              )}
            >
              {trainerName(e) ? <span className="font-normal opacity-70">{trainerName(e)}&apos;s </span> : null}
              {e.name} <span className="font-mono font-normal opacity-70">{e.current_hp}/{e.max_hp}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="atk-d20" className="text-[11px] text-mist/50">
          Your d20 roll <span className="text-mist/35">(optional, for the log)</span>
        </label>
        <input
          id="atk-d20"
          inputMode="numeric"
          value={roll}
          onChange={(e) => setRoll(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
          placeholder="d20"
          aria-label="Your d20 roll"
          className={cn(
            "ml-auto w-16 rounded-xl border bg-white/5 px-2 py-1.5 text-center font-mono text-sm text-mist placeholder:text-mist/30 focus:outline-none focus:ring-1 focus:ring-volt",
            rollValid ? "border-white/15" : "border-rotom-red"
          )}
        />
      </div>
      {!rollValid ? <p className="-mt-2 text-[11px] text-rotom-red-light">A d20 roll is 1–20.</p> : null}

      {!hit ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy || !rollValid}
            onClick={() => setHit(true)}
            className="touch-manipulation rounded-2xl bg-gradient-to-br from-rotom-red to-rotom-red-dark py-4 font-display text-base font-bold uppercase text-white shadow-glass active:scale-95 disabled:opacity-40"
          >
            Hit
          </button>
          <button
            type="button"
            disabled={busy || !rollValid}
            onClick={() => onAttack(target.id, 0, false, d20)}
            className="touch-manipulation rounded-2xl bg-white/10 py-4 font-display text-base font-bold uppercase text-mist shadow-glass active:scale-95 disabled:opacity-40"
          >
            Miss
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-mist/50">How much damage does your attack do? (0 if it hit but did nothing)</p>
          <div className="flex gap-2">
            <input
              autoFocus
              inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && valid && rollValid) onAttack(target.id, n, true, d20);
              }}
              placeholder="e.g. 30"
              aria-label="Damage"
              className="w-24 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-center font-mono text-lg text-mist placeholder:text-mist/30 focus:outline-none focus:ring-1 focus:ring-volt"
            />
            <button
              type="button"
              disabled={!valid || !rollValid || busy}
              onClick={() => onAttack(target.id, n, true, d20)}
              className="flex-1 touch-manipulation rounded-xl bg-rotom-red py-2.5 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-40"
            >
              {valid ? (n === 0 ? "Hit — no damage" : `Deal ${n} damage`) : "Type the damage"}
            </button>
          </div>
          {valid && n > 0 ? (
            <p className="font-mono text-[11px] text-mist/60">
              {target.name}: {target.current_hp}/{target.max_hp} → {Math.max(0, target.current_hp - n)}/{target.max_hp}
              {target.current_hp - n <= 0 ? " · faints" : ""}
            </p>
          ) : null}
          <button type="button" onClick={() => setHit(false)} className="text-[11px] text-mist/50">
            ← Back to Hit / Miss
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Catching (PokéGear 13)
// ---------------------------------------------------------------------------
function BallList({ balls, canCatch, busy, onPick }: { balls: BattleBall[]; canCatch: boolean; busy: boolean; onPick: (b: BattleBall) => void }) {
  return (
    <div className="mb-3">
      <p className="mb-1.5 text-[11px] text-mist/50">Poké Balls — try to catch a wild Pokémon (uses your turn; the Game Master decides)</p>
      {balls.length === 0 ? (
        <p className="rounded-xl bg-white/5 px-3 py-2 text-xs text-mist/50">You have no Poké Balls.</p>
      ) : !canCatch ? (
        <p className="rounded-xl bg-white/5 px-3 py-2 text-xs text-mist/50">There&apos;s no wild Pokémon left to catch.</p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {balls.map((b) => (
            <button
              key={b.item_id}
              type="button"
              disabled={busy}
              onClick={() => onPick(b)}
              className="flex touch-manipulation items-center gap-2 rounded-xl bg-white/5 p-2 text-left active:bg-white/10 disabled:opacity-50"
            >
              <ItemIcon item={b} className="h-7 w-7 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-mist">{b.name}</span>
              <span className="font-mono text-[11px] text-mist/60">×{b.quantity}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CatchTargetList({
  enemies,
  waitingIds,
  busy,
  onPick,
}: {
  enemies: BattleEnemyState[];
  waitingIds: Set<string>;
  busy: boolean;
  onPick: (e: BattleEnemyState) => void;
}) {
  if (enemies.length === 0) return <p className="py-6 text-center text-xs text-mist/50">No wild Pokémon left to catch.</p>;
  return (
    <div className="space-y-1.5">
      {enemies.map((e) => {
        const waiting = waitingIds.has(e.id);
        return (
          <button
            key={e.id}
            type="button"
            disabled={busy || waiting}
            onClick={() => onPick(e)}
            className="flex w-full touch-manipulation items-center gap-2.5 rounded-xl bg-white/5 p-2 text-left active:bg-white/10 disabled:opacity-50"
          >
            <BattleSprite speciesId={e.species_id} spriteUrl={e.sprite_url} alt={e.name} className={cn("h-10 w-10", e.fainted && "grayscale")} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-mist">
                {e.name} <span className="font-mono text-[10px] text-mist/50">Lv{e.level}</span>
              </p>
              <BattleHpBar current={e.current_hp} max={e.max_hp} className="mt-1" />
            </div>
            <span className="w-16 shrink-0 text-right text-[10px] text-mist/60">{waiting ? "Waiting…" : e.fainted ? "Fainted" : `${e.current_hp}/${e.max_hp}`}</span>
          </button>
        );
      })}
    </div>
  );
}
