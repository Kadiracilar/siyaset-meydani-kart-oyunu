const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 6;
const COLORS = ["RED", "BLUE", "YELLOW"];
const ROLES = ["ROLE_1", "ROLE_2", "ROLE_3", "ROLE_4", "ROLE_5", "ROLE_6"];
const REACTION_TIMEOUT_MS = 10000;

let gameState = {
    started: false,
    players: [],
    dealerIndex: 0,
    currentPlayerIndex: 0,
    currentTarget: null,
    targetDeck: [],
    centerDeck: [],
    discardPile: [],
    agendaPile: [],
    hudMessage: "Oyuncular bekleniyor...",
    evacuationMode: false,
    evacuationOrder: [],
    evacuationIndex: 0,
    specialYTurnLimit: null,
    specialYTurnCount: 0,
    role3UsesThisTurn: 0,
    role4UsedThisTurn: false,
    role5UsesTotal: 0,
    role5RedPenaltyCount: 0,
    role3NoPenaltyCount: 0,
    activeReaction: null
};

// ─────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function currentPlayer() {
    return gameState.players[gameState.currentPlayerIndex];
}

function findPlayer(socketId) {
    return gameState.players.find(p => p.id === socketId);
}

function findRole(role) {
    return gameState.players.find(p => p.role === role);
}

// ─────────────────────────────────────────────
//  DECK FACTORIES
// ─────────────────────────────────────────────
function createTargetDeck() {
    const deck = [];
    for (let i = 0; i < 4; i++) deck.push({ type: "TARGET", color: "RED",    threshold: 10, reward: 10, turnLimit: 4 });
    for (let i = 0; i < 4; i++) deck.push({ type: "TARGET", color: "BLUE",   threshold: 10, reward: 10, turnLimit: 4 });
    for (let i = 0; i < 4; i++) deck.push({ type: "TARGET", color: "YELLOW", threshold: 10, reward: 10, turnLimit: 4 });
    deck.push({ type: "SPECIAL_X", threshold: 8,  turnLimit: 4 });
    deck.push({ type: "SPECIAL_Y", threshold: 12, turnLimit: 3 });
    return shuffle(deck);
}

function createCenterDeck() {
    const deck = [];
    COLORS.forEach(color => {
        for (let i = 0; i < 4; i++) deck.push({ type: "POWER", value: 1, color, cost: 1 });
        for (let i = 0; i < 3; i++) deck.push({ type: "POWER", value: 2, color, cost: 1 });
        for (let i = 0; i < 2; i++) deck.push({ type: "POWER", value: 3, color, cost: 2 });
        deck.push({ type: "POWER", value: 4, color, cost: 3 });
    });
    for (let i = 0; i < 6; i++) deck.push({ type: "CANCEL",        cost: 0 });
    for (let i = 0; i < 4; i++) deck.push({ type: "REDUCE",        cost: 2 });
    for (let i = 0; i < 2; i++) deck.push({ type: "CHANGE_TARGET", cost: 3 });
    for (let i = 0; i < 2; i++) deck.push({ type: "REFRESH",       cost: 1 });
    return shuffle(deck);
}

function createPlayer(socketId, name) {
    return {
        id: socketId,
        name,
        role: null,
        score: 0,
        energy: 3,
        hand: [],
        skipDraw: false,
        cancelPenalty: false,
        active: true,
        actedThisTurn: false,
        usedBlackDiscount: false,
        playedToAgendaThisTurn: false
    };
}

// ─────────────────────────────────────────────
//  CARD DRAW
// ─────────────────────────────────────────────
function drawCard(player) {
    if (gameState.centerDeck.length === 0) {
        checkDeckExhaustion();
        return null;
    }
    const card = gameState.centerDeck.pop();
    player.hand.push(card);
    checkDeckExhaustion();
    return card;
}

