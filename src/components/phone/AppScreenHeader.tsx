import { ChevronLeft } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { StatusBar } from "@/components/phone/StatusBar";

interface AppScreenHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
}

/**
 * Consistent header used by every app screen. The back arrow always
 * navigates to the Home Screen ("/"), never through browser history — that
 * keeps the Lock Screen out of the app navigation stack entirely.
 */
export function AppScreenHeader({ title, subtitle, icon }: AppScreenHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="border-b border-white/5 pb-3">
      <StatusBar />
      <div className="mt-4 flex items-center gap-3 px-4">
        <motion.button
          type="button"
          onClick={() => navigate("/")}
          whileTap={{ scale: 0.85, x: -2 }}
          transition={{ type: "spring", stiffness: 500, damping: 25 }}
          className="flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full bg-white/5 text-mist active:bg-white/10"
          aria-label="Back to home screen"
        >
          <ChevronLeft className="h-5 w-5" />
        </motion.button>
        {icon ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-volt/15 text-volt">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg font-semibold text-mist">{title}</h1>
          {subtitle ? <p className="truncate text-xs text-mist/50">{subtitle}</p> : null}
        </div>
      </div>
    </div>
  );
}
