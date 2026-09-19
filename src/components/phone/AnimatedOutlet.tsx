import { AnimatePresence, motion } from "framer-motion";
import { Outlet, useLocation } from "react-router-dom";
import type { Profile } from "@/types/database.types";

export function AnimatedOutlet({ profile }: { profile: Profile }) {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="flex h-full flex-col"
      >
        <Outlet context={{ profile }} />
      </motion.div>
    </AnimatePresence>
  );
}