function drawCards(player, count) {
    for (let i = 0; i < count; i++) {
        if (gameState.centerDeck.length === 0) break;
        drawCard(player);
    }
}

// ─────────────────────────────────────────────
//  POWER CALCULATION
// ─────────────────────────────────────────────
function calculatePower(card, player) {
    let power = card.value;
    if (gameState.currentTarget && gameState.currentTarget.color && card.color === gameState.currentTarget.color) {
        power++;
    }
    // ROLE_6: value-1 cards get +1 conformity bonus
    if (player && player.role === "ROLE_6" && card.value === 1) {
        power++;
    }
    return power;
}

function agendaPower() {
    return gameState.agendaPile.reduce((t, c) => t + c.power, 0);
}

// ─────────────────────────────────────────────
//  BROADCAST
// ─────────────────────────────────────────────
function getPublicState() {
    return {
        started: gameState.started,
        players: gameState.players.map(p => ({
            id: p.id,
            name: p.name,
            score: p.score,
            energy: p.energy,
            role: p.role,
            handCount: p.hand.length
        })),
        dealerIndex: gameState.dealerIndex,
        currentPlayerIndex: gameState.currentPlayerIndex,
        currentTarget: gameState.currentTarget,
        agendaPile: gameState.agendaPile,
        discardCount: gameState.discardPile.length,
        hudMessage: gameState.hudMessage,
        evacuationMode: gameState.evacuationMode,
        evacuationIndex: gameState.evacuationIndex,
        evacuationOrder: gameState.evacuationOrder,
        activeReaction: gameState.activeReaction
            ? {
                type: gameState.activeReaction.type,
                forSocketId: gameState.activeReaction.forSocketId,
                startedAt: gameState.activeReaction.startedAt,
                timeoutMs: REACTION_TIMEOUT_MS
              }
            : null
    };
}

function broadcastState() {
    gameState.players.forEach(p => {
        io.to(p.id).emit("privateState", { hand: p.hand });
    });
    io.emit("stateUpdate", getPublicState());
}

// ─────────────────────────────────────────────
//  REACTION SYSTEM
// ─────────────────────────────────────────────
function startReaction(type, forSocketId, onResolve) {
    clearReaction();

    const reaction = {
        type,
        forSocketId,
        startedAt: Date.now(),
        resolve: onResolve,
        timer: null
    };

    reaction.timer = setTimeout(() => {
        if (gameState.activeReaction === reaction) {
            gameState.hudMessage = `${findPlayer(forSocketId)?.name || "?"} reaksiyon süresini geçti – Pas.`;
            clearReaction();
            onResolve("pass");
        }
    }, REACTION_TIMEOUT_MS);

    gameState.activeReaction = reaction;

    let remaining = REACTION_TIMEOUT_MS / 1000;
    const tickInterval = setInterval(() => {
        remaining--;
        if (gameState.activeReaction !== reaction || remaining <= 0) {
            clearInterval(tickInterval);
            return;
        }
        io.emit("reactionTick", { type, forSocketId, remaining });
    }, 1000);

    broadcastState();
}

function clearReaction() {
    if (gameState.activeReaction) {
        clearTimeout(gameState.activeReaction.timer);
        gameState.activeReaction = null;
    }
}

function resolveReaction(decision) {
    if (!gameState.activeReaction) return;
    const cb = gameState.activeReaction.resolve;
    clearReaction();
    cb(decision);
    broadcastState();
}

