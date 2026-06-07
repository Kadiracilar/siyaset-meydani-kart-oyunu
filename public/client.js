const socket = io();

let myId = null;
let myRole = null;
let gameState = null;
let myHand = [];
let selectedCardIndex = null;
let reactionTimer = null;
let role3PeekedTarget = null;

const $ = id => document.getElementById(id);
const screens = {
    login:  $("loginScreen"),
    lobby:  $("lobbyScreen"),
    game:   $("gameScreen")
};

function showScreen(name) {
    Object.values(screens).forEach(s => {
        if(s) s.classList.add("hidden");
    });
    if(screens[name]) screens[name].classList.remove("hidden");
}

const CARD_INFO = {
    POWER:         { label: "GÜÇ KARTI",      desc: "Gündem havuzuna güç ekler. Renk uyumundaysa +1 bonus güç kazanır." },
    CANCEL:        { label: "İPTAL (NOPE)",    desc: "Anlık oynanır. Rakibin kartını iptal eder. Atan gelecek el -1 enerji penaltısı alır." },
    REDUCE:        { label: "AZALT (SABOTAJ)", desc: "Gündem havuzundan son kartı çöpe atar." },
    CHANGE_TARGET: { label: "HEDEF DEĞİŞTİR",  desc: "Mevcut hedefi iptal edip desteye karıştırır, yeni hedef açar." },
    REFRESH:       { label: "YENİLE (FONLAMA)",desc: "Elinizdeki tüm kartları çöpe atıp 5 yeni kart çekersiniz." },
};

const ROLE_INFO = {
    ROLE_1: "Siyah kartlarda 1 indirim. Tur sonu kart çekimi enerjiye bağlı.",
    ROLE_2: "CANCEL reaksiyonu. Mavi hedef bonusu.",
    ROLE_3: "Hedef açılmadan önce gizlice bakabilir, karıştırabilir.",
    ROLE_4: "Çöpe düşen kartı alabilir. Tur sonu kart çekemez.",
    ROLE_5: "Rakip çözünce kart fırlatarak skor düşürür.",
    ROLE_6: "Değer-1 kartlarda +1 uyum bonusu ama +1 enerji maliyeti."
};

if ($("joinBtn")) {
    $("joinBtn").addEventListener("click", () => {
        const name = $("nameInput").value.trim();
        if (!name) return;
        socket.emit("join", name);
        showScreen("lobby");
    });
}

if ($("nameInput")) {
    $("nameInput").addEventListener("keydown", e => { if (e.key === "Enter") $("joinBtn").click(); });
}

if ($("startBtn")) {
    $("startBtn").addEventListener("click", () => socket.emit("startGame"));
}

socket.on("connect", () => { myId = socket.id; });

socket.on("stateUpdate", (state) => {
    gameState = state;
    if (!myId) myId = socket.id;

    if (!state.started && !state.hudMessage.includes("KAZANDI")) {
        renderLobby(state);
    }
    if (state.started || state.evacuationMode) {
        showScreen("game");
        renderGame(state);
    }
    if (!state.started && state.hudMessage.includes("KAZANDI")) {
        if ($("winName")) $("winName").textContent = state.hudMessage;
        if ($("winOverlay")) $("winOverlay").classList.remove("hidden");
    }
});

socket.on("privateState", (data) => {
    myHand = data.hand || [];
    renderHand();
});

socket.on("role3Peek", ({ target }) => {
    role3PeekedTarget = target;
    const typeLabel = target.type === "TARGET" ? target.color : target.type;
    if ($("hudMsg")) $("hudMsg").textContent = `ROL 3 GİZLİ GÖSTERİM: ${typeLabel} - Baraj: ${target.threshold}`;
});

socket.on("reactionTick", ({ remaining }) => {
    if ($("cntSec")) $("cntSec").textContent = Math.ceil(remaining);
    if ($("cntBar")) $("cntBar").style.width = ((remaining / 10) * 100) + "%";
});

function renderLobby(state) {
    const list = $("playerList");
    if (!list) return;
    list.innerHTML = "";
    state.players.forEach(p => {
        const chip = document.createElement("div");
        chip.className = "player-chip";
        chip.innerHTML = `<span class="dot"></span><span>${p.name}</span>`;
        list.appendChild(chip);
    });
    if ($("lobbyInfo")) $("lobbyInfo").textContent = `${state.players.length} / 6 Oyuncu Bağlı`;
    if ($("startBtn")) $("startBtn").disabled = state.players.length < 2;
}

