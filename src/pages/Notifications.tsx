import { Bell, ShoppingBag, Info } from "lucide-react";
import { AppScreenHeader } from "@/components/phone/AppScreenHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotifications, useMarkNotificationRead } from "@/hooks/useNotifications";
import type { Notification } from "@/types/database.types";

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function iconFor(kind: string) {
  if (kind === "purchase") return <ShoppingBag className="h-4 w-4" />;
  return <Info className="h-4 w-4" />;
}

export default function Notifications() {
  const { data: notifications, isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();

  return (
    <div className="flex h-full flex-col">
      <AppScreenHeader title="Notifications" icon={<Bell className="h-5 w-5" strokeWidth={1.75} />} />

      <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
        {isLoading ? (
          <>
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </>
        ) : !notifications || notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Bell className="h-8 w-8 text-mist/20" strokeWidth={1.5} />
            <p className="max-w-[220px] text-xs text-mist/50">
              You're all caught up. Purchases and updates will show up here.
            </p>
          </div>
        ) : (
          notifications.map((n: Notification) => (
            <button
              key={n.id}
              type="button"
              onClick={() => !n.read && markRead.mutate(n.id)}
              className={
                "glass flex w-full touch-manipulation items-start gap-3 rounded-2xl p-3 text-left shadow-glass " +
                (n.read ? "opacity-60" : "")
              }
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-volt/15 text-volt">
                {iconFor(n.kind)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium text-mist">{n.title}</p>
                  {!n.read ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-volt" /> : null}
                </div>
                <p className="mt-0.5 text-xs text-mist/60">{n.body}</p>
                <p className="mt-1 font-mono text-[10px] text-mist/40">{timeAgo(n.created_at)}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
