import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Sparkles, Trophy } from "lucide-react";
import { PokemonSprite } from "@/components/phone/PokemonSprite";
import { XpBar } from "@/components/phone/XpBar";
import { EvolutionAnimation } from "@/components/phone/EvolutionAnimation";
import { cn } from "@/lib/utils";
import { useAllocateXp, useMyXpPools } from "@/hooks/useEncounter";
import type { XpAllocationResult, XpPool, XpPoolPokemon } from "@/types/database.types";

type Summary = { pool: XpPool; lines: { pokemon_name: string; amount: number; level_before: number; level_after: number }[] };

/**
 * Battle XP (PokéGear 13). Each trainer gets an XP pool and shares it out
 * over the Pokémon that actually fought, in amounts they choose. A Pokémon
 * only ever takes what it needs for its next level (then it's back to 0 XP
 * and you pick again), so nothing is lost; the pool stays open — also after
 * a refresh — until every point is used.
 */
export function XpRewardPrompt() {
  const { data: pools } = useMyXpPools();
  const allocate = useAllocateXp();

  const [hiddenFor, setHiddenFor] = React.useState<string | null>(null);
  const [chosenId, setChosenId] = React.useState<string | null>(null);
  const [amount, setAmount] = React.useState("");
  const [levelUp, setLevelUp] = React.useState<XpAllocationResult | null>(null);
  const [evo, setEvo] = React.useState<XpAllocationResult | null>(null);
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const pool = (pools ?? []).find((p) => p.recipient_id !== hiddenFor) ?? null;
  const chosen = pool?.pokemon.find((p) => p.id === chosenId) ?? null;

  React.useEffect(() => {
    setChosenId(null);
    setAmount("");
    setError(null);
  }, [pool?.recipient_id]);

  if (evo) {
    return (
      <EvolutionAnimation
        fromSpeciesId={evo.species_before}
        toSpeciesId={evo.species_after}
        fromName={evo.name}
        toName={evo.evolved_to ?? evo.name}
        onDone={() => setEvo(null)}
      />
    );
  }

  const open = !!pool || !!summary || !!levelUp;
  const missing = chosen?.needed != null ? chosen.needed - chosen.xp : 0;
  const maxGive = pool && chosen ? Math.min(pool.remaining, missing) : 0;
  const n = Number(amount);
  const valid = amount !== "" && Number.isInteger(n) && n >= 1 && n <= maxGive;

  function give(value: number) {
    if (!pool || !chosen) return;
    setError(null);
    allocate.mutate(
      { recipientId: pool.recipient_id, pokemonId: chosen.id, amount: value },
      {
        onSuccess: (r) => {
          setAmount("");
          setChosenId(null);
          if (r.leveled_up) setLevelUp(r);
          if (r.remaining <= 0) {
            setSummary({
              pool,
              lines: [...pool.allocations, { pokemon_name: r.name, amount: r.used, level_before: r.level_before, level_after: r.level_after }],
            });
          }
        },
        onError: (e) => setError(e instanceof Error ? e.message : "That didn't work."),
      }
    );
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div className="absolute inset-0 z-[58] flex flex-col justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/70" />
          <motion.div
            className="relative z-10 flex max-h-[88%] flex-col rounded-t-3xl border-t border-white/10 bg-screen-deep p-4 shadow-glass"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 34 }}
          >
            {levelUp ? (
              <LevelUpCard
                result={levelUp}
                onContinue={() => {
                  const r = levelUp;
                  setLevelUp(null);
                  if (r.species_after !== r.species_before) setEvo(r);
                }}
              />
            ) : summary ? (
              <SummaryCard summary={summary} onDone={() => setSummary(null)} />
            ) : pool ? (
              <>
                {/* Pool header: total / used / left */}
                <div className="flex flex-col items-center text-center">
                  <Trophy className="h-8 w-8 text-volt drop-shadow-[0_0_14px_rgba(255,210,63,0.6)]" />
                  <p className="mt-1 font-display text-lg font-bold text-mist">Battle XP</p>
                  <p className="text-xs text-mist/55">From {pool.encounter_name}</p>
                  <div className="mt-2 grid w-full grid-cols-3 gap-1.5 text-center">
                    <Stat label="Total" value={pool.total} />
                    <Stat label="Given" value={pool.allocated} />
                    <Stat label="Left" value={pool.remaining} highlight />
                  </div>
                </div>

                {!chosen ? (
                  <PokemonPicker pool={pool} onPick={(id) => setChosenId(id)} />
                ) : (
                  <div className="mt-3 space-y-3">
                    <button type="button" onClick={() => setChosenId(null)} className="flex items-center gap-1 text-xs text-mist/60">
                      <ChevronLeft className="h-3.5 w-3.5" /> Choose another Pokémon
                    </button>
                    <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
                      <PokemonSprite speciesId={chosen.species_id} shiny={chosen.is_shiny} alt={chosen.name} className="h-14 w-14 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-mist">
                          {chosen.name} <span className="font-mono text-[10px] text-mist/50">Lv{chosen.level}</span>
                        </p>
                        <XpBar xp={chosen.xp} level={chosen.level} className="mt-1" />
                        <p className="mt-1 text-[11px] text-volt">Needs {missing} XP to reach Lv{chosen.level + 1}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        inputMode="numeric"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && valid) give(n);
                        }}
                        placeholder={`1–${maxGive}`}
                        aria-label="XP to give"
                        className="w-24 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-center font-mono text-lg text-mist placeholder:text-mist/30 focus:outline-none focus:ring-1 focus:ring-volt"
                      />
                      <button
                        type="button"
                        disabled={!valid || allocate.isPending}
                        onClick={() => give(n)}
                        className="flex-1 touch-manipulation rounded-xl bg-volt py-2.5 text-sm font-bold text-screen-ink active:scale-[0.98] disabled:opacity-40"
                      >
                        {allocate.isPending ? "Giving…" : valid ? `Give ${n} XP` : "Type an amount"}
                      </button>
                    </div>
                    {amount !== "" && Number(amount) > maxGive ? (
                      <p className="text-[11px] text-amber-300">
                        At most {maxGive} XP here — {maxGive === missing ? `that's exactly what ${chosen.name} needs for the next level` : "that's all you have left"}.
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-1.5">
                      {missing <= pool.remaining ? (
                        <QuickButton disabled={allocate.isPending} onClick={() => give(missing)}>
                          Level up (+{missing})
                        </QuickButton>
                      ) : (
                        <QuickButton disabled={allocate.isPending} onClick={() => give(pool.remaining)}>
                          Give all {pool.remaining}
                        </QuickButton>
                      )}
                    </div>
                  </div>
                )}

                {error ? <p className="mt-2 rounded-lg bg-rotom-red/15 px-3 py-2 text-xs text-rotom-red-light">{error}</p> : null}

                <button
                  type="button"
                  onClick={() => setHiddenFor(pool.recipient_id)}
                  className="mt-3 text-center text-[11px] text-mist/40"
                >
                  Later — the {pool.remaining} XP stays saved for you
                </button>
              </>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={cn("rounded-xl px-2 py-1.5", highlight ? "bg-circuit-violet/25" : "bg-white/5")}>
      <p className="text-[9px] uppercase tracking-wide text-mist/50">{label}</p>
      <p className={cn("font-mono text-base font-bold", highlight ? "text-circuit-violet" : "text-mist")}>{value.toLocaleString()}</p>
    </div>
  );
}

