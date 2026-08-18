import type { GameMode } from '../core/gameMode';

export interface GameDefinition {
  mode: GameMode;
  label: string;
  icon: string;
  defaultTargetPoints: number;
  targetPoints: number[];
  targetUnit: string;
  colors: {
    background: string;
    border: string;
    text: string;
  };
}

export const GAME_DEFINITIONS: Record<GameMode, GameDefinition> = {
  BIG2: {
    mode: 'BIG2',
    label: '大老二',
    icon: '🂡',
    defaultTargetPoints: 15,
    targetPoints: [10, 15, 20],
    targetUnit: '分',
    colors: { background: '#fbbf24', border: '#000', text: '#000' },
  },
  THIRTEEN: {
    mode: 'THIRTEEN',
    label: '十三支',
    icon: '🃎',
    defaultTargetPoints: 15,
    targetPoints: [10, 15, 20],
    targetUnit: '分',
    colors: { background: '#b87e6b', border: '#a66a58', text: '#fff' },
  },
  HEARTS: {
    mode: 'HEARTS',
    label: '傷心小棧',
    icon: '💔',
    defaultTargetPoints: 50,
    targetPoints: [30, 50, 100],
    targetUnit: '負分',
    colors: { background: '#ef4444', border: '#b91c1c', text: '#fff' },
  },
  LANDLORD: {
    mode: 'LANDLORD',
    label: '鬥地主',
    icon: '🃏',
    defaultTargetPoints: 30,
    targetPoints: [20, 30, 50],
    targetUnit: '分',
    colors: { background: '#7c3aed', border: '#4c1d95', text: '#fff' },
  },
};

export const GAME_MODES: GameMode[] = ['BIG2', 'THIRTEEN', 'HEARTS', 'LANDLORD'];

export const getGameDefinition = (mode: GameMode): GameDefinition => GAME_DEFINITIONS[mode];
