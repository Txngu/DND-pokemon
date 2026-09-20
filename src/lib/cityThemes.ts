import type { City } from "@/types/database.types";

export interface WallpaperOption {
  key: string;
  label: string;
  /** CSS `background` shorthand value - gradients only, no external image hosting required. */
  css: string;
}

export const WALLPAPER_OPTIONS: WallpaperOption[] = [
  {
    key: "default-dusk",
    label: "Default Dusk",
    css: "radial-gradient(120% 120% at 50% -10%, #3a2e63 0%, #14101f 55%, #0a0812 100%)",
  },
  {
    key: "harmonia-castle",
    label: "Harmonia Castle",
    css: "radial-gradient(140% 100% at 50% 0%, #4a72e8 0%, #23408f 45%, #0d1b3d 100%)",
  },
  {
    key: "blutenhain-bloom",
    label: "Blütenhain Bloom",
    css: "radial-gradient(140% 100% at 50% 0%, #4fd0c0 0%, #1f6e63 45%, #0c211e 100%)",
  },
  {
    key: "windcity-autumn",
    label: "Wind City Autumn",
    css: "radial-gradient(140% 100% at 50% 0%, #d9695f 0%, #7a2c26 45%, #221211 100%)",
  },
  {
    key: "crystalcity-night",
    label: "Crystal City Night",
    css: "radial-gradient(140% 100% at 50% 0%, #9d8cff 0%, #4a3d99 45%, #120f28 100%)",
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
