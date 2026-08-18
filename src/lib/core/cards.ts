export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs' | 'joker';
export type Rank = '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A' | '2' | 'small_joker' | 'big_joker';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS: Rank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

export const createDeck = (): Card[] => {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({
    id: `${suit}-${rank}`,
    suit,
    rank,
  })));
};

// 鬥地主使用完整 54 張牌；其他遊戲仍使用 createDeck 的標準 52 張牌。
export const createLandlordDeck = (): Card[] => [
  ...createDeck(),
  { id: 'joker-small', suit: 'joker', rank: 'small_joker' },
  { id: 'joker-big', suit: 'joker', rank: 'big_joker' },
];

export const shuffleDeck = (deck: Card[]): Card[] => {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};
