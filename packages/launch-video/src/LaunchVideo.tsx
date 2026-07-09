import React from "react";
import { AbsoluteFill, Sequence, Series } from "remotion";
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

/**
 * DevLabs launch video — ~75s @ 30fps
 * Feature-led graphical film: builders not engineers / proof not matching.
 */
export const LaunchVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#fbf6f3" }}>
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
};

/** Optional 30s cut-down for social */
export const LaunchVideoShort: React.FC = () => {
  // Compressed beats: cold open, turn, agent, proof snippet, os+secret, close
  return (
    <AbsoluteFill style={{ backgroundColor: "#fbf6f3" }}>
      <Sequence durationInFrames={150}>
        <ColdOpen />
      </Sequence>
      <Sequence from={150} durationInFrames={120}>
        <Turn />
      </Sequence>
      <Sequence from={270} durationInFrames={210}>
        <Agent />
      </Sequence>
      <Sequence from={480} durationInFrames={150}>
        <Proof />
      </Sequence>
      <Sequence from={630} durationInFrames={120}>
        <OS />
      </Sequence>
      <Sequence from={750} durationInFrames={90}>
        <Secret />
      </Sequence>
      <Sequence from={840} durationInFrames={60}>
        <Close />
      </Sequence>
    </AbsoluteFill>
  );
};
