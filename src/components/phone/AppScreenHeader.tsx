import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { StatusBar } from "@/components/phone/StatusBar";

export function AppScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const navigate = useNavigate();

  return (
    <div className="border-b border-white/5 pb-3">
      <StatusBar />
      <div className="mt-4 flex items-center gap-3 px-4">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-mist active:scale-95"
          aria-label="Back to home screen"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="font-display text-lg font-semibold text-mist">{title}</h1>
          {subtitle ? <p className="text-xs text-mist/50">{subtitle}</p> : null}
        </div>
      </div>
    </div>
  );
}
