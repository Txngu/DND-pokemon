import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ImageOff, Link2, Loader2, Star, Trash2, Unlink, X } from "lucide-react";
import { ConfirmDialog } from "@/components/phone/ConfirmDialog";
import { PokemonSprite } from "@/components/phone/PokemonSprite";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { cardImageUrl, cardNumber, type TcgAttack, type TcgCard } from "@/lib/tcgdex";
import { useTrainerPokemon } from "@/hooks/useBag";
import {
  useFavoriteTcgCard,
  useLinkTcgCard,
  useRemoveTcgCard,
  useTcgCard,
  useTcgCollection,
  useTcgLinks,
  useUnlinkTcgCard,
} from "@/hooks/useTcg";
import type { TcgCollectionEntry } from "@/types/database.types";

/** A card picture from TCGdex, with a clear placeholder when the card has no image. */
export function TcgCardImage({
  image,
  name,
  quality = "low",
  className,
}: {
  image: string | null | undefined;
  name: string;
  quality?: "low" | "high";
  className?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  const url = cardImageUrl(image, quality);
  if (!url || failed) {
    return (
      <div className={cn("flex aspect-[63/88] flex-col items-center justify-center gap-1 rounded-lg bg-white/5 p-2 text-center text-mist/40", className)}>
        <ImageOff className="h-6 w-6" strokeWidth={1.5} />
        <span className="line-clamp-2 text-[10px]">{name}</span>
        <span className="text-[9px]">No image available</span>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("aspect-[63/88] w-full select-none rounded-lg object-contain", className)}
      draggable={false}
    />
  );
}

/** Rebuilds a card view from what was saved in the collection, for when TCGdex can't be reached. */
export function cardFromEntry(entry: TcgCollectionEntry): TcgCard {
  const d = (entry.card_data ?? {}) as Partial<TcgCard>;
  return {
    ...d,
    id: entry.card_id,
    localId: entry.local_id ?? "",
    name: entry.name,
    image: entry.image_url ?? undefined,
    rarity: entry.rarity ?? undefined,
    hp: entry.hp ?? undefined,
    types: entry.types,
    dexId: entry.dex_ids,
    set: { id: entry.set_id ?? "", name: entry.set_name ?? "", cardCount: { official: entry.set_total ?? undefined } },
  };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-white/5 py-1.5 text-xs last:border-0">
      <span className="w-24 shrink-0 text-mist/50">{label}</span>
      <span className="min-w-0 flex-1 text-mist">{children}</span>
    </div>
  );
}

function costLabel(cost?: string[]) {
  if (!cost || cost.length === 0) return null;
  return cost.join(" · ");
}

