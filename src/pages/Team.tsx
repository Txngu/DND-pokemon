import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownToLine, Plus, Search, Sparkles, Star, Swords, Users, X } from "lucide-react";
import { AppScreenHeader } from "@/components/phone/AppScreenHeader";
import { PokemonSprite } from "@/components/phone/PokemonSprite";
import { PokemonDetailView } from "@/components/phone/PokemonDetailView";
import { HpBar } from "@/components/phone/HpBar";
import { XpBar } from "@/components/phone/XpBar";
import { StatusBadge } from "@/components/phone/StatusBadge";
import { TypePill } from "@/components/battle/BattleBits";
import { CollectionCardDetail, LinkedCardsStrip } from "@/components/tcg/TcgBits";
import { Skeleton } from "@/components/ui/skeleton";
import { matchesPokemonQuery } from "@/lib/pokemonSearch";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useTrainerPokemon } from "@/hooks/useBag";
import { describeLocation, useMoveToPc, useMoveToTeam, usePcBoxes } from "@/hooks/usePc";
import { useMyBattle } from "@/hooks/useEncounter";
import type { TcgCollectionEntry, TrainerPokemon } from "@/types/database.types";

const TEAM_SIZE = 6;

/**
 * The trainer's active Team (up to 6). Shows sprite, level, KP, XP, types
 * and linked TCG cards; Pokémon can be sent to the PC (never the last one,
 * never during a battle) and empty slots filled from the PC.
 */
export default function Team() {
  const { data: pokemon = [], isLoading } = useTrainerPokemon();
  const { data: boxes } = usePcBoxes();
  const { data: myBattle } = useMyBattle();
  const toPc = useMoveToPc();
  const toTeam = useMoveToTeam();

  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [openCard, setOpenCard] = React.useState<TcgCollectionEntry | null>(null);

  const inBattle = myBattle?.status === "active";
  const team = pokemon.filter((p) => p.party_slot != null).sort((a, b) => (a.party_slot ?? 0) - (b.party_slot ?? 0));
  const stored = pokemon.filter((p) => p.party_slot == null);
  const free = TEAM_SIZE - team.length;

  const detail = pokemon.find((p) => p.id === detailId) ?? null;
  if (detail) return <PokemonDetailView pokemon={detail} onBack={() => setDetailId(null)} />;

  return (
    <div className="relative flex h-full flex-col">
      <AppScreenHeader title="Team" subtitle={`${team.length}/${TEAM_SIZE} Pokémon`} icon={<Users className="h-5 w-5" strokeWidth={1.75} />} />

      {inBattle ? (
        <div className="mx-5 mt-3 flex items-center gap-2 rounded-2xl bg-rotom-red/15 px-3 py-2.5 text-xs text-rotom-red-light">
          <Swords className="h-4 w-4 shrink-0" />
          You&apos;re in a battle — your Team can&apos;t be changed until it ends.
        </div>
      ) : null}

      <div className="flex-1 space-y-2.5 overflow-y-auto px-5 py-4">
        {isLoading ? (
          <>
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-28 w-full rounded-2xl" />
          </>
        ) : (
          <>
            {team.map((p) => {
              const down = p.is_dead || p.status === "fainted";
              const isLast = team.length <= 1;
              return (
                <div key={p.id} className="glass theme-accent-line rounded-2xl p-3 shadow-glass">
                  <button type="button" onClick={() => setDetailId(p.id)} className="flex w-full touch-manipulation items-center gap-3 text-left">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white/5">
                      <PokemonSprite
                        speciesId={p.species_id}
                        shiny={p.is_shiny}
                        alt={p.species.name}
                        className={cn("h-16 w-16", down && "opacity-40 grayscale")}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate font-display text-sm font-semibold text-mist">{p.nickname || p.species.name}</p>
                        <span className="shrink-0 font-mono text-[10px] text-mist/50">Lv{p.level}</span>
                        {p.is_shiny ? <Sparkles className="h-3 w-3 shrink-0 text-volt" /> : null}
                        {p.is_favorite ? <Star className="h-3 w-3 shrink-0 fill-volt text-volt" /> : null}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        <TypePill type={p.species.type1} />
                        <TypePill type={p.species.type2} />
                        {p.is_dead ? (
                          <span className="text-[10px] uppercase text-mist/50">Dead</span>
                        ) : p.status !== "healthy" ? (
                          <StatusBadge status={p.status} />
                        ) : null}
                      </div>
                      <HpBar current={p.current_hp} max={p.max_hp} className="mt-1.5" />
                      <XpBar xp={p.xp} level={p.level} className="mt-1" />
                    </div>
                  </button>

                  <div className="mt-2 flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <LinkedCardsStrip pokemonId={p.id} onOpen={setOpenCard} />
                    </div>
                    <button
                      type="button"
                      disabled={isLast || inBattle || toPc.isPending}
                      title={isLast ? "Your Team can't be empty" : inBattle ? "Not during a battle" : undefined}
                      onClick={() =>
                        toPc.mutate(p.id, { onSuccess: () => toast(`${p.nickname || p.species.name} was sent to the PC`, "success") })
                      }
                      className="flex shrink-0 touch-manipulation items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-mist active:scale-95 disabled:opacity-35"
                    >
                      <ArrowDownToLine className="h-3.5 w-3.5" />
                      To PC
                    </button>
                  </div>
                </div>
              );
            })}

            {Array.from({ length: Math.max(0, free) }).map((_, i) => (
              <button
                key={`empty-${i}`}
                type="button"
                disabled={inBattle || stored.length === 0}
                onClick={() => setPickerOpen(true)}
                className="flex w-full touch-manipulation items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 py-5 text-xs text-mist/50 active:bg-white/5 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {stored.length === 0 ? "Empty slot" : "Empty slot — add a Pokémon from the PC"}
              </button>
            ))}

            {team.length === 0 && pokemon.length === 0 ? (
              <p className="py-6 text-center text-xs text-mist/50">You don&apos;t have any Pokémon yet.</p>
            ) : null}
          </>
        )}
      </div>

      <AnimatePresence>
        {pickerOpen ? (
          <PcPicker
            stored={stored}
            locationOf={(p) => describeLocation(p, boxes)}
            busy={toTeam.isPending}
            onClose={() => setPickerOpen(false)}
            onPick={(p) =>
              toTeam.mutate(p.id, {
                onSuccess: () => {
                  toast(`${p.nickname || p.species.name} joined your Team`, "success");
                  setPickerOpen(false);
                },
              })
            }
          />
        ) : null}
        {openCard ? <CollectionCardDetail entry={openCard} onClose={() => setOpenCard(null)} /> : null}
      </AnimatePresence>
    </div>
  );
}

