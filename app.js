import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot, 
    increment, query, orderBy, writeBatch 
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
        delBtn.onclick = (e) => {
            e.stopPropagation();
            deletePlayer(p.id, p.name);
        };

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
        const tagHtml = tags.map(tag => `<span class="deck-tag">${tag}</span>`).join('');

        const li = document.createElement('li');
        li.className = 'deck-card';
        li.innerHTML = `
            <div class="deck-header">
                <div>
                    <h3 style="margin:0; font-size:1rem;">${deck.deckName}</h3>
                    <div class="deck-tags-container">${tagHtml}</div>
                    <div style="color:var(--text-dim); font-size:0.75rem; margin-top:4px;">${deck.player}</div>
                </div>
                <div class="win-rate">${rate}% Win</div>
            </div>
            <div class="stat-badges">
                <div class="stat-item">🏆 <b>${deck.wins || 0}</b></div>
                <div class="stat-item">💀 <b>${deck.knockouts || 0}</b></div>
                <div class="stat-item">💍 <b>${deck.solRingOpening || 0}</b></div>
                <div class="stat-item">🩸 <b>${deck.firstBloodCount || 0}</b></div>
                <div class="stat-item">🌱 <b>${deck.mostRampCount || 0}</b></div>
                <div class="stat-item">🃏 <b>${deck.mostDrawCount || 0}</b></div>
                <div class="stat-item">🔼 <b>${deck.wentFirstCount || 0}</b></div>
                <div class="stat-item">🔽 <b>${deck.wentLastCount || 0}</b></div>
                <div class="stat-item">💖 <b>${deck.funCount || 0}</b></div>
                <div class="stat-item">⚡ <b>${deck.impactCount || 0}</b></div>
            </div>
        `;
        deckList.appendChild(li);
    });
    if (selectedRosterPlayer) updateRosterView();
});

function updateRosterView() {
    const decks = allDecks.filter(d => d.player === selectedRosterPlayer);
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
        const tagSpans = (d.deckTags || []).map(tag => `<span class="roster-tag-orange">${tag}</span>`).join('');
        li.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <div style="font-weight: 700;">${d.deckName}</div>
                    <div class="roster-tag-container">${tagSpans}</div>
                </div>
                <button class="delete-btn-sm" onclick="deleteDeck('${d.id}', '${d.deckName}')">Delete</button>
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
    if (!name || allPlayers.some(n => n.toLowerCase() === name.toLowerCase())) return;
    await addDoc(collection(db, "players"), { name });
    nameInput.value = '';
};

document.getElementById('addDeckBtn').onclick = async () => {
    const player = playerSelect.value;
    const deckNameInput = document.getElementById('deckName');
    const deckName = deckNameInput.value.trim();
    const checkedTags = Array.from(document.querySelectorAll('#tagSelector input:checked')).map(cb => cb.value);
    
    if (!player || !deckName) return alert("Missing info!");
    if (allDecks.some(d => d.player === player && d.deckName.toLowerCase() === deckName.toLowerCase())) return alert("Duplicate!");

    await addDoc(collection(db, "decks"), {
        player, deckName, deckTags: checkedTags, wins: 0, losses: 0, 
        knockouts: 0, firstBloodCount: 0, mostRampCount: 0, 
        mostDrawCount: 0, solRingOpening: 0, wentFirstCount: 0, 
        wentLastCount: 0, funCount: 0, impactCount: 0
    });
    
    deckNameInput.value = '';
    document.querySelectorAll('#tagSelector input').forEach(cb => cb.checked = false);
    tagContainer.classList.add('tag-selector-hidden');
};

document.getElementById('toggleTagsBtn').onclick = () => {
    tagContainer.classList.toggle('tag-selector-hidden');
    tagContainer.classList.toggle('tag-selector-visible');
};

document.getElementById('addParticipantBtn').onclick = () => {
    const row = document.createElement('div');
    row.className = 'card';
    row.style.background = 'rgba(0,0,0,0.2)';
    row.innerHTML = `
        <div class="participant-header">
            <label class="won-toggle">
                <input type="radio" name="winner" class="p-win" style="display:none">
                WON
            </label>
            
            <div style="display: flex; gap: 4px; flex: 2;">
                <select class="p-owner" style="margin:0; flex:1; font-size: 11px;">
                    <option value="" disabled selected>Player...</option>
                    ${allPlayers.map(p => `<option value="${p}">${p}</option>`).join('')}
                </select>

                <select class="p-deck" style="margin:0; flex:1.5; font-size: 11px;">
                    <option value="" disabled selected>Select Deck...</option>
                </select>
            </div>

            <div class="ko-badge" title="Player Knockouts">
                <span>KO'S</span>
                <input type="number" class="p-kills" value="0" min="0" max="9">
            </div>

            <button onclick="this.parentElement.parentElement.remove()" style="background:none; color:var(--danger); padding:0; font-size:1rem; cursor:pointer;">✕</button>
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

    const ownerSelect = row.querySelector('.p-owner');
    const deckSelect = row.querySelector('.p-deck');

    ownerSelect.onchange = () => {
        const filteredDecks = allDecks.filter(d => d.player === ownerSelect.value);
        deckSelect.innerHTML = '<option value="" disabled selected>Select Deck...</option>' + 
            filteredDecks.map(d => `<option value="${d.id}">${d.deckName}</option>`).join('');
    };

    document.getElementById('gameParticipants').appendChild(row);
};

document.getElementById('submitMatchBtn').onclick = async () => {
    const rows = document.querySelectorAll('#gameParticipants .card');
    if (rows.length < 2) return alert("Select at least 2 decks!");
    const batch = writeBatch(db);
    rows.forEach(row => {
        const id = row.querySelector('.p-deck').value;
        const win = row.querySelector('.p-win').checked;
        if (!id) return;
        batch.update(doc(db, "decks", id), {
            wins: increment(win ? 1 : 0),
            losses: increment(win ? 0 : 1),
            knockouts: increment(parseInt(row.querySelector('.p-kills').value) || 0),
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
    document.getElementById('gameParticipants').innerHTML = '';
    alert("Match Recorded!");
};

window.deleteDeck = async (id, name) => {
    if(confirm(`Are you sure you want to delete the deck "${name}"?`)) {
        await deleteDoc(doc(db, "decks", id));
    }
};

async function deletePlayer(id, name) {
    if(confirm(`Are you sure you want to delete player "${name}"? This will not delete their decks automatically.`)) {
        await deleteDoc(doc(db, "players", id));
        if (selectedRosterPlayer === name) {
            selectedRosterPlayer = null;
            rosterDeckView.innerHTML = '<p style="color: var(--text-dim); font-size: 0.8rem; text-align: center;">Select a player to view their decks.</p>';
        }
    }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
    };
});