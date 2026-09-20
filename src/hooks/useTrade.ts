import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/hooks/useProfile";
import type {
  TradeDetail,
  TradeListEntry,
  TradeOfferSide,
  TradeRow,
  TrainerDirectoryEntry,
  TrainerPokemon,
} from "@/types/database.types";

const POKEMON_SELECT = "*, species:species_id(*), held_item:held_item_id(*)";

function invalidateTrades(queryClient: ReturnType<typeof useQueryClient>, profileId?: string) {
  queryClient.invalidateQueries({ queryKey: ["trades"] });
  queryClient.invalidateQueries({ queryKey: ["notifications", profileId] });
  queryClient.invalidateQueries({ queryKey: ["trainer_pokemon", profileId] });
  queryClient.invalidateQueries({ queryKey: ["trainer_items", profileId] });
  queryClient.invalidateQueries({ queryKey: ["profile", profileId] });
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
export function useTrainerSearch(query: string, excludeProfileId?: string) {
  return useQuery({
    queryKey: ["trainer_search", query],
    enabled: query.trim().length >= 2,
    queryFn: async (): Promise<TrainerDirectoryEntry[]> => {
      const q = query.trim();
      const { data, error } = await supabase
        .from("trainer_directory")
        .select("*")
        .or(`username.ilike.%${q}%,trainer_id.eq.${q}`)
        .limit(10)
        .returns<TrainerDirectoryEntry[]>();
      if (error) throw error;
      return excludeProfileId ? data.filter((d) => d.profile_id !== excludeProfileId) : data;
    },
  });
}

// ---------------------------------------------------------------------------
// List / detail
// ---------------------------------------------------------------------------
export function useMyTrades() {
  const { data: profile } = useProfile();

  return useQuery({
    queryKey: ["trades", "mine", profile?.id],
    enabled: !!profile,
    queryFn: async (): Promise<TradeListEntry[]> => {
      const { data, error } = await supabase
        .from("trades")
        .select("*")
        .or(`initiator_id.eq.${profile!.id},recipient_id.eq.${profile!.id}`)
        .order("updated_at", { ascending: false })
        .returns<TradeRow[]>();
      if (error) throw error;

      const otherIds = Array.from(
        new Set(data.map((t) => (t.initiator_id === profile!.id ? t.recipient_id : t.initiator_id)))
      );
      if (otherIds.length === 0) return [];

      const { data: others, error: othersError } = await supabase
        .from("trainer_directory")
        .select("*")
        .in("profile_id", otherIds)
        .returns<TrainerDirectoryEntry[]>();
      if (othersError) throw othersError;
      const byId = new Map(others.map((o) => [o.profile_id, o]));

      return data.map((t) => {
        const isInitiator = t.initiator_id === profile!.id;
        const otherId = isInitiator ? t.recipient_id : t.initiator_id;
        return { ...t, isInitiator, otherTrainer: byId.get(otherId)! };
      });
    },
  });
}

export function useTradeDetail(tradeId: string | null) {
  return useQuery({
    queryKey: ["trades", "detail", tradeId],
    enabled: !!tradeId,
    queryFn: async (): Promise<TradeDetail> => {
      const { data: trade, error } = await supabase
        .from("trades")
        .select("*")
        .eq("id", tradeId!)
        .single<TradeRow>();
      if (error) throw error;

      const [{ data: profiles, error: profilesError }, { data: pokemon, error: pokemonError }, { data: items, error: itemsError }] =
        await Promise.all([
          supabase
            .from("trainer_directory")
            .select("*")
            .in("profile_id", [trade.initiator_id, trade.recipient_id])
            .returns<TrainerDirectoryEntry[]>(),
          supabase
            .from("trade_pokemon")
            .select(`profile_id, pokemon:pokemon_id(${POKEMON_SELECT})`)
            .eq("trade_id", tradeId!),
          supabase
            .from("trade_items")
            .select("*, item:item_id(*)")
            .eq("trade_id", tradeId!),
        ]);
      if (profilesError) throw profilesError;
      if (pokemonError) throw pokemonError;
      if (itemsError) throw itemsError;

      const profileById = new Map(profiles.map((p) => [p.profile_id, p]));
      type PokemonRow = { profile_id: string; pokemon: TrainerPokemon };
      const pokemonRows = (pokemon ?? []) as unknown as PokemonRow[];
      type ItemRow = TradeDetail["initiator"]["items"][number] & { profile_id: string };
      const itemRows = (items ?? []) as unknown as ItemRow[];

      function buildSide(profileId: string, money: number, confirmed: boolean): TradeOfferSide {
        return {
          profile: profileById.get(profileId)!,
          money,
          confirmed,
          pokemon: pokemonRows.filter((r) => r.profile_id === profileId).map((r) => r.pokemon),
          items: itemRows.filter((r) => r.profile_id === profileId),
        };
      }

      return {
        ...trade,
        initiator: buildSide(trade.initiator_id, trade.initiator_money, trade.initiator_confirmed),
        recipient: buildSide(trade.recipient_id, trade.recipient_money, trade.recipient_confirmed),
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations - every write goes through an RPC; there is no direct table
// write path for trades (see the Phase 6 migration for why).
// ---------------------------------------------------------------------------
export function useSendTradeRequest() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (recipientProfileId: string) => {
      const { data, error } = await supabase.rpc("send_trade_request", {
        p_recipient_profile_id: recipientProfileId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateTrades(queryClient, profile?.id),
  });
}

export function useRespondTradeRequest() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ tradeId, accept }: { tradeId: string; accept: boolean }) => {
      const { error } = await supabase.rpc("respond_trade_request", { p_trade_id: tradeId, p_accept: accept });
      if (error) throw error;
    },
    onSuccess: () => invalidateTrades(queryClient, profile?.id),
  });
}

export function useCancelTrade() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tradeId: string) => {
      const { error } = await supabase.rpc("cancel_trade", { p_trade_id: tradeId });
      if (error) throw error;
    },
    onSuccess: () => invalidateTrades(queryClient, profile?.id),
  });
}

export function useSetTradeOffer() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      tradeId,
      pokemonIds,
      items,
      money,
    }: {
      tradeId: string;
      pokemonIds: string[];
      items: { item_id: string; quantity: number }[];
      money: number;
    }) => {
      const { error } = await supabase.rpc("set_trade_offer", {
        p_trade_id: tradeId,
        p_pokemon_ids: pokemonIds,
        p_items: items,
        p_money: money,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateTrades(queryClient, profile?.id),
  });
}

export function useConfirmTrade() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tradeId: string) => {
      const { error } = await supabase.rpc("confirm_trade", { p_trade_id: tradeId });
      if (error) throw error;
    },
    onSuccess: () => invalidateTrades(queryClient, profile?.id),
  });
}
