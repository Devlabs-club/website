import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, fonts } from "../theme";

export const SceneShell: React.FC<{
  children: React.ReactNode;
  background?: string;
}> = ({ children, background = colors.cream }) => (
  <AbsoluteFill
    style={{
      background,
      fontFamily: fonts.sans,
      color: colors.ink,
      overflow: "hidden",
    }}
  >
    {children}
  </AbsoluteFill>
);

export const FadeIn: React.FC<{
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, duration = 18, style }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [delay, delay + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, [delay, delay + duration], [24, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ opacity, transform: `translateY(${y}px)`, ...style }}>
      {children}
    </div>
  );
};

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
    config: { damping: 14, stiffness: 160, mass: 0.6 },
  });
  return (
    <div
      style={{
        opacity: interpolate(s, [0, 1], [0, 1]),
        transform: `scale(${interpolate(s, [0, 1], [0.86, 1])})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const DisplayText: React.FC<{
  children: React.ReactNode;
  size?: number;
  color?: string;
  weight?: number;
  style?: React.CSSProperties;
}> = ({
  children,
  size = 96,
  color = colors.ink,
  weight = 700,
  style,
}) => (
  <div
    style={{
      fontFamily: fonts.display,
      fontSize: size,
      fontWeight: weight,
      color,
      letterSpacing: "-0.03em",
      lineHeight: 1.05,
      ...style,
    }}
  >
    {children}
  </div>
);

export const BodyText: React.FC<{
  children: React.ReactNode;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ children, size = 36, color = colors.muted, style }) => (
  <div
    style={{
      fontFamily: fonts.sans,
      fontSize: size,
      fontWeight: 500,
      color,
      lineHeight: 1.35,
      ...style,
    }}
  >
    {children}
  </div>
);

export const OrangeLine: React.FC<{
  delay?: number;
  width?: number | string;
  height?: number;
}> = ({ delay = 0, width = 180, height = 6 }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [delay, delay + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        width,
        height,
        background: colors.orange,
        borderRadius: 999,
        transformOrigin: "left center",
        transform: `scaleX(${progress})`,
      }}
    />
  );
};

export const SoftGlow: React.FC<{
  color?: string;
  size?: number;
  top?: number | string;
  left?: number | string;
  right?: number | string;
  bottom?: number | string;
  opacity?: number;
}> = ({
  color = colors.orange,
  size = 520,
  top,
  left,
  right,
  bottom,
  opacity = 0.18,
}) => (
  <div
    style={{
      position: "absolute",
      width: size,
      height: size,
      borderRadius: "50%",
      background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
      opacity,
      top,
      left,
      right,
      bottom,
      pointerEvents: "none",
      filter: "blur(8px)",
    }}
  />
);
