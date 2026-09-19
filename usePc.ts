import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/hooks/useProfile";
import type { PcBox, TrainerPokemon } from "@/types/database.types";

export type PokemonLocation = { type: "party"; slot: number } | { type: "box"; boxId: string; slot: number };

export function locationsEqual(a: PokemonLocation, b: PokemonLocation) {
  if (a.type !== b.type) return false;
  if (a.type === "party" && b.type === "party") return a.slot === b.slot;
  if (a.type === "box" && b.type === "box") return a.boxId === b.boxId && a.slot === b.slot;
  return false;
}

export function locationOf(pokemon: TrainerPokemon): PokemonLocation {
  if (pokemon.party_slot != null) return { type: "party", slot: pokemon.party_slot };
  return { type: "box", boxId: pokemon.box_id!, slot: pokemon.box_slot! };
}

export function usePcBoxes() {
  const { data: profile } = useProfile();

  return useQuery({
    queryKey: ["pc_boxes", profile?.id],
    enabled: !!profile,
    queryFn: async (): Promise<PcBox[]> => {
      const { data, error } = await supabase
        .from("pc_boxes")
        .select("*")
        .eq("profile_id", profile!.id)
        .order("box_number");
      if (error) throw error;
      return data;
    },
  });
}

export function useRenameBox() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ boxId, name }: { boxId: string; name: string }) => {
      const { data, error } = await supabase
        .from("pc_boxes")
        .update({ name })
        .eq("id", boxId)
        .select()
        .single<PcBox>();
      if (error) throw error;
      return data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<PcBox[]>(["pc_boxes", profile?.id], (prev) =>
        prev?.map((b) => (b.id === updated.id ? updated : b))
      );
    },
  });
}

/** Moves a Pokémon into an *empty* slot. Use useSwapPokemon() for occupied targets. */
export function useMovePokemon() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pokemonId, destination }: { pokemonId: string; destination: PokemonLocation }) => {
      const patch =
        destination.type === "party"
          ? { party_slot: destination.slot, box_id: null, box_slot: null }
          : { party_slot: null, box_id: destination.boxId, box_slot: destination.slot };

      const { data, error } = await supabase
        .from("trainer_pokemon")
        .update(patch)
        .eq("id", pokemonId)
        .select("*, species:species_id(*), held_item:held_item_id(*)")
        .single<TrainerPokemon>();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainer_pokemon", profile?.id] });
    },
  });
}

/** Swaps two Pokémon's locations atomically - used when dropping onto an occupied slot. */
export function useSwapPokemon() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pokemonA, pokemonB }: { pokemonA: string; pokemonB: string }) => {
      const { error } = await supabase.rpc("swap_pokemon_slots", {
        p_pokemon_a: pokemonA,
        p_pokemon_b: pokemonB,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainer_pokemon", profile?.id] });
    },
  });
}
