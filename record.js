/**
 * record.js
 * Entry point for record.html — the Record Match page.
 */

import {
    collection, addDoc, doc, increment, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
    db, checkAuth,
    getAllPlayers, getAllDecks, setAllPlayers, setAllDecks,
    getPlayerColor, getTagStyle,
    MODERN_COLORS, BRACKET_COLORS, TAG_COLORS,
} from "./shared.js";

import { initDatabase } from "./database.js";
import { initStandingsListener } from "./standings.js";
import { initHistoryListener } from "./history.js";

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
checkAuth().then(level => {
    if (!level) return;
    _boot();
}).catch(console.error);

function _boot() {
    // We need allPlayers and allDecks populated so the record form works.
    // database.js owns the players snapshot; standings.js owns the decks snapshot.
    // We init both here purely for their data side-effects (no UI targets on this page).

    initDatabase(
        {
            db,
            getAllDecks,
            getAllPlayers,
            getTagStyle,
            // No modal / color grid needed on this page — pass no-ops
            openModal:       () => {},
            closeModal:      () => {},
            renderColorGrid: () => {},
            MODERN_COLORS,
        },
        {
            onPlayersUpdated: (players) => {
                setAllPlayers(players);
                _repopulateParticipantSelects();
            },
            onAfterPlayersRender: () => tryInitializeDefaultPod(),
        }
    );

    initStandingsListener(
        db,
        // No standings UI on this page — pass dummy elements
        document.createElement('ul'),
        document.createElement('div'),
        BRACKET_COLORS,
        () => {},   // formatBracket — unused here
        () => {},   // getColorPips  — unused here
        () => {},   // getPlayerColor — unused here
        () => {},   // getTagStyle    — unused here
        {
            onDecksUpdated: (decks) => setAllDecks(decks),
            onAfterRender:  () => tryInitializeDefaultPod(),
        }
    );

    _initRecordPage();
}

// ---------------------------------------------------------------------------
// Record page logic
// ---------------------------------------------------------------------------

let initialPopulated = false;

function _initRecordPage() {
    document.getElementById('addParticipantBtn').onclick = () => {
        addParticipant();
        refreshSharedStatDropdowns();
    };

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

    document.getElementById('submitMatchBtn').onclick = submitMatch;
}

function addParticipant(defaultPlayerName = null) {
    const row = document.createElement('div');
    row.className = 'card participant-card-compact';
    row.style.background = 'rgba(0,0,0,0.2)';
    row.innerHTML = `
        <div class="participant-row line-1">
            <div class="input-group-main">
                <select class="p-owner">
                    <option value="" disabled selected>Player...</option>
                    ${getAllPlayers().map(p => `<option value="${p.name}" style="color:${p.color}; font-weight:bold;">${p.name}</option>`).join('')}
                </select>
                <select class="p-deck"><option value="" disabled selected>Deck...</option></select>
                <select class="p-deck-enjoyment enjoyment-select">
                    <option value="0">Deck Enjoyment</option>
                    ${[1,2,3,4,5,6,7,8,9,10].map(n => `<option value="${n}">${n} / 10</option>`).join('')}
                </select>
            </div>
            <button class="remove-participant" onclick="this.parentElement.parentElement.remove()">✕</button>
        </div>
        <div class="participant-row line-2">
            <label class="stat-pill pill-sol compact-pill"><input type="checkbox" class="p-sol" style="display:none"> Sol Ring</label>
        </div>
    `;

    const ownerSel = row.querySelector('.p-owner');
    const deckSel  = row.querySelector('.p-deck');

    ownerSel.onchange = () => {
        const playerName  = ownerSel.value;
        const playerColor = getPlayerColor(playerName);
        ownerSel.style.borderColor = playerColor;
        ownerSel.style.color = playerColor;
        ownerSel.style.fontWeight = '800';

        let filtered = getAllDecks().filter(d => d.player === playerName);
        filtered.sort((a, b) => a.deckName === 'Misc' ? 1 : b.deckName === 'Misc' ? -1 : a.deckName.localeCompare(b.deckName));
        deckSel.innerHTML = '<option value="" disabled selected>Deck...</option>' +
            filtered.map(d => `<option value="${d.id}">${d.deckName}</option>`).join('');
        refreshSharedStatDropdowns();
    };

    row.querySelector('.remove-participant').addEventListener('click', () => {
        setTimeout(refreshSharedStatDropdowns, 0);
    });

    document.getElementById('gameParticipants').appendChild(row);

    if (defaultPlayerName && getAllPlayers().some(p => p.name === defaultPlayerName)) {
        ownerSel.value = defaultPlayerName;
        ownerSel.dispatchEvent(new Event('change'));
    }
}

