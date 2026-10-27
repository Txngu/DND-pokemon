import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/hooks/useProfile";
import { cardPayload, getCard, getSets, searchCards, type TcgCard, type TcgCardBrief } from "@/lib/tcgdex";
import type { TcgCardLink, TcgCollectionEntry, TcgLanguage } from "@/types/database.types";

const DAY = 24 * 60 * 60 * 1000;
export const TCG_PAGE_SIZE = 12;

// ---------------------------------------------------------------------------
// TCGdex data (cached in memory so repeat searches don't hit the API again)
// ---------------------------------------------------------------------------
export function useTcgSets(lang: TcgLanguage) {
  return useQuery({
    queryKey: ["tcg_sets", lang],
    queryFn: () => getSets(lang),
    staleTime: DAY,
    gcTime: DAY,
  });
}

function fetchCardCached(qc: QueryClient, lang: TcgLanguage, id: string) {
  return qc.fetchQuery({
    queryKey: ["tcg_card", lang, id],
    queryFn: () => getCard(lang, id),
    staleTime: DAY,
  });
}

export function useTcgCard(lang: TcgLanguage, id: string | null) {
  return useQuery({
    queryKey: ["tcg_card", lang, id],
    enabled: !!id,
    queryFn: () => getCard(lang, id!),
    staleTime: DAY,
    gcTime: DAY,
    retry: 1,
  });
}

export interface TcgSearch {
  lang: TcgLanguage;
  name: string;
  setId: string;
  number: string;
}

/** A search result: the full card when its details loaded, otherwise the brief entry. */
export type TcgResult = { brief: TcgCardBrief; card: TcgCard | null };

/**
 * Paged search (12 per page, "Load more" for the next). The list endpoint
 * only returns id/name/image, so each visible result's details are fetched
 * once and cached for a day.
 */
export function useTcgSearch(params: TcgSearch, enabled: boolean) {
  const qc = useQueryClient();
  return useInfiniteQuery({
    queryKey: ["tcg_search", params],
    enabled,
    initialPageParam: 1,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    queryFn: async ({ pageParam, signal }): Promise<TcgResult[]> => {
      const briefs = await searchCards(
        { lang: params.lang, name: params.name, setId: params.setId || undefined, number: params.number || undefined, page: pageParam, perPage: TCG_PAGE_SIZE },
        signal
      );
      return Promise.all(
        briefs.map(async (brief) => {
          try {
            return { brief, card: await fetchCardCached(qc, params.lang, brief.id) };
          } catch {
            return { brief, card: null };
          }
        })
      );
    },
    getNextPageParam: (last, all) => (last.length === TCG_PAGE_SIZE ? all.length + 1 : undefined),
  });
}

// ---------------------------------------------------------------------------
// The player's virtual collection (Supabase)
// ---------------------------------------------------------------------------
/** Own collection, or — for the Game Master — another trainer's (read-only). */
export function useTcgCollection(profileId?: string) {
  const { data: me } = useProfile();
  const owner = profileId ?? me?.id;
  return useQuery({
    queryKey: ["tcg_collection", owner],
    enabled: !!owner,
    queryFn: async (): Promise<TcgCollectionEntry[]> => {
      const { data, error } = await supabase
        .from("tcg_collection")
        .select("*")
        .eq("profile_id", owner!)
        .order("added_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useTcgLinks(profileId?: string) {
  const { data: me } = useProfile();
  const owner = profileId ?? me?.id;
  return useQuery({
    queryKey: ["tcg_links", owner],
    enabled: !!owner,
    queryFn: async (): Promise<TcgCardLink[]> => {
      const { data, error } = await supabase.from("tcg_card_links").select("*").eq("profile_id", owner!);
      if (error) throw error;
      return data;
    },
  });
}

function useTcgInvalidate() {
  const { data: me } = useProfile();
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["tcg_collection", me?.id] });
    qc.invalidateQueries({ queryKey: ["tcg_links", me?.id] });
  };
}

export function useAddTcgCard() {
  const invalidate = useTcgInvalidate();
  return useMutation({
    mutationFn: async ({ card, lang }: { card: TcgCard; lang: TcgLanguage }) => {
      const { data, error } = await supabase.rpc("tcg_add_card", { p_card: cardPayload(card), p_lang: lang });
      if (error) throw error;
      return data as TcgCollectionEntry;
    },
    onSettled: invalidate,
  });
}

export function useRemoveTcgCard() {
  const invalidate = useTcgInvalidate();
  return useMutation({
    mutationFn: async ({ id, all }: { id: string; all: boolean }) => {
      const { data, error } = await supabase.rpc("tcg_remove_card", { p_collection_id: id, p_all: all });
      if (error) throw error;
      return data;
    },
    onSettled: invalidate,
  });
}

export function useFavoriteTcgCard() {
  const invalidate = useTcgInvalidate();
  return useMutation({
    mutationFn: async ({ id, favorite }: { id: string; favorite: boolean }) => {
      const { error } = await supabase.rpc("tcg_set_favorite", { p_collection_id: id, p_favorite: favorite });
      if (error) throw error;
    },
    onSettled: invalidate,
  });
}

export function useLinkTcgCard() {
  const invalidate = useTcgInvalidate();
  return useMutation({
    mutationFn: async ({ collectionId, pokemonId }: { collectionId: string; pokemonId: string }) => {
      const { error } = await supabase.rpc("tcg_link_card", { p_collection_id: collectionId, p_pokemon_id: pokemonId });
      if (error) throw error;
    },
    onSettled: invalidate,
  });
}

export function useUnlinkTcgCard() {
  const invalidate = useTcgInvalidate();
  return useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase.rpc("tcg_unlink_card", { p_link_id: linkId });
      if (error) throw error;
    },
    onSettled: invalidate,
  });
}
