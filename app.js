// --- AUTHENTICATION LOGIC ---
const APP_PASSWORD = "castle123";

function checkAuth() {
    const isAuth = sessionStorage.getItem('mtg_auth');
    
    if (isAuth === 'true') {
        document.body.classList.add('auth-passed'); 
        return true;
    }

    const entry = prompt("Please enter the password to access data entry:");
    
    if (entry === APP_PASSWORD) {
        sessionStorage.setItem('mtg_auth', 'true');
        document.body.classList.add('auth-passed'); 
        return true;
    } else {
        alert("Incorrect password. Access denied.");
        document.body.style.opacity = "1"; 
        document.body.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; background:#121416; color:white; font-family:sans-serif;">
                <h1>Locked</h1>
                <p>Refresh the page to try again.</p>
            </div>
        `;
        return false;
    }
}

if (!checkAuth()) {
    throw new Error("Unauthorized access");
}

// --- FIREBASE IMPORTS ---
// FIXED: Removed the duplicate initializeApp import that was crashing the script
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot, 
    increment, query, orderBy, writeBatch, getDoc, updateDoc, limit, serverTimestamp, getDocs 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDAT1UIM1mFMH1vh_Wal4SqXOY6NSr0_6c",
    authDomain: "castle-mtg-stat-tracker.firebaseapp.com",
    projectId: "castle-mtg-stat-tracker",
    storageBucket: "castle-mtg-stat-tracker.firebasestorage.app",
    messagingSenderId: "503581755862",
    appId: "1:503581755862:web:10222b71ae270b6ca03c77"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- STATE ---
let allDecks = [];
let allPlayers = []; 
let selectedRosterPlayer = null;
let selectedNewPlayerColor = "#3d85ff"; 
let initialPopulated = false;
let selectedInsightPlayer = null;
let selectedInsightDeckId = null;
let activePieChart = null;


const MODERN_COLORS = [
    "#16171a", "#7f0622", "#d62411", "#ff8426", 
    "#ffd100", "#f2f3ccff", "#ff80a4", "#ff2674",
    "#94216a", "#5e1a83ff", "#234975", "#68aed4",
    "#65c227ff", "#10d275", "#007899", "#311b55ff"
];

// --- DOM ELEMENTS ---
const deckList = document.getElementById('deckList');
const playerSelect = document.getElementById('playerSelect');
const tagContainer = document.getElementById('tagSelectorContainer');
const rosterTabs = document.getElementById('rosterTabs');
const rosterDeckView = document.getElementById('rosterDeckList');
const historyList = document.getElementById('matchHistoryList');

const customModal = document.getElementById('customModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalActions = document.getElementById('modalActions');

// --- HELPERS ---
const getPlayerColor = (name) => {
    const player = allPlayers.find(p => p.name === name);
    return player ? player.color : "var(--accent)";
};

const TAG_COLORS = {
    "Aggro":            "#ff4444",
    "Aristocrats":      "#9c27b0",
    "Artifacts":        "#607d8b",
    "Big Mana":         "#4caf50",
    "Blink":            "#00bcd4",
    "Burn":             "#ff5722",
    "Combo":            "#ffeb3b",
    "Control":          "#2196f3",
    "Group Hug":        "#8bc34a",
    "Lands":            "#14a35c",
    "Lifegain":         "#fc79a4",
    "Midrange":         "#ff9800",
    "Mill":             "#3f51b5",
    "Reanimator":       "#212121",
    "Spellslinger":     "#03a9f4",
    "Stax":             "#856b69",
    "Tokens":           "#ffc107",
    "Tribal":           "#cddc39",
    "Voltron":          "#ac0505",
    "+1/+1 Counters":   "#009688",
    "Mono Color":       "#9e9e9e",
    "Budget":           "#43a047",
    "Recursion":        "#673ab7",
    "Go Wide":          "#fdd835",
    "Goad":             "#e53935",
    "Graveyard":        "#464646ff",
    "Enchantress":      "#ab47bc",
    "Storm":            "#1e88e5",
    "Theft":            "#f4511e"
};

const getTagStyle = (tag) => {
    const color = TAG_COLORS[tag] || "var(--text-dim)";
    return `background-color: ${color}22; color: ${color}; border: 1px solid ${color}44;`;
};

function renderColorGrid(containerId, activeColor, onSelect) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = MODERN_COLORS.map(color => `
        <div class="color-swatch ${color === activeColor ? 'active' : ''}" 
             style="background-color: ${color}" 
             data-color="${color}">
        </div>
    `).join('');

    container.querySelectorAll('.color-swatch').forEach(swatch => {
        swatch.onclick = () => {
            container.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            onSelect(swatch.dataset.color);
        };
    });
}

function openModal(title, bodyHtml, actions) {
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHtml; 
    modalActions.innerHTML = ''; 
    actions.forEach(action => {
        const btn = document.createElement('button');
        btn.textContent = action.label;
        btn.style.backgroundColor = action.color || 'var(--border)';
        btn.onclick = () => { action.onClick(); closeModal(); };
        modalActions.appendChild(btn);
    });
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = closeModal;
    modalActions.appendChild(cancelBtn);
    customModal.classList.add('active');
}

function closeModal() { customModal.classList.remove('active'); }

function addParticipant(defaultPlayerName = null) {
    const row = document.createElement('div');
    row.className = 'card participant-card-compact';
    row.style.background = 'rgba(0,0,0,0.2)';
    row.innerHTML = `
        <div class="participant-row line-1">
            <div class="input-group-main">
                <select class="p-owner">
                    <option value="" disabled selected>Player...</option>
                    ${allPlayers.map(p => `<option value="${p.name}" style="color:${p.color}; font-weight:bold;">${p.name}</option>`).join('')}
                </select>
                <select class="p-deck"><option value="" disabled selected>Deck...</option></select>
                <select class="p-kills">
                    <option value="na" selected>N/A KOs</option>
                    <option value="0">0 KO's</option>
                    <option value="1">1 KO</option>
                    <option value="2">2 KO's</option>
                    <option value="3">3 KO's</option>
                    <option value="4">4 KO's</option>
                </select>
                <select class="p-fun-rating">
                    <option value="0">N/A Fun</option>
                    <option value="1">1/5</option>
                    <option value="2">2/5</option>
                    <option value="3">3/5</option>
                    <option value="4">4/5</option>
                    <option value="5">5/5</option>
                </select>
            </div>
            <button class="remove-participant" onclick="this.parentElement.parentElement.remove()">✕</button>
        </div>
        
        <div class="participant-row line-2">
            <label class="won-toggle compact-toggle"><input type="radio" name="winner" class="p-win" style="display:none">WON</label>
            <label class="stat-pill pill-blood compact-pill"><input type="radio" name="blood_owner" class="p-blood" style="display:none"> Blood</label>
            <label class="stat-pill pill-ramp compact-pill"><input type="radio" name="ramp_owner" class="p-ramp" style="display:none"> Ramp</label>
            <label class="stat-pill pill-draw compact-pill"><input type="radio" name="draw_owner" class="p-draw" style="display:none"> Draw</label>
            <label class="stat-pill pill-first compact-pill"><input type="radio" name="first_owner" class="p-first" style="display:none"> 1st</label>
            <label class="stat-pill pill-last compact-pill"><input type="radio" name="last_owner" class="p-last" style="display:none"> Last</label>
        </div>

        <div class="participant-row line-3">
            <label class="stat-pill pill-sol compact-pill"><input type="checkbox" class="p-sol" style="display:none"> Sol Ring</label>
            <label class="stat-pill pill-impact compact-pill"><input type="checkbox" class="p-impact" style="display:none"> High Impact</label>
            <label class="stat-pill pill-fun compact-pill"><input type="checkbox" class="p-fun" style="display:none"> Did its thing</label>
        </div>
    `;
    
    const ownerSel = row.querySelector('.p-owner');
    const deckSel = row.querySelector('.p-deck');

    ownerSel.onchange = () => {
        const playerName = ownerSel.value;
        const playerColor = getPlayerColor(playerName);
        
        ownerSel.style.borderColor = playerColor;
        ownerSel.style.color = playerColor;
        ownerSel.style.fontWeight = '800';

        let filtered = allDecks.filter(d => d.player === playerName);
        filtered.sort((a,b) => a.deckName === 'Misc' ? 1 : b.deckName === 'Misc' ? -1 : a.deckName.localeCompare(b.deckName));
        deckSel.innerHTML = '<option value="" disabled selected>Deck...</option>' + 
            filtered.map(d => `<option value="${d.id}">${d.deckName}</option>`).join('');
    };

    document.getElementById('gameParticipants').appendChild(row);

    if (defaultPlayerName && allPlayers.some(p => p.name === defaultPlayerName)) {
        ownerSel.value = defaultPlayerName;
        ownerSel.dispatchEvent(new Event('change'));
    }
}

// --- 1. LISTENERS ---
onSnapshot(query(collection(db, "players"), orderBy("name", "asc")), (snapshot) => {
    allPlayers = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name, color: doc.data().color || "#3d85ff" }));
    playerSelect.innerHTML = '<option value="" disabled selected>Owner...</option>';
    rosterTabs.innerHTML = '';
    
    allPlayers.forEach(p => {
        playerSelect.innerHTML += `<option value="${p.name}">${p.name}</option>`;
        const container = document.createElement('div');
        container.className = 'player-tab-container';
        const btn = document.createElement('button');
        btn.className = `roster-tab-btn ${selectedRosterPlayer === p.name ? 'active' : ''}`;
        btn.textContent = p.name;
        btn.style.backgroundColor = p.color;
        btn.style.borderColor = p.color;
        btn.onclick = () => {
            selectedRosterPlayer = p.name;
            updateRosterView();
            document.querySelectorAll('.roster-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        };
        const controls = document.createElement('div');
        controls.className = 'player-controls';
        const editBtn = document.createElement('button');
        editBtn.className = 'player-edit-btn';
        editBtn.innerHTML = '✏️';
        editBtn.onclick = (e) => { e.stopPropagation(); handleEditPlayerTrigger(p.id, p.name, p.color); };
        const delBtn = document.createElement('button');
        delBtn.className = 'player-del-btn';
        delBtn.textContent = '✕';
        delBtn.onclick = (e) => { e.stopPropagation(); handlePlayerDeletion(p.id, p.name); };
        controls.appendChild(editBtn);
        controls.appendChild(delBtn);
        container.appendChild(btn);
        container.appendChild(controls);
        rosterTabs.appendChild(container);
    });
    tryInitializeDefaultPod();
});

onSnapshot(query(collection(db, "decks")), (snapshot) => {
    document.getElementById('loading').style.display = 'none';
    deckList.innerHTML = '';
    allDecks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    allDecks.sort((a, b) => {
        const totalA = (a.wins || 0) + (a.losses || 0);
        const totalB = (b.wins || 0) + (b.losses || 0);
        return totalB - totalA; 
    });

    allDecks.forEach(deck => {
        const wins = deck.wins || 0;
        const losses = deck.losses || 0;
        const total = wins + losses;
        const rate = total > 0 ? ((wins / total) * 100).toFixed(0) : 0;
        const tags = deck.deckTags || [];
        
        const li = document.createElement('li');
        li.className = 'deck-card-container';
        const bgArt = deck.commanderImage ? `url(${deck.commanderImage})` : 'none';
        li.innerHTML = `
            <div class="deck-card" style="--commander-art: ${bgArt}">
                <div class="deck-header">
                    <div>
                        <h3 style="margin:0; font-size:1.1rem;">${deck.deckName}</h3>
                        <div style="color:${getPlayerColor(deck.player)}; font-size:0.75rem; margin-top:2px; font-weight:800; text-transform:uppercase; letter-spacing: 0.5px;">${deck.player}</div>
                        <div class="deck-tags-grid">
                            ${tags.map(t => `<span class="individual-tag" style="${getTagStyle(t)}">${t}</span>`).join('')}
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <div class="win-rate-badge">
                            <span class="win-rate-val">${total}</span>
                            <span class="win-rate-label">GAMES</span>
                        </div>
                        <div class="win-rate-badge">
                            <span class="win-rate-val">${rate}%</span>
                            <span class="win-rate-label">WIN RATE</span>
                        </div>
                    </div>
                </div>
                <div class="stat-badges">
                    <div class="stat-badge-pill pill-won">WINS <b>${wins}</b></div>
                    <div class="stat-badge-pill pill-kos">KILLS <b>${deck.knockouts || 0}</b></div>
                    <div class="stat-badge-pill pill-sol">SOL RING <b>${deck.solRingOpening || 0}</b></div>
                    <div class="stat-badge-pill pill-blood">FIRST BLOOD <b>${deck.firstBloodCount || 0}</b></div>
                    <div class="stat-badge-pill pill-ramp">MOST RAMP <b>${deck.mostRampCount || 0}</b></div>
                    <div class="stat-badge-pill pill-draw">MOST DRAW <b>${deck.mostDrawCount || 0}</b></div>
                    <div class="stat-badge-pill pill-first">WENT FIRST <b>${deck.wentFirstCount || 0}</b></div>
                    <div class="stat-badge-pill pill-last">WENT LAST <b>${deck.wentLastCount || 0}</b></div>
                    <div class="stat-badge-pill pill-fun">DID ITS THING <b>${deck.funCount || 0}</b></div>
                    <div class="stat-badge-pill pill-impact">HIGH IMPACT <b>${deck.impactCount || 0}</b></div>
                </div>
            </div>
        `;
        deckList.appendChild(li);
    });

    if (selectedRosterPlayer) updateRosterView();
    if (selectedInsightPlayer) renderInsightTab();
    tryInitializeDefaultPod();
});

onSnapshot(query(collection(db, "matches"), orderBy("timestamp", "desc"), limit(20)), (snapshot) => {
    historyList.innerHTML = '';
    snapshot.docs.forEach(docSnap => {
        const match = docSnap.data();
        const matchId = docSnap.id;
        const dateStr = match.timestamp ? match.timestamp.toDate().toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : 'Just now';
        const card = document.createElement('div');
        card.className = 'history-card';
        card.innerHTML = `
            <div class="history-header">
                <div class="history-date">${dateStr}</div>
                <div style="display:flex; gap:10px; align-items:center;">
                    <div class="history-date">${match.participants.length} Players</div>
                    <button class="edit-btn-sm" onclick="handleEditMatchTrigger('${matchId}')">Edit</button>
                </div>
            </div>
            <div class="history-body">
                ${match.participants.map(p => `
                    <div class="history-participant ${p.win ? 'winner-row' : ''}">
                        <div class="history-deck-info">
                            <span class="history-player-name" style="color:${getPlayerColor(p.player)}">${p.player}</span>
                            <span class="history-deck-name">${p.deckName}</span>
                            <div class="deck-tags-grid">
                                ${(p.deckTags || []).map(t => `<span class="individual-tag" style="${getTagStyle(t)}">${t}</span>`).join('')}
                            </div>
                        </div>
                        <div class="history-stats">
                            ${p.win ? '<div class="stat-badge-pill pill-won">WIN</div>' : ''}
                            ${p.kos !== "N/A" && p.kos > 0 ? `<div class="stat-badge-pill pill-kos">KOS <b>${p.kos}</b></div>` : ''}
                            ${p.funRating > 0 ? `<div class="stat-badge-pill pill-fun">★ <b>${p.funRating}</b></div>` : ''}
                            ${p.sol ? `<div class="stat-badge-pill pill-sol">SOL RING</div>` : ''}
                            ${p.blood ? `<div class="stat-badge-pill pill-blood">FIRST BLOOD</div>` : ''}
                            ${p.ramp ? `<div class="stat-badge-pill pill-ramp">MOST RAMP</div>` : ''}
                            ${p.draw ? `<div class="stat-badge-pill pill-draw">MOST DRAW</div>` : ''}
                            ${p.fun ? `<div class="stat-badge-pill pill-fun">DID ITS THING</div>` : ''}
                            ${p.impact ? `<div class="stat-badge-pill pill-impact">HIGH IMPACT</div>` : ''}
                            ${p.first ? `<div class="stat-badge-pill pill-first">1ST</div>` : ''}
                            ${p.last ? `<div class="stat-badge-pill pill-last">LAST</div>` : ''}
                            ${p.impact ? `<div class="stat-badge-pill pill-impact">HIGH IMPACT</div>` : ''}
                        </div>
                    </div>
                `).join('')}
                
                ${match.comment ? `
                    <div class="history-comment-box">
                        <span class="history-comment-label">Match Notes</span>
                        <div class="history-comment-text">"${match.comment}"</div>
                    </div>
                ` : ''}
            </div>
        `;
        historyList.appendChild(card);
    });
});

function updateRosterView() {
    let decks = allDecks.filter(d => d.player === selectedRosterPlayer);
    decks.sort((a, b) => {
        const aName = a.deckName.toLowerCase();
        const bName = b.deckName.toLowerCase();
        if (aName === 'misc') return 1;
        if (bName === 'misc') return -1;
        return aName.localeCompare(bName);
    });
    rosterDeckView.innerHTML = ''; 
    if (decks.length === 0) {
        rosterDeckView.innerHTML = `<p style="font-size:0.8rem; color:var(--text-dim); text-align:center;">No decks found.</p>`;
        return;
    }
    const ul = document.createElement('ul');
    ul.className = 'roster-list';
    decks.forEach(d => {
        const li = document.createElement('li');
        li.className = 'roster-deck-item';
        li.innerHTML = `
            <div class="roster-deck-content">
                <div class="roster-deck-info">
                    <div class="roster-deck-title">${d.deckName}</div>
                    <div class="deck-tags-grid">${(d.deckTags || []).map(t => `<span class="individual-tag" style="${getTagStyle(t)}">${t}</span>`).join('')}</div>
                </div>
                <div class="player-controls">
                    <button class="player-edit-btn" onclick="handleEditDeckSettingsTrigger('${d.id}')">✏️</button>
                    <button class="player-del-btn" onclick="handleDeckDeletionTrigger('${d.id}', '${d.deckName.replace(/'/g, "\\'")}', '${d.player}')">✕</button>
                </div>
            </div>
        `;
        ul.appendChild(li);
    });
    rosterDeckView.appendChild(ul);
}

// --- INITIALIZATION ---
renderColorGrid('newPlayerColorGrid', selectedNewPlayerColor, (color) => {
    selectedNewPlayerColor = color;
});

// --- BUTTON CLICKS ---
document.getElementById('addPlayerBtn').onclick = async () => {
    const nameInput = document.getElementById('newPlayerName');
    const name = nameInput.value.trim();
    if (!name || allPlayers.some(p => p.name === name)) return;
    await addDoc(collection(db, "players"), { name, color: selectedNewPlayerColor });
    await addDoc(collection(db, "decks"), {
        player: name, deckName: "Misc", deckTags: ["General"], wins: 0, losses: 0, 
        knockouts: 0, firstBloodCount: 0, mostRampCount: 0, 
        mostDrawCount: 0, solRingOpening: 0, wentFirstCount: 0, 
        wentLastCount: 0, funCount: 0, impactCount: 0,
        funRatingTotal: 0, funRatingCount: 0
    });
    nameInput.value = '';
};

document.getElementById('addDeckBtn').onclick = async () => {
    const player = document.getElementById('playerSelect').value;
    const deckName = document.getElementById('deckName').value.trim();
    const cmdInput = document.getElementById('commanderName').value.trim();
    const checkedTags = Array.from(document.querySelectorAll('#tagSelector input:checked')).map(cb => cb.value);

    if (!player || !deckName) return;

    let commanderData = {
        name: "n/a",
        image: "",
        colorIdentity: []
    };

    // Update the Scryfall Fetch block inside document.getElementById('addDeckBtn').onclick
    if (cmdInput) {
        try {
            const response = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cmdInput)}`);
            if (response.ok) {
                const card = await response.json();

                // --- FIX: Handle Double-Faced Cards ---
                const isDoubleFaced = card.card_faces && !card.image_uris;
                const frontFace = isDoubleFaced ? card.card_faces[0] : card;
                
                commanderData = {
                    name: card.name,
                    image: frontFace.image_uris?.art_crop || "",
                    colorIdentity: card.color_identity || []
                };
                // --------------------------------------
            }
        } catch (error) {
            console.error("Scryfall lookup failed:", error);
        }
    }

    // --- Save to Firebase ---
    await addDoc(collection(db, "decks"), {
        player,
        deckName,
        commander: commanderData.name,
        commanderImage: commanderData.image,
        colorIdentity: commanderData.colorIdentity,
        deckTags: checkedTags,
        wins: 0,
        losses: 0,
        knockouts: 0,
        solRingOpening: 0,
        firstBloodCount: 0,
        mostRampCount: 0,
        mostDrawCount: 0,
        wentFirstCount: 0,
        wentLastCount: 0,
        funCount: 0,
        impactCount: 0,
        funRatingTotal: 0,
        funRatingCount: 0
    });

    // Reset UI
    document.getElementById('deckName').value = '';
    document.getElementById('commanderName').value = '';
    document.querySelectorAll('#tagSelector input').forEach(cb => cb.checked = false);
    alert(`Deck Saved with Commander: ${commanderData.name}`);
};

