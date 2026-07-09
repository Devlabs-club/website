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
  OrangeChip,
  PopIn,
  RulerSection,
  SceneShell,
  SnapIn,
} from "../components/Brand";
import { fontFamily } from "../components/Fonts";

export const Proof: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const dissolve = interpolate(frame, [14, 48], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const profileIn = spring({
    frame: frame - 40,
    fps,
    config: { damping: 11, stiffness: 220, mass: 0.4 },
  });

  const panelIn = spring({
    frame: frame - 70,
    fps,
    config: { damping: 12, stiffness: 200 },
  });

  const bars = [0.92, 0.78, 0.86, 0.7, 0.95, 0.6, 0.88, 0.74, 0.81, 0.67, 0.9, 0.55];

  return (
    <SceneShell>
      <RulerSection>
        <AbsoluteFill style={{ padding: "56px 100px" }}>
          <SnapIn>
            <Eyebrow>proof of work</Eyebrow>
            <DisplayHeadline size={64} style={{ marginTop: 16 }}>
              proof, not promises
            </DisplayHeadline>
          </SnapIn>

          <div style={{ display: "flex", gap: 32, marginTop: 36 }}>
            <div style={{ position: "relative", width: 500, height: 580 }}>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: brand.creamPanel,
                  border: `1px solid ${brand.border}`,
                  padding: 32,
                  opacity: 1 - dissolve,
                  transform: `scale(${1 - dissolve * 0.06}) rotate(${dissolve * -3}deg)`,
                  filter: `blur(${dissolve * 5}px)`,
                }}
              >
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      height: 10,
                      width: `${65 + (i % 4) * 8}%`,
                      background: brand.border,
                      marginBottom: 12,
                    }}
                  />
                ))}
              </div>

              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: brand.white,
                  border: `1px solid ${brand.borderStrong}`,
                  padding: 28,
                  opacity: interpolate(profileIn, [0, 1], [0, 1]),
                  transform: `scale(${interpolate(profileIn, [0, 1], [0.92, 1])})`,
                }}
              >
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      background: brand.orange,
                      display: "grid",
                      placeItems: "center",
                      color: brand.white,
                      fontFamily: fontFamily.sans,
                      fontWeight: 800,
                      fontSize: 18,
                    }}
                  >
                    AV
                  </div>
                  <div>
                    <div style={{ fontFamily: fontFamily.sans, fontSize: 24, fontWeight: 800 }}>
                      Aarav V.
                    </div>
                    <div style={{ fontSize: 15, color: brand.blackSoft, marginTop: 2 }}>
                      Builder · Stripe billing systems
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 24 }}>
                  <Eyebrow>GitHub signal</Eyebrow>
                  <div
                    style={{
                      marginTop: 12,
                      display: "grid",
                      gridTemplateColumns: "repeat(12, 1fr)",
                      gap: 5,
                      height: 64,
                      alignItems: "end",
                    }}
                  >
                    {bars.map((h, i) => (
                      <div
                        key={i}
                        style={{
                          height: `${h * 100 * interpolate(frame, [48 + i * 2, 62 + i * 2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}%`,
                          background: i % 3 === 0 ? brand.orange : "#ffd2b0",
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 20, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {["DevHacks winner", "Live demo", "Founder ref"].map((b, i) => (
                    <PopIn key={b} delay={60 + i * 8}>
                      <OrangeChip>{b}</OrangeChip>
                    </PopIn>
                  ))}
                </div>

                <div
                  style={{
                    marginTop: "auto",
                    paddingTop: 24,
                    fontFamily: fontFamily.sans,
                    fontSize: 16,
                    fontStyle: "italic",
                    color: brand.blackMuted,
                    borderTop: `1px solid ${brand.border}`,
                  }}
                >
                  &ldquo;Shipped our billing rewrite in 3 weeks.&rdquo; — founder ref
                </div>
              </div>

              <PopIn delay={55} style={{ position: "absolute", top: 16, right: -12 }}>
                <div
                  style={{
                    background: brand.orange,
                    color: brand.white,
                    fontFamily: fontFamily.sans,
                    fontWeight: 800,
                    fontSize: 14,
                    padding: "8px 14px",
                    transform: "rotate(6deg)",
                  }}
                >
                  PROOF
                </div>
              </PopIn>
            </div>

            <div
              style={{
                flex: 1,
                border: `1px solid ${brand.border}`,
                background: brand.white,
                padding: 32,
                opacity: interpolate(panelIn, [0, 1], [0, 1]),
                transform: `translateX(${interpolate(panelIn, [0, 1], [32, 0])}px)`,
              }}
            >
              <DisplayHeadline size={36}>Why this builder ranks</DisplayHeadline>

              <div style={{ marginTop: 28 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: brand.green,
                  }}
                >
                  Strengths
                </div>
                {[
                  "Clear personal contribution on Stripe Connect",
                  "Strong relevant project — SaaS billing",
                ].map((s, i) => (
                  <div
                    key={s}
                    style={{
                      marginTop: 14,
                      fontFamily: fontFamily.sans,
                      fontSize: 20,
                      fontWeight: 600,
                      opacity: interpolate(frame, [90 + i * 10, 100 + i * 10], [0, 1], {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                      }),
                    }}
                  >
                    • {s}
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 28 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: brand.amber,
                  }}
                >
                  Risks
                </div>
                <div
                  style={{
                    marginTop: 14,
                    fontFamily: fontFamily.sans,
                    fontSize: 20,
                    fontWeight: 600,
                    opacity: interpolate(frame, [115, 128], [0, 1], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    }),
                  }}
                >
                  • Lighter backend depth — verify in trial
                </div>
              </div>

              <div
                style={{
                  marginTop: "auto",
                  paddingTop: 40,
                  fontFamily: fontFamily.sans,
                  fontSize: 18,
                  color: brand.blackSoft,
                }}
              >
                Every ranking comes with receipts. No black box.
              </div>
            </div>
          </div>
        </AbsoluteFill>
      </RulerSection>
    </SceneShell>
  );
};
