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

    // FIXED: Simplified initialization check to prevent double-spawning
    if (!initialPopulated && allPlayers.length > 0 && allDecks.length > 0) {
        const defaultPod = ["Ely", "Lucian", "Ryan", "Joey"];
        defaultPod.forEach(name => addParticipant(name));
        initialPopulated = true;
    }
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
        li.innerHTML = `
            <div class="deck-card">
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
                    <div class="stat-badge-pill pill-won">WON <b>${wins}</b></div>
                    <div class="stat-badge-pill pill-kos">KOS <b>${deck.knockouts || 0}</b></div>
                    <div class="stat-badge-pill pill-sol">SOL <b>${deck.solRingOpening || 0}</b></div>
                    <div class="stat-badge-pill pill-blood">BLD <b>${deck.firstBloodCount || 0}</b></div>
                    <div class="stat-badge-pill pill-ramp">RMP <b>${deck.mostRampCount || 0}</b></div>
                    <div class="stat-badge-pill pill-draw">DRW <b>${deck.mostDrawCount || 0}</b></div>
                    <div class="stat-badge-pill pill-first">1ST <b>${deck.wentFirstCount || 0}</b></div>
                    <div class="stat-badge-pill pill-last">LST <b>${deck.wentLastCount || 0}</b></div>
                    <div class="stat-badge-pill pill-fun">FUN <b>${deck.funCount || 0}</b></div>
                    <div class="stat-badge-pill pill-impact">HI-IMP <b>${deck.impactCount || 0}</b></div>
                </div>
            </div>
        `;
        deckList.appendChild(li);
    });
    if (selectedRosterPlayer) updateRosterView();
    
    // FIXED: Catch initialization if decks load after players
    if (!initialPopulated && allPlayers.length > 0 && allDecks.length > 0) {
        const defaultPod = ["Ely", "Lucian", "Ryan", "Joey"];
        defaultPod.forEach(name => addParticipant(name));
        initialPopulated = true;
    }
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
                            ${p.sol ? `<div class="stat-badge-pill pill-sol">SOL</div>` : ''}
                            ${p.blood ? `<div class="stat-badge-pill pill-blood">BLD</div>` : ''}
                            ${p.ramp ? `<div class="stat-badge-pill pill-ramp">RMP</div>` : ''}
                            ${p.draw ? `<div class="stat-badge-pill pill-draw">DRW</div>` : ''}
                            ${p.first ? `<div class="stat-badge-pill pill-first">1ST</div>` : ''}
                            ${p.last ? `<div class="stat-badge-pill pill-last">LST</div>` : ''}
                            ${p.fun ? `<div class="stat-badge-pill pill-fun">DID IT</div>` : ''}
                            ${p.impact ? `<div class="stat-badge-pill pill-impact">HI-IMP</div>` : ''}
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
                    <button class="player-edit-btn" onclick="handleEditDeckTagsTrigger('${d.id}', '${d.deckName.replace(/'/g, "\\'")}')">✏️</button>
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
    const deckNameInput = document.getElementById('deckName');
    const deckName = deckNameInput.value.trim();
    const checkedTags = Array.from(document.querySelectorAll('#tagSelector input:checked')).map(cb => cb.value);
    if (!player || !deckName) return;
    if (deckName.toLowerCase() === 'misc') { alert("Cannot manually create 'Misc'."); return; }
    if (allDecks.some(d => d.player === player && d.deckName.toLowerCase() === deckName.toLowerCase())) return;
    await addDoc(collection(db, "decks"), {
        player, deckName, deckTags: checkedTags, wins: 0, losses: 0, 
        knockouts: 0, firstBloodCount: 0, mostRampCount: 0, 
        mostDrawCount: 0, solRingOpening: 0, wentFirstCount: 0, 
        wentLastCount: 0, funCount: 0, impactCount: 0,
        funRatingTotal: 0, funRatingCount: 0
    });
    deckNameInput.value = '';
    document.querySelectorAll('#tagSelector input').forEach(cb => cb.checked = false);
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

async function finalizeMatchEdit(matchId, newWinnerDeckId, playerName, deckName) {
    const batch = writeBatch(db);
    const matchRef = doc(db, "matches", matchId);
    const matchSnap = await getDoc(matchRef);
    const matchData = matchSnap.data();
    const oldWinner = matchData.participants.find(p => p.win === true);
    let oldWinnerId = oldWinner ? oldWinner.deckId : null;
    let targetNewId = newWinnerDeckId;
    const updatedParticipants = matchData.participants.map(p => ({ ...p, win: (p.player === playerName && p.deckName === deckName) }));
    batch.update(matchRef, { participants: updatedParticipants });
    if (oldWinnerId && oldWinnerId !== targetNewId) { batch.update(doc(db, "decks", oldWinnerId), { wins: increment(-1), losses: increment(1) }); }
    if (targetNewId && oldWinnerId !== targetNewId) { batch.update(doc(db, "decks", targetNewId), { wins: increment(1), losses: increment(-1) }); }
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
    };
});

window.handleEditDeckTagsTrigger = async (deckId, deckName) => {
    const deck = allDecks.find(d => d.id === deckId);
    const currentTags = deck.deckTags || [];
    
    // Get all possible tags from the existing UI list
    const allAvailableTags = [
        "Aggro",        "Aristocrats",  "Artifacts",    "Big Mana",
        "Blink",        "Burn",         "Combo",        "Control",
        "Group Hug",    "Lands",        "Lifegain",     "Midrange", 
        "Mill",         "Reanimator",   "Spellslinger", "Stax",    
        "Tokens",       "Tribal",       "Voltron",      "+1/+1 Counters",
        "Mono Color",   "Budget",       "Recursion",    "Go Wide",
        "Goad",         "Graveyard",    "Enchantress",  "Storm",
        "Theft"
    ];

    // Inside handleEditDeckTagsTrigger function
    const body = `
        <div style="text-align:left;">
            <p style="font-size:0.8rem; color:var(--text-dim); margin-bottom:15px;">Update tags for <b>${deckName}</b></p>
            <div id="editTagGrid" class="tag-selector-grid">
                ${allAvailableTags.map(tag => `
                    <label class="tag-checkbox">
                        <span>${tag}</span>
                        <input type="checkbox" value="${tag}" ${currentTags.includes(tag) ? 'checked' : ''}>
                    </label>
                `).join('')}
            </div>
        </div>
    `;

    openModal(`Edit Tags`, body, [
        { 
            label: "Save Tags", 
            color: "var(--success)", 
            onClick: () => finalizeDeckTagUpdate(deckId) 
        }
    ]);
};

async function finalizeDeckTagUpdate(deckId) {
    const checkedTags = Array.from(document.querySelectorAll('#editTagGrid input:checked'))
                            .map(cb => cb.value);
    
    try {
        await updateDoc(doc(db, "decks", deckId), {
            deckTags: checkedTags
        });
    } catch (error) {
        console.error("Error updating tags: ", error);
        alert("Failed to update tags.");
    }
}