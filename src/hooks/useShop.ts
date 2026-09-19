import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/hooks/useProfile";
import type { ItemCatalogEntry, ItemCategory, ShopListing } from "@/types/database.types";

const LISTING_SELECT = "*, item:item_id(*)";

/** Trainer-facing: only listings currently for sale. */
export function useShopListings() {
  return useQuery({
    queryKey: ["shop_listings"],
    queryFn: async (): Promise<ShopListing[]> => {
      const { data, error } = await supabase
        .from("shop_listings")
        .select(LISTING_SELECT)
        .eq("is_enabled", true)
        .returns<ShopListing[]>();
      if (error) throw error;
      return data;
    },
  });
}

/** Admin-facing: every listing, enabled or not. */
export function useAllShopListings(enabled: boolean) {
  return useQuery({
    queryKey: ["shop_listings", "all"],
    enabled,
    queryFn: async (): Promise<ShopListing[]> => {
      const { data, error } = await supabase.from("shop_listings").select(LISTING_SELECT).returns<ShopListing[]>();
      if (error) throw error;
      return data;
    },
  });
}

export function groupListingsByCategory(listings: ShopListing[] | undefined) {
  const buckets: Record<ItemCategory, ShopListing[]> = {
    poke_ball: [],
    medicine: [],
    evolution: [],
    battle: [],
    key_item: [],
    quest: [],
    other: [],
  };
  for (const listing of listings ?? []) {
    buckets[listing.item.category].push(listing);
  }
  for (const key of Object.keys(buckets) as (keyof typeof buckets)[]) {
    buckets[key].sort((a, b) => a.item.sort_order - b.item.sort_order || a.item.name.localeCompare(b.item.name));
  }
  return buckets;
}

function invalidateAfterPurchase(queryClient: ReturnType<typeof useQueryClient>, profileId?: string) {
  queryClient.invalidateQueries({ queryKey: ["profile", profileId] });
  queryClient.invalidateQueries({ queryKey: ["trainer_items", profileId] });
  queryClient.invalidateQueries({ queryKey: ["shop_listings"] });
  queryClient.invalidateQueries({ queryKey: ["notifications", profileId] });
}

export function usePurchaseItem() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ listingId, quantity }: { listingId: string; quantity: number }) => {
      const { error } = await supabase.rpc("purchase_item", { p_listing_id: listingId, p_quantity: quantity });
      if (error) throw error;
    },
    onSuccess: () => invalidateAfterPurchase(queryClient, profile?.id),
  });
}

// ---------------------------------------------------------------------------
// Admin CRUD - all of these are simply rejected by RLS server-side for a
// non-admin caller, same defense-in-depth as everywhere else in the app.
// ---------------------------------------------------------------------------

export function useCreateShopItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      description: string;
      category: ItemCategory;
      iconEmoji?: string | null;
      pokeapiSlug?: string | null;
      value?: number | null;
      isTradable: boolean;
      isSellable: boolean;
      price: number;
      stock: number | null;
    }) => {
      const { data: item, error: itemError } = await supabase
        .from("items_catalog")
        .insert({
          name: input.name,
          description: input.description || null,
          category: input.category,
          icon_emoji: input.iconEmoji || null,
          pokeapi_slug: input.pokeapiSlug || null,
          value: input.value ?? null,
          is_tradable: input.isTradable,
          is_sellable: input.isSellable,
        })
        .select()
        .single<ItemCatalogEntry>();
      if (itemError) throw itemError;

      const { error: listingError } = await supabase
        .from("shop_listings")
        .insert({ item_id: item.id, price: input.price, stock: input.stock });
      if (listingError) throw listingError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shop_listings"] });
    },
  });
}

export function useUpdateShopListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      listingId,
      patch,
    }: {
      listingId: string;
      patch: Partial<{ price: number; stock: number | null; is_enabled: boolean }>;
    }) => {
      const { error } = await supabase.from("shop_listings").update(patch).eq("id", listingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shop_listings"] });
    },
  });
}

export function useUpdateItemCatalog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      itemId,
      patch,
    }: {
      itemId: string;
      patch: Partial<Pick<ItemCatalogEntry, "name" | "description" | "icon_emoji" | "icon_url" | "value">>;
    }) => {
      const { error } = await supabase.from("items_catalog").update(patch).eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shop_listings"] });
    },
  });
}

export function useDeleteShopListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (listingId: string) => {
      const { error } = await supabase.from("shop_listings").delete().eq("id", listingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shop_listings"] });
    },
  });
}
