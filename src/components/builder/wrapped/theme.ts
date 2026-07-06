export type WrappedCardTheme = {
  bgImage: string;
  objectPosition: string;
  wash: string;
  accent: string;
  accentSoft: string;
};

export const ORANGE = '#fa7d22';
export const BLUE = '#168df7';

export const CARD_THEMES = {
  cover: {
    bgImage: '/wrapped/bg-crimson.jpg',
    objectPosition: 'center 30%',
    wash:
      'linear-gradient(180deg, rgba(8,8,9,0.35) 0%, rgba(8,8,9,0.58) 55%, rgba(8,8,9,0.94) 100%), radial-gradient(circle at 22% 18%, rgba(250,125,34,0.35), transparent 55%), radial-gradient(circle at 88% 78%, rgba(22,141,247,0.26), transparent 50%)',
    accent: ORANGE,
    accentSoft: 'rgba(250,125,34,0.2)',
  },
  time: {
    bgImage: '/wrapped/bg-office.jpg',
    objectPosition: 'center 18%',
    wash:
      'linear-gradient(180deg, rgba(12,6,20,0.25) 0%, rgba(10,6,18,0.58) 55%, rgba(6,4,14,0.95) 100%), radial-gradient(circle at 18% 14%, rgba(196,120,255,0.34), transparent 55%), radial-gradient(circle at 90% 10%, rgba(255,196,80,0.26), transparent 50%)',
    accent: '#ffb84d',
    accentSoft: 'rgba(255,184,77,0.2)',
  },
  stack: {
    bgImage: '/wrapped/bg-summit.jpg',
    objectPosition: 'center 42%',
    wash:
      'linear-gradient(180deg, rgba(4,14,16,0.28) 0%, rgba(4,14,16,0.6) 55%, rgba(3,10,12,0.95) 100%), radial-gradient(circle at 18% 18%, rgba(22,141,247,0.32), transparent 55%), radial-gradient(circle at 85% 72%, rgba(80,220,180,0.24), transparent 50%)',
    accent: BLUE,
    accentSoft: 'rgba(22,141,247,0.2)',
  },
  buildSurface: {
    bgImage: '/wrapped/bg-crimson.jpg',
    objectPosition: 'center 72%',
    wash:
      'linear-gradient(180deg, rgba(20,4,4,0.28) 0%, rgba(20,4,4,0.6) 55%, rgba(10,2,2,0.95) 100%), radial-gradient(circle at 80% 18%, rgba(250,90,34,0.4), transparent 55%), radial-gradient(circle at 14% 82%, rgba(255,60,60,0.2), transparent 50%)',
    accent: '#ff6a3d',
    accentSoft: 'rgba(255,106,61,0.2)',
  },
  agents: {
    bgImage: '/wrapped/bg-office.jpg',
    objectPosition: 'center 62%',
    wash:
      'linear-gradient(180deg, rgba(4,16,14,0.28) 0%, rgba(4,16,14,0.6) 55%, rgba(3,10,9,0.95) 100%), radial-gradient(circle at 24% 18%, rgba(80,220,150,0.32), transparent 55%), radial-gradient(circle at 86% 76%, rgba(22,141,247,0.22), transparent 50%)',
    accent: '#50dc96',
    accentSoft: 'rgba(80,220,150,0.2)',
  },
  identity: {
    bgImage: '/wrapped/bg-summit.jpg',
    objectPosition: 'center 12%',
    wash:
      'linear-gradient(180deg, rgba(10,14,4,0.26) 0%, rgba(10,14,4,0.58) 55%, rgba(6,10,3,0.95) 100%), radial-gradient(circle at 76% 14%, rgba(255,196,80,0.32), transparent 55%), radial-gradient(circle at 18% 82%, rgba(80,220,150,0.22), transparent 50%)',
    accent: '#ffce54',
    accentSoft: 'rgba(255,206,84,0.2)',
  },
} satisfies Record<string, WrappedCardTheme>;

export type WrappedCardKey = keyof typeof CARD_THEMES;

export const CARD_ORDER: WrappedCardKey[] = ['cover', 'time', 'stack', 'buildSurface', 'agents', 'identity'];
