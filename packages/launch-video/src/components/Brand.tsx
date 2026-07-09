import React from "react";
import {
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { brand, type } from "../theme";
import { fontFamily } from "./Fonts";

/** Landing page 24px grid overlay */
export const LandingGrid: React.FC<{ opacity?: number }> = ({
  opacity = 1,
}) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      opacity,
      backgroundImage: `
        repeating-linear-gradient(to right, rgba(5,5,5,0.024) 0, rgba(5,5,5,0.024) 1px, transparent 1px, transparent 24px),
        repeating-linear-gradient(to bottom, rgba(5,5,5,0.022) 0, rgba(5,5,5,0.022) 1px, transparent 1px, transparent 24px)
      `,
      pointerEvents: "none",
    }}
  />
);

/** Ruler section 40px grid + side rails */
export const RulerSection: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div style={{ position: "relative", width: "100%", height: "100%" }}>
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage: `
          linear-gradient(to right, rgba(5,5,5,0.032) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(5,5,5,0.032) 1px, transparent 1px)
        `,
        backgroundSize: "40px 40px",
        pointerEvents: "none",
      }}
    />
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: "50%",
        width: "min(calc(100% - 120px), 1280px)",
        transform: "translateX(-50%)",
        borderLeft: `1px solid rgba(5,5,5,0.08)`,
        borderRight: `1px solid rgba(5,5,5,0.08)`,
        pointerEvents: "none",
      }}
    />
    {children}
  </div>
);

export const SceneShell: React.FC<{
  children: React.ReactNode;
  background?: string;
  dark?: boolean;
}> = ({ children, background = brand.cream, dark = false }) => (
  <div
    style={{
      width: "100%",
      height: "100%",
      background,
      color: dark ? brand.white : brand.black,
      fontFamily: fontFamily.sans,
      overflow: "hidden",
      position: "relative",
    }}
  >
    {!dark && <LandingGrid />}
    {children}
  </div>
);

export const Eyebrow: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div
    style={{
      fontFamily: fontFamily.sans,
      fontSize: 13,
      fontWeight: 800,
      letterSpacing: "0.24em",
      textTransform: "uppercase",
      color: "rgba(5,5,5,0.40)",
    }}
  >
    {children}
  </div>
);

export const DisplayHeadline: React.FC<{
  children: React.ReactNode;
  size?: number;
  weight?: number;
  italic?: boolean;
  color?: string;
  style?: React.CSSProperties;
}> = ({
  children,
  size = 88,
  weight = 800,
  italic = false,
  color = brand.black,
  style,
}) => (
  <div
    style={{
      fontFamily: fontFamily.display,
      fontSize: size,
      fontWeight: weight,
      fontStyle: italic ? "italic" : "normal",
      color,
      letterSpacing: "-0.04em",
      lineHeight: 0.98,
      ...style,
    }}
  >
    {children}
  </div>
);

export const BodyCopy: React.FC<{
  children: React.ReactNode;
  size?: number;
  color?: string;
  weight?: number;
  style?: React.CSSProperties;
}> = ({
  children,
  size = 28,
  color = brand.blackSoft,
  weight = 500,
  style,
}) => (
  <div
    style={{
      fontFamily: fontFamily.sans,
      fontSize: size,
      fontWeight: weight,
      color,
      lineHeight: 1.35,
      letterSpacing: "-0.01em",
      ...style,
    }}
  >
    {children}
  </div>
);

/** Landing orange squiggle underline */
export const OrangeSquiggle: React.FC<{ width?: number; delay?: number }> = ({
  width = 280,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [delay, delay + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        width,
        height: 8,
        background: brand.orange,
        borderRadius: 4,
        opacity: 0.75,
        transform: `scaleX(${progress}) rotate(-1deg)`,
        transformOrigin: "left center",
      }}
    />
  );
};