// ─────────────────────────────────────────────
//  TARGET REVEAL
// ─────────────────────────────────────────────
function revealTarget() {
    if (gameState.targetDeck.length === 0) {
        gameState.currentTarget = null;
        checkDeckExhaustion();
        return;
    }

    const nextTarget = gameState.targetDeck[gameState.targetDeck.length - 1];
    const role3 = findRole("ROLE_3");

    if (role3 && gameState.role3UsesThisTurn < 2) {
        startReaction("ROLE3_PEEK", role3.id, (decision) => {
            if (decision === "look_and_pay") {
                if (role3.energy >= 1) {
                    role3.energy--;
                    gameState.role3UsesThisTurn++;
                    io.to(role3.id).emit("role3Peek", { target: nextTarget });
                    
                    startReaction("ROLE3_CHANGE", role3.id, (dec2) => {
                        if (dec2 === "change" && gameState.role3UsesThisTurn < 2) {
                            gameState.role3UsesThisTurn++;
                            gameState.targetDeck.pop();
                            shuffle(gameState.targetDeck);
                        }
                        doRevealTarget();
                    });
                } else {
                    doRevealTarget();
                }
            } else {
                doRevealTarget();
            }
        });
    } else {
        doRevealTarget();
    }
}

function doRevealTarget() {
    if (gameState.targetDeck.length === 0) {
        gameState.currentTarget = null;
        checkDeckExhaustion();
        return;
    }
    gameState.currentTarget = gameState.targetDeck.pop();
    gameState.agendaPile = [];
    gameState.role3UsesThisTurn = 0;
    gameState.role4UsedThisTurn = false;

    if (gameState.currentTarget.type === "SPECIAL_Y") {
        gameState.specialYTurnLimit = gameState.currentTarget.turnLimit;
        gameState.specialYTurnCount = 0;
    }

    gameState.hudMessage = `Yeni hedef: ${gameState.currentTarget.type} (${gameState.currentTarget.color || "ÖZEL"})`;
    broadcastState();
}

// ─────────────────────────────────────────────
//  TARGET RESOLUTION
// ─────────────────────────────────────────────
function checkTargetSolved() {
    if (!gameState.currentTarget) return;
    if (agendaPower() >= gameState.currentTarget.threshold) {
        resolveTarget();
    }
}

function resolveTarget() {
    const lastCard = gameState.agendaPile[gameState.agendaPile.length - 1];
    const winner = lastCard ? gameState.players.find(p => p.id === lastCard.owner) : null;
    if (!winner) return;

    const target = gameState.currentTarget;
    const role5 = findRole("ROLE_5");

    if (role5 && role5.id !== winner.id && gameState.role5UsesTotal < 3 && role5.hand.length > 0) {
        startReaction("ROLE5_STEAL", role5.id, (decision) => {
            continueResolveTarget(target, winner);
        });
    } else {
        continueResolveTarget(target, winner);
    }
}

function continueResolveTarget(target, winner) {
    const lastCard = gameState.agendaPile[gameState.agendaPile.length - 1];

    if (target.type === "SPECIAL_X") {
        const rivals = gameState.players.filter(p => p.id !== winner.id);
        if (rivals.length > 0) {
            const victim = rivals[Math.floor(Math.random() * rivals.length)];
            victim.score = Math.max(0, victim.score - 10);
            gameState.hudMessage = `${winner.name} ÖZEL-X: ${victim.name}'in 10 puanını sildi!`;
        } else {
            gameState.hudMessage = `${winner.name} ÖZEL-X'i çözdü, ancak puanı silinecek rakip bulunamadı!`;
        }
    } else if (target.type === "SPECIAL_Y") {
        winner.score += 5;
        gameState.players.forEach(p => { if (p.id !== winner.id) p.score = Math.max(0, p.score - 5); });
        gameState.hudMessage = `${winner.name} ÖZEL-Y: +5, diğerleri -5!`;
    } else {
        let reward = target.reward || 10;
        let hasSynergy = false;
        if (winner.role && target.color) {
            if (target.color === "RED" && (winner.role === "ROLE_1" || winner.role === "ROLE_2")) {
                hasSynergy = true;
            } else if (target.color === "BLUE" && (winner.role === "ROLE_3" || winner.role === "ROLE_4")) {
                hasSynergy = true;
            } else if (target.color === "YELLOW" && (winner.role === "ROLE_5" || winner.role === "ROLE_6")) {
                hasSynergy = true;
            }
        }
        if (hasSynergy) {
            reward += 2; // Sinerji Bonusu
        }
        winner.score += reward;
        gameState.hudMessage = `${winner.name} hedefi çözdü! ${hasSynergy ? '(SİNERJİ BONUSU!) ' : ''}+${reward}`;
    }

    const role2 = findRole("ROLE_2");
    if (role2 && target.color === "BLUE" && winner.id !== role2.id) {
        role2.score = Math.max(0, role2.score - 2);
    }

    const role6 = findRole("ROLE_6");
    if (role6 && lastCard && lastCard.color === "RED" && winner.id !== role6.id) {
        role6.score = Math.max(0, role6.score - 2);
    }

    moveAgendaToDiscard();
    rotateDealer();
    revealTarget();
    checkVictory();
    broadcastState();
}

