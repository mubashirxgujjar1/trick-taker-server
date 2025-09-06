"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNextPlayerId = exports.processTrickWin = exports.determineTrickWinner = exports.isMoveValid = exports.setupNewGame = exports.dealCards = exports.createDeck = void 0;
const utils_1 = require("./utils");
/**
 * Creates a standard 52-card deck and shuffles it.
 * @returns A shuffled array of Card objects.
 */
const createDeck = () => {
    const deck = [];
    for (const suit of utils_1.allSuits) {
        for (const rank of utils_1.allRanks) {
            deck.push({ suit, rank });
        }
    }
    return (0, utils_1.shuffleDeck)(deck);
};
exports.createDeck = createDeck;
/**
 * Deals cards from a deck to a specified number of players.
 * @param deck The deck of cards to deal from.
 * @param numPlayers The number of players to deal to.
 * @returns An array of arrays, where each inner array represents a player's hand.
 */
const dealCards = (deck, numPlayers) => {
    const hands = Array(numPlayers).fill(0).map(() => []);
    const cardsPerPlayer = Math.floor(deck.length / numPlayers);
    for (let i = 0; i < cardsPerPlayer * numPlayers; i++) {
        hands[i % numPlayers].push(deck[i]);
    }
    // Sort each hand for a better player experience
    hands.forEach(hand => {
        hand.sort((a, b) => {
            const suitOrder = utils_1.allSuits.indexOf(a.suit) - utils_1.allSuits.indexOf(b.suit);
            if (suitOrder !== 0)
                return suitOrder;
            return (0, utils_1.getCardValue)(b) - (0, utils_1.getCardValue)(a); // Sort by value descending
        });
    });
    return hands;
};
exports.dealCards = dealCards;
/**
 * Initializes a new game state from a list of users in a room.
 * @param playerList The array of User objects from the room.
 * @param gameId The unique ID for this game session.
 * @param maxPlayers The maximum number of players for the game.
 * @returns A fully initialized GameState object.
 */
const setupNewGame = (playerList, gameId, maxPlayers) => {
    const deck = (0, exports.createDeck)();
    const hands = (0, exports.dealCards)(deck, playerList.length);
    const players = playerList.map((p, index) => ({
        ...p,
        hand: hands[index],
        tricksWon: 0,
        agoraUid: 1000 + index, // Assign a unique Agora UID for voice chat
    }));
    // Determine starting player (player with 2 of clubs, or fallback to the host)
    let startingPlayerId = players.find(p => p.isHost)?.id || players[0].id;
    for (const player of players) {
        if (player.hand.some(card => card.suit === 'clubs' && card.rank === '2')) {
            startingPlayerId = player.id;
            break;
        }
    }
    // Set the turn order, starting with the determined player
    const turnOrder = [...players.map(p => p.id)];
    while (turnOrder[0] !== startingPlayerId) {
        turnOrder.push(turnOrder.shift());
    }
    return {
        id: gameId,
        players,
        deck: [], // Deck is now empty after dealing
        currentTrick: [],
        leadSuit: null,
        currentPlayerId: startingPlayerId,
        turnOrder,
        round: 1,
        trickNumber: 1,
        status: "playing",
        hostId: playerList.find(p => p.isHost)?.id || playerList[0].id,
        maxPlayers,
    };
};
exports.setupNewGame = setupNewGame;
/**
 * Validates if a card play is legal according to the game rules.
 * @param gameState The current state of the game.
 * @param playerId The ID of the player attempting to play a card.
 * @param card The Card object being played.
 * @returns An object with a `valid` boolean and a `message` string.
 */
const isMoveValid = (gameState, playerId, card) => {
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) {
        return { valid: false, message: "Player not found." };
    }
    if (gameState.currentPlayerId !== playerId) {
        return { valid: false, message: "It's not your turn." };
    }
    const hasCard = player.hand.some(c => c.suit === card.suit && c.rank === card.rank);
    if (!hasCard) {
        return { valid: false, message: "You don't have that card in your hand." };
    }
    // Rule: Must follow the lead suit if possible
    if (gameState.leadSuit) {
        const hasLeadSuit = player.hand.some(c => c.suit === gameState.leadSuit);
        if (hasLeadSuit && card.suit !== gameState.leadSuit) {
            return { valid: false, message: `You must follow suit by playing a ${gameState.leadSuit}.` };
        }
    }
    return { valid: true, message: "" };
};
exports.isMoveValid = isMoveValid;
/**
 * Determines the winner of a completed trick.
 * @param trick The array of TrickCard objects played.
 * @param leadSuit The suit that led the trick.
 * @returns The ID of the winning player.
 */
const determineTrickWinner = (trick, leadSuit) => {
    let winningCard = null;
    let highestValue = -1;
    for (const trickCard of trick) {
        // Only cards of the lead suit can win
        if (trickCard.card.suit === leadSuit) {
            const cardValue = (0, utils_1.getCardValue)(trickCard.card);
            if (cardValue > highestValue) {
                highestValue = cardValue;
                winningCard = trickCard;
            }
        }
    }
    // This should always find a winner as the first card sets the lead suit.
    return winningCard.playerId;
};
exports.determineTrickWinner = determineTrickWinner;
/**
 * Updates the game state after a trick is won.
 * @param gameState The current game state.
 * @param winningPlayerId The ID of the player who won the trick.
 * @returns The updated GameState object for the next trick.
 */
const processTrickWin = (gameState, winningPlayerId) => {
    const winner = gameState.players.find(p => p.id === winningPlayerId);
    if (winner) {
        winner.tricksWon += 1;
    }
    const nextTrickNumber = gameState.trickNumber + 1;
    // Game is over if the players' hands are empty
    const isGameOver = gameState.players[0].hand.length === 0;
    return {
        ...gameState,
        currentTrick: [],
        leadSuit: null,
        currentPlayerId: winningPlayerId, // Winner of the trick leads the next one
        trickNumber: nextTrickNumber,
        status: isGameOver ? "finished" : "playing",
    };
};
exports.processTrickWin = processTrickWin;
/**
 * Finds the next player in the turn order.
 * @param gameState The current game state.
 * @returns The ID of the next player to play.
 */
const getNextPlayerId = (gameState) => {
    const currentIndex = gameState.turnOrder.indexOf(gameState.currentPlayerId);
    const nextIndex = (currentIndex + 1) % gameState.turnOrder.length;
    return gameState.turnOrder[nextIndex];
};
exports.getNextPlayerId = getNextPlayerId;
