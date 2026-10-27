import * as React from "react";
import { AnimatePresence } from "framer-motion";
import { CheckSquare, HeartPulse, Skull, Sparkles, Square, Swords } from "lucide-react";
import { AppScreenHeader } from "@/components/phone/AppScreenHeader";
import { HealingAnimation } from "@/components/phone/HealingAnimation";
import { PartyHealingAnimation } from "@/components/phone/PartyHealingAnimation";
import { HpBar } from "@/components/phone/HpBar";
import { SpriteImage } from "@/components/phone/SpriteImage";
import { StatusBadge } from "@/components/phone/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { pokemonSpriteUrl } from "@/lib/sprites";
import { cn } from "@/lib/utils";
import { useTrainerPokemon } from "@/hooks/useBag";
import { useHealPokemon, useRevivePokemon } from "@/hooks/useBattle";
import { useHealParty, useMyBattle } from "@/hooks/useEncounter";
import type { PartyHealResult, TrainerPokemon } from "@/types/database.types";

type SingleAction = { pokemon: TrainerPokemon; mode: "heal" | "revive" };

function urgency(p: TrainerPokemon) {
  if (p.is_dead) return 3;
  if (p.status === "fainted") return 0;
  if (p.current_hp < p.max_hp || p.status !== "healthy") return 1;
  return 2;
}

function needsCare(p: TrainerPokemon) {
  return !p.is_dead && (p.status !== "healthy" || p.current_hp < p.max_hp);
}

