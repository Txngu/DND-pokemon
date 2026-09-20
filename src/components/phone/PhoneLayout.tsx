import { useNavigate } from "react-router-dom";
import { PhoneFrame } from "@/components/phone/PhoneFrame";
import { LockScreen } from "@/components/phone/LockScreen";
import { AnimatedOutlet } from "@/components/phone/AnimatedOutlet";
import { ToastViewport } from "@/components/phone/ToastViewport";
import { useProfile, useCities } from "@/hooks/useProfile";
import { usePhoneLock } from "@/hooks/usePhoneLock";
import { resolveWallpaper } from "@/lib/cityThemes";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shell for every authenticated screen. The lock state lives in
 * PhoneLockProvider (mounted once, above the router outlet in App.tsx), so
 * it is completely decoupled from which route is active. That's the fix for
 * the "back button sends you to the Lock Screen" bug: routing between apps
 * no longer touches lock state at all, and the Lock Screen is never part of
 * the app navigation stack.
 */
export function PhoneLayout() {
  const { data: profile, isLoading } = useProfile();
  const { data: cities } = useCities();
  const { locked, unlock } = usePhoneLock();
  const navigate = useNavigate();

  const city = cities?.find((c) => c.id === profile?.city_id) ?? null;
  const wallpaper = resolveWallpaper(profile?.wallpaper, city);

  function handleUnlock() {
    unlock();
    navigate("/", { replace: true });
  }

  return (
    <PhoneFrame wallpaper={wallpaper} accentColor={city?.accent_color}>
      {isLoading || !profile ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
          <Skeleton className="h-16 w-16 rounded-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      ) : locked ? (
        <LockScreen avatar={profile.avatar} username={profile.username} onUnlock={handleUnlock} />
      ) : (
        <AnimatedOutlet profile={profile} />
      )}
      <ToastViewport />
    </PhoneFrame>
  );
}
