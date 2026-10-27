import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/hooks/useProfile";
import type {
  BattleEncounter,
  BattleLogRow,
  BattleParticipant,
  EvolutionRule,
  TrainerPokemon,
} from "@/types/database.types";

const POKEMON_SELECT = "*, species:species_id(*), held_item:held_item_id(*)";

// ---------------------------------------------------------------------------
// Campaign config (max level, XP curve) - read from the database, never
// hardcoded, so a Game Master can change the rules without a rebuild.
// ---------------------------------------------------------------------------
export function useGameConfig() {
  return useQuery({
    queryKey: ["game_config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("game_config").select("*");
      if (error) throw error;
      const maxLevel = Number(data.find((r) => r.key === "max_level")?.value ?? 8);
      const xpCurve = (data.find((r) => r.key === "xp_curve")?.value as Record<string, number>) ?? {};
      // When false (the default since PokéGear 10.0) only the Game Master can
      // edit KP/XP directly; trainers change them through battles, items and
      // the Pokémon Center. The server enforces this either way.
      const playerSelfEdit = String(data.find((r) => r.key === "player_self_edit")?.value ?? "false") === "true";
      const damageScale = Number(data.find((r) => r.key === "battle_damage_scale")?.value ?? 5) || 5;
      return { maxLevel, xpCurve, playerSelfEdit, damageScale };
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * TOTAL XP needed to reach `level + 1`, or null past the curve's data.
 * (PokéGear 11: the curve holds totals; see lib/xp.ts for the full helper.)
 */
export function xpToNextLevel(xpCurve: Record<string, number>, level: number): number | null {
  const threshold = xpCurve[String(level + 1)];
  return threshold ?? null;
}

// ---------------------------------------------------------------------------
// KP (HP) editing
// ---------------------------------------------------------------------------
export function useAdjustPokemonKp() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pokemonId,
      delta,
      note,
      encounterId,
    }: {
      pokemonId: string;
      delta: number;
      note?: string;
      encounterId?: string;
    }) => {
      const { data, error } = await supabase.rpc("adjust_pokemon_kp", {
        p_pokemon_id: pokemonId,
        p_delta: delta,
        p_note: note ?? null,
        p_encounter_id: encounterId ?? null,
      });
      if (error) throw error;
      return data as TrainerPokemon;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainer_pokemon", profile?.id] });
      queryClient.invalidateQueries({ queryKey: ["battle_logs"] });
      queryClient.invalidateQueries({ queryKey: ["battle_participants"] });
      queryClient.invalidateQueries({ queryKey: ["notifications", profile?.id] });
    },
  });
}

export function useHealPokemon() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pokemonId: string) => {
      const { data, error } = await supabase.rpc("heal_pokemon", { p_pokemon_id: pokemonId });
      if (error) throw error;
      return data as TrainerPokemon;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainer_pokemon", profile?.id] });
      queryClient.invalidateQueries({ queryKey: ["notifications", profile?.id] });
    },
  });
}

export function useRevivePokemon() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pokemonId: string) => {
      const { data, error } = await supabase.rpc("revive_pokemon", { p_pokemon_id: pokemonId });
      if (error) throw error;
      return data as TrainerPokemon;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainer_pokemon", profile?.id] });
      queryClient.invalidateQueries({ queryKey: ["notifications", profile?.id] });
    },
  });
}

export function useAdminSetPokemonDead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pokemonId, note }: { pokemonId: string; note?: string }) => {
      const { data, error } = await supabase.rpc("admin_set_pokemon_dead", {
        p_pokemon_id: pokemonId,
        p_note: note ?? null,
      });
      if (error) throw error;
      return data as TrainerPokemon;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainer_pokemon"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "profile_pokemon"] });
    },
  });
}

// ---------------------------------------------------------------------------
// XP & evolution
// ---------------------------------------------------------------------------
export function useGrantPokemonXp() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pokemonId, amount, note }: { pokemonId: string; amount: number; note?: string }) => {
      const { data, error } = await supabase.rpc("grant_pokemon_xp", {
        p_pokemon_id: pokemonId,
        p_amount: amount,
        p_note: note ?? null,
      });
      if (error) throw error;
      return data as TrainerPokemon;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainer_pokemon", profile?.id] });
      queryClient.invalidateQueries({ queryKey: ["notifications", profile?.id] });
    },
  });
}

/** Evolution rules that could apply to a given species right now (any method). */
export function useEvolutionRulesFor(speciesId: number | undefined) {
  return useQuery({
    queryKey: ["evolution_rules", speciesId],
    enabled: !!speciesId,
    queryFn: async (): Promise<EvolutionRule[]> => {
      const { data, error } = await supabase
        .from("evolution_rules")
        .select("*, from_species:from_species_id(*), to_species:to_species_id(*), item:item_id(*)")
        .eq("from_species_id", speciesId!)
        .returns<EvolutionRule[]>();
      if (error) throw error;
      return data;
    },
  });
}

export function useEvolveWithItem() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pokemonId, ruleId }: { pokemonId: string; ruleId: string }) => {
      const { data, error } = await supabase.rpc("evolve_with_item", { p_pokemon_id: pokemonId, p_rule_id: ruleId });
      if (error) throw error;
      return data as TrainerPokemon;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainer_pokemon", profile?.id] });
      queryClient.invalidateQueries({ queryKey: ["trainer_items", profile?.id] });
      queryClient.invalidateQueries({ queryKey: ["notifications", profile?.id] });
    },
  });
}

