import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PhoneLayout } from "@/components/phone/PhoneLayout";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { PhoneLockProvider } from "@/hooks/usePhoneLock";
import Login from "@/pages/Login";
import Home from "@/pages/Home";
import Profile from "@/pages/Profile";
import Bag from "@/pages/Bag";
import PC from "@/pages/PC";
import Shop from "@/pages/Shop";
import Trade from "@/pages/Trade";
import Notifications from "@/pages/Notifications";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/NotFound";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminRewards from "@/pages/admin/AdminRewards";
import AdminItems from "@/pages/admin/AdminItems";
import AdminActivityLog from "@/pages/admin/AdminActivityLog";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route
          element={
            <PhoneLockProvider>
              <PhoneLayout />
            </PhoneLockProvider>
          }
        >
          <Route path="/" element={<Home />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/bag" element={<Bag />} />
          <Route path="/pc" element={<PC />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/trade" element={<Trade />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Route>

      {/*
        Admin routes render OUTSIDE the phone chrome entirely — a
        conventional dashboard layout, not a phone screen — and are gated
        twice: adminOnly here redirects a trainer client-side (good UX), but
        the real enforcement is server-side, since every query and mutation
        these pages make is independently blocked by RLS for a non-admin
        regardless of which route rendered the request.
      */}
      <Route element={<ProtectedRoute adminOnly />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/rewards" element={<AdminRewards />} />
          <Route path="/admin/items" element={<AdminItems />} />
          <Route path="/admin/activity" element={<AdminActivityLog />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