/** The card's real data from TCGdex. Only fields the card actually has are shown. */
export function TcgCardFacts({ card }: { card: TcgCard }) {
  const isPokemon = !card.category || card.category === "Pokemon";
  return (
    <div className="space-y-3">
      <div className="glass rounded-2xl px-3 py-1">
        <Row label="Card">{card.name}</Row>
        {card.dexId?.length ? <Row label="Pokédex">#{card.dexId.map((d) => String(d).padStart(3, "0")).join(", #")}</Row> : null}
        {isPokemon && card.hp ? <Row label="HP">{card.hp}</Row> : null}
        {card.types?.length ? <Row label="Type">{card.types.join(", ")}</Row> : null}
        {card.stage ? <Row label="Stage">{card.stage}{card.evolveFrom ? ` (evolves from ${card.evolveFrom})` : ""}</Row> : null}
        {card.trainerType ? <Row label="Trainer type">{card.trainerType}</Row> : null}
        {card.energyType ? <Row label="Energy type">{card.energyType}</Row> : null}
        <Row label="Set">{card.set?.name || "—"}</Row>
        <Row label="Number">{cardNumber(card.localId, card.set?.cardCount?.official) || "—"}</Row>
        <Row label="Rarity">{card.rarity || "—"}</Row>
        {card.weaknesses?.length ? <Row label="Weakness">{card.weaknesses.map((w) => `${w.type} ${w.value ?? ""}`.trim()).join(", ")}</Row> : null}
        {card.resistances?.length ? <Row label="Resistance">{card.resistances.map((w) => `${w.type} ${w.value ?? ""}`.trim()).join(", ")}</Row> : null}
        {typeof card.retreat === "number" ? <Row label="Retreat cost">{card.retreat}</Row> : null}
        {card.illustrator ? <Row label="Illustrator">{card.illustrator}</Row> : null}
      </div>

      {card.abilities?.length ? (
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-wide text-mist/50">Abilities</p>
          <div className="space-y-1.5">
            {card.abilities.map((a, i) => (
              <div key={i} className="glass rounded-xl p-2.5">
                <p className="text-xs font-semibold text-mist">
                  {a.type ? <span className="mr-1 rounded bg-rotom-red/80 px-1 text-[9px] uppercase text-white">{a.type}</span> : null}
                  {a.name}
                </p>
                {a.effect ? <p className="mt-0.5 text-[11px] leading-snug text-mist/70">{a.effect}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {card.attacks?.length ? (
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-wide text-mist/50">Attacks</p>
          <div className="space-y-1.5">
            {card.attacks.map((a: TcgAttack, i: number) => (
              <div key={i} className="glass rounded-xl p-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-semibold text-mist">{a.name}</p>
                  {a.damage !== undefined && a.damage !== null && a.damage !== "" ? (
                    <span className="font-mono text-sm font-bold text-volt">{a.damage}</span>
                  ) : null}
                </div>
                {costLabel(a.cost) ? <p className="text-[10px] text-mist/45">Cost: {costLabel(a.cost)}</p> : null}
                {a.effect ? <p className="mt-0.5 text-[11px] leading-snug text-mist/70">{a.effect}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {card.effect ? (
        <div className="glass rounded-xl p-2.5">
          <p className="text-[11px] uppercase tracking-wide text-mist/50">Effect</p>
          <p className="mt-0.5 text-[11px] leading-snug text-mist/80">{card.effect}</p>
        </div>
      ) : null}

      {card.description ? <p className="px-1 text-[11px] italic text-mist/45">{card.description}</p> : null}
    </div>
  );
}

/** Full-screen overlay shell used for card details inside the phone. */
export function TcgOverlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      className="absolute inset-0 z-50 flex flex-col bg-screen-ink/95 backdrop-blur-sm"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.18 }}
    >
      <div className="flex items-center gap-2 px-4 pb-2 pt-10">
        <p className="min-w-0 flex-1 truncate font-display text-base font-semibold text-mist">{title}</p>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 touch-manipulation items-center justify-center rounded-full bg-white/10 text-mist"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">{children}</div>
    </motion.div>
  );
}

/**
 * Details of a card in the player's collection: live data from TCGdex (the
 * saved snapshot if TCGdex is unreachable), favourite, remove, and links to
 * the player's RPG Pokémon. `readOnly` for the Game Master's view.
 */
export function CollectionCardDetail({
  entry,
  onClose,
  readOnly = false,
}: {
  entry: TcgCollectionEntry;
  onClose: () => void;
  readOnly?: boolean;
}) {
  const live = useTcgCard(entry.lang, entry.card_id);
  const card = live.data ?? cardFromEntry(entry);
  const favorite = useFavoriteTcgCard();
  const remove = useRemoveTcgCard();
  const [confirmAll, setConfirmAll] = React.useState(false);

  return (
    <TcgOverlay title={entry.name} onClose={onClose}>
      <div className="mx-auto w-full max-w-[280px]">
        <TcgCardImage image={card.image ?? entry.image_url} name={entry.name} quality="high" className="shadow-glass" />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[11px] text-mist/60">
        <span className="rounded-full bg-white/10 px-2.5 py-1">
          ×{entry.quantity} {entry.quantity === 1 ? "copy" : "copies"}
        </span>
        <span className="rounded-full bg-white/10 px-2.5 py-1 uppercase">{entry.lang}</span>
        {live.isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {live.isError ? <span className="text-amber-300">Offline — showing saved details</span> : null}
      </div>

      {!readOnly ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={favorite.isPending}
            onClick={() => favorite.mutate({ id: entry.id, favorite: !entry.is_favorite })}
            className="flex touch-manipulation flex-col items-center gap-1 rounded-xl bg-white/5 py-2 text-[11px] text-mist active:bg-white/10"
          >
            <Star className={cn("h-4 w-4", entry.is_favorite ? "fill-volt text-volt" : "text-mist/60")} />
            {entry.is_favorite ? "Favorite" : "Mark favorite"}
          </button>
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(
                { id: entry.id, all: false },
                {
                  onSuccess: (left) => {
                    toast(left > 0 ? `Removed one copy (${left} left)` : "Card removed from your collection", "success");
                    if (left === 0) onClose();
                  },
                }
              )
            }
            className="flex touch-manipulation flex-col items-center gap-1 rounded-xl bg-white/5 py-2 text-[11px] text-mist active:bg-white/10"
          >
            <Trash2 className="h-4 w-4 text-mist/60" />
            {entry.quantity > 1 ? "Remove one" : "Remove"}
          </button>
          <button
            type="button"
            disabled={remove.isPending || entry.quantity < 2}
            onClick={() => setConfirmAll(true)}
            className="flex touch-manipulation flex-col items-center gap-1 rounded-xl bg-white/5 py-2 text-[11px] text-mist active:bg-white/10 disabled:opacity-35"
          >
            <Trash2 className="h-4 w-4 text-rotom-red-light" />
            Remove all
          </button>
        </div>
      ) : null}

      <div className="mt-4">
        <LinkedPokemonPanel entry={entry} readOnly={readOnly} />
      </div>

      <div className="mt-4">
        <TcgCardFacts card={card} />
      </div>

      <ConfirmDialog
        open={confirmAll}
        title={`Remove all ${entry.quantity} copies?`}
        message="The card leaves your virtual collection. Your RPG Pokémon are not affected."
        confirmLabel="Remove all"
        destructive
        onCancel={() => setConfirmAll(false)}
        onConfirm={() => {
          setConfirmAll(false);
          remove.mutate(
            { id: entry.id, all: true },
            {
              onSuccess: () => {
                toast("Card removed from your collection", "success");
                onClose();
              },
            }
          );
        }}
      />
    </TcgOverlay>
  );
}

/** "Link Card to Pokémon": only the player's Pokémon of the species on the card qualify. */
function LinkedPokemonPanel({ entry, readOnly }: { entry: TcgCollectionEntry; readOnly: boolean }) {
  const { data: pokemon = [] } = useTrainerPokemon();
  const { data: links = [] } = useTcgLinks(readOnly ? entry.profile_id : undefined);
  const link = useLinkTcgCard();
  const unlink = useUnlinkTcgCard();

  const myLinks = links.filter((l) => l.collection_id === entry.id);
  const linkedIds = new Set(myLinks.map((l) => l.pokemon_id));
  const matching = readOnly ? [] : pokemon.filter((p) => entry.dex_ids.includes(p.species_id) && !p.is_dead);
  const full = myLinks.length >= entry.quantity;

  if (entry.dex_ids.length === 0) {
    return <p className="rounded-xl bg-white/5 px-3 py-2 text-[11px] text-mist/50">This isn&apos;t a Pokémon card, so it can&apos;t be linked to a Pokémon.</p>;
  }

  return (
    <div className="glass rounded-2xl p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-mist/50">
        <Link2 className="h-3.5 w-3.5" /> Linked Pokémon ({myLinks.length}/{entry.quantity})
      </p>
      {readOnly ? (
        <p className="text-[11px] text-mist/50">{myLinks.length ? `Linked to ${myLinks.length} Pokémon.` : "Not linked to any Pokémon."}</p>
      ) : matching.length === 0 ? (
        <p className="text-[11px] text-mist/50">You don&apos;t have the Pokémon shown on this card yet.</p>
      ) : (
        <div className="space-y-1.5">
          {matching.map((p) => {
            const isLinked = linkedIds.has(p.id);
            const linkRow = myLinks.find((l) => l.pokemon_id === p.id);
            return (
              <div key={p.id} className="flex items-center gap-2 rounded-xl bg-white/5 px-2 py-1.5">
                <PokemonSprite speciesId={p.species_id} view="icon" shiny={p.is_shiny} alt={p.species.name} className="h-8 w-8" />
                <p className="min-w-0 flex-1 truncate text-xs text-mist">
                  {p.nickname || p.species.name} <span className="font-mono text-[10px] text-mist/50">Lv{p.level}</span>
                </p>
                {isLinked ? (
                  <button
                    type="button"
                    disabled={unlink.isPending}
                    onClick={() => linkRow && unlink.mutate(linkRow.id, { onSuccess: () => toast("Card unlinked", "success") })}
                    className="flex touch-manipulation items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-mist active:scale-95"
                  >
                    <Unlink className="h-3 w-3" /> Unlink
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={link.isPending || full}
                    onClick={() => link.mutate({ collectionId: entry.id, pokemonId: p.id }, { onSuccess: () => toast("Card linked", "success") })}
                    className="flex touch-manipulation items-center gap-1 rounded-full bg-volt px-2.5 py-1 text-[11px] font-semibold text-screen-ink active:scale-95 disabled:opacity-40"
                    title={full ? "Every copy is already linked" : undefined}
                  >
                    <Link2 className="h-3 w-3" /> Link
                  </button>
                )}
              </div>
            );
          })}
          {full && matching.some((p) => !linkedIds.has(p.id)) ? (
            <p className="text-[10px] text-mist/45">Each copy can be linked to one Pokémon. Add another copy to link more.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Small thumbnails of the cards linked to one RPG Pokémon (Team, detail view). */
export function LinkedCardsStrip({
  pokemonId,
  size = "sm",
  onOpen,
}: {
  pokemonId: string;
  size?: "sm" | "md";
  /** Open the card somewhere else (e.g. a page-level overlay). Without it, the strip opens its own. */
  onOpen?: (entry: TcgCollectionEntry) => void;
}) {
  const { data: links = [] } = useTcgLinks();
  const { data: cards = [] } = useTcgCollection();
  const [open, setOpen] = React.useState<TcgCollectionEntry | null>(null);
  const mine = links.filter((l) => l.pokemon_id === pokemonId);
  const entries = mine.map((l) => cards.find((c) => c.id === l.collection_id)).filter(Boolean) as TcgCollectionEntry[];
  if (entries.length === 0) return null;
  return (
    <>
      <div className="flex gap-1.5 overflow-x-auto">
        {entries.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              if (onOpen) onOpen(e);
              else setOpen(e);
            }}
            className={cn("shrink-0 touch-manipulation", size === "sm" ? "w-9" : "w-14")}
            title={e.name}
          >
            <TcgCardImage image={e.image_url} name={e.name} />
          </button>
        ))}
      </div>
      <AnimatePresence>{open ? <CollectionCardDetail entry={open} onClose={() => setOpen(null)} /> : null}</AnimatePresence>
    </>
  );
}
