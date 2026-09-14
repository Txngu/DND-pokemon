import * as React from "react";
import { Signal, Wifi, BatteryFull } from "lucide-react";

export function useClock() {
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000 * 15);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function StatusBar({ light = false }: { light?: boolean }) {
  const now = useClock();
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      className={
        "flex items-center justify-between px-6 pt-3 text-xs font-mono " +
        (light ? "text-screen-ink" : "text-mist/90")
      }
    >
      <span className="font-semibold tracking-wide">{time}</span>
      <div className="flex items-center gap-1.5">
        <Signal className="h-3.5 w-3.5" strokeWidth={2.5} />
        <Wifi className="h-3.5 w-3.5" strokeWidth={2.5} />
        <BatteryFull className="h-3.5 w-3.5" strokeWidth={2.5} />
      </div>
    </div>
  );
}
