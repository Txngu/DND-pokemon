import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { TradeListEntry } from "@/types/database.types";

const STATUS_STYLES: Record<TradeListEntry["status"], { label: string; classes: string }> = {
  pending: { label: "Pending", classes: "bg-amber-400/15 text-amber-300" },
  accepted: { label: "Active", classes: "bg-circuit-teal/15 text-circuit-teal" },
  declined: { label: "Declined", classes: "bg-rotom-red/15 text-rotom-red-light" },
  cancelled: { label: "Cancelled", classes: "bg-mist/10 text-mist/50" },
  completed: { label: "Completed", classes: "bg-emerald-400/15 text-emerald-300" },
};

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function TradeListItem({ entry, onClick }: { entry: TradeListEntry; onClick: () => void }) {
  const style = STATUS_STYLES[entry.status];
  const needsResponse = entry.status === "pending" && !entry.isInitiator;

  return (
    <button
      type="button"
      onClick={onClick}
      className="glass theme-accent-line flex w-full touch-manipulation items-center gap-3 rounded-2xl p-3 text-left shadow-glass active:bg-white/10"
    >
      <Avatar className="h-10 w-10">
        {entry.otherTrainer.avatar ? <AvatarImage src={entry.otherTrainer.avatar} alt={entry.otherTrainer.username} /> : null}
        <AvatarFallback>{entry.otherTrainer.username.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-mist">{entry.otherTrainer.username}</p>
        <p className="text-[10px] text-mist/40">
          {needsResponse ? "Wants to trade with you" : entry.isInitiator ? "You sent a request" : "Trade"} · {timeAgo(entry.updated_at)}
        </p>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${style.classes}`}>{style.label}</span>
    </button>
  );
}
