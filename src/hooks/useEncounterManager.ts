import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useRealtimeInvalidate } from "@/hooks/useEncounter";
import type {
  CatchAttempt,
  EncounterEntry,
  EncounterKind,
  EncounterTemplate,
  EncounterTemplateEntryRow,
  GmPokemon,
  GmTeam,
  GmTrainer,
} from "@/types/database.types";

/**
 * PokéGear 13 — the Game Master's Encounter Manager: library (Pokémon,
 * trainers, teams), saved encounters, and catch requests. All tables are
 * Game-Master-only (RLS); starting battles and deciding catches go through
 * server functions.
 */

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------
export interface GmTeamWithMembers extends GmTeam {
  members: { gm_pokemon_id: string; position: number }[];
}

export function useGmTrainers() {
  return useQuery({
    queryKey: ["admin", "gm_trainers"],
    queryFn: async (): Promise<GmTrainer[]> => {
      const { data, error } = await supabase.from("gm_trainers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useGmPokemon() {
  return useQuery({
    queryKey: ["admin", "gm_pokemon"],
    queryFn: async (): Promise<GmPokemon[]> => {
      // Fetched in pages so a big library (1000+) is never cut off.
      const all: GmPokemon[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("gm_pokemon").select("*").order("created_at").range(from, from + 999);
        if (error) throw error;
        all.push(...data);
        if (data.length < 1000) break;
      }
      return all;
    },
  });
}

export function useGmTeams() {
  return useQuery({
    queryKey: ["admin", "gm_teams"],
    queryFn: async (): Promise<GmTeamWithMembers[]> => {
      const [{ data: teams, error }, { data: members, error: mErr }] = await Promise.all([
        supabase.from("gm_teams").select("*").order("name"),
        supabase.from("gm_team_members").select("*").order("position"),
      ]);
      if (error) throw error;
      if (mErr) throw mErr;
      return teams.map((t) => ({
        ...t,
        members: members.filter((m) => m.team_id === t.id).map((m) => ({ gm_pokemon_id: m.gm_pokemon_id, position: m.position })),
      }));
    },
  });
}

function useLibraryMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["admin", "gm_trainers"] });
      qc.invalidateQueries({ queryKey: ["admin", "gm_pokemon"] });
      qc.invalidateQueries({ queryKey: ["admin", "gm_teams"] });
      qc.invalidateQueries({ queryKey: ["admin", "encounter_templates"] });
    },
  });
}

export type GmTrainerInput = Pick<GmTrainer, "name" | "description" | "species_id" | "sprite_url" | "is_active">;

export function useSaveGmTrainer() {
  return useLibraryMutation(async ({ id, values }: { id: string | null; values: GmTrainerInput }) => {
    const res = id
      ? await supabase.from("gm_trainers").update(values).eq("id", id).select().single()
      : await supabase.from("gm_trainers").insert(values).select().single();
    if (res.error) throw res.error;
    return res.data as GmTrainer;
  });
}

export type GmPokemonInput = Pick<GmPokemon, "species_id" | "name" | "level" | "max_hp" | "current_hp" | "status" | "trainer_id" | "notes">;

export function useSaveGmPokemon() {
  return useLibraryMutation(async ({ id, values, copies = 1 }: { id: string | null; values: GmPokemonInput; copies?: number }) => {
    if (id) {
      const { data, error } = await supabase.from("gm_pokemon").update(values).eq("id", id).select().single();
      if (error) throw error;
      return [data as GmPokemon];
    }
    const rows = Array.from({ length: Math.max(1, Math.min(50, copies)) }, () => values);
    const { data, error } = await supabase.from("gm_pokemon").insert(rows).select();
    if (error) throw error;
    return data as GmPokemon[];
  });
}

export type GmTeamInput = Pick<GmTeam, "name" | "description" | "trainer_id">;

/** Saves a team and replaces its member list (in order). */
export function useSaveGmTeam() {
  return useLibraryMutation(async ({ id, values, memberIds }: { id: string | null; values: GmTeamInput; memberIds: string[] }) => {
    const res = id
      ? await supabase.from("gm_teams").update(values).eq("id", id).select().single()
      : await supabase.from("gm_teams").insert(values).select().single();
    if (res.error) throw res.error;
    const team = res.data as GmTeam;
    const del = await supabase.from("gm_team_members").delete().eq("team_id", team.id);
    if (del.error) throw del.error;
    if (memberIds.length) {
      const ins = await supabase
        .from("gm_team_members")
        .insert(memberIds.map((pid, i) => ({ team_id: team.id, gm_pokemon_id: pid, position: i + 1 })));
      if (ins.error) throw ins.error;
    }
    return team;
  });
}

