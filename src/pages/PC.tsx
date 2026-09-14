import { HardDrive } from "lucide-react";
import { PlaceholderScreen } from "@/components/phone/PlaceholderScreen";

export default function PC() {
  return (
    <PlaceholderScreen
      title="PC"
      icon={<HardDrive className="h-9 w-9" strokeWidth={1.5} />}
      message="Box storage for your Pokémon is on its way. Check back after Phase 2."
    />
  );
}
