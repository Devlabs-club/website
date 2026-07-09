import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { colors, fonts } from "../theme";
import { DisplayText, SceneShell } from "../components/Shared";

export const Secret: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const phoneIn = spring({
    frame: frame - 40,
    fps,
    config: { damping: 14, stiffness: 120 },
  });

  const bubble1 = spring({
    frame: frame - 90,
    fps,
    config: { damping: 12, stiffness: 140 },
  });

  const bubble2 = spring({
    frame: frame - 130,
    fps,
    config: { damping: 12, stiffness: 140 },
  });

  // Warm "room" atmosphere with abstract builder silhouettes
  const people = [
    { x: 8, y: 55, w: 90, h: 220, delay: 0 },
    { x: 18, y: 48, w: 100, h: 260, delay: 8 },
    { x: 72, y: 52, w: 95, h: 240, delay: 14 },
    { x: 84, y: 58, w: 85, h: 210, delay: 6 },
  ];

  return (
    <SceneShell background="#2a221c">
      {/* Warm gradient atmosphere */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 30% 40%, #5a3a22 0%, transparent 55%), radial-gradient(ellipse at 70% 70%, #3d2a1c 0%, #1a1410 70%)",
        }}
      />

      {/* Soft light beams */}
      <div
        style={{
          position: "absolute",
          top: -100,
          left: "20%",
          width: 400,
          height: 800,
          background:
            "linear-gradient(180deg, rgba(255,180,100,0.18), transparent)",
          transform: "rotate(12deg)",
          filter: "blur(40px)",
        }}
      />

      {/* Builder silhouettes */}
      {people.map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            bottom: `${100 - p.y - 20}%`,
            width: p.w,
            height: p.h,
            borderRadius: "40px 40px 12px 12px",
            background: `linear-gradient(180deg, rgba(255,200,140,${0.08 + i * 0.02}), rgba(0,0,0,0.35))`,
            opacity: interpolate(frame, [p.delay, p.delay + 25], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            transform: `translateY(${Math.sin((frame + i * 20) / 25) * 4}px)`,
          }}
        />
      ))}

      {/* Floating "shipping" chips */}
      {["shipping", "demo day", "hackathon", "PR merged"].map((label, i) => (
        <div
          key={label}
          style={{
            position: "absolute",
            left: `${12 + i * 18}%`,
            top: `${22 + (i % 2) * 12}%`,
            padding: "8px 14px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,200,140,0.25)",
            color: "rgba(255,230,200,0.85)",
            fontSize: 16,
            fontWeight: 650,
            opacity: interpolate(frame, [20 + i * 12, 40 + i * 12], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            transform: `translateY(${Math.sin((frame + i * 15) / 20) * 6}px)`,
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
          justifyContent: "flex-start",
          paddingTop: 72,
        }}
      >
        <div
          style={{
            opacity: interpolate(frame, [0, 20], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            textAlign: "center",
            marginBottom: 36,
          }}
        >
          <DisplayText size={48} color={colors.cream}>
            Seen in the room.
          </DisplayText>
          <DisplayText size={48} color={colors.orangeSoft} style={{ marginTop: 6 }}>
            Not scraped off a resume.
          </DisplayText>
        </div>

        {/* Phone */}
        <div
          style={{
            opacity: interpolate(phoneIn, [0, 1], [0, 1]),
            transform: `translateY(${interpolate(phoneIn, [0, 1], [50, 0])}px) scale(${interpolate(phoneIn, [0, 1], [0.92, 1])})`,
            width: 340,
            height: 620,
            borderRadius: 40,
            background: "#111",
            border: "3px solid #3a3a3a",
            boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
            padding: 18,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 90,
                height: 10,
                borderRadius: 999,
                background: "#222",
              }}
            />
          </div>
          <div
            style={{
              flex: 1,
              background: "#0b0b0b",
              borderRadius: 28,
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div
              style={{
                textAlign: "center",
                color: "#888",
                fontSize: 14,
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              iMessage · DevLabs
            </div>

            <div
              style={{
                alignSelf: "flex-start",
                maxWidth: "88%",
                background: "#1f1f1f",
                color: "#eee",
                padding: "12px 16px",
                borderRadius: "18px 18px 18px 6px",
                fontSize: 17,
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
                maxWidth: "80%",
                background: "#0a84ff",
                color: "#fff",
                padding: "12px 16px",
                borderRadius: "18px 18px 6px 18px",
                fontSize: 17,
                lineHeight: 1.35,
                opacity: interpolate(bubble2, [0, 1], [0, 1]),
                transform: `scale(${interpolate(bubble2, [0, 1], [0.85, 1])})`,
                transformOrigin: "bottom right",
              }}
            >
              sounds good — send it
            </div>

            <div
              style={{
                marginTop: "auto",
                textAlign: "center",
                color: "rgba(255,255,255,0.45)",
                fontSize: 13,
                fontFamily: fonts.sans,
                opacity: interpolate(frame, [180, 210], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              No forms. No portal. Just text.
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};
