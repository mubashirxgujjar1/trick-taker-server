"use strict";
// src/index.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const agora_token_1 = require("agora-token");
const uuid_1 = require("uuid");
const rules_1 = require("./game-logic/rules");
const utils_1 = require("./game-logic/utils");
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, { cors: { origin: "http://localhost:3000", methods: ["GET", "POST"] } });
const rooms = new Map();
const games = new Map();
const playerTimers = new Map();
const reconnectionTimers = new Map();
const TURN_TIMEOUT_MS = 60000;
const TRICK_END_DELAY_MS = 2000;
const RECONNECTION_TIMEOUT_MS = 60000;
app.use((0, cors_1.default)({ origin: "http://localhost:3000" }));
app.get('/agora-token', (req, res) => {
    const channelName = req.query.channelName;
    const uid = Number(req.query.uid);
    if (!channelName || isNaN(uid)) {
        return res.status(400).json({ error: 'channelName and uid are required' });
    }
    const role = agora_token_1.RtcRole.PUBLISHER;
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;
    const token = agora_token_1.RtcTokenBuilder.buildTokenWithUid(process.env.AGORA_APP_ID, process.env.AGORA_APP_CERTIFICATE, channelName, uid, role, expirationTimeInSeconds, privilegeExpiredTs);
    res.json({ token });
});
// --- HELPER: Clears all timers associated with a player ---
const clearAllPlayerTimers = (playerId) => {
    if (playerTimers.has(playerId)) {
        clearTimeout(playerTimers.get(playerId));
        playerTimers.delete(playerId);
    }
    if (reconnectionTimers.has(playerId)) {
        clearTimeout(reconnectionTimers.get(playerId));
        reconnectionTimers.delete(playerId);
    }
};
// --- SECURE DATA BROADCASTING ---
/**
 * Creates a version of the game state that is safe to send to a specific player.
 * It hides the hands of all other players by replacing them with placeholders.
 */
const sanitizeGameStateForPlayer = (fullState, targetPlayerId) => {
    const sanitizedPlayers = fullState.players.map(player => {
        if (player.id === targetPlayerId) {
            return player; // Send the full hand to the target player
        }
        else {
            // For all other players, create a placeholder hand of the same length
            const placeholderHand = player.hand.map(() => ({ suit: 'spades', rank: '2' }));
            return {
                ...player,
                hand: placeholderHand,
            };
        }
    });
    return {
        ...fullState,
        players: sanitizedPlayers,
    };
};
/**
 * Broadcasts the game state securely to all players in a game.
 * Each player receives a version of the state with only their own hand visible.
 */