document.getElementById('addParticipantBtn').onclick = () => addParticipant();

document.getElementById('submitMatchBtn').onclick = async () => {
    const rows = document.querySelectorAll('#gameParticipants .card');
    if (rows.length < 2) { alert("Select at least 2 participants!"); return; }
    const hasWinner = Array.from(document.querySelectorAll('.p-win')).some(radio => radio.checked);
    if (!hasWinner) { alert("Please select a winner before submitting!"); return; }
    for (const row of rows) { if (!row.querySelector('.p-deck').value) { alert("Ensure every player has a deck selected."); return; } }
    
    // Capture the comment
    const matchComment = document.getElementById('matchComment').value.trim();

    const batch = writeBatch(db);
    const matchParticipants = [];
    
    rows.forEach(row => {
        const id = row.querySelector('.p-deck').value;
        const deckObj = allDecks.find(d => d.id === id);
        const win = row.querySelector('.p-win').checked;
        const funRating = parseInt(row.querySelector('.p-fun-rating').value) || 0;
        
        const rawKills = row.querySelector('.p-kills').value;
        const kills = rawKills === "na" ? 0 : parseInt(rawKills);
        
        matchParticipants.push({
            deckId: id, player: deckObj.player, deckName: deckObj.deckName, deckTags: deckObj.deckTags || [], win, 
            kos: rawKills === "na" ? "N/A" : kills,
            funRating: funRating,
            sol: row.querySelector('.p-sol').checked, blood: row.querySelector('.p-blood').checked,
            ramp: row.querySelector('.p-ramp').checked, draw: row.querySelector('.p-draw').checked,
            first: row.querySelector('.p-first').checked, last: row.querySelector('.p-last').checked,
            fun: row.querySelector('.p-fun').checked, impact: row.querySelector('.p-impact').checked
        });
        
        batch.update(doc(db, "decks", id), {
            wins: increment(win ? 1 : 0), losses: increment(win ? 0 : 1), 
            knockouts: increment(kills),
            funRatingTotal: increment(funRating),
            funRatingCount: increment(funRating > 0 ? 1 : 0),
            solRingOpening: increment(row.querySelector('.p-sol').checked ? 1 : 0),
            firstBloodCount: increment(row.querySelector('.p-blood').checked ? 1 : 0),
            mostRampCount: increment(row.querySelector('.p-ramp').checked ? 1 : 0),
            mostDrawCount: increment(row.querySelector('.p-draw').checked ? 1 : 0),
            wentFirstCount: increment(row.querySelector('.p-first').checked ? 1 : 0),
            wentLastCount: increment(row.querySelector('.p-last').checked ? 1 : 0),
            funCount: increment(row.querySelector('.p-fun').checked ? 1 : 0),
            impactCount: increment(row.querySelector('.p-impact').checked ? 1 : 0)
        });
    });
    
    await batch.commit();
    // Save match with the comment
    await addDoc(collection(db, "matches"), { 
        timestamp: serverTimestamp(), 
        participants: matchParticipants,
        comment: matchComment 
    });
    
    alert("Match Recorded!");

    // Reset Logic: Keep players, clear stats and comment
    document.getElementById('matchComment').value = '';
    rows.forEach(row => {
        row.querySelectorAll('input[type="radio"]').forEach(radio => radio.checked = false);
        row.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        row.querySelector('.p-kills').value = "na";
        row.querySelector('.p-fun-rating').value = "0";
    });
};

