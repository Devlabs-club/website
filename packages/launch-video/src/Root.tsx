import React from "react";
import { Composition } from "remotion";
import { LaunchVideo, LaunchVideoShort } from "./LaunchVideo";
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from "./theme";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="LaunchVideo"
      component={LaunchVideo}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="LaunchVideoShort"
      component={LaunchVideoShort}
      durationInFrames={780}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  </>
);
