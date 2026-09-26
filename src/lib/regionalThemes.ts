export type ThemeKey = "harmonia" | "windcity" | "blutenhain" | "crystalcity" | "default";

export interface RegionalTheme {
  key: ThemeKey;
  name: string;
  feeling: string;
  colors: {
    primary: string;
    primaryLight: string;
    secondary: string;
    glow: string;
    onPrimary: string;
  };
  /** Phone bezel gradient (top → bottom). */
  bezelGradient: string;
  /** Header decorative border gradient (left → right). */
  headerBorder: string;
  /** Radial glow used behind emblems / avatar rings. */
  emblemGlow: string;
}

export const REGIONAL_THEMES: Record<ThemeKey, RegionalTheme> = {
  harmonia: {
    key: "harmonia",
    name: "Harmonia City",
    feeling: "Noble · Prestigious · Refined",
    colors: {
      primary: "#3B5FCC",
      primaryLight: "#6E8CE8",
      secondary: "#D4AF37",
      glow: "#F0D77B",
      onPrimary: "#FFFFFF",
    },
    bezelGradient: "linear-gradient(160deg, #D4AF37 0%, #2B4FA8 22%, #172E6E 70%, #0B1638 100%)",
    headerBorder: "linear-gradient(90deg, transparent, #D4AF37 50%, transparent)",
    emblemGlow: "radial-gradient(circle, rgba(212,175,55,0.55) 0%, rgba(59,95,204,0.15) 60%, transparent 100%)",
  },
  windcity: {
    key: "windcity",
    name: "Wind City",
    feeling: "Free · Fast · Bright",
    colors: {
      primary: "#4FA8DC",
      primaryLight: "#9AD6F5",
      secondary: "#EAF6FC",
      glow: "#BFE9FB",
      onPrimary: "#0B2A3D",
    },
    bezelGradient: "linear-gradient(160deg, #EAF6FC 0%, #7FC4E8 30%, #3E86B8 68%, #1E4A66 100%)",
    headerBorder: "linear-gradient(90deg, transparent, #7FC4E8 50%, transparent)",
    emblemGlow: "radial-gradient(circle, rgba(127,196,232,0.5) 0%, rgba(79,168,220,0.15) 60%, transparent 100%)",
  },
  blutenhain: {
    key: "blutenhain",
    name: "Blütenhain",
    feeling: "Strong · Determined · Autumn",
    colors: {
      primary: "#A61C1C",
      primaryLight: "#D24545",
      secondary: "#1A1A1A",
      glow: "#F06868",
      onPrimary: "#FFFFFF",
    },
    bezelGradient: "linear-gradient(160deg, #3A2020 0%, #A61C1C 30%, #2A1414 75%, #0D0808 100%)",
    headerBorder: "linear-gradient(90deg, transparent, #A61C1C 50%, transparent)",
    emblemGlow: "radial-gradient(circle, rgba(166,28,28,0.55) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)",
  },
  crystalcity: {
    key: "crystalcity",
    name: "Crystal City",
    feeling: "Magical · Calm · Frozen elegance",
    colors: {
      primary: "#3B4FD6",
      primaryLight: "#8FA0FF",
      secondary: "#C9D6FF",
      glow: "#A6B9FF",
      onPrimary: "#FFFFFF",
    },
    bezelGradient: "linear-gradient(160deg, #C9D6FF 0%, #5A6EE0 26%, #2C3899 68%, #0E1240 100%)",
    headerBorder: "linear-gradient(90deg, transparent, #8FA0FF 50%, transparent)",
    emblemGlow: "radial-gradient(circle, rgba(143,160,255,0.55) 0%, rgba(59,79,214,0.15) 60%, transparent 100%)",
  },
  default: {
    key: "default",
    name: "PokéGear",
    feeling: "Balanced",
    colors: {
      primary: "#E4362B",
      primaryLight: "#FF6A52",
      secondary: "#FFD23F",
      glow: "#FFD23F",
      onPrimary: "#FFFFFF",
    },
    bezelGradient: "linear-gradient(160deg, #E4362B 0%, #8F1A17 100%)",
    headerBorder: "linear-gradient(90deg, transparent, #FFD23F 50%, transparent)",
    emblemGlow: "radial-gradient(circle, rgba(255,210,63,0.5) 0%, rgba(228,54,43,0.15) 60%, transparent 100%)",
  },
};

export function resolveThemeKey(cityThemeKey: string | null | undefined): ThemeKey {
  if (cityThemeKey && cityThemeKey in REGIONAL_THEMES) return cityThemeKey as ThemeKey;
  return "default";
}

export function getRegionalTheme(cityThemeKey: string | null | undefined): RegionalTheme {
  return REGIONAL_THEMES[resolveThemeKey(cityThemeKey)];
}

function hexToRgbChannels(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

/** CSS custom properties for the active theme, spread onto a root element's inline style.
 * Colors are emitted as space-separated RGB channels (e.g. "59 95 204"), not hex, so
 * Tailwind's opacity-modifier syntax (bg-volt/30, text-volt/60, ...) keeps working via
 * its `rgb(var(--x) / <alpha>)` pattern - see the `volt` color function in tailwind.config.ts. */
export function themeCssVars(theme: RegionalTheme): React.CSSProperties {
  return {
    "--theme-primary-rgb": hexToRgbChannels(theme.colors.primary),
    "--theme-primary-light-rgb": hexToRgbChannels(theme.colors.primaryLight),
    "--theme-secondary-rgb": hexToRgbChannels(theme.colors.secondary),
    "--theme-glow-rgb": hexToRgbChannels(theme.colors.glow),
    "--theme-primary": theme.colors.primary,
    "--theme-primary-light": theme.colors.primaryLight,
    "--theme-secondary": theme.colors.secondary,
    "--theme-glow": theme.colors.glow,
    "--theme-on-primary": theme.colors.onPrimary,
  } as React.CSSProperties;
}
