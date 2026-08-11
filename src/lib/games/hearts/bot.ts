import type { Card, Suit } from '../../core/cards';
import {
  HEARTS_RANK_WEIGHT,
  isHeartsScoreCard,
  validateHeartsPlay,
  type TrickCard,
} from '../../heartsLogic';

export const selectHeartsPassCards = (botCards: Card[]): Card[] => {
  if (botCards.length < 3) return [...botCards];

  const getPassPriority = (card: Card): number => {
    if (card.suit === 'spades' && card.rank === 'Q') return 1000;
    if (card.suit === 'hearts') return 100 + (HEARTS_RANK_WEIGHT[card.rank] ?? 0) * 10;
    if (card.suit === 'spades' && (card.rank === 'A' || card.rank === 'K')) return 80;
    return (HEARTS_RANK_WEIGHT[card.rank] ?? 0) * 2;
  };

  return [...botCards]
    .sort((a, b) => getPassPriority(b) - getPassPriority(a))
    .slice(0, 3);
};

export const selectHeartsCardPlay = (
  botCards: Card[],
  leadSuit: Suit | null,
  heartsBroken: boolean,
  isFirstTrick: boolean,
  isLeadCard: boolean,
  currentTrick: TrickCard[]
): Card => {
  if (botCards.length === 0) {
    throw new Error('Bot has no cards to play');
  }

  const playable = botCards.filter((card) => (
    validateHeartsPlay(card, botCards, leadSuit, heartsBroken, isFirstTrick).valid
  ));
  const candidates = playable.length > 0 ? playable : botCards;

  if (isLeadCard || !leadSuit) {
    const clubsTwo = candidates.find((card) => card.suit === 'clubs' && card.rank === '2');
    if (clubsTwo) return clubsTwo;

    const safeCards = candidates.filter((card) => !isHeartsScoreCard(card));
    if (safeCards.length > 0) {
      return [...safeCards].sort((a, b) => (
        HEARTS_RANK_WEIGHT[a.rank] - HEARTS_RANK_WEIGHT[b.rank]
      ))[0];
    }

    return [...candidates].sort((a, b) => (
      HEARTS_RANK_WEIGHT[a.rank] - HEARTS_RANK_WEIGHT[b.rank]
    ))[0];
  }

  const isFollowingSuit = candidates.every((card) => card.suit === leadSuit);
  if (isFollowingSuit) {
    let currentMaxWeight = 0;
    currentTrick.forEach((trickCard) => {
      if (trickCard.card.suit === leadSuit) {
        currentMaxWeight = Math.max(
          currentMaxWeight,
          HEARTS_RANK_WEIGHT[trickCard.card.rank] ?? 0
        );
      }
    });

    const sortedAscending = [...candidates].sort((a, b) => (
      HEARTS_RANK_WEIGHT[a.rank] - HEARTS_RANK_WEIGHT[b.rank]
    ));

    if (leadSuit === 'spades') {
      const queen = candidates.find((card) => card.rank === 'Q');
      if (queen && currentMaxWeight > HEARTS_RANK_WEIGHT.Q) return queen;
      if (queen) {
        const saferSpades = sortedAscending.filter((card) => (
          HEARTS_RANK_WEIGHT[card.rank] < HEARTS_RANK_WEIGHT.Q
        ));
        if (saferSpades.length > 0) return saferSpades[saferSpades.length - 1];
      }
    }

    const smallerCards = sortedAscending.filter((card) => (
      HEARTS_RANK_WEIGHT[card.rank] < currentMaxWeight
    ));
    if (smallerCards.length > 0) return smallerCards[smallerCards.length - 1];
    return sortedAscending[sortedAscending.length - 1];
  }

  const queen = candidates.find((card) => card.suit === 'spades' && card.rank === 'Q');
  if (queen) return queen;

  const hearts = candidates.filter((card) => card.suit === 'hearts');
  if (hearts.length > 0) {
    return [...hearts].sort((a, b) => (
      HEARTS_RANK_WEIGHT[b.rank] - HEARTS_RANK_WEIGHT[a.rank]
    ))[0];
  }

  return [...candidates].sort((a, b) => (
    HEARTS_RANK_WEIGHT[b.rank] - HEARTS_RANK_WEIGHT[a.rank]
  ))[0];
};
