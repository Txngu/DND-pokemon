import { Backpack, HardDrive, ShoppingBag, ArrowLeftRight, User, Bell, Settings } from "lucide-react";
import { StatusBar } from "@/components/phone/StatusBar";
import { AppIcon } from "@/components/phone/AppIcon";
import { Dock } from "@/components/phone/Dock";
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
  return (
    <div className="flex h-full flex-col">
      <StatusBar />

      <div className="flex items-baseline justify-between px-6 pb-2 pt-5">
        <div>
          <p className="font-sans text-xs text-mist/60">Welcome back,</p>
          <p className="font-display text-lg font-semibold text-mist">{profile.username}</p>
        </div>
        <div className="rounded-full bg-white/5 px-3 py-1 font-mono text-xs text-volt">
          ₽{profile.money.toLocaleString()}
        </div>
      </div>

      <div className="grid flex-1 grid-cols-4 content-start gap-x-3 gap-y-6 overflow-y-auto px-5 py-6">
        {apps.map((app) => (
          <AppIcon key={app.to} label={app.label} to={app.to} icon={app.icon} />
        ))}
      </div>

      <Dock />
    </div>
  );
}
