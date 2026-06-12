const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 6;
const LOG_FILE = path.join(__dirname, "game_analysis.log");

function getTsiTimestamp() {
    const date = new Date();
    const offsetDate = new Date(date.getTime() + (3 * 60 * 60 * 1000));
    return offsetDate.toISOString().replace("Z", "+03:00");
}

function logAction(player, action, details, category = "ACTION") {
    const timestamp = getTsiTimestamp();
    let playerStr = "SYSTEM";
    let energyStr = "0";
    if (player) {
        const roleStr = player.role || "NO_ROLE";
        playerStr = `${player.name} (Role: ${roleStr}, ID: ${player.id})`;
        energyStr = player.energy;
    }

    let logLine;
    if (category === "SYSTEM" && action === "LEFT_GAME_TO_LOBBY") {
        logLine = `[${timestamp}] SYSTEM | Player: ${playerStr} | Action: LEFT_GAME_TO_LOBBY | ${details}`;
    } else {
        logLine = `[${timestamp}] ${category} | Player: ${playerStr} | Energy: ${energyStr} | Action: ${action} | ${details}`;
    }

    fs.appendFile(LOG_FILE, logLine + "\n", (err) => {
        if (err) console.error("Error writing log to file:", err);
    });

    io.to("admins").emit("newLog", logLine);
}

function logSessionStart() {
    const timestamp = getTsiTimestamp();
    const header = `\n======================================================================\n[DURUM] YENİ OYUN OTURUMU BAŞLADI | Tarih: ${timestamp}\n======================================================================\n`;
    fs.appendFile(LOG_FILE, header, (err) => {
        if (err) console.error("Error writing session start log to file:", err);
    });
    io.to("admins").emit("newLog", `SYSTEM | YENİ OYUN OTURUMU BAŞLADI | Tarih: ${timestamp}`);
}
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
    evacuationTriggerCause: null,
    evacuationOrder: [],
    evacuationIndex: 0,
    specialYTurnLimit: null,
    specialYTurnCount: 0,
    role3UsesThisTurn: 0,
    role4UsedThisTurn: false,
    role5UsesTotal: 0,
    role5RedPenaltyCount: 0,
    role3NoPenaltyCount: 0,
    activeReaction: null,
    lastPlayedCard: null,
    scoreboard: []
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

function canPlayAnyCard(player) {
    return player.hand.some(card => {
        if (card.type === "CANCEL") return false;

        if (card.type === "REDUCE") {
            if (agendaPower() <= 0) return false;
            const agenda = gameState.agendaPile;
            if (agenda && agenda.length > 0 && agenda[agenda.length - 1].owner === player.id) {
                return false;
            }
        }

        let effectiveCost = card.cost;
        if (player.role === "ROLE_1" && card.type !== "POWER" && !player.usedBlackDiscount) {
            effectiveCost = Math.max(0, effectiveCost - 1);
        }
        if (player.role === "ROLE_6" && card.type === "POWER" && card.value === 1) {
            effectiveCost += 1;
        }

        return player.energy >= effectiveCost;
    });
}

let autoEndTimeout = null;

function checkAutoEndTurn(player, immediate = false) {
    if (!gameState.started || gameState.activeReaction) return;
    if (!player || player.id !== currentPlayer().id) return;

    if (!canPlayAnyCard(player)) {
        if (autoEndTimeout) clearTimeout(autoEndTimeout);

        const performEnd = () => {
            if (!gameState.started || gameState.activeReaction) return;
            if (player.id !== currentPlayer().id) return;
            if (canPlayAnyCard(player)) return;

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
        };

        if (immediate) {
            performEnd();
        } else {
            autoEndTimeout = setTimeout(performEnd, 1500);
        }
    }
}

function clearAutoEndTimeout() {
    if (autoEndTimeout) {
        clearTimeout(autoEndTimeout);
        autoEndTimeout = null;
    }
}

let checkingStalemate = false;

function checkEvacuationStalemate() {
    if (checkingStalemate) return;
    if (!gameState.evacuationMode || !gameState.currentTarget) return;
    if (gameState.centerDeck.length > 0) return;

    let totalMaxPowerInHands = 0;
    gameState.players.forEach(p => {
        p.hand.forEach(card => {
            if (card.type === "POWER") {
                let power = card.value;
                if (gameState.currentTarget.color && card.color === gameState.currentTarget.color) {
                    power++;
                }
                if (p.role === "ROLE_6" && card.value === 1) {
                    power++;
                }
                totalMaxPowerInHands += power;
            }
        });
    });

    if (agendaPower() + totalMaxPowerInHands < gameState.currentTarget.threshold) {
        checkingStalemate = true;

        logAction(null, "EVACUATION_STALEMATE", `Stalemate detected! Current Agenda Power: ${agendaPower()} + Total Hand Max Power: ${totalMaxPowerInHands} = ${agendaPower() + totalMaxPowerInHands} < Threshold: ${gameState.currentTarget.threshold}. Discarding hands and finalizing evacuation.`);

        gameState.hudMessage = "Çözüm imkansız: Kartlar hedef barajına yetmiyor! Eldeki tüm kartlar atılıyor ve tasfiye sonlandırılıyor.";

        // Discard all cards from players' hands
        gameState.players.forEach(p => {
            p.hand.forEach(c => gameState.discardPile.push(c));
            p.hand = [];
        });

        finalizeEvacuation();
        checkingStalemate = false;
    }
}



