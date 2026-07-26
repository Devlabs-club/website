import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import React from 'react';
import { ImageResponse } from '@vercel/og';
import type { WrappedOgData } from '@/lib/agentWrapped/loadWrappedOgData';
import type { WrappedCardKey } from '@/components/builder/wrapped/theme';

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

const PAPER = '#fbf6f3';
const INK = '#050505';
const ORANGE = '#ff7417';
const ORANGE_DEEP = '#e22710';
const MUTED = 'rgba(5,5,5,0.55)';

type FontCache = {
  manropeRegular: ArrayBuffer;
  manropeBold: ArrayBuffer;
  manropeExtraBold: ArrayBuffer;
  gatwickBold: ArrayBuffer;
};

type AssetCache = {
  logo: string;
  starLeft: string;
  starRight: string;
  timeCard: string;
};

let fontCache: FontCache | null = null;
let assetCache: AssetCache | null = null;

async function loadFonts(): Promise<FontCache> {
  if (fontCache) return fontCache;

  const [manropeRegular, manropeBold, manropeExtraBold, gatwickBold] = await Promise.all([
    fetch('https://cdn.jsdelivr.net/fontsource/fonts/manrope@5.2.5/latin-400-normal.ttf').then((r) =>
      r.arrayBuffer(),
    ),
    fetch('https://cdn.jsdelivr.net/fontsource/fonts/manrope@5.2.5/latin-700-normal.ttf').then((r) =>
      r.arrayBuffer(),
    ),
    fetch('https://cdn.jsdelivr.net/fontsource/fonts/manrope@5.2.5/latin-800-normal.ttf').then((r) =>
      r.arrayBuffer(),
    ),
    readFile(join(process.cwd(), 'public/fonts/PPGatwick-Bold.otf')),
  ]);

  fontCache = {
    manropeRegular,
    manropeBold,
    manropeExtraBold,
    gatwickBold: Uint8Array.from(gatwickBold).buffer,
  };
  return fontCache;
}

async function pngDataUrl(relativePath: string) {
  const buf = await readFile(join(process.cwd(), 'public', relativePath));
  return `data:image/png;base64,${buf.toString('base64')}`;
}

async function loadAssets(): Promise<AssetCache> {
  if (assetCache) return assetCache;
  const [logo, starLeft, starRight, timeCard] = await Promise.all([
    pngDataUrl('logo.png'),
    pngDataUrl('og/wrapped-star-left.png'),
    pngDataUrl('og/wrapped-star-right.png'),
    pngDataUrl('og/wrapped-card-time.png'),
  ]);
  assetCache = { logo, starLeft, starRight, timeCard };
  return assetCache;
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}

function hoursFontSize(hoursLabel: string) {
  const digits = hoursLabel.replace(/[^\d]/g, '').length;
  if (digits >= 5) return 72;
  if (digits >= 4) return 88;
  if (digits === 3) return 104;
  return 118;
}

function HoursShareCard({ data, timeCardBg }: { data: WrappedOgData; timeCardBg: string }) {
  const hoursSize = hoursFontSize(data.hoursLabel);

  return (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width: 460,
        height: 540,
      }}
    >
      {/* Orange offset plate */}
      <div
        style={{
          position: 'absolute',
          top: 44,
          left: 18,
          width: 420,
          height: 480,
          background: ORANGE,
          display: 'flex',
        }}
      />

      {/* Status pill */}
      <div
        style={{
          position: 'absolute',
          top: 4,
          left: 18,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', width: 10, height: 10, borderRadius: 999, background: ORANGE }} />
        <div
          style={{
            display: 'flex',
            fontSize: 14,
            fontWeight: 700,
            color: '#1f8a4c',
            letterSpacing: '0.04em',
            fontFamily: 'Manrope',
          }}
        >
          TRACKING ACTIVE
        </div>
      </div>

      {/* Card body */}
      <div
        style={{
          position: 'absolute',
          top: 34,
          left: 8,
          width: 420,
          height: 480,
          display: 'flex',
          overflow: 'hidden',
          border: `2px solid ${INK}`,
          background: INK,
        }}
      >
        <img
          src={timeCardBg}
          width={420}
          height={480}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 420,
            height: 480,
            objectFit: 'cover',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.2) 35%, rgba(0,0,0,0.72) 100%)',
            display: 'flex',
          }}
        />

        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            padding: '56px 28px 28px',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontFamily: 'Gatwick',
              fontSize: 22,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.88)',
              lineHeight: 1,
            }}
          >
            you built for
          </div>

          <div
            style={{
              display: 'flex',
              marginTop: 10,
              fontFamily: 'Gatwick',
              fontSize: hoursSize,
              fontWeight: 700,
              color: '#ffffff',
              lineHeight: 0.9,
              letterSpacing: '-0.05em',
              textShadow: `4px 5px 0 rgba(226,36,16,0.55)`,
            }}
          >
            {data.hoursLabel}
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              marginTop: 8,
              fontFamily: 'Gatwick',
              fontSize: 34,
              fontWeight: 700,
              color: '#ffffff',
              lineHeight: 1.05,
            }}
          >
            <div style={{ display: 'flex' }}>hours</div>
            <div style={{ display: 'flex', fontSize: 22, color: 'rgba(255,255,255,0.92)' }}>
              with agents.
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              marginTop: 18,
              maxWidth: 340,
              fontFamily: 'Manrope',
              fontSize: 16,
              fontWeight: 700,
              color: '#d4d4d4',
              lineHeight: 1.35,
            }}
          >
            {truncate(data.hoursSupport, 56)}
          </div>

          <div
            style={{
              display: 'flex',
              marginTop: 'auto',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                border: `1.5px solid ${INK}`,
                background: '#ffffff',
                padding: '10px 14px',
                boxShadow: `7px 7px 0 ${ORANGE_DEEP}`,
                fontFamily: 'Manrope',
                fontSize: 14,
                fontWeight: 700,
                color: INK,
              }}
            >
              {`longest single session: ${data.longestSessionLabel}`}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                fontFamily: 'Manrope',
                fontSize: 12,
                fontWeight: 700,
                color: 'rgba(255,255,255,0.45)',
                letterSpacing: '0.04em',
              }}
            >
              {`${data.sessionCount.toLocaleString('en-US')} sessions · ${truncate(data.topAgent, 18)}`}
            </div>
          </div>
        </div>
      </div>

      {/* Badge overlays card top edge (paint after card; Satori has no z-index) */}
      <div
        style={{
          position: 'absolute',
          top: 54,
          left: 36,
          display: 'flex',
          background: ORANGE,
          padding: '6px 12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 12,
            fontWeight: 800,
            color: INK,
            letterSpacing: '0.12em',
            fontFamily: 'Manrope',
          }}
        >
          AI WRAPPED
        </div>
      </div>
    </div>
  );
}