// ─────────────────────────────────────────────
//  EVACUATION PROTOCOL
// ─────────────────────────────────────────────
function checkDeckExhaustion() {
    if (gameState.evacuationMode) return;
    const noWinner = !gameState.players.some(p => p.score >= 51);
    const deckEmpty = gameState.centerDeck.length === 0 || gameState.targetDeck.length === 0;
    if (deckEmpty && noWinner) {
        startEvacuation();
    }
}

function startEvacuation() {
    gameState.evacuationMode = true;
    gameState.evacuationOrder = gameState.players.filter(p => p.hand.length > 0).map(p => p.id);
    gameState.evacuationIndex = 0;
    gameState.hudMessage = "TAHLİYE SAFHASINA GEÇİLDİ! Sırayla 1 enerji harcayarak elinizdeki kartı atın.";
    broadcastState();
    promptEvacuationTurn();
}

function promptEvacuationTurn() {
    if (gameState.evacuationIndex >= gameState.evacuationOrder.length) {
        const anyLeft = gameState.players.some(p => p.hand.length > 0);
        if (anyLeft) {
            gameState.evacuationIndex = 0;
            gameState.evacuationOrder = gameState.players.filter(p => p.hand.length > 0).map(p => p.id);
            promptEvacuationTurn();
        } else {
            finalizeEvacuation();
        }
        return;
    }
    const pid = gameState.evacuationOrder[gameState.evacuationIndex];
    const player = findPlayer(pid);
    if (!player || player.hand.length === 0) {
        gameState.evacuationIndex++;
        promptEvacuationTurn();
        return;
    }
    broadcastState();
}

function finalizeEvacuation() {
    gameState.currentTarget = null;
    gameState.agendaPile = [];
    const all = [...gameState.centerDeck, ...gameState.discardPile];
    gameState.centerDeck = shuffle(all);
    gameState.discardPile = [];
    gameState.evacuationMode = false;
    gameState.players.forEach(p => {
        p.hand = [];
        drawCards(p, 5);
    });
    revealTarget();
    gameState.hudMessage = "Tasfiye tamamlandı. Yeni tur başlıyor.";
    broadcastState();
}

// ─────────────────────────────────────────────
//  DEALER & TURN ROTATION
// ─────────────────────────────────────────────
function rotateDealer() {
    gameState.dealerIndex = (gameState.dealerIndex + 1) % gameState.players.length;
    gameState.currentPlayerIndex = (gameState.dealerIndex + 1) % gameState.players.length;
}

function moveAgendaToDiscard(triggerSalvage = true) {
    if (gameState.agendaPile.length > 0) {
        const lastCard = gameState.agendaPile[gameState.agendaPile.length - 1];
        gameState.agendaPile.forEach(c => gameState.discardPile.push(c));
        gameState.agendaPile = [];
        if (triggerSalvage) {
            triggerRole4Reaction(lastCard);
        }
    }
}

function nextPlayer() {
    gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
    beginTurn();
}