function QuickButton({ children, disabled, onClick }: { children: React.ReactNode; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="touch-manipulation rounded-full bg-circuit-violet/25 px-3 py-1.5 text-xs font-semibold text-circuit-violet active:scale-95 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Only the Pokémon that fought in this battle; the closest to a level-up first. */
function PokemonPicker({ pool, onPick }: { pool: XpPool; onPick: (id: string) => void }) {
  const usable = (p: XpPoolPokemon) => !p.is_dead && p.needed !== null;
  const list = [...pool.pokemon].sort(
    (a, b) => Number(usable(b)) - Number(usable(a)) || (a.needed ?? 0) - a.xp - ((b.needed ?? 0) - b.xp)
  );
  const anyUsable = list.some(usable);
  return (
    <div className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pb-1">
      <p className="text-xs font-medium text-mist">Who gets XP? (only Pokémon that fought)</p>
      {!anyUsable ? (
        <p className="rounded-xl bg-amber-400/10 px-3 py-2.5 text-xs text-amber-200">
          None of the Pokémon that fought can gain XP right now (max level, or gone). Your XP stays saved — ask the Game Master if this reward should be
          closed.
        </p>
      ) : null}
      {list.map((p) => {
        const ok = usable(p);
        const missing = p.needed !== null ? p.needed - p.xp : 0;
        return (
          <button
            key={p.id}
            type="button"
            disabled={!ok}
            onClick={() => onPick(p.id)}
            className={cn(
              "flex w-full touch-manipulation items-center gap-3 rounded-2xl bg-white/5 p-2.5 text-left active:bg-white/10",
              !ok && "opacity-45"
            )}
          >
            <PokemonSprite speciesId={p.species_id} view="icon" shiny={p.is_shiny} alt={p.name} className="h-10 w-10 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-medium text-mist">{p.name}</p>
                <span className="font-mono text-[10px] text-mist/50">Lv{p.level}</span>
              </div>
              <XpBar xp={p.xp} level={p.level} className="mt-1" />
            </div>
            <span className="w-16 shrink-0 text-right text-[10px] text-mist/60">
              {p.is_dead ? "Dead" : p.needed === null ? "Max level" : `needs ${missing}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function LevelUpCard({ result, onContinue }: { result: XpAllocationResult; onContinue: () => void }) {
  const evolved = result.species_after !== result.species_before;
  return (
    <div className="flex flex-col items-center py-2 text-center">
      <motion.div className="relative" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 220, damping: 14 }}>
        <PokemonSprite speciesId={result.species_before} alt={result.name} className="h-24 w-24" />
        <motion.div className="absolute -right-2 -top-1 text-volt" animate={{ scale: [1, 1.3, 1], rotate: [0, 15, 0] }} transition={{ duration: 1, repeat: Infinity }}>
          <Sparkles className="h-6 w-6" />
        </motion.div>
      </motion.div>
      <p className="mt-1 font-display text-lg font-bold text-mist">{result.name} grew to Lv. {result.level_after}!</p>
      <p className="mt-1 text-xs text-mist/60">XP starts again at 0 for the next level.</p>
      {evolved ? <p className="mt-2 text-xs text-volt">Something is happening…</p> : null}
      <button type="button" onClick={onContinue} className="mt-4 w-full touch-manipulation rounded-2xl bg-white/10 py-3 text-sm font-semibold text-mist active:scale-[0.98]">
        {evolved ? "Watch!" : "Continue"}
      </button>
    </div>
  );
}

function SummaryCard({ summary, onDone }: { summary: Summary; onDone: () => void }) {
  const used = summary.lines.reduce((s, l) => s + l.amount, 0);
  return (
    <div className="flex min-h-0 flex-col">
      <p className="text-center font-display text-lg font-bold text-mist">Encounter complete</p>
      <p className="text-center text-xs text-mist/55">{summary.pool.encounter_name}</p>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl bg-white/5">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wide text-mist/45">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium">Pokémon</th>
              <th className="px-3 py-1.5 text-right font-medium">XP</th>
              <th className="px-3 py-1.5 text-left font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {summary.lines.map((l, i) => (
              <tr key={i} className="border-t border-white/5 text-mist">
                <td className="px-3 py-1.5">{l.pokemon_name}</td>
                <td className="px-3 py-1.5 text-right font-mono">{l.amount}</td>
                <td className="px-3 py-1.5 text-mist/70">{l.level_after > l.level_before ? `Lv ${l.level_before} → ${l.level_after}` : "No level up"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-center font-mono text-sm text-mist">
        {used} / {summary.pool.total} XP used · <span className="text-emerald-300">0 left</span>
      </p>
      <button type="button" onClick={onDone} className="mt-3 touch-manipulation rounded-2xl bg-volt py-3 text-sm font-bold text-screen-ink active:scale-[0.98]">
        Done
      </button>
    </div>
  );
}
