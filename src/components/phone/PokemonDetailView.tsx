import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Star, Sparkles, Package, Skull, Zap } from "lucide-react";
import { AppScreenHeader } from "@/components/phone/AppScreenHeader";
import { PokemonSprite } from "@/components/phone/PokemonSprite";
import { ItemIcon } from "@/components/phone/ItemIcon";
import { HpBar } from "@/components/phone/HpBar";
import { XpBar } from "@/components/phone/XpBar";
import { KpEditor } from "@/components/phone/KpEditor";
import { DamageControl } from "@/components/phone/DamageControl";
import { StatusBadge } from "@/components/phone/StatusBadge";
import { HeldItemSheet } from "@/components/phone/HeldItemSheet";
import { EvolutionAnimation } from "@/components/phone/EvolutionAnimation";
import { useTrainerItems, useToggleFavorite, useSetHeldItem, useSpecies } from "@/hooks/useBag";
import {
  useAdjustPokemonKp,
  useGrantPokemonXp,
  useEvolutionRulesFor,
  useEvolveWithItem,
  useGameConfig,
} from "@/hooks/useBattle";
import { toast } from "@/lib/toast";
import { useProfile } from "@/hooks/useProfile";
import { TypePill } from "@/components/battle/BattleBits";
import { LinkedCardsStrip } from "@/components/tcg/TcgBits";
import { useTcgLinks } from "@/hooks/useTcg";
import type { TrainerPokemon } from "@/types/database.types";

