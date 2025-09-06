import { Card, Player, GameState, Suit, TrickCard, User } from "../types";
import { allSuits, allRanks, getCardValue, shuffleDeck } from "./utils";

/**
 * Creates a standard 52-card deck and shuffles it.
 * @returns A shuffled array of Card objects.
 */
export const createDeck = (): Card[] => {
  const deck: Card[] = [];
  for (const suit of allSuits) {
    for (const rank of allRanks) {
      deck.push({ suit, rank });
    }
  }
  return shuffleDeck(deck);
};

/**
 * Deals cards from a deck to a specified number of players.
 * @param deck The deck of cards to deal from.
 * @param numPlayers The number of players to deal to.
 * @returns An array of arrays, where each inner array represents a player's hand.
 */
export const dealCards = (deck: Card[], numPlayers: number): Card[][] => {
  const hands: Card[][] = Array(numPlayers).fill(0).map(() => []);
  const cardsPerPlayer = Math.floor(deck.length / numPlayers);

  for (let i = 0; i < cardsPerPlayer * numPlayers; i++) {
    hands[i % numPlayers].push(deck[i]);
  }
  
  // Sort each hand for a better player experience
  hands.forEach(hand => {
    hand.sort((a, b) => {
      const suitOrder = allSuits.indexOf(a.suit) - allSuits.indexOf(b.suit);
      if (suitOrder !== 0) return suitOrder;
      return getCardValue(b) - getCardValue(a); // Sort by value descending
    });
  });

  return hands;
};

/**
 * Initializes a new game state from a list of users in a room.
 * @param playerList The array of User objects from the room.
 * @param gameId The unique ID for this game session.
 * @param maxPlayers The maximum number of players for the game.
 * @returns A fully initialized GameState object.
 */
export const setupNewGame = (playerList: User[], gameId: string, maxPlayers: 2 | 3 | 4): GameState => {
  const deck = createDeck();
  const hands = dealCards(deck, playerList.length);

  const players: Player[] = playerList.map((p, index) => ({
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
    turnOrder.push(turnOrder.shift()!);
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

/**
 * Validates if a card play is legal according to the game rules.
 * @param gameState The current state of the game.
 * @param playerId The ID of the player attempting to play a card.
 * @param card The Card object being played.
 * @returns An object with a `valid` boolean and a `message` string.
 */
export const isMoveValid = (gameState: GameState, playerId: string, card: Card): { valid: boolean; message: string } => {
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

/**
 * Determines the winner of a completed trick.
 * @param trick The array of TrickCard objects played.
 * @param leadSuit The suit that led the trick.
 * @returns The ID of the winning player.
 */
export const determineTrickWinner = (trick: TrickCard[], leadSuit: Suit): string => {
  let winningCard: TrickCard | null = null;
  let highestValue = -1;

  for (const trickCard of trick) {
    // Only cards of the lead suit can win
    if (trickCard.card.suit === leadSuit) {
      const cardValue = getCardValue(trickCard.card);
      if (cardValue > highestValue) {
        highestValue = cardValue;
        winningCard = trickCard;
      }
    }
  }

  // This should always find a winner as the first card sets the lead suit.
  return winningCard!.playerId;
};

/**
 * Updates the game state after a trick is won.
 * @param gameState The current game state.
 * @param winningPlayerId The ID of the player who won the trick.
 * @returns The updated GameState object for the next trick.
 */
export const processTrickWin = (gameState: GameState, winningPlayerId: string): GameState => {
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

/**
 * Finds the next player in the turn order.
 * @param gameState The current game state.
 * @returns The ID of the next player to play.
 */
export const getNextPlayerId = (gameState: GameState): string => {
  const currentIndex = gameState.turnOrder.indexOf(gameState.currentPlayerId);
  const nextIndex = (currentIndex + 1) % gameState.turnOrder.length;
  return gameState.turnOrder[nextIndex];
};