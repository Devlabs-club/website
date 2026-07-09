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

const columns = ["Recommended", "Outreach", "Trial", "Hired"] as const;

export const OS: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Card progresses across 4 columns
  const progress = interpolate(frame, [40, 200], [0, 3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const colIndex = Math.min(3, Math.floor(progress));
  const colFrac = progress - Math.floor(progress);

  const boardIn = spring({
    frame: frame - 8,
    fps,
    config: { damping: 16, stiffness: 120 },
  });

  const logosOpacity = interpolate(frame, [30, 80], [0.55, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneShell>
      <SoftGlow top={-80} left="40%" size={640} opacity={0.12} />
      <AbsoluteFill style={{ padding: "64px 90px" }}>
        <div
          style={{
            opacity: interpolate(frame, [0, 16], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            marginBottom: 28,
          }}
        >
          <DisplayText size={48}>One hiring OS. Start to hire.</DisplayText>
          <div
            style={{
              marginTop: 12,
              fontFamily: fonts.sans,
              fontSize: 26,
              color: colors.muted,
              fontWeight: 500,
            }}
          >
            Sourcing, intros, calls, trials — one system.
          </div>
        </div>

        {/* Fading competitor logos */}
        <div
          style={{
            position: "absolute",
            top: 180,
            right: 100,
            display: "flex",
            gap: 18,
            opacity: logosOpacity,
            zIndex: 0,
          }}
        >
          {["Recruiter", "ATS", "Job board"].map((l) => (
            <div
              key={l}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: `1px dashed ${colors.greyDark}`,
                color: colors.greyDark,
                fontSize: 16,
                fontWeight: 650,
                textDecoration: "line-through",
              }}
            >
              {l}
            </div>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 18,
            marginTop: 24,
            opacity: interpolate(boardIn, [0, 1], [0, 1]),
            transform: `translateY(${interpolate(boardIn, [0, 1], [24, 0])}px)`,
            position: "relative",
            zIndex: 1,
          }}
        >
          {columns.map((col, i) => {
            const active = i === colIndex;
            return (
              <div
                key={col}
                style={{
                  background: colors.creamDark,
                  borderRadius: 18,
                  border: `1px solid ${active ? colors.orange : colors.grey}`,
                  minHeight: 520,
                  padding: 18,
                  position: "relative",
                }}
              >
                <div
                  style={{
                    fontFamily: fonts.sans,
                    fontSize: 18,
                    fontWeight: 750,
                    color: active ? colors.orange : colors.muted,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    marginBottom: 16,
                    padding: "4px 8px",
                  }}
                >
                  {col}
                </div>

                {/* Static ghost cards in other columns */}
                {i < colIndex ? (
                  <div
                    style={{
                      height: 110,
                      borderRadius: 12,
                      background: "rgba(255,255,255,0.45)",
                      border: `1px dashed ${colors.grey}`,
                      marginBottom: 12,
                    }}
                  />
                ) : null}

                {/* Moving card */}
                {i === colIndex ? (
                  <div
                    style={{
                      background: colors.white,
                      borderRadius: 14,
                      border: `2px solid ${colors.orange}`,
                      padding: 18,
                      boxShadow: "0 14px 36px rgba(255,116,23,0.22)",
                      transform: `translateY(${colFrac * 8}px) scale(${1 + Math.sin(frame / 8) * 0.01})`,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        marginBottom: 12,
                      }}
                    >
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 10,
                          background: `linear-gradient(135deg, ${colors.orange}, #ffb070)`,
                        }}
                      />
                      <div>
                        <div style={{ fontWeight: 750, fontSize: 20 }}>Maya Chen</div>
                        <div style={{ fontSize: 14, color: colors.muted }}>
                          Stripe billing builder
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      {(
                        i === 0
                          ? ["Intro ready"]
                          : i === 1
                            ? ["Intro sent", "Call booked"]
                            : i === 2
                              ? ["Trial submitted"]
                              : ["Offer accepted"]
                      ).map((chip) => (
                        <span
                          key={chip}
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            background: "#fff0e6",
                            color: colors.orange,
                            borderRadius: 8,
                            padding: "5px 10px",
                          }}
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {i > colIndex ? (
                  <div
                    style={{
                      height: 90,
                      borderRadius: 12,
                      background: "rgba(255,255,255,0.25)",
                      border: `1px dashed ${colors.grey}`,
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};
