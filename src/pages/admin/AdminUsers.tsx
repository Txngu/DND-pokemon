import * as React from "react";
import { UserPlus, Search } from "lucide-react";
import { AdminModal } from "@/components/admin/AdminModal";
import { ManageUserModal } from "@/components/admin/ManageUserModal";
import { adminInput, adminLabel, adminButtonPrimary } from "@/components/admin/adminStyles";
import { useAllProfiles, useAdminCreateUser } from "@/hooks/useAdmin";
import { useCities } from "@/hooks/useProfile";
import { usePhoneContext } from "@/hooks/usePhoneContext";
import { toast } from "@/lib/toast";

export default function AdminUsers() {
  const { profile: me } = usePhoneContext();
  const { data: profiles, isLoading } = useAllProfiles();
  const { data: cities } = useCities();
  const createUser = useAdminCreateUser();

  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newEmail, setNewEmail] = React.useState("");
  const [newUsername, setNewUsername] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");

  // Always looked up live from the current query result (never a stale
  // snapshot), so repeated actions inside one modal session — e.g. giving
  // money twice in a row — each compute from the actual current balance,
  // not the balance from when the modal first opened.
  const selectedProfile = profiles?.find((p) => p.id === selectedId) ?? null;

  const filtered = (profiles ?? []).filter(
    (p) =>
      p.username.toLowerCase().includes(query.toLowerCase()) ||
      p.trainer_id.includes(query) ||
      p.email.toLowerCase().includes(query.toLowerCase())
  );

  function cityName(cityId: string | null) {
    return cities?.find((c) => c.id === cityId)?.name ?? "—";
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createUser.mutate(
      { email: newEmail.trim(), password: newPassword, username: newUsername.trim() || undefined },
      {
        onSuccess: () => {
          toast("Trainer account created", "success");
          setCreateOpen(false);
          setNewEmail("");
          setNewUsername("");
          setNewPassword("");
        },
      }
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-50">Users</h1>
          <p className="text-sm text-slate-400">{profiles?.length ?? 0} trainer accounts</p>
        </div>
        <button type="button" className={`${adminButtonPrimary} flex items-center gap-1.5`} onClick={() => setCreateOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Create user
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          className={`${adminInput} pl-9`}
          placeholder="Search username, Trainer ID, or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#111623]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Username</th>
              <th className="px-4 py-2.5">Trainer ID</th>
              <th className="px-4 py-2.5">City</th>
              <th className="px-4 py-2.5">Money</th>
              <th className="px-4 py-2.5">Role</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  No trainers match your search.
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="hover:bg-white/5">
                  <td className="px-4 py-2.5 font-medium text-slate-100">{p.username}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-400">#{p.trainer_id}</td>
                  <td className="px-4 py-2.5 text-slate-300">{cityName(p.city_id)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-volt">₽{p.money.toLocaleString()}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-[10px] font-medium " +
                        (p.role === "admin" ? "bg-volt/15 text-volt" : "bg-white/5 text-slate-400")
                      }
                    >
                      {p.role}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      className="rounded-lg border border-white/10 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-white/10"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedProfile ? (
        <ManageUserModal profile={selectedProfile} adminId={me.id} onClose={() => setSelectedId(null)} />
      ) : null}

      <AdminModal open={createOpen} title="Create trainer account" onClose={() => setCreateOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className={adminLabel}>Email</label>
            <input className={adminInput} type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          </div>
          <div>
            <label className={adminLabel}>Username (optional)</label>
            <input className={adminInput} value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="Defaults to the email prefix" />
          </div>
          <div>
            <label className={adminLabel}>Password</label>
            <input
              className={adminInput}
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          {createUser.isError ? <p className="text-xs text-rotom-red-light">{(createUser.error as Error).message}</p> : null}
          <button type="submit" className={`${adminButtonPrimary} w-full`} disabled={createUser.isPending}>
            {createUser.isPending ? "Creating…" : "Create account"}
          </button>
        </form>
      </AdminModal>
    </div>
  );
}