// --- MODAL TRIGGERS ---
window.handleEditPlayerTrigger = (id, name, color) => {
    let tempEditColor = color;
    const body = `
        <div style="display:flex; flex-direction:column; gap:10px; text-align:left;">
            <label style="font-size:0.75rem; color:var(--text-dim);">PLAYER NAME</label>
            <input type="text" id="editPlayerName" value="${name}" style="margin:0;">
            <label style="font-size:0.75rem; color:var(--text-dim); margin-top:10px;">PLAYER COLOR</label>
            <div id="editPlayerColorGrid" class="modern-color-grid"></div>
        </div>
    `;
    openModal(`Edit ${name}`, body, [
        { label: "Save Changes", color: "var(--accent)", onClick: () => finalizePlayerUpdate(id, name, tempEditColor) }
    ]);
    renderColorGrid('editPlayerColorGrid', color, (c) => {
        tempEditColor = c;
    });
};

async function finalizePlayerUpdate(id, oldName, newColor) {
    const newName = document.getElementById('editPlayerName').value.trim();
    if (!newName) return;
    const batch = writeBatch(db);
    batch.update(doc(db, "players", id), { name: newName, color: newColor });
    if (newName !== oldName) {
        const decksToUpdate = allDecks.filter(d => d.player === oldName);
        decksToUpdate.forEach(d => batch.update(doc(db, "decks", d.id), { player: newName }));
    }
    await batch.commit();
}

