import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, fonts } from "../theme";
import { DisplayText, OrangeLine, SceneShell, SoftGlow } from "../components/Shared";

export const Turn: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const wipe = interpolate(frame, [0, 28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const logo = spring({
    frame: frame - 24,
    fps,
    config: { damping: 14, stiffness: 130 },
  });

  const line = spring({
    frame: frame - 55,
    fps,
    config: { damping: 16, stiffness: 120 },
  });

  return (
    <SceneShell>
      {/* Orange wipe from left */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: colors.orange,
          transform: `translateX(${interpolate(wipe, [0, 1], [-100, 100])}%)`,
          zIndex: 2,
        }}
      />

      <SoftGlow top={-60} left="30%" size={700} opacity={0.16} />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          zIndex: 1,
        }}
      >
        <div
          style={{
            opacity: interpolate(logo, [0, 1], [0, 1]),
            transform: `scale(${interpolate(logo, [0, 1], [0.85, 1])})`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 18,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: colors.orange,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: colors.white,
              fontFamily: fonts.display,
              fontSize: 40,
              fontWeight: 800,
            }}
          >
            D
          </div>
          <DisplayText size={92}>DevLabs</DisplayText>
        </div>

        <div
          style={{
            opacity: interpolate(line, [0, 1], [0, 1]),
            transform: `translateY(${interpolate(line, [0, 1], [20, 0])}px)`,
            textAlign: "center",
            maxWidth: 1100,
          }}
        >
          <DisplayText size={48} weight={650}>
            We don&apos;t match.
          </DisplayText>
          <DisplayText size={48} weight={650} style={{ marginTop: 8 }}>
            We rank what they&apos;ve built.
          </DisplayText>
          <div style={{ marginTop: 28, display: "flex", justifyContent: "center" }}>
            <OrangeLine delay={70} width={220} />
          </div>
          <div
            style={{
              marginTop: 28,
              fontFamily: fonts.sans,
              fontSize: 30,
              color: colors.muted,
              fontWeight: 500,
            }}
          >
            A hiring OS — built on proof of work.
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};
