/**
 * player_insight.js
 * Handles all Player Insight tab rendering and charts for the Castle MTG Stat Tracker.
 * Imported by app.js — do not load independently.
 *
 * External globals expected at runtime (loaded via <script> in index.html):
 *   - Chart         (chart.js)
 *   - ChartDataLabels (chartjs-plugin-datalabels)
 */

// --- MODULE STATE ---
let selectedInsightPlayer = null;
let selectedInsightDeckId = null;
let activeBarChart        = null;
let activePieChart        = null;
let activePlayRatePieChart = null;

// Refs to app.js data — set once via initInsight()
let _getAllDecks    = null;
let _getAllPlayers  = null;
let _getPlayerColor = null;
let _getTagStyle    = null;
let _BRACKET_COLORS = null;
let _formatBracket  = null;
let _getColorPips   = null;

export function getSelectedInsightPlayer() { return selectedInsightPlayer; }

/**
 * Wire up the module with the live data accessors it needs from app.js.
 * Call this once, before the insight tab can be used.
 *
 * @param {Object} deps
 * @param {() => Object[]}          deps.getAllDecks
 * @param {() => Object[]}          deps.getAllPlayers
 * @param {(name: string) => string} deps.getPlayerColor
 * @param {(tag: string)  => string} deps.getTagStyle
 * @param {Object}                  deps.BRACKET_COLORS
 * @param {(val) => string}         deps.formatBracket
 * @param {(identity: string[]) => string} deps.getColorPips
 */
export function initInsight(deps) {
    _getAllDecks    = deps.getAllDecks;
    _getAllPlayers  = deps.getAllPlayers;
    _getPlayerColor = deps.getPlayerColor;
    _getTagStyle    = deps.getTagStyle;
    _BRACKET_COLORS = deps.BRACKET_COLORS;
    _formatBracket  = deps.formatBracket;
    _getColorPips   = deps.getColorPips;

    const select = document.getElementById('insightPlayerSelect');
    select.addEventListener('change', () => {
        selectedInsightPlayer = select.value || null;
        selectedInsightDeckId = null;
        renderInsightTab();
    });

    // Default to first player alphabetically once data is available
    const allPlayers = _getAllPlayers();
    if (allPlayers.length > 0 && !selectedInsightPlayer) {
        const sorted = [...allPlayers].sort((a, b) => a.name.localeCompare(b.name));
        selectedInsightPlayer = sorted[0].name;
    }

    window.selectInsightDeck = (deckId) => {
        selectedInsightDeckId = selectedInsightDeckId === deckId ? null : deckId;
        const playerDecks = _getAllDecks().filter(d => d.player === selectedInsightPlayer);
        initBarChart(playerDecks, document.getElementById('insightStatSelect')?.value || 'gamesPlayed');
    };
}

/**
 * Re-renders the insight tab. Call whenever the active player changes
 * or the underlying deck data is refreshed.
 */