function handlePlayerDeletion(id, name) {
    openModal(`Delete Player "${name}"?`, "This will remove the player but leave decks for history.", [
        { label: "Confirm Delete", color: "var(--danger)", onClick: async () => await deleteDoc(doc(db, "players", id)) }
    ]);
}

window.handleEditMatchTrigger = async (matchId) => {
    const matchSnap = await getDoc(doc(db, "matches", matchId));
    const match = matchSnap.data();
    const actions = match.participants.map(p => ({
        label: `${p.player} (${p.deckName})`, color: p.win ? "var(--success)" : "var(--surface)",
        onClick: () => finalizeMatchEdit(matchId, p.deckId || null, p.player, p.deckName)
    }));
    openModal("Change Winner", "Select the actual winner. Stat totals will update automatically.", actions);
};

window.selectInsightDeck = (deckId) => {
    selectedInsightDeckId = deckId;
    renderInsightTab(); // Re-render to update the chart and list highlights
};


async function finalizeMatchEdit(matchId, newWinnerDeckId, playerName, deckName) {
    const batch = writeBatch(db);
    const matchRef = doc(db, "matches", matchId);
    const matchSnap = await getDoc(matchRef);
    const matchData = matchSnap.data();
    
    const oldWinner = matchData.participants.find(p => p.win === true);
    const oldWinnerId = oldWinner ? oldWinner.deckId : null;

    // 1. Update the Match History record
    const updatedParticipants = matchData.participants.map(p => ({ 
        ...p, 
        win: p.deckId === newWinnerDeckId // Use ID for certainty
    }));
    batch.update(matchRef, { participants: updatedParticipants });

    // 2. Adjust global deck stats
    if (oldWinnerId && oldWinnerId !== newWinnerDeckId) { 
        batch.update(doc(db, "decks", oldWinnerId), { wins: increment(-1), losses: increment(1) }); 
    }
    if (newWinnerDeckId && oldWinnerId !== newWinnerDeckId) { 
        batch.update(doc(db, "decks", newWinnerDeckId), { wins: increment(1), losses: increment(-1) }); 
    }
    
    await batch.commit();
}

