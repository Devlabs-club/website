import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { brand } from "../theme";
import {
  BodyCopy,
  DisplayHeadline,
  Eyebrow,
  RulerSection,
  SceneShell,
  SnapIn,
} from "../components/Brand";
import { fontFamily } from "../components/Fonts";

const rows = [
  { title: "Senior Engineer", tags: ["React", "Node", "AWS"], pct: "94%" },
  { title: "Full Stack Dev", tags: ["TypeScript", "SQL"], pct: "91%" },
  { title: "Software Engineer", tags: ["Python", "Docker"], pct: "89%" },
  { title: "Platform Engineer", tags: ["AWS", "K8s"], pct: "86%" },
  { title: "Staff Engineer", tags: ["Java", "Kafka"], pct: "85%" },
  { title: "Backend Engineer", tags: ["Go", "Terraform"], pct: "84%" },
];

export const Enemy: React.FC = () => {
  const frame = useCurrentFrame();
  const scroll = interpolate(frame, [0, 180], [0, -320]);

  return (
    <SceneShell>
      <RulerSection>
        <AbsoluteFill style={{ padding: "72px 100px" }}>
          <SnapIn>
            <Eyebrow>the problem</Eyebrow>
            <DisplayHeadline size={72} style={{ marginTop: 20 }}>
              Every hiring platform
            </DisplayHeadline>
            <DisplayHeadline size={72}>does the same thing.</DisplayHeadline>
            <BodyCopy size={30} style={{ marginTop: 16 }}>
              match keyword → to resume
            </BodyCopy>
          </SnapIn>

          <div
            style={{
              marginTop: 40,
              height: 560,
              overflow: "hidden",
              border: `1px solid ${brand.border}`,
              background: `${brand.creamPanel}cc`,
              position: "relative",
            }}
          >
            <div
              style={{
                transform: `translateY(${scroll}px)`,
                padding: 0,
              }}
            >
              {[...rows, ...rows].map((r, i) => {
                const pulse = 0.5 + 0.5 * Math.sin((frame + i * 10) / 8);
                return (
                  <div
                    key={`${r.title}-${i}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "20px 28px",
                      background: brand.creamCard,
                      borderBottom: `1px solid ${brand.border}`,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontFamily: fontFamily.sans,
                          fontSize: 24,
                          fontWeight: 700,
                          color: brand.black,
                        }}
                      >
                        {r.title}
                      </div>
                      <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                        {r.tags.map((t) => (
                          <span
                            key={t}
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              padding: "3px 8px",
                              background: `rgba(255,116,23,${0.1 * pulse})`,
                              color: brand.blackSoft,
                            }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div
                      style={{
                        fontFamily: fontFamily.sans,
                        fontSize: 18,
                        fontWeight: 800,
                        color: brand.orange,
                        opacity: 0.35 + pulse * 0.4,
                        border: `1.5px solid ${brand.orange}`,
                        borderRadius: 999,
                        padding: "6px 14px",
                      }}
                    >
                      {r.pct}
                    </div>
                  </div>
                );
              })}
            </div>
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: `linear-gradient(180deg, transparent 55%, ${brand.cream} 100%)`,
                pointerEvents: "none",
              }}
            />
          </div>
        </AbsoluteFill>
      </RulerSection>
    </SceneShell>
  );
};
