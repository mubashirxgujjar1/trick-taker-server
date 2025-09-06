"use strict";
// src/game-logic/utils.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.groupHandBySuit = exports.sortCards = exports.shuffleDeck = exports.getCardValue = exports.allRanks = exports.allSuits = void 0;
exports.allSuits = ["hearts", "diamonds", "clubs", "spades"];
exports.allRanks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const getCardValue = (card) => {
    const rankValues = {
        "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10,
        "J": 11, "Q": 12, "K": 13, "A": 14,
    };
    return rankValues[card.rank];
};
exports.getCardValue = getCardValue;
const shuffleDeck = (deck) => {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
};
exports.shuffleDeck = shuffleDeck;
// --- NEW HELPER FUNCTIONS FOR THE BOT ---
/**
 * Sorts an array of cards from lowest to highest value.
 */
const sortCards = (cards) => {
    return [...cards].sort((a, b) => (0, exports.getCardValue)(a) - (0, exports.getCardValue)(b));
};
exports.sortCards = sortCards;
/**
 * Groups a player's hand by suit.
 * @returns A Map where keys are suits and values are arrays of cards.
 */
const groupHandBySuit = (hand) => {
    const suitMap = new Map();
    for (const suit of exports.allSuits) {
        suitMap.set(suit, []);
    }
    for (const card of hand) {
        suitMap.get(card.suit)?.push(card);
    }
    return suitMap;
};
exports.groupHandBySuit = groupHandBySuit;
