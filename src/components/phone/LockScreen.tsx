import { motion, useAnimation, type PanInfo } from "framer-motion";
import { ChevronUp } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useClock } from "@/components/phone/StatusBar";
import { useRegionalTheme } from "@/hooks/useRegionalTheme";
import { RegionalEmblem } from "@/components/theme/Emblems";

interface LockScreenProps {
  avatar?: string | null;
  username: string;
  onUnlock: () => void;
}

export function LockScreen({ avatar, username, onUnlock }: LockScreenProps) {
  const now = useClock();
  const controls = useAnimation();
  const theme = useRegionalTheme();
  const initials = username.slice(0, 2).toUpperCase();

  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  async function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y < -80 || info.velocity.y < -400) {
      await controls.start({ y: "-100%", opacity: 0, transition: { duration: 0.35, ease: "easeIn" } });
      onUnlock();
    } else {
      controls.start({ y: 0, opacity: 1, transition: { type: "spring", stiffness: 400, damping: 30 } });
    }
  }

  return (
    <motion.div
      drag="y"
      dragConstraints={{ top: -300, bottom: 0 }}
      dragElastic={0.15}
      onDragEnd={handleDragEnd}
      animate={controls}
      className="relative z-10 flex h-full w-full flex-col items-center justify-between py-10 select-none"
    >
      {/* Regional city emblem, faint, top of the lock screen */}
      <div className="flex flex-col items-center gap-3 pt-4">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-full"
          style={{ background: theme.emblemGlow }}
        >
          <RegionalEmblem themeKey={theme.key} className="h-6 w-6" style={{ color: theme.colors.secondary }} />
        </div>

        {/* Glass panel behind the clock for legibility over any wallpaper */}
        <div className="glass-premium mt-2 flex flex-col items-center gap-1 rounded-3xl px-8 py-5">
          <span className="font-display text-6xl font-semibold tracking-tight text-mist text-glow">{time}</span>
          <span className="font-sans text-sm text-mist/70">{date}</span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <Avatar className="h-16 w-16 theme-glow-ring">
          {avatar ? <AvatarImage src={avatar} alt={username} /> : null}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <span className="font-display text-base font-medium text-mist">{username}</span>

        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
          className="mt-4 flex flex-col items-center text-mist/60"
        >
          <ChevronUp className="h-5 w-5" />
          <span className="text-[11px] font-mono uppercase tracking-widest">Swipe up to unlock</span>
        </motion.div>
      </div>
    </motion.div>
  );
}
