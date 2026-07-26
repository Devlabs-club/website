import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type AsciiStarGlyph = {
  x: number;
  y: number;
  char: string;
  opacity: number;
};

const CHARS = ' .:-=+*#%@';
const FONT_SIZE = 10;
const CHAR_WIDTH = 6;
const SOURCE_SCALE = 2.05;
const ALPHA_THRESHOLD = 0.06;

let starSvgCache: Buffer | null = null;
let sharpModule: typeof import('sharp') | null = null;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

async function getSharp() {
  if (!sharpModule) {
    sharpModule = await import('sharp');
  }
  return sharpModule.default;
}

function rotatePoint(x: number, y: number, cx: number, cy: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: cy + dx * Math.sin(rad) + dy * Math.cos(rad),
  };
}

async function loadStarSvg(origin?: string): Promise<Buffer> {
  if (starSvgCache) return starSvgCache;

  if (origin) {
    try {
      const res = await fetch(`${origin}/star.svg`);
      if (res.ok) {
        starSvgCache = Buffer.from(await res.arrayBuffer());
        return starSvgCache;
      }
    } catch {
      // fall through to local file
    }
  }

  starSvgCache = await readFile(path.join(process.cwd(), 'public/star.svg'));
  return starSvgCache;
}

/** Sample /star.svg alpha into a cols×rows grid — same layout as the landing page sampler. */
async function sampleStarAlphaGrid(cols: number, rows: number, starSvg: Buffer): Promise<Uint8Array> {
  const sharp = await getSharp();
  const drawWidth = Math.round(cols * SOURCE_SCALE);
  const drawHeight = Math.round(rows * SOURCE_SCALE);

  const { data } = await sharp(starSvg)
    .resize(drawWidth, drawHeight, { fit: 'fill' })
    .ensureAlpha()
    .extract({
      left: Math.max(0, Math.round((drawWidth - cols) / 2)),
      top: Math.max(0, Math.round((drawHeight - rows) / 2)),
      width: cols,
      height: rows,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const alphas = new Uint8Array(cols * rows);
  for (let i = 0; i < cols * rows; i += 1) {
    alphas[i] = data[i * 4 + 3] ?? 0;
  }
  return alphas;
}

async function buildAsciiStarGlyphsFromSvg(options: {
  centerX: number;
  centerY: number;
  size: number;
  rotationDeg?: number;
  fontSize?: number;
  starSvg: Buffer;
}): Promise<AsciiStarGlyph[]> {
  const { centerX, centerY, size, rotationDeg = 0, fontSize = FONT_SIZE, starSvg } = options;

  const cols = Math.ceil(size / CHAR_WIDTH);
  const rows = Math.ceil(size / fontSize);
  const alphas = await sampleStarAlphaGrid(cols, rows, starSvg);

  const half = size / 2;
  const midX = cols / 2;
  const midY = rows / 2;
  const glyphs: AsciiStarGlyph[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const alpha = (alphas[row * cols + col] ?? 0) / 255;
      if (alpha < ALPHA_THRESHOLD) continue;

      const px = centerX - half + col * CHAR_WIDTH;
      const py = centerY - half + row * fontSize;
      const rotated = rotatePoint(px, py, centerX, centerY, rotationDeg);

      const distFromCenter = Math.sqrt(
        (col - midX) ** 2 / midX ** 2 + (row - midY) ** 2 / midY ** 2,
      );
      const depth = clamp(1 - distFromCenter * 0.2, 0.55, 1);
      const opacity = clamp(alpha * depth, 0.28, 0.9);
      const charIndex = Math.min(CHARS.length - 1, Math.floor(alpha * (CHARS.length - 1)));

      glyphs.push({
        x: rotated.x,
        y: rotated.y,
        char: CHARS[charIndex] ?? '@',
        opacity,
      });
    }
  }

  return glyphs;
}

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Rasterize sampled glyphs to a PNG data URL for @vercel/og (avoids thousands of Satori nodes). */
async function glyphsToPngDataUrl(glyphs: AsciiStarGlyph[], width: number, height: number) {
  const sharp = await getSharp();
  const textNodes = glyphs
    .map(
      (glyph) =>
        `<text x="${glyph.x.toFixed(1)}" y="${(glyph.y + FONT_SIZE).toFixed(1)}" fill="rgba(250,125,34,${glyph.opacity.toFixed(3)})" font-family="ui-monospace, Menlo, monospace" font-size="${FONT_SIZE}">${escapeXml(glyph.char)}</text>`,
    )
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="transparent"/>${textNodes}</svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

export type WrappedOgStarLayers = {
  left: string;
  right: string;
};

/** Landing-page layout: large stars bleeding off left/right edges, sampled from /star.svg. */
export async function buildWrappedOgStarLayers(
  width: number,
  height: number,
  origin: string,
): Promise<WrappedOgStarLayers> {
  const starSvg = await loadStarSvg(origin === 'file://local' ? undefined : origin);
  // Match LandingAsciiStars.astro desktop sizing (~32vw / ~30vw) on the OG canvas.
  const leftSize = Math.round(width * 0.42);
  const rightSize = Math.round(width * 0.38);

  const [leftGlyphs, rightGlyphs] = await Promise.all([
    buildAsciiStarGlyphsFromSvg({
      // left-[max(-12rem,-13vw)] top-32  → bleed past left edge, mid-upper
      centerX: width * -0.02,
      centerY: height * 0.42,
      size: leftSize,
      rotationDeg: -22,
      starSvg,
    }),
    buildAsciiStarGlyphsFromSvg({
      // right-[max(-11rem,-12vw)] top-20 → bleed past right edge
      centerX: width * 1.02,
      centerY: height * 0.34,
      size: rightSize,
      rotationDeg: 10,
      starSvg,
    }),
  ]);

  const [left, right] = await Promise.all([
    glyphsToPngDataUrl(leftGlyphs, width, height),
    glyphsToPngDataUrl(rightGlyphs, width, height),
  ]);

  return { left, right };
}
