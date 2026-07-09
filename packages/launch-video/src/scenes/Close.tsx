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

export const Close: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const builderIn = spring({
    frame: frame - 10,
    fps,
    config: { damping: 14, stiffness: 130 },
  });

  const lineIn = spring({
    frame: frame - 45,
    fps,
    config: { damping: 16, stiffness: 120 },
  });

  const ctaIn = spring({
    frame: frame - 90,
    fps,
    config: { damping: 14, stiffness: 140 },
  });

  return (
    <SceneShell>
      <SoftGlow top={-100} left="25%" size={720} opacity={0.18} />
      <SoftGlow bottom={-80} right={-40} size={500} color="#ffb070" opacity={0.12} />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
        }}
      >
        <div
          style={{
            opacity: interpolate(builderIn, [0, 1], [0, 1]),
            transform: `scale(${interpolate(builderIn, [0, 1], [0.88, 1])})`,
            textAlign: "center",
          }}
        >
          <DisplayText size={72}>Hire builders,</DisplayText>
          <DisplayText size={72} style={{ marginTop: 4 }}>
            not resumes.
          </DisplayText>
        </div>

        <div
          style={{
            opacity: interpolate(lineIn, [0, 1], [0, 1]),
            display: "flex",
            justifyContent: "center",
          }}
        >
          <OrangeLine delay={45} width={200} />
        </div>

        <div
          style={{
            opacity: interpolate(ctaIn, [0, 1], [0, 1]),
            transform: `translateY(${interpolate(ctaIn, [0, 1], [20, 0])}px)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
            marginTop: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: colors.orange,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: colors.white,
                fontFamily: fonts.display,
                fontSize: 30,
                fontWeight: 800,
              }}
            >
              D
            </div>
            <DisplayText size={56}>DevLabs</DisplayText>
          </div>

          <div
            style={{
              fontFamily: fonts.sans,
              fontSize: 28,
              fontWeight: 600,
              color: colors.muted,
            }}
          >
            devlabs.club · start now
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};
