import * as React from "react";
import { ArrowDownToLine, ArrowUpFromLine, HardDrive, Search, SlidersHorizontal, Sparkles, Star } from "lucide-react";
import { AppScreenHeader } from "@/components/phone/AppScreenHeader";
import { PokemonSprite } from "@/components/phone/PokemonSprite";
import { PokemonDetailView } from "@/components/phone/PokemonDetailView";
import { HpBar } from "@/components/phone/HpBar";
import { XpBar } from "@/components/phone/XpBar";
import { TypePill } from "@/components/battle/BattleBits";
import { Skeleton } from "@/components/ui/skeleton";
import { POKEMON_TYPES, typeLabel } from "@/lib/battle";
import { matchesPokemonQuery } from "@/lib/pokemonSearch";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useDebounced } from "@/hooks/useDebounced";
import { useTrainerPokemon } from "@/hooks/useBag";
import { describeLocation, useMoveToPc, useMoveToTeam, usePcBoxes } from "@/hooks/usePc";
import { useMyBattle } from "@/hooks/useEncounter";
import type { PokemonType, TrainerPokemon } from "@/types/database.types";

const PAGE = 40;

export function PcModeToggle({ mode, onChange }: { mode: "list" | "boxes"; onChange: () => void }) {
  return (
    <div className="mx-4 mt-3 flex rounded-xl bg-white/5 p-0.5">
      {(["list", "boxes"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => m !== mode && onChange()}
          className={cn(
            "flex-1 touch-manipulation rounded-lg py-1.5 text-xs font-semibold",
            m === mode ? "bg-volt text-screen-ink" : "text-mist/70"
          )}
        >
          {m === "list" ? "All Pokémon" : "Boxes"}
        </button>
      ))}
    </div>
  );
}

type Where = "all" | "team" | "pc";

/**
 * Every Pokémon the trainer owns in one list, so nothing can get "lost" in
 * a box: search by name or Pokédex number, filter by location, type, level,
 * species, shiny and favourite, and move between Team and PC in one tap.
 */
