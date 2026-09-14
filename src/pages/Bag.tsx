import { Backpack } from "lucide-react";
import { PlaceholderScreen } from "@/components/phone/PlaceholderScreen";

export default function Bag() {
  return (
    <PlaceholderScreen
      title="Bag"
      icon={<Backpack className="h-9 w-9" strokeWidth={1.5} />}
      message="Your items, berries, and key items will live here once the Bag is built."
    />
  );
}
