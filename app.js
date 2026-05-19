import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getRemoteConfig, getValue, fetchAndActivate } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-remote-config.js";
import { 
    getFirestore, collection, addDoc, doc,
    increment, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { initHistoryListener } from "./history.js";
import { initStandingsListener } from "./standings.js";
import { initInsight, renderInsightTab, getSelectedInsightPlayer } from "./player_insight.js";
import { initDatabase, updateRosterView, getSelectedRosterPlayer } from "./database.js";

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
let initialPopulated = false;



const MODERN_COLORS = [
    "#16171a", "#7f0622", "#d62411", "#ff8426", 
    "#ffd100", "#f2f3ccff", "#ff80a4", "#ff2674",
    "#94216a", "#5e1a83ff", "#234975", "#68aed4",
    "#65c227ff", "#10d275", "#007899", "#311b55ff"
];

// --- DOM ELEMENTS ---
const deckList    = document.getElementById('deckList');
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
                <select class="p-deck-enjoyment enjoyment-select">
                    <option value="0">Deck Enjoyment</option>
                    <option value="1">1 / 10</option>
                    <option value="2">2 / 10</option>
                    <option value="3">3 / 10</option>
                    <option value="4">4 / 10</option>
                    <option value="5">5 / 10</option>
                    <option value="6">6 / 10</option>
                    <option value="7">7 / 10</option>
                    <option value="8">8 / 10</option>
                    <option value="9">9 / 10</option>
                    <option value="10">10 / 10</option>
                </select>
            </div>
            <button class="remove-participant" onclick="this.parentElement.parentElement.remove()">✕</button>
        </div>
        
        <div class="participant-row line-2">
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

        refreshSharedStatDropdowns();
    };

    // Also refresh on remove
    row.querySelector('.remove-participant').addEventListener('click', () => {
        setTimeout(refreshSharedStatDropdowns, 0);
    });

    document.getElementById('gameParticipants').appendChild(row);

    if (defaultPlayerName && allPlayers.some(p => p.name === defaultPlayerName)) {
        ownerSel.value = defaultPlayerName;
        ownerSel.dispatchEvent(new Event('change'));
    }
}

// --- SHARED STAT DROPDOWNS ---
function refreshSharedStatDropdowns() {
    const rows = document.querySelectorAll('#gameParticipants .card');
    const players = [];
    rows.forEach(row => {
        const name = row.querySelector('.p-owner').value;
        if (name) players.push(name);
    });

    const makeOptions = (label) => 
        `<option value="">${label}</option>` +
        players.map(p => {
            const color = getPlayerColor(p);
            return `<option value="${p}" style="color:${color}; font-weight:bold;">${p}</option>`;
        }).join('');

    const bloodSel = document.getElementById('shared-blood');
    const rampSel  = document.getElementById('shared-ramp');
    const drawSel  = document.getElementById('shared-draw');
    const firstSel = document.getElementById('shared-first');
    const lastSel  = document.getElementById('shared-last');

    if (firstSel) firstSel.innerHTML = makeOptions('Select a user...');
    if (lastSel)  lastSel.innerHTML  = makeOptions('Select a user...');
    if (bloodSel) bloodSel.innerHTML = makeOptions('Select a user...');
    if (rampSel)  rampSel.innerHTML  = makeOptions('Select a user...');
    if (drawSel)  drawSel.innerHTML  = makeOptions('Select a user...');
}

// --- DATABASE (see database.js) ---
initDatabase(
    {
        db,
        getAllDecks:    () => allDecks,
        getAllPlayers:  () => allPlayers,
        getTagStyle,
        openModal,
        closeModal,
        renderColorGrid,
        MODERN_COLORS,
    },
    {
        onPlayersUpdated:      (players) => { allPlayers = players; },
        onAfterPlayersRender:  () => tryInitializeDefaultPod(),
    }
);

// --- STANDINGS (see standings.js) ---
initStandingsListener(
    db,
    deckList,
    document.getElementById('loading'),
    BRACKET_COLORS,
    formatBracket,
    getColorPips,
    getPlayerColor,
    getTagStyle,
    {
        onDecksUpdated: (decks) => { allDecks = decks; },
        onAfterRender:  ()      => {
            if (getSelectedRosterPlayer()) updateRosterView();
            if (getSelectedInsightPlayer()) renderInsightTab();
            tryInitializeDefaultPod();
        }
    }
);

// --- HISTORY (see history.js) ---
initHistoryListener(db, historyList, getPlayerColor, getTagStyle);

// --- PLAYER INSIGHT (see player_insight.js) ---
initInsight({
    getAllDecks:    () => allDecks,
    getAllPlayers:  () => allPlayers,
    getPlayerColor,
    getTagStyle,
    BRACKET_COLORS,
    formatBracket,
    getColorPips,
});