// ─────────────────────────────────────────────
//  DECK FACTORIES
// ─────────────────────────────────────────────
function createTargetDeck() {
    const deck = [];
    for (let i = 0; i < 4; i++) deck.push({ type: "TARGET", color: "RED", threshold: 10, reward: 10, turnLimit: 4 });
    for (let i = 0; i < 4; i++) deck.push({ type: "TARGET", color: "BLUE", threshold: 10, reward: 10, turnLimit: 4 });
    for (let i = 0; i < 4; i++) deck.push({ type: "TARGET", color: "YELLOW", threshold: 10, reward: 10, turnLimit: 4 });
    deck.push({ type: "SPECIAL_X", threshold: 8, turnLimit: 4, desc: "Çözen kişi seçtiği bir rakipten 10 skor siler." });
    deck.push({ type: "SPECIAL_Y", threshold: 10, turnLimit: 2, desc: "Global kriz! Çözen +5, diğerleri -5 alır. Çözülemezse herkesten -7 skor silinir." });
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
    for (let i = 0; i < 6; i++) deck.push({ type: "CANCEL", cost: 0 });
    for (let i = 0; i < 4; i++) deck.push({ type: "REDUCE", cost: 2 });
    for (let i = 0; i < 2; i++) deck.push({ type: "CHANGE_TARGET", cost: 3 });
    for (let i = 0; i < 2; i++) deck.push({ type: "REFRESH", cost: 1 });
    return shuffle(deck);
}

function createPlayer(socketId, name) {
    return {
        id: socketId,
        name,
        role: null,
        selectedRole: null,
        score: 0,
        energy: 3,
        hand: [],
        skipDraw: false,
        cancelPenalty: false,
        active: true,
        actedThisTurn: false,
        usedBlackDiscount: false,
        playedToAgendaThisTurn: false,
        role4DrawnThisRound: false
    };
}

// ─────────────────────────────────────────────
//  CARD DRAW
// ─────────────────────────────────────────────
function drawCard(player) {
    if (gameState.evacuationMode) return null;
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
            selectedRole: p.selectedRole,
            handCount: p.hand.length,
            actedThisTurn: p.actedThisTurn
        })),
        dealerIndex: gameState.dealerIndex,
        currentPlayerIndex: gameState.currentPlayerIndex,
        currentTarget: gameState.currentTarget,
        agendaPile: gameState.agendaPile,
        discardCount: gameState.discardPile.length,
        hudMessage: gameState.hudMessage,
        evacuationMode: gameState.evacuationMode,
        evacuationTriggerCause: gameState.evacuationTriggerCause,
        evacuationIndex: gameState.evacuationIndex,
        evacuationOrder: gameState.evacuationOrder,
        activeReaction: gameState.activeReaction
            ? {
                type: gameState.activeReaction.type,
                forSocketId: gameState.activeReaction.forSocketId,
                startedAt: gameState.activeReaction.startedAt,
                timeoutMs: REACTION_TIMEOUT_MS,
                customData: gameState.activeReaction.customData
            }
            : null,
        pendingCancel: null,
        lastPlayedCard: gameState.lastPlayedCard
            ? { playerId: gameState.lastPlayedCard.playerId, card: gameState.lastPlayedCard.card }
            : null,
        scoreboard: gameState.scoreboard || [],
        role4UsedThisTurn: gameState.role4UsedThisTurn
    };
}

function broadcastState() {
    checkEvacuationStalemate();

    gameState.players.forEach(p => {
        io.to(p.id).emit("privateState", { hand: p.hand });
    });
    io.emit("stateUpdate", getPublicState());

    io.to("admins").emit("adminStateUpdate", {
        publicState: getPublicState(),
        fullHands: gameState.players.map(p => ({
            id: p.id,
            name: p.name,
            hand: p.hand
        }))
    });
}