/** Bottom sheet: pick one of the Pokémon stored in the PC (searchable). */
function PcPicker({
  stored,
  locationOf,
  busy,
  onClose,
  onPick,
}: {
  stored: TrainerPokemon[];
  locationOf: (p: TrainerPokemon) => string;
  busy: boolean;
  onClose: () => void;
  onPick: (p: TrainerPokemon) => void;
}) {
  const [query, setQuery] = React.useState("");
  const list = stored.filter((p) => matchesPokemonQuery(p, query)).sort((a, b) => b.level - a.level || a.species_id - b.species_id);
  const shown = list.slice(0, 60);

  return (
    <motion.div className="absolute inset-0 z-40 flex flex-col justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        className="relative z-10 flex max-h-[80%] flex-col rounded-t-3xl border-t border-white/10 bg-screen-deep p-4 shadow-glass"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-sm font-semibold text-mist">Add from the PC</p>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-mist" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3">
          <Search className="h-4 w-4 text-mist/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or Pokédex no."
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-mist placeholder:text-mist/40 focus:outline-none"
          />
        </div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {shown.length === 0 ? <p className="py-6 text-center text-xs text-mist/50">No Pokémon match.</p> : null}
          {shown.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={busy}
              onClick={() => onPick(p)}
              className="flex w-full touch-manipulation items-center gap-3 rounded-xl bg-white/5 p-2 text-left active:bg-white/10 disabled:opacity-50"
            >
              <PokemonSprite speciesId={p.species_id} view="icon" shiny={p.is_shiny} alt={p.species.name} className="h-9 w-9" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-mist">
                  {p.nickname || p.species.name} <span className="font-mono text-[10px] text-mist/50">Lv{p.level}</span>
                </p>
                <p className="truncate text-[10px] text-mist/45">{locationOf(p)}</p>
              </div>
              <span className="flex gap-1">
                <TypePill type={p.species.type1} />
                <TypePill type={p.species.type2} />
              </span>
            </button>
          ))}
          {list.length > shown.length ? (
            <p className="py-2 text-center text-[11px] text-mist/40">Showing 60 of {list.length} — refine the search to see more.</p>
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  );
}
