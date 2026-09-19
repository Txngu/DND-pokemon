import { Settings as SettingsIcon, LogOut, Palette, Image } from "lucide-react";
import { AppScreenHeader } from "@/components/phone/AppScreenHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export default function Settings() {
  const { signOut } = useAuth();

  return (
    <div className="flex h-full flex-col">
      <AppScreenHeader title="Settings" icon={<SettingsIcon className="h-5 w-5" strokeWidth={1.75} />} />

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
        <div className="glass flex items-center gap-3 rounded-2xl p-4 text-mist/60">
          <Palette className="h-5 w-5" />
          <div>
            <p className="text-sm font-medium text-mist">Theme</p>
            <p className="text-xs">Coming soon</p>
          </div>
        </div>
        <div className="glass flex items-center gap-3 rounded-2xl p-4 text-mist/60">
          <Image className="h-5 w-5" />
          <div>
            <p className="text-sm font-medium text-mist">Wallpaper</p>
            <p className="text-xs">Coming soon</p>
          </div>
        </div>
        <div className="glass flex items-center gap-3 rounded-2xl p-4 text-mist/60">
          <SettingsIcon className="h-5 w-5" />
          <div>
            <p className="text-sm font-medium text-mist">App preferences</p>
            <p className="text-xs">Coming soon</p>
          </div>
        </div>
      </div>

      <div className="px-5 pb-6">
        <Button variant="outline" className="w-full" onClick={() => void signOut()}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