// ---------------------------------------------------------------------------
// Battle encounters (Admin Battle Manager + player viewing)
// ---------------------------------------------------------------------------
export function useActiveEncounters() {
  return useQuery({
    queryKey: ["battle_encounters", "active"],
    queryFn: async (): Promise<BattleEncounter[]> => {
      const { data, error } = await supabase
        .from("battle_encounters")
        .select("*")
        .eq("status", "active")
        .eq("mode", "manual")
        .order("created_at", { ascending: false })
        .returns<BattleEncounter[]>();
      if (error) throw error;
      return data;
    },
  });
}

export function useAllEncounters() {
  return useQuery({
    queryKey: ["battle_encounters", "all"],
    queryFn: async (): Promise<BattleEncounter[]> => {
      const { data, error } = await supabase
        .from("battle_encounters")
        .select("*")
        .order("created_at", { ascending: false })
        .returns<BattleEncounter[]>();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateEncounter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      enemyName: string;
      enemySpeciesId: number | null;
      level: number;
      maxKp: number;
      notes?: string;
      createdBy: string;
    }) => {
      const { data, error } = await supabase
        .from("battle_encounters")
        .insert({
          name: input.name,
          enemy_name: input.enemyName,
          enemy_species_id: input.enemySpeciesId,
          level: input.level,
          current_kp: input.maxKp,
          max_kp: input.maxKp,
          notes: input.notes || null,
          created_by: input.createdBy,
        })
        .select()
        .single<BattleEncounter>();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["battle_encounters"] });
    },
  });
}

export function useAdjustEnemyKp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ encounterId, delta, note }: { encounterId: string; delta: number; note?: string }) => {
      const { data, error } = await supabase.rpc("admin_adjust_enemy_kp", {
        p_encounter_id: encounterId,
        p_delta: delta,
        p_note: note ?? null,
      });
      if (error) throw error;
      return data as BattleEncounter;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["battle_encounters"] });
      queryClient.invalidateQueries({ queryKey: ["battle_logs"] });
    },
  });
}

export function useEndEncounter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (encounterId: string) => {
      const { error } = await supabase.rpc("admin_end_encounter", { p_encounter_id: encounterId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["battle_encounters"] });
    },
  });
}

export function useBattleParticipants(encounterId: string | null) {
  return useQuery({
    queryKey: ["battle_participants", encounterId],
    enabled: !!encounterId,
    queryFn: async (): Promise<BattleParticipant[]> => {
      const { data, error } = await supabase
        .from("battle_participants")
        .select(`*, pokemon:pokemon_id(${POKEMON_SELECT}), trainer:profile_id(*)`)
        .eq("encounter_id", encounterId!)
        .returns<BattleParticipant[]>();
      if (error) throw error;
      return data;
    },
  });
}

export function useJoinBattle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ encounterId, pokemonId }: { encounterId: string; pokemonId: string }) => {
      const { error } = await supabase.rpc("join_battle", { p_encounter_id: encounterId, p_pokemon_id: pokemonId });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["battle_participants", vars.encounterId] });
    },
  });
}

export function useLeaveBattle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (participantRowId: string) => {
      const { error } = await supabase.from("battle_participants").delete().eq("id", participantRowId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["battle_participants"] });
    },
  });
}

export function useBattleLogs(encounterId: string | null) {
  return useQuery({
    queryKey: ["battle_logs", encounterId],
    enabled: !!encounterId,
    queryFn: async (): Promise<BattleLogRow[]> => {
      const { data, error } = await supabase
        .from("battle_logs")
        .select("*")
        .eq("encounter_id", encounterId!)
        .order("created_at", { ascending: false })
        .limit(100)
        .returns<BattleLogRow[]>();
      if (error) throw error;
      return data;
    },
  });
}

// ---------------------------------------------------------------------------
// Realtime: the encounter *list* itself — a Game Master starting or ending an
// encounter shows up for every player immediately, no refresh needed.
// ---------------------------------------------------------------------------
export function useEncountersRealtime() {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    const channel = supabase
      .channel("battle-encounters-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "battle_encounters" }, () => {
        queryClient.invalidateQueries({ queryKey: ["battle_encounters"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

// ---------------------------------------------------------------------------
// Realtime: subscribe to live changes for one encounter (enemy KP, logs,
// participants, participating Pokémon) so every connected player sees
// updates without refreshing. Supabase Realtime only delivers rows the
// subscriber is allowed to SELECT under RLS, so this can't leak anything.
// ---------------------------------------------------------------------------
export function useBattleRealtime(encounterId: string | null) {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!encounterId) return;

    const channel = supabase
      .channel(`battle-${encounterId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "battle_encounters", filter: `id=eq.${encounterId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["battle_encounters"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "battle_logs", filter: `encounter_id=eq.${encounterId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["battle_logs", encounterId] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "battle_participants", filter: `encounter_id=eq.${encounterId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["battle_participants", encounterId] });
        }
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "trainer_pokemon" }, () => {
        // Any participant's KP could have changed; refresh the participant
        // list (which embeds each Pokémon's current row) and the local list.
        queryClient.invalidateQueries({ queryKey: ["battle_participants", encounterId] });
        queryClient.invalidateQueries({ queryKey: ["trainer_pokemon"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [encounterId, queryClient]);
}
