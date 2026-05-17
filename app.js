import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getRemoteConfig, getValue, fetchAndActivate } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-remote-config.js";
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
const remoteConfig = getRemoteConfig(app);
remoteConfig.settings.minimumFetchIntervalMillis = 3600000;

async function getPasswords() {
    await fetchAndActivate(remoteConfig);
    return {
        ADMIN: getValue(remoteConfig, "admin_password").asString(),
        USER: getValue(remoteConfig, "user_password").asString()
    };
}

async function checkAuth() {
    const accessLevel = sessionStorage.getItem('mtg_access_level');
    
    if (accessLevel) {
        document.body.classList.add('auth-passed');
        applyAccessRestrictions(accessLevel);
        return true;
    }

    const PASSWORDS = await getPasswords();
    const entry = prompt("Please enter password:");
    
    let level = null;
    if (entry === PASSWORDS.ADMIN) level = 'admin';
    else if (entry === PASSWORDS.USER) level = 'user';

    if (level) {
        sessionStorage.setItem('mtg_access_level', level);
        document.body.classList.add('auth-passed');
        applyAccessRestrictions(level);
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

function applyAccessRestrictions(level) {
    if (level === 'user') {
        // Hide the navigation buttons for restricted tabs
        const restrictedTabs = ['view', 'insight', 'manage', 'history'];
        restrictedTabs.forEach(tabId => {
            const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
            if (btn) btn.style.display = 'none';
        });
        document.body.classList.add('role-user');
    }
}

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

const BRACKET_COLORS = {
    "1":    "#9c27b0",
    "1.5":  "#9c27b0",
    "2":    "#3d85ff",
    "2.5":  "#3d85ff",
    "3":    "#4caf50",
    "3.5":  "#4caf50",
    "4":    "#ff7b00",
    "4.5":  "#ff7b00",
    "5":    "#ff4444"
};

// --- HELPERS ---
const getPlayerColor = (name) => {
    const player = allPlayers.find(p => p.name === name);
    return player ? player.color : "var(--accent)";
};

const formatBracket = (val) => {
    if (val == 5) return "cEDH";
    if (val && val.toString().includes('.5')) return val.toString().replace('.5', '+');
    return val || "1";
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

const getColorPips = (identity) => {
    if (!identity || identity.length === 0) return '';
    const pipMap = {
        'W': '⚪',
        'U': '🔵',
        'B': '⚫',
        'R': '🔴',
        'G': '🟢'
    };
    return identity.map(c => pipMap[c] || '').join('');
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
                <select class="p-deck-enjoyment">
                    <option value="0">Deck Enjoyment</option>
                    <option value="1">1/10</option>
                    <option value="2">2/10</option>
                    <option value="3">3/10</option>
                    <option value="4">4/10</option>
                    <option value="5">5/10</option>
                    <option value="1">6/10</option>
                    <option value="2">7/10</option>
                    <option value="3">8/10</option>
                    <option value="4">9/10</option>
                    <option value="5">10/10</option>
                </select>
            </div>
            <button class="remove-participant" onclick="this.parentElement.parentElement.remove()">✕</button>
        </div>
        
        <div class="participant-row line-2">
            <label class="stat-pill pill-blood compact-pill"><input type="radio" name="blood_owner" class="p-blood" style="display:none"> Blood</label>
            <label class="stat-pill pill-ramp compact-pill"><input type="radio" name="ramp_owner" class="p-ramp" style="display:none"> Ramp</label>
            <label class="stat-pill pill-draw compact-pill"><input type="radio" name="draw_owner" class="p-draw" style="display:none"> Draw</label>
            <label class="stat-pill pill-first compact-pill"><input type="radio" name="first_owner" class="p-first" style="display:none"> 1st</label>
            <label class="stat-pill pill-last compact-pill"><input type="radio" name="last_owner" class="p-last" style="display:none"> Last</label>
        </div>

        <div class="participant-row line-3">
            <label class="stat-pill pill-sol compact-pill"><input type="checkbox" class="p-sol" style="display:none"> Sol Ring</label>
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
        const nameA = a.deckName.toLowerCase();
        const nameB = b.deckName.toLowerCase();

        // 1. Force 'Misc' to the bottom
        if (nameA === 'misc' && nameB !== 'misc') return 1;
        if (nameB === 'misc' && nameA !== 'misc') return -1;

        // 2. Otherwise, sort alphabetically by deck name
        return nameA.localeCompare(nameB);
    });

    allDecks.forEach(deck => {
        const total = deck.gamesPlayed || ((deck.wins || 0) + (deck.losses || 0)) || 0;
        const tags = deck.deckTags || [];
        
        const li = document.createElement('li');
        li.className = 'deck-card-container';
        const bgArt = deck.commanderImage ? `url(${deck.commanderImage})` : 'none';
        li.innerHTML = `
            <div class="deck-card" style="--commander-art: ${bgArt}">
                <div class="deck-header">
                    <div>
                        <h3 style="margin:0; font-size:1.1rem;">
                            ${deck.deckName} 
                            <span style="
                                font-size: 0.65rem; 
                                color: white; 
                                background: ${BRACKET_COLORS[deck.bracket] || 'var(--accent)'}; 
                                padding: 2px 6px; 
                                border-radius: 4px; 
                                font-weight: 800; 
                                margin-left: 8px;
                                text-transform: uppercase;
                            ">
                                ${formatBracket(deck.bracket)}
                            </span>
                            <span style="margin-left: 5px; font-size: 0.9rem; letter-spacing: -2px;">
                                ${getColorPips(deck.colorIdentity)}
                            </span>
                        </h3>
                        <div style="color:${getPlayerColor(deck.player)}; font-size:0.75rem; margin-top:2px; font-weight:800; text-transform:uppercase; letter-spacing: 0.5px;">${deck.player}</div>
                        <div class="deck-tags-grid">
                            ${tags.map(t => `<span class="individual-tag" style="${getTagStyle(t)}">${t}</span>`).join('')}
                        </div>
                    </div>
                </div>
                <div class="stat-badges">
                    <div class="stat-badge-pill pill-sol">SOL RING <b>${deck.solRingOpening || 0}</b></div>
                    <div class="stat-badge-pill pill-blood">FIRST BLOOD <b>${deck.firstBloodCount || 0}</b></div>
                    <div class="stat-badge-pill pill-ramp">MOST RAMP <b>${deck.mostRampCount || 0}</b></div>
                    <div class="stat-badge-pill pill-draw">MOST DRAW <b>${deck.mostDrawCount || 0}</b></div>
                    <div class="stat-badge-pill pill-first">WENT FIRST <b>${deck.wentFirstCount || 0}</b></div>
                    <div class="stat-badge-pill pill-last">WENT LAST <b>${deck.wentLastCount || 0}</b></div>
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
                    ${match.saltScore && match.saltScore !== 'N/A' ? `
                        <div class="stat-badge-pill" style="background: var(--mtg-orange); font-size: 0.6rem;">
                            SALT: ${match.saltScore}
                        </div>` : ''}
                    
                    <div class="history-date">${match.participants.length} Players</div>
                </div>
            </div>
            <div class="history-body">
                ${match.participants.map(p => `
                    <div class="history-participant">
                        <div class="history-deck-info">
                            <span class="history-player-name" style="color:${getPlayerColor(p.player)}">${p.player}</span>
                            <span class="history-deck-name">${p.deckName}</span>
                            <div class="deck-tags-grid">
                                ${(p.deckTags || []).map(t => `<span class="individual-tag" style="${getTagStyle(t)}">${t}</span>`).join('')}
                            </div>
                        </div>
                        <div class="history-stats">
                            ${p.funRating > 0 ? `<div class="stat-badge-pill pill-enjoyment">ENJOYMENT ★ <b>${p.funRating}</b></div>` : ''}
                            ${p.sol ? `<div class="stat-badge-pill pill-sol">SOL RING</div>` : ''}
                            ${p.blood ? `<div class="stat-badge-pill pill-blood">FIRST BLOOD</div>` : ''}
                            ${p.ramp ? `<div class="stat-badge-pill pill-ramp">MOST RAMP</div>` : ''}
                            ${p.draw ? `<div class="stat-badge-pill pill-draw">MOST DRAW</div>` : ''}
                            ${p.first ? `<div class="stat-badge-pill pill-first">1ST</div>` : ''}
                            ${p.last ? `<div class="stat-badge-pill pill-last">LAST</div>` : ''}
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
        firstBloodCount: 0, mostRampCount: 0, 
        mostDrawCount: 0, solRingOpening: 0, wentFirstCount: 0, 
        funRatingTotal: 0, funRatingCount: 0,
    });
    nameInput.value = '';
};

document.getElementById('addDeckBtn').onclick = async () => {
    const player = document.getElementById('playerSelect').value;
    const deckName = document.getElementById('deckName').value.trim();
    const cmdInput = document.getElementById('commanderName').value.trim();
    const bracket = document.getElementById('deckBracket').value;
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
                const isDoubleFaced = card.card_faces && !card.image_uris;
                const frontFace = isDoubleFaced ? card.card_faces[0] : card;
                
                commanderData = {
                    name: card.name,
                    image: frontFace.image_uris?.art_crop || "",
                    colorIdentity: card.color_identity || []
                };
            }
        } catch (error) {
            console.error("Scryfall lookup failed:", error);
        }
    }

    // --- Save to Firebase ---
    await addDoc(collection(db, "decks"), {
        player,
        deckName,
        bracket: parseFloat(bracket) || 1,
        commander: commanderData.name,
        commanderImage: commanderData.image,
        colorIdentity: commanderData.colorIdentity,
        deckTags: checkedTags,
        solRingOpening: 0,
        firstBloodCount: 0,
        mostRampCount: 0,
        mostDrawCount: 0,
        wentFirstCount: 0,
        wentLastCount: 0,
        funRatingTotal: 0,
        funRatingCount: 0
    });

    // Reset UI
    document.getElementById('deckName').value = '';
    document.getElementById('commanderName').value = '';
    document.getElementById('deckBracket').value = '';
    document.querySelectorAll('#tagSelector input').forEach(cb => cb.checked = false);
    alert(`Deck Saved with Commander: ${commanderData.name}`);
};

