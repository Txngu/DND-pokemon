import { Bell } from "lucide-react";
import { PlaceholderScreen } from "@/components/phone/PlaceholderScreen";

export default function Notifications() {
  return (
    <PlaceholderScreen
      title="Notifications"
      icon={<Bell className="h-9 w-9" strokeWidth={1.5} />}
      message="You're all caught up. Trainer alerts will appear here."
    />
  );
}
