import * as React from "react";
import { Settings as SettingsIcon, LogOut, Image as ImageIcon, User, Bell, Check } from "lucide-react";
import { AppScreenHeader } from "@/components/phone/AppScreenHeader";
import { ConfirmDialog } from "@/components/phone/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useProfile, useUpdateProfile } from "@/hooks/useProfile";
import { WALLPAPER_OPTIONS } from "@/lib/cityThemes";
import { toast } from "@/lib/toast";
import type { NotificationPrefs } from "@/types/database.types";

const PREF_LABELS: { key: keyof NotificationPrefs; label: string; hint: string }[] = [
  { key: "trades", label: "Trades", hint: "Requests, accepts, and completions" },
  { key: "purchases", label: "Purchases", hint: "Shop purchase confirmations" },
  { key: "system", label: "Everything else", hint: "Pokémon/item grants, admin rewards" },
];

export default function Settings() {
  const { signOut } = useAuth();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();

  const [signOutConfirmOpen, setSignOutConfirmOpen] = React.useState(false);
  const [favoritePokemon, setFavoritePokemon] = React.useState(profile?.favorite_pokemon ?? "");
  const [avatarUrl, setAvatarUrl] = React.useState(profile?.avatar ?? "");

  React.useEffect(() => {
    setFavoritePokemon(profile?.favorite_pokemon ?? "");
    setAvatarUrl(profile?.avatar ?? "");
  }, [profile?.id]);

  if (!profile) return null;

  const currentWallpaper = profile.wallpaper || null;
  const prefs = profile.notification_prefs;

  function saveProfilePrefs() {
    updateProfile.mutate(
      { favorite_pokemon: favoritePokemon.trim() || null, avatar: avatarUrl.trim() || null },
      { onSuccess: () => toast("Profile updated", "success") }
    );
  }

  function togglePref(key: keyof NotificationPrefs) {
    updateProfile.mutate(
      { notification_prefs: { ...prefs, [key]: !prefs[key] } },
      { onSuccess: () => toast("Notification preferences updated", "success") }
    );
  }

  return (
    <div className="flex h-full flex-col">
      <AppScreenHeader title="Settings" icon={<SettingsIcon className="h-5 w-5" strokeWidth={1.75} />} />

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {/* Phone appearance / wallpaper */}
        <section>
          <p className="mb-2 flex items-center gap-1.5 px-1 text-[11px] uppercase tracking-wide text-mist/50">
            <ImageIcon className="h-3.5 w-3.5" />
            Phone appearance
          </p>
          <div className="grid grid-cols-3 gap-2">
            {WALLPAPER_OPTIONS.map((w) => {
              const isActive = (currentWallpaper ?? "default-dusk") === w.key || (!currentWallpaper && w.key === "default-dusk");
              return (
                <button
                  key={w.key}
                  type="button"
                  onClick={() =>
                    updateProfile.mutate(
                      { wallpaper: w.key },
                      { onSuccess: () => toast(`Wallpaper set to ${w.label}`, "success") }
                    )
                  }
                  className={
                    "relative h-16 touch-manipulation overflow-hidden rounded-2xl border-2 " +
                    (isActive ? "border-volt" : "border-transparent")
                  }
                  style={{ background: w.css }}
                >
                  {isActive ? (
                    <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-volt">
                      <Check className="h-2.5 w-2.5 text-screen-ink" />
                    </span>
                  ) : null}
                  <span className="absolute bottom-1 left-1 right-1 truncate rounded bg-black/40 px-1 text-[9px] text-white">
                    {w.label}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 px-1 text-[10px] text-mist/40">
            Your admin can also assign you a special wallpaper directly.
          </p>
        </section>

        {/* Profile preferences */}
        <section>
          <p className="mb-2 flex items-center gap-1.5 px-1 text-[11px] uppercase tracking-wide text-mist/50">
            <User className="h-3.5 w-3.5" />
            Profile preferences
          </p>
          <div className="glass space-y-3 rounded-2xl p-4">
            <div className="space-y-1.5">
              <Label htmlFor="favorite-pokemon">Favorite Pokémon</Label>
              <Input
                id="favorite-pokemon"
                value={favoritePokemon}
                onChange={(e) => setFavoritePokemon(e.target.value)}
                placeholder="Pikachu"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="avatar-url">Avatar image URL</Label>
              <Input
                id="avatar-url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
            <Button variant="volt" size="sm" className="w-full" onClick={saveProfilePrefs} disabled={updateProfile.isPending}>
              Save changes
            </Button>
          </div>
        </section>

        {/* Notification preferences */}
        <section>
          <p className="mb-2 flex items-center gap-1.5 px-1 text-[11px] uppercase tracking-wide text-mist/50">
            <Bell className="h-3.5 w-3.5" />
            Notification preferences
          </p>
          <div className="glass space-y-3 rounded-2xl p-4">
            {PREF_LABELS.map(({ key, label, hint }) => (
              <label key={key} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-mist">{label}</p>
                  <p className="text-[10px] text-mist/40">{hint}</p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs[key]}
                  onChange={() => togglePref(key)}
                  className="h-5 w-5 shrink-0 accent-volt"
                />
              </label>
            ))}
          </div>
        </section>

        <p className="px-1 text-center text-[10px] text-mist/30">
          Account role and Trainer ID are managed by your league admin and can't be changed here.
        </p>
      </div>

      <div className="px-5 pb-6">
        <Button variant="outline" className="w-full" onClick={() => setSignOutConfirmOpen(true)}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </div>

      <ConfirmDialog
        open={signOutConfirmOpen}
        title="Sign out?"
        message="You'll need to sign back in to access your PokéGear."
        confirmLabel="Sign out"
        destructive
        onCancel={() => setSignOutConfirmOpen(false)}
        onConfirm={() => void signOut()}
      />
    </div>
  );
}
