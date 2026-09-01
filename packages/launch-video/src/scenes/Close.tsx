import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { brand } from "../theme";
import {
  DevLabsLogo,
  DisplayHeadline,
  OrangeSquiggle,
  PrimaryButton,
  RulerSection,
  SceneShell,
  SnapIn,
} from "../components/Brand";
import { fontFamily } from "../components/Fonts";

export const Close: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headline = spring({
    frame: frame - 6,
    fps,
    config: { damping: 11, stiffness: 220, mass: 0.4 },
  });

  const cta = spring({
    frame: frame - 50,
    fps,
    config: { damping: 12, stiffness: 200 },
  });

  return (
    <SceneShell>
      <RulerSection>
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 28,
          }}
        >
          <div
            style={{
              opacity: interpolate(headline, [0, 1], [0, 1]),
              transform: `scale(${interpolate(headline, [0, 1], [0.88, 1])})`,
              textAlign: "center",
            }}
          >
            <DisplayHeadline size={80}>Hire builders,</DisplayHeadline>
            <div style={{ position: "relative", display: "inline-block" }}>
              <DisplayHeadline size={80}>not resumes.</DisplayHeadline>
              <div style={{ marginTop: 8 }}>
                <OrangeSquiggle width={260} delay={30} />
              </div>
            </div>
          </div>

          <SnapIn delay={50}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <DevLabsLogo size={56} />
              <DisplayHeadline size={52}>DevLabs</DisplayHeadline>
            </div>
          </SnapIn>

          <div
            style={{
              opacity: interpolate(cta, [0, 1], [0, 1]),
              transform: `translateY(${interpolate(cta, [0, 1], [16, 0])}px)`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 20,
            }}
          >
            <PrimaryButton>Try for Free</PrimaryButton>
            <div
              style={{
                fontFamily: fontFamily.sans,
                fontSize: 22,
                fontWeight: 600,
                color: brand.blackSoft,
              }}
            >
              devlabs.club
            </div>
          </div>
        </AbsoluteFill>
      </RulerSection>
    </SceneShell>
  );
};
