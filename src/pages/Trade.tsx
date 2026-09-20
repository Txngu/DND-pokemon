import * as React from "react";
import { ArrowLeftRight, UserPlus } from "lucide-react";
import { AppScreenHeader } from "@/components/phone/AppScreenHeader";
import { PlayerSearchSheet } from "@/components/phone/PlayerSearchSheet";
import { TradeListItem } from "@/components/phone/TradeListItem";
import { TradeDetailView } from "@/components/phone/TradeDetailView";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyTrades } from "@/hooks/useTrade";

export default function Trade() {
  const { data: trades, isLoading } = useMyTrades();
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [selectedTradeId, setSelectedTradeId] = React.useState<string | null>(null);

  if (selectedTradeId) {
    return <TradeDetailView tradeId={selectedTradeId} onBack={() => setSelectedTradeId(null)} />;
  }

  const incoming = trades?.filter((t) => t.status === "pending" && !t.isInitiator) ?? [];
  const active = trades?.filter((t) => t.status === "accepted" || (t.status === "pending" && t.isInitiator)) ?? [];
  const history = trades?.filter((t) => ["declined", "cancelled", "completed"].includes(t.status)) ?? [];

  return (
    <div className="flex h-full flex-col">
      <AppScreenHeader title="Trade" icon={<ArrowLeftRight className="h-5 w-5" strokeWidth={1.75} />} />

      <div className="px-5 pt-3">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex w-full touch-manipulation items-center justify-center gap-2 rounded-2xl bg-volt py-3 text-sm font-semibold text-screen-ink active:scale-[0.98]"
        >
          <UserPlus className="h-4 w-4" />
          Find a trainer to trade with
        </button>
      </div>

      <div className="relative flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {isLoading ? (
          <div className="space-y-2.5">
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </div>
        ) : (
          <>
            <TradeSection title="Needs your response" entries={incoming} onOpen={setSelectedTradeId} />
            <TradeSection title="Active" entries={active} onOpen={setSelectedTradeId} />
            <TradeSection title="History" entries={history} onOpen={setSelectedTradeId} muted />
            {trades && trades.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <ArrowLeftRight className="h-8 w-8 text-mist/20" strokeWidth={1.5} />
                <p className="max-w-[220px] text-xs text-mist/50">
                  No trades yet. Search for a trainer above to send your first trade request.
                </p>
              </div>
            ) : null}
          </>
        )}

        <PlayerSearchSheet
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          onRequested={(tradeId) => {
            setSearchOpen(false);
            setSelectedTradeId(tradeId);
          }}
        />
      </div>
    </div>
  );
}

function TradeSection({
  title,
  entries,
  onOpen,
  muted,
}: {
  title: string;
  entries: ReturnType<typeof useMyTrades>["data"];
  onOpen: (id: string) => void;
  muted?: boolean;
}) {
  if (!entries || entries.length === 0) return null;
  return (
    <div className={muted ? "opacity-70" : ""}>
      <p className="mb-2 px-1 text-[11px] uppercase tracking-wide text-mist/50">{title}</p>
      <div className="space-y-2">
        {entries.map((entry) => (
          <TradeListItem key={entry.id} entry={entry} onClick={() => onOpen(entry.id)} />
        ))}
      </div>
    </div>
  );
}
