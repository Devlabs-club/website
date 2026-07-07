import { ImageResponse } from '@vercel/og';
import type { WrappedOgCardPreview, WrappedOgData } from '@/lib/agentWrapped/loadWrappedOgData';
import type { WrappedCardKey } from '@/components/builder/wrapped/theme';

/** Three-card deck: cover · hours hero · archetype reveal */
const DECK_CARD_KEYS: WrappedCardKey[] = ['cover', 'time', 'identity'];

const OG_CARD_BG: Record<(typeof DECK_CARD_KEYS)[number], string> = {
  cover: '/og/wrapped-card-cover.png',
  time: '/og/wrapped-card-time.png',
  identity: '/og/wrapped-card-identity.png',
};

/** Portrait card art aspect (width / height). */
const CARD_ASPECT = 293 / 523;

/** Standard OG canvas — background art is 1024×537, scaled to 1200×630. */
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const BG_SCALE_X = OG_WIDTH / 1024;
const BG_SCALE_Y = OG_HEIGHT / 537;

/** Measured from reference artboard (1024×537), then scaled. */
const FIGMA = {
  left: Math.round(176 * BG_SCALE_X),
  top: Math.round(361 * BG_SCALE_Y),
  width: Math.round(673 * BG_SCALE_X),
  height: Math.round((537 - 361) * BG_SCALE_Y),
  radius: 16,
  inset: 14,
};

const NAME = {
  top: Math.round(252 * BG_SCALE_Y),
  height: Math.round(44 * BG_SCALE_Y),
};

type FontCache = {
  manropeMedium: ArrayBuffer;
  manropeExtraBold: ArrayBuffer;
};

let fontCache: FontCache | null = null;

async function loadFonts(): Promise<FontCache> {
  if (fontCache) return fontCache;

  const [manropeMedium, manropeExtraBold] = await Promise.all([
    fetch('https://fonts.gstatic.com/s/manrope/v20/xn7_YHE41ni1AdIRqAuZuw1Bx9mbZk7PFO_F.ttf').then((r) => r.arrayBuffer()),
    fetch('https://fonts.gstatic.com/s/manrope/v20/xn7_YHE41ni1AdIRqAuZuw1Bx9mbZk59E-_F.ttf').then((r) => r.arrayBuffer()),
  ]);

  fontCache = { manropeMedium, manropeExtraBold };
  return fontCache;
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}

function fanRotation(index: number, count: number) {
  if (count === 3) return [-10, 0, 10][index] ?? 0;
  const center = (count - 1) / 2;
  return (index - center) * 7.5;
}

function fanZIndex(index: number, count: number) {
  const center = (count - 1) / 2;
  return count * 10 - Math.round(Math.abs(index - center) * 8);
}

function BracketName({ name }: { name: string }) {
  const corner = 14;
  const thickness = 3;
  const orange = '#fa7d22';

  return (
    <div
      style={{
        position: 'absolute',
        top: NAME.top,
        left: 0,
        right: 0,
        height: NAME.height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          padding: '8px 28px',
          minWidth: 220,
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, width: corner, height: corner, borderTop: `${thickness}px solid ${orange}`, borderLeft: `${thickness}px solid ${orange}` }} />
        <div style={{ position: 'absolute', top: 0, right: 0, width: corner, height: corner, borderTop: `${thickness}px solid ${orange}`, borderRight: `${thickness}px solid ${orange}` }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: corner, height: corner, borderBottom: `${thickness}px solid ${orange}`, borderLeft: `${thickness}px solid ${orange}` }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: corner, height: corner, borderBottom: `${thickness}px solid ${orange}`, borderRight: `${thickness}px solid ${orange}` }} />
        <div
          style={{
            display: 'flex',
            fontSize: 22,
            fontWeight: 800,
            color: '#050505',
            letterSpacing: '-0.03em',
          }}
        >
          {truncate(name, 28)}
        </div>
      </div>
    </div>
  );
}