function refreshSharedStatDropdowns() {
    const rows    = document.querySelectorAll('#gameParticipants .card');
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

    ['shared-blood','shared-ramp','shared-draw','shared-first','shared-last'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = makeOptions('Select a user...');
    });
}

function _repopulateParticipantSelects() {
    document.querySelectorAll('#gameParticipants .p-owner').forEach(sel => {
        const current = sel.value;
        sel.innerHTML = '<option value="" disabled selected>Player...</option>' +
            getAllPlayers().map(p => `<option value="${p.name}" style="color:${p.color}; font-weight:bold;">${p.name}</option>`).join('');
        if (current) sel.value = current;
    });
}

function tryInitializeDefaultPod() {
    if (!initialPopulated && getAllPlayers().length > 0 && getAllDecks().length > 0) {
        const defaultPod = ["Ely", "Lucian", "Ryan", "Joey"];
        document.getElementById('gameParticipants').innerHTML = '';
        defaultPod.forEach(name => addParticipant(name));
        initialPopulated = true;
    }
}

async function submitMatch() {
    const rows = document.querySelectorAll('#gameParticipants .card');

    for (const row of rows) {
        if (!row.querySelector('.p-deck').value) {
            alert("Ensure every player has a deck selected.");
            return;
        }
    }

    const matchComment = document.getElementById('matchComment').value.trim();
    const firstWinner  = document.getElementById('shared-first')?.value || '';
    const lastWinner   = document.getElementById('shared-last')?.value  || '';
    const bloodWinner  = document.getElementById('shared-blood')?.value || '';
    const rampWinner   = document.getElementById('shared-ramp')?.value  || '';
    const drawWinner   = document.getElementById('shared-draw')?.value  || '';

    const batch = writeBatch(db);
    const matchParticipants = [];

    rows.forEach(row => {
        const id       = row.querySelector('.p-deck').value;
        const deckObj  = getAllDecks().find(d => d.id === id);
        const playerName = deckObj.player;

        const funRating = parseInt(row.querySelector('.p-deck-enjoyment').value) || 0;
        const isFirst   = firstWinner === playerName;
        const isLast    = lastWinner  === playerName;
        const isBlood   = bloodWinner === playerName;
        const isRamp    = rampWinner  === playerName;
        const isDraw    = drawWinner  === playerName;

        matchParticipants.push({
            deckId: id,
            player: playerName,
            deckName: deckObj.deckName,
            deckTags: deckObj.deckTags || [],
            funRating,
            sol:   row.querySelector('.p-sol').checked,
            blood: isBlood, ramp: isRamp, draw: isDraw,
            first: isFirst, last: isLast,
        });

        batch.update(doc(db, "decks", id), {
            gamesPlayed:     increment(1),
            funRatingTotal:  increment(funRating),
            funRatingCount:  increment(funRating > 0 ? 1 : 0),
            solRingOpening:  increment(row.querySelector('.p-sol').checked ? 1 : 0),
            firstBloodCount: increment(isBlood ? 1 : 0),
            mostRampCount:   increment(isRamp  ? 1 : 0),
            mostDrawCount:   increment(isDraw  ? 1 : 0),
            wentFirstCount:  increment(isFirst ? 1 : 0),
            wentLastCount:   increment(isLast  ? 1 : 0),
        });
    });

    await batch.commit();
    await addDoc(collection(db, "matches"), {
        timestamp:    serverTimestamp(),
        participants: matchParticipants,
        comment:      matchComment
    });

    alert("Match Recorded!");

    // Reset
    document.getElementById('matchComment').value = '';
    ['shared-first','shared-last','shared-blood','shared-ramp','shared-draw'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.selectedIndex = 0;
    });
    rows.forEach(row => {
        row.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        row.querySelector('.p-deck-enjoyment').value = "0";
    });
}
