import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ShoppingBag, ShieldCheck, CircleDot, Cross, Swords, Sparkles, KeyRound, Gem, Box } from "lucide-react";
import { AppScreenHeader } from "@/components/phone/AppScreenHeader";
import { ShopItemCard } from "@/components/phone/ShopItemCard";
import { PurchaseSheet } from "@/components/phone/PurchaseSheet";
import { AdminShopPanel } from "@/components/phone/AdminShopPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { useShopListings, usePurchaseItem, groupListingsByCategory } from "@/hooks/useShop";
import { usePhoneContext } from "@/hooks/usePhoneContext";
import { toast } from "@/lib/toast";
import type { ItemCategory, ShopListing } from "@/types/database.types";

type TabKey = "all" | ItemCategory;

const CATEGORY_META: Record<ItemCategory, { label: string; icon: React.ReactNode }> = {
  poke_ball: { label: "Poké Balls", icon: <CircleDot className="h-4 w-4" /> },
  medicine: { label: "Medicine", icon: <Cross className="h-4 w-4" /> },
  battle: { label: "Battle", icon: <Swords className="h-4 w-4" /> },
  evolution: { label: "Evolution", icon: <Sparkles className="h-4 w-4" /> },
  key_item: { label: "Key Items", icon: <KeyRound className="h-4 w-4" /> },
  quest: { label: "Quest", icon: <Gem className="h-4 w-4" /> },
  other: { label: "Other", icon: <Box className="h-4 w-4" /> },
};

export default function Shop() {
  const { profile } = usePhoneContext();
  const isAdmin = profile.role === "admin";

  const [managing, setManaging] = React.useState(false);
  const [tab, setTab] = React.useState<TabKey>("all");
  const [purchasing, setPurchasing] = React.useState<ShopListing | null>(null);

  const { data: listings, isLoading } = useShopListings();
  const purchaseItem = usePurchaseItem();
  const grouped = groupListingsByCategory(listings);

  const availableCategories = (Object.keys(CATEGORY_META) as ItemCategory[]).filter(
    (c) => grouped[c].length > 0
  );

  const visible: ShopListing[] =
    tab === "all" ? [...(listings ?? [])].sort((a, b) => a.item.name.localeCompare(b.item.name)) : grouped[tab];

  return (
    <div className="flex h-full flex-col">
      <AppScreenHeader title="Shop" icon={<ShoppingBag className="h-5 w-5" strokeWidth={1.75} />} />

      <div className="flex items-center justify-between px-5 pt-3">
        <p className="text-xs text-mist/50">Spend your PokéDollars wisely</p>
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-white/5 px-3 py-1 font-mono text-xs font-medium text-volt">
            ₽{profile.money.toLocaleString()}
          </div>
          {isAdmin ? (
            <button
              type="button"
              onClick={() => setManaging((m) => !m)}
              className={
                "flex touch-manipulation items-center gap-1 rounded-full px-3 py-1 text-xs font-medium " +
                (managing ? "bg-volt text-screen-ink" : "bg-white/5 text-mist/70")
              }
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {managing ? "Browsing" : "Manage"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="relative flex-1 overflow-y-auto px-5 py-4">
        {managing ? (
          <AdminShopPanel />
        ) : (
          <>
            <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setTab("all")}
                className={
                  "touch-manipulation whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium " +
                  (tab === "all" ? "bg-volt text-screen-ink" : "bg-white/5 text-mist/70")
                }
              >
                All
              </button>
              {availableCategories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setTab(c)}
                  className={
                    "flex touch-manipulation items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium " +
                    (tab === c ? "bg-volt text-screen-ink" : "bg-white/5 text-mist/70")
                  }
                >
                  {CATEGORY_META[c].icon}
                  {CATEGORY_META[c].label}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="space-y-2.5"
              >
                {isLoading ? (
                  <>
                    <Skeleton className="h-16 w-full rounded-2xl" />
                    <Skeleton className="h-16 w-full rounded-2xl" />
                    <Skeleton className="h-16 w-full rounded-2xl" />
                  </>
                ) : visible.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-16 text-center">
                    <ShoppingBag className="h-8 w-8 text-mist/20" strokeWidth={1.5} />
                    <p className="max-w-[220px] text-xs text-mist/50">Nothing for sale here right now.</p>
                  </div>
                ) : (
                  visible.map((listing) => (
                    <ShopItemCard key={listing.id} listing={listing} onBuy={() => setPurchasing(listing)} />
                  ))
                )}
              </motion.div>
            </AnimatePresence>
          </>
        )}

        <PurchaseSheet
          listing={purchasing}
          money={profile.money}
          pending={purchaseItem.isPending}
          errorMessage={purchaseItem.isError ? (purchaseItem.error as Error).message : null}
          onClose={() => {
            setPurchasing(null);
            purchaseItem.reset();
          }}
          onConfirm={(quantity) => {
            if (!purchasing) return;
            const itemName = purchasing.item.name;
            purchaseItem.mutate(
              { listingId: purchasing.id, quantity },
              {
                onSuccess: () => {
                  setPurchasing(null);
                  toast(`Bought ${quantity}x ${itemName}`, "success");
                },
              }
            );
          }}
        />
      </div>
    </div>
  );
}
