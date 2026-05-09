import { useEffect, useRef } from "react";
import createGlobe from "cobe";

const MARKERS = [
  // India
  { location: [20.5937, 78.9629], size: 0.12 },
  // USA
  { location: [37.0902, -95.7129], size: 0.12 },
  // Japan
  { location: [36.2048, 138.2529], size: 0.08 },
  // UK
  { location: [55.3781, -3.4360], size: 0.08 },
  // Germany
  { location: [51.1657, 10.4515], size: 0.07 },
  // Singapore
  { location: [1.3521, 103.8198], size: 0.07 },
  // Canada
  { location: [56.1304, -106.3468], size: 0.07 },
  // Australia
  { location: [-25.2744, 133.7751], size: 0.07 },
  // Brazil
  { location: [-14.235, -51.9253], size: 0.07 },
  // UAE
  { location: [23.4241, 53.8478], size: 0.06 },
  // Nigeria
  { location: [9.082, 8.6753], size: 0.06 },
  // South Korea
  { location: [35.9078, 127.7669], size: 0.06 },
];

export default function ScoutGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phiRef = useRef(0);
  const globeRef = useRef<ReturnType<typeof createGlobe> | null>(null);

  useEffect(() => {
    let width = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onResize = () => {
      width = canvas.offsetWidth;
    };
    window.addEventListener("resize", onResize);
    onResize();

    globeRef.current = createGlobe(canvas, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 1.2,
      theta: 0.25,
      dark: 1,
      diffuse: 1.2,
      mapSamples: 16000,
      mapBrightness: 4,
      baseColor: [0.13, 0.13, 0.13],
      markerColor: [0.98, 0.49, 0.13],   // #fa7d22 orange
      glowColor: [0.2, 0.2, 0.2],
      markers: MARKERS,
      onRender(state) {
        state.phi = phiRef.current;
        phiRef.current += 0.003;
        state.width = width * 2;
        state.height = width * 2;
      },
    });

    return () => {
      globeRef.current?.destroy();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", aspectRatio: "1", opacity: 0.92 }}
    />
  );
}
