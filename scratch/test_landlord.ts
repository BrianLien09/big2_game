import { strict as assert } from 'node:assert';
import type { Card, Rank, Suit } from '../src/lib/core/cards';
import { calculateLandlordChipChanges, canBeatLandlordHand, evaluateLandlordHand, validateLandlordPlay } from '../src/lib/games/landlord/logic';
import { selectLandlordBotAction } from '../src/lib/games/landlord/bot';

const card = (id: string): Card => {
  if (id === 'joker-small') return { id, suit: 'joker', rank: 'small_joker' };
  if (id === 'joker-big') return { id, suit: 'joker', rank: 'big_joker' };
  const [suit, rank] = id.split('-');
  return { id, suit: suit as Suit, rank: rank as Rank };
};

const hand = (...ids: string[]) => ids.map(card);

const rocket = evaluateLandlordHand(hand('joker-small', 'joker-big'));
const bomb = evaluateLandlordHand(hand('spades-9', 'hearts-9', 'diamonds-9', 'clubs-9'));
const straight = evaluateLandlordHand(hand('spades-3', 'spades-4', 'spades-5', 'spades-6', 'spades-7'));
const airplane = evaluateLandlordHand(hand('spades-5', 'hearts-5', 'diamonds-5', 'spades-6', 'hearts-6', 'diamonds-6'));

assert.equal(rocket?.type, 'rocket');
assert.equal(bomb?.type, 'bomb');
assert.equal(straight?.type, 'straight');
assert.equal(airplane?.type, 'airplane');
assert.equal(Object.hasOwn(rocket!, 'sequenceLength'), false);
assert.equal(straight?.sequenceLength, 5);
assert.equal(canBeatLandlordHand(rocket!, bomb!), true);
assert.equal(validateLandlordPlay(hand('spades-8', 'hearts-8', 'diamonds-8', 'clubs-8'), straight).allowed, true);
assert.equal(validateLandlordPlay(hand('spades-6', 'hearts-6'), straight).allowed, false);

const botAction = selectLandlordBotAction(hand('spades-3', 'hearts-3', 'spades-4'), evaluateLandlordHand(hand('clubs-3')));
assert.equal(botAction.type, 'play');

const landlordWinChanges = calculateLandlordChipChanges(
  ['landlord', 'farmer-a', 'farmer-b'],
  'landlord',
  true,
  { landlord: 1000, 'farmer-a': 1000, 'farmer-b': 1000 },
  20,
);
assert.deepEqual(landlordWinChanges, { landlord: 40, 'farmer-a': -20, 'farmer-b': -20 });

const farmerWinChanges = calculateLandlordChipChanges(
  ['landlord', 'farmer-a', 'farmer-b'],
  'landlord',
  false,
  { landlord: 25, 'farmer-a': 1000, 'farmer-b': 1000 },
  20,
);
assert.deepEqual(farmerWinChanges, { landlord: -24, 'farmer-a': 12, 'farmer-b': 12 });

console.log('鬥地主規則、人機與籌碼結算基本測試通過');
