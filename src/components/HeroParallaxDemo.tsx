"use client";
import React from "react";
import { HeroParallax } from "./ui/hero-parallax";
import type { Tweet } from "react-tweet/api";

export function HeroParallaxDemo({
  children,
  tweets,
}: {
  children?: React.ReactNode;
  tweets: Tweet[];
}) {
  return <HeroParallax tweets={tweets}>{children}</HeroParallax>;
}