/** Blue corner squares from landing hero card */
export const CornerSquares: React.FC<{ delay?: number }> = ({ delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: frame - delay,
    fps,
    config: { damping: 14, stiffness: 180 },
  });
  const size = 20;
  const border = `3px solid ${brand.blue}`;
  const base: React.CSSProperties = {
    position: "absolute",
    width: size,
    height: size,
    border,
    background: brand.cream,
    opacity: interpolate(s, [0, 1], [0, 1]),
    transform: `scale(${interpolate(s, [0, 1], [0.5, 1])})`,
  };
  return (
    <>
      <div style={{ ...base, top: -8, left: -8 }} />
      <div style={{ ...base, top: -8, right: -8 }} />
      <div style={{ ...base, bottom: -8, left: -8 }} />
      <div style={{ ...base, bottom: -8, right: -8 }} />
    </>
  );
};

export const OrangeChip: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      border: `1px solid rgba(255,116,23,0.35)`,
      background: brand.orangeTint,
      padding: "6px 12px",
      fontFamily: fontFamily.sans,
      fontSize: 14,
      fontWeight: 650,
      color: brand.orangeDark,
    }}
  >
    {children}
  </span>
);

export const DevLabsLogo: React.FC<{ size?: number }> = ({ size = 48 }) => (
  <Img
    src={staticFile("logo.png")}
    style={{ width: size, height: size, objectFit: "contain" }}
  />
);

export const PrimaryButton: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      height: 54,
      padding: "0 36px",
      borderRadius: 999,
      border: `2px solid ${brand.buttonBorder}`,
      background: brand.buttonDark,
      color: brand.white,
      fontFamily: fontFamily.sans,
      fontSize: 16,
      fontWeight: 800,
      boxShadow: "0 16px 36px rgba(5,5,5,0.12)",
    }}
  >
    {children}
  </div>
);

export const PopIn: React.FC<{
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: frame - delay,
    fps,
    config: { damping: 11, stiffness: 220, mass: 0.45 },
  });
  return (
    <div
      style={{
        opacity: interpolate(s, [0, 1], [0, 1]),
        transform: `translateY(${interpolate(s, [0, 1], [28, 0])}px) scale(${interpolate(s, [0, 1], [0.9, 1])})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const SnapIn: React.FC<{
  children: React.ReactNode;
  delay?: number;
  from?: "left" | "right" | "bottom";
}> = ({ children, delay = 0, from = "bottom" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: frame - delay,
    fps,
    config: { damping: 10, stiffness: 280, mass: 0.35 },
  });
  const offset = interpolate(s, [0, 1], [60, 0]);
  const transform =
    from === "left"
      ? `translateX(${-offset}px)`
      : from === "right"
        ? `translateX(${offset}px)`
        : `translateY(${offset}px)`;
  return (
    <div
      style={{
        opacity: interpolate(s, [0, 1], [0, 1]),
        transform,
      }}
    >
      {children}
    </div>
  );
};

export const OrangeWipe: React.FC<{ progress: number }> = ({ progress }) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background: brand.orange,
      transform: `translateX(${interpolate(progress, [0, 1], [-100, 100])}%)`,
      zIndex: 50,
      pointerEvents: "none",
    }}
  />
);

export const DarkActGlow: React.FC = () => (
  <>
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: `linear-gradient(180deg, #2c1608 0, #1a0f0a 200px, rgba(13,10,9,0) 560px),
          radial-gradient(ellipse at 50% 2%, rgba(255,116,23,0.12), transparent 52%)`,
      }}
    />
    <div
      style={{
        position: "absolute",
        top: 40,
        left: "50%",
        transform: "translateX(-50%)",
        width: "70%",
        height: 280,
        background:
          "radial-gradient(ellipse at 50% 30%, rgba(255,140,50,0.55) 0%, transparent 74%)",
        filter: "blur(64px)",
        pointerEvents: "none",
      }}
    />
  </>
);
