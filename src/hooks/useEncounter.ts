import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/hooks/useProfile";
import type {
  BattleActionResult,
  BattleEncounter,
  BattleState,
  Move,
  PartyHealResult,
  PokemonBattleProfile,
  RewardSplitMode,
  XpClaimResult,
} from "@/types/database.types";

/**
 * Hooks for admin-driven ("auto") encounters — PokéGear 10.0. Every write
 * goes through a server-side RPC; nothing here computes damage, HP, XP or
 * money itself.
 */

// ---------------------------------------------------------------------------
// Realtime helper: invalidates a set of query keys whenever any of the given
// table filters change, coalescing bursts (one battle action writes several
// rows) into a single refetch.
// ---------------------------------------------------------------------------
type RealtimeSpec = { table: string; filter?: string };

export function useRealtimeInvalidate(channelName: string | null, specs: RealtimeSpec[], keys: unknown[][]) {
  const queryClient = useQueryClient();
  const specsKey = JSON.stringify(specs);
  const keysKey = JSON.stringify(keys);
  // Several components can use the same hook at once (e.g. the Home badge
  // and the battle watcher). supabase.channel() returns the *existing*
  // channel for a repeated name, and adding listeners to an already
  // subscribed channel throws — which blanked the whole app. A per-instance
  // suffix keeps every subscription separate.
  const instanceId = React.useId();

  React.useEffect(() => {
    if (!channelName) return;
    let timer: number | undefined;
    const fire = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        for (const key of JSON.parse(keysKey) as unknown[][]) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }, 120);
    };
    let channel = supabase.channel(`${channelName}-${instanceId}`);
    for (const spec of JSON.parse(specsKey) as RealtimeSpec[]) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: spec.table, ...(spec.filter ? { filter: spec.filter } : {}) },
        fire
      );
    }
    channel.subscribe();
    return () => {
      window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [channelName, instanceId, specsKey, keysKey, queryClient]);
}

// ---------------------------------------------------------------------------
// Trainer side
// ---------------------------------------------------------------------------
export interface MyBattleRef {
  encounter_id: string;
  status: "active" | "completed" | "lost";
  name: string;
}

/** The encounter the battle screen should show for me right now, if any. */
export function useMyBattle() {
  const { data: profile } = useProfile();
  const query = useQuery({
    queryKey: ["my_battle", profile?.id],
    enabled: !!profile,
    queryFn: async (): Promise<MyBattleRef | null> => {
      const { data, error } = await supabase.rpc("get_my_battle");
      if (error) throw error;
      return (data as MyBattleRef | null) ?? null;
    },
  });

  useRealtimeInvalidate(
    profile ? `my-battle-${profile.id}` : null,
    [
      { table: "battle_players", filter: `profile_id=eq.${profile?.id}` },
      { table: "battle_encounters" },
    ],
    [["my_battle", profile?.id]]
  );

  return query;
}

export function useBattleState(encounterId: string | null) {
  const query = useQuery({
    queryKey: ["battle_state", encounterId],
    enabled: !!encounterId,
    queryFn: async (): Promise<BattleState> => {
      const { data, error } = await supabase.rpc("get_battle_state", { p_encounter_id: encounterId! });
      if (error) throw error;
      return data as BattleState;
    },
  });

  useRealtimeInvalidate(
    encounterId ? `battle-state-${encounterId}` : null,
    [
      { table: "battle_logs", filter: `encounter_id=eq.${encounterId}` },
      { table: "battle_encounters", filter: `id=eq.${encounterId}` },
      { table: "battle_enemies", filter: `encounter_id=eq.${encounterId}` },
      { table: "battle_players", filter: `encounter_id=eq.${encounterId}` },
      { table: "battle_turn_order", filter: `encounter_id=eq.${encounterId}` },
    ],
    [["battle_state", encounterId]]
  );

  return query;
}

function useInvalidateAfterBattleAction() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  return React.useCallback(
    (encounterId: string) => {
      queryClient.invalidateQueries({ queryKey: ["battle_state", encounterId] });
      queryClient.invalidateQueries({ queryKey: ["my_battle", profile?.id] });
      queryClient.invalidateQueries({ queryKey: ["trainer_pokemon", profile?.id] });
      queryClient.invalidateQueries({ queryKey: ["trainer_items", profile?.id] });
    },
    [queryClient, profile?.id]
  );
}

export type BattleAction =
  | { kind: "attack"; encounterId: string; targetEnemyId: string; damage: number }
  | { kind: "item"; encounterId: string; itemId: string; pokemonId: string }
  | { kind: "switch"; encounterId: string; pokemonId: string };

/**
 * One trainer action. Errors are handled by the caller (shown in the battle
 * message box), so this opts out of the global error toast via meta.
 */
