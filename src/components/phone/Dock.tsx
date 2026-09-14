import { Backpack, HardDrive, User, ArrowLeftRight } from "lucide-react";
import { AppIcon } from "@/components/phone/AppIcon";

export function Dock() {
  return (
    <div className="glass mx-4 mb-4 flex items-center justify-around rounded-3xl px-3 py-2.5 shadow-glass">
      <AppIcon label="" to="/bag" icon={<Backpack className="h-6 w-6" strokeWidth={1.75} />} className="gap-0" />
      <AppIcon label="" to="/pc" icon={<HardDrive className="h-6 w-6" strokeWidth={1.75} />} className="gap-0" />
      <AppIcon label="" to="/trade" icon={<ArrowLeftRight className="h-6 w-6" strokeWidth={1.75} />} className="gap-0" />
      <AppIcon label="" to="/profile" icon={<User className="h-6 w-6" strokeWidth={1.75} />} className="gap-0" />
    </div>
  );
}
