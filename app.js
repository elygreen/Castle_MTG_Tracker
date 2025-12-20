import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot, 
    increment, query, orderBy, writeBatch, getDoc, updateDoc, limit, serverTimestamp 
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

// State
let allDecks = [];
let allPlayers = [];
let selectedRosterPlayer = null;

const deckList = document.getElementById('deckList');
const playerSelect = document.getElementById('playerSelect');
const tagContainer = document.getElementById('tagSelectorContainer');
const rosterTabs = document.getElementById('rosterTabs');
const rosterDeckView = document.getElementById('rosterDeckList');
const historyList = document.getElementById('matchHistoryList');

// Modal Elements
const customModal = document.getElementById('customModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalActions = document.getElementById('modalActions');

function openModal(title, body, actions) {
    modalTitle.textContent = title;
    modalBody.textContent = body;
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

// --- 1. Listeners ---
onSnapshot(query(collection(db, "players"), orderBy("name", "asc")), (snapshot) => {
    const rawPlayers = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
    allPlayers = rawPlayers.map(p => p.name);
    playerSelect.innerHTML = '<option value="" disabled selected>Owner...</option>';
    rosterTabs.innerHTML = '';
    rawPlayers.forEach(p => {
        playerSelect.innerHTML += `<option value="${p.name}">${p.name}</option>`;
        const container = document.createElement('div');
        container.className = 'player-tab-container';
        const btn = document.createElement('button');
        btn.className = `roster-tab-btn ${selectedRosterPlayer === p.name ? 'active' : ''}`;
        btn.textContent = p.name;
        btn.onclick = () => {
            selectedRosterPlayer = p.name;
            updateRosterView();
            document.querySelectorAll('.roster-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        };
        const delBtn = document.createElement('button');
        delBtn.className = 'player-del-btn';
        delBtn.textContent = '✕';
        delBtn.onclick = (e) => { e.stopPropagation(); handlePlayerDeletion(p.id, p.name); };
        container.appendChild(btn);
        container.appendChild(delBtn);
        rosterTabs.appendChild(container);
    });
});

onSnapshot(query(collection(db, "decks"), orderBy("wins", "desc")), (snapshot) => {
    document.getElementById('loading').style.display = 'none';
    deckList.innerHTML = '';
    allDecks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    allDecks.forEach(deck => {
        const total = (deck.wins || 0) + (deck.losses || 0);
        const rate = total > 0 ? ((deck.wins / total) * 100).toFixed(0) : 0;
        const tags = deck.deckTags || [];
        const li = document.createElement('li');
        li.className = 'deck-card';
        li.innerHTML = `
            <div class="deck-header">
                <div>
                    <h3 style="margin:0; font-size:1rem;">${deck.deckName}</h3>
                    <div class="deck-tags-container">${tags.map(t => `<span class="deck-tag">${t}</span>`).join('')}</div>
                    <div style="color:var(--text-dim); font-size:0.75rem; margin-top:4px;">${deck.player}</div>
                </div>
                <div class="win-rate">${rate}% Win</div>
            </div>
            <div class="stat-badges">
                <div class="stat-badge-pill pill-won">WON <b>${deck.wins || 0}</b></div>
                <div class="stat-badge-pill pill-kos">KOS <b>${deck.knockouts || 0}</b></div>
                <div class="stat-badge-pill pill-sol">SOL <b>${deck.solRingOpening || 0}</b></div>
                <div class="stat-badge-pill pill-blood">BLD <b>${deck.firstBloodCount || 0}</b></div>
                <div class="stat-badge-pill pill-ramp">RMP <b>${deck.mostRampCount || 0}</b></div>
                <div class="stat-badge-pill pill-draw">DRW <b>${deck.mostDrawCount || 0}</b></div>
                <div class="stat-badge-pill pill-first">1ST <b>${deck.wentFirstCount || 0}</b></div>
                <div class="stat-badge-pill pill-last">LST <b>${deck.wentLastCount || 0}</b></div>
                <div class="stat-badge-pill pill-fun">FUN <b>${deck.funCount || 0}</b></div>
                <div class="stat-badge-pill pill-impact">IMP <b>${deck.impactCount || 0}</b></div>
            </div>
        `;
        deckList.appendChild(li);
    });
    if (selectedRosterPlayer) updateRosterView();
});

// Listen for Match History
onSnapshot(query(collection(db, "matches"), orderBy("timestamp", "desc"), limit(20)), (snapshot) => {
    historyList.innerHTML = '';
    snapshot.docs.forEach(doc => {
        const match = doc.data();
        const dateStr = match.timestamp ? match.timestamp.toDate().toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : 'Just now';
        
        const card = document.createElement('div');
        card.className = 'history-card';
        card.innerHTML = `
            <div class="history-header">
                <div class="history-date">${dateStr}</div>
                <div class="history-date">${match.participants.length} Players</div>
            </div>
            <div class="history-body">
                ${match.participants.map(p => `
                    <div class="history-participant">
                        <div class="history-deck-info">
                            <span class="history-player-name">${p.player}</span>
                            <span class="history-deck-name">${p.deckName}</span>
                        </div>
                        <div class="history-stats">
                            ${p.win ? '<div class="stat-badge-pill pill-won" style="padding: 2px 4px;">WIN</div>' : ''}
                            ${p.kos > 0 ? `<div class="stat-badge-pill pill-kos">KOS <b>${p.kos}</b></div>` : ''}
                            ${p.sol ? `<div class="stat-badge-pill pill-sol">SOL</div>` : ''}
                            ${p.blood ? `<div class="stat-badge-pill pill-blood">BLD</div>` : ''}
                        </div>
                    </div>
                `).join('')}
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
        const isMisc = d.deckName.toLowerCase() === 'misc';
        li.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <div style="font-weight: 700;">${d.deckName}</div>
                    <div class="roster-tag-container">${(d.deckTags || []).map(t => `<span class="roster-tag-orange">${t}</span>`).join('')}</div>
                </div>
                ${!isMisc ? `<button class="delete-btn-sm" onclick="handleDeckDeletionTrigger('${d.id}', '${d.deckName}', '${d.player}')">Delete</button>` : ''}
            </div>
        `;
        ul.appendChild(li);
    });
    rosterDeckView.appendChild(ul);
}

// --- 2. Actions ---
document.getElementById('addPlayerBtn').onclick = async () => {
    const nameInput = document.getElementById('newPlayerName');
    const name = nameInput.value.trim();
    if (!name || allPlayers.includes(name)) return;
    await addDoc(collection(db, "players"), { name });
    await addDoc(collection(db, "decks"), {
        player: name, deckName: "Misc", deckTags: ["General"], wins: 0, losses: 0, 
        knockouts: 0, firstBloodCount: 0, mostRampCount: 0, 
        mostDrawCount: 0, solRingOpening: 0, wentFirstCount: 0, 
        wentLastCount: 0, funCount: 0, impactCount: 0
    });
    nameInput.value = '';
};

document.getElementById('addDeckBtn').onclick = async () => {
    const player = document.getElementById('playerSelect').value;
    const deckNameInput = document.getElementById('deckName');
    const deckName = deckNameInput.value.trim();
    const checkedTags = Array.from(document.querySelectorAll('#tagSelector input:checked')).map(cb => cb.value);
    if (!player || !deckName) return;
    await addDoc(collection(db, "decks"), {
        player, deckName, deckTags: checkedTags, wins: 0, losses: 0, 
        knockouts: 0, firstBloodCount: 0, mostRampCount: 0, 
        mostDrawCount: 0, solRingOpening: 0, wentFirstCount: 0, 
        wentLastCount: 0, funCount: 0, impactCount: 0
    });
    deckNameInput.value = '';
    document.querySelectorAll('#tagSelector input').forEach(cb => cb.checked = false);
};

document.getElementById('addParticipantBtn').onclick = () => {
    const row = document.createElement('div');
    row.className = 'card';
    row.style.background = 'rgba(0,0,0,0.2)';
    row.innerHTML = `
        <div class="participant-header">
            <label class="won-toggle"><input type="radio" name="winner" class="p-win" style="display:none">WON</label>
            <div style="display: flex; gap: 4px; flex: 2;">
                <select class="p-owner" style="margin:0; flex:1; font-size: 11px;">
                    <option value="" disabled selected>Player...</option>
                    ${allPlayers.map(p => `<option value="${p}">${p}</option>`).join('')}
                </select>
                <select class="p-deck" style="margin:0; flex:1.5; font-size: 11px;"><option value="" disabled selected>Select Deck...</option></select>
            </div>
            <div class="ko-badge"><span>KO'S</span><input type="number" class="p-kills" value="0" min="0" max="9"></div>
            <button onclick="this.parentElement.parentElement.remove()" style="background:none; color:var(--danger); cursor:pointer;">✕</button>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:4px;">
            <label class="stat-pill pill-sol"><input type="checkbox" class="p-sol"> Sol Ring</label>
            <label class="stat-pill pill-blood"><input type="checkbox" class="p-blood"> Blood</label>
            <label class="stat-pill pill-ramp"><input type="checkbox" class="p-ramp"> Most Ramp</label>
            <label class="stat-pill pill-draw"><input type="checkbox" class="p-draw"> Most Draw</label>
            <label class="stat-pill pill-first"><input type="checkbox" class="p-first"> 1st</label>
            <label class="stat-pill pill-last"><input type="checkbox" class="p-last"> Last</label>
            <label class="stat-pill pill-fun"><input type="checkbox" class="p-fun"> Fun</label>
            <label class="stat-pill pill-impact"><input type="checkbox" class="p-impact"> Impact</label>
        </div>
    `;
    const ownerSel = row.querySelector('.p-owner');
    const deckSel = row.querySelector('.p-deck');
    ownerSel.onchange = () => {
        let filtered = allDecks.filter(d => d.player === ownerSel.value);
        filtered.sort((a,b) => a.deckName === 'Misc' ? 1 : b.deckName === 'Misc' ? -1 : a.deckName.localeCompare(b.deckName));
        deckSel.innerHTML = '<option value="" disabled selected>Select Deck...</option>' + 
            filtered.map(d => `<option value="${d.id}">${d.deckName}</option>`).join('');
    };
    document.getElementById('gameParticipants').appendChild(row);
};

document.getElementById('submitMatchBtn').onclick = async () => {
    const rows = document.querySelectorAll('#gameParticipants .card');
    if (rows.length < 2) return;
    const batch = writeBatch(db);
    const matchParticipants = [];

    rows.forEach(row => {
        const id = row.querySelector('.p-deck').value;
        const deckObj = allDecks.find(d => d.id === id);
        const win = row.querySelector('.p-win').checked;
        const kills = parseInt(row.querySelector('.p-kills').value) || 0;
        
        if (!id) return;

        matchParticipants.push({
            player: deckObj.player,
            deckName: deckObj.deckName,
            win,
            kos: kills,
            sol: row.querySelector('.p-sol').checked,
            blood: row.querySelector('.p-blood').checked
        });

        batch.update(doc(db, "decks", id), {
            wins: increment(win ? 1 : 0),
            losses: increment(win ? 0 : 1),
            knockouts: increment(kills),
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
    await addDoc(collection(db, "matches"), {
        timestamp: serverTimestamp(),
        participants: matchParticipants
    });
    
    document.getElementById('gameParticipants').innerHTML = '';
    alert("Match Recorded!");
};

// Deletion Handlers
window.handleDeckDeletionTrigger = (id, deckName, playerName) => {
    openModal(`Delete "${deckName}"?`, "Merge stats into Misc or delete permanently?", [
        { label: "Merge to Misc", color: "var(--mtg-orange)", onClick: () => finalizeDeckDeletion(id, playerName, true) },
        { label: "Delete Permanently", color: "var(--danger)", onClick: () => finalizeDeckDeletion(id, playerName, false) }
    ]);
};
async function finalizeDeckDeletion(id, playerName, merge) {
    if (merge) {
        const misc = allDecks.find(d => d.player === playerName && d.deckName.toLowerCase() === 'misc');
        if (misc) {
            const snap = await getDoc(doc(db, "decks", id));
            const data = snap.data();
            await updateDoc(doc(db, "decks", misc.id), {
                wins: increment(data.wins||0), knockouts: increment(data.knockouts||0), solRingOpening: increment(data.solRingOpening||0)
                // Add more as needed...
            });
        }
    }
    await deleteDoc(doc(db, "decks", id));
}
function handlePlayerDeletion(id, name) {
    openModal(`Delete Player "${name}"?`, "Proceed?", [
        { label: "Confirm Delete", color: "var(--danger)", onClick: async () => await deleteDoc(doc(db, "players", id)) }
    ]);
}

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