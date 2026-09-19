import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { BrandFonts } from "./components/Fonts";
import { scenes } from "./theme";
import { ColdOpen } from "./scenes/ColdOpen";
import { Enemy } from "./scenes/Enemy";
import { Turn } from "./scenes/Turn";
import { Agent } from "./scenes/Agent";
import { Proof } from "./scenes/Proof";
import { Trials } from "./scenes/Trials";
import { OS } from "./scenes/OS";
import { Secret } from "./scenes/Secret";
import { Close } from "./scenes/Close";

export const LaunchVideo: React.FC = () => (
  <AbsoluteFill>
    <BrandFonts />
    <Series>
      <Series.Sequence durationInFrames={scenes.coldOpen.duration}>
        <ColdOpen />
      </Series.Sequence>
      <Series.Sequence durationInFrames={scenes.enemy.duration}>
        <Enemy />
      </Series.Sequence>
      <Series.Sequence durationInFrames={scenes.turn.duration}>
        <Turn />
      </Series.Sequence>
      <Series.Sequence durationInFrames={scenes.agent.duration}>
        <Agent />
      </Series.Sequence>
      <Series.Sequence durationInFrames={scenes.proof.duration}>
        <Proof />
      </Series.Sequence>
      <Series.Sequence durationInFrames={scenes.trials.duration}>
        <Trials />
      </Series.Sequence>
      <Series.Sequence durationInFrames={scenes.os.duration}>
        <OS />
      </Series.Sequence>
      <Series.Sequence durationInFrames={scenes.secret.duration}>
        <Secret />
      </Series.Sequence>
      <Series.Sequence durationInFrames={scenes.close.duration}>
        <Close />
      </Series.Sequence>
    </Series>
  </AbsoluteFill>
);

/** 30s social cut */
export const LaunchVideoShort: React.FC = () => (
  <AbsoluteFill>
    <BrandFonts />
    <Series>
      <Series.Sequence durationInFrames={120}>
        <ColdOpen />
      </Series.Sequence>
      <Series.Sequence durationInFrames={90}>
        <Turn />
      </Series.Sequence>
      <Series.Sequence durationInFrames={180}>
        <Agent />
      </Series.Sequence>
      <Series.Sequence durationInFrames={120}>
        <Proof />
      </Series.Sequence>
      <Series.Sequence durationInFrames={90}>
        <OS />
      </Series.Sequence>
      <Series.Sequence durationInFrames={90}>
        <Secret />
      </Series.Sequence>
      <Series.Sequence durationInFrames={90}>
        <Close />
      </Series.Sequence>
    </Series>
  </AbsoluteFill>
);
