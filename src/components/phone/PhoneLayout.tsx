import { Outlet } from "react-router-dom";
import { PhoneFrame } from "@/components/phone/PhoneFrame";
import { useProfile } from "@/hooks/useProfile";
import { Skeleton } from "@/components/ui/skeleton";

export function PhoneLayout() {
  const { data: profile, isLoading } = useProfile();

  return (
    <PhoneFrame wallpaper={profile?.wallpaper}>
      {isLoading || !profile ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
          <Skeleton className="h-16 w-16 rounded-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      ) : (
        <Outlet context={{ profile }} />
      )}
    </PhoneFrame>
  );
}
