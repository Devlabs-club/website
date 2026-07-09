/** DevLabs landing page design tokens — matches src/pages/index.astro + LandingMarketingStyles */
export const brand = {
  cream: "#fbf6f3",
  creamPanel: "#f4f1ed",
  creamCard: "#fffaf7",
  orangeTint: "#fff5ef",
  black: "#050505",
  blackSoft: "rgba(5,5,5,0.45)",
  blackMuted: "rgba(5,5,5,0.62)",
  orange: "#ff7417",
  orangeDark: "#bf4f08",
  orangeGlow: "rgba(255,116,23,0.22)",
  blue: "#168df7",
  blueTint: "#cfe6e9",
  buttonDark: "#2f3432",
  buttonBorder: "#1f2422",
  darkAct: "#0d0a09",
  darkWarm: "#1a0f0a",
  white: "#ffffff",
  border: "rgba(5,5,5,0.10)",
  borderStrong: "rgba(5,5,5,0.15)",
  green: "#1f8a4c",
  amber: "#c47a12",
} as const;

export const type = {
  /** Landing body — Manrope */
  sans: "Manrope",
  /** Editorial display — PP Gatwick (landing hero weight mix) */
  display: "PP Gatwick",
} as const;

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

/** Faster ~55s cut — 2–4s beats, kinetic typography rhythm */
export const scenes = {
  coldOpen: { duration: 180 }, // 6s
  enemy: { duration: 180 }, // 6s
  turn: { duration: 120 }, // 4s
  agent: { duration: 240 }, // 8s
  proof: { duration: 210 }, // 7s
  trials: { duration: 180 }, // 6s
  os: { duration: 180 }, // 6s
  secret: { duration: 210 }, // 7s
  close: { duration: 150 }, // 5s
} as const;

export const TOTAL_FRAMES = Object.values(scenes).reduce(
  (sum, s) => sum + s.duration,
  0,
); // 1650 = 55s

/** Beat map for music sync (seconds) */
export const beatMap = [
  { t: 0, label: "intro pulse" },
  { t: 6, label: "scene 1 hit — ENGINEER strike" },
  { t: 12, label: "enemy grid drop" },
  { t: 18, label: "orange wipe / DevLabs reveal" },
  { t: 22, label: "beat drop — Founder Agent" },
  { t: 30, label: "cards rank snap" },
  { t: 36, label: "proof dissolve" },
  { t: 43, label: "trial generate click" },
  { t: 49, label: "pipeline glide" },
  { t: 52, label: "dark act / iMessage" },
  { t: 55, label: "final CTA resolve" },
] as const;
