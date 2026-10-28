import * as React from "react";
import { Plus, Swords, Users, ScrollText, Gift, History, Radio, Bookmark, CircleDot, User, Shield, Leaf } from "lucide-react";
import { adminButtonPrimary, adminButtonSecondary } from "@/components/admin/adminStyles";
import { KpEditor } from "@/components/phone/KpEditor";
import { HpBar } from "@/components/phone/HpBar";
import { SpriteImage } from "@/components/phone/SpriteImage";
import { BattleSprite } from "@/components/battle/BattleBits";
import { BattleMonitor, STATUS_STYLE } from "@/components/admin/battle/BattleMonitor";
import { EncounterEditor } from "@/components/admin/encounters/EncounterEditor";
import { CatchRequestsTab, LibraryPokemonTab, SavedEncountersTab, TeamsTab, TrainersTab } from "@/components/admin/encounters/ManagerTabs";
import { usePendingCatchCount, type TemplateWithEntries } from "@/hooks/useEncounterManager";
import { pokemonSpriteUrl } from "@/lib/sprites";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAdjustEnemyKp, useEndEncounter, useBattleParticipants, useBattleLogs, useBattleRealtime } from "@/hooks/useBattle";
import { useAdminEncounterList } from "@/hooks/useEncounter";
import type { BattleEncounter } from "@/types/database.types";

type BattleTab = "live" | "reward" | "history";
type Tab = BattleTab | "saved" | "catches" | "trainers" | "teams" | "pokemon";

const TABS: { value: Tab; label: string; icon: typeof Radio }[] = [
  { value: "live", label: "Active", icon: Radio },
  { value: "reward", label: "Needs reward", icon: Gift },
  { value: "history", label: "Completed", icon: History },
  { value: "saved", label: "Saved", icon: Bookmark },
  { value: "catches", label: "Catch requests", icon: CircleDot },
  { value: "trainers", label: "Trainers", icon: User },
  { value: "teams", label: "Teams", icon: Shield },
  { value: "pokemon", label: "Pokémon", icon: Leaf },
];

const BATTLE_TABS: Tab[] = ["live", "reward", "history"];

function tabOf(e: BattleEncounter): BattleTab {
  if (e.status === "active") return "live";
  if (e.mode === "auto" && (e.status === "completed" || e.status === "lost")) return "reward";
  return "history";
}

/**
 * Encounter Manager (PokéGear 13; the battle control room since 10.0):
 * create quick or saved encounters, run them live, hand out rewards, decide
 * catch attempts, and keep a library of trainers, teams and Pokémon.
 * Older manual ("table-top") encounters still open in their original panel.
 */
