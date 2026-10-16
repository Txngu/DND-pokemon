import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Swords, Plus, ScrollText, X, Skull } from "lucide-react";
import { AppScreenHeader } from "@/components/phone/AppScreenHeader";
import { HpBar } from "@/components/phone/HpBar";
import { KpEditor } from "@/components/phone/KpEditor";
import { SpriteImage } from "@/components/phone/SpriteImage";
import { Skeleton } from "@/components/ui/skeleton";
import { pokemonSpriteUrl } from "@/lib/sprites";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { usePhoneContext } from "@/hooks/usePhoneContext";
import { useTrainerPokemon } from "@/hooks/useBag";
import {
  useActiveEncounters,
  useEncountersRealtime,
  useBattleParticipants,
  useBattleLogs,
  useBattleRealtime,
  useJoinBattle,
  useLeaveBattle,
  useAdjustPokemonKp,
} from "@/hooks/useBattle";
import type { BattleEncounter } from "@/types/database.types";

/**
 * Player-facing Battle app: watch an encounter live (enemy KP, party KP,
 * shared log), bring one of your own Pokémon into it, and take damage/heal
 * with each change logged against the encounter. Everything here is driven
 * by Supabase Realtime — nobody has to refresh.
 */
export default function Battle() {
  const { data: encounters, isLoading } = useActiveEncounters();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  useEncountersRealtime();

  const selected = encounters?.find((e) => e.id === selectedId) ?? null;

  if (selectedId && !selected && !isLoading) {
    // The encounter ended (or vanished) while this player was watching it.
    return (
      <div className="flex h-full flex-col">
        <AppScreenHeader title="Battle" icon={<Swords className="h-5 w-5" strokeWidth={1.75} />} onBack={() => setSelectedId(null)} />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
          <Swords className="h-8 w-8 text-mist/20" strokeWidth={1.5} />
          <p className="text-sm text-mist/60">This encounter has ended.</p>
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="mt-2 touch-manipulation rounded-full bg-volt px-5 py-2 text-xs font-semibold text-screen-ink active:scale-95"
          >
            Back to battles
          </button>
        </div>
      </div>
    );
  }

  if (selected) {
    return <EncounterView encounter={selected} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="flex h-full flex-col">
      <AppScreenHeader title="Battle" subtitle="Live encounters" icon={<Swords className="h-5 w-5" strokeWidth={1.75} />} />
      <div className="flex-1 space-y-2.5 overflow-y-auto px-5 py-4">
        {isLoading ? (
          <>
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
          </>
        ) : !encounters || encounters.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Swords className="h-8 w-8 text-mist/20" strokeWidth={1.5} />
            <p className="max-w-[230px] text-xs text-mist/50">
              No battles are running right now. When your Game Master starts an encounter, it will show up here.
            </p>
          </div>
        ) : (
          encounters.map((enc) => (
            <button
              key={enc.id}
              type="button"
              onClick={() => setSelectedId(enc.id)}
              className="glass theme-accent-line block w-full touch-manipulation rounded-2xl p-3.5 text-left shadow-glass active:bg-white/10"
            >
              <div className="flex items-center justify-between">
                <p className="font-display text-sm font-semibold text-mist">{enc.name}</p>
                <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">Live</span>
              </div>
              <p className="mt-0.5 text-xs text-mist/60">
                {enc.enemy_name} · Lv{enc.level}
              </p>
              <HpBar current={enc.current_kp} max={enc.max_kp} label="KP" className="mt-2" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function EncounterView({ encounter, onBack }: { encounter: BattleEncounter; onBack: () => void }) {
  const { profile } = usePhoneContext();
  const { data: participants } = useBattleParticipants(encounter.id);
  const { data: logs } = useBattleLogs(encounter.id);
  const { data: myPokemon } = useTrainerPokemon();
  const joinBattle = useJoinBattle();
  const leaveBattle = useLeaveBattle();
  const adjustKp = useAdjustPokemonKp();
  const [pickerOpen, setPickerOpen] = React.useState(false);

  useBattleRealtime(encounter.id);

  const mine = (participants ?? []).filter((p) => p.profile_id === profile.id);
  const others = (participants ?? []).filter((p) => p.profile_id !== profile.id);
  const joinedIds = new Set((participants ?? []).map((p) => p.pokemon_id));
  const eligible = (myPokemon ?? []).filter((p) => !joinedIds.has(p.id) && !p.is_dead && p.status !== "fainted");

  return (
    <div className="relative flex h-full flex-col">
      <AppScreenHeader
        title={encounter.name}
        subtitle={`${encounter.enemy_name} · Lv${encounter.level}`}
        icon={<Swords className="h-5 w-5" strokeWidth={1.75} />}
        onBack={onBack}
      />

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white/5">
              {encounter.enemy_species_id ? (
                <SpriteImage src={pokemonSpriteUrl(encounter.enemy_species_id)} alt={encounter.enemy_name} className="h-14 w-14" fallbackClassName="h-14 w-14" />
              ) : (
                <Swords className="h-7 w-7 text-mist/40" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base font-semibold text-mist">{encounter.enemy_name}</p>
              <p className="text-[11px] text-mist/50">Level {encounter.level}</p>
              <HpBar current={encounter.current_kp} max={encounter.max_kp} label="KP" className="mt-1.5" />
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[11px] uppercase tracking-wide text-mist/50">Your Pokémon</p>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex touch-manipulation items-center gap-1 rounded-full bg-volt/15 px-3 py-1 text-[11px] font-semibold text-volt active:scale-95"
            >
              <Plus className="h-3 w-3" />
              Join
            </button>
          </div>

          {mine.length === 0 ? (
            <p className="glass rounded-2xl px-4 py-5 text-center text-xs text-mist/50">You haven&apos;t brought a Pokémon into this battle yet.</p>
          ) : (
            <div className="space-y-2.5">
              {mine.map((p) => {
                const fainted = p.pokemon.status === "fainted" && !p.pokemon.is_dead;
                const name = p.pokemon.nickname || p.pokemon.species.name;
                return (
                  <div key={p.id} className="glass theme-accent-line rounded-2xl p-3">
                    <div className="flex items-center gap-3">
                      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/5">
                        <SpriteImage
                          src={pokemonSpriteUrl(p.pokemon.species_id)}
                          alt={p.pokemon.species.name}
                          className={cn("h-10 w-10", (fainted || p.pokemon.is_dead) && "opacity-40 grayscale")}
                          fallbackClassName="h-10 w-10"
                        />
                        {p.pokemon.is_dead ? <Skull className="absolute -right-1 -top-1 h-4 w-4 text-mist/70" /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-mist">
                          {name} <span className="font-mono text-[10px] text-mist/50">Lv{p.pokemon.level}</span>
                        </p>
                        <HpBar current={p.pokemon.current_hp} max={p.pokemon.max_hp} className="mt-1" />
                      </div>
                      <button
                        type="button"
                        onClick={() => leaveBattle.mutate(p.id)}
                        className="flex h-7 w-7 shrink-0 touch-manipulation items-center justify-center rounded-full text-mist/40 active:bg-white/10"
                        aria-label="Leave battle"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-3">
                      {p.pokemon.is_dead ? (
                        <p className="text-center text-[11px] text-mist/40">This Pokémon has died.</p>
                      ) : fainted ? (
                        <p className="text-center text-[11px] text-rotom-red-light">Fainted — revive it at the Pokémon Center.</p>
                      ) : (
                        <KpEditor
                          compact
                          disabled={adjustKp.isPending}
                          onAdjust={(delta) =>
                            adjustKp.mutate(
                              { pokemonId: p.pokemon_id, delta, encounterId: encounter.id },
                              {
                                onSuccess: (updated) =>
                                  toast(
                                    updated.current_hp === 0 && delta < 0
                                      ? `${name} fainted!`
                                      : delta > 0
                                        ? `${name} +${delta} KP`
                                        : `${name} ${delta} KP`,
                                    updated.current_hp === 0 && delta < 0 ? "error" : "info"
                                  ),
                              }
                            )
                          }
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {others.length > 0 ? (
          <div>
            <p className="mb-2 px-1 text-[11px] uppercase tracking-wide text-mist/50">Party</p>
            <div className="space-y-2">
              {others.map((p) => (
                <div key={p.id} className="glass flex items-center gap-3 rounded-2xl p-3">
                  <SpriteImage
                    src={pokemonSpriteUrl(p.pokemon.species_id)}
                    alt={p.pokemon.species.name}
                    className={cn("h-9 w-9", (p.pokemon.status === "fainted" || p.pokemon.is_dead) && "opacity-40 grayscale")}
                    fallbackClassName="h-9 w-9"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-mist">
                      {p.pokemon.nickname || p.pokemon.species.name} <span className="text-mist/40">· {p.trainer.username}</span>
                    </p>
                    <HpBar current={p.pokemon.current_hp} max={p.pokemon.max_hp} className="mt-1" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <p className="mb-2 flex items-center gap-1.5 px-1 text-[11px] uppercase tracking-wide text-mist/50">
            <ScrollText className="h-3 w-3" />
            Battle log
          </p>
          {!logs || logs.length === 0 ? (
            <p className="glass rounded-2xl px-4 py-5 text-center text-xs text-mist/50">Nothing has happened yet.</p>
          ) : (
            <div className="space-y-1.5">
              {logs.map((log) => (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass flex items-center justify-between gap-2 rounded-xl px-3 py-2"
                >
                  <p className="min-w-0 text-[11px] text-mist/80">
                    <span className="font-medium text-mist">{log.target_label}</span> {log.delta > 0 ? "healed" : "took damage"}{" "}
                    <span className="font-mono text-mist/50">
                      ({log.previous_kp} → {log.new_kp})
                    </span>
                  </p>
                  <span className="shrink-0 font-mono text-[10px] text-mist/40">
                    {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {pickerOpen ? (
          <motion.div className="absolute inset-0 z-40 flex flex-col justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/60" onClick={() => setPickerOpen(false)} />
            <motion.div
              className="glass relative z-10 max-h-[70%] overflow-y-auto rounded-t-3xl p-4 shadow-glass"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 34 }}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-mist">Bring a Pokémon</h2>
                <button type="button" onClick={() => setPickerOpen(false)} className="flex h-8 w-8 touch-manipulation items-center justify-center rounded-full bg-white/5 text-mist">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {eligible.length === 0 ? (
                <p className="py-6 text-center text-xs text-mist/50">None of your Pokémon are available — fainted and dead Pokémon can&apos;t battle.</p>
              ) : (
                <div className="space-y-2">
                  {eligible.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => joinBattle.mutate({ encounterId: encounter.id, pokemonId: p.id }, { onSuccess: () => setPickerOpen(false) })}
                      className="flex w-full touch-manipulation items-center gap-3 rounded-2xl bg-white/5 p-2.5 text-left active:bg-white/10"
                    >
                      <SpriteImage src={pokemonSpriteUrl(p.species_id)} alt={p.species.name} className="h-9 w-9" fallbackClassName="h-9 w-9" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-mist">{p.nickname || p.species.name}</p>
                        <HpBar current={p.current_hp} max={p.max_hp} className="mt-1" />
                      </div>
                      <span className="shrink-0 font-mono text-[10px] text-mist/50">Lv{p.level}</span>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
