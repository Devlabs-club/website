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
    frame: frame - 25,
    fps,
    config: { damping: 12, stiffness: 180 },
  });

  const showBrief = frame >= 55;
  const showSubmit = frame >= 170;

  return (
    <SceneShell>
      <SoftGlow top={-60} right={100} size={580} opacity={0.14} />
      <AbsoluteFill style={{ padding: "72px 110px" }}>
        <div
          style={{
            opacity: interpolate(frame, [0, 18], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            marginBottom: 40,
          }}
        >
          <DisplayText size={52}>Don&apos;t interview builders.</DisplayText>
          <DisplayText size={52} style={{ marginTop: 6 }}>
            Watch them build.
          </DisplayText>
        </div>

        <div style={{ display: "flex", gap: 40 }}>
          {/* Generate trial panel */}
          <div
            style={{
              flex: 1,
              background: colors.white,
              borderRadius: 20,
              border: `1px solid ${colors.grey}`,
              padding: 36,
              minHeight: 520,
            }}
          >
            <div
              style={{
                fontFamily: fonts.sans,
                fontSize: 20,
                fontWeight: 650,
                color: colors.muted,
                marginBottom: 24,
              }}
            >
              Role → Trial Project
            </div>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 12,
                background: colors.orange,
                color: colors.white,
                fontFamily: fonts.sans,
                fontWeight: 750,
                fontSize: 24,
                padding: "16px 28px",
                borderRadius: 14,
                transform: `scale(${interpolate(click, [0, 1], [1, 0.94])})`,
                boxShadow: "0 10px 28px rgba(255,116,23,0.3)",
                marginBottom: 32,
              }}
            >
              Generate trial
            </div>

            {showBrief
              ? briefLines.map((line, i) => {
                  const start = 60 + i * 18;
                  const chars = Math.floor(
                    interpolate(frame, [start, start + 22], [0, line.length], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    }),
                  );
                  return (
                    <div
                      key={line}
                      style={{
                        fontFamily: fonts.mono,
                        fontSize: 22,
                        color: colors.ink,
                        marginBottom: 18,
                        opacity: chars > 0 ? 1 : 0,
                      }}
                    >
                      {line.slice(0, chars)}
                      {chars > 0 && chars < line.length ? (
                        <span style={{ color: colors.orange }}>▌</span>
                      ) : null}
                    </div>
                  );
                })
              : null}
          </div>

          {/* Submission */}
          <div
            style={{
              width: 480,
              background: colors.white,
              borderRadius: 20,
              border: `1px solid ${colors.grey}`,
              padding: 36,
              opacity: showSubmit
                ? interpolate(frame, [170, 190], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  })
                : 0,
              transform: `translateY(${showSubmit ? interpolate(frame, [170, 190], [30, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 30}px)`,
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 28,
                right: 28,
                background: colors.green,
                color: colors.white,
                fontWeight: 800,
                fontSize: 16,
                padding: "8px 14px",
                borderRadius: 8,
                transform: `rotate(-6deg) scale(${interpolate(
                  spring({
                    frame: frame - 195,
                    fps,
                    config: { damping: 10, stiffness: 160 },
                  }),
                  [0, 1],
                  [0.4, 1],
                )})`,
              }}
            >
              SUBMITTED
            </div>

            <div
              style={{
                fontFamily: fonts.sans,
                fontSize: 20,
                fontWeight: 650,
                color: colors.muted,
                marginBottom: 24,
              }}
            >
              Builder submission
            </div>

            <div
              style={{
                height: 200,
                borderRadius: 14,
                background: `linear-gradient(145deg, #2a241f, #4a3a2f)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 20,
                position: "relative",
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    width: 0,
                    height: 0,
                    borderLeft: "18px solid white",
                    borderTop: "12px solid transparent",
                    borderBottom: "12px solid transparent",
                    marginLeft: 4,
                  }}
                />
              </div>
              <div
                style={{
                  position: "absolute",
                  bottom: 14,
                  left: 16,
                  color: "rgba(255,255,255,0.85)",
                  fontSize: 16,
                  fontWeight: 600,
                }}
              >
                demo.mp4 · 1:48
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "16px 18px",
                background: colors.cream,
                borderRadius: 12,
                fontFamily: fonts.mono,
                fontSize: 18,
              }}
            >
              <span style={{ color: colors.orange, fontWeight: 800 }}>⌘</span>
              github.com/maya/stripe-trial
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};
