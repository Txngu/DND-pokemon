import { Backpack, HardDrive, ShoppingBag, ArrowLeftRight, User, Bell, Settings } from "lucide-react";
import { StatusBar, useClock } from "@/components/phone/StatusBar";
import { AppIcon } from "@/components/phone/AppIcon";
import { Dock } from "@/components/phone/Dock";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useCities } from "@/hooks/useProfile";
import { useUnreadNotificationCount } from "@/hooks/useNotifications";
import type { Profile } from "@/types/database.types";

const apps = [
  { label: "Bag", to: "/bag", icon: <Backpack className="h-7 w-7" strokeWidth={1.75} /> },
  { label: "PC", to: "/pc", icon: <HardDrive className="h-7 w-7" strokeWidth={1.75} /> },
  { label: "Shop", to: "/shop", icon: <ShoppingBag className="h-7 w-7" strokeWidth={1.75} /> },
  { label: "Trade", to: "/trade", icon: <ArrowLeftRight className="h-7 w-7" strokeWidth={1.75} /> },
  { label: "Profile", to: "/profile", icon: <User className="h-7 w-7" strokeWidth={1.75} /> },
  { label: "Notifications", to: "/notifications", icon: <Bell className="h-7 w-7" strokeWidth={1.75} /> },
  { label: "Settings", to: "/settings", icon: <Settings className="h-7 w-7" strokeWidth={1.75} /> },
];

export function HomeScreen({ profile }: { profile: Profile }) {
  const now = useClock();
  const { data: cities } = useCities();
  const city = cities?.find((c) => c.id === profile.city_id);
  const unreadCount = useUnreadNotificationCount();
  const initials = profile.username.slice(0, 2).toUpperCase();

  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="flex h-full flex-col">
      <StatusBar />

      {/* Time + date */}
      <div className="px-6 pt-3 text-center">
        <p className="font-display text-4xl font-semibold tracking-tight text-mist text-glow">{time}</p>
        <p className="font-mono text-[11px] uppercase tracking-widest text-mist/50">{date}</p>
      </div>

      {/* Trainer summary card */}
      <div className="glass mx-5 mt-4 flex items-center gap-3 rounded-2xl p-3 shadow-glass">
        <Avatar className="h-11 w-11 ring-2" style={{ boxShadow: `0 0 0 2px ${city?.accent_color ?? "#FFD23F"}` }}>
          {profile.avatar ? <AvatarImage src={profile.avatar} alt={profile.username} /> : null}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-semibold text-mist">{profile.username}</p>
          <p className="flex items-center gap-1 text-[11px] text-mist/60">
            <span>{city?.badge_emoji ?? "🌐"}</span>
            <span className="truncate">{city?.name ?? "No city set"}</span>
          </p>
        </div>
        <div className="shrink-0 rounded-full bg-white/5 px-3 py-1 font-mono text-xs font-medium text-volt">
          ₽{profile.money.toLocaleString()}
        </div>
      </div>

      {/* App grid */}
      <div className="grid flex-1 grid-cols-4 content-start gap-x-3 gap-y-6 overflow-y-auto px-5 py-6">
        {apps.map((app) => (
          <AppIcon
            key={app.to}
            label={app.label}
            to={app.to}
            icon={app.icon}
            badgeCount={app.to === "/notifications" ? unreadCount : undefined}
          />
        ))}
      </div>

      <Dock />
    </div>
  );
}
