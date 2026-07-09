import React, { useEffect, useRef } from 'react';

type EnrichmentStageKey = 'linkedin' | 'github' | 'research';

export type EnrichmentVisualStage = EnrichmentStageKey;

type StageConfig = {
  src: string;
  /** Fraction of the canvas the icon should occupy (0–1). */
  fill: number;
  tint: { r: number; g: number; b: number };
};

const STAGE_CONFIG: Record<EnrichmentStageKey, StageConfig> = {
  linkedin: {
    src: '/builder/enrichment-linkedin.png',
    fill: 0.72,
    tint: { r: 255, g: 132, b: 23 },
  },
  github: {
    src: '/builder/enrichment-github.png',
    fill: 0.7,
    tint: { r: 255, g: 128, b: 23 },
  },
  research: {
    src: '/star.svg',
    fill: 0.74,
    tint: { r: 255, g: 116, b: 23 },
  },
};

type Props = {
  stage: EnrichmentStageKey;
  className?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Fit image in pixel space while preserving its native aspect ratio. */
function fitImageInPixels(
  canvasW: number,
  canvasH: number,
  imageW: number,
  imageH: number,
  fill: number,
) {
  const imageAspect = imageW / Math.max(imageH, 1);
  const maxW = canvasW * fill;
  const maxH = canvasH * fill;

  let drawW = maxW;
  let drawH = drawW / imageAspect;

  if (drawH > maxH) {
    drawH = maxH;
    drawW = drawH * imageAspect;
  }

  return {
    drawW,
    drawH,
    offsetX: (canvasW - drawW) / 2,
    offsetY: (canvasH - drawH) / 2,
  };
}

/** Sample opaque logo pixels from PNG/SVG sources, including dark inner details. */
function sampleStrength(pixels: Uint8ClampedArray, pixelIndex: number) {
  const r = pixels[pixelIndex];
  const g = pixels[pixelIndex + 1];
  const b = pixels[pixelIndex + 2];
  const alpha = pixels[pixelIndex + 3] / 255;
  if (alpha < 0.08) return 0;

  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const colorMax = Math.max(r, g, b) / 255;
  const body = Math.max(luminance, colorMax * 0.72, (1 - luminance) * 0.42);
  return alpha * clamp(body, 0.18, 1);
}

/** Average sample strength across the pixel region covered by one ASCII cell. */
function sampleCell(
  pixels: Uint8ClampedArray,
  pixelWidth: number,
  pixelHeight: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
) {
  const x0 = clamp(Math.floor(left), 0, pixelWidth - 1);
  const x1 = clamp(Math.ceil(right), 0, pixelWidth);
  const y0 = clamp(Math.floor(top), 0, pixelHeight - 1);
  const y1 = clamp(Math.ceil(bottom), 0, pixelHeight);

  let total = 0;
  let count = 0;

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      total += sampleStrength(pixels, (y * pixelWidth + x) * 4);
      count += 1;
    }
  }

  return count > 0 ? total / count : 0;
}