document.getElementById('addParticipantBtn').onclick = () => addParticipant();

document.getElementById('submitMatchBtn').onclick = async () => {
    const rows = document.querySelectorAll('#gameParticipants .card');
    
    // 1. Validation Logic

    // 2. Prevent submission if decks aren't selected
    for (const row of rows) { 
        if (!row.querySelector('.p-deck').value) { 
            alert("Ensure every player has a deck selected."); 
            return; 
        } 
    }

    const saltScore = document.getElementById('matchSaltScore').value;
    const matchComment = document.getElementById('matchComment').value.trim();
    const batch = writeBatch(db);
    const matchParticipants = [];

    // 3. Process Each Participant
    rows.forEach(row => {
        const id = row.querySelector('.p-deck').value;
        const deckObj = allDecks.find(d => d.id === id);
        
        const funRating = parseInt(row.querySelector('.p-deck-enjoyment').value) || 0;
        
        // Object for Match History
        matchParticipants.push({
            deckId: id, 
            player: deckObj.player, 
            deckName: deckObj.deckName, 
            deckTags: deckObj.deckTags || [], 
            funRating: funRating,
            sol: row.querySelector('.p-sol').checked, 
            blood: row.querySelector('.p-blood').checked,
            ramp: row.querySelector('.p-ramp').checked, 
            mostDraw: row.querySelector('.p-draw').checked,
            first: row.querySelector('.p-first').checked, 
            last: row.querySelector('.p-last').checked,
        });
        
        // Update Lifetime Deck Stats
        batch.update(doc(db, "decks", id), {
            gamesPlayed: increment(1),
            funRatingTotal: increment(funRating),
            funRatingCount: increment(funRating > 0 ? 1 : 0),
            solRingOpening: increment(row.querySelector('.p-sol').checked ? 1 : 0),
            firstBloodCount: increment(row.querySelector('.p-blood').checked ? 1 : 0),
            mostRampCount: increment(row.querySelector('.p-ramp').checked ? 1 : 0),
            mostDrawCount: increment(row.querySelector('.p-draw').checked ? 1 : 0),
            wentFirstCount: increment(row.querySelector('.p-first').checked ? 1 : 0),
            wentLastCount: increment(row.querySelector('.p-last').checked ? 1 : 0),
        });
    });
    
    // 4. Commit to Database
    await batch.commit();
    await addDoc(collection(db, "matches"), { 
        timestamp: serverTimestamp(), 
        participants: matchParticipants,
        saltScore: saltScore,
        comment: matchComment 
    });
    
    alert("Match Recorded!");

    // 5. UI Reset
    document.getElementById('matchComment').value = '';
    document.getElementById('matchSaltScore').value = 'N/A';
    rows.forEach(row => {
        row.querySelectorAll('input[type="radio"]').forEach(radio => radio.checked = false);
        row.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        row.querySelector('.p-kills').value = "na";
        row.querySelector('.p-deck-enjoyment').value = "0";
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

window.selectInsightDeck = (deckId) => {
    selectedInsightDeckId = deckId;
    renderInsightTab(); // Re-render to update the chart and list highlights
};

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
                solRingOpening: increment(d.solRingOpening||0), firstBloodCount: increment(d.firstBloodCount||0),
                mostRampCount: increment(d.mostRampCount||0), mostDrawCount: increment(d.mostDrawCount||0),
                funRatingTotal: increment(d.funRatingTotal||0), funRatingCount: increment(d.funRatingCount||0),
                wentFirstCount: increment(d.wentFirstCount||0), wentLastCount: increment(d.wentLastCount||0),
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
        const level = sessionStorage.getItem('mtg_access_level'); // Added for tiered access
        const targetTab = btn.dataset.tab;

        // Prevent navigation if restricted
        if (level === 'user' && ['view', 'insight', 'manage', 'history'].includes(targetTab)) {
            return;
        }

        document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(targetTab).classList.add('active');
        
        // Trigger specific render if Insight tab is clicked
        if (targetTab === 'insight') {
            renderInsightTab();
        }
    };
});