export default function PokemonCenter() {
  const { data: pokemon, isLoading } = useTrainerPokemon();
  const { data: myBattle } = useMyBattle();
  const heal = useHealPokemon();
  const revive = useRevivePokemon();
  const healParty = useHealParty();

  const [single, setSingle] = React.useState<SingleAction | null>(null);
  const [group, setGroup] = React.useState<{ count: number; results: PartyHealResult[] | null } | null>(null);
  const [selecting, setSelecting] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const inBattle = myBattle?.status === "active";
  const busy = !!single || !!group;
  const sorted = [...(pokemon ?? [])].sort((a, b) => urgency(a) - urgency(b) || b.level - a.level);
  const party = (pokemon ?? []).filter((p) => p.party_slot !== null).sort((a, b) => (a.party_slot ?? 0) - (b.party_slot ?? 0));
  const partyNeedsCare = party.filter(needsCare);
  const faintedInParty = party.filter((p) => p.status === "fainted" && !p.is_dead).length;

  function startSingle(p: TrainerPokemon, mode: "heal" | "revive") {
    if (busy) return;
    setSingle({ pokemon: p, mode });
    // The RPC fires immediately, in parallel with the animation, so the
    // database is already correct even if the animation is interrupted.
    (mode === "heal" ? heal : revive).mutate(p.id, { onError: () => setSingle(null) });
  }

  function startGroup(ids: string[] | null, count: number) {
    if (busy || count === 0) return;
    setGroup({ count, results: null });
    healParty.mutate(ids, {
      onSuccess: (results) => setGroup({ count, results }),
      onError: () => setGroup(null),
    });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function finishGroup() {
    setGroup(null);
    setSelecting(false);
    setSelected(new Set());
  }

  const selectedCount = selected.size;
  const selectedFainted = (pokemon ?? []).filter((p) => selected.has(p.id) && p.status === "fainted").length;

  return (
    <div className="relative flex h-full flex-col">
      <AppScreenHeader title="Pokémon Center" subtitle="Heal & revive your team" icon={<HeartPulse className="h-5 w-5" strokeWidth={1.75} />} />

      {inBattle ? (
        <div className="mx-5 mt-3 flex items-center gap-2 rounded-2xl bg-rotom-red/15 px-3 py-2.5 text-xs text-rotom-red-light">
          <Swords className="h-4 w-4 shrink-0" />
          Nurse Joy can&apos;t treat your team while you&apos;re in a battle. Use items from your Bag instead.
        </div>
      ) : null}

      {/* Group actions */}
      {!isLoading && (pokemon ?? []).length > 0 ? (
        <div className="mx-5 mt-3 space-y-2">
          {!selecting ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || inBattle || partyNeedsCare.length === 0}
                onClick={() => startGroup(null, party.length)}
                className="flex flex-1 touch-manipulation items-center justify-center gap-2 rounded-2xl bg-volt py-3 text-sm font-bold text-screen-ink shadow-glass active:scale-[0.98] disabled:opacity-40"
              >
                <HeartPulse className="h-4 w-4" />
                {partyNeedsCare.length === 0
                  ? "Party is fully healthy"
                  : faintedInParty > 0
                    ? `Heal & revive party (${partyNeedsCare.length})`
                    : `Heal entire party (${partyNeedsCare.length})`}
              </button>
              <button
                type="button"
                disabled={busy || inBattle}
                onClick={() => setSelecting(true)}
                className="touch-manipulation rounded-2xl bg-white/10 px-4 text-xs font-semibold text-mist active:scale-95 disabled:opacity-40"
              >
                Select
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || selectedCount === 0}
                onClick={() => startGroup([...selected], selectedCount)}
                className="flex-1 touch-manipulation rounded-2xl bg-volt py-3 text-sm font-bold text-screen-ink shadow-glass active:scale-[0.98] disabled:opacity-40"
              >
                {selectedCount === 0
                  ? "Tap Pokémon to select"
                  : selectedFainted === selectedCount
                    ? `Revive selected (${selectedCount})`
                    : `Heal selected (${selectedCount})`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelecting(false);
                  setSelected(new Set());
                }}
                className="touch-manipulation rounded-2xl bg-white/10 px-4 text-xs font-semibold text-mist active:scale-95"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      ) : null}

      <div className="flex-1 space-y-2.5 overflow-y-auto px-5 py-4">
        {isLoading ? (
          <>
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <HeartPulse className="h-8 w-8 text-mist/20" strokeWidth={1.5} />
            <p className="max-w-[220px] text-xs text-mist/50">You don&apos;t have any Pokémon to heal yet.</p>
          </div>
        ) : (
          sorted.map((p) => {
            const fainted = p.status === "fainted" && !p.is_dead;
            const full = p.current_hp >= p.max_hp && p.status === "healthy";
            const selectable = selecting && needsCare(p);
            const isSelected = selected.has(p.id);
            return (
              <div
                key={p.id}
                role={selectable ? "button" : undefined}
                onClick={selectable ? () => toggle(p.id) : undefined}
                className={cn(
                  "glass theme-accent-line rounded-2xl p-3 shadow-glass transition-colors",
                  selectable && "cursor-pointer active:bg-white/10",
                  isSelected && "ring-1 ring-volt/70",
                  selecting && !selectable && "opacity-50"
                )}
              >
                <div className="flex items-center gap-3">
                  {selecting ? (
                    <div className="shrink-0 text-volt">
                      {isSelected ? <CheckSquare className="h-5 w-5" /> : <Square className={cn("h-5 w-5", !selectable && "text-mist/20")} />}
                    </div>
                  ) : null}
                  <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/5">
                    <SpriteImage
                      src={pokemonSpriteUrl(p.species_id)}
                      alt={p.species.name}
                      className={cn("h-12 w-12", (fainted || p.is_dead) && "opacity-40 grayscale")}
                      fallbackClassName="h-12 w-12"
                    />
                    {p.is_dead ? <Skull className="absolute -right-1 -top-1 h-4 w-4 text-mist/70" /> : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate font-display text-sm font-semibold text-mist">{p.nickname || p.species.name}</p>
                      <span className="shrink-0 font-mono text-[10px] text-mist/50">Lv{p.level}</span>
                      {p.is_shiny ? <Sparkles className="h-3 w-3 shrink-0 text-volt" /> : null}
                      {p.party_slot === null ? <span className="text-[9px] uppercase text-mist/35">PC</span> : null}
                    </div>
                    <HpBar current={p.current_hp} max={p.max_hp} className="mt-1" />
                    <div className="mt-1 flex items-center gap-1.5">
                      {p.is_dead ? (
                        <span className="text-[10px] uppercase tracking-wide text-mist/50">Dead</span>
                      ) : p.status !== "healthy" ? (
                        <StatusBadge status={p.status} />
                      ) : full ? (
                        <span className="text-[10px] uppercase tracking-wide text-emerald-300">Healthy</span>
                      ) : (
                        <span className="text-[10px] uppercase tracking-wide text-amber-300">Injured</span>
                      )}
                    </div>
                  </div>
                </div>

                {!selecting ? (
                  !p.is_dead ? (
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={full || fainted || busy || inBattle}
                        onClick={() => startSingle(p, "heal")}
                        className="flex-1 touch-manipulation rounded-full bg-volt/15 py-2 text-xs font-semibold text-volt active:scale-95 disabled:opacity-35"
                      >
                        Heal
                      </button>
                      {fainted ? (
                        <button
                          type="button"
                          disabled={busy || inBattle}
                          onClick={() => startSingle(p, "revive")}
                          className="flex-1 touch-manipulation rounded-full bg-volt py-2 text-xs font-semibold text-screen-ink active:scale-95 disabled:opacity-50"
                        >
                          Revive
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-3 text-center text-[11px] text-mist/40">This Pokémon has died and can&apos;t be revived.</p>
                  )
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <AnimatePresence>
        {single ? (
          <HealingAnimation
            speciesId={single.pokemon.species_id}
            pokemonName={single.pokemon.nickname || single.pokemon.species.name}
            mode={single.mode}
            onDone={() => setSingle(null)}
          />
        ) : null}
        {group ? <PartyHealingAnimation results={group.results} count={group.count} onDone={finishGroup} /> : null}
      </AnimatePresence>
    </div>
  );
}
