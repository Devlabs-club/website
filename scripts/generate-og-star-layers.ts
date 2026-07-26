/**
 * Rasterize landing-hero ASCII stars to PNG for OG backgrounds.
 *
 * Pipeline mirrors the hero canvases (LandingAsciiStars + landingAscii.ts),
 * then exports PNG layers (SVG → raster → ASCII → PNG), same idea as:
 * https://zooper.pages.dev/articles/how-to-convert-a-svg-to-png-using-canvas
 *
 * Usage: pnpm generate:og-stars
 *
 * Note: PNGs are committed under public/og/ — this script is local-only.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildWrappedOgStarLayers } from '../src/lib/agentWrapped/asciiStarForOg';

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const OUT_DIR = path.join(process.cwd(), 'public/og');

function dataUrlToBuffer(dataUrl: string) {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  return Buffer.from(base64, 'base64');
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const layers = await buildWrappedOgStarLayers(OG_WIDTH, OG_HEIGHT, 'file://local');

  await Promise.all([
    writeFile(path.join(OUT_DIR, 'wrapped-star-left.png'), dataUrlToBuffer(layers.left)),
    writeFile(path.join(OUT_DIR, 'wrapped-star-right.png'), dataUrlToBuffer(layers.right)),
  ]);

  console.log('Wrote public/og/wrapped-star-left.png and wrapped-star-right.png');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
