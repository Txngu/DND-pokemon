import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

export function ProtectedRoute({ adminOnly = false }: { adminOnly?: boolean }) {
  const { user, loading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();

  if (authLoading || (user && profileLoading)) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-rotom-gradient">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-volt border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (adminOnly && profile?.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
