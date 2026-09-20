import * as React from "react";
import { ArrowLeftRight, ArrowDown, Backpack, PawPrint } from "lucide-react";
import { AppScreenHeader } from "@/components/phone/AppScreenHeader";
import { TradeOfferSideView } from "@/components/phone/TradeOfferSideView";
import { PokemonPickerSheet } from "@/components/phone/PokemonPickerSheet";
import { ItemPickerSheet } from "@/components/phone/ItemPickerSheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfile } from "@/hooks/useProfile";
import { useTrainerPokemon, useTrainerItems } from "@/hooks/useBag";
import {
  useTradeDetail,
  useRespondTradeRequest,
  useCancelTrade,
  useSetTradeOffer,
  useConfirmTrade,
} from "@/hooks/useTrade";

export function TradeDetailView({ tradeId, onBack }: { tradeId: string; onBack: () => void }) {
  const { data: profile } = useProfile();
  const { data: detail, isLoading } = useTradeDetail(tradeId);
  const { data: myPokemon = [] } = useTrainerPokemon();
  const { data: myItems = [] } = useTrainerItems();

  const respond = useRespondTradeRequest();
  const cancel = useCancelTrade();
  const setOffer = useSetTradeOffer();
  const confirm = useConfirmTrade();

  const [pokemonPickerOpen, setPokemonPickerOpen] = React.useState(false);
  const [itemPickerOpen, setItemPickerOpen] = React.useState(false);
  const [draftPokemon, setDraftPokemon] = React.useState<string[]>([]);
  const [draftItems, setDraftItems] = React.useState<{ item_id: string; quantity: number }[]>([]);
  const [draftMoney, setDraftMoney] = React.useState(0);
  const syncedForTrade = React.useRef<string | null>(null);

  const isInitiator = detail && profile ? detail.initiator_id === profile.id : false;
  const mySide = detail ? (isInitiator ? detail.initiator : detail.recipient) : null;
  const theirSide = detail ? (isInitiator ? detail.recipient : detail.initiator) : null;

  React.useEffect(() => {
    if (detail && syncedForTrade.current !== detail.id) {
      setDraftPokemon(mySide!.pokemon.map((p) => p.id));
      setDraftItems(mySide!.items.map((i) => ({ item_id: i.item_id, quantity: i.quantity })));
      setDraftMoney(mySide!.money);
      syncedForTrade.current = detail.id;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.id]);

  if (isLoading || !detail || !mySide || !theirSide) {
    return (
      <div className="flex h-full flex-col">
        <AppScreenHeader title="Trade" icon={<ArrowLeftRight className="h-5 w-5" strokeWidth={1.75} />} onBack={onBack} />
        <div className="space-y-3 p-5">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  const maxMoney = profile?.money ?? 0;
  const hasUnsavedChanges =
    JSON.stringify([...draftPokemon].sort()) !== JSON.stringify([...mySide.pokemon.map((p) => p.id)].sort()) ||
    JSON.stringify(draftItems) !== JSON.stringify(mySide.items.map((i) => ({ item_id: i.item_id, quantity: i.quantity }))) ||
    draftMoney !== mySide.money;

  return (
    <div className="flex h-full flex-col">
      <AppScreenHeader
        title={theirSide.profile.username}
        subtitle={`Trade · ${detail.status}`}
        icon={<ArrowLeftRight className="h-5 w-5" strokeWidth={1.75} />}
        onBack={onBack}
      />

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {detail.status === "pending" && !isInitiator ? (
          <div className="glass rounded-2xl p-4 text-center">
            <p className="mb-3 text-sm text-mist">{theirSide.profile.username} wants to trade with you.</p>
            {respond.isError ? <p className="mb-2 text-xs text-rotom-red-light">{(respond.error as Error).message}</p> : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => respond.mutate({ tradeId, accept: false })}
                disabled={respond.isPending}
                className="flex-1 touch-manipulation rounded-2xl bg-white/5 py-2.5 text-sm font-medium text-mist active:scale-[0.98] disabled:opacity-50"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => respond.mutate({ tradeId, accept: true })}
                disabled={respond.isPending}
                className="flex-1 touch-manipulation rounded-2xl bg-volt py-2.5 text-sm font-semibold text-screen-ink active:scale-[0.98] disabled:opacity-50"
              >
                Accept
              </button>
            </div>
          </div>
        ) : null}

        {detail.status === "pending" && isInitiator ? (
          <div className="glass rounded-2xl p-4 text-center">
            <p className="mb-3 text-sm text-mist/70">Waiting for {theirSide.profile.username} to respond…</p>
            <button
              type="button"
              onClick={() => cancel.mutate(tradeId)}
              disabled={cancel.isPending}
              className="w-full touch-manipulation rounded-2xl bg-white/5 py-2.5 text-sm font-medium text-mist active:scale-[0.98] disabled:opacity-50"
            >
              Cancel request
            </button>
          </div>
        ) : null}

        {detail.status === "accepted" ? (
          <>
            <div className="space-y-2">
              <p className="px-1 text-[11px] uppercase tracking-wide text-mist/50">Your offer</p>
              <TradeOfferSideView
                side={{
                  ...mySide,
                  pokemon: myPokemon.filter((p) => draftPokemon.includes(p.id)),
                  items: myItems
                    .filter((i) => draftItems.some((d) => d.item_id === i.item_id))
                    .map((i) => ({ ...i, quantity: draftItems.find((d) => d.item_id === i.item_id)!.quantity })),
                  money: draftMoney,
                }}
                isYou
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPokemonPickerOpen(true)}
                  className="flex flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-xl bg-white/5 py-2 text-xs font-medium text-mist active:bg-white/10"
                >
                  <PawPrint className="h-3.5 w-3.5" />
                  Pokémon ({draftPokemon.length})
                </button>
                <button
                  type="button"
                  onClick={() => setItemPickerOpen(true)}
                  className="flex flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-xl bg-white/5 py-2 text-xs font-medium text-mist active:bg-white/10"
                >
                  <Backpack className="h-3.5 w-3.5" />
                  Items ({draftItems.length})
                </button>
              </div>

              <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                <span className="text-xs text-mist/60">Money</span>
                <input
                  type="number"
                  min={0}
                  max={maxMoney}
                  value={draftMoney}
                  onChange={(e) => setDraftMoney(Math.max(0, Math.min(maxMoney, Number(e.target.value) || 0)))}
                  className="ml-auto w-24 rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-right font-mono text-xs text-mist focus:outline-none focus:ring-1 focus:ring-volt"
                />
              </div>

              {setOffer.isError ? <p className="text-xs text-rotom-red-light">{(setOffer.error as Error).message}</p> : null}

              <button
                type="button"
                disabled={!hasUnsavedChanges || setOffer.isPending}
                onClick={() => setOffer.mutate({ tradeId, pokemonIds: draftPokemon, items: draftItems, money: draftMoney })}
                className="w-full touch-manipulation rounded-xl bg-white/10 py-2 text-xs font-semibold text-mist active:scale-[0.98] disabled:opacity-40"
              >
                {hasUnsavedChanges ? "Save offer" : "Offer saved"}
              </button>
            </div>

            <div className="flex justify-center py-1 text-mist/30">
              <ArrowDown className="h-4 w-4" />
            </div>

            <div className="space-y-2">
              <p className="px-1 text-[11px] uppercase tracking-wide text-mist/50">Their offer</p>
              <TradeOfferSideView side={theirSide} isYou={false} />
            </div>

            {confirm.isError ? <p className="text-xs text-rotom-red-light">{(confirm.error as Error).message}</p> : null}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => cancel.mutate(tradeId)}
                disabled={cancel.isPending}
                className="flex-1 touch-manipulation rounded-2xl bg-white/5 py-2.5 text-sm font-medium text-mist active:scale-[0.98] disabled:opacity-50"
              >
                Cancel trade
              </button>
              <button
                type="button"
                onClick={() => confirm.mutate(tradeId)}
                disabled={confirm.isPending || hasUnsavedChanges || mySide.confirmed}
                className="flex-1 touch-manipulation rounded-2xl bg-volt py-2.5 text-sm font-semibold text-screen-ink active:scale-[0.98] disabled:opacity-40"
              >
                {mySide.confirmed ? "Waiting…" : "Confirm trade"}
              </button>
            </div>
            {hasUnsavedChanges ? <p className="text-center text-[10px] text-mist/40">Save your offer before confirming.</p> : null}
          </>
        ) : null}

        {detail.status === "declined" || detail.status === "cancelled" || detail.status === "completed" ? (
          <div className="space-y-2">
            <div
              className={
                "rounded-2xl p-3 text-center text-sm " +
                (detail.status === "completed" ? "bg-emerald-400/10 text-emerald-300" : "bg-white/5 text-mist/60")
              }
            >
              {detail.status === "completed"
                ? "This trade completed successfully."
                : detail.status === "declined"
                  ? "This trade request was declined."
                  : "This trade was cancelled."}
            </div>
            <p className="px-1 text-[11px] uppercase tracking-wide text-mist/50">
              {detail.status === "completed" ? "What was traded" : "Your offer"}
            </p>
            <TradeOfferSideView side={mySide} isYou />
            <TradeOfferSideView side={theirSide} isYou={false} />
          </div>
        ) : null}
      </div>

      <PokemonPickerSheet
        open={pokemonPickerOpen}
        pokemon={myPokemon}
        initialSelected={draftPokemon}
        onClose={() => setPokemonPickerOpen(false)}
        onConfirm={(ids) => {
          setDraftPokemon(ids);
          setPokemonPickerOpen(false);
        }}
      />
      <ItemPickerSheet
        open={itemPickerOpen}
        items={myItems}
        initialSelected={draftItems}
        onClose={() => setItemPickerOpen(false)}
        onConfirm={(sel) => {
          setDraftItems(sel);
          setItemPickerOpen(false);
        }}
      />
    </div>
  );
}