function beginTurn() {
    const player = currentPlayer();
    player.actedThisTurn = false;
    player.playedToAgendaThisTurn = false;

    if (gameState.currentTarget && gameState.currentTarget.type === "SPECIAL_Y") {
        if (gameState.currentPlayerIndex === gameState.dealerIndex) {
            gameState.specialYTurnCount++;
            if (gameState.specialYTurnCount >= gameState.specialYTurnLimit) {
                gameState.players.forEach(p => p.score = Math.max(0, p.score - 7));
                gameState.hudMessage = "ÖZEL-Y çözülemedi! Herkes -7 skor!";
                moveAgendaToDiscard();
                rotateDealer();
                revealTarget();
                broadcastState();
                return;
            }
        }
    }

    if (player.cancelPenalty) {
        player.energy = 2;
        player.cancelPenalty = false;
    } else {
        player.energy = 3;
    }

    const role2 = findRole("ROLE_2");
    if (role2 && role2.id === player.id && role2.bonusEnergy) {
        player.energy += 2;
        role2.bonusEnergy = false;
    }

    gameState.hudMessage = `${player.name} sırası başladı`;
    broadcastState();
}

function drawEndTurn(player) {
    if (player.role === "ROLE_4") return;
    if (player.skipDraw) {
        player.skipDraw = false;
        return;
    }
    if (player.role === "ROLE_1") {
        if (player.energy >= 1) {
            player.energy--;
            drawCard(player);
        }
        return;
    }
    drawCard(player);
}

function checkVictory() {
    const winner = gameState.players.find(p => p.score >= 51);
    if (!winner) return;
    gameState.hudMessage = `🏆 ${winner.name} PARTİYİ KAZANDI!`;
    gameState.started = false;
    broadcastState();
}

function startGame() {
    gameState.started = true;
    gameState.evacuationMode = false;
    gameState.centerDeck = createCenterDeck();
    gameState.targetDeck = createTargetDeck();
    gameState.discardPile = [];
    gameState.agendaPile = [];

    shuffle(gameState.players);
    const shuffledRoles = shuffle([...ROLES]).slice(0, gameState.players.length);
    gameState.players.forEach((p, index) => {
        p.role = shuffledRoles[index] || null;
        p.score = 0;
        p.energy = 3;
        p.hand = [];
        p.skipDraw = false;
        p.cancelPenalty = false;
        p.actedThisTurn = false;
        p.usedBlackDiscount = false;
        p.playedToAgendaThisTurn = false;
        drawCards(p, 5);
    });

    gameState.dealerIndex = Math.floor(Math.random() * gameState.players.length);
    gameState.currentPlayerIndex = (gameState.dealerIndex + 1) % gameState.players.length;
    revealTarget();
    broadcastState();
}

// ─────────────────────────────────────────────
//  CANCEL DUEL SYSTEM
// ─────────────────────────────────────────────
let pendingCancel = null;