window.handleDeckDeletionTrigger = (id, deckName, playerName) => {
    const isMisc = deckName.toLowerCase() === 'misc';
    if (isMisc) {
        openModal(`Delete "${deckName}"?`, "Permanently remove all stored stats?", [
            { label: "Delete Permanently", color: "var(--danger)", onClick: () => finalizeDeckDeletion(id, playerName, false) }
        ]);
    } else {
        openModal(`Delete "${deckName}"?`, "Merge stats into Misc or delete permanently?", [
            { label: "Merge to Misc", color: "var(--mtg-orange)", onClick: () => finalizeDeckDeletion(id, playerName, true) },
            { label: "Delete Permanently", color: "var(--danger)", onClick: () => finalizeDeckDeletion(id, playerName, false) }
        ]);
    }
};

async function finalizeDeckDeletion(id, playerName, merge) {
    if (merge) {
        const misc = allDecks.find(d => d.player === playerName && d.deckName.toLowerCase() === 'misc');
        if (misc) {
            const snap = await getDoc(doc(db, "decks", id));
            const d = snap.data();
            await updateDoc(doc(db, "decks", misc.id), {
                wins: increment(d.wins||0), losses: increment(d.losses||0), knockouts: increment(d.knockouts||0), 
                solRingOpening: increment(d.solRingOpening||0), firstBloodCount: increment(d.firstBloodCount||0),
                mostRampCount: increment(d.mostRampCount||0), mostDrawCount: increment(d.mostDrawCount||0),
                funRatingTotal: increment(d.funRatingTotal||0), funRatingCount: increment(d.funRatingCount||0),
                wentFirstCount: increment(d.wentFirstCount||0), wentLastCount: increment(d.wentLastCount||0),
                funCount: increment(d.funCount||0), impactCount: increment(d.impactCount||0)
            });
        }
    }
    await deleteDoc(doc(db, "decks", id));
}