document.getElementById('addParticipantBtn').onclick = () => {
    addParticipant();
    refreshSharedStatDropdowns();
};

// Highlight shared stat selects when a player is chosen
['shared-first', 'shared-last', 'shared-blood', 'shared-ramp', 'shared-draw'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.addEventListener('change', () => {
        const colorMap = { 
            'shared-first': 'var(--clr-first)', 
            'shared-last':  'var(--clr-last)',
            'shared-blood': 'var(--clr-blood)', 
            'shared-ramp':  'var(--clr-ramp)', 
            'shared-draw':  'var(--clr-draw)' 
        };
        sel.style.borderColor = sel.value ? colorMap[id] : 'var(--border)';
        sel.style.color = sel.value ? 'white' : 'var(--text-dim)';
    });
});

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

    const matchComment = document.getElementById('matchComment').value.trim();
    const firstWinner = document.getElementById('shared-first')?.value || '';
    const lastWinner  = document.getElementById('shared-last')?.value  || '';
    const bloodWinner = document.getElementById('shared-blood')?.value || '';
    const rampWinner  = document.getElementById('shared-ramp')?.value  || '';
    const drawWinner  = document.getElementById('shared-draw')?.value  || '';
    const batch = writeBatch(db);
    const matchParticipants = [];

    // 3. Process Each Participant
    rows.forEach(row => {
        const id = row.querySelector('.p-deck').value;
        const deckObj = allDecks.find(d => d.id === id);
        const playerName = deckObj.player;
        
        const funRating = parseInt(row.querySelector('.p-deck-enjoyment').value) || 0;
        const isFirst = firstWinner === playerName;
        const isLast  = lastWinner  === playerName;
        const isBlood = bloodWinner === playerName;
        const isRamp  = rampWinner  === playerName;
        const isDraw  = drawWinner  === playerName;
        
        // Object for Match History
        matchParticipants.push({
            deckId: id, 
            player: playerName, 
            deckName: deckObj.deckName, 
            deckTags: deckObj.deckTags || [], 
            funRating: funRating,
            sol: row.querySelector('.p-sol').checked, 
            blood: isBlood,
            ramp: isRamp, 
            draw: isDraw,
            first: isFirst, 
            last: isLast,
        });
        
        // Update Lifetime Deck Stats
        batch.update(doc(db, "decks", id), {
            gamesPlayed: increment(1),
            funRatingTotal: increment(funRating),
            funRatingCount: increment(funRating > 0 ? 1 : 0),
            solRingOpening: increment(row.querySelector('.p-sol').checked ? 1 : 0),
            firstBloodCount: increment(isBlood ? 1 : 0),
            mostRampCount: increment(isRamp ? 1 : 0),
            mostDrawCount: increment(isDraw ? 1 : 0),
            wentFirstCount: increment(isFirst ? 1 : 0),
            wentLastCount: increment(isLast ? 1 : 0),
        });
    });
    
    // 4. Commit to Database
    await batch.commit();
    await addDoc(collection(db, "matches"), { 
        timestamp: serverTimestamp(), 
        participants: matchParticipants,
        comment: matchComment 
    });
    
    alert("Match Recorded!");

    // 5. UI Reset
    document.getElementById('matchComment').value = '';
    const sharedFirst = document.getElementById('shared-first');
    const sharedLast  = document.getElementById('shared-last');
    const sharedBlood = document.getElementById('shared-blood');
    const sharedRamp  = document.getElementById('shared-ramp');
    const sharedDraw  = document.getElementById('shared-draw');
    if (sharedFirst) sharedFirst.selectedIndex = 0;
    if (sharedLast)  sharedLast.selectedIndex  = 0;
    if (sharedBlood) sharedBlood.selectedIndex = 0;
    if (sharedRamp)  sharedRamp.selectedIndex  = 0;
    if (sharedDraw)  sharedDraw.selectedIndex  = 0;
    rows.forEach(row => {
        row.querySelectorAll('input[type="radio"]').forEach(radio => radio.checked = false);
        row.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        row.querySelector('.p-deck-enjoyment').value = "0";
    });
};


// --- TAB NAVIGATION & MISC ---
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



function tryInitializeDefaultPod() {
    if (!initialPopulated && allPlayers.length > 0 && allDecks.length > 0) {
        const defaultPod = ["Ely", "Lucian", "Ryan", "Joey"];
        // Clear container first to be safe
        document.getElementById('gameParticipants').innerHTML = '';
        defaultPod.forEach(name => addParticipant(name));
        initialPopulated = true;
    }
}

// Execute login
checkAuth().catch(err => {
    console.error("Auth failed:", err);
});