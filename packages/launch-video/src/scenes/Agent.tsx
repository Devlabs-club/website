import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, fonts } from "../theme";
import { SceneShell, SoftGlow } from "../components/Shared";

const QUERY = "full-stack who's actually shipped Stripe billing";

const builders = [
  {
    name: "Maya Chen",
    proof: ["Stripe Connect · SaaS billing", "Checkout migration · Next.js"],
    rank: 1,
  },
  {
    name: "Jordan Lee",
    proof: ["Payments infra · Node", "Subscription billing · React"],
    rank: 2,
  },
  {
    name: "Sam Okonkwo",
    proof: ["Fintech MVP · TypeScript", "Webhook reliability · Go"],
    rank: 3,
  },
  {
    name: "Alex Rivera",
    proof: ["Marketplace checkout · Remix", "PCI-aware flows · Postgres"],
    rank: 4,
  },
];

export const Agent: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const typedChars = Math.floor(
    interpolate(frame, [20, 110], [0, QUERY.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const typed = QUERY.slice(0, typedChars);
  const showCursor = frame < 125 || Math.floor(frame / 8) % 2 === 0;

  const enterHit = frame >= 120;
  const cardsStart = 135;

  return (
    <SceneShell>
      <SoftGlow top={-100} left={200} size={700} opacity={0.14} />
      <AbsoluteFill style={{ padding: "80px 120px" }}>
        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: 28,
            color: colors.muted,
            fontWeight: 600,
            marginBottom: 28,
            opacity: interpolate(frame, [0, 15], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          Founder Agent
        </div>

        {/* Input */}
        <div
          style={{
            background: colors.white,
            border: `2px solid ${enterHit ? colors.orange : colors.grey}`,
            borderRadius: 20,
            padding: "28px 36px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            boxShadow: enterHit
              ? "0 12px 40px rgba(255,116,23,0.18)"
              : "0 8px 28px rgba(17,17,17,0.06)",
            transform: `scale(${interpolate(
              spring({
                frame: frame - 8,
                fps,
                config: { damping: 16, stiffness: 140 },
              }),
              [0, 1],
              [0.96, 1],
            )})`,
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: colors.orange,
              flexShrink: 0,
            }}
          />
          <div
            style={{
              fontFamily: fonts.sans,
              fontSize: 34,
              fontWeight: 550,
              color: colors.ink,
              flex: 1,
              minHeight: 42,
            }}
          >
            {typed}
            {showCursor && frame < 130 ? (
              <span style={{ color: colors.orange }}>|</span>
            ) : null}
          </div>
          <div
            style={{
              background: colors.orange,
              color: colors.white,
              fontFamily: fonts.sans,
              fontWeight: 700,
              fontSize: 20,
              padding: "12px 22px",
              borderRadius: 12,
              opacity: typedChars > 10 ? 1 : 0.35,
            }}
          >
            Search
          </div>
        </div>

        {/* Ranked cards */}
        <div
          style={{
            marginTop: 48,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            position: "relative",
          }}
        >
          {/* Ranking line */}
          <div
            style={{
              position: "absolute",
              left: -8,
              top: 0,
              bottom: 0,
              width: 4,
              background: colors.orange,
              borderRadius: 999,
              transformOrigin: "top",
              transform: `scaleY(${interpolate(
                frame,
                [cardsStart + 20, cardsStart + 90],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              )})`,
            }}
          />

          {builders.map((b, i) => {
            const delay = cardsStart + i * 18;
            const s = spring({
              frame: frame - delay,
              fps,
              config: { damping: 13, stiffness: 150, mass: 0.55 },
            });
            return (
              <div
                key={b.name}
                style={{
                  opacity: interpolate(s, [0, 1], [0, 1]),
                  transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px) scale(${interpolate(s, [0, 1], [0.94, 1])})`,
                  background: colors.white,
                  borderRadius: 18,
                  border: `1px solid ${colors.grey}`,
                  padding: "22px 28px",
                  display: "flex",
                  alignItems: "center",
                  gap: 24,
                  marginLeft: 16,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background:
                      i === 0 ? colors.orange : colors.creamDark,
                    color: i === 0 ? colors.white : colors.ink,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: fonts.display,
                    fontWeight: 800,
                    fontSize: 24,
                  }}
                >
                  {b.rank}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontFamily: fonts.sans,
                      fontSize: 28,
                      fontWeight: 700,
                      color: colors.ink,
                    }}
                  >
                    {b.name}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      marginTop: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    {b.proof.map((p) => (
                      <span
                        key={p}
                        style={{
                          fontFamily: fonts.sans,
                          fontSize: 16,
                          fontWeight: 600,
                          color: colors.ink,
                          background: "#fff0e6",
                          border: `1px solid #ffd2b0`,
                          borderRadius: 8,
                          padding: "6px 12px",
                        }}
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: fonts.sans,
                    fontSize: 18,
                    fontWeight: 650,
                    color: colors.muted,
                  }}
                >
                  evidence-ranked
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};