export function useBattleAction() {
  const invalidate = useInvalidateAfterBattleAction();
  return useMutation({
    meta: { silent: true },
    mutationFn: async (action: BattleAction): Promise<BattleActionResult> => {
      const res =
        action.kind === "attack"
          ? await supabase.rpc("battle_turn_attack", {
              p_encounter_id: action.encounterId,
              p_target_enemy_id: action.targetEnemyId,
              p_damage: action.damage,
            })
          : action.kind === "item"
            ? await supabase.rpc("battle_use_item", {
                p_encounter_id: action.encounterId,
                p_item_id: action.itemId,
                p_pokemon_id: action.pokemonId,
              })
            : await supabase.rpc("battle_choose_pokemon", {
                p_encounter_id: action.encounterId,
                p_pokemon_id: action.pokemonId,
              });
      if (res.error) throw res.error;
      return res.data as BattleActionResult;
    },
    onSettled: (_data, _error, action) => invalidate(action.encounterId),
  });
}

/** A trainer submits their d20 initiative roll (also used for tie re-rolls). */
export function useSubmitInitiative() {
  const invalidate = useInvalidateAfterBattleAction();
  return useMutation({
    meta: { silent: true },
    mutationFn: async ({ encounterId, roll }: { encounterId: string; roll: number }) => {
      const { error } = await supabase.rpc("battle_submit_initiative", { p_encounter_id: encounterId, p_roll: roll });
      if (error) throw error;
    },
    onSettled: (_d, _e, v) => invalidate(v.encounterId),
  });
}

// ---------------------------------------------------------------------------
// Battle-reward XP: the trainer picks which Pokémon receives it.
// ---------------------------------------------------------------------------
export interface PendingXpReward {
  id: string;
  encounter_id: string;
  money: number;
  xp: number;
  created_at: string;
  encounter: Pick<BattleEncounter, "id" | "name" | "status"> | null;
}

export function usePendingXpRewards() {
  const { data: profile } = useProfile();
  const query = useQuery({
    queryKey: ["pending_xp_rewards", profile?.id],
    enabled: !!profile,
    queryFn: async (): Promise<PendingXpReward[]> => {
      const { data, error } = await supabase
        .from("battle_reward_recipients")
        .select("id, encounter_id, money, xp, created_at, encounter:encounter_id(id, name, status)")
        .eq("profile_id", profile!.id)
        .is("xp_claimed_at", null)
        .gt("xp", 0)
        .order("created_at")
        .returns<PendingXpReward[]>();
      if (error) throw error;
      return data;
    },
  });

  useRealtimeInvalidate(
    profile ? `pending-xp-${profile.id}` : null,
    [{ table: "battle_reward_recipients", filter: `profile_id=eq.${profile?.id}` }],
    [["pending_xp_rewards", profile?.id], ["profile"], ["notifications", profile?.id], ["my_battle", profile?.id]]
  );

  return query;
}

export function useClaimBattleXp() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ recipientId, pokemonId }: { recipientId: string; pokemonId: string }) => {
      const { data, error } = await supabase.rpc("claim_battle_xp", { p_recipient_id: recipientId, p_pokemon_id: pokemonId });
      if (error) throw error;
      return data as XpClaimResult;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["pending_xp_rewards", profile?.id] });
      queryClient.invalidateQueries({ queryKey: ["trainer_pokemon", profile?.id] });
      queryClient.invalidateQueries({ queryKey: ["notifications", profile?.id] });
    },
  });
}

// ---------------------------------------------------------------------------
// Pokémon Center
// ---------------------------------------------------------------------------
export function useHealParty() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pokemonIds: string[] | null) => {
      const { data, error } = await supabase.rpc("heal_party", { p_pokemon_ids: pokemonIds });
      if (error) throw error;
      return data as PartyHealResult[];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainer_pokemon", profile?.id] });
    },
  });
}

export function usePokemonBattleProfile(pokemonId: string | undefined) {
  return useQuery({
    queryKey: ["pokemon_battle_profile", pokemonId],
    enabled: !!pokemonId,
    queryFn: async (): Promise<PokemonBattleProfile> => {
      const { data, error } = await supabase.rpc("pokemon_battle_profile", { p_pokemon_id: pokemonId! });
      if (error) throw error;
      return data as PokemonBattleProfile;
    },
  });
}

// ---------------------------------------------------------------------------
// Game Master
// ---------------------------------------------------------------------------
export function useMoves() {
  return useQuery({
    queryKey: ["moves"],
    staleTime: Infinity,
    queryFn: async (): Promise<Move[]> => {
      const { data, error } = await supabase.from("moves").select("*").order("type").order("power");
      if (error) throw error;
      return data;
    },
  });
}

export async function fetchSuggestedMoves(type1: string, type2: string | null, level: number): Promise<Move[]> {
  const { data, error } = await supabase.rpc("suggest_moves", { p_type1: type1, p_type2: type2, p_level: level });
  if (error) throw error;
  return (data ?? []) as Move[];
}

export function useAdminEncounterList() {
  const query = useQuery({
    queryKey: ["admin", "encounters"],
    queryFn: async (): Promise<BattleEncounter[]> => {
      const { data, error } = await supabase
        .from("battle_encounters")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200)
        .returns<BattleEncounter[]>();
      if (error) throw error;
      return data;
    },
  });
  useRealtimeInvalidate("admin-encounter-list", [{ table: "battle_encounters" }], [["admin", "encounters"]]);
  return query;
}

