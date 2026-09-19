import * as React from "react";

interface PhoneLockContextValue {
  locked: boolean;
  unlock: () => void;
  lock: () => void;
}

const PhoneLockContext = React.createContext<PhoneLockContextValue | undefined>(undefined);

/**
 * Tracks whether the phone is locked, independent of which route is active.
 * Mounted once per authenticated session (see App.tsx) so that navigating
 * between apps (Home -> Bag -> back -> Home) never remounts this state and
 * never re-triggers the Lock Screen.
 */
export function PhoneLockProvider({ children }: { children: React.ReactNode }) {
  const [locked, setLocked] = React.useState(true);

  const unlock = React.useCallback(() => setLocked(false), []);
  const lock = React.useCallback(() => setLocked(true), []);

  const value = React.useMemo(() => ({ locked, unlock, lock }), [locked, unlock, lock]);

  return <PhoneLockContext.Provider value={value}>{children}</PhoneLockContext.Provider>;
}

export function usePhoneLock() {
  const ctx = React.useContext(PhoneLockContext);
  if (!ctx) throw new Error("usePhoneLock must be used within a PhoneLockProvider");
  return ctx;
}
