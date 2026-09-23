import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import type { ItemCatalogEntry, Species, TrainerItem, TrainerPokemon } from "@/types/database.types";

const POKEMON_SELECT = "*, species:species_id(*), held_item:held_item_id(*)";
const ITEMS_SELECT = "*, item:item_id(*)";

export function useSpecies() {
  return useQuery({
    queryKey: ["species"],
    staleTime: Infinity,
    queryFn: async (): Promise<Species[]> => {
      const { data, error } = await supabase.from("species").select("*").order("id");
      if (error) throw error;
      return data;
    },
  });
}

export function useTrainerPokemon() {
  const { user } = useAuth();
  const { data: profile } = useProfile();

  return useQuery({
    queryKey: ["trainer_pokemon", profile?.id],
    enabled: !!user && !!profile,
    queryFn: async (): Promise<TrainerPokemon[]> => {
      const { data, error } = await supabase
        .from("trainer_pokemon")
        .select(POKEMON_SELECT)
        .eq("profile_id", profile!.id)
        .order("caught_at", { ascending: false })
        .returns<TrainerPokemon[]>();
      if (error) throw error;
      return data;
    },
  });
}

export function useTrainerItems() {
  const { user } = useAuth();
  const { data: profile } = useProfile();

  return useQuery({
    queryKey: ["trainer_items", profile?.id],
    enabled: !!user && !!profile,
    queryFn: async (): Promise<TrainerItem[]> => {
      const { data, error } = await supabase
        .from("trainer_items")
        .select(ITEMS_SELECT)
        .eq("profile_id", profile!.id)
        .gt("quantity", 0)
        .returns<TrainerItem[]>();
      if (error) throw error;
      return data;
    },
  });
}

/** Groups a flat trainer_items list into the Bag's category buckets, sorted for display. */
export function groupItemsByCategory(items: TrainerItem[] | undefined) {
  const buckets: Record<ItemCatalogEntry["category"], TrainerItem[]> = {
    poke_ball: [],
    medicine: [],
    evolution: [],
    battle: [],
    key_item: [],
    quest: [],
    other: [],
  };
  for (const entry of items ?? []) {
    buckets[entry.item.category].push(entry);
  }
  for (const key of Object.keys(buckets) as (keyof typeof buckets)[]) {
    buckets[key].sort((a, b) => a.item.sort_order - b.item.sort_order || a.item.name.localeCompare(b.item.name));
  }
  return buckets;
}

export function useToggleFavorite() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pokemonId, isFavorite }: { pokemonId: string; isFavorite: boolean }) => {
      const { data, error } = await supabase
        .from("trainer_pokemon")
        .update({ is_favorite: isFavorite })
        .eq("id", pokemonId)
        .select(POKEMON_SELECT)
        .single<TrainerPokemon>();
      if (error) throw error;
      return data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<TrainerPokemon[]>(["trainer_pokemon", profile?.id], (prev) =>
        prev?.map((p) => (p.id === updated.id ? updated : p))
      );
    },
  });
}

/**
 * Changes a Pokémon's held item via the set_held_item() RPC, which atomically
 * returns any previously held item to the Bag and removes the new one from
 * it — so this invalidates both trainer_pokemon and trainer_items.
 */
export function useSetHeldItem() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pokemonId, itemId }: { pokemonId: string; itemId: string | null }) => {
      const { data, error } = await supabase.rpc("set_held_item", {
        p_pokemon_id: pokemonId,
        p_item_id: itemId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainer_pokemon", profile?.id] });
      queryClient.invalidateQueries({ queryKey: ["trainer_items", profile?.id] });
    },
  });
}