function renderGame(state) {
    if ($("hudMsg")) $("hudMsg").textContent = state.hudMessage;
    const cp = state.players[state.currentPlayerIndex];
    if ($("turnIndicator")) $("turnIndicator").textContent = cp ? `SIRA: ${cp.name.toUpperCase()}` : "—";
    
    const me = state.players.find(p => p.id === myId);
    if ($("myEnergy")) $("myEnergy").textContent = `⚡ ${me ? me.energy : 3}`;
    if ($("discardCount")) $("discardCount").textContent = state.discardCount;

    if (cp && cp.id === myId && !state.activeReaction && !state.evacuationMode) {
        socket.emit("checkForcedManeuver");
    }

    renderTarget(state);
    renderAgenda(state);
    renderPlayerList(state);

    const isMyTurn = cp?.id === myId;
    if ($("endTurnBtn")) $("endTurnBtn").disabled = !isMyTurn || !!state.activeReaction || !!state.evacuationMode;
    if ($("maneuverBtn")) $("maneuverBtn").disabled = !isMyTurn || !!state.activeReaction || !!state.evacuationMode;

    if (state.evacuationMode) { if ($("evacBanner")) $("evacBanner").classList.add("show"); }
    else { if ($("evacBanner")) $("evacBanner").classList.remove("show"); }

    if (state.activeReaction && state.activeReaction.forSocketId === myId) {
        openReactionModal(state.activeReaction);
    } else {
        closeReactionModal();
    }
    renderHand();
}

function renderTarget(state) {
    const t = state.currentTarget;
    if (!t) return;
    if ($("targetName")) {
        $("targetName").textContent = t.type === "TARGET" ? t.color : t.type;
        $("targetName").className = t.color || t.type;
    }
    const power = state.agendaPile.reduce((s, c) => s + c.power, 0);
    if ($("targetProgress")) $("targetProgress").textContent = `${power} / ${t.threshold}`;
    if ($("progBar")) {
        $("progBar").style.width = Math.min(100, (power / t.threshold) * 100) + "%";
        $("progBar").className = "prog-bar " + (t.color || t.type);
    }
}

function renderAgenda(state) {
    const pile = $("agendaPile");
    if (!pile) return;
    pile.innerHTML = "";
    state.agendaPile.forEach(card => {
        const wrap = document.createElement("div");
        const el = document.createElement("div");
        el.className = `card agenda-card ${card.color || 'black'}`;
        el.innerHTML = `<div class="cv">${card.value || '⚡'}</div><div class="power-badge">Güç: ${card.power}</div>`;
        wrap.appendChild(el);
        pile.appendChild(wrap);
    });
}

function renderPlayerList(state) {
    const list = $("playerListGame");
    if (!list) return;
    list.innerHTML = "";
    state.players.forEach((p, i) => {
        const row = document.createElement("div");
        row.className = "player-row" + (i === state.currentPlayerIndex ? " active-turn" : "");
        row.innerHTML = `
            <div class="pr-name">${p.name} ${p.id === myId ? '(Ben)' : ''}</div>
            <div class="pr-role">${p.id === myId ? (p.role || '-') : '???'}</div>
            <div class="pr-stats">
                <span class="pr-score">◆ Puan: ${p.score}</span>
                <span class="pr-energy">⚡ Enerji: ${p.energy}</span>
                <span class="pr-hand">🃏 Kart: ${p.handCount}</span>
            </div>`;
        list.appendChild(row);
    });
}

function renderHand() {
    const container = $("handCards");
    if (!container) return;
    container.innerHTML = "";
    
    const me = gameState?.players.find(p => p.id === myId);
    const cp = gameState?.players[gameState?.currentPlayerIndex];
    const isMyTurn = cp?.id === myId;

    myHand.forEach((card, index) => {
        const wrap = document.createElement("div");
        wrap.className = "tooltip-wrap";
        const el = document.createElement("div");
        el.className = `card ${card.color || ''} ${card.type}`;
        
        let effectiveCost = card.cost;
        if (me) {
            if (me.role === "ROLE_1" && card.type !== "POWER" && !me.usedBlackDiscount) {
                effectiveCost = Math.max(0, effectiveCost - 1);
            }
            if (me.role === "ROLE_6" && card.type === "POWER" && card.value === 1) {
                effectiveCost += 1;
            }
        }

        if (gameState?.evacuationMode) {
            if (gameState.evacuationOrder[gameState.evacuationIndex] === myId) {
                el.classList.add("playable");
            }
        } else {
            const canAfford = me ? (me.energy >= effectiveCost) : true;
            if (isMyTurn && !gameState?.activeReaction) {
                if (canAfford) {
                    el.classList.add("playable");
                } else {
                    el.classList.add("unplayable");
                }
            }
        }

        let cv = card.type === "POWER" ? card.value : card.type.slice(0,6);
        el.innerHTML = `<div class="cv">${cv}</div><div class="cost-badge">${effectiveCost}</div>`;
        
        const tt = document.createElement("div");
        tt.className = "tooltip-box";
        tt.innerHTML = `<span class="tt-name">${CARD_INFO[card.type]?.label || card.type}</span>${CARD_INFO[card.type]?.desc || ''}`;
        
        wrap.appendChild(el);
        wrap.appendChild(tt);
        el.addEventListener("click", () => onCardClick(index, card));
        container.appendChild(wrap);
    });
}