export function BuilderEnrichmentAsciiVisual({ stage, className = '' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const config = STAGE_CONFIG[stage];
    const chars = ' .·:=-+*#%@';
    const fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    const fontSize = 9;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const image = new Image();
    image.src = config.src;

    let animationFrame = 0;
    let width = 0;
    let height = 0;
    let charWidth = 6;
    let columns = 0;
    let rows = 0;
    let pixelWidth = 0;
    let pixelHeight = 0;
    let pixels: Uint8ClampedArray | null = null;
    let seeds: Float32Array | null = null;

    function setup() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${fontSize}px ${fontFamily}`;
      charWidth = Math.max(5, ctx.measureText('@').width);
      columns = Math.ceil(width / charWidth);
      rows = Math.ceil(height / fontSize);

      pixelWidth = Math.max(1, Math.round(width));
      pixelHeight = Math.max(1, Math.round(height));

      const sampler = document.createElement('canvas');
      sampler.width = pixelWidth;
      sampler.height = pixelHeight;
      const samplerCtx = sampler.getContext('2d');
      if (!samplerCtx || !image.naturalWidth) return;

      samplerCtx.clearRect(0, 0, pixelWidth, pixelHeight);
      const { drawW, drawH, offsetX, offsetY } = fitImageInPixels(
        pixelWidth,
        pixelHeight,
        image.naturalWidth,
        image.naturalHeight,
        config.fill,
      );
      samplerCtx.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, offsetX, offsetY, drawW, drawH);

      pixels = samplerCtx.getImageData(0, 0, pixelWidth, pixelHeight).data;
      seeds = new Float32Array(columns * rows);
      for (let index = 0; index < seeds.length; index += 1) {
        seeds[index] = Math.random();
      }
    }

    function draw(now: number) {
      if (!pixels || !seeds) {
        animationFrame = requestAnimationFrame(draw);
        return;
      }

      const time = prefersReducedMotion.matches ? 0 : now * 0.0011;
      const scanY = prefersReducedMotion.matches ? -1 : (time * 0.42) % 1.35 - 0.15;

      ctx.fillStyle = '#fffcfa';
      ctx.fillRect(0, 0, width, height);
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.textBaseline = 'top';

      for (let row = 0; row < rows; row += 1) {
        const rowTop = row * fontSize;
        const rowBottom = rowTop + fontSize;
        const rowNorm = row / Math.max(1, rows - 1);
        const scanDistance = Math.abs(rowNorm - scanY);
        const scanBoost = scanY < 0 ? 0 : Math.exp(-Math.pow(scanDistance / 0.09, 2)) * 0.4;

        for (let col = 0; col < columns; col += 1) {
          const colLeft = col * charWidth;
          const colRight = colLeft + charWidth;
          const alpha = sampleCell(pixels, pixelWidth, pixelHeight, colLeft, rowTop, colRight, rowBottom);
          if (alpha < 0.06) continue;

          const seed = seeds[row * columns + col];
          const shimmer = 0.7 + Math.sin(seed * 11 + time * 6 + col * 0.22 + row * 0.14) * 0.3;
          const strength = clamp(alpha * shimmer + scanBoost, 0, 1);
          if (strength < 0.07) continue;

          const charIndex = clamp(Math.floor(strength * (chars.length - 1)), 0, chars.length - 1);
          const opacity = clamp(0.32 + strength * 0.58, 0.24, 0.94);
          const mix = 0.35 + strength * 0.65;
          const r = Math.round(config.tint.r * mix + 251 * (1 - mix));
          const g = Math.round(config.tint.g * mix + 246 * (1 - mix));
          const b = Math.round(config.tint.b * mix + 243 * (1 - mix));
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
          ctx.fillText(chars[charIndex], colLeft, rowTop);
        }
      }

      if (!prefersReducedMotion.matches && scanY >= 0 && scanY <= 1) {
        const beamY = scanY * height;
        const gradient = ctx.createLinearGradient(0, beamY - 18, 0, beamY + 18);
        gradient.addColorStop(0, 'rgba(255, 116, 23, 0)');
        gradient.addColorStop(0.5, 'rgba(255, 116, 23, 0.1)');
        gradient.addColorStop(1, 'rgba(255, 116, 23, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, beamY - 18, width, 36);
      }

      animationFrame = requestAnimationFrame(draw);
    }

    function start() {
      cancelAnimationFrame(animationFrame);
      setup();
      animationFrame = requestAnimationFrame(draw);
    }

    if (image.complete && image.naturalWidth) start();
    else image.addEventListener('load', start, { once: true });

    window.addEventListener('resize', start);
    prefersReducedMotion.addEventListener('change', start);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', start);
      prefersReducedMotion.removeEventListener('change', start);
    };
  }, [stage]);

  return <canvas ref={canvasRef} aria-hidden className={`block w-full ${className}`} />;
}

export default BuilderEnrichmentAsciiVisual;
