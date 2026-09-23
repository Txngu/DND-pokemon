import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  AdminActivityLogEntry,
  ItemCategory,
  Profile,
  ProfileUpdate,
  RewardBatch,
  RewardKind,
  RewardRecipientMode,
  TrainerItem,
  TrainerPokemon,
} from "@/types/database.types";

const POKEMON_SELECT = "*, species:species_id(*), held_item:held_item_id(*)";
const ITEMS_SELECT = "*, item:item_id(*)";

// ---------------------------------------------------------------------------
// Dashboard stats
// ---------------------------------------------------------------------------
export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalPokemon: number;
  totalItemUnits: number;
  totalMoney: number;
  pendingTrades: number;
}

export function useAdminStats() {
  return useQuery({
    queryKey: ["admin", "stats"],
    queryFn: async (): Promise<AdminStats> => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [totalUsers, activeUsers, totalPokemon, pendingTrades, moneyRows, itemRows] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", sevenDaysAgo),
        supabase.from("trainer_pokemon").select("id", { count: "exact", head: true }),
        supabase.from("trades").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("profiles").select("money"),
        supabase.from("trainer_items").select("quantity"),
      ]);

      if (totalUsers.error) throw totalUsers.error;
      if (activeUsers.error) throw activeUsers.error;
      if (totalPokemon.error) throw totalPokemon.error;
      if (pendingTrades.error) throw pendingTrades.error;
      if (moneyRows.error) throw moneyRows.error;
      if (itemRows.error) throw itemRows.error;

      const totalMoney = (moneyRows.data ?? []).reduce((sum, r) => sum + r.money, 0);
      const totalItemUnits = (itemRows.data ?? []).reduce((sum, r) => sum + r.quantity, 0);

      return {
        totalUsers: totalUsers.count ?? 0,
        activeUsers: activeUsers.count ?? 0,
        totalPokemon: totalPokemon.count ?? 0,
        totalItemUnits,
        totalMoney,
        pendingTrades: pendingTrades.count ?? 0,
      };
    },
  });
}

