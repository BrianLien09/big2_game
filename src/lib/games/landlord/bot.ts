import type { Card } from '../../core/cards';
import { canBeatLandlordHand, evaluateLandlordHand, LANDLORD_RANK_WEIGHT } from './logic';
import type { LandlordPlayedHand } from './types';

const groupCards = (cards: Card[]): Card[][] => {
  const groups = new Map<number, Card[]>();
  cards.forEach((card) => {
    const rank = LANDLORD_RANK_WEIGHT[card.rank];
    groups.set(rank, [...(groups.get(rank) ?? []), card]);
  });
  return [...groups.entries()].sort(([left], [right]) => left - right).map(([, group]) => group);
};

const consecutiveRuns = (groups: Card[][], requiredPerRank: number, minLength: number): Card[][] => {
  const usable = groups.filter((group) => group.length >= requiredPerRank && LANDLORD_RANK_WEIGHT[group[0].rank] <= 14);
  const runs: Card[][] = [];
  for (let start = 0; start < usable.length; start += 1) {
    const run: Card[][] = [usable[start]];
    for (let next = start + 1; next < usable.length; next += 1) {
      if (LANDLORD_RANK_WEIGHT[usable[next][0].rank] !== LANDLORD_RANK_WEIGHT[usable[next - 1][0].rank] + 1) break;
      run.push(usable[next]);
      if (run.length >= minLength) runs.push(run.flatMap((group) => group.slice(0, requiredPerRank)));
    }
  }
  return runs;
};

const candidates = (cards: Card[]): Card[][] => {
  const groups = groupCards(cards);
  const result: Card[][] = cards.map((card) => [card]);
  groups.forEach((group) => {
    if (group.length >= 2) result.push(group.slice(0, 2));
    if (group.length >= 3) {
      result.push(group.slice(0, 3));
      const other = cards.find((card) => card.rank !== group[0].rank);
      if (other) result.push([...group.slice(0, 3), other]);
      const pair = groups.find((otherGroup) => otherGroup[0].rank !== group[0].rank && otherGroup.length >= 2);
      if (pair) result.push([...group.slice(0, 3), ...pair.slice(0, 2)]);
    }
    if (group.length === 4) {
      result.push(group);
      const extras = cards.filter((card) => card.rank !== group[0].rank).slice(0, 2);
      if (extras.length === 2) result.push([...group, ...extras]);
      const pairs = groups.filter((otherGroup) => otherGroup[0].rank !== group[0].rank && otherGroup.length >= 2).slice(0, 2);
      if (pairs.length === 2) result.push([...group, ...pairs.flatMap((pair) => pair.slice(0, 2))]);
    }
  });
  if (groups.some((group) => group[0].rank === 'small_joker') && groups.some((group) => group[0].rank === 'big_joker')) {
    result.push(groups.find((group) => group[0].rank === 'small_joker')!.concat(groups.find((group) => group[0].rank === 'big_joker')!));
  }
  result.push(...consecutiveRuns(groups, 1, 5), ...consecutiveRuns(groups, 2, 3), ...consecutiveRuns(groups, 3, 2));
  return result;
};

export const selectLandlordBid = (cards: Card[], highestBid: number): number => {
  const groups = groupCards(cards);
  const bombs = groups.filter((group) => group.length === 4).length;
  const hasRocket = groups.some((group) => group[0].rank === 'small_joker') && groups.some((group) => group[0].rank === 'big_joker');
  const highCards = cards.filter((card) => LANDLORD_RANK_WEIGHT[card.rank] >= 14).length;
  const strength = (hasRocket ? 3 : bombs > 0 ? 2 : highCards >= 5 ? 2 : highCards >= 3 ? 1 : 0);
  return strength > highestBid ? strength : 0;
};

export const selectLandlordBotAction = (
  cards: Card[],
  previous: LandlordPlayedHand | null
): { type: 'play'; cards: Card[] } | { type: 'pass' } => {
  const allCards = evaluateLandlordHand(cards);
  if (allCards && canBeatLandlordHand(allCards, previous)) return { type: 'play', cards };

  const options = candidates(cards)
    .map((cardsToPlay) => ({ cards: cardsToPlay, hand: evaluateLandlordHand(cardsToPlay) }))
    .filter((option): option is { cards: Card[]; hand: LandlordPlayedHand } => option.hand !== null)
    .filter((option) => canBeatLandlordHand(option.hand, previous));
  if (options.length === 0) return { type: 'pass' };

  const typeCost: Record<LandlordPlayedHand['type'], number> = {
    single: 1, pair: 2, triple: 3, triple_single: 4, triple_pair: 5, straight: 6, pair_straight: 7,
    airplane: 8, airplane_single: 9, airplane_pair: 10, four_two_singles: 11, four_two_pairs: 12, bomb: 100, rocket: 101,
  };
  options.sort((left, right) => typeCost[left.hand.type] - typeCost[right.hand.type]
    || left.hand.keyRank - right.hand.keyRank
    || left.hand.cards.length - right.hand.cards.length);
  return { type: 'play', cards: options[0].cards };
};
