import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Sparkles, Trophy } from "lucide-react";
import { SpriteImage } from "@/components/phone/SpriteImage";
import { XpBar } from "@/components/phone/XpBar";
import { EvolutionAnimation } from "@/components/phone/EvolutionAnimation";
import { pokemonSpriteUrl } from "@/lib/sprites";
import { formatMoney } from "@/lib/battle";
import { cn } from "@/lib/utils";
import { useTrainerPokemon } from "@/hooks/useBag";
import { useGameConfig, xpToNextLevel } from "@/hooks/useBattle";
import { useClaimBattleXp, usePendingXpRewards } from "@/hooks/useEncounter";
import type { TrainerPokemon, XpClaimResult } from "@/types/database.types";

/**
 * After the Game Master hands out battle rewards, each trainer chooses
 * which Pokémon receives their XP. This sheet appears on its own whenever a
 * reward is waiting; the claim is a server-side RPC that stamps the reward
 * as used, so refreshing or tapping twice can never apply it twice.
 */
export function XpRewardPrompt() {
  const { data: pending } = usePendingXpRewards();
  const { data: pokemon } = useTrainerPokemon();
  const { data: config } = useGameConfig();
  const claim = useClaimBattleXp();

  const [selected, setSelected] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<XpClaimResult | null>(null);
  const [evo, setEvo] = React.useState<XpClaimResult | null>(null);

  const reward = pending?.[0] ?? null;
  const maxLevel = config?.maxLevel ?? 10;

  const choices = React.useMemo(() => {
    const list = (pokemon ?? []).filter((p) => !p.is_dead);
    return list.sort(
      (a, b) =>
        Number(a.party_slot === null) - Number(b.party_slot === null) ||
        (a.party_slot ?? 99) - (b.party_slot ?? 99) ||
        b.level - a.level
    );
  }, [pokemon]);
  const anyBelowMax = choices.some((p) => p.level < maxLevel);
  const isBlocked = (p: TrainerPokemon) => anyBelowMax && p.level >= maxLevel;

  React.useEffect(() => {
    setSelected(null);
  }, [reward?.id]);

  if (evo) {
    return (
      <EvolutionAnimation
        fromSpeciesId={evo.species_before}
        toSpeciesId={evo.species_after}
        fromName={evo.name}
        toName={evo.species_after_name}
        onDone={() => setEvo(null)}
      />
    );
  }

  const open = !!reward || !!result;

  function handleConfirm() {
    if (!reward || !selected) return;
    claim.mutate(
      { recipientId: reward.id, pokemonId: selected },
      {
        onSuccess: (r) => {
          setResult(r);
          setSelected(null);
        },
      }
    );
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div className="absolute inset-0 z-[58] flex flex-col justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/70" />
          <motion.div
            className="relative z-10 flex max-h-[85%] flex-col rounded-t-3xl border-t border-white/10 bg-screen-deep p-4 shadow-glass"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 34 }}
          >
            {result ? (
              <ClaimResult
                result={result}
                onContinue={() => {
                  const r = result;
                  setResult(null);
                  if (r.species_after !== r.species_before) setEvo(r);
                }}
              />
            ) : reward ? (
              <>
                <div className="flex flex-col items-center text-center">
                  <motion.div initial={{ scale: 0.5, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 12 }}>
                    <Trophy className="h-9 w-9 text-volt drop-shadow-[0_0_14px_rgba(255,210,63,0.6)]" />
                  </motion.div>
                  <p className="mt-1 font-display text-lg font-bold text-mist">Battle Reward!</p>
                  <div className="mt-1 flex gap-2">
                    <span className="rounded-full bg-circuit-violet/20 px-3 py-1 font-mono text-sm font-semibold text-circuit-violet">
                      +{reward.xp.toLocaleString()} XP
                    </span>
                    {reward.money > 0 ? (
                      <span className="rounded-full bg-volt/15 px-3 py-1 font-mono text-sm font-semibold text-volt">+{formatMoney(reward.money)}</span>
                    ) : null}
                  </div>
                  {reward.encounter?.name ? (
                    <p className="mt-1.5 text-xs text-mist/55">From {reward.encounter.name}</p>
                  ) : null}
                  <p className="mt-3 text-sm font-medium text-mist">Choose a Pokémon to receive {reward.xp.toLocaleString()} XP</p>
                </div>

                <div className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pb-1">
                  {choices.length === 0 ? (
                    <p className="py-6 text-center text-xs text-mist/50">You have no Pokémon that can gain XP.</p>
                  ) : null}
                  {choices.map((p) => {
                    const blocked = isBlocked(p);
                    const needed = config ? (p.level >= maxLevel ? null : xpToNextLevel(config.xpCurve, p.level)) : null;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={blocked || claim.isPending}
                        onClick={() => setSelected(p.id)}
                        className={cn(
                          "flex w-full touch-manipulation items-center gap-3 rounded-2xl p-2.5 text-left transition-colors",
                          selected === p.id ? "bg-volt/15 ring-1 ring-volt/60" : "bg-white/5 active:bg-white/10",
                          blocked && "opacity-45"
                        )}
                      >
                        <SpriteImage src={pokemonSpriteUrl(p.species_id)} alt={p.species.name} className="h-10 w-10" fallbackClassName="h-10 w-10" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-sm font-medium text-mist">{p.nickname || p.species.name}</p>
                            <span className="font-mono text-[10px] text-mist/50">Lv{p.level}</span>
                            {p.party_slot === null ? <span className="text-[9px] uppercase text-mist/35">PC</span> : null}
                          </div>
                          <XpBar xp={p.xp} needed={needed} className="mt-1" />
                        </div>
                        {blocked ? (
                          <span className="shrink-0 text-[10px] text-mist/50">Max level</span>
                        ) : selected === p.id ? (
                          <Check className="h-4 w-4 shrink-0 text-volt" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  disabled={!selected || claim.isPending}
                  onClick={handleConfirm}
                  className="mt-3 touch-manipulation rounded-2xl bg-volt py-3 text-sm font-bold text-screen-ink active:scale-[0.98] disabled:opacity-40"
                >
                  {claim.isPending ? "Giving XP…" : selected ? `Give XP to ${choices.find((c) => c.id === selected)?.nickname || choices.find((c) => c.id === selected)?.species.name}` : "Choose a Pokémon"}
                </button>
                {pending && pending.length > 1 ? (
                  <p className="mt-2 text-center text-[11px] text-mist/40">{pending.length - 1} more reward{pending.length > 2 ? "s" : ""} waiting</p>
                ) : null}
              </>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function ClaimResult({ result, onContinue }: { result: XpClaimResult; onContinue: () => void }) {
  const leveled = result.level_after > result.level_before;
  const evolved = result.species_after !== result.species_before;
  return (
    <div className="flex flex-col items-center py-2 text-center">
      <motion.div
        className="relative"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 14 }}
      >
        <SpriteImage src={pokemonSpriteUrl(result.species_before)} alt={result.name} className="h-24 w-24" fallbackClassName="h-24 w-24" />
        {leveled ? (
          <motion.div
            className="absolute -right-2 -top-1 text-volt"
            animate={{ scale: [1, 1.3, 1], rotate: [0, 15, 0] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            <Sparkles className="h-6 w-6" />
          </motion.div>
        ) : null}
      </motion.div>
      <p className="mt-1 font-display text-lg font-bold text-mist">
        {result.name} gained {result.xp.toLocaleString()} XP!
      </p>
      {leveled ? (
        <motion.p
          className="mt-1 rounded-full bg-volt/15 px-3 py-1 text-sm font-semibold text-volt"
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          Grew to Lv. {result.level_after}!
        </motion.p>
      ) : null}
      {evolved ? <p className="mt-2 text-xs text-mist/60">Something is happening…</p> : null}
      <button
        type="button"
        onClick={onContinue}
        className="mt-4 w-full touch-manipulation rounded-2xl bg-white/10 py-3 text-sm font-semibold text-mist active:scale-[0.98]"
      >
        {evolved ? "Watch!" : "Continue"}
      </button>
    </div>
  );
}
