import { ShoppingBag } from "lucide-react";
import { PlaceholderScreen } from "@/components/phone/PlaceholderScreen";

export default function Shop() {
  return (
    <PlaceholderScreen
      title="Shop"
      icon={<ShoppingBag className="h-9 w-9" strokeWidth={1.5} />}
      message="Buy supplies and gear with your PokéDollars soon."
    />
  );
}