export default function AdminBattleManager() {
  const { data: encounters, isLoading } = useAdminEncounterList();
  const [tab, setTab] = React.useState<Tab>("live");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTemplate, setEditTemplate] = React.useState<TemplateWithEntries | null>(null);
  const pendingCatches = usePendingCatchCount();
  const [rewardPromptFor, setRewardPromptFor] = React.useState<string | null>(null);

  // When a live battle finishes (all enemies down, or all trainers out),
  // jump to it and pop the reward dialog — no hunting for it.
  const prevStatus = React.useRef<Map<string, BattleEncounter["status"]>>(new Map());
  React.useEffect(() => {
    if (!encounters) return;
    const prev = prevStatus.current;
    for (const e of encounters) {
      const before = prev.get(e.id);
      if (before === "active" && e.mode === "auto" && (e.status === "completed" || e.status === "lost")) {
        toast(`${e.name}: ${e.status === "completed" ? "victory!" : "defeat"} — time to hand out rewards`, "success");
        setSelectedId(e.id);
        setTab("reward");
        setRewardPromptFor(e.id);
      }
    }
    prevStatus.current = new Map(encounters.map((e) => [e.id, e.status]));
  }, [encounters]);

  const counts: Partial<Record<Tab, number>> = { live: 0, reward: 0, history: 0, catches: pendingCatches };
  for (const e of encounters ?? []) counts[tabOf(e)] = (counts[tabOf(e)] ?? 0) + 1;
  const visible = (encounters ?? []).filter((e) => tabOf(e) === tab);
  const selected = encounters?.find((e) => e.id === selectedId) ?? null;
  const clearPrompt = React.useCallback(() => setRewardPromptFor(null), []);
  const openBattle = (id: string) => {
    setCreateOpen(false);
    setEditTemplate(null);
    setTab("live");
    setSelectedId(id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-slate-50">Encounter Manager</h1>
        <button type="button" className={`${adminButtonPrimary} flex items-center gap-1.5`} onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Create encounter
        </button>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg bg-white/5 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={cn(
                "flex items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium",
                tab === t.value ? "bg-volt text-screen-ink" : "text-slate-300 hover:bg-white/5"
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
              {counts[t.value] ? (
                <span className={cn("rounded-full px-1.5 text-[10px]", tab === t.value ? "bg-screen-ink/20" : "bg-white/10")}>{counts[t.value]}</span>
              ) : null}
            </button>
          ))}
      </div>

      {tab === "saved" ? (
        <SavedEncountersTab onEdit={setEditTemplate} onStarted={openBattle} />
      ) : tab === "catches" ? (
        <CatchRequestsTab />
      ) : tab === "trainers" ? (
        <TrainersTab />
      ) : tab === "teams" ? (
        <TeamsTab />
      ) : tab === "pokemon" ? (
        <LibraryPokemonTab />
      ) : null}

      {BATTLE_TABS.includes(tab) ? (
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="space-y-3">
        <div className="space-y-2">
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-sm text-slate-500">
              {tab === "live" ? "No battles running. Start one with “New encounter”." : tab === "reward" ? "No battles waiting for rewards." : "No past battles yet."}
            </p>
          ) : (
            visible.map((enc) => {
              const st = STATUS_STYLE[enc.status];
              return (
                <button
                  key={enc.id}
                  type="button"
                  onClick={() => setSelectedId(enc.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                    selectedId === enc.id ? "border-volt/50 bg-volt/10" : "border-white/10 bg-[#111623] hover:bg-white/5"
                  )}
                >
                  <BattleSprite speciesId={enc.enemy_species_id} spriteUrl={enc.enemy_sprite_url} alt={enc.enemy_name} className="h-10 w-10 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-slate-100">{enc.name}</p>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", st.cls)}>
                        {enc.mode === "manual" && enc.status === "active" ? "Live (manual)" : st.label.split(" · ")[0]}
                      </span>
                    </div>
                    <p className="truncate text-xs text-slate-400">
                      {enc.enemy_name} · Lv{enc.level} · {enc.current_kp}/{enc.max_kp} KP
                    </p>
                    <p className="text-[10px] text-slate-500">{new Date(enc.created_at).toLocaleString()}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="min-w-0">
        {!selected ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center text-sm text-slate-500">
            <Swords className="h-6 w-6 text-slate-600" />
            Select an encounter to monitor it, or start a new one.
          </div>
        ) : selected.mode === "auto" ? (
          <BattleMonitor
            key={selected.id}
            encounterId={selected.id}
            autoOpenReward={rewardPromptFor === selected.id}
            onRewardPromptHandled={clearPrompt}
          />
        ) : (
          <ManualEncounterPanel encounter={selected} />
        )}
      </div>

      </div>
      ) : null}

      <EncounterEditor
        open={createOpen || !!editTemplate}
        template={editTemplate}
        onClose={() => {
          setCreateOpen(false);
          setEditTemplate(null);
        }}
        onStarted={openBattle}
      />
    </div>
  );
}

/** The Phase 9 manual KP tracker, unchanged in behaviour, for older encounters. */
function ManualEncounterPanel({ encounter: selected }: { encounter: BattleEncounter }) {
  const { data: participants } = useBattleParticipants(selected.id);
  const { data: logs } = useBattleLogs(selected.id);
  const adjustEnemy = useAdjustEnemyKp();
  const endEncounter = useEndEncounter();
  useBattleRealtime(selected.id);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-[#111623] p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-50">
              <Swords className="h-4 w-4 text-rotom-red-light" />
              {selected.name}
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-slate-400">manual</span>
            </h2>
            <p className="text-sm text-slate-400">
              {selected.enemy_name} · Level {selected.level}
            </p>
          </div>
          {selected.status === "active" ? (
            <button
              type="button"
              className={adminButtonSecondary}
              onClick={() => endEncounter.mutate(selected.id, { onSuccess: () => toast("Encounter ended", "success") })}
            >
              End encounter
            </button>
          ) : null}
        </div>

        <HpBar current={selected.current_kp} max={selected.max_kp} label="Enemy KP" className="mb-3" />

        {selected.status === "active" ? (
          <KpEditor
            disabled={adjustEnemy.isPending}
            onAdjust={(delta) =>
              adjustEnemy.mutate(
                { encounterId: selected.id, delta },
                { onSuccess: () => toast(delta > 0 ? `Enemy +${delta} KP` : `Enemy ${delta} KP`, "info") }
              )
            }
          />
        ) : (
          <p className="text-xs text-slate-500">This encounter has ended.</p>
        )}

        {selected.notes ? <p className="mt-3 text-xs text-slate-500">{selected.notes}</p> : null}
      </div>

      <div className="rounded-xl border border-white/10 bg-[#111623] p-5">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-100">
          <Users className="h-4 w-4" />
          Participants ({participants?.length ?? 0})
        </h3>
        {!participants || participants.length === 0 ? (
          <p className="text-xs text-slate-500">No trainers have joined this encounter yet.</p>
        ) : (
          <div className="space-y-2">
            {participants.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
                <SpriteImage src={pokemonSpriteUrl(p.pokemon.species_id)} alt={p.pokemon.species.name} className="h-8 w-8" fallbackClassName="h-8 w-8" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-100">
                    {p.pokemon.nickname || p.pokemon.species.name} <span className="text-slate-500">· {p.trainer?.username}</span>
                  </p>
                  <HpBar current={p.pokemon.current_hp} max={p.pokemon.max_hp} className="mt-1" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-[#111623] p-5">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-100">
          <ScrollText className="h-4 w-4" />
          Battle log
        </h3>
        {!logs || logs.length === 0 ? (
          <p className="text-xs text-slate-500">No KP changes logged yet.</p>
        ) : (
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {logs.map((log) => (
              <div key={log.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <span className="font-medium text-slate-100">{log.target_label}</span>{" "}
                  <span className="text-slate-400">
                    {log.delta > 0 ? "healed" : "took damage"} ({log.previous_kp} → {log.new_kp})
                  </span>
                  {log.note ? <span className="text-slate-500"> · {log.note}</span> : null}
                </div>
                <span className="shrink-0 font-mono text-[10px] text-slate-500">
                  {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
