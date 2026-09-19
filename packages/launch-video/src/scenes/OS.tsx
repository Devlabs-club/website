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
  RulerSection,
  SceneShell,
  SnapIn,
} from "../components/Brand";
import { fontFamily } from "../components/Fonts";

const columns = ["Recommended", "Outreach", "Trial", "Hired"] as const;

export const OS: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = interpolate(frame, [30, 150], [0, 3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const colIndex = Math.min(3, Math.floor(progress));

  const boardIn = spring({
    frame: frame - 6,
    fps,
    config: { damping: 12, stiffness: 200, mass: 0.4 },
  });

  const fadeCompetitors = interpolate(frame, [20, 60], [0.6, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneShell>
      <RulerSection>
        <AbsoluteFill style={{ padding: "56px 100px" }}>
          <SnapIn>
            <Eyebrow>devlabs os</Eyebrow>
            <DisplayHeadline size={56} style={{ marginTop: 16 }}>
              One hiring OS. Start to hire.
            </DisplayHeadline>
          </SnapIn>

          <div
            style={{
              position: "absolute",
              top: 120,
              right: 100,
              display: "flex",
              gap: 12,
              opacity: fadeCompetitors,
            }}
          >
            {["Recruiter", "ATS", "Job board"].map((l) => (
              <div
                key={l}
                style={{
                  padding: "8px 14px",
                  border: `1px dashed ${brand.blackSoft}`,
                  fontSize: 14,
                  fontWeight: 650,
                  color: brand.blackSoft,
                  textDecoration: "line-through",
                }}
              >
                {l}
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 36,
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 0,
              border: `1px solid ${brand.border}`,
              opacity: interpolate(boardIn, [0, 1], [0, 1]),
              transform: `translateY(${interpolate(boardIn, [0, 1], [20, 0])}px)`,
            }}
          >
            {columns.map((col, i) => {
              const active = i === colIndex;
              return (
                <div
                  key={col}
                  style={{
                    background: active ? brand.creamCard : brand.creamPanel,
                    borderRight: i < 3 ? `1px solid ${brand.border}` : "none",
                    minHeight: 480,
                    padding: 20,
                  }}
                >
                  <div
                    style={{
                      fontFamily: fontFamily.sans,
                      fontSize: 12,
                      fontWeight: 800,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: active ? brand.orange : brand.blackSoft,
                      marginBottom: 16,
                    }}
                  >
                    {col}
                  </div>

                  {i < colIndex ? (
                    <div
                      style={{
                        height: 90,
                        border: `1px dashed ${brand.border}`,
                        background: brand.white,
                        opacity: 0.5,
                      }}
                    />
                  ) : null}

                  {i === colIndex ? (
                    <div
                      style={{
                        border: `2px solid ${brand.orange}`,
                        background: brand.white,
                        padding: 16,
                        boxShadow: "0 14px 36px rgba(255,116,23,0.18)",
                      }}
                    >
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            background: brand.orange,
                            color: brand.white,
                            display: "grid",
                            placeItems: "center",
                            fontWeight: 800,
                            fontSize: 13,
                          }}
                        >
                          AV
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 18 }}>Aarav V.</div>
                          <div style={{ fontSize: 13, color: brand.blackSoft }}>
                            Stripe billing builder
                          </div>
                        </div>
                      </div>
                      <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {(i === 0
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
                              fontSize: 12,
                              fontWeight: 700,
                              background: brand.orangeTint,
                              color: brand.orangeDark,
                              border: `1px solid rgba(255,116,23,0.35)`,
                              padding: "4px 8px",
                            }}
                          >
                            {chip}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      </RulerSection>
    </SceneShell>
  );
};
