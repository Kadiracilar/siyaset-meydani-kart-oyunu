const socket = io();

let myId = null;
let myRole = null;
let gameState = null;
let myHand = [];
let selectedCardIndex = null;
let reactionTimer = null;
let role3PeekedTarget = null;
let maneuverMode = false;

const $ = id => document.getElementById(id);
const screens = {
    login: $("loginScreen"),
    lobby: $("lobbyScreen"),
    game: $("gameScreen")
};

function showScreen(name) {
    Object.values(screens).forEach(s => {
        if (s) s.classList.add("hidden");
    });
    if (screens[name]) screens[name].classList.remove("hidden");
}

const CARD_INFO = {
    POWER: { label: "GÜÇ KARTI", desc: "Gündem havuzuna güç ekler. Renk uyumundaysa +1 bonus güç kazanır." },
    CANCEL: { label: "İPTAL (NOPE)", desc: "Anlık oynanır. Rakibin kartını iptal eder. Atan gelecek el -1 enerji penaltısı alır." },
    REDUCE: { label: "AZALT (SABOTAJ)", desc: "Gündem havuzundaki son kartın gücünü sıfırlar (kartı çöpe atmaz)." },
    CHANGE_TARGET: { label: "HEDEF DEĞİŞTİR", desc: "Mevcut hedefi iptal edip desteye karıştırır, yeni hedef açar." },
    REFRESH: { label: "YENİLE (FONLAMA)", desc: "Elinizdeki tüm kartları çöpe atıp 5 yeni kart çekersiniz." },
};

const ROLE_INFO = {
    ROLE_1: "Siyah kartlarda 1 indirim. Tur sonu kart çekimi enerjiye bağlı.",
    ROLE_2: "CANCEL reaksiyonu. Mavi hedef bonusu.",
    ROLE_3: "Hedef açılmadan önce gizlice bakabilir, karıştırabilir.",
    ROLE_4: "Çöpe düşen kartı alabilir. Tur sonu kart çekemez.",
    ROLE_5: "Rakip çözünce kart fırlatarak skor düşürür.",
    ROLE_6: "Değer-1 kartlarda +1 uyum bonusu ama +1 enerji maliyeti."
};