export function PokemonDetailView({ pokemon, onBack }: { pokemon: TrainerPokemon; onBack: () => void }) {
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [xpInput, setXpInput] = React.useState("");
  const [evoAnim, setEvoAnim] = React.useState<{ fromId: number; fromName: string; toId: number; toName: string } | null>(null);

  const { data: items = [] } = useTrainerItems();
  const { data: allSpecies } = useSpecies();
  const { data: config } = useGameConfig();
  const { data: evoRules } = useEvolutionRulesFor(pokemon.species_id);
  const { data: me } = useProfile();
  const { data: links } = useTcgLinks();
  // KP/XP are changed by battles, items, the Pokémon Center and battle
  // rewards. Direct editing is for the Game Master, unless they've turned
  // player_self_edit back on. (The server enforces this regardless.)
  const canSelfEdit = me?.role === "admin" || !!config?.playerSelfEdit;

  const toggleFavorite = useToggleFavorite();
  const setHeldItem = useSetHeldItem();
  const adjustKp = useAdjustPokemonKp();
  const grantXp = useGrantPokemonXp();
  const evolveWithItem = useEvolveWithItem();

  const displayName = pokemon.nickname || pokemon.species.name;
  const fainted = pokemon.status === "fainted" && !pokemon.is_dead;
  const atMaxLevel = config ? pokemon.level >= config.maxLevel : false;

  // Level evolutions happen automatically when XP crosses a threshold (see
  // grant_pokemon_xp); only item / held-item evolutions need an explicit tap.
  const itemRules = (evoRules ?? []).filter((r) => r.method === "item" || r.method === "held_item");

  function speciesNameFor(id: number) {
    return allSpecies?.find((s) => s.id === id)?.name ?? `#${id}`;
  }

  function handleKpAdjust(delta: number) {
    adjustKp.mutate(
      { pokemonId: pokemon.id, delta },
      {
        onSuccess: (updated) => {
          if (updated.current_hp === 0 && delta < 0) {
            toast(`${displayName} fainted!`, "error");
          } else {
            toast(delta > 0 ? `+${delta} KP` : `${delta} KP`, delta > 0 ? "success" : "info");
          }
        },
      }
    );
  }

  function handleGrantXp() {
    const amount = Math.max(0, Math.round(Number(xpInput)) || 0);
    if (amount <= 0) return;
    const beforeSpecies = pokemon.species_id;
    const beforeName = pokemon.species.name;
    grantXp.mutate(
      { pokemonId: pokemon.id, amount },
      {
        onSuccess: (updated) => {
          setXpInput("");
          if (updated.species_id !== beforeSpecies) {
            setEvoAnim({ fromId: beforeSpecies, fromName: beforeName, toId: updated.species_id, toName: speciesNameFor(updated.species_id) });
          } else if (updated.level > pokemon.level) {
            toast(`${displayName} reached level ${updated.level}!`, "success");
          } else {
            toast(`+${amount} XP`, "success");
          }
        },
      }
    );
  }

  function handleEvolve(ruleId: string, toSpeciesId: number) {
    const beforeSpecies = pokemon.species_id;
    const beforeName = pokemon.species.name;
    evolveWithItem.mutate(
      { pokemonId: pokemon.id, ruleId },
      {
        onSuccess: () => {
          setEvoAnim({ fromId: beforeSpecies, fromName: beforeName, toId: toSpeciesId, toName: speciesNameFor(toSpeciesId) });
        },
      }
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      <AppScreenHeader title={displayName} subtitle={`Lv${pokemon.level} · ${pokemon.species.name}`} onBack={onBack} />

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="flex flex-col items-center gap-2 pb-4">
          <div className="glass relative flex h-40 w-40 items-center justify-center rounded-3xl">
            <PokemonSprite
              speciesId={pokemon.species_id}
              view="large"
              shiny={pokemon.is_shiny}
              alt={pokemon.species.name}
              className={(pokemon.is_dead || fainted ? "opacity-40 grayscale " : "") + "h-36 w-36"}
            />
            {pokemon.is_dead ? (
              <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-black/40">
                <Skull className="h-10 w-10 text-mist/70" />
              </div>
            ) : null}
            {pokemon.is_shiny ? (
              <Sparkles className="absolute right-3 top-3 h-5 w-5 text-volt drop-shadow-[0_0_6px_rgba(255,210,63,0.8)]" />
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const next = !pokemon.is_favorite;
                toggleFavorite.mutate(
                  { pokemonId: pokemon.id, isFavorite: next },
                  { onSuccess: () => toast(next ? "Added to favorites" : "Removed from favorites", "success") }
                );
              }}
              disabled={toggleFavorite.isPending}
              className="mt-1 flex touch-manipulation items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium text-mist active:scale-95 disabled:opacity-50"
            >
              <Star className={pokemon.is_favorite ? "h-4 w-4 fill-volt text-volt" : "h-4 w-4 text-mist/60"} />
              {pokemon.is_favorite ? "Favorite" : "Set as favorite"}
            </button>
            {pokemon.is_dead ? (
              <span className="mt-1 rounded-full bg-mist/10 px-3 py-1.5 text-xs font-semibold text-mist/60">Dead</span>
            ) : null}
          </div>
        </div>

        {/* KP */}
        <div className="mb-3">
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-mist/50">KP</p>
          <div className="glass space-y-2.5 rounded-2xl p-3">
            <div className="flex items-center justify-between">
              <HpBar current={pokemon.current_hp} max={pokemon.max_hp} className="flex-1" />
              <StatusBadge status={pokemon.status} className="ml-3 shrink-0" />
            </div>
            {pokemon.is_dead ? (
              <p className="text-center text-[11px] text-mist/40">This Pokémon has died and can&apos;t be changed.</p>
            ) : fainted ? (
              <p className="text-center text-[11px] text-rotom-red-light">Fainted — visit the Pokémon Center to revive.</p>
            ) : (
              <>
                {/* PokéGear 12: trainers can always record damage on their own Pokémon */}
                <DamageControl pokemon={pokemon} name={displayName} />
                {canSelfEdit ? <KpEditor onAdjust={handleKpAdjust} disabled={adjustKp.isPending} /> : null}
              </>
            )}
          </div>
        </div>

        {/* XP */}
        <div className="mb-3">
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-mist/50">XP</p>
          <div className="glass space-y-2.5 rounded-2xl p-3">
            <XpBar xp={pokemon.xp} level={pokemon.level} />
            {!pokemon.is_dead && !atMaxLevel && canSelfEdit ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={xpInput}
                  onChange={(e) => setXpInput(e.target.value)}
                  placeholder="Gain XP"
                  className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-center font-mono text-sm text-mist placeholder:text-mist/30 focus:outline-none focus:ring-1 focus:ring-volt"
                />
                <button
                  type="button"
                  disabled={grantXp.isPending || !xpInput}
                  onClick={handleGrantXp}
                  className="flex touch-manipulation items-center gap-1 rounded-lg bg-volt px-4 py-2 text-xs font-semibold text-screen-ink active:scale-95 disabled:opacity-50"
                >
                  <Zap className="h-3.5 w-3.5" />
                  Confirm
                </button>
              </div>
            ) : atMaxLevel ? (
              <p className="text-center text-[11px] text-mist/40">Max level reached.</p>
            ) : null}
          </div>
        </div>

        {/* TCG cards the trainer linked to this Pokémon (if any) */}
        {(links ?? []).some((l) => l.pokemon_id === pokemon.id) ? (
          <div className="mb-3">
            <p className="mb-1.5 text-[11px] uppercase tracking-wide text-mist/50">TCG cards</p>
            <div className="glass rounded-2xl p-3">
              <LinkedCardsStrip pokemonId={pokemon.id} size="md" />
            </div>
          </div>
        ) : null}

        {/* Types (from the species). PokéGear 12.1: no stats, moves, nature or
            ability — attacks and damage are decided at the table. */}
        {pokemon.species.type1 ? (
          <div className="glass mb-2.5 flex items-center justify-between rounded-2xl p-3">
            <p className="text-[10px] uppercase tracking-wide text-mist/50">Types</p>
            <div className="flex gap-1">
              <TypePill type={pokemon.species.type1} />
              <TypePill type={pokemon.species.type2} />
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          disabled={pokemon.is_dead}
          className="glass flex w-full touch-manipulation items-center gap-3 rounded-2xl p-3 text-left active:bg-white/10 disabled:opacity-50"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5">
            {pokemon.held_item ? <ItemIcon item={pokemon.held_item} className="h-7 w-7" /> : <Package className="h-5 w-5 text-mist/40" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wide text-mist/50">Held item</p>
            <p className="truncate text-sm font-medium text-mist">{pokemon.held_item?.name ?? "None — tap to set"}</p>
          </div>
        </button>

        {setHeldItem.isError ? (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-xs text-rotom-red-light">
            {(setHeldItem.error as Error).message}
          </motion.p>
        ) : null}

        {/* Evolution (item-based; level evolutions are automatic) */}
        {!pokemon.is_dead && itemRules.length > 0 ? (
          <div className="mt-2.5 space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-mist/50">Evolution</p>
            {itemRules.map((rule) => {
              const eligible =
                rule.method === "held_item"
                  ? pokemon.held_item_id === rule.item_id
                  : (items.find((i) => i.item_id === rule.item_id)?.quantity ?? 0) > 0;
              return (
                <button
                  key={rule.id}
                  type="button"
                  disabled={!eligible || evolveWithItem.isPending}
                  onClick={() => handleEvolve(rule.id, rule.to_species_id)}
                  className="glass flex w-full touch-manipulation items-center gap-3 rounded-2xl p-3 text-left active:bg-white/10 disabled:opacity-40"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-volt/15">
                    {rule.item ? <ItemIcon item={rule.item} className="h-6 w-6" /> : <Sparkles className="h-5 w-5 text-volt" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-mist">Evolve into {rule.to_species.name}</p>
                    <p className="truncate text-[11px] text-mist/50">
                      {rule.method === "held_item" ? `Hold ${rule.item?.name}` : `Requires ${rule.item?.name}`}
                      {!eligible ? " — not available" : ""}
                    </p>
                  </div>
                </button>
              );
            })}
            {evolveWithItem.isError ? <p className="text-xs text-rotom-red-light">{(evolveWithItem.error as Error).message}</p> : null}
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-xs text-mist/50">
          <span>Caught</span>
          <span className="font-mono">{new Date(pokemon.caught_at).toLocaleDateString()}</span>
        </div>
      </div>

      <HeldItemSheet
        open={sheetOpen}
        items={items}
        currentItemId={pokemon.held_item_id}
        onClose={() => setSheetOpen(false)}
        onSelect={(itemId) => {
          setHeldItem.mutate(
            { pokemonId: pokemon.id, itemId },
            {
              onSuccess: () => {
                setSheetOpen(false);
                toast(itemId ? "Held item updated" : "Held item removed", "success");
              },
            }
          );
        }}
      />

      <AnimatePresence>
        {evoAnim ? (
          <EvolutionAnimation
            fromSpeciesId={evoAnim.fromId}
            toSpeciesId={evoAnim.toId}
            fromName={evoAnim.fromName}
            toName={evoAnim.toName}
            onDone={() => setEvoAnim(null)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
