import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { Swords } from "lucide-react";
import { useMyBattle } from "@/hooks/useEncounter";

const SEEN_KEY = "pokegear-seen-battles";

function readSeen(): string[] {
  try {
    return JSON.parse(window.sessionStorage.getItem(SEEN_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function markSeen(id: string) {
  try {
    const seen = readSeen();
    if (!seen.includes(id)) window.sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen, id].slice(-20)));
  } catch {
    // storage unavailable: the battle just opens again next time, harmless
  }
}

/**
 * Lives in the phone shell. When the Game Master puts this trainer into a
 * new encounter, a short "Encounter!" splash plays and the Battle screen
 * opens by itself. If the trainer minimizes the battle, a pill at the top
 * of every screen leads back to it. State comes from the database, so a
 * refresh never loses the battle.
 */
export function BattleWatcher() {
  const { data: battle } = useMyBattle();
  const location = useLocation();
  const navigate = useNavigate();
  const [splash, setSplash] = React.useState<string | null>(null);

  const onBattleScreen = location.pathname === "/battle";

  React.useEffect(() => {
    if (!battle || battle.status !== "active") return;
    if (readSeen().includes(battle.encounter_id)) return;
    markSeen(battle.encounter_id);
    if (onBattleScreen) return;
    setSplash(battle.name);
    const t = window.setTimeout(() => {
      setSplash(null);
      navigate("/battle");
    }, 1700);
    return () => window.clearTimeout(t);
  }, [battle, onBattleScreen, navigate]);

  return (
    <>
      <AnimatePresence>
        {splash ? (
          <motion.div
            className="absolute inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden bg-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* the classic "screen shatters into stripes" encounter wipe */}
            {Array.from({ length: 8 }).map((_, i) => (
              <motion.div
                key={i}
                className="absolute left-0 h-[12.5%] w-full bg-white"
                style={{ top: `${i * 12.5}%` }}
                initial={{ x: i % 2 ? "-100%" : "100%" }}
                animate={{ x: i % 2 ? ["-100%", "0%", "100%"] : ["100%", "0%", "-100%"] }}
                transition={{ duration: 0.9, delay: i * 0.04, times: [0, 0.45, 1] }}
              />
            ))}
            <motion.div
              className="relative z-10 flex flex-col items-center gap-3"
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: [0.3, 1.15, 1], opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.5 }}
            >
              <Swords className="h-12 w-12 text-volt drop-shadow-[0_0_20px_rgba(255,210,63,0.7)]" />
              <p className="font-display text-3xl font-black uppercase tracking-wider text-mist">Encounter!</p>
              <p className="text-sm text-mist/60">{splash}</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {battle && !onBattleScreen && !splash ? (
          <motion.button
            type="button"
            onClick={() => navigate("/battle")}
            className="absolute left-1/2 top-9 z-[55] flex -translate-x-1/2 touch-manipulation items-center gap-2 rounded-full bg-rotom-red px-4 py-1.5 text-xs font-semibold text-white shadow-glass ring-1 ring-white/20"
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -30, opacity: 0 }}
          >
            <span className={battle.status === "active" ? "h-2 w-2 animate-pulse rounded-full bg-white" : "h-2 w-2 rounded-full bg-volt"} />
            {battle.status === "active" ? "Battle in progress — tap to return" : "Battle finished — view results"}
          </motion.button>
        ) : null}
      </AnimatePresence>
    </>
  );
}
