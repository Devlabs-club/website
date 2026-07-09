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
  DarkActGlow,
  DisplayHeadline,
  Eyebrow,
  LandingGrid,
  PopIn,
  SceneShell,
  SnapIn,
} from "../components/Brand";
import { fontFamily } from "../components/Fonts";

export const Secret: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const phoneIn = spring({
    frame: frame - 30,
    fps,
    config: { damping: 11, stiffness: 220, mass: 0.4 },
  });

  const bubble1 = spring({
    frame: frame - 60,
    fps,
    config: { damping: 10, stiffness: 260, mass: 0.35 },
  });

  const bubble2 = spring({
    frame: frame - 85,
    fps,
    config: { damping: 10, stiffness: 260, mass: 0.35 },
  });

  const chips = ["shipping", "demo day", "hackathon", "PR merged"];

  return (
    <SceneShell background={brand.darkAct} dark>
      <DarkActGlow />
      <div style={{ position: "absolute", inset: 0, opacity: 0.35 }}>
        <LandingGrid />
      </div>

      {chips.map((label, i) => (
        <div
          key={label}
          style={{
            position: "absolute",
            left: `${10 + i * 20}%`,
            top: `${18 + (i % 2) * 10}%`,
            padding: "8px 14px",
            border: "1px solid rgba(255,200,140,0.25)",
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,230,200,0.85)",
            fontFamily: fontFamily.sans,
            fontSize: 14,
            fontWeight: 650,
            opacity: interpolate(frame, [8 + i * 8, 22 + i * 8], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            transform: `translateY(${Math.sin((frame + i * 12) / 18) * 5}px)`,
          }}
        >
          {label}
        </div>
      ))}

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 64,
        }}
      >
        <SnapIn>
          <Eyebrow>the moat</Eyebrow>
          <DisplayHeadline size={52} color={brand.white} style={{ marginTop: 16 }}>
            Seen in the room.
          </DisplayHeadline>
          <DisplayHeadline size={52} color={brand.orange} style={{ marginTop: 6 }}>
            Not scraped off a resume.
          </DisplayHeadline>
        </SnapIn>

        <div
          style={{
            marginTop: 40,
            opacity: interpolate(phoneIn, [0, 1], [0, 1]),
            transform: `translateY(${interpolate(phoneIn, [0, 1], [40, 0])}px) scale(${interpolate(phoneIn, [0, 1], [0.9, 1])})`,
            width: 320,
            height: 580,
            borderRadius: 36,
            background: "#111",
            border: "2px solid rgba(255,255,255,0.12)",
            padding: 14,
            boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
          }}
        >
          <div
            style={{
              flex: 1,
              height: "100%",
              background: "#0a0a0a",
              borderRadius: 28,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div
              style={{
                textAlign: "center",
                color: "rgba(255,255,255,0.4)",
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              iMessage · DevLabs
            </div>

            <div
              style={{
                alignSelf: "flex-start",
                maxWidth: "90%",
                background: "#1c1c1c",
                color: "#eee",
                padding: "11px 14px",
                borderRadius: "16px 16px 16px 4px",
                fontSize: 15,
                lineHeight: 1.35,
                opacity: interpolate(bubble1, [0, 1], [0, 1]),
                transform: `scale(${interpolate(bubble1, [0, 1], [0.85, 1])})`,
                transformOrigin: "bottom left",
              }}
            >
              Hey — a founder wants to intro you about a Stripe billing role.
            </div>

            <div
              style={{
                alignSelf: "flex-end",
                maxWidth: "82%",
                background: brand.blue,
                color: brand.white,
                padding: "11px 14px",
                borderRadius: "16px 16px 4px 16px",
                fontSize: 15,
                opacity: interpolate(bubble2, [0, 1], [0, 1]),
                transform: `scale(${interpolate(bubble2, [0, 1], [0.85, 1])})`,
                transformOrigin: "bottom right",
              }}
            >
              sounds good — send it
            </div>

            <PopIn delay={120} style={{ marginTop: "auto", textAlign: "center" }}>
              <div
                style={{
                  fontFamily: fontFamily.sans,
                  fontSize: 13,
                  color: "rgba(255,255,255,0.45)",
                }}
              >
                No forms. No portal. Just text.
              </div>
            </PopIn>
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};