const broadcastGameState = (gameId) => {
    const gameState = games.get(gameId);
    if (!gameState)
        return;
    gameState.players.forEach((player) => {
        const sanitizedState = sanitizeGameStateForPlayer(gameState, player.id);
        io.to(player.socketId).emit('game-state-updated', sanitizedState);
    });
};
// --- BOT AND TURN MANAGEMENT LOGIC ---
const triggerAutoPlay = (gameId, playerId) => {
    const gameState = games.get(gameId);
    if (!gameState || gameState.currentPlayerId !== playerId)
        return;
    const player = gameState.players.find(p => p.id === playerId);
    if (!player || player.hand.length === 0)
        return;
    let cardToPlay;
    const hand = player.hand;
    const leadSuit = gameState.leadSuit;
    if (leadSuit) {
        const followSuitCards = (0, utils_1.sortCards)(hand.filter(c => c.suit === leadSuit));
        if (followSuitCards.length > 0) {
            const winningCardInTrick = gameState.currentTrick.filter(tc => tc.card.suit === leadSuit).sort((a, b) => (0, utils_1.getCardValue)(b.card) - (0, utils_1.getCardValue)(a.card))[0]?.card;
            const winningHandCards = winningCardInTrick ? followSuitCards.filter(c => (0, utils_1.getCardValue)(c) > (0, utils_1.getCardValue)(winningCardInTrick)) : followSuitCards;
            cardToPlay = winningHandCards.length > 0 ? winningHandCards[winningHandCards.length - 1] : followSuitCards[0];
        }
        else {
            const suitGroups = (0, utils_1.groupHandBySuit)(hand);
            let longestSuits = [];
            let maxLength = 0;
            suitGroups.forEach((cards, suit) => {
                if (cards.length > maxLength) {
                    maxLength = cards.length;
                    longestSuits = [suit];
                }
                else if (cards.length === maxLength) {
                    longestSuits.push(suit);
                }
            });
            const chosenSuit = longestSuits[Math.floor(Math.random() * longestSuits.length)];
            cardToPlay = (0, utils_1.sortCards)(suitGroups.get(chosenSuit))[0];
        }
    }
    else {
        cardToPlay = hand.reduce((highest, current) => (0, utils_1.getCardValue)(current) > (0, utils_1.getCardValue)(highest) ? current : highest);
    }
    console.log(`[AutoPlay] Bot for ${playerId} playing ${cardToPlay.rank} of ${cardToPlay.suit}`);
    handlePlayCardLogic(gameId, playerId, cardToPlay);
};
const advanceToNextTurn = (gameId, nextPlayerId) => {
    const gameState = games.get(gameId);
    if (!gameState || gameState.status === 'finished')
        return;
    gameState.currentPlayerId = nextPlayerId;
    games.set(gameId, gameState);
    broadcastGameState(gameId);
    startPlayerTurn(gameId, nextPlayerId);
};
const startPlayerTurn = (gameId, playerId) => {
    clearAllPlayerTimers(playerId);
    const timer = setTimeout(() => {
        console.log(`[Timer] Player ${playerId}'s turn timed out.`);
        triggerAutoPlay(gameId, playerId);
    }, TURN_TIMEOUT_MS);
    playerTimers.set(playerId, timer);
};
const handlePlayCardLogic = (gameId, playerId, card) => {
    let gameState = games.get(gameId);
    if (!gameState)
        return;
    const room = rooms.get(gameId.replace('game-', ''));
    if (!room)
        return;
    clearAllPlayerTimers(playerId);
    const player = gameState.players.find((p) => p.id === playerId);
    player.hand = player.hand.filter(c => !(c.rank === card.rank && c.suit === card.suit));
    gameState.currentTrick.push({ playerId, card });
    if (!gameState.leadSuit) {
        gameState.leadSuit = card.suit;
    }
    if (gameState.currentTrick.length === gameState.players.length) {
        gameState.currentPlayerId = '';
        broadcastGameState(gameId);
        setTimeout(() => {
            let currentState = games.get(gameId);
            if (!currentState)
                return;
            const winnerId = (0, rules_1.determineTrickWinner)(currentState.currentTrick, currentState.leadSuit);
            const trickToEmit = [...currentState.currentTrick];
            let nextState = (0, rules_1.processTrickWin)(currentState, winnerId);
            io.to(room.id).emit('trick-won', { winnerId, trick: trickToEmit });
            if (nextState.status === 'finished') {
                io.to(room.id).emit('game-over', nextState.players.map((p) => ({ id: p.id, name: p.name, tricksWon: p.tricksWon })));
                nextState.players.forEach(p => clearAllPlayerTimers(p.id));
                games.delete(gameId);
                if (room)
                    room.gameId = null;
            }
            else {
                games.set(gameId, nextState);
                advanceToNextTurn(gameId, winnerId);
            }
        }, TRICK_END_DELAY_MS);
    }
    else {
        const nextPlayerId = (0, rules_1.getNextPlayerId)(gameState);
        advanceToNextTurn(gameId, nextPlayerId);
    }
};
io.on('connection', (socket) => {
    console.log('User connected with socket ID:', socket.id);
    socket.on('create-room', ({ userName, maxPlayers }) => {
        console.log(`[SERVER] Received 'create-room' event from ${userName} (socket: ${socket.id})`);
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        const userId = (0, uuid_1.v4)();
        const user = { id: userId, socketId: socket.id, name: userName, isHost: true, status: 'online' };
        const room = { id: roomId, players: [user], hostId: userId, gameId: null, maxPlayers };
        rooms.set(roomId, room);
        socket.join(roomId);
        socket.emit('room-created', { roomId, userId, hostId: userId });
    });
    socket.on('join-room', ({ roomId, userName }) => {
        const room = rooms.get(roomId);
        if (!room)
            return socket.emit('room-error', 'Room not found.');
        if (room.players.length >= room.maxPlayers)
            return socket.emit('room-error', 'Room is full.');
        const userId = (0, uuid_1.v4)();
        const user = { id: userId, socketId: socket.id, name: userName, status: 'online' };
        room.players.push(user);
        socket.join(roomId);
        socket.emit('room-joined', { roomId, userId, hostId: room.hostId, maxPlayers: room.maxPlayers });
        io.to(roomId).emit('player-joined', room.players);
    });
    socket.on('reconnect-player', ({ userId, roomId }) => {
        const room = rooms.get(roomId);
        if (!room)
            return;
        const player = room.players.find((p) => p.id === userId);
        if (!player)
            return;
        clearAllPlayerTimers(userId);
        player.status = 'online';
        player.socketId = socket.id;
        socket.join(roomId);
        io.to(roomId).emit('player-reconnected', { userId });
        const game = games.get(room.gameId);
        if (game) {
            const sanitizedState = sanitizeGameStateForPlayer(game, userId);
            socket.emit('game-state-updated', sanitizedState);
        }
    });
    socket.on('start-game', ({ roomId, playerId }) => {
        const room = rooms.get(roomId);
        if (!room || room.hostId !== playerId)
            return;
        if (room.players.length < 2)
            return;
        const gameId = `game-${roomId}`;
        const gameState = (0, rules_1.setupNewGame)(room.players, gameId, room.maxPlayers);
        games.set(gameId, gameState);
        room.gameId = gameId;
        io.to(roomId).emit('game-started', gameId);
        broadcastGameState(gameId);
        startPlayerTurn(gameId, gameState.currentPlayerId);
    });
    socket.on('play-card', ({ gameId, playerId, card }) => {
        const gameState = games.get(gameId);
        if (!gameState || gameState.currentPlayerId !== playerId)
            return;
        const validation = (0, rules_1.isMoveValid)(gameState, playerId, card);
        if (!validation.valid)
            return socket.emit('game-error', validation.message);
        handlePlayCardLogic(gameId, playerId, card);
    });
    socket.on('disconnect', () => {
        let roomIdToUpdate, disconnectedUser;
        for (const [id, room] of rooms.entries()) {
            const user = room.players.find((p) => p.socketId === socket.id);
            if (user) {
                roomIdToUpdate = id;
                disconnectedUser = user;
                break;
            }
        }
        if (roomIdToUpdate && disconnectedUser) {
            const room = rooms.get(roomIdToUpdate);
            const user = room.players.find((p) => p.id === disconnectedUser.id);
            if (user) {
                user.status = 'offline';
                io.to(roomIdToUpdate).emit('player-disconnected', { userId: user.id });
                const game = games.get(room.gameId);
                if (game && game.currentPlayerId === user.id) {
                    console.log(`[Disconnect] It was ${user.name}'s turn. Advancing turn.`);
                    const nextPlayerId = (0, rules_1.getNextPlayerId)(game);
                    advanceToNextTurn(game.id, nextPlayerId);
                }
                const timer = setTimeout(() => {
                    const currentRoom = rooms.get(roomIdToUpdate);
                    if (!currentRoom)
                        return;
                    const playerStillOffline = currentRoom.players.find(p => p.id === user.id && p.status === 'offline');
                    if (playerStillOffline) {
                        console.log(`[Timer] Removing ${user.name} permanently.`);
                        currentRoom.players = currentRoom.players.filter((p) => p.id !== user.id);
                        clearAllPlayerTimers(user.id);
                        const currentGame = games.get(currentRoom.gameId);
                        if (currentGame) {
                            currentGame.players = currentGame.players.filter((p) => p.id !== user.id);
                            if (currentGame.players.length < 2) {
                                io.to(currentRoom.id).emit('game-over', []);
                                games.delete(currentRoom.gameId);
                                currentRoom.gameId = null;
                            }
                        }
                        if (currentRoom.players.length === 0) {
                            rooms.delete(roomIdToUpdate);
                        }
                        else {
                            if (currentRoom.hostId === user.id) {
                                currentRoom.hostId = currentRoom.players[0].id;
                                currentRoom.players[0].isHost = true;
                            }
                            io.to(roomIdToUpdate).emit('player-left', { players: currentRoom.players, hostId: currentRoom.hostId });
                        }
                    }
                }, RECONNECTION_TIMEOUT_MS);
                reconnectionTimers.set(user.id, timer);
            }
        }
    });
});
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
