import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PhoneLayout } from "@/components/phone/PhoneLayout";
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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<PhoneLayout />}>
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

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
