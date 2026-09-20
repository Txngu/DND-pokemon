import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, Info } from "lucide-react";
import { useToasts, dismissToast } from "@/lib/toast";

const ICONS = {
  success: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  error: <XCircle className="h-4 w-4 text-rotom-red-light" />,
  info: <Info className="h-4 w-4 text-circuit-teal" />,
};

export function ToastViewport() {
  const toasts = useToasts();

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            type="button"
            onClick={() => dismissToast(t.id)}
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="glass pointer-events-auto flex max-w-[92%] items-center gap-2 rounded-full px-4 py-2.5 shadow-glass"
          >
            {ICONS[t.variant]}
            <span className="text-xs font-medium text-mist">{t.message}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
