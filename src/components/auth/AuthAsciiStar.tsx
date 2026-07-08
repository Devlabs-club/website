import React, { useEffect, useRef } from "react";

/**
 * ASCII-rendered star (same effect as the landing page hero).
 */
export const AuthAsciiStar: React.FC<{ className?: string }> = ({ className = "" }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const image = new Image();
    image.src = "/star.svg";

    const chars = " .:-=+*#%@";
    const fontSize = 10;
    const fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    const sourceScale = 2.05;
    const revealMs = 1500;

    let animationFrame = 0;
    let startTime = 0;
    let width = 0;
    let height = 0;
    let charWidth = 6;
    let columns = 0;
    let rows = 0;
    let pixels: Uint8ClampedArray | null = null;
    let seeds: Float32Array | null = null;

    const clamp = (value: number, min: number, max: number) =>
      Math.max(min, Math.min(max, value));

    function setup() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${fontSize}px ${fontFamily}`;
      charWidth = Math.max(5, ctx.measureText("@").width);
      columns = Math.ceil(width / charWidth);
      rows = Math.ceil(height / fontSize);

      const sampler = document.createElement("canvas");
      sampler.width = columns;
      sampler.height = rows;
      const samplerCtx = sampler.getContext("2d");
      if (!samplerCtx || !image.naturalWidth) return;

      const drawWidth = columns * sourceScale;
      const drawHeight = rows * sourceScale;
      samplerCtx.clearRect(0, 0, columns, rows);
      samplerCtx.drawImage(
        image,
        0,
        0,
        image.naturalWidth,
        image.naturalHeight,
        (columns - drawWidth) / 2,
        (rows - drawHeight) / 2,
        drawWidth,
        drawHeight,
      );

      pixels = samplerCtx.getImageData(0, 0, columns, rows).data;
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

      if (!startTime) startTime = now;
      const progress = clamp((now - startTime) / revealMs, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const revealWave = progress >= 1 ? 1 : eased * 0.66;

      ctx.clearRect(0, 0, width, height);
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.textBaseline = "top";
      ctx.fillStyle = "#ffffff";

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < columns; col += 1) {
          const pixelIndex = (row * columns + col) * 4;
          const alpha = pixels[pixelIndex + 3] / 255;
          if (alpha < 0.06) continue;

          const edgeDistance = Math.min(col / columns, 1 - col / columns);
          const threshold = edgeDistance + seeds[row * columns + col] * 0.12;
          const cellFade = clamp((revealWave - threshold) * 5.5, 0, 1);
          if (cellFade <= 0) continue;

          const charIndex = Math.min(
            chars.length - 1,
            Math.floor(alpha * (chars.length - 1)),
          );

          ctx.fillText(chars[charIndex], col * charWidth, row * fontSize);
        }
      }

      if (progress < 1) {
        animationFrame = requestAnimationFrame(draw);
      }
    }

    function start() {
      cancelAnimationFrame(animationFrame);
      startTime = 0;
      setup();
      animationFrame = requestAnimationFrame(draw);
    }

    if (image.complete && image.naturalWidth) start();
    else image.addEventListener("load", start, { once: true });

    window.addEventListener("resize", start);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", start);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none block ${className}`}
    />
  );
};

export default AuthAsciiStar;
