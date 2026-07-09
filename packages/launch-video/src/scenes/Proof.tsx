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

export const Proof: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const dissolve = interpolate(frame, [20, 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const profileIn = spring({
    frame: frame - 55,
    fps,
    config: { damping: 14, stiffness: 120 },
  });

  const panelIn = spring({
    frame: frame - 130,
    fps,
    config: { damping: 14, stiffness: 130 },
  });

  const stamp = spring({
    frame: frame - 100,
    fps,
    config: { damping: 12, stiffness: 160 },
  });

  const bars = [0.92, 0.78, 0.86, 0.7, 0.95, 0.6, 0.88, 0.74, 0.81, 0.67, 0.9, 0.55];

  return (
    <SceneShell>
      <SoftGlow bottom={-80} left={-40} size={560} opacity={0.12} />
      <AbsoluteFill style={{ padding: "64px 96px" }}>
        <div
          style={{
            opacity: interpolate(frame, [0, 18], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            marginBottom: 36,
          }}
        >
          <DisplayText size={56}>proof, not promises</DisplayText>
        </div>

        <div style={{ display: "flex", gap: 40, alignItems: "stretch" }}>
          {/* Resume dissolving / profile forming */}
          <div style={{ position: "relative", width: 520, height: 640 }}>
            {/* Grey resume */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "#e8e2db",
                borderRadius: 16,
                border: `1px solid ${colors.grey}`,
                padding: 36,
                opacity: 1 - dissolve,
                transform: `scale(${1 - dissolve * 0.08}) rotate(${dissolve * -4}deg)`,
                filter: `blur(${dissolve * 6}px)`,
              }}
            >
              <div
                style={{
                  height: 18,
                  width: "60%",
                  background: "#cfc7be",
                  borderRadius: 4,
                  marginBottom: 24,
                }}
              />
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: 12,
                    width: `${70 + (i % 3) * 10}%`,
                    background: "#d9d2cb",
                    borderRadius: 3,
                    marginBottom: 14,
                  }}
                />
              ))}
            </div>

            {/* Live profile */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: colors.white,
                borderRadius: 20,
                border: `1px solid ${colors.grey}`,
                padding: 32,
                opacity: interpolate(profileIn, [0, 1], [0, 1]),
                transform: `scale(${interpolate(profileIn, [0, 1], [0.9, 1])})`,
                boxShadow: "0 20px 50px rgba(17,17,17,0.08)",
                display: "flex",
                flexDirection: "column",
                gap: 22,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 16,
                    background: `linear-gradient(135deg, ${colors.orange}, #ffb070)`,
                  }}
                />
                <div>
                  <div
                    style={{
                      fontFamily: fonts.sans,
                      fontSize: 28,
                      fontWeight: 750,
                    }}
                  >
                    Maya Chen
                  </div>
                  <div
                    style={{
                      fontFamily: fonts.sans,
                      fontSize: 18,
                      color: colors.muted,
                      marginTop: 4,
                    }}
                  >
                    Builder · Stripe billing systems
                  </div>
                </div>
              </div>

              {/* Contribution bars */}
              <div>
                <div
                  style={{
                    fontFamily: fonts.sans,
                    fontSize: 14,
                    fontWeight: 650,
                    color: colors.muted,
                    marginBottom: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  GitHub signal
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(12, 1fr)",
                    gap: 6,
                    height: 72,
                    alignItems: "end",
                  }}
                >
                  {bars.map((h, i) => (
                    <div
                      key={i}
                      style={{
                        height: `${h * 100 * interpolate(frame, [70 + i * 3, 95 + i * 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}%`,
                        background: i % 3 === 0 ? colors.orange : "#ffd2b0",
                        borderRadius: 4,
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {["DevHacks winner", "Live demo", "Founder ref"].map((b, i) => (
                  <span
                    key={b}
                    style={{
                      opacity: interpolate(frame, [90 + i * 10, 105 + i * 10], [0, 1], {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                      }),
                      background: colors.creamDark,
                      border: `1px solid ${colors.grey}`,
                      borderRadius: 999,
                      padding: "8px 14px",
                      fontSize: 16,
                      fontWeight: 650,
                    }}
                  >
                    {b}
                  </span>
                ))}
              </div>

              <div
                style={{
                  marginTop: "auto",
                  padding: 16,
                  background: colors.cream,
                  borderRadius: 12,
                  fontFamily: fonts.sans,
                  fontSize: 18,
                  color: colors.ink,
                  fontStyle: "italic",
                }}
              >
                “Shipped our billing rewrite in 3 weeks.” — founder ref
              </div>
            </div>

            {/* Stamp */}
            <div
              style={{
                position: "absolute",
                top: 24,
                right: -20,
                background: colors.orange,
                color: colors.white,
                fontFamily: fonts.sans,
                fontWeight: 800,
                fontSize: 18,
                padding: "10px 18px",
                borderRadius: 10,
                transform: `rotate(8deg) scale(${interpolate(stamp, [0, 1], [0.5, 1])})`,
                opacity: interpolate(stamp, [0, 1], [0, 1]),
                zIndex: 3,
              }}
            >
              PROOF
            </div>
          </div>

          {/* Why panel */}
          <div
            style={{
              flex: 1,
              opacity: interpolate(panelIn, [0, 1], [0, 1]),
              transform: `translateX(${interpolate(panelIn, [0, 1], [40, 0])}px)`,
              background: colors.white,
              borderRadius: 20,
              border: `1px solid ${colors.grey}`,
              padding: 36,
              display: "flex",
              flexDirection: "column",
              gap: 28,
            }}
          >
            <div
              style={{
                fontFamily: fonts.display,
                fontSize: 36,
                fontWeight: 700,
              }}
            >
              Why this builder ranks
            </div>

            <div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 750,
                  color: colors.green,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginBottom: 14,
                }}
              >
                Strengths
              </div>
              {[
                { text: "Clear personal contribution on Stripe Connect", wire: 0 },
                { text: "Strong relevant project — SaaS billing", wire: 1 },
              ].map((s, i) => (
                <div
                  key={s.text}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 14,
                    marginBottom: 14,
                    opacity: interpolate(frame, [150 + i * 15, 165 + i * 15], [0, 1], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    }),
                  }}
                >
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: colors.green,
                      marginTop: 10,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ fontSize: 24, fontWeight: 550, lineHeight: 1.35 }}>
                    {s.text}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 750,
                  color: colors.amber,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginBottom: 14,
                }}
              >
                Risks
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  opacity: interpolate(frame, [185, 205], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: colors.amber,
                    marginTop: 10,
                    flexShrink: 0,
                  }}
                />
                <div style={{ fontSize: 24, fontWeight: 550, lineHeight: 1.35 }}>
                  Lighter backend depth — verify in trial
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: "auto",
                fontFamily: fonts.sans,
                fontSize: 22,
                color: colors.muted,
                fontWeight: 500,
              }}
            >
              Every ranking comes with receipts. No black box.
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};
