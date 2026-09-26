import type { City } from "@/types/database.types";

export interface WallpaperOption {
  key: string;
  label: string;
  /** CSS `background` value - layered gradients only, no external image hosting required. */
  css: string;
}

// Note: keys are stable identifiers stored in profiles.wallpaper and must
// never change once shipped, even when the visual assigned to a key is
// corrected (as happened here — see the regional theme remap in the UI
// redesign notes). Only the `css`/`label` values change.
export const WALLPAPER_OPTIONS: WallpaperOption[] = [
  {
    key: "default-dusk",
    label: "Default Dusk",
    css: "radial-gradient(120% 120% at 50% -10%, #3a2e63 0%, #14101f 55%, #0a0812 100%)",
  },
  {
    key: "harmonia-castle",
    label: "Harmonia Castle",
    css: [
      "radial-gradient(60% 40% at 50% 0%, rgba(212,175,55,0.35) 0%, transparent 70%)",
      "radial-gradient(140% 100% at 50% 0%, #4a72e8 0%, #23408f 45%, #0d1b3d 100%)",
    ].join(", "),
  },
  {
    key: "blutenhain-bloom",
    label: "Blütenhain Twilight",
    css: [
      "linear-gradient(135deg, rgba(166,28,28,0.25) 0%, transparent 45%)",
      "radial-gradient(140% 100% at 50% 0%, #7a2323 0%, #2c1010 45%, #0a0606 100%)",
    ].join(", "),
  },
  {
    key: "windcity-autumn",
    label: "Wind City Skies",
    css: [
      "radial-gradient(50% 35% at 70% 10%, rgba(255,255,255,0.25) 0%, transparent 70%)",
      "radial-gradient(140% 100% at 50% 0%, #8fd0ee 0%, #3e86b8 45%, #16324a 100%)",
    ].join(", "),
  },
  {
    key: "crystalcity-night",
    label: "Crystal City Night",
    css: [
      "radial-gradient(50% 40% at 30% 5%, rgba(201,214,255,0.3) 0%, transparent 70%)",
      "radial-gradient(140% 100% at 50% 0%, #7c8fff 0%, #3b3d99 45%, #0e0f28 100%)",
    ].join(", "),
  },
  {
    key: "volt-spark",
    label: "Volt Spark",
    css: "radial-gradient(140% 100% at 50% 0%, #ffd23f 0%, #7a5a10 45%, #1a1408 100%)",
  },
];

const byKey = new Map(WALLPAPER_OPTIONS.map((w) => [w.key, w]));

/**
 * Resolves whatever is stored in profiles.wallpaper into a CSS background.
 * A trainer's own wallpaper choice always wins; if they haven't set one,
 * falls back to their city's default. Supports either a known preset key or
 * a raw image URL an admin has set directly.
 */
export function resolveWallpaper(
  wallpaperValue: string | null | undefined,
  city: City | null | undefined
): { kind: "css" | "image"; value: string } {
  const value = wallpaperValue || city?.wallpaper_key || "default-dusk";

  if (/^https?:\/\//.test(value)) {
    return { kind: "image", value };
  }

  const preset = byKey.get(value);
  return { kind: "css", value: preset?.css ?? WALLPAPER_OPTIONS[0].css };
}