export function useRecentActivity(limit = 10) {
  return useQuery({
    queryKey: ["admin", "activity", "recent", limit],
    queryFn: async (): Promise<AdminActivityLogEntry[]> => {
      const { data, error } = await supabase
        .from("admin_activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit)
        .returns<AdminActivityLogEntry[]>();
      if (error) throw error;
      return data;
    },
  });
}

export function useActivityLog() {
  return useQuery({
    queryKey: ["admin", "activity", "full"],
    queryFn: async (): Promise<AdminActivityLogEntry[]> => {
      const { data, error } = await supabase
        .from("admin_activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200)
        .returns<AdminActivityLogEntry[]>();
      if (error) throw error;
      return data;
    },
  });
}

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------
export function useAllProfiles() {
  return useQuery({
    queryKey: ["admin", "profiles"],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useAdminUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ profileId, patch }: { profileId: string; patch: ProfileUpdate }) => {
      const { error } = await supabase.from("profiles").update(patch).eq("id", profileId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "activity"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

interface EdgeFunctionResult {
  ok?: boolean;
  error?: string;
  auth_id?: string;
}

async function callAdminUsersFunction(body: Record<string, unknown>): Promise<EdgeFunctionResult> {
  const { data, error } = await supabase.functions.invoke<EdgeFunctionResult>("admin-users", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data ?? {};
}

export function useAdminCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string; username?: string }) =>
      callAdminUsersFunction({ action: "create_user", ...input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

export function useAdminDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { auth_id: string; username?: string }) =>
      callAdminUsersFunction({ action: "delete_user", ...input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

export function useAdminResetPassword() {
  return useMutation({
    mutationFn: (input: { auth_id: string; new_password: string; username?: string }) =>
      callAdminUsersFunction({ action: "reset_password", ...input }),
  });
}

export function useCreateCatalogItem() {
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
    }) => {
      const { error } = await supabase.from("items_catalog").insert({
        name: input.name,
        description: input.description || null,
        category: input.category,
        icon_emoji: input.iconEmoji || null,
        pokeapi_slug: input.pokeapiSlug || null,
        value: input.value ?? null,
        is_tradable: input.isTradable,
        is_sellable: input.isSellable,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "items_catalog"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "activity"] });
    },
  });
}

export function useAllItemsCatalog() {
  return useQuery({
    queryKey: ["admin", "items_catalog"],
    queryFn: async () => {
      const { data, error } = await supabase.from("items_catalog").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

// ---------------------------------------------------------------------------
// Per-user Pokémon / item management (admin can view/edit any profile's,
// unlike the trainer-facing hooks which are scoped to the logged-in user).
// ---------------------------------------------------------------------------
export function useProfilePokemon(profileId: string | null) {
  return useQuery({
    queryKey: ["admin", "profile_pokemon", profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<TrainerPokemon[]> => {
      const { data, error } = await supabase
        .from("trainer_pokemon")
        .select(POKEMON_SELECT)
        .eq("profile_id", profileId!)
        .returns<TrainerPokemon[]>();
      if (error) throw error;
      return data;
    },
  });
}

export function useProfileItems(profileId: string | null) {
  return useQuery({
    queryKey: ["admin", "profile_items", profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<TrainerItem[]> => {
      const { data, error } = await supabase
        .from("trainer_items")
        .select(ITEMS_SELECT)
        .eq("profile_id", profileId!)
        .gt("quantity", 0)
        .returns<TrainerItem[]>();
      if (error) throw error;
      return data;
    },
  });
}

export function useAdminRemovePokemon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pokemonId: string) => {
      const { error } = await supabase.from("trainer_pokemon").delete().eq("id", pokemonId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "profile_pokemon"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

/** Reduces (never deletes) an item stack, so the change always goes through the
 * logged UPDATE path rather than a silent DELETE. */
export function useAdminRemoveItemQuantity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ trainerItemId, newQuantity }: { trainerItemId: string; newQuantity: number }) => {
      const { error } = await supabase
        .from("trainer_items")
        .update({ quantity: Math.max(0, newQuantity) })
        .eq("id", trainerItemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "profile_items"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Rewards (money / items / Pokémon), draft-then-send. No scheduling: a batch
// is either a draft or it has been sent, immediately, by an explicit action.
// ---------------------------------------------------------------------------
export interface RecipientSelection {
  mode: RewardRecipientMode;
  profileId?: string;
  profileIds?: string[];
  cityId?: string;
}

function recipientTarget(sel: RecipientSelection): Record<string, unknown> {
  if (sel.mode === "user") return { profile_id: sel.profileId };
  if (sel.mode === "users") return { profile_ids: sel.profileIds ?? [] };
  if (sel.mode === "city") return { city_id: sel.cityId };
  return {};
}

export function useRewardBatches() {
  return useQuery({
    queryKey: ["admin", "reward_batches"],
    queryFn: async (): Promise<RewardBatch[]> => {
      const { data, error } = await supabase
        .from("reward_batches")
        .select("*")
        .order("created_at", { ascending: false })
        .returns<RewardBatch[]>();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateRewardDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      kind: RewardKind;
      message: string;
      payload: Record<string, unknown>;
      recipients: RecipientSelection;
      adminId: string;
    }) => {
      const { data, error } = await supabase
        .from("reward_batches")
        .insert({
          admin_id: input.adminId,
          kind: input.kind,
          message: input.message,
          payload: input.payload,
          recipient_mode: input.recipients.mode,
          recipient_target: recipientTarget(input.recipients),
        })
        .select()
        .single<RewardBatch>();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "reward_batches"] });
    },
  });
}

export function useSendRewardBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (batchId: string) => {
      const { data, error } = await supabase.rpc("send_admin_reward", { p_batch_id: batchId });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "reward_batches"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "activity"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "profiles"] });
    },
  });
}

/** Convenience for a one-user, one-click grant from the Users page: create + send in one step. */
export function useQuickGrant() {
  const createDraft = useCreateRewardDraft();
  const send = useSendRewardBatch();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      kind: RewardKind;
      message: string;
      payload: Record<string, unknown>;
      profileId: string;
      adminId: string;
    }) => {
      const batch = await createDraft.mutateAsync({
        kind: input.kind,
        message: input.message,
        payload: input.payload,
        recipients: { mode: "user", profileId: input.profileId },
        adminId: input.adminId,
      });
      await send.mutateAsync(batch.id);
    },
    onSuccess: (_data, input) => {
      // The two composed mutations above already invalidate the general
      // admin caches; this also refreshes the specific recipient's
      // Pokémon/item lists, which matter when this was triggered from
      // inside the Manage User modal (its lists would otherwise look stale
      // until the modal is reopened).
      queryClient.invalidateQueries({ queryKey: ["admin", "profile_pokemon", input.profileId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "profile_items", input.profileId] });
    },
  });
}