// Edit Deck
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
            <div>
            <label style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase;">Power Bracket</label>
                <select id="editDeckBracket" style="width:100%; margin-top:5px;">
                    <option value="1" ${deck.bracket == 1 ? 'selected' : ''}>1</option>
                    <option value="1.5" ${deck.bracket == 1.5 ? 'selected' : ''}>1+</option>
                    <option value="2" ${deck.bracket == 2 ? 'selected' : ''}>2</option>
                    <option value="2.5" ${deck.bracket == 2.5 ? 'selected' : ''}>2+</option>
                    <option value="3" ${deck.bracket == 3 ? 'selected' : ''}>3</option>
                    <option value="3.5" ${deck.bracket == 3.5 ? 'selected' : ''}>3+</option>
                    <option value="4" ${deck.bracket == 4 ? 'selected' : ''}>4</option>
                    <option value="4.5" ${deck.bracket == 4.5 ? 'selected' : ''}>4+</option>
                    <option value="5" ${deck.bracket == 5 ? 'selected' : ''}>cEDH</option>
                </select>
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
                    <div id="previewStatus" 
                        data-identity='${JSON.stringify(card.color_identity)}' 
                        style="position: absolute; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: #4caf50; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">
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

// Update Deck
async function finalizeDeckUpdate(deckId) {
    const newName = document.getElementById('editDeckName').value.trim();
    const newCmdName = document.getElementById('editCommanderName').value.trim();
    const newBracket = document.getElementById('editDeckBracket').value;
    const checkedTags = Array.from(document.querySelectorAll('#editTagGrid input:checked')).map(cb => cb.value);
    const previewImg = document.querySelector('#commanderPreview img');
    
    const statusEl = document.getElementById('previewStatus');
    const newIdentity = statusEl && statusEl.dataset.identity ? JSON.parse(statusEl.dataset.identity) : null;

    if (!newName) return;

    // Use the image already displayed in the preview
    let updateData = {
        deckName: newName,
        commander: newCmdName,
        bracket: parseFloat(newBracket) || 1,
        commanderImage: previewImg ? previewImg.src : "",
        deckTags: checkedTags
    };

    if (newIdentity) {
            updateData.colorIdentity = newIdentity;
    }

    try {
        await updateDoc(doc(db, "decks", deckId), updateData);
        closeModal();
    } catch (error) {
        console.error("Error updating deck:", error);
    }
}