export function useDeleteLibraryItem() {
  return useLibraryMutation(async ({ table, id }: { table: "gm_trainers" | "gm_pokemon" | "gm_teams"; id: string }) => {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw error;
  });
}

// ---------------------------------------------------------------------------
// Saved encounters
// ---------------------------------------------------------------------------
export interface TemplateWithEntries extends EncounterTemplate {
  entries: EncounterTemplateEntryRow[];
}

export function useEncounterTemplates() {
  return useQuery({
    queryKey: ["admin", "encounter_templates"],
    queryFn: async (): Promise<TemplateWithEntries[]> => {
      const [{ data: templates, error }, { data: entries, error: eErr }] = await Promise.all([
        supabase.from("encounter_templates").select("*").order("updated_at", { ascending: false }),
        supabase.from("encounter_template_entries").select("*").order("position"),
      ]);
      if (error) throw error;
      if (eErr) throw eErr;
      return templates.map((t) => ({ ...t, entries: entries.filter((e) => e.template_id === t.id) }));
    },
  });
}

export function entriesFromRows(rows: EncounterTemplateEntryRow[]): EncounterEntry[] {
  return rows.map((r): EncounterEntry => {
    switch (r.entry_kind) {
      case "trainer":
        return { kind: "trainer", trainer_id: r.trainer_id!, team_id: r.team_id };
      case "team":
        return { kind: "team", team_id: r.team_id! };
      case "pokemon":
        return { kind: "pokemon", gm_pokemon_id: r.gm_pokemon_id! };
      default:
        return { kind: "wild", species_id: r.species_id, name: r.name, level: r.level ?? 1, max_hp: r.max_hp ?? 1, quantity: r.quantity };
    }
  });
}

export interface EncounterDraft {
  name: string;
  description: string;
  kind: EncounterKind;
  catchingAllowed: boolean;
  playerIds: string[];
  entries: EncounterEntry[];
}

export function useSaveEncounterTemplate() {
  return useLibraryMutation(async ({ id, draft }: { id: string | null; draft: EncounterDraft }) => {
    const { data, error } = await supabase.rpc("admin_save_encounter_template", {
      p_template_id: id,
      p_name: draft.name,
      p_description: draft.description || null,
      p_kind: draft.kind,
      p_catching_allowed: draft.catchingAllowed,
      p_default_player_ids: draft.playerIds,
      p_entries: draft.entries,
    });
    if (error) throw error;
    return data as string;
  });
}

export function useDuplicateEncounterTemplate() {
  return useLibraryMutation(async ({ id }: { id: string }) => {
    const { data, error } = await supabase.rpc("admin_duplicate_encounter_template", { p_template_id: id });
    if (error) throw error;
    return data as string;
  });
}

export function useDeleteEncounterTemplate() {
  return useLibraryMutation(async ({ id }: { id: string }) => {
    // Templates are deleted through RLS (GM only); battles started from it keep everything.
    const { error } = await supabase.from("encounter_templates").delete().eq("id", id);
    if (error) throw error;
  });
}

/** Start a battle: from a saved encounter (templateId) or a quick one (entries). */
export function useStartEncounter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      templateId: string | null;
      name?: string | null;
      description?: string | null;
      kind?: EncounterKind | null;
      catchingAllowed?: boolean | null;
      playerIds: string[];
      entries?: EncounterEntry[] | null;
    }) => {
      const { data, error } = await supabase.rpc("admin_start_encounter", {
        p_template_id: input.templateId,
        p_name: input.name ?? null,
        p_description: input.description ?? null,
        p_kind: input.kind ?? null,
        p_catching_allowed: input.catchingAllowed ?? null,
        p_player_ids: input.playerIds,
        p_entries: input.entries ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["admin", "encounters"] });
      qc.invalidateQueries({ queryKey: ["admin", "encounter_templates"] });
      qc.invalidateQueries({ queryKey: ["admin", "busy_players"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Catch requests (all encounters)
// ---------------------------------------------------------------------------
export interface CatchRequestRow extends CatchAttempt {
  player: { username: string } | null;
  encounter: { name: string; status: string } | null;
}

export function useCatchRequests() {
  const query = useQuery({
    queryKey: ["admin", "catch_attempts"],
    queryFn: async (): Promise<CatchRequestRow[]> => {
      const { data, error } = await supabase
        .from("catch_attempts")
        .select("*, player:profile_id(username), encounter:encounter_id(name, status)")
        .order("created_at", { ascending: false })
        .limit(500)
        .returns<CatchRequestRow[]>();
      if (error) throw error;
      return data;
    },
  });
  useRealtimeInvalidate("admin-catch-attempts", [{ table: "catch_attempts" }], [["admin", "catch_attempts"]]);
  return query;
}

export function usePendingCatchCount() {
  const { data } = useCatchRequests();
  return (data ?? []).filter((c) => c.status === "pending").length;
}
