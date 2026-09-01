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
  DisplayHeadline,
  Eyebrow,
  PopIn,
  PrimaryButton,
  RulerSection,
  SceneShell,
  SnapIn,
} from "../components/Brand";
import { fontFamily } from "../components/Fonts";

const briefLines = [
  "Goal: Rebuild checkout with Stripe Connect",
  "Deliverables: Working PR + 2-min demo",
  "Timeline: 48 hours",
  "Success: End-to-end test payment succeeds",
];

export const Trials: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const click = spring({
    frame: frame - 18,
    fps,
    config: { damping: 8, stiffness: 320, mass: 0.3 },
  });

  const showBrief = frame >= 40;
  const showSubmit = frame >= 110;

  return (
    <SceneShell>
      <RulerSection>
        <AbsoluteFill style={{ padding: "56px 100px" }}>
          <SnapIn>
            <Eyebrow>work trials</Eyebrow>
            <DisplayHeadline size={58} style={{ marginTop: 16 }}>
              Don&apos;t interview builders.
            </DisplayHeadline>
            <DisplayHeadline size={58}>Watch them build.</DisplayHeadline>
          </SnapIn>

          <div style={{ display: "flex", gap: 28, marginTop: 36 }}>
            <div
              style={{
                flex: 1,
                border: `1px solid ${brand.border}`,
                background: brand.white,
                padding: 32,
              }}
            >
              <div
                style={{
                  transform: `scale(${interpolate(click, [0, 0.5, 1], [1, 0.94, 1])})`,
                  display: "inline-block",
                }}
              >
                <PrimaryButton>Generate trial</PrimaryButton>
              </div>

              {showBrief
                ? briefLines.map((line, i) => {
                    const start = 42 + i * 12;
                    const chars = Math.floor(
                      interpolate(frame, [start, start + 16], [0, line.length], {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                      }),
                    );
                    return (
                      <div
                        key={line}
                        style={{
                          marginTop: 18,
                          fontFamily: fontFamily.sans,
                          fontSize: 18,
                          fontWeight: 500,
                          color: brand.black,
                          opacity: chars > 0 ? 1 : 0,
                        }}
                      >
                        {line.slice(0, chars)}
                      </div>
                    );
                  })
                : null}
            </div>

            <PopIn delay={110}>
              <div
                style={{
                  width: 440,
                  border: `1px solid ${brand.borderStrong}`,
                  background: brand.creamCard,
                  padding: 28,
                  position: "relative",
                  opacity: showSubmit ? 1 : 0,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 20,
                    right: 20,
                    background: brand.green,
                    color: brand.white,
                    fontFamily: fontFamily.sans,
                    fontWeight: 800,
                    fontSize: 13,
                    padding: "6px 12px",
                    transform: `rotate(-5deg) scale(${interpolate(
                      spring({
                        frame: frame - 120,
                        fps,
                        config: { damping: 8, stiffness: 300 },
                      }),
                      [0, 1],
                      [0.5, 1],
                    )})`,
                  }}
                >
                  SUBMITTED
                </div>

                <Eyebrow>builder submission</Eyebrow>
                <div
                  style={{
                    marginTop: 16,
                    height: 180,
                    background: brand.black,
                    display: "grid",
                    placeItems: "center",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      width: 0,
                      height: 0,
                      borderLeft: "20px solid white",
                      borderTop: "14px solid transparent",
                      borderBottom: "14px solid transparent",
                      marginLeft: 6,
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      bottom: 12,
                      left: 14,
                      color: "rgba(255,255,255,0.7)",
                      fontSize: 14,
                    }}
                  >
                    demo.mp4 · 1:48
                  </div>
                </div>
                <div
                  style={{
                    marginTop: 14,
                    padding: "12px 14px",
                    border: `1px solid ${brand.border}`,
                    background: brand.white,
                    fontFamily: fontFamily.sans,
                    fontSize: 15,
                    fontWeight: 600,
                  }}
                >
                  github.com/aarav/stripe-trial
                </div>
              </div>
            </PopIn>
          </div>
        </AbsoluteFill>
      </RulerSection>
    </SceneShell>
  );
};
