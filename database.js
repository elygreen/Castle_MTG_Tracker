/**
 * database.js
 * Handles all "Database" tab logic for the Castle MTG Stat Tracker:
 *   - Players snapshot listener (roster tabs, add / edit / delete player)
 *   - Add deck (with Scryfall lookup)
 *   - Edit deck settings modal (with live Scryfall search)
 *   - Delete deck (merge-to-Misc or permanent)
 *   - Roster deck list view
 *   - New-player colour grid initialisation
 *   - Tag selector toggle
 * Imported by app.js — do not load independently.
 */

import {
    collection, addDoc, deleteDoc, doc, onSnapshot,
    increment, query, orderBy, writeBatch, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------
let _db             = null;
let _getAllDecks     = null;
let _getAllPlayers   = null;
let _getTagStyle     = null;
let _openModal      = null;
let _closeModal     = null;
let _renderColorGrid = null;
let _MODERN_COLORS  = null;

let selectedRosterPlayer   = null;
let selectedNewPlayerColor = "#3d85ff";

// ---------------------------------------------------------------------------
// Public init
// ---------------------------------------------------------------------------

/**
 * Wire up the module. Call once from app.js after db is ready.
 *
 * @param {Object} deps
 * @param {import("firebase/firestore").Firestore} deps.db
 * @param {() => Object[]}   deps.getAllDecks
 * @param {() => Object[]}   deps.getAllPlayers
 * @param {(tag) => string}  deps.getTagStyle
 * @param {Function}         deps.openModal
 * @param {Function}         deps.closeModal
 * @param {Function}         deps.renderColorGrid
 * @param {string[]}         deps.MODERN_COLORS
 * @param {Object}           [callbacks]
 * @param {Function}         [callbacks.onPlayersUpdated]  - (players) => void  — lets app.js sync allPlayers
 * @param {Function}         [callbacks.onAfterPlayersRender] - () => void      — e.g. tryInitializeDefaultPod
 */
export function initDatabase(deps, { onPlayersUpdated = null, onAfterPlayersRender = null } = {}) {
    _db              = deps.db;
    _getAllDecks      = deps.getAllDecks;
    _getAllPlayers    = deps.getAllPlayers;
    _getTagStyle      = deps.getTagStyle;
    _openModal        = deps.openModal;
    _closeModal       = deps.closeModal;
    _renderColorGrid  = deps.renderColorGrid;
    _MODERN_COLORS    = deps.MODERN_COLORS;
    const TAG_COLORS  = deps.TAG_COLORS || {};

    // Expose window globals used by inline onclick attributes in rendered HTML
    window.handleEditDeckSettingsTrigger = (deckId) => handleEditDeckSettingsTrigger(deckId);
    window.handleDeckDeletionTrigger     = (id, deckName, playerName) => handleDeckDeletionTrigger(id, deckName, playerName);

    // Colour grid for the "Add Player" form (database.html only)
    if (document.getElementById('newPlayerColorGrid')) {
        _renderColorGrid('newPlayerColorGrid', selectedNewPlayerColor, (color) => {
            selectedNewPlayerColor = color;
        });
    }

    // Tag selector toggle (database.html only)
    const tagContainer = document.getElementById('tagSelectorContainer');
    const toggleTagsBtn = document.getElementById('toggleTagsBtn');
    const tagSelector   = document.getElementById('tagSelector');
    if (tagContainer && toggleTagsBtn && tagSelector) {
        // Build colored tag checkboxes from TAG_COLORS
        const allTags = Object.keys(TAG_COLORS);
        tagSelector.innerHTML = allTags.map(tag => {
            const color = TAG_COLORS[tag] || 'var(--text-dim)';
            return `
                <label class="tag-checkbox" style="border: 1px solid ${color}44; background: ${color}18;"
                       data-color="${color}">
                    <span style="color: ${color}; font-weight: 800;">${tag}</span>
                    <input type="checkbox" value="${tag}" style="display:none;">
                </label>`;
        }).join('');

        // Highlight fully on check
        tagSelector.querySelectorAll('.tag-checkbox').forEach(label => {
            const color = label.dataset.color;
            const cb    = label.querySelector('input');
            cb.addEventListener('change', () => {
                label.style.background    = cb.checked ? color + '44' : color + '18';
                label.style.borderColor   = cb.checked ? color : color + '44';
            });
        });

        toggleTagsBtn.onclick = () => {
            tagContainer.classList.toggle('tag-selector-hidden');
            tagContainer.classList.toggle('tag-selector-visible');
        };
    }

    // Add Player button (database.html only)
    const addPlayerBtn = document.getElementById('addPlayerBtn');
    if (addPlayerBtn) addPlayerBtn.onclick = async () => {
        const nameInput = document.getElementById('newPlayerName');
        const name = nameInput.value.trim();
        if (!name || _getAllPlayers().some(p => p.name === name)) return;
        await addDoc(collection(_db, "players"), { name, color: selectedNewPlayerColor });
        await addDoc(collection(_db, "decks"), {
            firstBloodCount: 0, mostRampCount: 0,
            mostDrawCount: 0, solRingOpening: 0, wentFirstCount: 0,
            funRatingTotal: 0, funRatingCount: 0,
        });
        nameInput.value = '';
    };

    // Add Deck button (database.html only)
    const addDeckBtn = document.getElementById('addDeckBtn');
    if (addDeckBtn) addDeckBtn.onclick = async () => {
        const player    = document.getElementById('playerSelect').value;
        const deckName  = document.getElementById('deckName').value.trim();
        const cmdInput  = document.getElementById('commanderName').value.trim();
        const bracket   = document.getElementById('deckBracket').value;
        const checkedTags = Array.from(document.querySelectorAll('#tagSelector input:checked')).map(cb => cb.value);

        if (!player || !deckName) return;

        let commanderData = { name: "n/a", image: "", colorIdentity: [] };

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

        await addDoc(collection(_db, "decks"), {
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

    // Players snapshot → roster tabs
    onSnapshot(query(collection(_db, "players"), orderBy("name", "asc")), (snapshot) => {
        const players = snapshot.docs.map(d => ({
            id: d.id,
            name: d.data().name,
            color: d.data().color || "#3d85ff"
        }));

        if (onPlayersUpdated) onPlayersUpdated(players);

        _syncPlayerSelect(players);
        _renderRosterTabs(players);

        if (onAfterPlayersRender) onAfterPlayersRender();
    });
}

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

/**
 * Rebuilds the deck list for the currently selected roster player.
 * Called by app.js whenever allDecks changes or a roster tab is clicked.
 */
export function updateRosterView(playerName) {
    selectedRosterPlayer = playerName ?? selectedRosterPlayer;
    const rosterDeckView = document.getElementById('rosterDeckList');
    rosterDeckView.innerHTML = '';

    if (!selectedRosterPlayer) {
        rosterDeckView.innerHTML = `<p style="color: var(--text-dim); font-size: 0.8rem; text-align: center;">Select a player to view their decks.</p>`;
        return;
    }

    let decks = _getAllDecks().filter(d => d.player === selectedRosterPlayer);
    decks.sort((a, b) => {
        const aName = a.deckName.toLowerCase();
        const bName = b.deckName.toLowerCase();
        if (aName === 'misc') return 1;
        if (bName === 'misc') return -1;
        return aName.localeCompare(bName);
    });

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
                    <div class="deck-tags-grid">
                        ${(d.deckTags || []).map(t => `<span class="individual-tag" style="${_getTagStyle(t)}">${t}</span>`).join('')}
                    </div>
                </div>
                <div class="player-controls">
                    <button class="player-edit-btn" onclick="handleEditDeckSettingsTrigger('${d.id}')">✏️</button>
                    <button class="player-del-btn"  onclick="handleDeckDeletionTrigger('${d.id}', '${d.deckName.replace(/'/g, "\\'")}', '${d.player}')">✕</button>
                </div>
            </div>
        `;
        ul.appendChild(li);
    });
    rosterDeckView.appendChild(ul);
}

export function getSelectedRosterPlayer() { return selectedRosterPlayer; }

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function _syncPlayerSelect(players) {
    const playerSelect = document.getElementById('playerSelect');
    playerSelect.innerHTML = '<option value="" disabled selected>Owner...</option>';
    players.forEach(p => {
        playerSelect.innerHTML += `<option value="${p.name}" style="color:${p.color}; font-weight:800;">${p.name}</option>`;
    });
}

function _renderRosterTabs(players) {
    const rosterTabs = document.getElementById('rosterTabs');
    rosterTabs.innerHTML = '';

    players.forEach(p => {
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
}

// ---------------------------------------------------------------------------
// Player CRUD
// ---------------------------------------------------------------------------

function handleEditPlayerTrigger(id, name, color) {
    let tempEditColor = color;
    const body = `
        <div style="display:flex; flex-direction:column; gap:10px; text-align:left;">
            <label style="font-size:0.75rem; color:var(--text-dim);">PLAYER NAME</label>
            <input type="text" id="editPlayerName" value="${name}" style="margin:0;">
            <label style="font-size:0.75rem; color:var(--text-dim); margin-top:10px;">PLAYER COLOR</label>
            <div id="editPlayerColorGrid" class="modern-color-grid"></div>
        </div>
    `;
    _openModal(`Edit ${name}`, body, [
        { label: "Save Changes", color: "var(--accent)", onClick: () => finalizePlayerUpdate(id, name, tempEditColor) }
    ]);
    _renderColorGrid('editPlayerColorGrid', color, (c) => { tempEditColor = c; });
}

async function finalizePlayerUpdate(id, oldName, newColor) {
    const newName = document.getElementById('editPlayerName').value.trim();
    if (!newName) return;
    const batch = writeBatch(_db);
    batch.update(doc(_db, "players", id), { name: newName, color: newColor });
    if (newName !== oldName) {
        _getAllDecks()
            .filter(d => d.player === oldName)
            .forEach(d => batch.update(doc(_db, "decks", d.id), { player: newName }));
    }
    await batch.commit();
}

function handlePlayerDeletion(id, name) {
    _openModal(`Delete Player "${name}"?`, "This will remove the player but leave decks for history.", [
        { label: "Confirm Delete", color: "var(--danger)", onClick: async () => await deleteDoc(doc(_db, "players", id)) }
    ]);
}

// ---------------------------------------------------------------------------
// Deck CRUD
// ---------------------------------------------------------------------------

function handleEditDeckSettingsTrigger(deckId) {
    const deck = _getAllDecks().find(d => d.id === deckId);
    const currentTags = deck.deckTags || [];
    const allAvailableTags = [
        "Aggro","Aristocrats","Artifacts","Big Mana","Blink","Burn","Combo","Control",
        "Group Hug","Lands","Lifegain","Midrange","Mill","Reanimator","Spellslinger",
        "Stax","Tokens","Tribal","Voltron","+1/+1 Counters","Mono Color","Budget",
        "Recursion","Go Wide","Goad","Graveyard","Enchantress","Storm","Theft"
    ];

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
                    <option value="2" ${deck.bracket == 2 ? 'selected' : ''}>2</option>
                    <option value="3" ${deck.bracket == 3 ? 'selected' : ''}>3</option>
                    <option value="4" ${deck.bracket == 4 ? 'selected' : ''}>4</option>
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

    _openModal(`Edit Deck Settings`, body, [
        { label: "Save Changes", color: "var(--success)", onClick: () => finalizeDeckUpdate(deckId) }
    ]);

    // Live Scryfall search inside the modal
    document.getElementById('fetchCmdBtn').onclick = async () => {
        const input   = document.getElementById('editCommanderName').value.trim();
        const status  = document.getElementById('previewStatus');
        const preview = document.getElementById('commanderPreview');

        status.textContent = "Searching...";
        try {
            const response = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(input)}`);
            if (response.ok) {
                const card         = await response.json();
                const isDoubleFaced = card.card_faces && !card.image_uris;
                const frontFace    = isDoubleFaced ? card.card_faces[0] : card;
                const artCrop      = frontFace.image_uris ? frontFace.image_uris.art_crop : "";

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
        } catch {
            status.textContent = "Error fetching card";
        }
    };
}

async function finalizeDeckUpdate(deckId) {
    const newName    = document.getElementById('editDeckName').value.trim();
    const newCmdName = document.getElementById('editCommanderName').value.trim();
    const newBracket = document.getElementById('editDeckBracket').value;
    const checkedTags = Array.from(document.querySelectorAll('#editTagGrid input:checked')).map(cb => cb.value);
    const previewImg  = document.querySelector('#commanderPreview img');
    const statusEl    = document.getElementById('previewStatus');
    const newIdentity = statusEl?.dataset.identity ? JSON.parse(statusEl.dataset.identity) : null;

    if (!newName) return;

    const updateData = {
        deckName:       newName,
        commander:      newCmdName,
        bracket:        parseFloat(newBracket) || 1,
        commanderImage: previewImg ? previewImg.src : "",
        deckTags:       checkedTags
    };
    if (newIdentity) updateData.colorIdentity = newIdentity;

    try {
        await updateDoc(doc(_db, "decks", deckId), updateData);
        _closeModal();
    } catch (error) {
        console.error("Error updating deck:", error);
    }
}

function handleDeckDeletionTrigger(id, deckName, playerName) {
    const isMisc = deckName.toLowerCase() === 'misc';
    if (isMisc) {
        _openModal(`Delete "${deckName}"?`, "Permanently remove all stored stats?", [
            { label: "Delete Permanently", color: "var(--danger)", onClick: () => finalizeDeckDeletion(id, playerName, false) }
        ]);
    } else {
        _openModal(`Delete "${deckName}"?`, "Merge stats into Misc or delete permanently?", [
            { label: "Merge to Misc",      color: "var(--mtg-orange)", onClick: () => finalizeDeckDeletion(id, playerName, true) },
            { label: "Delete Permanently", color: "var(--danger)",     onClick: () => finalizeDeckDeletion(id, playerName, false) }
        ]);
    }
}

async function finalizeDeckDeletion(id, playerName, merge) {
    if (merge) {
        const misc = _getAllDecks().find(d => d.player === playerName && d.deckName.toLowerCase() === 'misc');
        if (misc) {
            const snap = await getDoc(doc(_db, "decks", id));
            const d    = snap.data();
            await updateDoc(doc(_db, "decks", misc.id), {
                solRingOpening:  increment(d.solRingOpening  || 0),
                firstBloodCount: increment(d.firstBloodCount || 0),
                mostRampCount:   increment(d.mostRampCount   || 0),
                mostDrawCount:   increment(d.mostDrawCount   || 0),
                funRatingTotal:  increment(d.funRatingTotal  || 0),
                funRatingCount:  increment(d.funRatingCount  || 0),
                wentFirstCount:  increment(d.wentFirstCount  || 0),
                wentLastCount:   increment(d.wentLastCount   || 0),
            });
        }
    }
    await deleteDoc(doc(_db, "decks", id));
}