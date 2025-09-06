// src/types/index.ts

export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface User {
  id: string; // Persistent UUID
  socketId: string; // Transient socket.id
  name: string;
  isHost?: boolean;
  status: 'online' | 'offline';
}

export interface Player extends User {
  hand: Card[];
  tricksWon: number;
  agoraUid: number;
}

// THIS WAS THE MISSING EXPORT
export interface Room {
  id: string;
  players: User[];
  hostId: string; // Persistent UUID
  gameId: string | null;
  maxPlayers: 2 | 3 | 4;
}

export interface TrickCard {
  playerId: string; // Persistent UUID
  card: Card;
}

export interface GameState {
  id: string;
  players: Player[];
  deck: Card[];
  currentTrick: TrickCard[];
  leadSuit: Suit | null;
  currentPlayerId: string; // Persistent UUID
  turnOrder: string[]; // Array of persistent UUIDs
  round: number;
  trickNumber: number;
  status: "waiting" | "playing" | "finished";
  hostId: string; // Persistent UUID
  maxPlayers: 2 | 3 | 4;
}