import * as React from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface AppIconProps {
  label: string;
  to: string;
  icon: React.ReactNode;
  gradient?: string;
  className?: string;
  badgeCount?: number;
}

export function AppIcon({ label, to, icon, gradient, className, badgeCount }: AppIconProps) {
  const navigate = useNavigate();
  const [opening, setOpening] = React.useState(false);

  function handleTap() {
    if (opening) return;
    setOpening(true);
    window.setTimeout(() => navigate(to), 220);
  }

  return (
    <button
      type="button"
      onClick={handleTap}
      className={cn("flex touch-manipulation flex-col items-center gap-1.5 focus:outline-none", className)}
    >
      <motion.div
        whileTap={{ scale: 0.88 }}
        animate={opening ? { scale: [1, 0.85, 22], opacity: [1, 1, 0] } : { scale: 1, opacity: 1 }}
        transition={opening ? { duration: 0.42, times: [0, 0.25, 1], ease: "easeIn" } : { type: "spring", stiffness: 500, damping: 25 }}
        className={cn(
          "glass relative flex h-16 w-16 items-center justify-center rounded-2xl text-mist shadow-glass",
          gradient
        )}
      >
        {icon}
        {badgeCount ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rotom-red px-1 font-mono text-[10px] font-bold text-white shadow-[0_0_0_2px_rgba(18,16,34,0.8)]">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        ) : null}
      </motion.div>
      <span className="font-sans text-[11px] font-medium text-mist/85">{label}</span>
    </button>
  );
}