// --- TAB NAVIGATION & MISC ---
document.getElementById('toggleTagsBtn').onclick = () => {
    tagContainer.classList.toggle('tag-selector-hidden');
    tagContainer.classList.toggle('tag-selector-visible');
};

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
        
        // Trigger specific render if Insight tab is clicked
        if (btn.dataset.tab === 'insight') {
            renderInsightTab();
        }
    };
});

window.handleEditDeckSettingsTrigger = async (deckId) => {
    const deck = allDecks.find(d => d.id === deckId);
    const currentTags = deck.deckTags || [];
    const allAvailableTags = ["Aggro", "Aristocrats", "Artifacts", "Big Mana", "Blink", "Burn", "Combo", "Control", "Group Hug", "Lands", "Lifegain", "Midrange", "Mill", "Reanimator", "Spellslinger", "Stax", "Tokens", "Tribal", "Voltron", "+1/+1 Counters", "Mono Color", "Budget", "Recursion", "Go Wide", "Goad", "Graveyard", "Enchantress", "Storm", "Theft"];

    const body = `
        <div style="text-align:left; display: flex; flex-direction: column; gap: 12px;">
            <div id="commanderPreview" style="height: 120px; border-radius: 8px; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; overflow: hidden; border: 1px solid var(--border); position: relative;">
                ${deck.commanderImage ? `<img src="${deck.commanderImage}" style="width:100%; height:100%; object-fit: cover; opacity: 0.6;">` : ''}
                <div id="previewStatus" style="position: absolute; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: white; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">
                    ${deck.commander || 'No Commander Art'}
                </div>
            </div>
            <div>
                <label style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase;">Deck Name</label>
                <input type="text" id="editDeckName" value="${deck.deckName}" style="width:100%; margin-top:5px;">
            </div>
            <div>
                <label style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase;">Commander</label>
                <div style="display: flex; gap: 5px; margin-top: 5px;">
                    <input type="text" id="editCommanderName" value="${deck.commander || ''}" placeholder="e.g. Atraxa" style="flex: 1; margin: 0;">
                    <button id="fetchCmdBtn" class="btn-blue" style="padding: 0 15px;">Search</button>
                </div>
            </div>
            <label style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; margin-top:10px;">Edit Tags</label>
            <div id="editTagGrid" class="tag-selector-grid" style="max-height: 200px; overflow-y: auto;">
                ${allAvailableTags.map(tag => `
                    <label class="tag-checkbox">
                        <span>${tag}</span>
                        <input type="checkbox" value="${tag}" ${currentTags.includes(tag) ? 'checked' : ''}>
                    </label>
                `).join('')}
            </div>
        </div>
    `;

    openModal(`Edit Deck Settings`, body, [
        { label: "Save Changes", color: "var(--success)", onClick: () => finalizeDeckUpdate(deckId) }
    ]);

    // Listener for the Live Search button
    document.getElementById('fetchCmdBtn').onclick = async () => {
        const input = document.getElementById('editCommanderName').value.trim();
        const status = document.getElementById('previewStatus');
        const preview = document.getElementById('commanderPreview');
        
        status.textContent = "Searching...";
        try {
            const response = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(input)}`);
            if (response.ok) {
                const card = await response.json();
                
                // Handle Double-Faced Cards (DFCs)
                const isDoubleFaced = card.card_faces && !card.image_uris;
                const frontFace = isDoubleFaced ? card.card_faces[0] : card;
                const artCrop = frontFace.image_uris ? frontFace.image_uris.art_crop : "";

                preview.innerHTML = `
                    <img src="${artCrop}" style="width:100%; height:100%; object-fit: cover; opacity: 0.6;">
                    <div id="previewStatus" style="position: absolute; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: #4caf50; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">
                        ✓ Found: ${card.name}
                    </div>`;
                document.getElementById('editCommanderName').value = card.name;
            } else {
                status.textContent = "Card not found";
                status.style.color = "var(--danger)";
            }
        } catch (e) {
            status.textContent = "Error fetching card";
        }
    };
};

async function finalizeDeckUpdate(deckId) {
    const newName = document.getElementById('editDeckName').value.trim();
    const newCmdName = document.getElementById('editCommanderName').value.trim();
    const checkedTags = Array.from(document.querySelectorAll('#editTagGrid input:checked')).map(cb => cb.value);
    const previewImg = document.querySelector('#commanderPreview img');
    
    if (!newName) return;

    // Use the image already displayed in the preview
    let updateData = {
        deckName: newName,
        commander: newCmdName,
        commanderImage: previewImg ? previewImg.src : "",
        deckTags: checkedTags
    };

    try {
        await updateDoc(doc(db, "decks", deckId), updateData);
        // Removed browser alert for better UX
    } catch (error) {
        console.error("Error updating deck:", error);
    }
}

function renderInsightTab() {
    const container = document.getElementById('insightMainContent');
    const backBtn = document.getElementById('backToPlayersBtn');
    const title = document.getElementById('insightTitle');

    if (!selectedInsightPlayer) {
        selectedInsightDeckId = null;
        backBtn.style.display = 'none';
        title.textContent = "Select a Player";
        container.innerHTML = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 15px; margin-top: 20px;">
            ${allPlayers.map(p => `<button class="roster-tab-btn" style="background-color: ${p.color}; border-color: ${p.color}; text-align: center; height: 80px;" onclick="selectInsightPlayer('${p.name}')">${p.name}</button>`).join('')}
        </div>`;
    } else {
        backBtn.style.display = 'block';
        title.textContent = `${selectedInsightPlayer}'s Arsenal`;
        const playerDecks = allDecks.filter(d => d.player === selectedInsightPlayer);

        container.innerHTML = `
            <div class="insight-grid">
                <div id="insightDeckList" style="display: flex; flex-direction: column; gap: 15px;">
                    ${playerDecks.map(deck => {
                        const wins = deck.wins || 0;
                        const losses = deck.losses || 0;
                        const total = wins + losses;
                        const rate = total > 0 ? ((wins / total) * 100).toFixed(0) : 0;
                        const tags = deck.deckTags || [];
                        const bgArt = deck.commanderImage ? `url(${deck.commanderImage})` : 'none';
                        
                        return `
                            <div class="deck-card ${deck.id === selectedInsightDeckId ? 'selected' : ''}" 
                                 onclick="selectInsightDeck('${deck.id}')" style="--commander-art: ${bgArt}; cursor: pointer;">
                                <div class="deck-header">
                                    <div>
                                        <h3 style="margin:0;">${deck.deckName}</h3>
                                        <div class="deck-tags-grid" style="margin-top: 5px;">
                                            ${tags.map(t => `<span class="individual-tag" style="${getTagStyle(t)}">${t}</span>`).join('')}
                                        </div>
                                    </div>
                                    <div class="win-rate-badge"><span class="win-rate-val">${rate}%</span></div>
                                </div>
                                <div class="stat-badges">
                                    <div class="stat-badge-pill pill-won">WINS <b>${wins}</b></div>
                                    <div class="stat-badge-pill" style="background: rgba(255,255,255,0.1); color: var(--text-dim);">GAMES <b>${total}</b></div>
                                    <div class="stat-badge-pill pill-kos">KILLS <b>${deck.knockouts || 0}</b></div>
                                    <div class="stat-badge-pill pill-blood">FIRST BLOOD <b>${deck.firstBloodCount || 0}</b></div>
                                    <div class="stat-badge-pill pill-ramp">MOST RAMP <b>${deck.mostRampCount || 0}</b></div>
                                    <div class="stat-badge-pill pill-draw">MOST DRAW <b>${deck.mostDrawCount || 0}</b></div>
                                    <div class="stat-badge-pill pill-first">WENT FIRST <b>${deck.wentFirstCount || 0}</b></div>
                                    <div class="stat-badge-pill pill-last">WENT LAST <b>${deck.wentLastCount || 0}</b></div>
                                    <div class="stat-badge-pill pill-fun">DID ITS THING <b>${deck.funCount || 0}</b></div>
                                    <div class="stat-badge-pill pill-impact">HIGH IMPACT <b>${deck.impactCount || 0}</b></div>
                                </div>
                            </div>`;
                    }).join('')}
                </div>
                <div class="insight-stats-card">
                    <div class="pie-chart-container" style="margin-bottom: 30px; border-bottom: 1px solid var(--border); padding-bottom: 20px;">
                        <label style="font-size:0.65rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; display:block; margin-bottom:10px; text-align:center;">Commander Color Preference</label>
                        <div style="height: 180px; position: relative;"><canvas id="colorPieChart"></canvas></div>
                    </div>
                    <div class="chart-controls">
                        <label style="font-size:0.6rem; color:var(--text-dim); text-transform:uppercase; font-weight:800;">View Stats By:</label>
                        <select id="insightStatSelect" style="margin:0;">
                            <option value="games">Total Games played</option>
                            <option value="wins">Total Wins</option>
                        </select>
                    </div>
                    <canvas id="insightChart"></canvas>
                </div>
            </div>`;

        // Draw Charts
        const currentStat = document.getElementById('insightStatSelect').value;
        initInsightChart(playerDecks, currentStat);
        initColorPieChart(playerDecks);

        document.getElementById('insightStatSelect').onchange = (e) => initInsightChart(playerDecks, e.target.value);
    }
}

