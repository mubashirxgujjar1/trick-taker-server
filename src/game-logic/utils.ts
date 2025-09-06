// src/game-logic/utils.ts

import { Card, Suit, Rank } from "../types";

export const allSuits: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
export const allRanks: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

export const getCardValue = (card: Card): number => {
  const rankValues: Record<Rank, number> = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10,
    "J": 11, "Q": 12, "K": 13, "A": 14,
  };
  return rankValues[card.rank];
};

export const shuffleDeck = (deck: Card[]): Card[] => {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

// --- NEW HELPER FUNCTIONS FOR THE BOT ---

/**
 * Sorts an array of cards from lowest to highest value.
 */
export const sortCards = (cards: Card[]): Card[] => {
  return [...cards].sort((a, b) => getCardValue(a) - getCardValue(b));
};

/**
 * Groups a player's hand by suit.
 * @returns A Map where keys are suits and values are arrays of cards.
 */
export const groupHandBySuit = (hand: Card[]): Map<Suit, Card[]> => {
    const suitMap = new Map<Suit, Card[]>();
    for (const suit of allSuits) {
        suitMap.set(suit, []);
    }
    for (const card of hand) {
        suitMap.get(card.suit)?.push(card);
    }
    return suitMap;
};