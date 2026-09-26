import * as React from "react";
import { getRegionalTheme, type RegionalTheme } from "@/lib/regionalThemes";

const RegionalThemeContext = React.createContext<RegionalTheme | null>(null);

export function RegionalThemeProvider({
  cityThemeKey,
  children,
}: {
  cityThemeKey: string | null | undefined;
  children: React.ReactNode;
}) {
  const theme = React.useMemo(() => getRegionalTheme(cityThemeKey), [cityThemeKey]);
  return <RegionalThemeContext.Provider value={theme}>{children}</RegionalThemeContext.Provider>;
}

export function useRegionalTheme(): RegionalTheme {
  const theme = React.useContext(RegionalThemeContext);
  if (!theme) throw new Error("useRegionalTheme must be used within a RegionalThemeProvider");
  return theme;
}
