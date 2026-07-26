/**
 * Rasterize landing-hero ASCII stars to PNG for OG backgrounds.
 *
 * Same pipeline as the hero canvases (LandingAsciiStars + landingAscii.ts),
 * then canvas → PNG:
 * https://zooper.pages.dev/articles/how-to-convert-a-svg-to-png-using-canvas
 *
 * Usage: pnpm generate:og-stars
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';
import sharp from 'sharp';

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const OUT_DIR = path.join(process.cwd(), 'public/og');

const CHARS = ' .:-=+*#%@';
const FONT_SIZE = 10;
const FONT_FAMILY = 'Menlo, Monaco, Consolas, monospace';
const SOURCE_SCALE = 2.05;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** SVG → PNG via sharp, then load into canvas Image (article step 2–3). */
async function loadStarImage(): Promise<Image> {
  const svg = await readFile(path.join(process.cwd(), 'public/star.svg'));
  const png = await sharp(svg).resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  return loadImage(png);
}

/** Mirror createStarAsciiRenderer at full reveal — returns PNG buffer. */
async function renderAsciiStarPng(size: number, rotationDeg: number, starImage: Image) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
  const charWidth = Math.max(5, ctx.measureText('@').width);
  const columns = Math.ceil(size / charWidth);
  const rows = Math.ceil(size / FONT_SIZE);

  const sampler = createCanvas(columns, rows);
  const samplerCtx = sampler.getContext('2d');
  const drawWidth = columns * SOURCE_SCALE;
  const drawHeight = rows * SOURCE_SCALE;
  samplerCtx.clearRect(0, 0, columns, rows);
  samplerCtx.drawImage(
    starImage,
    0,
    0,
    starImage.width,
    starImage.height,
    (columns - drawWidth) / 2,
    (rows - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
  const { data: pixels } = samplerCtx.getImageData(0, 0, columns, rows);

  ctx.clearRect(0, 0, size, size);
  ctx.translate(size / 2, size / 2);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  ctx.translate(-size / 2, -size / 2);
  ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
  ctx.textBaseline = 'top';

  const midX = columns / 2;
  const midY = rows / 2;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const pixelIndex = (row * columns + col) * 4;
      const alpha = pixels[pixelIndex + 3]! / 255;
      if (alpha < 0.06) continue;

      const distFromCenter = Math.sqrt(
        Math.pow((col - midX) / midX, 2) + Math.pow((row - midY) / midY, 2),
      );
      const depth = clamp(1 - distFromCenter * 0.2, 0.55, 1);
      const opacity = clamp(alpha * depth, 0, 0.9);
      const charIndex = Math.min(CHARS.length - 1, Math.floor(alpha * (CHARS.length - 1)));

      ctx.fillStyle = `rgba(250, 125, 34, ${opacity})`;
      ctx.fillText(CHARS[charIndex]!, col * charWidth, row * FONT_SIZE);
    }
  }

  // Article step 4: canvas → PNG
  return canvas.toBuffer('image/png');
}

async function composeOgLayer(starPng: Buffer, size: number, left: number, top: number) {
  const layer = createCanvas(OG_WIDTH, OG_HEIGHT);
  const ctx = layer.getContext('2d');
  ctx.clearRect(0, 0, OG_WIDTH, OG_HEIGHT);
  const star = await loadImage(starPng);
  ctx.drawImage(star, left, top, size, size);
  return layer.toBuffer('image/png');
}

async function main() {
  console.log('Loading star.svg…');
  await mkdir(OUT_DIR, { recursive: true });
  const starImage = await loadStarImage();

  // Hero placement on 1200×630 (LandingAsciiStars.astro desktop classes)
  // Scale up slightly so the ASCII reads on a 1200×630 share card.
  const leftSize = Math.round(OG_WIDTH * 0.48);
  const rightSize = Math.round(OG_WIDTH * 0.44);
  const leftX = Math.round(OG_WIDTH * -0.16);
  const leftY = Math.round((100 / 800) * OG_HEIGHT);
  const rightX = Math.round(OG_WIDTH - rightSize + OG_WIDTH * 0.14);
  const rightY = Math.round((60 / 800) * OG_HEIGHT);

  console.log('Rendering ASCII stars on canvas…');
  const leftStar = await renderAsciiStarPng(leftSize, -22, starImage);
  const rightStar = await renderAsciiStarPng(rightSize, 10, starImage);

  console.log('Composing OG layers…');
  const leftLayer = await composeOgLayer(leftStar, leftSize, leftX, leftY);
  const rightLayer = await composeOgLayer(rightStar, rightSize, rightX, rightY);

  await Promise.all([
    writeFile(path.join(OUT_DIR, 'wrapped-star-left.png'), leftLayer),
    writeFile(path.join(OUT_DIR, 'wrapped-star-right.png'), rightLayer),
  ]);

  console.log('Wrote public/og/wrapped-star-left.png and wrapped-star-right.png');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
