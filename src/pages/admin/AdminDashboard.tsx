import { Users, PawPrint, Package, Coins, ArrowLeftRight, UserCheck } from "lucide-react";
import { StatCard } from "@/components/admin/StatCard";
import { useAdminStats, useRecentActivity } from "@/hooks/useAdmin";
import { ACTIVITY_LABELS } from "@/lib/adminActivity";
import { useGameConfig } from "@/hooks/useBattle";
import { useSetGameConfigFlag } from "@/hooks/usePokemonHp";
import { toast } from "@/lib/toast";

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function GameSettings() {
  const { data: config } = useGameConfig();
  const setFlag = useSetGameConfigFlag();
  const on = !!config?.playerCreatePokemon;
  return (
    <div className="rounded-xl border border-white/10 bg-[#111623] p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-100">Game settings</h2>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-volt"
          checked={on}
          disabled={!config || setFlag.isPending}
          onChange={(e) =>
            setFlag.mutate(
              { key: "player_create_pokemon", value: e.target.checked },
              { onSuccess: () => toast(e.target.checked ? "Trainers can now create Pokémon" : "Pokémon creation is GM-only again", "success") }
            )
          }
        />
        <span>
          <span className="block text-sm text-slate-200">Trainers can create their own Pokémon</span>
          <span className="block text-xs text-slate-400">
            Shows a “New Pokémon” button in each trainer&apos;s Team app. You can always create Pokémon for any trainer under Users → Manage.
          </span>
        </span>
      </label>
    </div>
  );
}

export default function AdminDashboard() {
  const { data: stats, isLoading } = useAdminStats();
  const { data: activity, isLoading: activityLoading } = useRecentActivity(15);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-50">Dashboard</h1>
        <p className="text-sm text-slate-400">Overview of the whole PokéGear league.</p>
      </div>

      {isLoading || !stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-white/10 bg-[#111623]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard icon={Users} label="Total users" value={stats.totalUsers} />
          <StatCard icon={UserCheck} label="New (7d)" value={stats.activeUsers} hint="Accounts created recently" />
          <StatCard icon={PawPrint} label="Total Pokémon" value={stats.totalPokemon} />
          <StatCard icon={Package} label="Item units" value={stats.totalItemUnits.toLocaleString()} />
          <StatCard icon={Coins} label="Money in circulation" value={`₽${stats.totalMoney.toLocaleString()}`} />
          <StatCard icon={ArrowLeftRight} label="Pending trades" value={stats.pendingTrades} />
        </div>
      )}

      <GameSettings />

      <div className="rounded-xl border border-white/10 bg-[#111623]">
        <div className="border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-100">Recent activity</h2>
        </div>
        <div className="divide-y divide-white/5">
          {activityLoading ? (
            <div className="p-4 text-sm text-slate-500">Loading…</div>
          ) : !activity || activity.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">No admin activity yet.</div>
          ) : (
            activity.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-slate-200">{ACTIVITY_LABELS[entry.action] ?? entry.action}</span>
                <span className="font-mono text-[11px] text-slate-500">{timeAgo(entry.created_at)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