function onCardClick(index, card) {
    if (gameState?.evacuationMode) {
        if (gameState.evacuationOrder[gameState.evacuationIndex] === myId) {
            socket.emit("evacuationDiscard", index);
        }
        return;
    }
    if (gameState?.activeReaction) return;
    socket.emit("playCard", index);
}

if ($("endTurnBtn")) $("endTurnBtn").addEventListener("click", () => socket.emit("endTurn"));

if ($("maneuverBtn")) {
    $("maneuverBtn").addEventListener("click", () => {
        const cards = $("handCards").querySelectorAll(".card");
        cards.forEach((el, i) => {
            el.style.outline = "3px dashed #ffd32a";
            el.addEventListener("click", () => {
                socket.emit("maneuver", i);
            }, { once: true });
        });
    });
}

const REACTION_CONFIG = {
    ROLE2_CANCEL: { title: "ROL 2: NOPE REAKSİYONU", desc: "Mühür basarak iptal kartını bozabilir ve elini büyütebilirsin.", btns: [{l:"MÜHÜRLE", d:"accept"}, {l:"PAS", d:"pass"}] },
    ROLE3_PEEK: { title: "ROL 3: ÖNGÖRÜ", desc: "1 Enerji harcayarak sıradaki gizli hedefi incelemek ister misin?", btns: [{l:"BAK (1 ⚡)", d:"look_and_pay"}, {l:"PAS", d:"pass"}] },
    ROLE3_CHANGE: { title: "ROL 3: SABOTAJ", desc: "Baktığın hedefi desteye geri karıp değiştirmek ister misin?", btns: [{l:"DEĞİŞTİR", d:"change"}, {l:"PAS", d:"pass"}] },
    ROLE4_SALVAGE: { title: "ROL 4: GERİ KAZANIM", desc: "Çöpe düşen bu kartı 1 enerji karşılığında eline almak ister misin?", btns: [{l:"KARTI AL (1 ⚡)", d:"take"}, {l:"PAS", d:"pass"}] },
    ROLE5_STEAL: { title: "ROL 5: SKOR BLOKAJI", desc: "Rakip çözdü! Kart fırlatarak kazandığı skoru baltalamak ister misin?", btns: [{l:"PAS GEÇ", d:"pass"}], role5: true }
};

function openReactionModal(reaction) {
    const cfg = REACTION_CONFIG[reaction.type];
    if (!cfg) return;
    if ($("reactionTitle")) $("reactionTitle").textContent = cfg.title;

    let desc = cfg.desc;
    if (reaction.type === "ROLE3_CHANGE" && role3PeekedTarget) {
        const typeLabel = role3PeekedTarget.type === "TARGET" ? role3PeekedTarget.color : role3PeekedTarget.type;
        desc = `Baktığın Hedef: ${typeLabel} (Baraj: ${role3PeekedTarget.threshold}). ${desc}`;
    }
    if ($("reactionDesc")) $("reactionDesc").textContent = desc;
    if ($("reactionBtns")) $("reactionBtns").innerHTML = "";

    const me = gameState?.players.find(p => p.id === myId);

    if (cfg.role5 && $("role5CardPicker")) {
        $("role5CardPicker").style.display = "flex";
        $("role5CardPicker").innerHTML = "";
        myHand.forEach((card, i) => {
            const btn = document.createElement("button");
            btn.className = "btn btn-danger";
            
            let effectiveCost = card.cost;
            if (me) {
                if (me.role === "ROLE_6" && card.type === "POWER" && card.value === 1) {
                    effectiveCost += 1;
                }
            }
            btn.textContent = `At: ${card.type} (Cost: ${effectiveCost})`;
            
            if (me && me.energy < effectiveCost) {
                btn.disabled = true;
                btn.className = "btn btn-ghost";
            }

            btn.addEventListener("click", () => {
                socket.emit("reactionResponse", { decision: "throw", cardIndex: i });
                closeReactionModal();
            });
            $("role5CardPicker").appendChild(btn);
        });
    } else {
        if ($("role5CardPicker")) $("role5CardPicker").style.display = "none";
    }

    if ($("reactionBtns")) {
        cfg.btns.forEach(b => {
            const btn = document.createElement("button");
            btn.className = "btn btn-primary";
            btn.textContent = b.l;

            if (reaction.type === "ROLE3_PEEK" && b.d === "look_and_pay") {
                if (me && me.energy < 1) {
                    btn.disabled = true;
                    btn.className = "btn btn-ghost";
                }
            }
            if (reaction.type === "ROLE4_SALVAGE" && b.d === "take") {
                if (me && me.energy < 1) {
                    btn.disabled = true;
                    btn.className = "btn btn-ghost";
                }
            }

            btn.addEventListener("click", () => socket.emit("reactionResponse", { decision: b.d }));
            $("reactionBtns").appendChild(btn);
        });
    }
    if ($("reactionModal")) $("reactionModal").classList.remove("hidden");
}

function closeReactionModal() {
    if ($("reactionModal")) $("reactionModal").classList.add("hidden");
    role3PeekedTarget = null;
}