function handleCancel(socket, targetId) {
    const attacker = findPlayer(socket.id);
    if (!attacker) return;

    const cardIndex = attacker.hand.findIndex(c => c.type === "CANCEL");
    if (cardIndex === -1) return;

    attacker.hand.splice(cardIndex, 1);
    attacker.cancelPenalty = true;

    // Discard the played CANCEL card
    const cancelCard = { type: "CANCEL", cost: 0 };
    gameState.discardPile.push(cancelCard);

    // Cancel the last played card in the agenda pile if any
    let cancelledCard = null;
    if (gameState.agendaPile.length > 0) {
        cancelledCard = gameState.agendaPile.pop();
        gameState.discardPile.push(cancelledCard);
        gameState.hudMessage = `${attacker.name} İPTAL (NOPE) oynadı! Son oynanan ${cancelledCard.type === 'POWER' ? (cancelledCard.color + ' ' + cancelledCard.value + ' Güç') : cancelledCard.type} kartı iptal edildi.`;
    } else {
        gameState.hudMessage = `${attacker.name} İPTAL (NOPE) oynadı, ancak iptal edilecek kart bulunamadı!`;
    }

    if (pendingCancel && pendingCancel.targetId === socket.id) {
        attacker.cancelPenalty = false;
        const originalAttacker = findPlayer(pendingCancel.ownerId);
        if (originalAttacker && originalAttacker.hand.length > 0) {
            const ri = Math.floor(Math.random() * originalAttacker.hand.length);
            originalAttacker.hand.splice(ri, 1);
            originalAttacker.cancelPenalty = true;
        }
        pendingCancel = null;
        gameState.hudMessage = `${attacker.name} CANCEL'ı karşıladı! Meşru Müdafaa.`;
        
        // Trigger ROLE_4 salvage
        triggerRole4Reaction(cancelCard);
        broadcastState();
        return;
    }

    pendingCancel = { ownerId: socket.id, targetId };

    const role2 = findRole("ROLE_2");
    if (role2 && role2.id !== socket.id) {
        startReaction("ROLE2_CANCEL", role2.id, (decision) => {
            pendingCancel = null;
            if (decision === "accept") {
                if (attacker.hand.length > 0) {
                    const ri = Math.floor(Math.random() * attacker.hand.length);
                    attacker.hand.splice(ri, 1);
                }
                role2.bonusEnergy = true;
                gameState.hudMessage = `ROLE_2 CANCEL'ı mühürledi! Saldırgan kart kaybetti.`;
            } else {
                gameState.hudMessage = `ROLE_2 reaksiyonu geçti.`;
            }
            // Trigger ROLE_4 salvage
            if (cancelledCard) {
                triggerRole4Reaction(cancelledCard);
            } else {
                triggerRole4Reaction(cancelCard);
            }
            broadcastState();
        });
    } else {
        pendingCancel = null;
        // Trigger ROLE_4 salvage
        if (cancelledCard) {
            triggerRole4Reaction(cancelledCard);
        } else {
            triggerRole4Reaction(cancelCard);
        }
    }
    broadcastState();
}

