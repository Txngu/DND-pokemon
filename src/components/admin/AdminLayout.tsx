import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Users, Gift, Package, ScrollText, Smartphone } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/rewards", label: "Rewards", icon: Gift },
  { to: "/admin/items", label: "Items", icon: Package },
  { to: "/admin/activity", label: "Activity Log", icon: ScrollText },
];

/**
 * The Admin Dashboard is deliberately NOT phone-styled — it's a
 * conventional dashboard layout (sidebar + content), per the spec: the
 * trainer-facing app should feel like a Pokémon phone, the admin panel can
 * (and should) look like a normal professional tool.
 */
export function AdminLayout() {
  const { data: profile, isLoading } = useProfile();

  if (isLoading || !profile) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#0b0e14]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-volt border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-[#0b0e14] text-slate-100">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-white/10 bg-[#0e1220] p-4 sm:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-volt to-rotom-red font-display text-sm font-bold text-screen-ink">
            P
          </div>
          <div>
            <p className="text-sm font-semibold">PokéGear</p>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Admin</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors " +
                (isActive ? "bg-volt/15 text-volt" : "text-slate-300 hover:bg-white/5")
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <NavLink
          to="/"
          className="mt-4 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-white/5"
        >
          <Smartphone className="h-4 w-4" />
          Back to phone
        </NavLink>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-white/10 bg-[#0e1220] sm:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm font-semibold">PokéGear Admin</p>
            <NavLink to="/" className="text-xs text-slate-400">
              Exit
            </NavLink>
          </div>
          <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium " +
                  (isActive ? "bg-volt/15 text-volt" : "bg-white/5 text-slate-300")
                }
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <div className="flex items-center justify-end gap-2 border-b border-white/10 px-6 py-3 text-xs text-slate-400">
          Signed in as <span className="font-medium text-slate-200">{profile.username}</span>
        </div>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet context={{ profile }} />
        </main>
      </div>
    </div>
  );
}