export function renderInsightTab() {
    const detailContainer = document.getElementById('insightDetailView');
    const select          = document.getElementById('insightPlayerSelect');

    const allPlayers = _getAllPlayers();
    const allDecks   = _getAllDecks();

    // Keep dropdown options in sync with current player list
    const currentVal = select.value;
    select.innerHTML = '<option value="">Select a player...</option>' +
        allPlayers.map(p =>
            `<option value="${p.name}" ${p.name === selectedInsightPlayer ? 'selected' : ''}
                style="color: ${p.color}; font-weight: 800;">${p.name}</option>`
        ).join('');
    if (currentVal && allPlayers.some(p => p.name === currentVal)) {
        select.value = currentVal;
    }

    // Default to first player alphabetically if nothing is selected yet
    if (!selectedInsightPlayer && allPlayers.length > 0) {
        const sorted = [...allPlayers].sort((a, b) => a.name.localeCompare(b.name));
        selectedInsightPlayer = sorted[0].name;
        select.value = selectedInsightPlayer;
    }

    if (!selectedInsightPlayer) {
        detailContainer.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: var(--text-dim);">
                <div style="font-size: 3rem; margin-bottom: 12px;">🧙</div>
                <div style="font-weight: 800; font-size: 1rem;">Select a player to view their insight</div>
            </div>`;
        return;
    }

    const playerDecks = allDecks
        .filter(d => d.player === selectedInsightPlayer)
        .sort((a, b) => {
            const aIsMisc = (a.deckName || '').toLowerCase() === 'misc';
            const bIsMisc = (b.deckName || '').toLowerCase() === 'misc';
            if (aIsMisc && !bIsMisc) return 1;
            if (bIsMisc && !aIsMisc) return -1;
            return 0;
        });
    const playerColor  = _getPlayerColor(selectedInsightPlayer);
    const playerObj    = _getAllPlayers().find(p => p.name === selectedInsightPlayer);
    const archidektUrl = playerObj?.archidektUrl || '';

    const playerStats = playerDecks.reduce((acc, d) => ({
        games:    acc.games    + (d.gamesPlayed || ((d.wins || 0) + (d.losses || 0)) || 0),
        blood:    acc.blood    + (d.firstBloodCount  || 0),
        ramp:     acc.ramp     + (d.mostRampCount    || 0),
        draw:     acc.draw     + (d.mostDrawCount    || 0),
        first:    acc.first    + (d.wentFirstCount   || 0),
        last:     acc.last     + (d.wentLastCount    || 0),
        mulligan: acc.mulligan + (d.mulliganCount    || 0),
    }), { games: 0, blood: 0, ramp: 0, draw: 0, first: 0, last: 0, mulligan: 0 });

    detailContainer.innerHTML = `
        <div class="card" style="margin-bottom: 15px; padding: 18px; border-left: 5px solid ${playerColor}; background: linear-gradient(90deg, var(--surface) 0%, rgba(0,0,0,0.2) 100%);">
            <div style="display: flex; gap: 20px; align-items: center; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 220px;">
                    <h1 style="margin: 0; font-size: 2rem; font-weight: 900; color: ${playerColor}; text-transform: uppercase; letter-spacing: -1px;">${selectedInsightPlayer}</h1>
                    <p style="margin: 2px 0 0; color: var(--text-dim); font-weight: 800; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px;">Overall Performance</p>
                    ${archidektUrl ? `
                    <a href="${archidektUrl}" target="_blank" rel="noopener noreferrer"
                       style="display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; padding: 6px 14px; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: var(--text-main); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; text-decoration: none; transition: background 0.15s ease, border-color 0.15s ease;"
                       onmouseover="this.style.background='rgba(255,255,255,0.13)'; this.style.borderColor='rgba(255,255,255,0.3)';"
                       onmouseout="this.style.background='rgba(255,255,255,0.07)'; this.style.borderColor='rgba(255,255,255,0.15)';">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        Archidekt Profile
                    </a>` : ''}
                    <div class="stat-badges" style="margin-top: 12px; background: rgba(0,0,0,0.3); padding: 10px; gap: 8px;">
                        <div class="stat-badge-pill pill-blood">FIRST BLOOD <b>${playerStats.blood}</b></div>
                        <div class="stat-badge-pill pill-ramp">MOST RAMP <b>${playerStats.ramp}</b></div>
                        <div class="stat-badge-pill pill-draw">MOST DRAW <b>${playerStats.draw}</b></div>
                        <div class="stat-badge-pill pill-first">WENT FIRST <b>${playerStats.first}</b></div>
                        <div class="stat-badge-pill pill-last">WENT LAST <b>${playerStats.last}</b></div>
                        <div class="stat-badge-pill pill-mulligan">2+ MULLIGANS <b>${playerStats.mulligan}</b></div>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 150px;">
                    <label style="font-size:0.6rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; letter-spacing:1px;">Deck Color Identity</label>
                    <div style="height: 140px; width: 100%; position: relative;"><canvas id="colorPieChart"></canvas></div>
                </div>
                <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 150px;">
                    <label style="font-size:0.6rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; letter-spacing:1px;">Play % Color Identity</label>
                    <div style="height: 140px; width: 100%; position: relative;"><canvas id="playRatePieChart"></canvas></div>
                </div>
            </div>
        </div>

        <div class="insight-grid">
            <div id="insightDeckList" style="display: flex; flex-direction: column; gap: 15px;">
                ${playerDecks.map(deck => {
                    const total   = deck.gamesPlayed || ((deck.wins || 0) + (deck.losses || 0)) || 0;
                    const bgArt   = deck.commanderImage ? `url(${deck.commanderImage})` : 'none';
                    const calcPct = (val) => total > 0 ? ` (${((val / total) * 100).toFixed(0)}%)` : ' (0%)';
                    const isMisc  = (deck.deckName || '').toLowerCase() === 'misc';
                    return `
                        <div class="deck-card ${deck.id === selectedInsightDeckId ? 'selected' : ''}"
                             onclick="selectInsightDeck('${deck.id}')"
                             style="--commander-art: ${bgArt}; cursor: pointer;">
                            <div class="deck-header">
                                <div style="display: flex; align-items: flex-start; justify-content: space-between; width: 100%;">
                                    <div>
                                        <h3 style="margin:0; font-size:1.5rem; display: flex; align-items: center; gap: 8px;">
                                            ${isMisc ? '' : `<span style="font-size: 1.2rem; letter-spacing: -3px;">${_getColorPips(deck.colorIdentity)}</span>`}
                                            ${deck.deckName}
                                            ${isMisc ? '' : `<span style="font-size: 1.0rem; color: white; background: ${_BRACKET_COLORS[deck.bracket] || 'var(--accent)'}; padding: 1px 5px; border-radius: 4px;">${_formatBracket(deck.bracket)}</span>`}
                                        </h3>
                                        <div class="deck-tags-grid" style="margin-top: 5px;">
                                            ${(deck.deckTags || []).map(t => `<span class="individual-tag" style="${_getTagStyle(t)}">${t}</span>`).join('')}
                                        </div>
                                    </div>
                                    ${isMisc ? '' : `<button class="player-edit-btn" onclick="event.stopPropagation(); handleEditDeckSettingsTrigger('${deck.id}')">✏️</button>`}
                                </div>
                            </div>
                            <div class="stat-badges">
                                <div class="stat-badge-pill" style="background:rgba(255,255,255,0.1);">GAMES <b>${total}</b></div>
                                <div class="stat-badge-pill pill-blood">BLOOD <b>${deck.firstBloodCount || 0}${calcPct(deck.firstBloodCount)}</b></div>
                                <div class="stat-badge-pill pill-ramp">RAMP <b>${deck.mostRampCount || 0}${calcPct(deck.mostRampCount)}</b></div>
                                <div class="stat-badge-pill pill-draw">MOST DRAW <b>${deck.mostDrawCount || 0}${calcPct(deck.mostDrawCount)}</b></div>
                                <div class="stat-badge-pill pill-first">1ST <b>${deck.wentFirstCount || 0}${calcPct(deck.wentFirstCount)}</b></div>
                                <div class="stat-badge-pill pill-last">LAST <b>${deck.wentLastCount || 0}${calcPct(deck.wentLastCount)}</b></div>
                                <div class="stat-badge-pill pill-mulligan">MULLIGAN <b>${deck.mulliganCount || 0}${calcPct(deck.mulliganCount)}</b></div>
                            </div>
                        </div>`;
                }).join('')}
            </div>

            <div class="insight-stats-card">
                <div class="chart-controls">
                    <select id="insightStatSelect" style="margin:0;">
                        <option value="gamesPlayed">Games Played</option>
                        <option value="solRingOpening">Sol Ring</option>
                        <option value="mulliganCount">2+ Mulligans</option>
                        <option value="firstBloodCount">First Blood</option>
                        <option value="mostRampCount">Most Ramp</option>
                        <option value="mostDrawCount">Most Draw</option>
                        <option value="wentFirstCount">Went First</option>
                        <option value="wentLastCount">Went Last</option>
                    </select>
                </div>
                <canvas id="insightChart"></canvas>
            </div>
        </div>`;

    const currentStat = document.getElementById('insightStatSelect').value;
    initBarChart(playerDecks, currentStat);
    initPieChart(playerDecks);
    initPlayRatePieChart(playerDecks);
    document.getElementById('insightStatSelect').onchange = (e) => initBarChart(playerDecks, e.target.value);
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

function initBarChart(decks, stat = 'gamesPlayed') {
    const canvas = document.getElementById('insightChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (activeBarChart) {
        activeBarChart.destroy();
        activeBarChart = null;
    }

    const getValue = (deck) => {
        if (stat === 'gamesPlayed') return deck.gamesPlayed || ((deck.wins || 0) + (deck.losses || 0)) || 0;
        return deck[stat] || 0;
    };

    const sortedDecks = [...decks].sort((a, b) => {
        const aIsMisc = (a.deckName || '').toLowerCase() === 'misc';
        const bIsMisc = (b.deckName || '').toLowerCase() === 'misc';
        if (aIsMisc && !bIsMisc) return 1;
        if (bIsMisc && !aIsMisc) return -1;
        return getValue(b) - getValue(a);
    });
    const dataLabels  = sortedDecks.map(d => d.deckName);
    const dataValues  = sortedDecks.map(d => getValue(d));

    const PALETTE = ["#3d85ff", "#ff4444", "#4caf50", "#ffeb3b", "#9c27b0", "#ff9800", "#00bcd4", "#e91e63"];
    const backgroundColors = sortedDecks.map((d, i) => {
        const base = PALETTE[i % PALETTE.length];
        return selectedInsightDeckId === null
            ? base + "cc"
            : (d.id === selectedInsightDeckId ? base : base + "22");
    });

    const calculatedHeight = (sortedDecks.length * 18) + 30;
    canvas.style.height = `${calculatedHeight}px`;

    activeBarChart = new Chart(ctx, {
        type: 'bar',
        plugins: [ChartDataLabels],
        data: {
            labels: dataLabels,
            datasets: [{
                data: dataValues,
                backgroundColor: backgroundColors,
                borderWidth: 0,
                borderRadius: 3,
                barPercentage: 0.9,
                categoryPercentage: 0.9
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 750, easing: 'easeInOutQuart' },
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
                        font: { weight: 'bold', size: 10 }
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: 'rgba(0,0,0,0.8)' },
                datalabels: {
                    color: '#ffffff',
                    anchor: 'end',
                    align: 'right',
                    offset: 5,
                    font: { weight: 'bold', size: 10 },
                    formatter: (value) => value
                }
            }
        }
    });
}

function initPieChart(decks) {
    const canvas = document.getElementById('colorPieChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (activePieChart) {
        activePieChart.destroy();
        activePieChart = null;
    }

    // Weighted color distribution — each deck contributes 1 total weight split across its colors
    // Misc decks are excluded as they're a stat catch-all, not a real deck
    const colorTotals = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    let colorlessCount = 0;

    const realDecks = decks.filter(d => (d.deckName || '').toLowerCase() !== 'misc');
    realDecks.forEach(deck => {
        const colors = (deck.colorIdentity || []).filter(c => Object.prototype.hasOwnProperty.call(colorTotals, c));
        if (colors.length > 0) {
            const weight = 1 / colors.length;
            colors.forEach(c => { colorTotals[c] += weight; });
        } else {
            colorlessCount += 1;
        }
    });

    const colorMap = {
        W: { label: 'White',     color: '#f0e6c0' },
        U: { label: 'Blue',      color: '#1a7ddd' },
        B: { label: 'Black',     color: '#6b5e52' },
        R: { label: 'Red',       color: '#d63b20' },
        G: { label: 'Green',     color: '#2a9640' },
    };

    const labels   = [];
    const data     = [];
    const bgColors = [];

    Object.keys(colorTotals).forEach(key => {
        if (colorTotals[key] > 0) {
            labels.push(colorMap[key].label);
            data.push(parseFloat(colorTotals[key].toFixed(2)));
            bgColors.push(colorMap[key].color);
        }
    });

    if (colorlessCount > 0) {
        labels.push('Colorless');
        data.push(colorlessCount);
        bgColors.push('#9e9e9e');
    }

    if (data.length === 0) return;

    activePieChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: bgColors,
                borderWidth: 2,
                borderColor: 'rgba(0,0,0,0.4)',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label(context) {
                            const value = context.raw || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            return ` ${context.label}: ${((value / total) * 100).toFixed(1)}%`;
                        }
                    }
                }
            }
        }
    });
}

function initPlayRatePieChart(decks) {
    const canvas = document.getElementById('playRatePieChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (activePlayRatePieChart) {
        activePlayRatePieChart.destroy();
        activePlayRatePieChart = null;
    }

    // Weight each color by the deck's actual games played, split across its colors.
    // Ex: a {R}{B} deck with 9 games contributes 4.5 to R and 4.5 to B.
    // Misc decks are excluded.
    const colorTotals = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    let colorlessGames = 0;

    const realDecks = decks.filter(d => (d.deckName || '').toLowerCase() !== 'misc');
    realDecks.forEach(deck => {
        const games  = deck.gamesPlayed || ((deck.wins || 0) + (deck.losses || 0)) || 0;
        const colors = (deck.colorIdentity || []).filter(c => Object.prototype.hasOwnProperty.call(colorTotals, c));
        if (colors.length > 0) {
            const weight = games / colors.length;
            colors.forEach(c => { colorTotals[c] += weight; });
        } else {
            colorlessGames += games;
        }
    });

    const colorMap = {
        W: { label: 'White',    color: '#f0e6c0' },
        U: { label: 'Blue',     color: '#1a7ddd' },
        B: { label: 'Black',    color: '#6b5e52' },
        R: { label: 'Red',      color: '#d63b20' },
        G: { label: 'Green',    color: '#2a9640' },
    };

    const labels   = [];
    const data     = [];
    const bgColors = [];

    Object.keys(colorTotals).forEach(key => {
        if (colorTotals[key] > 0) {
            labels.push(colorMap[key].label);
            data.push(parseFloat(colorTotals[key].toFixed(2)));
            bgColors.push(colorMap[key].color);
        }
    });

    if (colorlessGames > 0) {
        labels.push('Colorless');
        data.push(colorlessGames);
        bgColors.push('#9e9e9e');
    }

    if (data.length === 0) return;

    activePlayRatePieChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: bgColors,
                borderWidth: 2,
                borderColor: 'rgba(0,0,0,0.4)',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label(context) {
                            const value = context.raw || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            return ` ${context.label}: ${((value / total) * 100).toFixed(1)}%`;
                        }
                    }
                }
            }
        }
    });
}