// ─────────────────────────────────────────────
//  SOCKET LISTENERS
// ─────────────────────────────────────────────
io.on("connection", (socket) => {
    // Emit current state immediately to the connecting client
    socket.emit("stateUpdate", getPublicState());

    socket.on("join", (name) => {
        if (gameState.started) return;
        if (gameState.players.length >= MAX_PLAYERS) return;
        gameState.players.push(createPlayer(socket.id, name));
        broadcastState();
    });

    socket.on("startGame", () => {
        if (!gameState.started && gameState.players.length >= 2) startGame();
    });

    socket.on("playCard", (cardIndex) => {
        if (!gameState.started || gameState.activeReaction || gameState.evacuationMode) return;
        const player = findPlayer(socket.id);
        if (!player) return;

        const card = player.hand[cardIndex];
        if (!card) return;

        // Non-active players can only play CANCEL card out of turn
        const isCurrent = player.id === currentPlayer().id;
        if (!isCurrent && card.type !== "CANCEL") return;

        let effectiveCost = card.cost;
        if (player.role === "ROLE_1" && card.type !== "POWER" && !player.usedBlackDiscount) {
            effectiveCost = Math.max(0, effectiveCost - 1);
            player.usedBlackDiscount = true;
        }
        if (player.role === "ROLE_6" && card.type === "POWER" && card.value === 1) {
            effectiveCost += 1;
        }

        if (player.energy < effectiveCost) return;

        if (player.role === "ROLE_1" && card.type === "REFRESH") {
            player.score = Math.max(0, player.score - 1);
        }

        if (card.type === "POWER") {
            player.energy -= effectiveCost;
            if (effectiveCost >= 1) {
                player.actedThisTurn = true;
            }
            player.hand.splice(cardIndex, 1);

            let power = calculatePower(card, player);

            if (player.role === "ROLE_5" && gameState.currentTarget && gameState.currentTarget.color === "RED" && gameState.role5RedPenaltyCount < 2) {
                power = Math.max(0, power - 1);
                gameState.role5RedPenaltyCount++;
            }
            if (player.role === "ROLE_4" && gameState.currentTarget && gameState.currentTarget.color === "RED" && card.color !== "RED") {
                power = Math.max(0, power - 1);
            }

            gameState.agendaPile.push({ ...card, owner: player.id, power, thisRound: true });
            player.playedToAgendaThisTurn = true;
            gameState.hudMessage = `${player.name} güç kartı oynadı (Güç: ${power})`;
            checkTargetSolved();
            broadcastState();
            return;
        }

        if (card.type === "CANCEL") {
            handleCancel(socket, currentPlayer().id);
            return;
        }

        if (card.type === "REDUCE") {
            player.energy -= effectiveCost;
            if (effectiveCost >= 1) {
                player.actedThisTurn = true;
            }
            player.hand.splice(cardIndex, 1);
            gameState.discardPile.push(card);

            if (gameState.agendaPile.length > 0) {
                const removed = gameState.agendaPile.pop();
                gameState.discardPile.push(removed);
                triggerRole4Reaction(removed);
            } else {
                triggerRole4Reaction(card);
            }
            broadcastState();
            return;
        }

        if (card.type === "CHANGE_TARGET") {
            player.energy -= effectiveCost;
            if (effectiveCost >= 1) {
                player.actedThisTurn = true;
            }
            player.hand.splice(cardIndex, 1);
            
            // Discard the played CHANGE_TARGET card
            gameState.discardPile.push(card);

            moveAgendaToDiscard(false);
            if (gameState.currentTarget) gameState.targetDeck.unshift(gameState.currentTarget);
            shuffle(gameState.targetDeck);
            gameState.currentTarget = null;
            
            // Trigger salvage for the CHANGE_TARGET card
            triggerRole4Reaction(card);
            
            revealTarget();
            broadcastState();
            return;
        }

        if (card.type === "REFRESH") {
            player.energy -= effectiveCost;
            if (effectiveCost >= 1) {
                player.actedThisTurn = true;
            }
            player.hand.splice(cardIndex, 1);
            gameState.discardPile.push(card);

            player.hand.forEach(c => gameState.discardPile.push(c));
            player.hand = [];
            drawCards(player, 5);
            triggerRole4Reaction(card);
            broadcastState();
            return;
        }
    });

    socket.on("playCancel", ({ cardIndex, targetId }) => {
        if (!gameState.started || gameState.activeReaction) return;
        handleCancel(socket, targetId);
    });

    socket.on("maneuver", (cardIndex) => {
        if (!gameState.started || gameState.activeReaction || currentPlayer().id !== socket.id || currentPlayer().energy < 1) return;
        const player = currentPlayer();
        const card = player.hand[cardIndex];
        if (!card) return;

        player.energy--;
        player.actedThisTurn = true;
        player.hand.splice(cardIndex, 1);
        gameState.discardPile.push(card);
        triggerRole4Reaction(card);
        drawCard(player);
        broadcastState();
    });

    socket.on("checkForcedManeuver", () => {
        const player = currentPlayer();
        if (player.id !== socket.id || player.actedThisTurn) return;

        const canPlay = player.hand.some(c => c.cost <= player.energy);
        if (!canPlay) {
            if (player.energy >= 1 && player.hand.length > 0) {
                player.energy--;
                const card = player.hand.splice(0, 1)[0];
                gameState.discardPile.push(card);
                triggerRole4Reaction(card);
                drawCard(player);
            }
            player.actedThisTurn = true;
            drawEndTurn(player);
            nextPlayer();
            broadcastState();
        }
    });

    socket.on("endTurn", () => {
        if (!gameState.started || gameState.activeReaction) return;
        const player = currentPlayer();
        if (player.id !== socket.id || !player.actedThisTurn) return;

        if (player.role === "ROLE_3") {
            if (!player.playedToAgendaThisTurn && gameState.role3NoPenaltyCount < 5) {
                player.score = Math.max(0, player.score - 1);
                gameState.role3NoPenaltyCount++;
            }
        }

        player.usedBlackDiscount = false;
        drawEndTurn(player);
        nextPlayer();
        broadcastState();
    });

    socket.on("reactionResponse", ({ decision, cardIndex }) => {
        if (!gameState.activeReaction || gameState.activeReaction.forSocketId !== socket.id) return;

        if (gameState.activeReaction.type === "ROLE5_STEAL" && decision === "throw") {
            const role5 = findPlayer(socket.id);
            if (role5 && typeof cardIndex === "number" && role5.hand[cardIndex]) {
                const card = role5.hand[cardIndex];
                const lastCard = gameState.agendaPile[gameState.agendaPile.length - 1];
                const winner = lastCard ? findPlayer(lastCard.owner) : null;
                if (winner) {
                    winner.score = Math.max(0, winner.score - (card.cost || 0));
                }
                role5.hand.splice(cardIndex, 1);
                gameState.discardPile.push(card);
                triggerRole4Reaction(card);
                gameState.role5UsesTotal++;
            }
        }
        resolveReaction(decision);
    });

    socket.on("evacuationDiscard", (cardIndex) => {
        if (!gameState.evacuationMode) return;
        const pid = gameState.evacuationOrder[gameState.evacuationIndex];
        if (socket.id !== pid) return;

        const player = findPlayer(socket.id);
        if (!player) return;

        const card = player.hand[cardIndex];
        if (!card) return;

        if (player.energy >= 1) {
            player.energy--;
        }
        player.hand.splice(cardIndex, 1);
        gameState.discardPile.push(card);

        gameState.evacuationIndex++;
        const anyLeft = gameState.players.some(p => p.hand.length > 0);
        if (!anyLeft) finalizeEvacuation();
        else promptEvacuationTurn();
    });

    socket.on("disconnect", () => {
        const idx = gameState.players.findIndex(p => p.id === socket.id);
        if (idx !== -1) {
            gameState.players.splice(idx, 1);
            if (gameState.activeReaction && gameState.activeReaction.forSocketId === socket.id) resolveReaction("pass");
            if (gameState.players.length < 2) {
                gameState.started = false;
            } else if (gameState.started) {
                if (gameState.evacuationMode) {
                    gameState.evacuationOrder = gameState.evacuationOrder.filter(id => id !== socket.id);
                    if (gameState.evacuationIndex >= gameState.evacuationOrder.length) {
                        gameState.evacuationIndex = 0;
                    }
                    const anyLeft = gameState.players.some(p => p.hand.length > 0);
                    if (!anyLeft) finalizeEvacuation();
                    else promptEvacuationTurn();
                } else {
                    nextPlayer();
                }
            }
            broadcastState();
        }
    });
});

// ─────────────────────────────────────────────
//  ROLE_4 DISCARD THIEF
// ─────────────────────────────────────────────
function triggerRole4Reaction(discardedCard) {
    const role4 = findRole("ROLE_4");
    if (!role4 || gameState.role4UsedThisTurn || gameState.evacuationMode) return;

    startReaction("ROLE4_SALVAGE", role4.id, (decision) => {
        if (decision === "take" && role4.energy >= 1) {
            role4.energy--;
            role4.hand.push(discardedCard);
            gameState.role4UsedThisTurn = true;
            const di = gameState.discardPile.findIndex(c => c === discardedCard);
            if (di !== -1) gameState.discardPile.splice(di, 1);
        }
        broadcastState();
    });
}

server.listen(PORT, () => {
    console.log(`GRID sunucusu aktif port: ${PORT}`);
});