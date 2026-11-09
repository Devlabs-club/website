import React from "react";
import { staticFile } from "remotion";
import { loadFont as loadManrope } from "@remotion/google-fonts/Manrope";

const manrope = loadManrope("normal", {
  weights: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});

export const fontFamily = {
  sans: manrope.fontFamily,
  display: "PP Gatwick",
};

export const BrandFonts: React.FC = () => (
  <style
    dangerouslySetInnerHTML={{
      __html: `
        @font-face {
          font-family: "PP Gatwick";
          src: url("${staticFile("fonts/PPGatwick-Ultralight.otf")}") format("opentype");
          font-weight: 100 350;
          font-style: normal;
        }
        @font-face {
          font-family: "PP Gatwick";
          src: url("${staticFile("fonts/PPGatwick-Bold.otf")}") format("opentype");
          font-weight: 351 900;
          font-style: normal;
        }
      `,
    }}
  />
);
