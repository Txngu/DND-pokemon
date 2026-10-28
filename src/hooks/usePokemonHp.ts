import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/hooks/useProfile";
import { useRealtimeInvalidate } from "@/hooks/useEncounter";
import type { PokemonHpEvent, PokemonStatus, TrainerPokemon } from "@/types/database.types";

/**
 * PokéGear 12: creating Pokémon and changing their KP. Every view (Team,
 * PC, details, battle, Pokémon Center, admin) reads the same
 * trainer_pokemon row, so after a change we refresh every query that shows
 * Pokémon; nothing keeps a separate copy of KP.
 */
export function refreshPokemonViews(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["trainer_pokemon"] });
  qc.invalidateQueries({ queryKey: ["admin", "profile_pokemon"] });
  qc.invalidateQueries({ queryKey: ["pc_boxes"] });
  qc.invalidateQueries({ queryKey: ["battle_state"] });
  qc.invalidateQueries({ queryKey: ["battle_participants"] });
  qc.invalidateQueries({ queryKey: ["pokemon_hp_events"] });
  qc.invalidateQueries({ queryKey: ["my_battle"] });
}

/** Deal damage (the GM to any Pokémon, a trainer to their own). */
export function useDamagePokemon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pokemonId, amount }: { pokemonId: string; amount: number }) => {
      const { data, error } = await supabase.rpc("damage_pokemon", { p_pokemon_id: pokemonId, p_amount: amount });
      if (error) throw error;
      return data as TrainerPokemon;
    },
    onSettled: () => refreshPokemonViews(qc),
  });
}

/** Game Master: set current KP to an exact value (0 = fainted) and optionally a status. */
export function useAdminSetPokemonHp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pokemonId, currentHp, status }: { pokemonId: string; currentHp: number; status?: PokemonStatus | null }) => {
      const { data, error } = await supabase.rpc("admin_set_pokemon_hp", {
        p_pokemon_id: pokemonId,
        p_current_hp: currentHp,
        p_status: status ?? null,
      });
      if (error) throw error;
      return data as TrainerPokemon;
    },
    onSettled: () => refreshPokemonViews(qc),
  });
}

export type CreatePokemonInput = {
  profileId: string;
  speciesId: number;
  nickname: string;
  level: number;
  maxHp: number;
  currentHp: number;
  status: PokemonStatus;
  isShiny?: boolean;
  toPc?: boolean;
  nature?: string | null;
  ability?: string | null;
};

export type CreatePokemonResult = { pokemon: TrainerPokemon; placed: "team" | "pc"; team_full: boolean };

export function useCreatePokemon() {
  const qc = useQueryClient();
  return useMutation({
    // The form shows the server's message inline, so no extra toast.
    meta: { silent: true },
    mutationFn: async (input: CreatePokemonInput) => {
      const { data, error } = await supabase.rpc("create_pokemon", {
        p_profile_id: input.profileId,
        p_species_id: input.speciesId,
        p_nickname: input.nickname.trim() || null,
        p_level: input.level,
        p_max_hp: input.maxHp,
        p_current_hp: input.currentHp,
        p_status: input.status,
        p_is_shiny: !!input.isShiny,
        p_to_pc: !!input.toPc,
        p_nature: input.nature ?? null,
        p_ability: input.ability ?? null,
      });
      if (error) throw error;
      return data as unknown as CreatePokemonResult;
    },
    onSettled: () => {
      refreshPokemonViews(qc);
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      qc.invalidateQueries({ queryKey: ["admin", "activity"] });
    },
  });
}

/** Recent KP changes of one Pokémon (owner or GM; RLS enforces it). */
export function usePokemonHpHistory(pokemonId: string | null, limit = 8) {
  return useQuery({
    queryKey: ["pokemon_hp_events", pokemonId, limit],
    enabled: !!pokemonId,
    queryFn: async (): Promise<PokemonHpEvent[]> => {
      const { data, error } = await supabase
        .from("pokemon_hp_events")
        .select("*")
        .eq("pokemon_id", pokemonId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
  });
}

export const HP_SOURCE_LABELS: Record<string, string> = {
  gm_damage: "Game Master damage",
  gm_set_hp: "Set by the Game Master",
  player_damage: "Damage recorded by trainer",
  battle: "Battle",
  battle_item: "Item in battle",
  status_effect: "Status effect",
  pokemon_center: "Pokémon Center",
  kp_editor: "KP editor",
  level_up: "Level up",
  gm: "Game Master",
  system: "System",
  other: "Other",
};

/**
 * Keeps the trainer's own Pokémon live: when the Game Master (or a battle)
 * changes one of them, every open screen refreshes. Mounted once in the
 * phone layout.
 */
export function useMyPokemonRealtime() {
  const { data: profile } = useProfile();
  useRealtimeInvalidate(
    profile ? `my-pokemon-${profile.id}` : null,
    [{ table: "trainer_pokemon", filter: `profile_id=eq.${profile?.id}` }],
    [["trainer_pokemon", profile?.id], ["pc_boxes", profile?.id], ["pokemon_hp_events"]]
  );
}

/** Game Master: flip a boolean game_config switch (RLS: admin only). */
export function useSetGameConfigFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: boolean }) => {
      const { error } = await supabase
        .from("game_config")
        .update({ value }) // jsonb true/false, read with String(value) === "true"
        .eq("key", key);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["game_config"] }),
  });
}
