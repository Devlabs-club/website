import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { colors, fonts } from "../theme";
import { BodyText, DisplayText, SceneShell, SoftGlow } from "../components/Shared";

const resumes = [
  { name: "Senior Engineer", kw: "React · Node · AWS", match: "94%" },
  { name: "Full Stack Dev", kw: "TypeScript · SQL", match: "91%" },
  { name: "Software Engineer", kw: "Python · Docker", match: "89%" },
  { name: "Backend Engineer", kw: "Go · Kubernetes", match: "87%" },
  { name: "Platform Engineer", kw: "AWS · Terraform", match: "86%" },
  { name: "Staff Engineer", kw: "Java · Kafka", match: "85%" },
];

export const Enemy: React.FC = () => {
  const frame = useCurrentFrame();
  const scroll = interpolate(frame, [0, 240], [0, -280]);

  const headlineOpacity = interpolate(frame, [8, 28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneShell background="#efe8e1">
      <SoftGlow top={-100} right={-80} size={600} opacity={0.1} />
      <AbsoluteFill style={{ padding: "72px 96px" }}>
        <div style={{ opacity: headlineOpacity, marginBottom: 48 }}>
          <DisplayText size={64}>Every hiring platform</DisplayText>
          <DisplayText size={64} style={{ marginTop: 4 }}>
            does the same thing.
          </DisplayText>
          <BodyText size={32} style={{ marginTop: 20 }}>
            match keyword → to resume
          </BodyText>
        </div>

        <div
          style={{
            position: "relative",
            height: 620,
            overflow: "hidden",
            borderRadius: 24,
            border: `1px solid ${colors.grey}`,
            background: colors.creamDark,
          }}
        >
          <div
            style={{
              transform: `translateY(${scroll}px)`,
              padding: 28,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {[...resumes, ...resumes].map((r, i) => {
              const pulse = 0.55 + 0.45 * Math.sin((frame + i * 12) / 10);
              return (
                <div
                  key={`${r.name}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "22px 28px",
                    background: colors.white,
                    borderRadius: 14,
                    border: `1px solid ${colors.grey}`,
                    opacity: 0.72,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: fonts.sans,
                        fontSize: 28,
                        fontWeight: 650,
                        color: colors.ink,
                      }}
                    >
                      {r.name}
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        fontFamily: fonts.mono,
                        fontSize: 18,
                        color: colors.greyDark,
                      }}
                    >
                      {r.kw.split(" · ").map((k, ki) => (
                        <span key={k}>
                          {ki > 0 ? " · " : ""}
                          <span
                            style={{
                              background: `rgba(255,116,23,${0.12 * pulse})`,
                              padding: "2px 6px",
                              borderRadius: 4,
                            }}
                          >
                            {k}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: fonts.sans,
                      fontSize: 22,
                      fontWeight: 700,
                      color: colors.orange,
                      opacity: 0.45 + pulse * 0.35,
                      border: `1.5px solid ${colors.orange}`,
                      borderRadius: 999,
                      padding: "8px 16px",
                    }}
                  >
                    {r.match}
                  </div>
                </div>
              );
            })}
          </div>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, transparent 60%, #efe8e1 100%)",
              pointerEvents: "none",
            }}
          />
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};