/** Number of auto encounters that finished and are waiting for the GM's reward. */
export function useBattlesAwaitingReward() {
  const { data } = useAdminEncounterList();
  return (data ?? []).filter((e) => e.mode === "auto" && (e.status === "completed" || e.status === "lost"));
}

function useAdminBattleMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "encounters"] });
      queryClient.invalidateQueries({ queryKey: ["battle_state"] });
    },
  });
}

export interface EnemyDraftPayload {
  species_id: number | null;
  name: string;
  level: number;
  max_hp: number;
  current_hp: number;
}

export function useAdminCreateBattle() {
  return useAdminBattleMutation(
    async (input: {
      name: string;
      description: string;
      playerIds: string[];
      enemies: EnemyDraftPayload[];
    }) => {
      const { data, error } = await supabase.rpc("admin_create_battle", {
        p_name: input.name,
        p_description: input.description || null,
        p_player_ids: input.playerIds,
        p_enemies: input.enemies,
        // Types come from the species; no automatic enemy attacks (PokéGear 12.1 turns).
        p_enemy_auto_attack: false,
        p_enemy_damage_scale: 1,
      });
      if (error) throw error;
      return data as string;
    }
  );
}

export function useAdminAddBattlePlayers() {
  return useAdminBattleMutation(async ({ encounterId, playerIds }: { encounterId: string; playerIds: string[] }) => {
    const { data, error } = await supabase.rpc("admin_add_battle_players", { p_encounter_id: encounterId, p_player_ids: playerIds });
    if (error) throw error;
    return data as number;
  });
}

export function useAdminAdjustEnemyHp() {
  return useAdminBattleMutation(async ({ enemyId, delta }: { enemyId: string; delta: number }) => {
    const { data, error } = await supabase.rpc("admin_adjust_enemy_hp", { p_enemy_id: enemyId, p_delta: delta });
    if (error) throw error;
    return data as BattleActionResult;
  });
}

/** The enemy whose turn it is attacks: the GM picks the target and types the damage (0 = missed). */
export function useAdminEnemyTurnAttack() {
  return useAdminBattleMutation(
    async ({ encounterId, targetPokemonId, damage }: { encounterId: string; targetPokemonId: string; damage: number }) => {
      const { data, error } = await supabase.rpc("admin_enemy_turn_attack", {
        p_encounter_id: encounterId,
        p_target_pokemon_id: targetPokemonId,
        p_damage: damage,
      });
      if (error) throw error;
      return data as BattleActionResult;
    }
  );
}

export function useAdminSkipTurn() {
  return useAdminBattleMutation(async ({ encounterId }: { encounterId: string }) => {
    const { error } = await supabase.rpc("admin_skip_turn", { p_encounter_id: encounterId });
    if (error) throw error;
  });
}

/** GM: enter an enemy's d20 roll, or enter/correct a trainer's roll during initiative. */
export function useAdminSetInitiative() {
  return useAdminBattleMutation(async ({ entryId, roll }: { entryId: string; roll: number }) => {
    const { error } = await supabase.rpc("admin_set_initiative", { p_entry_id: entryId, p_roll: roll });
    if (error) throw error;
  });
}

export function useAdminSetBattleStatus() {
  return useAdminBattleMutation(async ({ encounterId, status }: { encounterId: string; status: "completed" | "lost" | "ended" }) => {
    const { error } = await supabase.rpc("admin_set_battle_status", { p_encounter_id: encounterId, p_status: status });
    if (error) throw error;
  });
}

export interface RewardLine {
  profile_id: string;
  money: number;
  xp: number;
}

export function useGiveBattleRewards() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      encounterId: string;
      moneyMode: RewardSplitMode;
      moneyValue: number;
      xpMode: RewardSplitMode;
      xpValue: number;
      custom: RewardLine[] | null;
      expected: RewardLine[];
    }) => {
      const { data, error } = await supabase.rpc("admin_give_battle_rewards", {
        p_encounter_id: input.encounterId,
        p_money_mode: input.moneyMode,
        p_money_value: input.moneyValue,
        p_xp_mode: input.xpMode,
        p_xp_value: input.xpValue,
        p_custom: input.custom,
        p_expected: input.expected,
      });
      if (error) throw error;
      return data as { total_money: number; total_xp: number; distribution: RewardLine[] };
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "encounters"] });
      queryClient.invalidateQueries({ queryKey: ["battle_state"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "profiles"] });
    },
  });
}

export function useAdminSetPokemonBattleSetup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pokemonId,
      moveIds,
      bonus,
    }: {
      pokemonId: string;
      moveIds: number[] | null;
      bonus: PokemonBattleProfile["bonus"] | null;
    }) => {
      const { data, error } = await supabase.rpc("admin_set_pokemon_battle_setup", {
        p_pokemon_id: pokemonId,
        p_move_ids: moveIds,
        p_bonus: bonus,
      });
      if (error) throw error;
      return data as PokemonBattleProfile;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["pokemon_battle_profile", vars.pokemonId] });
    },
  });
}
