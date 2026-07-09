export function createStarAsciiRenderer(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const image = new Image();
  image.src = "/star.svg";

  const chars = " .:-=+*#%@";
  const fontSize = 10;
  const fontFamily =
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
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
    const revealWave = eased * 0.66;

    ctx.clearRect(0, 0, width, height);
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.textBaseline = "top";

    const midX = columns / 2;
    const midY = rows / 2;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const pixelIndex = (row * columns + col) * 4;
        const alpha = pixels[pixelIndex + 3] / 255;
        if (alpha < 0.06) continue;

        const edgeDistance = Math.min(col / columns, 1 - col / columns);
        const threshold = edgeDistance + seeds[row * columns + col] * 0.12;
        const cellFade = clamp((revealWave - threshold) * 5.5, 0, 1);
        if (cellFade <= 0) continue;

        const distFromCenter = Math.sqrt(
          Math.pow((col - midX) / midX, 2) + Math.pow((row - midY) / midY, 2),
        );
        const depth = clamp(1 - distFromCenter * 0.2, 0.55, 1);
        const opacity = clamp(alpha * cellFade * depth, 0, 0.9);
        const charIndex = Math.min(
          chars.length - 1,
          Math.floor(alpha * (chars.length - 1)),
        );

        ctx.fillStyle = `rgba(250, 125, 34, ${opacity})`;
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
}

export function createAsciiWave(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const chars = " .:-=+*#%@";
  const fontFamily =
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );

  let animationFrame = 0;
  let width = 0;
  let height = 0;
  let columns = 0;
  let rows = 0;
  let fontSize = 12;
  let charWidth = 7;
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

    fontSize = width < 640 ? 10 : 12;
    ctx.font = `${fontSize}px ${fontFamily}`;
    charWidth = Math.max(6, ctx.measureText("@").width);
    columns = Math.ceil(width / charWidth);
    rows = Math.ceil(height / fontSize);

    seeds = new Float32Array(columns * rows);
    for (let index = 0; index < seeds.length; index += 1) {
      seeds[index] = Math.random();
    }
  }

  function draw(now: number) {
    if (!seeds) {
      animationFrame = requestAnimationFrame(draw);
      return;
    }

    const time = prefersReducedMotion.matches ? 0 : now * 0.00028;
    ctx.clearRect(0, 0, width, height);
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.textBaseline = "top";

    for (let row = 0; row < rows; row += 1) {
      const y = row * fontSize;
      const yNorm = row / Math.max(1, rows - 1);

      for (let col = 0; col < columns; col += 1) {
        const x = col * charWidth;
        const xNorm = col / Math.max(1, columns - 1);
        const centerA =
          0.32 + Math.sin(xNorm * 7.4 + time * 2.2) * 0.075;
        const centerB =
          0.58 + Math.sin(xNorm * 5.8 - time * 1.7 + 1.2) * 0.095;
        const bandA = Math.exp(-Math.pow((yNorm - centerA) / 0.13, 2));
        const bandB = Math.exp(-Math.pow((yNorm - centerB) / 0.16, 2));
        const topMist = Math.exp(-Math.pow((yNorm - 0.2) / 0.34, 2)) * 0.42;
        const noise = seeds[row * columns + col] || 0;
        const shimmer =
          0.84 + Math.sin(noise * 11 + time * 6 + col * 0.04) * 0.16;
        const edgeFade =
          clamp(xNorm * 4.2, 0, 1) *
          clamp((1 - xNorm) * 4.2, 0, 1) *
          clamp((1 - yNorm) * 1.4, 0, 1);
        const strength = clamp(
          (bandA * 1.08 + bandB * 0.82 + topMist) * shimmer * edgeFade,
          0,
          1,
        );

        if (strength < 0.08 || noise > strength + 0.38) continue;

        const charIndex = clamp(
          Math.floor(strength * (chars.length - 1)),
          0,
          chars.length - 1,
        );
        const opacity = clamp(strength * 0.44, 0.06, 0.42);
        const green = Math.round(84 + strength * 72);
        ctx.fillStyle = `rgba(255, ${green}, 0, ${opacity})`;
        ctx.fillText(chars[charIndex], x, y);
      }
    }

    if (!prefersReducedMotion.matches) {
      animationFrame = requestAnimationFrame(draw);
    }
  }

  function start() {
    cancelAnimationFrame(animationFrame);
    setup();
    animationFrame = requestAnimationFrame(draw);
  }

  start();
  window.addEventListener("resize", start);
  prefersReducedMotion.addEventListener("change", start);

  return () => {
    cancelAnimationFrame(animationFrame);
    window.removeEventListener("resize", start);
    prefersReducedMotion.removeEventListener("change", start);
  };
}

export function createFluidScrollPanels() {
  // Disabled: per-panel blur/opacity/transform on scroll caused layout thrash and jitter.
  return () => {};
}

export function initLandingAsciiEffects() {
  if (typeof window === "undefined") return;
  const root = window as Window & { __landingAsciiInit?: boolean };
  if (root.__landingAsciiInit) return;
  root.__landingAsciiInit = true;

  const canvases = Array.from(
    document.querySelectorAll<HTMLCanvasElement>("[data-star-canvas]"),
  );
  const waveCanvases = Array.from(
    document.querySelectorAll<HTMLCanvasElement>("[data-ascii-wave]"),
  );

  const cleanups = [
    ...canvases.map((canvas) => createStarAsciiRenderer(canvas)),
    ...waveCanvases.map((canvas) => createAsciiWave(canvas)),
    createFluidScrollPanels(),
  ];

  window.addEventListener("pagehide", () => {
    cleanups.forEach((cleanup) => cleanup());
  });
}