const ROLE_DETAILS = {
    ROLE_1: { name: "Popülist Lider", color: "Kırmızı", cssColor: "#ff4757", desc: "Siyah manipülasyon kartlarında 1 indirim (min 0). Tur sonu kart çekimi enerjiye bağlı (ref: 1 enerji). REFRESH kartı -1 skor cezası verir." },
    ROLE_2: { name: "Araştırmacı Gazeteci", color: "Kırmızı", cssColor: "#ff4757", desc: "İptal (Nope) kartına müdahale edebilir. Müdahale ederse atan kart kaybeder, kendisi sonraki turuna 2 enerjiyle başlar. Mavi hedefleri başkası çözerse -2 skor kaybeder." },
    ROLE_3: { name: "Anchorman / Medya Patronu", color: "Mavi", cssColor: "#1e90ff", desc: "Açılacak hedefe 1 enerjiyle gizlice bakabilir, karıştırabilir. Tur boyunca ortadaki gündeme kart oynamazsa pasiflikten -1 skor kaybeder." },
    ROLE_4: { name: "Troll Başı / Hesap Sahibi", color: "Mavi", cssColor: "#1e90ff", desc: "Çöpe düşen kartı rakiplerin sırasındayken 1 enerjiye eline alabilir. Turda kart almadıysa/manevra yapmadıysa tur sonu 1 kart çeker. Kırmızı hedeflerde uyumsuz renkli kart oynarsa gücü 1 azalır." },
    ROLE_5: { name: "Aktivist Sanatçı / Muhalif Blok", color: "Sarı", cssColor: "#ffd32a", desc: "Rakip hedef çözünce elinden kart fırlatıp kartın maliyeti kadar rakibin skorunu düşürür. Kırmızı hedeflerde bir parti boyunca iki defaya mahsus oynadığı kartlar -1 güç alır." },
    ROLE_6: { name: "Kaos Teorisyeni", color: "Sarı", cssColor: "#ffd32a", desc: "1 değerli kartları +1 uyum bonusu alır ama maliyeti +1 enerji artar. Eğer rakip bir hedefi kırmızı kart ile çözerse -2 puan kaybedersin." }
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

    if ($("winOverlay")) $("winOverlay").classList.add("hidden");

    const me = state.players.find(p => p.id === myId);

    if (!state.started && !state.hudMessage.includes("KAZANDI")) {
        if (me) {
            showScreen("lobby");
        } else {
            showScreen("login");
        }
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

window.selectLobbyRole = (role) => {
    socket.emit("selectRole", role);
};

function renderLobby(state) {
    const list = $("playerList");
    if (!list) return;
    list.innerHTML = "";
    state.players.forEach(p => {
        const chip = document.createElement("div");
        chip.className = "player-chip";
        const role = p.selectedRole ? ROLE_DETAILS[p.selectedRole] : null;
        if (role) {
            chip.innerHTML = `<span class="dot" style="background: ${role.cssColor}"></span><span>${p.name} (${role.name})</span>`;
            chip.style.borderColor = role.cssColor;
        } else {
            chip.innerHTML = `<span class="dot"></span><span>${p.name}</span>`;
        }
        list.appendChild(chip);
    });
    if ($("lobbyInfo")) $("lobbyInfo").textContent = `${state.players.length} / 6 Oyuncu Bağlı`;
    if ($("startBtn")) $("startBtn").disabled = state.players.length < 2;

    const lobbyRoleList = $("lobbyRoleList");
    if (lobbyRoleList) {
        lobbyRoleList.innerHTML = "";
        const me = state.players.find(p => p.id === myId);

        Object.keys(ROLE_DETAILS).forEach(roleKey => {
            const role = ROLE_DETAILS[roleKey];
            const item = document.createElement("div");
            item.style.display = "flex";
            item.style.flexDirection = "column";
            item.style.padding = "10px";
            item.style.background = "var(--surface2)";
            item.style.border = "1px solid var(--border)";
            item.style.borderRadius = "var(--radius)";
            item.style.gap = "6px";

            const selector = state.players.find(p => p.selectedRole === roleKey);
            const isMeSelected = selector && selector.id === myId;

            let buttonHTML = "";
            if (selector) {
                if (isMeSelected) {
                    buttonHTML = `<button class="btn btn-ghost" style="padding: 4px 10px; font-size: 12px; margin: 0;" onclick="selectLobbyRole(null)">BIRAK</button>`;
                    item.style.borderColor = role.cssColor;
                    item.style.boxShadow = `0 0 8px ${role.cssColor}40`;
                } else {
                    buttonHTML = `<span style="font-size: 12px; color: var(--text-dim); font-weight: 600;">Seçen: ${selector.name}</span>`;
                }
            } else {
                const mySelectedRole = me ? me.selectedRole : null;
                if (mySelectedRole) {
                    buttonHTML = `<button class="btn btn-primary" disabled style="padding: 4px 10px; font-size: 12px; opacity: 0.5; margin: 0;">SEÇ</button>`;
                } else {
                    buttonHTML = `<button class="btn btn-primary" style="padding: 4px 10px; font-size: 12px; background: ${role.cssColor}; border-color: ${role.cssColor}; margin: 0;" onclick="selectLobbyRole('${roleKey}')">SEÇ</button>`;
                }
            }

            item.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="color: ${role.cssColor}; font-weight: 700; font-size: 14px;">${role.name} (${role.color})</span>
                    ${buttonHTML}
                </div>
                <div style="font-size: 11px; color: var(--text-dim); line-height: 1.4;">${role.desc}</div>
            `;
            lobbyRoleList.appendChild(item);
        });
    }

    const scoreList = $("scoreboardList");
    if (scoreList) {
        scoreList.innerHTML = "";
        const scoreboard = state.scoreboard || [];
        if (scoreboard.length === 0) {
            scoreList.innerHTML = `<div style="text-align: center; color: var(--text-dim); font-size: 14px; margin-top: 40px;">Henüz tamamlanan parti yok.</div>`;
        } else {
            scoreboard.forEach((entry, idx) => {
                const row = document.createElement("div");
                row.style.display = "flex";
                row.style.justifyContent = "space-between";
                row.style.alignItems = "center";
                row.style.padding = "8px 12px";
                row.style.background = "var(--surface2)";
                row.style.border = "1px solid var(--border)";
                row.style.borderRadius = "var(--radius)";
                row.style.fontSize = "14px";

                row.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="color: var(--text-dim); font-family: var(--font-mono); font-size: 12px;">#${idx + 1}</span>
                        <span style="font-weight: 600;">${entry.name}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="color: var(--green); font-weight: 700; font-size: 13px; border: 1px solid var(--green); padding: 1px 6px; border-radius: 4px; background: rgba(46,213,115,0.1);">50+1</span>
                        <span style="font-family: var(--font-mono); color: var(--accent3); font-size: 13px;">Skor: ${entry.score}</span>
                    </div>
                `;
                scoreList.appendChild(row);
            });
        }
    }
}

function renderGame(state) {
    if ($("hudMsg")) $("hudMsg").textContent = state.hudMessage;
    const cp = state.players[state.currentPlayerIndex];
    if ($("turnIndicator")) $("turnIndicator").textContent = cp ? `SIRA: ${cp.name.toUpperCase()}` : "—";

    const me = state.players.find(p => p.id === myId);
    if ($("myEnergy")) $("myEnergy").textContent = `⚡ ${me ? me.energy : 3}`;
    if ($("discardCount")) $("discardCount").textContent = state.discardCount;

    if (cp && cp.id === myId && (!state.activeReaction || state.activeReaction.type === "ROLE4_SALVAGE")) {
        socket.emit("checkForcedManeuver");
    }

    renderTarget(state);
    renderAgenda(state);
    renderPlayerList(state);

    const isMyTurn = cp?.id === myId;
    if (!isMyTurn || (state.activeReaction && state.activeReaction.type !== "ROLE4_SALVAGE")) {
        maneuverMode = false;
    }

    if ($("endTurnBtn")) {
        $("endTurnBtn").disabled = !isMyTurn || (state.activeReaction && state.activeReaction.type !== "ROLE4_SALVAGE") || !(me && me.actedThisTurn);
    }

    if ($("maneuverBtn")) {
        const canManeuver = isMyTurn && (!state.activeReaction || state.activeReaction.type === "ROLE4_SALVAGE") && me && me.energy >= 1 && me.handCount > 0 && !me.actedThisTurn;
        $("maneuverBtn").disabled = !canManeuver;
        if (maneuverMode && canManeuver) {
            $("maneuverBtn").style.boxShadow = "0 0 12px var(--accent3)";
            $("maneuverBtn").style.borderColor = "var(--accent3)";
        } else {
            if (!canManeuver) maneuverMode = false;
            $("maneuverBtn").style.boxShadow = "";
            $("maneuverBtn").style.borderColor = "";
        }
    }

    if (state.evacuationMode) { if ($("evacBanner")) $("evacBanner").classList.add("show"); }
    else { if ($("evacBanner")) $("evacBanner").classList.remove("show"); }

    if (state.activeReaction && state.activeReaction.forSocketId === myId) {
        openReactionModal(state.activeReaction);
    } else {
        closeReactionModal();
    }

    if ($("myRoleInfo")) {
        if (me && me.role) {
            const rDetails = ROLE_DETAILS[me.role];
            if (rDetails) {
                $("myRoleInfo").innerHTML = `ROL: <span style="color: ${rDetails.cssColor}; font-weight: 700;">${rDetails.name} (${rDetails.color})</span> — ${rDetails.desc}`;
            } else {
                $("myRoleInfo").textContent = `ROL: ${me.role}`;
            }
        } else {
            $("myRoleInfo").textContent = "Rolünüz oyun başladığında belirlenecektir.";
        }
    }

    renderHand();
}

function renderTarget(state) {
    const t = state.currentTarget;
    if (!t) {
        if ($("targetName")) $("targetName").textContent = "—";
        if ($("targetDesc")) $("targetDesc").textContent = "";
        if ($("targetProgress")) $("targetProgress").textContent = "0 / 0";
        if ($("progBar")) {
            $("progBar").style.width = "0%";
            $("progBar").className = "prog-bar";
        }
        return;
    }
    if ($("targetName")) {
        $("targetName").textContent = t.type === "TARGET" ? t.color : t.type;
        $("targetName").className = t.color || t.type;
    }
    if ($("targetDesc")) {
        $("targetDesc").textContent = t.desc || "";
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

function canPlayCancel(card) {
    if (card.type !== "CANCEL") return false;
    if (!gameState || !gameState.started || (gameState.activeReaction && gameState.activeReaction.type !== "ROLE4_SALVAGE")) return false;

    if (gameState.lastPlayedCard) {
        const activePlayer = gameState.players[gameState.currentPlayerIndex];
        const isMyTurn = activePlayer && activePlayer.id === myId;
        if (!isMyTurn && gameState.lastPlayedCard.playerId !== myId) {
            const lastCard = gameState.lastPlayedCard.card;
            if (lastCard.type === "POWER" && gameState.agendaPile.length === 0) {
                return false;
            }
            return true;
        }
    }

    return false;
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

        const canAfford = me ? (me.energy >= effectiveCost) : true;
        let isPlayable = false;

        if (isMyTurn && (!gameState?.activeReaction || gameState?.activeReaction.type === "ROLE4_SALVAGE")) {
            if (maneuverMode) {
                isPlayable = true;
                el.style.outline = "3px dashed #ffd32a";
            } else if (canAfford) {
                isPlayable = true;
                if (card.type === "REDUCE") {
                    const agenda = gameState?.agendaPile;
                    const currentPower = agenda ? agenda.reduce((s, c) => s + c.power, 0) : 0;
                    if (currentPower <= 0) {
                        isPlayable = false;
                    } else if (agenda && agenda.length > 0 && agenda[agenda.length - 1].owner === myId) {
                        isPlayable = false;
                    }
                }
            }
        } else if (canPlayCancel(card)) {
            isPlayable = true;
        }

        if (isPlayable) {
            el.classList.add("playable");
        } else {
            el.classList.add("unplayable");
        }

        let cv = card.type === "POWER" ? card.value : card.type.slice(0, 6);
        el.innerHTML = `<div class="cv">${cv}</div><div class="cost-badge">${effectiveCost}</div>`;

        const tt = document.createElement("div");
        tt.className = "tooltip-box";
        tt.innerHTML = `<span class="tt-name">${CARD_INFO[card.type]?.label || card.type}</span>${CARD_INFO[card.type]?.desc || ''}`;

        wrap.appendChild(el);
        wrap.appendChild(tt);
        el.addEventListener("click", () => onCardClick(index, card, el));
        container.appendChild(wrap);
    });
}

function onCardClick(index, card, el) {
    if (el && el.classList.contains("unplayable")) return;
    if (gameState?.activeReaction && gameState?.activeReaction.type !== "ROLE4_SALVAGE") return;

    if (maneuverMode) {
        socket.emit("maneuver", index);
        maneuverMode = false;
        renderHand();
        return;
    }

    if (card.type === "CANCEL") {
        socket.emit("playCancel", index);
        return;
    }

    if (card.type === "REDUCE") {
        const agenda = gameState?.agendaPile;
        const currentPower = agenda ? agenda.reduce((s, c) => s + c.power, 0) : 0;
        if (currentPower <= 0) {
            return;
        }
        if (agenda && agenda.length > 0 && agenda[agenda.length - 1].owner === myId) {
            return;
        }
    }

    socket.emit("playCard", index);
}

if ($("endTurnBtn")) $("endTurnBtn").addEventListener("click", () => socket.emit("endTurn"));

if ($("maneuverBtn")) {
    $("maneuverBtn").addEventListener("click", () => {
        if (!gameState?.started || (gameState?.activeReaction && gameState?.activeReaction.type !== "ROLE4_SALVAGE")) return;
        const cp = gameState?.players[gameState?.currentPlayerIndex];
        const me = gameState?.players.find(p => p.id === myId);
        if (cp?.id !== myId || !me || me.energy < 1 || me.handCount === 0 || me.actedThisTurn) return;

        maneuverMode = !maneuverMode;
        renderHand();
    });
}

const REACTION_CONFIG = {
    ROLE2_CANCEL: { title: "ROL 2: NOPE REAKSİYONU", desc: "Mühür basarak iptal kartını bozabilir ve elini büyütebilirsin.", btns: [{ l: "MÜHÜRLE", d: "accept" }, { l: "PAS", d: "pass" }] },
    CANCEL_COUNTER: { title: "İPTAL DÜELLOSU: NOPE!", desc: "Rakibin iptal kartına elindeki CANCEL kartıyla karşı koymak ister misin?", btns: [{ l: "KARŞI KOY", d: "accept" }, { l: "PAS", d: "pass" }] },
    ROLE3_PEEK: { title: "ROL 3: ÖNGÖRÜ", desc: "1 Enerji harcayarak sıradaki gizli hedefi incelemek ister misin?", btns: [{ l: "BAK (1 ⚡)", d: "look_and_pay" }, { l: "PAS", d: "pass" }] },
    ROLE3_CHANGE: { title: "ROL 3: SABOTAJ", desc: "Baktığın hedefi desteye geri karıp değiştirmek ister misin?", btns: [{ l: "DEĞİŞTİR", d: "change" }, { l: "PAS", d: "pass" }] },
    ROLE4_SALVAGE: { title: "ROL 4: GERİ KAZANIM", desc: "Çöpe düşen bu kartı 1 enerji karşılığında eline almak ister misin?", btns: [{ l: "KARTI AL (1 ⚡)", d: "take" }, { l: "PAS", d: "pass" }] },
    ROLE5_STEAL: { title: "ROL 5: SKOR BLOKAJI", desc: "Rakip çözdü! Kart fırlatarak kazandığı skoru baltalamak ister misin?", btns: [{ l: "PAS GEÇ", d: "pass" }], role5: true },
    SPECIAL_X_CHOOSE: { title: "SIRA DIŞI DURUM X: RAKİP SEÇ", desc: "10 puanını sileceğiniz rakibinizi seçiniz.", btns: [] }
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
    if (reaction.type === "ROLE4_SALVAGE" && reaction.customData && reaction.customData.cardName) {
        desc = `Çöpe düşen [${reaction.customData.cardName}] kartını 1 enerji karşılığında eline almak ister misin?`;
    }
    if ($("reactionDesc")) $("reactionDesc").textContent = desc;
    if ($("reactionBtns")) $("reactionBtns").innerHTML = "";

    const me = gameState?.players.find(p => p.id === myId);

    if (reaction.type === "SPECIAL_X_CHOOSE") {
        if ($("role5CardPicker")) $("role5CardPicker").style.display = "none";
        if ($("reactionBtns")) {
            gameState.players.forEach(p => {
                if (p.id !== myId) {
                    const btn = document.createElement("button");
                    btn.className = "btn btn-danger";
                    btn.textContent = `${p.name} (${p.score} Puan)`;
                    btn.addEventListener("click", () => {
                        socket.emit("reactionResponse", { decision: p.id });
                        closeReactionModal();
                    });
                    $("reactionBtns").appendChild(btn);
                }
            });
        }
        if ($("reactionModal")) $("reactionModal").classList.remove("hidden");
        return;
    }

    if (cfg.role5 && $("role5CardPicker")) {
        $("role5CardPicker").style.display = "flex";
        $("role5CardPicker").innerHTML = "";
        myHand.forEach((card, i) => {
            const btn = document.createElement("button");
            btn.className = "btn btn-danger";

            let effectiveCost = card.cost !== undefined ? card.cost : 0;
            if (me) {
                if (me.role === "ROLE_6" && card.type === "POWER" && card.value === 1) {
                    effectiveCost += 1;
                }
            }
            let cardName = card.type;
            if (card.type === "POWER") {
                cardName = `${card.color} ${card.value} Güç`;
            } else if (CARD_INFO[card.type]) {
                cardName = CARD_INFO[card.type].label;
            }
            btn.textContent = `Fırlat: ${cardName} (Maliyet/Ceza: ${effectiveCost} ⚡)`;

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

if ($("playAgainBtn")) {
    $("playAgainBtn").addEventListener("click", () => {
        socket.emit("playAgain");
    });
}

const RULES_HTML = `
  <h4 style="color: var(--accent); margin-bottom: 8px;">🎯 1. OYUNUN AMACI VE BAŞLANGIÇ</h4>
  <ul style="margin-bottom: 15px; padding-left: 20px;">
    <li style="margin-bottom: 6px;"><strong>Amaç:</strong> Merkez masaya açılan "Aktif Hedefleri" eldeki kartlarla çözerek 51 puana ulaşan ilk oyuncu olmak.</li>
    <li style="margin-bottom: 6px;"><strong>Başlangıç:</strong> Her oyuncuya merkez desteden 5 adet kart dağıtılır ve herkesin tur enerjisi 3⚡ olarak eşitlenir.</li>
  </ul>
  
  <h4 style="color: var(--accent); margin-bottom: 8px;">🎲 2. SIRA SENDEDİR: TURUNU NASIL OYNARSIN?</h4>
  <p style="margin-bottom: 10px;"><strong>ANA KURAL:</strong> Sırası gelen oyuncu pas geçemez. Sıranızı bir sonraki oyuncuya devredebilmeniz için o tur mutlaka EN AZ 1 ENERJİ harcamış olmanız gerekir!</p>
  <p style="margin-bottom: 10px;">Sıra size geldiğinde elinizdeki kaynaklarla şu 3 hamleden birini yaparsınız:</p>
  <ol style="margin-bottom: 15px; padding-left: 20px;">
    <li style="margin-bottom: 8px;"><strong>GÜÇ KARTI OYNAMAK:</strong> Elinizdeki renkli kartı ortadaki Gündem Havuzuna atarsınız.
      <ul style="margin-top: 4px; padding-left: 20px;">
        <li style="margin-bottom: 4px;"><strong>RENK UYUMU:</strong> Attığınız kartın rengi masadaki hedef kartıyla AYNIYSA, kartınız otomatik olarak +1 GÜÇ kazanır!</li>
      </ul>
    </li>
    <li style="margin-bottom: 8px;"><strong>AKSİYON KARTI OYNAMAK:</strong> Elinizdeki siyah kartları (Sabotaj, Yenileme, Hedef Değiştirme) üzerinde yazan enerji bedelini ödeyerek oynarsınız.</li>
    <li style="margin-bottom: 8px;"><strong>MANEVRA YAPMAK (Zorunlu Pas):</strong> Elinizde oynayacak kart yoksa veya elinizi saklamak istiyorsanız; 1 enerji harcar, elinizden 1 kartı kapalı olarak çöpe atar ve desteden 1 yeni kart çekersiniz.</li>
  </ol>
  <p style="margin-bottom: 15px;"><strong>HEDEF NASIL ÇÖZÜLÜR?:</strong> Havuzda biriken kartların toplam gücü, hedef kartının baraj değerine ulaştığı veya geçtiği an hedef çözülür. O barajı geçen SON KARTI atan oyuncu, hedef kartını ve üzerindeki puanı kazanır!</p>

  <h4 style="color: var(--accent); margin-bottom: 8px;">⚡ 3. SIRA SENDE DEĞİLKEN NELER YAPABİLİRSİN? (REAKSİYONLAR)</h4>
  <p style="margin-bottom: 10px;">Oyun sıra tabanlı akan bir yapıya sahip olsa da, rakiplerin turlarına anlık olarak müdahale edebilirsiniz:</p>
  <ul style="margin-bottom: 15px; padding-left: 20px;">
    <li style="margin-bottom: 6px;"><strong>İPTAL (CANCEL) DÜELLOSU:</strong> Bir rakip kart oynadığında, sıranız olmasa bile elinizden anlık olarak "CANCEL" kartı fırlatabilirsiniz. Attığınız CANCEL başarılı olursa rakibin hamlesi iptal edilir ve çöpe gider.
      <ul style="margin-top: 4px; padding-left: 20px;">
        <li style="margin-bottom: 4px;"><strong>REAKSİYON PENALTISI:</strong> Sıranız dışından bu düelloya girip kaybederseniz, bir sonraki kendi turunuza -1 Enerji Penaltısıyla (2 enerji ile) başlarsınız! Kendi oynadığı kartı savunan aktif oyuncu penaltı almaz.</li>
      </ul>
    </li>
  </ul>

  <h4 style="color: var(--accent); margin-bottom: 8px;">👥 4. ASİMETRİK MODELLER (ROL YETENEKLERİ)</h4>
  <p style="margin-bottom: 10px;">Oyunda her oyuncuya başlangıçta asimetrik birer avantaj tanımlanır:</p>
  <ul style="margin-bottom: 15px; padding-left: 20px;">
    <li style="margin-bottom: 6px;"><strong>🔴 MODEL 1:</strong> Siyah aksiyon kartlarını oynarken her tur ilk kartta 1 enerji indirimi alır. Ancak tur sonunda rutin kart çekebilmesi için sistem onun 1 enerjisini düşer. Enerjisi 0 ise tur sonu kart çekemez. Yenileme kartı oynarsa -1 puan kaybeder.</li>
    <li style="margin-bottom: 6px;"><strong>🔴 MODEL 2:</strong> Birisi CANCEL attığında araya girip o kartı mühürleyebilir, mühürlerse CANCEL atan oyuncunun elinden rastgele 1 kart çöpe gider. Mavi renkli hedefleri başkası çözerse -2 puan kaybeder (X ve Y hariç).</li>
    <li style="margin-bottom: 6px;"><strong>🔵 MODEL 3:</strong> Yeni hedef açılmadan önce gizlice sıradaki karta bakabilir ve en fazla 2 kez hedef destesini karıştırıp yeni kart açtırabilir. Kendi turu boyunca ortadaki havuza hiç kart oynamazsa pasiflikten -1 puan kaybeder.</li>
    <li style="margin-bottom: 6px;"><strong>🔵 MODEL 4:</strong> Rakiplerin sırasındayken çöpe giden herhangi bir kartı 1 enerji karşılığında yerden kendi eline alabilir (Turda en fazla 1 kez). Tur sonu rutin kart çekimi yapamaz. Kırmızı hedef aktifken uyumsuz renk oynarsa gücü 1 azalır.</li>
    <li style="margin-bottom: 6px;"><strong>🟡 MODEL 5:</strong> Bir rakip hedef çözüp puan kazandığı an elinden kart fırlatarak hedefi çözen oyuncunun kazandığı puanı fırlattığı kartın maliyeti kadar düşürür. Kırmızı hedefte güç kartı oynarsa gücü 1 azalır.</li>
    <li style="margin-bottom: 6px;"><strong>🟡 MODEL 6:</strong> Oynadığı 1 değerindeki kartlar, hedef rengine bakılmaksızın otomatik +1 güç bonusu alır. Ancak bu kartları oynamak ona +1 fazla enerjiye (Maliyet: 2) mal olur. Rakip kırmızı hedef çözerse anında -2 puan kaybeder.</li>
  </ul>

  <h4 style="color: var(--accent); margin-bottom: 8px;">🚨 5. TASFİYE SAFHASI (SON ANLAR)</h4>
  <p style="margin-bottom: 10px;">Desteler azaldığında oyun durmaz, acil Tasfiye Protokolü devreye girer:</p>
  <ul style="margin-bottom: 15px; padding-left: 20px;">
    <li style="margin-bottom: 6px;">Çekilecek kart olduğu sürece, hedef çözülene kadar kart çekme işlemi normal kurallarla devam eder.</li>
    <li style="margin-bottom: 6px;">Oyuncular elindeki kartlar tamamen bitene kadar ortadaki mevcut hedefi çözmek ve puan toplamak için oynamaya devam ederler.</li>
    <li style="margin-bottom: 6px;">Hamlesi kalmayanlar zorunlu manevrayla elindeki kartları kapalı olarak çöpe fırlatır.</li>
    <li style="margin-bottom: 6px;">Eğer hedef kartlarının bitmesi sebebiyle bu moda girilmişse, o son kart çözüldüğü an sistem tüm ıskartayı toplar, karıp desteleri sıfırdan kurar ve oyun otomatik olarak yeniden başlar.</li>
  </ul>
`;

function openRulesModal() {
    if ($("rulesContent")) $("rulesContent").innerHTML = RULES_HTML;
    if ($("rulesModal")) $("rulesModal").classList.remove("hidden");
}

function closeRulesModal() {
    if ($("rulesModal")) $("rulesModal").classList.add("hidden");
}

// Bind events (Use event delegation or conditional check since elements are statically in HTML)
document.addEventListener("DOMContentLoaded", () => {
    if ($("lobbyRulesBtn")) $("lobbyRulesBtn").addEventListener("click", openRulesModal);
    if ($("gameRulesBtn")) $("gameRulesBtn").addEventListener("click", openRulesModal);
    if ($("closeRulesBtn")) $("closeRulesBtn").addEventListener("click", closeRulesModal);
    if ($("exitBtn")) {
        $("exitBtn").addEventListener("click", () => {
            window.location.reload();
        });
    }
    if ($("backToLobbyBtn")) {
        $("backToLobbyBtn").addEventListener("click", () => {
            if (confirm("Lobiye dönmek istediğinizden emin misiniz?")) {
                socket.emit("returnToLobby");
            }
        });
    }
});

// Also bind directly in case DOMContentLoaded has already fired
if ($("lobbyRulesBtn")) $("lobbyRulesBtn").addEventListener("click", openRulesModal);
if ($("gameRulesBtn")) $("gameRulesBtn").addEventListener("click", openRulesModal);
if ($("closeRulesBtn")) $("closeRulesBtn").addEventListener("click", closeRulesModal);
if ($("exitBtn")) {
    $("exitBtn").addEventListener("click", () => {
        window.location.reload();
    });
}
if ($("backToLobbyBtn")) {
    $("backToLobbyBtn").addEventListener("click", () => {
        if (confirm("Lobiye dönmek istediğinizden emin misiniz?")) {
            socket.emit("returnToLobby");
        }
    });
}