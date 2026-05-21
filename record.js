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
    getPlayerColor, getTagStyle, getColorPips, getColorPipsHtml,
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

    ['shared-first', 'shared-last', 'shared-blood', 'shared-ramp', 'shared-draw', 'shared-interaction', 'shared-archenemy', 'shared-takenout'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.addEventListener('change', () => {
            const colorMap = {
                'shared-first':       'var(--clr-first)',
                'shared-last':        'var(--clr-last)',
                'shared-blood':       'var(--clr-blood)',
                'shared-ramp':        'var(--clr-ramp)',
                'shared-draw':        'var(--clr-draw)',
                'shared-interaction': 'var(--clr-interaction)',
                'shared-archenemy':   'var(--clr-archenemy)',
                'shared-takenout':    'var(--clr-takenout)',
            };
            sel.style.borderColor = sel.value ? colorMap[id] : 'var(--border)';
            sel.style.color = sel.value ? 'white' : 'var(--text-dim)';
        });
    });

    document.getElementById('submitMatchBtn').onclick = submitMatch;

    document.addEventListener('click', () => {
        document.querySelectorAll('.enjoy-menu.open, .deck-menu.open').forEach(m => m.classList.remove('open'));
    });
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
                <div class="deck-dropdown">
                    <div class="deck-trigger">Deck...</div>
                    <div class="deck-menu"></div>
                    <input type="hidden" class="p-deck" value="">
                </div>
                <div class="enjoy-dropdown">
                    <div class="enjoy-trigger">Deck Enjoyment</div>
                    <div class="enjoy-menu">
                        ${[1,2,3,4,5,6,7,8,9,10].map(n => `<div class="enjoy-option" data-value="${n}" style="font-weight: 800;">${n} / 10</div>`).join('')}
                    </div>
                    <input type="hidden" class="p-deck-enjoyment" value="0">
                </div>
            </div>
            <button class="remove-participant" onclick="this.parentElement.parentElement.remove()">✕</button>
        </div>
        <div class="participant-row line-2">
            <label class="stat-pill pill-sol compact-pill"><input type="checkbox" class="p-sol" style="display:none"> Sol Ring</label>
            <label class="stat-pill pill-mulligan compact-pill"><input type="checkbox" class="p-mulligan" style="display:none"> 2+ Mulligans</label>
            <label class="stat-pill pill-snapkeep compact-pill"><input type="checkbox" class="p-snapkeep" style="display:none"> Snap Keep</label>
        </div>
    `;

    const ownerSel   = row.querySelector('.p-owner');
    const deckTrigger = row.querySelector('.deck-trigger');
    const deckMenu    = row.querySelector('.deck-menu');
    const deckHidden  = row.querySelector('.p-deck');

    // Open/close deck menu
    deckTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.deck-menu.open').forEach(m => {
            if (m !== deckMenu) m.classList.remove('open');
        });
        deckMenu.classList.toggle('open');
    });

    ownerSel.onchange = () => {
        const playerName  = ownerSel.value;
        const playerColor = getPlayerColor(playerName);
        ownerSel.style.borderColor = playerColor;
        ownerSel.style.color       = playerColor;
        ownerSel.style.fontWeight  = '800';

        // Reset deck selection
        deckHidden.value        = '';
        deckTrigger.textContent = 'Deck...';
        deckTrigger.style.color       = 'var(--text-dim)';
        deckTrigger.style.borderColor = 'var(--border)';
        row.style.removeProperty('--commander-art');
        row.classList.remove('has-commander-art');

        let filtered = getAllDecks().filter(d => d.player === playerName);
        filtered.sort((a, b) => a.deckName === 'Misc' ? 1 : b.deckName === 'Misc' ? -1 : a.deckName.localeCompare(b.deckName));

        deckMenu.innerHTML = filtered.map(d => {
            const pips = getColorPipsHtml(d.colorIdentity);
            return `<div class="deck-option" data-id="${d.id}">${pips}<span class="deck-option-name">${d.deckName}</span></div>`;
        }).join('');

        deckMenu.querySelectorAll('.deck-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const deckObj = getAllDecks().find(d => d.id === opt.dataset.id);
                const pips    = getColorPipsHtml(deckObj?.colorIdentity);
                deckHidden.value        = opt.dataset.id;
                deckTrigger.innerHTML   = `${pips}<span style="vertical-align:middle;">${deckObj?.deckName || ''}</span>`;
                deckTrigger.style.color       = 'white';
                deckTrigger.style.borderColor = playerColor;
                deckMenu.classList.remove('open');
                if (deckObj?.commanderImage) {
                    row.style.setProperty('--commander-art', `url(${deckObj.commanderImage})`);
                    row.classList.add('has-commander-art');
                } else {
                    row.style.removeProperty('--commander-art');
                    row.classList.remove('has-commander-art');
                }
                refreshSharedStatDropdowns();
            });
        });

        refreshSharedStatDropdowns();
    };

    row.querySelector('.remove-participant').addEventListener('click', () => {
        setTimeout(refreshSharedStatDropdowns, 0);
    });

    // Custom enjoyment dropdown
    const enjoyColors = [
        null,
        '#c0392b', '#d44e1f', '#e06b1a', '#d4842a', '#b89e30',
        '#8fb335', '#62c040', '#36cc50', '#18d464', '#10d275'
    ];
    const trigger  = row.querySelector('.enjoy-trigger');
    const menu     = row.querySelector('.enjoy-menu');
    const hidden   = row.querySelector('.p-deck-enjoyment');

    // Colour each option on creation
    row.querySelectorAll('.enjoy-option').forEach(opt => {
        const val = parseInt(opt.dataset.value);
        opt.style.color = enjoyColors[val];
    });

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close any other open menus first
        document.querySelectorAll('.enjoy-menu.open').forEach(m => {
            if (m !== menu) m.classList.remove('open');
        });
        menu.classList.toggle('open');
    });

    menu.querySelectorAll('.enjoy-option').forEach(opt => {
        opt.addEventListener('click', () => {
            const val   = parseInt(opt.dataset.value);
            const color = enjoyColors[val];
            hidden.value          = val;
            trigger.textContent   = `${val} / 10`;
            trigger.style.color   = color;
            trigger.style.borderColor = color;
            menu.classList.remove('open');
        });
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

    ['shared-blood','shared-ramp','shared-draw','shared-first','shared-last','shared-interaction','shared-archenemy','shared-takenout'].forEach(id => {
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

    const matchComment  = document.getElementById('matchComment').value.trim();
    const legendaryPlay = document.getElementById('legendaryPlay').value.trim();
    const firstWinner       = document.getElementById('shared-first')?.value       || '';
    const lastWinner        = document.getElementById('shared-last')?.value        || '';
    const bloodWinner       = document.getElementById('shared-blood')?.value       || '';
    const rampWinner        = document.getElementById('shared-ramp')?.value        || '';
    const drawWinner        = document.getElementById('shared-draw')?.value        || '';
    const interactionWinner = document.getElementById('shared-interaction')?.value || '';
    const archEnemyWinner   = document.getElementById('shared-archenemy')?.value   || '';
    const takenOutWinner    = document.getElementById('shared-takenout')?.value    || '';

    const batch = writeBatch(db);
    const matchParticipants = [];

    for (const row of rows) {
        const id = row.querySelector('.p-deck').value;
        if (!getAllDecks().find(d => d.id === id)) {
            const trigger = row.querySelector('.deck-trigger');
            const deckName = trigger ? trigger.textContent.trim() : id;
            alert(`The deck "${deckName}" no longer exists in the database. It may have been deleted. Please refresh and reselect.`);
            return;
        }
    }

    rows.forEach(row => {
        const id       = row.querySelector('.p-deck').value;
        const deckObj  = getAllDecks().find(d => d.id === id);
        const playerName = deckObj.player;

        const funRating = parseInt(row.querySelector('.p-deck-enjoyment').value) || 0;
        const isFirst       = firstWinner       === playerName;
        const isLast        = lastWinner        === playerName;
        const isBlood       = bloodWinner       === playerName;
        const isRamp        = rampWinner        === playerName;
        const isDraw        = drawWinner        === playerName;
        const isInteraction = interactionWinner === playerName;
        const isArchEnemy   = archEnemyWinner   === playerName;
        const isTakenOut    = takenOutWinner    === playerName;

        matchParticipants.push({
            deckId: id,
            player: playerName,
            deckName: deckObj.deckName,
            deckTags: deckObj.deckTags || [],
            funRating,
            sol:         row.querySelector('.p-sol').checked,
            mulligan:    row.querySelector('.p-mulligan').checked,
            snapkeep:    row.querySelector('.p-snapkeep').checked,
            blood:       isBlood,       ramp:        isRamp,        draw:        isDraw,
            first:       isFirst,       last:        isLast,
            interaction: isInteraction, archenemy:   isArchEnemy,   takenout:    isTakenOut,
        });

        batch.update(doc(db, "decks", id), {
            gamesPlayed:          increment(1),
            funRatingTotal:       increment(funRating),
            funRatingCount:       increment(funRating > 0 ? 1 : 0),
            solRingOpening:       increment(row.querySelector('.p-sol').checked ? 1 : 0),
            mulliganCount:        increment(row.querySelector('.p-mulligan').checked ? 1 : 0),
            snapKeepCount:        increment(row.querySelector('.p-snapkeep').checked ? 1 : 0),
            firstBloodCount:      increment(isBlood       ? 1 : 0),
            mostRampCount:        increment(isRamp        ? 1 : 0),
            mostDrawCount:        increment(isDraw        ? 1 : 0),
            wentFirstCount:       increment(isFirst       ? 1 : 0),
            wentLastCount:        increment(isLast        ? 1 : 0),
            mostInteractionCount: increment(isInteraction ? 1 : 0),
            archEnemyCount:       increment(isArchEnemy   ? 1 : 0),
            takenOutFirstCount:   increment(isTakenOut    ? 1 : 0),
        });
    });

    await batch.commit();
    await addDoc(collection(db, "matches"), {
        timestamp:     serverTimestamp(),
        participants:  matchParticipants,
        comment:       matchComment,
        legendaryPlay: legendaryPlay,
    });

    alert("Match Recorded!");

    // Reset
    document.getElementById('matchComment').value = '';
    document.getElementById('legendaryPlay').value = '';
    ['shared-first','shared-last','shared-blood','shared-ramp','shared-draw','shared-interaction','shared-archenemy','shared-takenout'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.selectedIndex = 0;
    });
    rows.forEach(row => {
        row.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        row.querySelector('.p-deck-enjoyment').value = "0";
        const enjoyTrigger = row.querySelector('.enjoy-trigger');
        if (enjoyTrigger) {
            enjoyTrigger.textContent      = 'Deck Enjoyment';
            enjoyTrigger.style.color      = '';
            enjoyTrigger.style.borderColor = '';
        }
        const deckTrigger = row.querySelector('.deck-trigger');
        if (deckTrigger) {
            row.querySelector('.p-deck').value = '';
            deckTrigger.textContent       = 'Deck...';
            deckTrigger.style.color       = 'var(--text-dim)';
            deckTrigger.style.borderColor = 'var(--border)';
        }
    });
}