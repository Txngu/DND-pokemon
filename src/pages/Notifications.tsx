import * as React from "react";
import { Bell, ShoppingBag, ArrowLeftRight, Gift, Package, ShieldCheck, Info, CheckCheck, Trash2, X } from "lucide-react";
import { AppScreenHeader } from "@/components/phone/AppScreenHeader";
import { ConfirmDialog } from "@/components/phone/ConfirmDialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useClearReadNotifications,
  useDeleteNotification,
  notificationBucket,
} from "@/hooks/useNotifications";
import { useProfile, useUpdateProfile } from "@/hooks/useProfile";
import { toast } from "@/lib/toast";
import type { Notification, NotificationPrefs } from "@/types/database.types";

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function iconFor(kind: string) {
  if (kind === "purchase") return <ShoppingBag className="h-4 w-4" />;
  if (kind.startsWith("trade")) return <ArrowLeftRight className="h-4 w-4" />;
  if (kind === "pokemon_received") return <Gift className="h-4 w-4" />;
  if (kind === "item_received") return <Package className="h-4 w-4" />;
  if (kind === "admin_reward") return <ShieldCheck className="h-4 w-4" />;
  return <Info className="h-4 w-4" />;
}

const PREF_LABELS: { key: keyof NotificationPrefs; label: string }[] = [
  { key: "trades", label: "Trades" },
  { key: "purchases", label: "Purchases" },
  { key: "system", label: "Everything else" },
];

export default function Notifications() {
  const { data: profile } = useProfile();
  const { data: notifications, isLoading, isError } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const clearRead = useClearReadNotifications();
  const deleteOne = useDeleteNotification();
  const updateProfile = useUpdateProfile();

  const [clearConfirmOpen, setClearConfirmOpen] = React.useState(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  const prefs = profile?.notification_prefs;
  const visible = (notifications ?? []).filter((n) => !prefs || prefs[notificationBucket(n.kind)]);
  const unreadCount = visible.filter((n) => !n.read).length;
  const readCount = visible.filter((n) => n.read).length;

  function togglePref(key: keyof NotificationPrefs) {
    if (!prefs) return;
    updateProfile.mutate(
      { notification_prefs: { ...prefs, [key]: !prefs[key] } },
      { onSuccess: () => toast("Notification preferences updated", "success") }
    );
  }

  return (
    <div className="flex h-full flex-col">
      <AppScreenHeader title="Notifications" icon={<Bell className="h-5 w-5" strokeWidth={1.75} />} />

      <div className="flex items-center justify-between gap-2 px-5 pt-3">
        <button
          type="button"
          onClick={() => setFiltersOpen((f) => !f)}
          className="rounded-full bg-white/5 px-3 py-1.5 text-xs text-mist/70 active:bg-white/10"
        >
          {filtersOpen ? "Hide filters" : "Filters"}
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={unreadCount === 0 || markAllRead.isPending}
            onClick={() => markAllRead.mutate(undefined, { onSuccess: () => toast("All caught up", "success") })}
            className="flex touch-manipulation items-center gap-1 rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium text-mist active:bg-white/10 disabled:opacity-40"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </button>
          <button
            type="button"
            disabled={readCount === 0}
            onClick={() => setClearConfirmOpen(true)}
            className="flex touch-manipulation items-center gap-1 rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium text-mist active:bg-white/10 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear read
          </button>
        </div>
      </div>

      {filtersOpen && prefs ? (
        <div className="mx-5 mt-3 flex flex-wrap gap-2 rounded-2xl bg-white/5 p-3">
          {PREF_LABELS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-1.5 text-xs text-mist/70">
              <input
                type="checkbox"
                checked={prefs[key]}
                onChange={() => togglePref(key)}
                className="h-4 w-4 accent-volt"
              />
              {label}
            </label>
          ))}
        </div>
      ) : null}

      <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
        {isLoading ? (
          <>
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Info className="h-8 w-8 text-rotom-red-light" strokeWidth={1.5} />
            <p className="max-w-[220px] text-xs text-mist/50">Couldn't load notifications. Pull to refresh or try again shortly.</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Bell className="h-8 w-8 text-mist/20" strokeWidth={1.5} />
            <p className="max-w-[220px] text-xs text-mist/50">
              {notifications && notifications.length > 0
                ? "Nothing matches your current filters."
                : "You're all caught up. Purchases, trades, and updates will show up here."}
            </p>
          </div>
        ) : (
          visible.map((n: Notification) => (
            <div
              key={n.id}
              className={"glass flex items-start gap-3 rounded-2xl p-3 shadow-glass " + (n.read ? "opacity-60" : "")}
            >
              <button
                type="button"
                onClick={() => !n.read && markRead.mutate(n.id)}
                className="flex flex-1 touch-manipulation items-start gap-3 text-left"
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
              <button
                type="button"
                onClick={() => deleteOne.mutate(n.id)}
                className="mt-0.5 flex h-7 w-7 shrink-0 touch-manipulation items-center justify-center rounded-full text-mist/30 active:bg-white/10 active:text-mist/60"
                aria-label="Delete notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        open={clearConfirmOpen}
        title="Clear read notifications?"
        message="This removes every notification you've already read. Unread ones are kept."
        confirmLabel="Clear"
        destructive
        onCancel={() => setClearConfirmOpen(false)}
        onConfirm={() => {
          clearRead.mutate(undefined, { onSuccess: () => toast("Cleared", "success") });
          setClearConfirmOpen(false);
        }}
      />
    </div>
  );
}
