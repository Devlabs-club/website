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
  BodyCopy,
  DevLabsLogo,
  DisplayHeadline,
  OrangeSquiggle,
  OrangeWipe,
  RulerSection,
  SceneShell,
  SnapIn,
} from "../components/Brand";

export const Turn: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const wipe = interpolate(frame, [0, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const logo = spring({
    frame: frame - 18,
    fps,
    config: { damping: 12, stiffness: 200, mass: 0.4 },
  });

  const copy = spring({
    frame: frame - 40,
    fps,
    config: { damping: 14, stiffness: 180 },
  });

  return (
    <SceneShell>
      <OrangeWipe progress={wipe} />
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
              opacity: interpolate(logo, [0, 1], [0, 1]),
              transform: `scale(${interpolate(logo, [0, 1], [0.82, 1])})`,
              display: "flex",
              alignItems: "center",
              gap: 20,
            }}
          >
            <DevLabsLogo size={64} />
            <DisplayHeadline size={96}>DevLabs</DisplayHeadline>
          </div>

          <div
            style={{
              opacity: interpolate(copy, [0, 1], [0, 1]),
              transform: `translateY(${interpolate(copy, [0, 1], [24, 0])}px)`,
              textAlign: "center",
            }}
          >
            <DisplayHeadline size={52} weight={800}>
              We don&apos;t match.
            </DisplayHeadline>
            <div style={{ marginTop: 8, position: "relative", display: "inline-block" }}>
              <DisplayHeadline size={52} weight={800}>
                We rank what they&apos;ve built.
              </DisplayHeadline>
              <div style={{ marginTop: 8 }}>
                <OrangeSquiggle width={340} delay={55} />
              </div>
            </div>
            <BodyCopy size={26} style={{ marginTop: 24 }}>
              A hiring OS — built on proof of work.
            </BodyCopy>
          </div>
        </AbsoluteFill>
      </RulerSection>
    </SceneShell>
  );
};