// ---------- Insight Tab ----------
function renderInsightTab() {
    const playerListContainer = document.getElementById('insightPlayerList');
    const detailContainer = document.getElementById('insightDetailView');
    const slider = document.getElementById('insightSlider');
    const backBtn = document.getElementById('backToPlayersBtn');
    const title = document.getElementById('insightTitle');

    // 1. ALWAYS render the selection list in the first slide
    playerListContainer.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 15px; margin-top: 20px;">
            ${allPlayers.map(p => `
                <button class="roster-tab-btn" 
                        style="background-color: ${p.color}; border-color: ${p.color}; text-align: center; height: 80px;" 
                        onclick="selectInsightPlayer('${p.name}')">
                    ${p.name}
                </button>
            `).join('')}
        </div>`;

    if (!selectedInsightPlayer) {
        selectedInsightDeckId = null;
        backBtn.style.display = 'none';
        title.textContent = "Select a Player";
        slider.classList.remove('show-detail'); // Slide back to left
        setTimeout(() => {
            if (!selectedInsightPlayer) detailContainer.innerHTML = '';
        }, 500);
    } else {
        // VIEW: PLAYER DETAILS
        backBtn.style.display = 'block';
        title.textContent = ""; 
        slider.classList.add('show-detail'); // Slide to right

        const playerDecks = allDecks.filter(d => d.player === selectedInsightPlayer);

        // Calculate Totals
        const playerStats = playerDecks.reduce((acc, d) => ({
            games: acc.games + (d.gamesPlayed || ((d.wins || 0) + (d.losses || 0)) || 0),
            blood: acc.blood + (d.firstBloodCount || 0),
            ramp: acc.ramp + (d.mostRampCount || 0),
            draw: acc.draw + (d.mostDrawCount || 0),
            first: acc.first + (d.wentFirstCount || 0),
            last: acc.last + (d.wentLastCount || 0),
        }), { games: 0, blood: 0, ramp: 0, draw: 0, first: 0, last: 0});

        const totalGames = playerStats.games || 0;
        const playerColor = getPlayerColor(selectedInsightPlayer);

        detailContainer.innerHTML = `
            <div class="card" style="margin-bottom: 25px; padding: 25px; border-left: 5px solid ${playerColor}; background: linear-gradient(90deg, var(--surface) 0%, rgba(0,0,0,0.2) 100%);">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 20px;">
                    <div>
                        <h1 style="margin: 0; font-size: 2.5rem; font-weight: 900; color: ${playerColor}; text-transform: uppercase; letter-spacing: -1px;">${selectedInsightPlayer}</h1>
                        <p style="margin: 0; color: var(--text-dim); font-weight: 800; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px;">Overall Performance</p>
                    </div>
                </div>
                <div class="stat-badges" style="margin-top: 20px; background: rgba(0,0,0,0.3); padding: 15px; gap: 10px;">
                    <div class="stat-badge-pill pill-blood">FIRST BLOOD <b>${playerStats.blood}</b></div>
                    <div class="stat-badge-pill pill-ramp">MOST RAMP <b>${playerStats.ramp}</b></div>
                    <div class="stat-badge-pill pill-draw">MOST DRAW <b>${playerStats.draw}</b></div>
                    <div class="stat-badge-pill pill-first">WENT FIRST <b>${playerStats.first}</b></div>
                    <div class="stat-badge-pill pill-last">WENT LAST <b>${playerStats.last}</b></div>
                </div>
            </div>

            <div class="insight-grid">
                <div id="insightDeckList" style="display: flex; flex-direction: column; gap: 15px;">
                    ${playerDecks.map(deck => {
                        const total = deck.gamesPlayed || ((deck.wins || 0) + (deck.losses || 0)) || 0;
                        const bgArt = deck.commanderImage ? `url(${deck.commanderImage})` : 'none';
                        const calcPct = (val) => total > 0 ? ` (${((val / total) * 100).toFixed(0)}%)` : ' (0%)';
                        return `
                            <div class="deck-card ${deck.id === selectedInsightDeckId ? 'selected' : ''}" 
                                 onclick="selectInsightDeck('${deck.id}')" style="--commander-art: ${bgArt}; cursor: pointer;">
                                <div class="deck-header">
                                    <div>
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <h3 style="margin:0; font-size:1.5rem; display: flex; align-items: center;">
                                                ${deck.deckName} 
                                                <span style="font-size: 1.0rem; color: white; background: ${BRACKET_COLORS[deck.bracket] || 'var(--accent)'}; padding: 1px 5px; border-radius: 4px; margin-left: 8px;">
                                                    ${formatBracket(deck.bracket)}
                                                </span>
                                                <span style="margin-left: 10px; font-size: 1.2rem; letter-spacing: -3px;">
                                                    ${getColorPips(deck.colorIdentity)}
                                                </span>
                                            </h3>
                                            <div class="player-controls">
                                                <button class="player-edit-btn" onclick="event.stopPropagation(); handleEditDeckSettingsTrigger('${deck.id}')">✏️</button>
                                            </div>
                                        </div>
                                        <div class="deck-tags-grid" style="margin-top: 5px;">
                                            ${(deck.deckTags || []).map(t => `<span class="individual-tag" style="${getTagStyle(t)}">${t}</span>`).join('')}
                                        </div>
                                    </div>
                                </div>
                                <div class="stat-badges">
                                    <div class="stat-badge-pill" style="background:rgba(255,255,255,0.1);">GAMES <b>${total}</b></div>
                                    <div class="stat-badge-pill pill-blood">BLOOD <b>${deck.firstBloodCount || 0}${calcPct(deck.firstBloodCount)}</b></div>
                                    <div class="stat-badge-pill pill-ramp">RAMP <b>${deck.mostRampCount || 0}${calcPct(deck.mostRampCount)}</b></div>
                                    <div class="stat-badge-pill pill-draw">MOST DRAW <b>${deck.mostDrawCount || 0}${calcPct(deck.mostDrawCount)}</b></div>
                                    <div class="stat-badge-pill pill-first">1ST <b>${deck.wentFirstCount || 0}${calcPct(deck.wentFirstCount)}</b></div>
                                    <div class="stat-badge-pill pill-last">LAST <b>${deck.wentLastCount || 0}${calcPct(deck.wentLastCount)}</b></div>
                                </div>
                            </div>`;
                    }).join('')}
                </div>
                <div class="insight-stats-card">
                    <div class="pie-chart-container" style="margin-bottom: 30px; border-bottom: 1px solid var(--border); padding-bottom: 20px;">
                        <label style="font-size:0.65rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; display:block; margin-bottom:10px; text-align:center;">Color Preference</label>
                        <div style="height: 180px; position: relative;"><canvas id="colorPieChart"></canvas></div>
                    </div>
                    <div class="chart-controls">
                        <select id="insightStatSelect" style="margin:0;">
                            <option value="games">Total Games played</option>
                        </select>
                    </div>
                    <canvas id="insightChart"></canvas>
                </div>
            </div>`;

        // Initialize Charts
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

let activeChart = null;

function initInsightChart(decks, stat = 'games') {
    const canvas = document.getElementById('insightChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Destroy existing chart if present
    if (activeChart) {
        activeChart.destroy();
        activeChart = null;
    }

    // Prepare Data
    const sortedDecks = [...decks].sort((a, b) => {
        const valA = a.gamesPlayed || ((a.wins || 0) + (a.losses || 0)) || 0;
        const valB = b.gamesPlayed || ((b.wins || 0) + (b.losses || 0)) || 0;
        return valB - valA;
    });

    const dataLabels = sortedDecks.map(d => d.deckName);
    const dataValues = sortedDecks.map(d => d.gamesPlayed || ((d.wins || 0) + (d.losses || 0)) || 0);
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

    const calculatedHeight = (sortedDecks.length * 35) + 100;
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

    // Destroy old pie chart before recreating
    if (activePieChart) {
        activePieChart.destroy();
        activePieChart = null;
    }

    // 1. Calculate weighted color distribution (Excluding Colorless)
    const colorTotals = { W: 0, U: 0, B: 0, R: 0, G: 0 };

    decks.forEach(deck => {
        const colors = deck.colorIdentity || [];
        if (colors.length > 0) {
            const weight = 1 / colors.length;
            colors.forEach(c => {
                if (colorTotals.hasOwnProperty(c)) {
                    colorTotals[c] += weight;
                }
            });
        }
    });

    const colorMap = {
        W: { label: 'White', color: '#f8f1d1' }, 
        U: { label: 'Blue', color: '#007dddff' },  
        B: { label: 'Black', color: '#0f0801ff' }, 
        R: { label: 'Red', color: '#ca0912ff' },   
        G: { label: 'Green', color: '#049931ff' }
    };

    const labels = [];
    const data = [];
    const bgColors = [];

    Object.keys(colorTotals).forEach(key => {
        if (colorTotals[key] > 0) {
            labels.push(colorMap[key].label);
            data.push(parseFloat(colorTotals[key].toFixed(2)));
            bgColors.push(colorMap[key].color);
        }
    });

    if (data.length > 0) {
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
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const value = context.raw || 0;
                                const total = context.dataset.data.reduce((acc, curr) => acc + curr, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                return `${percentage}%`;
                            }
                        }
                    }
                }
            }
        });
    }
}

// Execute login
checkAuth().catch(err => {
    console.error("Auth failed:", err);
});