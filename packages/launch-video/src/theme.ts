export const colors = {
  cream: "#fbf6f3",
  creamDark: "#f3ebe4",
  black: "#111111",
  ink: "#1a1a1a",
  muted: "#6b6560",
  orange: "#ff7417",
  orangeSoft: "#ff9a4d",
  green: "#1f8a4c",
  amber: "#c47a12",
  grey: "#d9d2cb",
  greyDark: "#9a9188",
  white: "#ffffff",
  card: "#ffffff",
} as const;

export const fonts = {
  display:
    '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
  sans: '"Avenir Next", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
  mono: '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
} as const;

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

/** Scene lengths in frames @ 30fps — ~75s total */
export const scenes = {
  coldOpen: { start: 0, duration: 210 }, // 0:00–0:07
  enemy: { start: 210, duration: 240 }, // 0:07–0:15
  turn: { start: 450, duration: 150 }, // 0:15–0:20
  agent: { start: 600, duration: 330 }, // 0:20–0:31
  proof: { start: 930, duration: 300 }, // 0:31–0:41
  trials: { start: 1230, duration: 300 }, // 0:41–0:51
  os: { start: 1530, duration: 240 }, // 0:51–0:59
  secret: { start: 1770, duration: 270 }, // 0:59–1:08
  close: { start: 2040, duration: 210 }, // 1:08–1:15
} as const;

export const TOTAL_FRAMES =
  scenes.close.start + scenes.close.duration; // 2250 = 75s
