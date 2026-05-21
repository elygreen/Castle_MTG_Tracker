/**
 * standings.js
 * Handles all leaderboard / standings rendering for the Castle MTG Stat Tracker.
 * Imported by app.js — do not load independently.
 */

import {
    collection, query, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * Sorts a deck array for leaderboard display.
 * "Misc" decks are always pushed to the bottom.
 * For stat keys, sorts descending by value; for 'deckName', sorts A–Z.
 *
 * @param {Object[]} decks
 * @param {string}   [sortKey='gamesPlayed']
 * @returns {Object[]} sorted copy
 */
function sortDecksForStandings(decks, sortKey = 'gamesPlayed') {
    return [...decks].sort((a, b) => {
        const nameA = (a.deckName || '').toLowerCase();
        const nameB = (b.deckName || '').toLowerCase();
        if (nameA === 'misc' && nameB !== 'misc') return 1;
        if (nameB === 'misc' && nameA !== 'misc') return -1;

        if (sortKey === 'deckName') return nameA.localeCompare(nameB);

        // For gamesPlayed, fall back to computed wins+losses for legacy docs
        const valA = sortKey === 'gamesPlayed'
            ? (a.gamesPlayed || ((a.wins || 0) + (a.losses || 0)) || 0)
            : (a[sortKey] || 0);
        const valB = sortKey === 'gamesPlayed'
            ? (b.gamesPlayed || ((b.wins || 0) + (b.losses || 0)) || 0)
            : (b[sortKey] || 0);

        return valB - valA;
    });
}

/**
 * Builds a single leaderboard card <li> element for one deck.
 *
 * @param {Object}   deck            - Deck data (Firestore doc + id)
 * @param {Object}   BRACKET_COLORS  - Map of bracket value → CSS colour string
 * @param {Function} formatBracket   - (val) => display string
 * @param {Function} getColorPips    - (colorIdentity: string[]) => pip emoji string
 * @param {Function} getPlayerColor  - (playerName: string) => CSS colour string
 * @param {Function} getTagStyle     - (tag: string) => inline style string
 * @returns {HTMLLIElement}
 */
export function buildStandingsCard(
    deck,
    BRACKET_COLORS,
    formatBracket,
    getColorPips,
    getPlayerColor,
    getTagStyle
) {
    const tags   = deck.deckTags || [];
    const bgArt  = deck.commanderImage ? `url(${deck.commanderImage})` : 'none';

    const li = document.createElement('li');
    li.className = 'deck-card-container';
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
                    <div style="color:${getPlayerColor(deck.player)}; font-size:0.75rem; margin-top:2px; font-weight:800; text-transform:uppercase; letter-spacing: 0.5px;">
                        ${deck.player}
                    </div>
                    <div class="deck-tags-grid">
                        ${tags.map(t => `<span class="individual-tag" style="${getTagStyle(t)}">${t}</span>`).join('')}
                    </div>
                </div>
            </div>
            <div class="stat-badges">
                <div class="stat-badge-pill" style="background: rgba(255,255,255,0.1);">GAMES <b>${deck.gamesPlayed || ((deck.wins || 0) + (deck.losses || 0)) || 0}</b></div>
                <div class="stat-badge-pill pill-sol">SOL RING <b>${deck.solRingOpening  || 0}</b></div>
                <div class="stat-badge-pill pill-mulligan">2+ MULLIGANS <b>${deck.mulliganCount || 0}</b></div>
                <div class="stat-badge-pill pill-blood">FIRST BLOOD <b>${deck.firstBloodCount || 0}</b></div>
                <div class="stat-badge-pill pill-ramp">MOST RAMP <b>${deck.mostRampCount  || 0}</b></div>
                <div class="stat-badge-pill pill-draw">MOST DRAW <b>${deck.mostDrawCount  || 0}</b></div>
                <div class="stat-badge-pill pill-first">WENT FIRST <b>${deck.wentFirstCount || 0}</b></div>
                <div class="stat-badge-pill pill-last">WENT LAST <b>${deck.wentLastCount  || 0}</b></div>
            </div>
        </div>
    `;
    return li;
}

/**
 * Subscribes to the decks collection and keeps the standings list in sync.
 * Also calls optional side-effect callbacks used by other parts of the app.
 * Returns the Firestore unsubscribe function so the caller can clean up.
 *
 * @param {import("firebase/firestore").Firestore} db
 * @param {HTMLElement}  deckListEl       - The <ul> container (#deckList)
 * @param {HTMLElement}  loadingEl        - The loading indicator element (#loading)
 * @param {Object}       BRACKET_COLORS
 * @param {Function}     formatBracket
 * @param {Function}     getColorPips
 * @param {Function}     getPlayerColor
 * @param {Function}     getTagStyle
 * @param {Object}       [callbacks={}]   - Optional side-effect hooks
 * @param {Function}     [callbacks.onDecksUpdated]   - (allDecks: Object[]) => void
 * @param {Function}     [callbacks.onAfterRender]    - () => void
 * @returns {Function}   Firestore unsubscribe function
 */
export function initStandingsListener(
    db,
    deckListEl,
    loadingEl,
    BRACKET_COLORS,
    formatBracket,
    getColorPips,
    getPlayerColor,
    getTagStyle,
    { onDecksUpdated = null, onAfterRender = null } = {}
) {
    const sortSelect = document.getElementById('standingsSortSelect');

    // Renders the deck list using the current sort selection
    function renderSorted(allDecks) {
        const sortKey = sortSelect ? sortSelect.value : 'gamesPlayed';
        deckListEl.innerHTML = '';
        const sorted = sortDecksForStandings(allDecks, sortKey);
        sorted.forEach(deck => {
            const card = buildStandingsCard(
                deck,
                BRACKET_COLORS,
                formatBracket,
                getColorPips,
                getPlayerColor,
                getTagStyle
            );
            deckListEl.appendChild(card);
        });
    }

    // Wire the sort select — re-sorts the cached deck list without a Firestore round-trip
    let _cachedDecks = [];
    if (sortSelect) {
        sortSelect.addEventListener('change', () => renderSorted(_cachedDecks));
    }

    return onSnapshot(query(collection(db, "decks")), (snapshot) => {
        loadingEl.style.display = 'none';

        _cachedDecks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        if (onDecksUpdated) onDecksUpdated(_cachedDecks);

        renderSorted(_cachedDecks);

        if (onAfterRender) onAfterRender(_cachedDecks);
    }, (error) => {
        console.error("Firestore decks snapshot error:", error);
        loadingEl.style.display = 'none';
        deckListEl.innerHTML = `
            <div style="text-align:center; padding: 40px 20px; color: var(--text-dim);">
                <div style="font-size: 2rem; margin-bottom: 10px;">⚠️</div>
                <div style="font-weight: 800; color: var(--danger); margin-bottom: 6px;">Failed to load data</div>
                <div style="font-size: 0.8rem;">${error.code || error.message}</div>
            </div>`;
    });
}