/**
 * DevLabs-themed share OG: cream paper + orange accents, left brand/copy,
 * right = time-with-agents builder card (Satori / @vercel/og).
 */
export async function buildWrappedOgImage(
  data: WrappedOgData,
  _origin: string,
  _options: { featuredCard?: WrappedCardKey | null } = {},
) {
  const [fonts, assets] = await Promise.all([loadFonts(), loadAssets()]);
  const nameLine = truncate(data.builderName, 28);
  const identityLine = truncate(`${data.builderName} · ${data.archetype}`, 42);
  const tagline =
    truncate(data.headline, 90) ||
    'ships proof of agent work — hours, sessions, and stack on DevLabs';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: PAPER,
          fontFamily: 'Manrope',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Landing hero ASCII stars (canvas → PNG, same placement as hero) */}
        <img
          src={assets.starLeft}
          width={OG_WIDTH}
          height={OG_HEIGHT}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: OG_WIDTH,
            height: OG_HEIGHT,
            objectFit: 'fill',
          }}
        />
        <img
          src={assets.starRight}
          width={OG_WIDTH}
          height={OG_HEIGHT}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: OG_WIDTH,
            height: OG_HEIGHT,
            objectFit: 'fill',
          }}
        />

        <div
          style={{
            position: 'relative',
            display: 'flex',
            width: '100%',
            height: '100%',
            padding: '48px 52px',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Left column */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: 540,
              height: '100%',
              justifyContent: 'center',
              paddingRight: 24,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 36 }}>
              <img
                src={assets.logo}
                width={44}
                height={44}
                style={{ width: 44, height: 44, objectFit: 'contain' }}
              />
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'Manrope',
                  fontSize: 28,
                  fontWeight: 800,
                  color: INK,
                  letterSpacing: '-0.03em',
                }}
              >
                DevLabs
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                fontFamily: 'Gatwick',
                fontSize: nameLine.length > 22 ? 42 : 50,
                fontWeight: 700,
                color: INK,
                lineHeight: 1.05,
                letterSpacing: '-0.03em',
                marginBottom: 10,
              }}
            >
              {nameLine}
            </div>

            <div
              style={{
                display: 'flex',
                fontFamily: 'Manrope',
                fontSize: 20,
                fontWeight: 700,
                color: ORANGE,
                letterSpacing: '-0.01em',
                marginBottom: 22,
              }}
            >
              {truncate(data.archetype, 36)}
            </div>

            <div
              style={{
                display: 'flex',
                width: 420,
                height: 2,
                background: 'rgba(5,5,5,0.12)',
                marginBottom: 22,
              }}
            />

            <div
              style={{
                display: 'flex',
                maxWidth: 440,
                fontFamily: 'Manrope',
                fontSize: 20,
                fontWeight: 400,
                color: MUTED,
                lineHeight: 1.45,
                marginBottom: 36,
              }}
            >
              {tagline}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: ORANGE,
                color: INK,
                padding: '16px 28px',
                fontFamily: 'Manrope',
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: '0.08em',
                width: 240,
              }}
            >
              GET YOURS
            </div>

            <div
              style={{
                display: 'flex',
                marginTop: 18,
                fontFamily: 'Manrope',
                fontSize: 14,
                fontWeight: 700,
                color: 'rgba(5,5,5,0.4)',
              }}
            >
              {truncate(identityLine, 48)}
            </div>
          </div>

          {/* Right column — hours card */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <HoursShareCard data={data} timeCardBg={assets.timeCard} />
          </div>
        </div>
      </div>
    ),
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
      fonts: [
        { name: 'Manrope', data: fonts.manropeRegular, weight: 400, style: 'normal' },
        { name: 'Manrope', data: fonts.manropeBold, weight: 700, style: 'normal' },
        { name: 'Manrope', data: fonts.manropeExtraBold, weight: 800, style: 'normal' },
        { name: 'Gatwick', data: fonts.gatwickBold, weight: 700, style: 'normal' },
      ],
    },
  );
}