function DeckCard({
  card,
  origin,
  bgImage,
  width,
  cardHeight,
  left,
  bottom,
  rotation,
  zIndex,
  isHero,
  heroHours,
}: {
  card: WrappedOgCardPreview;
  origin: string;
  bgImage: string;
  width: number;
  cardHeight: number;
  left: number;
  bottom: number;
  rotation: number;
  zIndex: number;
  isHero: boolean;
  heroHours: number;
}) {
  const valueSize = isHero ? 40 : card.peekValue.length > 10 ? 28 : card.peekValue.length > 6 ? 32 : 36;

  return (
    <div
      style={{
        display: 'flex',
        position: 'absolute',
        left,
        bottom,
        width,
        height: cardHeight,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: '50% 100%',
        zIndex,
      }}
    >
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          borderRadius: 18,
          border: isHero ? '3px solid rgba(255,255,255,0.96)' : '2px solid rgba(255,255,255,0.92)',
          boxShadow: isHero ? '0 18px 40px rgba(0,0,0,0.3)' : '0 14px 32px rgba(0,0,0,0.22)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <img
          src={`${origin}${bgImage}`}
          width={width}
          height={cardHeight}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
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
            background: 'linear-gradient(180deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0) 38%, rgba(0,0,0,0.62) 100%)',
          }}
        />
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            padding: isHero ? '20px 16px 0' : '18px 14px 0',
          }}
        >
          {isHero ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  display: 'flex',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.85)',
                  letterSpacing: '-0.01em',
                  lineHeight: 1.2,
                }}
              >
                you built for
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: valueSize,
                  fontWeight: 800,
                  color: '#ffffff',
                  lineHeight: 0.95,
                  letterSpacing: '-0.05em',
                  textShadow: '2px 2px 0 rgba(226,36,16,0.5)',
                }}
              >
                {Math.round(heroHours)}h
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.85)',
                  letterSpacing: '-0.01em',
                }}
              >
                this year
              </div>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.8)',
                  }}
                >
                  {truncate(card.peekLabel, 14)}
                </div>
                <div
                  style={{
                    display: 'flex',
                    width: 11,
                    height: 11,
                    borderRadius: 999,
                    border: '1.5px solid rgba(255,255,255,0.85)',
                    background: 'rgba(255,255,255,0.12)',
                  }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: valueSize,
                  fontWeight: 800,
                  color: '#ffffff',
                  lineHeight: 1.05,
                  letterSpacing: '-0.04em',
                  textShadow: '2px 2px 0 rgba(226,36,16,0.45)',
                }}
              >
                {truncate(card.peekValue, 16)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function pickDeckCards(previews: WrappedOgCardPreview[]) {
  return DECK_CARD_KEYS.map((key) => previews.find((c) => c.key === key)).filter(
    (c): c is WrappedOgCardPreview => Boolean(c),
  );
}

export async function buildWrappedOgImage(data: WrappedOgData, origin: string) {
  const fonts = await loadFonts();
  const bgUrl = `${origin}/og/wrapped-og-bg.png`;

  const deckCards = pickDeckCards(data.cardPreviews);
  const cardCount = deckCards.length;
  const innerLeft = FIGMA.left + FIGMA.inset;
  const innerTop = FIGMA.top + FIGMA.inset;
  const innerWidth = FIGMA.width - FIGMA.inset * 2;
  const innerHeight = FIGMA.height - FIGMA.inset * 2;
  const horizontalPad = 22;
  const deckWidth = innerWidth - horizontalPad * 2;

  // Tall cards — bottom half overflows beneath the clip; only top half peeks in.
  const cardHeight = Math.round(innerHeight * 2.35);
  const cardWidth = Math.round(cardHeight * CARD_ASPECT);
  const cardBottom = -Math.round(cardHeight * 0.5);
  const heroIndex = 1;
  const slotCenters = [0.37, 0.5, 0.63];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          fontFamily: 'Manrope',
          overflow: 'hidden',
          background: '#fbf6f3',
        }}
      >
        <img
          src={bgUrl}
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

        <BracketName name={data.builderName} />

        <div
          style={{
            position: 'absolute',
            left: innerLeft,
            top: innerTop,
            width: innerWidth,
            height: innerHeight,
            borderRadius: FIGMA.radius - 4,
            overflow: 'hidden',
            display: 'flex',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              display: 'flex',
            }}
          >
            {deckCards.map((card, index) => {
              const isHero = index === heroIndex;
              const width = isHero ? cardWidth + 22 : cardWidth;
              const centerX = horizontalPad + slotCenters[index] * deckWidth;
              const left = Math.round(centerX - width / 2);
              const rotation = fanRotation(index, cardCount);
              const zIndex = fanZIndex(index, cardCount) + (isHero ? 30 : 0);

              return (
                <DeckCard
                  key={card.key}
                  card={card}
                  origin={origin}
                  bgImage={OG_CARD_BG[card.key]}
                  width={width}
                  cardHeight={cardHeight}
                  left={left}
                  bottom={cardBottom}
                  rotation={rotation}
                  zIndex={zIndex}
                  isHero={isHero}
                  heroHours={data.totalHours}
                />
              );
            })}
          </div>
        </div>
      </div>
    ),
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      fonts: [
        { name: 'Manrope', data: fonts.manropeMedium, weight: 500, style: 'normal' },
        { name: 'Manrope', data: fonts.manropeExtraBold, weight: 800, style: 'normal' },
      ],
    },
  );
}
