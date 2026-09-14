import { ArrowLeftRight } from "lucide-react";
import { PlaceholderScreen } from "@/components/phone/PlaceholderScreen";

export default function Trade() {
  return (
    <PlaceholderScreen
      title="Trade"
      icon={<ArrowLeftRight className="h-9 w-9" strokeWidth={1.5} />}
      message="Trainer-to-trainer trading is coming in a future update."
    />
  );
}
