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
  DisplayHeadline,
  OrangeSquiggle,
  RulerSection,
  SceneShell,
  SnapIn,
} from "../components/Brand";

export const ColdOpen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const engineerIn = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 200, mass: 0.4 },
  });

  const strike = interpolate(frame, [38, 52], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const shatter = interpolate(frame, [52, 68], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const builderIn = spring({
    frame: frame - 62,
    fps,
    config: { damping: 10, stiffness: 260, mass: 0.35 },
  });

  const subIn = spring({
    frame: frame - 95,
    fps,
    config: { damping: 14, stiffness: 160 },
  });

  const particles = Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * Math.PI * 2;
    const dist = 60 + (i % 5) * 35;
    return {
      x: Math.cos(angle) * dist * shatter,
      y: Math.sin(angle) * dist * shatter,
      rot: i * 29 * shatter,
      opacity: interpolate(shatter, [0, 0.25, 1], [0, 1, 0]),
    };
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
            gap: 32,
          }}
        >
          <div style={{ position: "relative", height: 130, width: 920 }}>
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: interpolate(engineerIn, [0, 1], [0, 1]) * (1 - shatter),
                transform: `scale(${interpolate(engineerIn, [0, 1], [0.88, 1])})`,
              }}
            >
              <DisplayHeadline size={108} weight={800}>
                ENGINEER
              </DisplayHeadline>
              <div
                style={{
                  position: "absolute",
                  left: "8%",
                  right: "8%",
                  height: 6,
                  background: brand.orange,
                  top: "54%",
                  transformOrigin: "left center",
                  transform: `scaleX(${strike})`,
                }}
              />
            </div>

            {particles.map((p, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: 14 + (i % 4) * 6,
                  height: 8,
                  background: i % 2 ? brand.orange : brand.black,
                  opacity: p.opacity,
                  transform: `translate(${p.x}px, ${p.y}px) rotate(${p.rot}deg)`,
                }}
              />
            ))}

            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: interpolate(builderIn, [0, 1], [0, 1]),
                transform: `scale(${interpolate(builderIn, [0, 1], [0.75, 1])})`,
              }}
            >
              <DisplayHeadline size={108} weight={800}>
                BUILDER
              </DisplayHeadline>
            </div>
          </div>

          <SnapIn delay={95}>
            <div style={{ textAlign: "center" }}>
              <BodyCopy size={32} color={brand.blackMuted}>
                You&apos;re not hiring a title.
              </BodyCopy>
              <BodyCopy size={32} weight={700} color={brand.black} style={{ marginTop: 4 }}>
                You&apos;re hiring someone who{" "}
                <span style={{ position: "relative", display: "inline-block" }}>
                  ships
                  <div style={{ position: "absolute", left: 0, bottom: -4 }}>
                    <OrangeSquiggle width={120} delay={110} />
                  </div>
                </span>
                .
              </BodyCopy>
            </div>
          </SnapIn>
        </AbsoluteFill>
      </RulerSection>
    </SceneShell>
  );
};
