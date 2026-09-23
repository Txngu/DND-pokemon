import { useActivityLog } from "@/hooks/useAdmin";
import { useAllProfiles } from "@/hooks/useAdmin";
import { ACTIVITY_LABELS } from "@/lib/adminActivity";

export default function AdminActivityLog() {
  const { data: entries, isLoading } = useActivityLog();
  const { data: profiles } = useAllProfiles();

  function nameFor(id: string | null) {
    if (!id) return "—";
    return profiles?.find((p) => p.id === id)?.username ?? "Unknown";
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-50">Activity Log</h1>
        <p className="text-sm text-slate-400">Every admin action, written automatically by the database — not something the app has to remember to log.</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#111623]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Action</th>
              <th className="px-4 py-2.5">Admin</th>
              <th className="px-4 py-2.5">Target</th>
              <th className="px-4 py-2.5">Details</th>
              <th className="px-4 py-2.5">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : !entries || entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No activity recorded yet.
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="hover:bg-white/5">
                  <td className="px-4 py-2.5 text-slate-100">{ACTIVITY_LABELS[e.action] ?? e.action}</td>
                  <td className="px-4 py-2.5 text-slate-300">{nameFor(e.admin_id)}</td>
                  <td className="px-4 py-2.5 text-slate-300">{nameFor(e.target_profile_id)}</td>
                  <td className="max-w-xs truncate px-4 py-2.5 font-mono text-[11px] text-slate-500">
                    {Object.keys(e.details ?? {}).length > 0 ? JSON.stringify(e.details) : "—"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">{new Date(e.created_at).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
