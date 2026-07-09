import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, fonts } from "../theme";
import { DisplayText, SceneShell, SoftGlow } from "../components/Shared";

export const ColdOpen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const engineerIn = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 120 },
  });

  const strikeProgress = interpolate(frame, [55, 78], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const shatter = interpolate(frame, [78, 100], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const builderIn = spring({
    frame: frame - 95,
    fps,
    config: { damping: 12, stiffness: 140, mass: 0.55 },
  });

  const particles = Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2;
    const dist = 80 + (i % 4) * 40;
    return {
      x: Math.cos(angle) * dist * shatter,
      y: Math.sin(angle) * dist * shatter - shatter * 30,
      rot: (i * 37) * shatter,
      opacity: interpolate(shatter, [0, 0.3, 1], [0, 1, 0]),
    };
  });

  return (
    <SceneShell>
      <SoftGlow top={-80} left={-60} size={640} opacity={0.14} />
      <SoftGlow bottom={-120} right={-40} size={520} color="#ffb070" opacity={0.12} />
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 28,
        }}
      >
        <div style={{ position: "relative", height: 140, width: 900 }}>
          {/* ENGINEER */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: interpolate(engineerIn, [0, 1], [0, 1]) * (1 - shatter),
              transform: `scale(${interpolate(engineerIn, [0, 1], [0.92, 1])}) translateY(${shatter * -20}px)`,
            }}
          >
            <DisplayText size={120} weight={800}>
              ENGINEER
            </DisplayText>
            <div
              style={{
                position: "absolute",
                left: "12%",
                right: "12%",
                height: 8,
                background: colors.orange,
                borderRadius: 999,
                transformOrigin: "left center",
                transform: `scaleX(${strikeProgress})`,
                top: "52%",
              }}
            />
          </div>

          {/* Shatter particles */}
          {particles.map((p, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 18 + (i % 3) * 8,
                height: 10,
                background: i % 2 === 0 ? colors.ink : colors.orange,
                opacity: p.opacity,
                transform: `translate(${p.x}px, ${p.y}px) rotate(${p.rot}deg)`,
                borderRadius: 2,
              }}
            />
          ))}

          {/* BUILDER */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: interpolate(builderIn, [0, 1], [0, 1]),
              transform: `scale(${interpolate(builderIn, [0, 1], [0.8, 1])})`,
            }}
          >
            <DisplayText size={120} weight={800} color={colors.ink}>
              BUILDER
            </DisplayText>
          </div>
        </div>

        <div
          style={{
            opacity: interpolate(frame, [130, 160], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            transform: `translateY(${interpolate(frame, [130, 160], [16, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}px)`,
            fontFamily: fonts.sans,
            fontSize: 34,
            color: colors.muted,
            fontWeight: 500,
            maxWidth: 900,
            textAlign: "center",
          }}
        >
          You&apos;re not hiring a title. You&apos;re hiring someone who ships.
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};
