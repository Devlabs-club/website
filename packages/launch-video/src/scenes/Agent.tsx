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
  CornerSquares,
  Eyebrow,
  OrangeChip,
  PopIn,
  RulerSection,
  SceneShell,
  SnapIn,
} from "../components/Brand";
import { fontFamily } from "../components/Fonts";

const QUERY = "Find me a cracked dev who's shipped Stripe billing";

const builders = [
  {
    name: "Aarav V.",
    initials: "AV",
    proof: ["Stripe Connect · SaaS billing", "Checkout migration · Next.js"],
    rank: 1,
  },
  {
    name: "Niki K.",
    initials: "NK",
    proof: ["Payments infra · Node", "Subscription billing · React"],
    rank: 2,
  },
  {
    name: "Maya C.",
    initials: "MC",
    proof: ["Fintech MVP · TypeScript", "Webhook reliability · Go"],
    rank: 3,
  },
];

export const Agent: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const typedChars = Math.floor(
    interpolate(frame, [12, 72], [0, QUERY.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const typed = QUERY.slice(0, typedChars);
  const showCursor = frame < 78 || Math.floor(frame / 6) % 2 === 0;
  const searchHit = frame >= 78;

  return (
    <SceneShell>
      <RulerSection>
        <AbsoluteFill style={{ padding: "64px 100px" }}>
          <SnapIn>
            <Eyebrow>founder agent</Eyebrow>
          </SnapIn>

          <div
            style={{
              marginTop: 32,
              position: "relative",
              border: `3px solid ${brand.blue}`,
              background: brand.blueTint,
              padding: 28,
              boxShadow: "0 18px 55px rgba(12,62,96,0.12)",
            }}
          >
            <CornerSquares delay={8} />

            <div
              style={{
                background: brand.white,
                border: `2px solid ${brand.black}`,
                padding: 20,
                position: "relative",
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  border: `1px solid rgba(255,116,23,0.6)`,
                  background: brand.orangeTint,
                  padding: "8px 12px",
                  marginBottom: 16,
                  fontFamily: fontFamily.sans,
                  fontSize: 14,
                  fontWeight: 650,
                  color: brand.orangeDark,
                }}
              >
                <span style={{ color: brand.orange }}>✦</span> Builder search
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  border: `1px solid ${brand.black}`,
                  background: brand.white,
                  padding: "14px 16px",
                  boxShadow: searchHit
                    ? `0 0 0 2px ${brand.orange}`
                    : "none",
                }}
              >
                <span style={{ fontSize: 20 }}>⌕</span>
                <div
                  style={{
                    flex: 1,
                    fontFamily: fontFamily.sans,
                    fontSize: 26,
                    fontWeight: 500,
                    letterSpacing: "-0.02em",
                    color: brand.black,
                  }}
                >
                  {typed}
                  {showCursor && frame < 82 ? (
                    <span style={{ color: brand.orange }}>|</span>
                  ) : null}
                </div>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    border: `1px solid ${brand.black}`,
                    display: "grid",
                    placeItems: "center",
                    color: brand.orange,
                    background: searchHit ? brand.orange : brand.white,
                    ...(searchHit ? { color: brand.white } : {}),
                  }}
                >
                  →
                </div>
              </div>

              <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                {builders.map((b, i) => {
                  const delay = 88 + i * 14;
                  const s = spring({
                    frame: frame - delay,
                    fps,
                    config: { damping: 10, stiffness: 260, mass: 0.35 },
                  });
                  return (
                    <div
                      key={b.name}
                      style={{
                        opacity: interpolate(s, [0, 1], [0, 1]),
                        transform: `translateX(${interpolate(s, [0, 1], [40, 0])}px)`,
                        border: `1px solid ${brand.borderStrong}`,
                        background: brand.creamCard,
                        padding: 16,
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                      }}
                    >
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          display: "grid",
                          placeItems: "center",
                          background: i === 0 ? brand.orange : brand.black,
                          color: brand.white,
                          fontFamily: fontFamily.sans,
                          fontSize: 14,
                          fontWeight: 800,
                        }}
                      >
                        {b.initials}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontFamily: fontFamily.sans,
                            fontSize: 20,
                            fontWeight: 700,
                          }}
                        >
                          {b.name}
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                          {b.proof.map((p) => (
                            <OrangeChip key={p}>{p}</OrangeChip>
                          ))}
                        </div>
                      </div>
                      <div
                        style={{
                          fontFamily: fontFamily.sans,
                          fontSize: 13,
                          fontWeight: 700,
                          color: brand.blackSoft,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        evidence-ranked
                      </div>
                    </div>
                  );
                })}
              </div>

              <PopIn delay={140} style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["Shipped projects", "Hackathon finalist", "Available this week"].map((c) => (
                  <OrangeChip key={c}>{c}</OrangeChip>
                ))}
              </PopIn>
            </div>
          </div>
        </AbsoluteFill>
      </RulerSection>
    </SceneShell>
  );
};
