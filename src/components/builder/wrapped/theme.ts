export type WrappedCardTheme = {
  bgImage: string;
  objectPosition: string;
  wash: string;
  accent: string;
  accentSoft: string;
  imageDrift?: [number, number, number, number];
  lightOverlays?: boolean;
};

export const ORANGE = '#fa7d22';
export const BLUE = '#168df7';

export const CARD_THEMES = {
  cover: {
    bgImage: '/wrapped/story-office-glitch.jpg',
    objectPosition: 'center 42%',
    wash:
      'linear-gradient(180deg, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.20) 32%, rgba(0,0,0,0.86) 100%), linear-gradient(90deg, rgba(31,28,188,0.45) 0%, rgba(255,33,88,0.18) 50%, rgba(255,218,27,0.36) 100%), radial-gradient(circle at 12% 18%, rgba(0,41,255,0.40), transparent 48%), radial-gradient(circle at 88% 18%, rgba(255,232,44,0.48), transparent 44%)',
    accent: ORANGE,
    accentSoft: 'rgba(250,125,34,0.2)',
    imageDrift: [-6, 0, 5, -10],
  },
  time: {
    bgImage: '/wrapped/story-red-glitch.jpg',
    objectPosition: 'right center',
    wash:
      'linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.98) 36%, rgba(0,0,0,0.62) 50%, rgba(0,0,0,0.14) 68%, rgba(0,0,0,0) 82%), linear-gradient(180deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0) 38%, rgba(0,0,0,0.22) 100%)',
    accent: '#ffb84d',
    accentSoft: 'rgba(255,184,77,0.2)',
    imageDrift: [-8, 4, 6, -8],
    lightOverlays: true,
  },
  tokens: {
    bgImage: '/wrapped/story-code-field.jpg',
    objectPosition: 'center 40%',
    wash:
      'linear-gradient(180deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.28) 40%, rgba(0,0,0,0.88) 100%), linear-gradient(90deg, rgba(250,125,34,0.35) 0%, rgba(226,39,16,0.22) 50%, rgba(255,220,46,0.28) 100%), radial-gradient(circle at 80% 20%, rgba(255,184,77,0.4), transparent 48%)',
    accent: ORANGE,
    accentSoft: 'rgba(250,125,34,0.22)',
    imageDrift: [5, -4, -6, 4],
  },
  models: {
    bgImage: '/wrapped/story-soft-mesh.jpg',
    objectPosition: 'center 48%',
    wash:
      'linear-gradient(180deg, rgba(0,0,0,0.14) 0%, rgba(0,0,0,0.32) 42%, rgba(0,0,0,0.84) 100%), linear-gradient(90deg, rgba(22,141,247,0.32) 0%, rgba(80,220,150,0.2) 55%, rgba(255,220,46,0.28) 100%), radial-gradient(circle at 18% 22%, rgba(22,141,247,0.4), transparent 46%)',
    accent: BLUE,
    accentSoft: 'rgba(22,141,247,0.22)',
    imageDrift: [-5, 3, 6, -5],
  },
  rhythm: {
    bgImage: '/wrapped/story-green-halftone.jpg',
    objectPosition: 'center 50%',
    wash:
      'linear-gradient(180deg, rgba(2,20,16,0.1) 0%, rgba(1,14,10,0.3) 46%, rgba(1,9,8,0.86) 100%), linear-gradient(90deg, rgba(0,42,255,0.22), rgba(0,255,162,0.18), rgba(255,225,44,0.2)), radial-gradient(circle at 12% 10%, rgba(22,141,247,0.35), transparent 50%)',
    accent: '#50dc96',
    accentSoft: 'rgba(80,220,150,0.22)',
    imageDrift: [4, 0, -6, -5],
  },
  stack: {
    bgImage: '/wrapped/story-green-halftone.jpg',
    objectPosition: 'center 50%',
    wash:
      'linear-gradient(180deg, rgba(2,20,16,0.08) 0%, rgba(1,14,10,0.28) 46%, rgba(1,9,8,0.82) 100%), linear-gradient(90deg, rgba(0,42,255,0.22), rgba(0,255,162,0.18), rgba(255,225,44,0.20)), radial-gradient(circle at 12% 10%, rgba(22,141,247,0.35), transparent 50%)',
    accent: BLUE,
    accentSoft: 'rgba(22,141,247,0.2)',
    imageDrift: [4, 0, -6, -5],
  },
  buildSurface: {
    bgImage: '/wrapped/story-red-abstract.jpg',
    objectPosition: 'center 52%',
    wash:
      'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.26) 44%, rgba(0,0,0,0.86) 100%), linear-gradient(90deg, rgba(20,0,0,0.58) 0%, rgba(235,21,11,0.40) 56%, rgba(255,213,36,0.45) 100%), radial-gradient(circle at 78% 12%, rgba(255,231,45,0.56), transparent 45%), radial-gradient(circle at 22% 80%, rgba(255,30,0,0.38), transparent 48%)',
    accent: '#ff6a3d',
    accentSoft: 'rgba(255,106,61,0.2)',
    imageDrift: [-4, 0, 4, -6],
  },
  agents: {
    bgImage: '/wrapped/story-code-field.jpg',
    objectPosition: 'center 44%',
    wash:
      'linear-gradient(180deg, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.18) 48%, rgba(0,0,0,0.74) 100%), linear-gradient(90deg, rgba(0,45,130,0.30), rgba(6,120,255,0.20), rgba(255,232,24,0.20)), radial-gradient(circle at 10% 72%, rgba(0,39,255,0.36), transparent 42%)',
    accent: '#ffdc2e',
    accentSoft: 'rgba(255,220,46,0.22)',
    imageDrift: [7, 0, -7, -8],
  },
  identity: {
    bgImage: '/wrapped/story-soft-mesh.jpg',
    objectPosition: 'center 50%',
    wash:
      'linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.28) 42%, rgba(0,0,0,0.76) 100%), linear-gradient(90deg, rgba(0,0,0,0.54) 0%, rgba(250,125,34,0.30) 54%, rgba(255,220,46,0.28) 100%), radial-gradient(circle at 82% 28%, rgba(255,230,32,0.32), transparent 42%), radial-gradient(circle at 10% 72%, rgba(80,220,150,0.28), transparent 44%)',
    accent: '#ffce54',
    accentSoft: 'rgba(255,206,84,0.2)',
    imageDrift: [-4, 4, 4, -4],
  },
  convert: {
    bgImage: '/wrapped/buildprint-convert-bg.jpg',
    objectPosition: 'center 45%',
    wash: 'transparent',
    accent: ORANGE,
    accentSoft: 'rgba(250,125,34,0.18)',
    imageDrift: [0, 0, 0, 0],
    lightOverlays: true,
  },
} satisfies Record<string, WrappedCardTheme>;

export type WrappedCardKey = keyof typeof CARD_THEMES;

/** Public facts-first story deck (no Buildprint identity reveal). */
export const CARD_ORDER: WrappedCardKey[] = [
  'cover',
  'time',
  'tokens',
  'models',
  'rhythm',
  'agents',
  'convert',
];

/** Story cards shown to the owner (no acquisition convert card). */
export const OWNER_CARD_ORDER: WrappedCardKey[] = [
  'cover',
  'time',
  'tokens',
  'models',
  'rhythm',
  'agents',
];

/** Reference artboard: 577×1024 */
export const WRAPPED_CARD_WIDTH = 577;
export const WRAPPED_CARD_HEIGHT = 1024;
export const WRAPPED_CARD_ASPECT = `${WRAPPED_CARD_WIDTH} / ${WRAPPED_CARD_HEIGHT}`;

/** Figma tracking −66 → −0.066em; line height 1.4 */
export const WRAPPED_TYPE_STYLE = {
  letterSpacing: '-0.066em',
  lineHeight: 1.4,
} as const;

export const WRAPPED_TYPE_CLASS = 'leading-[1.4] tracking-[-0.066em]';