// Global scope helpers for onclick
window.selectInsightPlayer = (name) => {
    selectedInsightPlayer = name;
    renderInsightTab();
};

document.getElementById('backToPlayersBtn').onclick = () => {
    selectedInsightPlayer = null;
    renderInsightTab();
};

function tryInitializeDefaultPod() {
    if (!initialPopulated && allPlayers.length > 0 && allDecks.length > 0) {
        const defaultPod = ["Ely", "Lucian", "Ryan", "Joey"];
        // Clear container first to be safe
        document.getElementById('gameParticipants').innerHTML = '';
        defaultPod.forEach(name => addParticipant(name));
        initialPopulated = true;
    }
}

let activeChart = null; // PERSISTENT BAR CHART INSTANCE

function initInsightChart(decks, stat = 'games') {
    const canvas = document.getElementById('insightChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const sortedDecks = [...decks].sort((a, b) => {
        const valA = stat === 'wins' ? (a.wins || 0) : ((a.wins || 0) + (a.losses || 0));
        const valB = stat === 'wins' ? (b.wins || 0) : ((b.wins || 0) + (b.losses || 0));
        return valB - valA;
    });

    const dataLabels = sortedDecks.map(d => d.deckName);
    const dataValues = sortedDecks.map(d => stat === 'wins' ? (d.wins || 0) : ((d.wins || 0) + (d.losses || 0)));
    
    const PALETTE = ["#3d85ff", "#ff4444", "#4caf50", "#ffeb3b", "#9c27b0", "#ff9800", "#00bcd4", "#e91e63"];
    const backgroundColors = sortedDecks.map((d, i) => {
        const baseColor = PALETTE[i % PALETTE.length];
        return selectedInsightDeckId === null ? baseColor + "cc" : (d.id === selectedInsightDeckId ? baseColor : baseColor + "22");
    });

    if (activeChart) {
        activeChart.data.labels = dataLabels;
        activeChart.data.datasets[0].data = dataValues;
        activeChart.data.datasets[0].backgroundColor = backgroundColors;
        activeChart.options.scales.y.ticks.color = (context) => {
            const deckId = sortedDecks[context.index]?.id;
            return deckId === selectedInsightDeckId ? '#ffffff' : '#8e9297';
        };
        activeChart.update();
        return;
    }

    const calculatedHeight = (sortedDecks.length * 25) + 100;
    canvas.style.height = `${calculatedHeight}px`;

    activeChart = new Chart(ctx, {
        type: 'bar',
        // REGISTER THE PLUGIN HERE
        plugins: [ChartDataLabels],
        data: {
            labels: dataLabels,
            datasets: [{
                data: dataValues,
                backgroundColor: backgroundColors,
                borderWidth: 0,
                borderRadius: 4,
                barPercentage: 0.5,
                categoryPercentage: 0.8
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 750,
                easing: 'easeInOutQuart'
            },
            scales: {
                x: { 
                    beginAtZero: true, 
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#8e9297' }
                },
                y: { 
                    grid: { display: false },
                    ticks: { 
                        color: (context) => {
                            const deckId = sortedDecks[context.index]?.id;
                            return deckId === selectedInsightDeckId ? '#ffffff' : '#8e9297';
                        },
                        font: { weight: 'bold', size: 11 } 
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: 'rgba(0,0,0,0.8)' },
                // CONFIGURE DATALABELS HERE
                datalabels: {
                    color: '#ffffff',
                    anchor: 'end',
                    align: 'right',
                    offset: 5,
                    font: {
                        weight: 'bold',
                        size: 11
                    },
                    formatter: (value) => value // Simply returns the number
                }
            }
        }
    });
}

function initColorPieChart(decks) {
    const canvas = document.getElementById('colorPieChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (activePieChart) activePieChart.destroy();

    // 1. Calculate weighted color distribution (Excluding Colorless)
    const colorTotals = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    
    decks.forEach(deck => {
        const colors = deck.colorIdentity || [];
        if (colors.length > 0) {
            const weight = 1 / colors.length;
            colors.forEach(c => {
                if (colorTotals.hasOwnProperty(c)) colorTotals[c] += weight;
            });
        }
    });

    const colorMap = {
        W: { label: 'White', color: '#f8f1d1' }, 
        U: { label: 'Blue', color: '#0e68ab' },  
        B: { label: 'Black', color: '#150b00' }, 
        R: { label: 'Red', color: '#d3202a' },   
        G: { label: 'Green', color: '#00733e' }
    };

    const labels = [];
    const data = [];
    const bgColors = [];

    Object.keys(colorTotals).forEach(key => {
        if (colorTotals[key] > 0) {
            labels.push(colorMap[key].label);
            data.push(colorTotals[key].toFixed(2));
            bgColors.push(colorMap[key].color);
        }
    });

    activePieChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: bgColors,
                borderWidth: 1,
                borderColor: 'var(--surface)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#8e9297', font: { size: 10, weight: 'bold' }, padding: 15 }
                }
            }
        }
    });
}