export function PcListView({ onShowBoxes }: { onShowBoxes: () => void }) {
  const { data: pokemon = [], isLoading } = useTrainerPokemon();
  const { data: boxes } = usePcBoxes();
  const { data: myBattle } = useMyBattle();
  const toPc = useMoveToPc();
  const toTeam = useMoveToTeam();

  const [query, setQuery] = React.useState("");
  const [where, setWhere] = React.useState<Where>("all");
  const [type, setType] = React.useState<PokemonType | "">("");
  const [level, setLevel] = React.useState<string>("");
  const [speciesId, setSpeciesId] = React.useState<string>("");
  const [shinyOnly, setShinyOnly] = React.useState(false);
  const [favOnly, setFavOnly] = React.useState(false);
  const [showFilters, setShowFilters] = React.useState(false);
  const [limit, setLimit] = React.useState(PAGE);
  const [detailId, setDetailId] = React.useState<string | null>(null);

  const debounced = useDebounced(query, 150);
  const inBattle = myBattle?.status === "active";
  const teamCount = pokemon.filter((p) => p.party_slot != null).length;

  const levels = React.useMemo(() => [...new Set(pokemon.map((p) => p.level))].sort((a, b) => a - b), [pokemon]);
  const speciesOptions = React.useMemo(() => {
    const map = new Map<number, string>();
    for (const p of pokemon) map.set(p.species_id, p.species.name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [pokemon]);

  const filtered = React.useMemo(() => {
    return pokemon
      .filter((p) => matchesPokemonQuery(p, debounced))
      .filter((p) => (where === "team" ? p.party_slot != null : where === "pc" ? p.party_slot == null : true))
      .filter((p) => !type || p.species.type1 === type || p.species.type2 === type)
      .filter((p) => !level || p.level === Number(level))
      .filter((p) => !speciesId || p.species_id === Number(speciesId))
      .filter((p) => !shinyOnly || p.is_shiny)
      .filter((p) => !favOnly || p.is_favorite)
      .sort(
        (a, b) =>
          Number(a.party_slot == null) - Number(b.party_slot == null) ||
          (a.party_slot ?? 0) - (b.party_slot ?? 0) ||
          a.species_id - b.species_id ||
          b.level - a.level
      );
  }, [pokemon, debounced, where, type, level, speciesId, shinyOnly, favOnly]);

  React.useEffect(() => setLimit(PAGE), [debounced, where, type, level, speciesId, shinyOnly, favOnly]);

  const activeFilters = [type, level, speciesId].filter(Boolean).length + Number(shinyOnly) + Number(favOnly);

  const detail = pokemon.find((p) => p.id === detailId) ?? null;
  if (detail) return <PokemonDetailView pokemon={detail} onBack={() => setDetailId(null)} />;

  function move(p: TrainerPokemon) {
    const name = p.nickname || p.species.name;
    if (p.party_slot != null) {
      toPc.mutate(p.id, { onSuccess: () => toast(`${name} was sent to the PC`, "success") });
    } else {
      toTeam.mutate(p.id, { onSuccess: () => toast(`${name} joined your Team`, "success") });
    }
  }

  return (
    <div className="flex h-full flex-col">
      <AppScreenHeader title="PC" subtitle={`${pokemon.length} Pokémon · Team ${teamCount}/6`} icon={<HardDrive className="h-5 w-5" strokeWidth={1.75} />} />
      <PcModeToggle mode="list" onChange={onShowBoxes} />

      {/* Search + filters */}
      <div className="space-y-2 px-4 pt-3">
        <div className="flex gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3">
            <Search className="h-4 w-4 shrink-0 text-mist/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Pokémon or Pokédex no…"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-mist placeholder:text-mist/40 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={cn(
              "relative flex w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-white/15",
              showFilters ? "bg-volt text-screen-ink" : "bg-white/5 text-mist"
            )}
            aria-label="Filters"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {activeFilters > 0 ? (
              <span className="absolute -right-1 -top-1 rounded-full bg-rotom-red px-1.5 text-[10px] font-bold text-white">{activeFilters}</span>
            ) : null}
          </button>
        </div>

        <div className="flex rounded-xl bg-white/5 p-0.5">
          {(
            [
              ["all", "All"],
              ["team", "Team"],
              ["pc", "PC"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setWhere(value)}
              className={cn("flex-1 touch-manipulation rounded-lg py-1 text-[11px] font-semibold", where === value ? "bg-white/15 text-mist" : "text-mist/50")}
            >
              {label}
            </button>
          ))}
        </div>

        {showFilters ? (
          <div className="glass grid grid-cols-2 gap-2 rounded-2xl p-2.5 text-xs">
            <select value={type} onChange={(e) => setType(e.target.value as PokemonType | "")} className="rounded-lg border border-white/15 bg-screen-deep px-2 py-1.5 text-mist">
              <option value="">Any type</option>
              {POKEMON_TYPES.map((t) => (
                <option key={t} value={t}>
                  {typeLabel(t)}
                </option>
              ))}
            </select>
            <select value={level} onChange={(e) => setLevel(e.target.value)} className="rounded-lg border border-white/15 bg-screen-deep px-2 py-1.5 text-mist">
              <option value="">Any level</option>
              {levels.map((l) => (
                <option key={l} value={l}>
                  Level {l}
                </option>
              ))}
            </select>
            <select
              value={speciesId}
              onChange={(e) => setSpeciesId(e.target.value)}
              className="col-span-2 rounded-lg border border-white/15 bg-screen-deep px-2 py-1.5 text-mist"
            >
              <option value="">Any species</option>
              {speciesOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  #{String(id).padStart(3, "0")} {name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShinyOnly((v) => !v)}
              className={cn("flex items-center justify-center gap-1 rounded-lg py-1.5", shinyOnly ? "bg-volt text-screen-ink" : "bg-white/5 text-mist")}
            >
              <Sparkles className="h-3.5 w-3.5" /> Shiny
            </button>
            <button
              type="button"
              onClick={() => setFavOnly((v) => !v)}
              className={cn("flex items-center justify-center gap-1 rounded-lg py-1.5", favOnly ? "bg-volt text-screen-ink" : "bg-white/5 text-mist")}
            >
              <Star className="h-3.5 w-3.5" /> Favorite
            </button>
            {activeFilters > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setType("");
                  setLevel("");
                  setSpeciesId("");
                  setShinyOnly(false);
                  setFavOnly(false);
                }}
                className="col-span-2 py-1 text-[11px] text-mist/60 underline-offset-2 hover:underline"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Results */}
      <div className="flex-1 space-y-1.5 overflow-y-auto px-4 py-3">
        {isLoading ? (
          <>
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-xs text-mist/50">{pokemon.length === 0 ? "You don't have any Pokémon yet." : "No Pokémon match your search."}</p>
        ) : (
          <>
            <p className="px-1 text-[10px] text-mist/40">
              Showing {Math.min(limit, filtered.length)} of {filtered.length}
            </p>
            {filtered.slice(0, limit).map((p) => {
              const inTeam = p.party_slot != null;
              const down = p.is_dead || p.status === "fainted";
              const lastInTeam = inTeam && teamCount <= 1;
              const teamFull = !inTeam && teamCount >= 6;
              const blocked = inBattle || lastInTeam || teamFull;
              return (
                <div key={p.id} className="glass flex items-center gap-2.5 rounded-2xl p-2">
                  <button type="button" onClick={() => setDetailId(p.id)} className="flex min-w-0 flex-1 touch-manipulation items-center gap-2.5 text-left">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/5">
                      <PokemonSprite speciesId={p.species_id} view="icon" shiny={p.is_shiny} alt={p.species.name} className={cn("h-11 w-11", down && "opacity-40 grayscale")} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <p className="truncate text-sm font-medium text-mist">{p.nickname || p.species.name}</p>
                        <span className="shrink-0 font-mono text-[10px] text-mist/50">Lv{p.level}</span>
                        {p.is_shiny ? <Sparkles className="h-3 w-3 shrink-0 text-volt" /> : null}
                        {p.is_favorite ? <Star className="h-3 w-3 shrink-0 fill-volt text-volt" /> : null}
                      </div>
                      <div className="flex items-center gap-1">
                        <TypePill type={p.species.type1} />
                        <TypePill type={p.species.type2} />
                        <span className={cn("truncate text-[10px]", inTeam ? "text-emerald-300" : "text-mist/45")}>{describeLocation(p, boxes)}</span>
                      </div>
                      <HpBar current={p.current_hp} max={p.max_hp} className="mt-1" />
                      <XpBar xp={p.xp} level={p.level} className="mt-0.5" />
                    </div>
                  </button>
                  <button
                    type="button"
                    disabled={blocked || toPc.isPending || toTeam.isPending}
                    title={inBattle ? "Not during a battle" : lastInTeam ? "Your Team can't be empty" : teamFull ? "Your Team is full" : undefined}
                    onClick={() => move(p)}
                    className="flex w-16 shrink-0 touch-manipulation flex-col items-center gap-0.5 rounded-xl bg-white/5 py-1.5 text-[10px] font-semibold text-mist active:bg-white/10 disabled:opacity-35"
                  >
                    {inTeam ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpFromLine className="h-4 w-4" />}
                    {inTeam ? "To PC" : "To Team"}
                  </button>
                </div>
              );
            })}
            {filtered.length > limit ? (
              <button
                type="button"
                onClick={() => setLimit((l) => l + PAGE)}
                className="w-full touch-manipulation rounded-xl bg-white/5 py-2 text-xs font-semibold text-mist active:bg-white/10"
              >
                Show more ({filtered.length - limit} left)
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