// ─────────────────────────────────────────────
//  REACTION SYSTEM
// ─────────────────────────────────────────────
function startReaction(type, forSocketId, onResolve, customData = null) {
    clearReaction();

    const reaction = {
        type,
        forSocketId,
        startedAt: Date.now(),
        resolve: onResolve,
        timer: null,
        customData
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
    const reaction = gameState.activeReaction;
    const cb = reaction.resolve;
    clearReaction();
    cb(decision, reaction);
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

    if (role3 && gameState.role3UsesThisTurn < 2 && role3.energy >= 1) {
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
    checkAutoEndTurn(currentPlayer(), true);
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
    const isSpecialTarget = target && (target.type === "SPECIAL_X" || target.type === "SPECIAL_Y");

    if (role5 && role5.id !== winner.id && gameState.role5UsesTotal < 3 && role5.hand.length > 0 && !isSpecialTarget) {
        startReaction("ROLE5_STEAL", role5.id, (decision, rx) => {
            const penalty = (decision === "throw" && rx) ? (rx.penalty || 0) : 0;
            continueResolveTarget(target, winner, penalty);
        });
    } else {
        continueResolveTarget(target, winner, 0);
    }
}

function continueResolveTarget(target, winner, penalty = 0) {
    const curAgendaPower = agendaPower();

    if (target.type === "SPECIAL_X") {
        const rewardText = `Silently chosen target loses 10 score`;
        logAction(winner, "TARGET_RESOLVED", `Solved Target: SPECIAL_X (Threshold: ${target.threshold}) | Winner: ${winner.name} | Agenda Power: ${curAgendaPower}/${target.threshold} | Effect: ${rewardText} | Penalty: ${penalty}`);

        const rivals = gameState.players.filter(p => p.id !== winner.id);
        if (rivals.length > 0) {
            startReaction("SPECIAL_X_CHOOSE", winner.id, (victimId) => {
                let victim = rivals.find(p => p.id === victimId);
                if (!victim) {
                    // Fallback to random if decision is invalid/passed
                    victim = rivals[Math.floor(Math.random() * rivals.length)];
                }
                victim.score = Math.max(0, victim.score - 10);
                gameState.hudMessage = `${winner.name} ÖZEL-X: ${victim.name}'in 10 puanını sildi!`;
                finalizeResolveTarget(target, winner);
            });
        } else {
            gameState.hudMessage = `${winner.name} ÖZEL-X'i çözdü, ancak puanı silinecek rakip bulunamadı!`;
            finalizeResolveTarget(target, winner);
        }
    } else if (target.type === "SPECIAL_Y") {
        let reward = Math.max(0, 5 - penalty);
        logAction(winner, "TARGET_RESOLVED", `Solved Target: SPECIAL_Y (Threshold: ${target.threshold}) | Winner: ${winner.name} | Agenda Power: ${curAgendaPower}/${target.threshold} | Base Reward: 5 | Penalty: ${penalty} | Final Gained: ${reward} (Others lose 5 score)`);
        winner.score += reward;
        gameState.players.forEach(p => { if (p.id !== winner.id) p.score = Math.max(0, p.score - 5); });
        gameState.hudMessage = `${winner.name} ÖZEL-Y: +${reward} (Rol 5 Cezası: -${penalty}), diğerleri -5!`;
        finalizeResolveTarget(target, winner);
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

        let finalReward = reward + (hasSynergy ? 2 : 0);
        let finalScoreChange = Math.max(0, finalReward - penalty);

        logAction(winner, "TARGET_RESOLVED", `Solved Target: ${target.color} ${target.type} (Threshold: ${target.threshold}) | Winner: ${winner.name} | Agenda Power: ${curAgendaPower}/${target.threshold} | Base Reward: ${reward}${hasSynergy ? ' (+2 Synergy Bonus)' : ''} | Penalty: ${penalty} | Final Gained: +${finalScoreChange}`);

        winner.score += finalScoreChange;
        if (penalty > 0) {
            gameState.hudMessage = `${winner.name} hedefi çözdü! +${finalScoreChange} (Rol 5 Cezası: -${penalty})${hasSynergy ? ' (SİNERJİ BONUSU!)' : ''}`;
        } else {
            gameState.hudMessage = `${winner.name} hedefi çözdü! ${hasSynergy ? '(SİNERJİ BONUSU!) ' : ''}+${reward}`;
        }
        finalizeResolveTarget(target, winner);
    }
}

function finalizeResolveTarget(target, winner) {
    gameState.lastPlayedCard = null;
    const lastCard = gameState.agendaPile[gameState.agendaPile.length - 1];

    const role2 = findRole("ROLE_2");
    if (role2 && target.color === "BLUE" && winner.id !== role2.id) {
        role2.score = Math.max(0, role2.score - 2);
    }

    const role6 = findRole("ROLE_6");
    if (role6 && lastCard && lastCard.color === "RED" && winner.id !== role6.id) {
        role6.score = Math.max(0, role6.score - 2);
    }

    const winnerIndex = gameState.players.findIndex(p => p.id === winner.id);

    rotateDealer();

    if (winnerIndex !== -1) {
        gameState.currentPlayerIndex = winnerIndex;
    }

    moveAgendaToDiscard();

    if (gameState.evacuationMode) {
        if (gameState.evacuationTriggerCause === "TARGET_DECK" && gameState.targetDeck.length === 0) {
            gameState.players.forEach(p => {
                p.hand.forEach(c => gameState.discardPile.push(c));
                p.hand = [];
            });
            finalizeEvacuation();
            return;
        }

        const anyCardsLeft = gameState.players.some(p => p.hand.length > 0);
        if (!anyCardsLeft) {
            finalizeEvacuation();
            return;
        }
    }

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
    if (noWinner) {
        if (gameState.targetDeck.length === 0) {
            startEvacuation("TARGET_DECK");
        } else if (gameState.centerDeck.length === 0) {
            startEvacuation("CENTER_DECK");
        }
    }
}

function startEvacuation(cause = null) {
    gameState.evacuationMode = true;
    gameState.evacuationTriggerCause = cause;

    let causeStr = "Bilinmeyen Neden";
    if (cause === "TARGET_DECK") {
        causeStr = "Gündem/Hedef Destesi Bitti";
    } else if (cause === "CENTER_DECK") {
        causeStr = "Merkez Oyuncu Destesi Bitti";
    }
    logAction(null, "EVACUATION", `!!! TASFİYE PROTOKOLÜ DEVREYE GİRDİ !!! | Neden: ${causeStr}`);

    gameState.hudMessage = "TAHLİYE SAFHASINA GEÇİLDİ! Sırayla kartlarınızı oynayarak hedefi çözmeye çalışın veya manevra yapın.";
    broadcastState();
}

function finalizeEvacuation() {
    logSessionStart();
    gameState.currentTarget = null;
    gameState.agendaPile = [];
    const all = [...gameState.centerDeck, ...gameState.discardPile];
    gameState.centerDeck = shuffle(all);
    gameState.discardPile = [];
    gameState.evacuationMode = false;
    gameState.evacuationTriggerCause = null;
    if (gameState.targetDeck.length === 0) {
        gameState.targetDeck = createTargetDeck();
    }
    gameState.players.forEach(p => {
        p.hand = [];
        p.energy = 3;
        p.skipDraw = false;
        p.cancelPenalty = false;
        p.actedThisTurn = false;
        p.usedBlackDiscount = false;
        p.playedToAgendaThisTurn = false;
        p.role4DrawnThisRound = false;
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
    if (gameState.evacuationMode) {
        const anyCardsLeft = gameState.players.some(p => p.hand.length > 0);
        if (!anyCardsLeft) {
            finalizeEvacuation();
            return;
        }
    }

    const wasDealer = gameState.currentPlayerIndex === gameState.dealerIndex;
    gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;

    if (wasDealer && gameState.currentTarget && gameState.currentTarget.type === "SPECIAL_Y") {
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

    beginTurn();
}

function beginTurn() {
    const player = currentPlayer();
    player.actedThisTurn = false;
    player.playedToAgendaThisTurn = false;
    gameState.lastPlayedCard = null;
    gameState.role4UsedThisTurn = false;

    if (player.cancelPenalty) {
        player.energy = 2;
        player.cancelPenalty = false;
    } else {
        player.energy = 3;
    }

    logAction(player, "TURN_CHANGE", `Turn started for ${player.name} | Score: ${player.score}`);

    gameState.hudMessage = `${player.name} sırası başladı`;
    broadcastState();
}

function drawEndTurn(player) {
    if (player.role === "ROLE_4") {
        if (player.role4DrawnThisRound) {
            player.role4DrawnThisRound = false;
            return;
        }
        player.role4DrawnThisRound = false;
        drawCard(player);
        return;
    }
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

// ─────────────────────────────────────────────
//  CANCEL DUEL SYSTEM (REDESIGNED)
// ─────────────────────────────────────────────
let cancelCandidates = [];
let cancelCount = 0;
let lastCancellerId = null;

function getCardNameTurkish(card) {
    if (!card) return "";
    if (card.type === "POWER") return `${card.color} ${card.value} Güç`;
    if (card.type === "CANCEL") return "İptal (Cancel)";
    if (card.type === "REDUCE") return "Sabotaj (Reduce)";
    if (card.type === "CHANGE_TARGET") return "Gündem Değiştir";
    if (card.type === "REFRESH") return "Fonlama (Refresh)";
    return card.type;
}

function revertLastPlayedCard() {
    if (!gameState.lastPlayedCard || !gameState.lastPlayedCard.revertData) return;

    const { playerId, card, revertData } = gameState.lastPlayedCard;
    const player = findPlayer(playerId);

    if (revertData.type === "POWER") {
        const idx = gameState.agendaPile.findIndex(c => c.type === "POWER" && c.owner === playerId && c.value === card.value && c.color === card.color);
        if (idx !== -1) {
            const removed = gameState.agendaPile.splice(idx, 1)[0];
            gameState.discardPile.push(removed);
            triggerRole4Reaction(removed);
        }
    }
    else if (revertData.type === "REDUCE") {
        const di = gameState.discardPile.indexOf(card);
        if (di !== -1) gameState.discardPile.splice(di, 1);

        if (revertData.targetCard) {
            revertData.targetCard.power = revertData.originalPower;
        }
    }
    else if (revertData.type === "CHANGE_TARGET") {
        const di = gameState.discardPile.indexOf(card);
        if (di !== -1) gameState.discardPile.splice(di, 1);

        if (gameState.currentTarget) {
            gameState.targetDeck.shift();
        }
        gameState.currentTarget = revertData.prevTarget;
        gameState.agendaPile = revertData.prevAgenda;
    }
    else if (revertData.type === "REFRESH") {
        const di = gameState.discardPile.indexOf(card);
        if (di !== -1) gameState.discardPile.splice(di, 1);

        if (player) {
            player.hand.forEach(c => gameState.discardPile.push(c));
            player.hand = revertData.prevHand;
            player.skipDraw = false;
        }
    }
}

function executeCardPlayDirect(player, card) {
    if (player.role === "ROLE_1" && card.type === "REFRESH") {
        player.score = Math.max(0, player.score - 1);
    }

    let revertData = null;

    if (card.type === "POWER") {
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

        revertData = { type: "POWER" };
    }
    else if (card.type === "REDUCE") {
        let targetCard = null;
        let originalPower = 0;
        if (gameState.agendaPile.length > 0) {
            targetCard = gameState.agendaPile[gameState.agendaPile.length - 1];
            originalPower = targetCard.power;
            targetCard.power = 0;
        }
        gameState.discardPile.push(card);
        triggerRole4Reaction(card);

        revertData = { type: "REDUCE", targetCard, originalPower };
        gameState.hudMessage = `${player.name} sabotaj kartı oynadı.`;
    }
    else if (card.type === "CHANGE_TARGET") {
        const prevTarget = gameState.currentTarget;
        const prevAgenda = [...gameState.agendaPile];

        gameState.discardPile.push(card);
        moveAgendaToDiscard(false);
        if (gameState.currentTarget) gameState.targetDeck.unshift(gameState.currentTarget);
        shuffle(gameState.targetDeck);
        gameState.currentTarget = null;
        triggerRole4Reaction(card);
        revealTarget();

        revertData = { type: "CHANGE_TARGET", prevTarget, prevAgenda };
        gameState.hudMessage = `${player.name} gündem değiştirdi.`;
    }
    else if (card.type === "REFRESH") {
        const prevHand = [...player.hand];

        gameState.discardPile.push(card);
        player.hand.forEach(c => gameState.discardPile.push(c));
        player.hand = [];
        drawCards(player, 4);
        triggerRole4Reaction(card);
        player.skipDraw = true;

        revertData = { type: "REFRESH", prevHand };
        gameState.hudMessage = `${player.name} fonlama yaptı.`;
    }

    gameState.lastPlayedCard = {
        playerId: player.id,
        card: card,
        revertData: revertData
    };

    if (card.type === "POWER") {
        checkTargetSolved();
    }
}

function startCancelDuelCheck() {
    cancelCandidates = gameState.players.filter(p => p.id !== lastCancellerId && p.hand.some(c => c.type === "CANCEL"));

    const activePlayer = currentPlayer();
    cancelCandidates.sort((a, b) => {
        if (a.id === activePlayer.id) return -1;
        if (b.id === activePlayer.id) return 1;
        return 0;
    });

    if (cancelCandidates.length > 0) {
        askNextCancelCounter();
    } else {
        resolveCancelDuelResult();
    }
}

function askNextCancelCounter() {
    if (cancelCandidates.length === 0) {
        resolveCancelDuelResult();
        return;
    }

    const candidate = cancelCandidates.shift();
    gameState.hudMessage = `Son İptal kartına karşı konulacak mı? Sıra: ${candidate.name}`;

    startReaction("CANCEL_COUNTER", candidate.id, (decision) => {
        if (decision === "accept") {
            playCounterCancelCard(candidate);
        } else {
            askNextCancelCounter();
        }
    });
}

function playCounterCancelCard(candidate) {
    const cardIndex = candidate.hand.findIndex(c => c.type === "CANCEL");
    if (cardIndex === -1) {
        askNextCancelCounter();
        return;
    }

    logAction(candidate, "CANCEL_REACTION", `Counter Played | ${candidate.name} played CANCEL in response to last Cancel (Chain: ${cancelCount + 1})`);

    candidate.hand.splice(cardIndex, 1);

    const activePlayer = currentPlayer();
    if (candidate.id === activePlayer.id) {
        // Active player counters for free!
    } else {
        candidate.cancelPenalty = true;
    }

    const cancelCard = { type: "CANCEL", cost: 0 };
    gameState.discardPile.push(cancelCard);

    cancelCount++;
    lastCancellerId = candidate.id;

    gameState.hudMessage = `${candidate.name} İptal kartına karşı koydu (İptal Zinciri: ${cancelCount})!`;
    startCancelDuelCheck();
}

function resolveCancelDuelResult() {
    const isCancelled = (cancelCount % 2 === 1);
    const penalizedPlayers = gameState.players.filter(p => p.cancelPenalty).map(p => p.name);
    const outcomeStr = isCancelled
        ? `${currentPlayer().name}'in oynadığı kart İPTAL edildi!`
        : `İptal zinciri sonuçsuz kaldı! Kart korundu.`;

    logAction(null, "CANCEL_REACTION", `Duel Ended | Result: ${outcomeStr} | Chain length: ${cancelCount} | Penalized players next turn (Energy -1): ${penalizedPlayers.join(", ") || "None"}`);

    if (isCancelled) {
        if (gameState.lastPlayedCard) {
            gameState.hudMessage = `${currentPlayer().name}'in oynadığı kart İPTAL edildi!`;
            revertLastPlayedCard();
        }
    } else {
        gameState.hudMessage = `İptal zinciri sonuçsuz kaldı! Kart korundu.`;
    }

    gameState.lastPlayedCard = null;
    checkAutoEndTurn(currentPlayer(), true);
    broadcastState();
}

function checkVictory() {
    const winner = gameState.players.find(p => p.score >= 51);
    if (!winner) return;
    gameState.hudMessage = `🏆 ${winner.name} PARTİYİ KAZANDI!`;
    gameState.started = false;
    clearAutoEndTimeout();

    if (!gameState.scoreboard) {
        gameState.scoreboard = [];
    }
    const exists = gameState.scoreboard.some(entry => entry.name === winner.name && entry.score === winner.score);
    if (!exists) {
        gameState.scoreboard.push({
            name: winner.name,
            score: winner.score
        });
    }

    broadcastState();
}

function startGame() {
    clearAutoEndTimeout();
    logSessionStart();
    gameState.started = true;
    gameState.evacuationMode = false;
    gameState.evacuationTriggerCause = null;
    gameState.centerDeck = createCenterDeck();
    gameState.targetDeck = createTargetDeck();
    gameState.discardPile = [];
    gameState.agendaPile = [];
    gameState.role3UsesThisTurn = 0;
    gameState.role4UsedThisTurn = false;
    gameState.role5UsesTotal = 0;
    gameState.role5RedPenaltyCount = 0;
    gameState.role3NoPenaltyCount = 0;
    gameState.activeReaction = null;
    gameState.lastPlayedCard = null;
    gameState.specialYTurnCount = 0;
    gameState.specialYTurnLimit = null;

    shuffle(gameState.players);
    const availableRoles = ROLES.filter(r => !gameState.players.some(p => p.selectedRole === r));
    shuffle(availableRoles);

    gameState.players.forEach(p => {
        p.role = p.selectedRole || availableRoles.pop() || null;
        p.score = 0;
        p.energy = 3;
        p.hand = [];
        p.skipDraw = false;
        p.cancelPenalty = false;
        p.actedThisTurn = false;
        p.usedBlackDiscount = false;
        p.playedToAgendaThisTurn = false;
        p.role4DrawnThisRound = false;
        drawCards(p, 5);
    });

    gameState.dealerIndex = Math.floor(Math.random() * gameState.players.length);
    gameState.currentPlayerIndex = (gameState.dealerIndex + 1) % gameState.players.length;
    revealTarget();
    broadcastState();
}

// ─────────────────────────────────────────────
//  SOCKET LISTENERS
// ─────────────────────────────────────────────
io.on("connection", (socket) => {
    // Emit current state immediately to the connecting client
    socket.emit("stateUpdate", getPublicState());

    socket.on("registerAdmin", () => {
        socket.join("admins");
        fs.readFile(LOG_FILE, "utf8", (err, logData) => {
            let recentLogs = [];
            if (!err && logData) {
                const lines = logData.trim().split("\n");
                recentLogs = lines.slice(-20);
            }
            socket.emit("adminStateUpdate", {
                publicState: getPublicState(),
                fullHands: gameState.players.map(p => ({
                    id: p.id,
                    name: p.name,
                    hand: p.hand
                })),
                recentLogs: recentLogs
            });
        });
    });

    socket.on("downloadLogFile", () => {
        fs.readFile(LOG_FILE, "utf8", (err, data) => {
            if (err) {
                socket.emit("downloadLogFileResponse", { error: "Log dosyası okunamadı veya bulunamadı." });
            } else {
                socket.emit("downloadLogFileResponse", { content: data });
            }
        });
    });

    socket.on("resetLogFile", () => {
        const timestamp = getTsiTimestamp();
        const header = `\n======================================================================\n[DURUM] LOG DOSYASI ADMİN TARAFINDAN SIFIRLANDI | Tarih: ${timestamp}\n======================================================================\n`;
        fs.writeFile(LOG_FILE, header, (err) => {
            if (err) {
                console.error("Error resetting log file:", err);
                socket.emit("resetLogFileResponse", { error: "Log dosyası sıfırlanamadı." });
            } else {
                io.to("admins").emit("logResetComplete", header);
            }
        });
    });

    socket.on("join", (name) => {
        if (gameState.started) return;
        if (gameState.players.length >= MAX_PLAYERS) return;
        gameState.players.push(createPlayer(socket.id, name));
        broadcastState();
    });

    socket.on("startGame", () => {
        if (!gameState.started && gameState.players.length >= 2) startGame();
    });

    socket.on("selectRole", (role) => {
        if (gameState.started) return;
        const player = findPlayer(socket.id);
        if (!player) return;

        if (role === null) {
            player.selectedRole = null;
            broadcastState();
            return;
        }

        if (!ROLES.includes(role)) return;

        const isTaken = gameState.players.some(p => p.id !== player.id && p.selectedRole === role);
        if (isTaken) return;

        player.selectedRole = role;
        broadcastState();
    });

    socket.on("returnToLobby", () => {
        if (!gameState.started) return;
        clearAutoEndTimeout();

        const triggerPlayer = findPlayer(socket.id);
        if (triggerPlayer) {
            logAction(triggerPlayer, "LEFT_GAME_TO_LOBBY", "Reason: Player Left", "SYSTEM");
        }
        gameState.players.forEach(p => {
            if (p.id !== socket.id) {
                logAction(p, "LEFT_GAME_TO_LOBBY", "Reason: Game Ended", "SYSTEM");
            }
        });

        gameState.started = false;
        gameState.evacuationMode = false;
        gameState.evacuationTriggerCause = null;
        gameState.agendaPile = [];
        gameState.discardPile = [];
        gameState.currentTarget = null;
        gameState.lastPlayedCard = null;
        gameState.activeReaction = null;

        gameState.players.forEach(p => {
            p.role = null;
            p.score = 0;
            p.energy = 3;
            p.hand = [];
            p.skipDraw = false;
            p.cancelPenalty = false;
            p.actedThisTurn = false;
            p.usedBlackDiscount = false;
            p.playedToAgendaThisTurn = false;
            p.role4DrawnThisRound = false;
        });

        gameState.hudMessage = "Oyun sonlandırıldı. Lobiye dönüldü.";
        broadcastState();
    });

    socket.on("leaveGame", () => {
        const player = findPlayer(socket.id);
        if (player && gameState.started) {
            logAction(player, "LEFT_GAME_TO_LOBBY", "Reason: Player Left", "SYSTEM");
        }
    });





    socket.on("playAgain", () => {
        clearAutoEndTimeout();
        gameState.started = false;
        gameState.evacuationMode = false;
        gameState.evacuationTriggerCause = null;
        gameState.agendaPile = [];
        gameState.discardPile = [];
        gameState.currentTarget = null;
        gameState.lastPlayedCard = null;

        gameState.players.forEach(p => {
            p.role = null;
            p.selectedRole = null;
            p.score = 0;
            p.energy = 3;
            p.hand = [];
            p.skipDraw = false;
            p.cancelPenalty = false;
            p.actedThisTurn = false;
            p.usedBlackDiscount = false;
            p.playedToAgendaThisTurn = false;
            p.role4DrawnThisRound = false;
        });

        gameState.hudMessage = "Oyuncular bekleniyor...";
        broadcastState();
    });







    socket.on("playCard", (cardIndex) => {
        if (!gameState.started || (gameState.activeReaction && gameState.activeReaction.type !== "ROLE4_SALVAGE")) return;
        const player = findPlayer(socket.id);
        if (!player) return;

        const card = player.hand[cardIndex];
        if (!card) return;

        // Under new rules, CANCEL cards cannot be played directly from hand in playCard.
        if (card.type === "CANCEL") return;

        // Only active player can play non-CANCEL cards
        const isCurrent = player.id === currentPlayer().id;
        if (!isCurrent) return;

        if (card.type === "REDUCE") {
            if (agendaPower() <= 0) {
                return;
            }
            const agenda = gameState.agendaPile;
            if (agenda && agenda.length > 0 && agenda[agenda.length - 1].owner === player.id) {
                return;
            }
        }

        let effectiveCost = card.cost;
        if (player.role === "ROLE_1" && card.type !== "POWER" && !player.usedBlackDiscount) {
            effectiveCost = Math.max(0, effectiveCost - 1);
            player.usedBlackDiscount = true;
        }
        if (player.role === "ROLE_6" && card.type === "POWER" && card.value === 1) {
            effectiveCost += 1;
        }

        if (player.energy < effectiveCost) return;

        logAction(player, "PLAY_CARD", `Card: ${card.type} (Cost: ${card.cost}${card.type === 'POWER' ? ', Color: ' + card.color + ', Value: ' + card.value : ''})`);

        player.energy -= effectiveCost;
        if (effectiveCost >= 1) {
            player.actedThisTurn = true;
        }
        player.hand.splice(cardIndex, 1);

        executeCardPlayDirect(player, card);

        // Check if player still has the turn and has no playable cards/energy left
        checkAutoEndTurn(player);

        broadcastState();
    });

    socket.on("playCancel", (cardIndex) => {
        if (!gameState.started || (gameState.activeReaction && gameState.activeReaction.type !== "ROLE4_SALVAGE")) return;
        const player = findPlayer(socket.id);
        if (!player) return;

        const card = player.hand[cardIndex];
        if (!card || card.type !== "CANCEL") return;

        if (!gameState.lastPlayedCard) return;
        const lastCard = gameState.lastPlayedCard.card;
        if (lastCard.type === "POWER" && gameState.agendaPile.length === 0) return;

        const activePlayer = currentPlayer();
        if (player.id === activePlayer.id) return;
        if (gameState.lastPlayedCard.playerId !== activePlayer.id) return;

        logAction(player, "CANCEL_REACTION", `Duel Started | Initiator: ${player.name} played CANCEL targeting card [${lastCard.type}] played by ${activePlayer.name}`);

        player.hand.splice(cardIndex, 1);
        player.cancelPenalty = true;

        const cancelCard = { type: "CANCEL", cost: 0 };
        gameState.discardPile.push(cancelCard);

        cancelCount = 1;
        lastCancellerId = player.id;

        const role2 = findRole("ROLE_2");
        if (role2 && role2.id !== player.id) {
            gameState.hudMessage = `ROLE_2 (${role2.name}) CANCEL'a müdahale edebilir.`;
            startReaction("ROLE2_CANCEL", role2.id, (decision) => {
                if (decision === "accept") {
                    logAction(role2, "CANCEL_REACTION", `Role 2 Sealed Cancel | ${role2.name} sealed cancel played by ${player.name} (Role 2 gets cancel penalty)`);
                    role2.cancelPenalty = true;
                    if (player.hand.length > 0) {
                        const ri = Math.floor(Math.random() * player.hand.length);
                        player.hand.splice(ri, 1);
                    }
                    gameState.hudMessage = `ROLE_2 CANCEL'ı mühürledi! ${player.name} kart kaybetti.`;
                    triggerRole4Reaction(cancelCard);
                    gameState.lastPlayedCard = null;
                    broadcastState();
                } else {
                    gameState.hudMessage = `${player.name} İptal (Cancel) kartı oynadı! Düello başlıyor.`;
                    startCancelDuelCheck();
                }
            });
        } else {
            gameState.hudMessage = `${player.name} İptal (Cancel) kartı oynadı! Düello başlıyor.`;
            startCancelDuelCheck();
        }

        broadcastState();
    });

    socket.on("maneuver", (cardIndex) => {
        if (!gameState.started || (gameState.activeReaction && gameState.activeReaction.type !== "ROLE4_SALVAGE") || currentPlayer().id !== socket.id || currentPlayer().energy < 1 || currentPlayer().actedThisTurn) return;
        const player = currentPlayer();
        const card = player.hand[cardIndex];
        if (!card) return;

        logAction(player, "MANEUVER", `Card Discarded: ${card.type} (Cost: ${card.cost}${card.type === 'POWER' ? ', Color: ' + card.color + ', Value: ' + card.value : ''})`);

        player.energy--;
        player.actedThisTurn = true;
        player.hand.splice(cardIndex, 1);
        gameState.discardPile.push(card);
        triggerRole4Reaction(card);
        drawCard(player);
        player.skipDraw = true;
        player.role4DrawnThisRound = true;

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

    socket.on("checkForcedManeuver", () => {
        const player = currentPlayer();
        if (player.id !== socket.id || player.actedThisTurn) return;

        const canPlay = player.hand.some(c => c.cost <= player.energy);
        if (!canPlay) {
            if (player.energy >= 1 && player.hand.length > 0) {
                const card = player.hand[0];
                logAction(player, "MANEUVER", `Forced Maneuver | Card Discarded: ${card.type} (Cost: ${card.cost}${card.type === 'POWER' ? ', Color: ' + card.color + ', Value: ' + card.value : ''})`);
                player.energy--;
                player.hand.splice(0, 1);
                gameState.discardPile.push(card);
                triggerRole4Reaction(card);
                drawCard(player);
                player.skipDraw = true;
                player.role4DrawnThisRound = true;
            }
            player.actedThisTurn = true;
            drawEndTurn(player);
            nextPlayer();
            broadcastState();
        }
    });

    socket.on("endTurn", () => {
        if (!gameState.started || (gameState.activeReaction && gameState.activeReaction.type !== "ROLE4_SALVAGE")) return;
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
            const idx = parseInt(cardIndex);
            console.log(`[ROLE5_STEAL] Player ${role5 ? role5.name : "Unknown"} throwing card at index ${cardIndex} (parsed as ${idx})`);
            if (role5 && !isNaN(idx) && role5.hand[idx]) {
                const card = role5.hand[idx];
                gameState.activeReaction.penalty = card.cost !== undefined ? card.cost : 0;
                console.log(`[ROLE5_STEAL] Card: ${card.type}, Cost: ${card.cost}, Penalty set to: ${gameState.activeReaction.penalty}`);
                role5.hand.splice(idx, 1);
                gameState.discardPile.push(card);
                gameState.role5UsesTotal++;

                resolveReaction(decision);
                triggerRole4Reaction(card);
                return;
            } else {
                console.log(`[ROLE5_STEAL] Error: Card not found or invalid index for player ${role5 ? role5.name : "Unknown"}`);
            }
        }
        resolveReaction(decision);
    });



    socket.on("disconnect", () => {
        const idx = gameState.players.findIndex(p => p.id === socket.id);
        if (idx !== -1) {
            const player = gameState.players[idx];
            if (gameState.started) {
                logAction(player, "LEFT_GAME_TO_LOBBY", "Reason: Disconnected", "SYSTEM");
            }
            gameState.players.splice(idx, 1);
            if (gameState.activeReaction && gameState.activeReaction.forSocketId === socket.id) resolveReaction("pass");
            if (gameState.players.length < 2) {
                gameState.started = false;
                clearAutoEndTimeout();
            } else if (gameState.started) {
                if (gameState.evacuationMode) {
                    const anyLeft = gameState.players.some(p => p.hand.length > 0);
                    if (!anyLeft) finalizeEvacuation();
                    else nextPlayer();
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
    if (!role4 || gameState.role4UsedThisTurn || gameState.evacuationMode || role4.energy < 1) return;

    // Do not trigger salvage during Role 4's own turn
    const curP = currentPlayer();
    if (curP && curP.id === role4.id) return;

    const originalPlayerId = curP.id;

    startReaction("ROLE4_SALVAGE", role4.id, (decision) => {
        if (decision === "take" && role4.energy >= 1) {
            role4.energy--;
            role4.hand.push(discardedCard);
            role4.role4DrawnThisRound = true;
            gameState.role4UsedThisTurn = true;
            const di = gameState.discardPile.findIndex(c => c === discardedCard);
            if (di !== -1) gameState.discardPile.splice(di, 1);
        }

        // Restore turn to the player who was active when reaction was triggered, only if the turn hasn't transitioned
        if (gameState.players[gameState.currentPlayerIndex] && gameState.players[gameState.currentPlayerIndex].id === originalPlayerId) {
            const pIdx = gameState.players.findIndex(p => p.id === originalPlayerId);
            if (pIdx !== -1) {
                gameState.currentPlayerIndex = pIdx;
            }
        }

        checkAutoEndTurn(currentPlayer(), true);
        broadcastState();
    }, { cardName: getCardNameTurkish(discardedCard) });
}

server.listen(PORT, () => {
    console.log(`GRID sunucusu aktif port: ${PORT}`);
});