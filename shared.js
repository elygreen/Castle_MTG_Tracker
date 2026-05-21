/**
 * shared.js
 * Firebase initialisation, authentication, shared state, and helper functions
 * used across all pages of the Castle MTG Stat Tracker.
 *
 * Every page script imports from here instead of re-initialising Firebase.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getRemoteConfig, getValue, fetchAndActivate } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-remote-config.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ---------------------------------------------------------------------------
// Firebase
// ---------------------------------------------------------------------------

const firebaseConfig = {
    apiKey: "AIzaSyDAT1UIM1mFMH1vh_Wal4SqXOY6NSr0_6c",
    authDomain: "castle-mtg-stat-tracker.firebaseapp.com",
    projectId: "castle-mtg-stat-tracker",
    storageBucket: "castle-mtg-stat-tracker.firebasestorage.app",
    messagingSenderId: "503581755862",
    appId: "1:503581755862:web:10222b71ae270b6ca03c77"
};

const _app = initializeApp(firebaseConfig);
export const db = getFirestore(_app);

const remoteConfig = getRemoteConfig(_app);
remoteConfig.settings.minimumFetchIntervalMillis = 3600000;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function getPasswords() {
    await fetchAndActivate(remoteConfig);
    return {
        ADMIN: getValue(remoteConfig, "admin_password").asString(),
        USER:  getValue(remoteConfig, "user_password").asString()
    };
}

/**
 * Checks (or prompts for) the session password via an in-page overlay.
 * @returns {Promise<string|false>} The access level ('admin'|'user') or false.
 */
// ---------------------------------------------------------------------------
// Login modal (reusable, non-blocking)
// ---------------------------------------------------------------------------

function buildLoginModal(PASSWORDS, onSuccess) {
    const overlay = document.createElement('div');
    overlay.id = 'authOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
        <div style="background:#1e2124;border:1px solid #2f3338;border-radius:16px;padding:40px 36px;width:100%;max-width:360px;box-shadow:0 24px 64px rgba(0,0,0,0.7);display:flex;flex-direction:column;gap:20px;">
            <div style="text-align:center;">
                <div style="font-size:2rem;margin-bottom:8px;">&#x1F3F0;</div>
                <h1 style="margin:0;font-size:1.3rem;font-weight:800;color:white;letter-spacing:-0.3px;">Admin Login</h1>
                <p style="margin:6px 0 0;font-size:0.8rem;color:#8e9297;">Enter the admin password to continue</p>
            </div>
            <div style="position:relative;">
                <input id="authPasswordInput" type="password" placeholder="Password" autocomplete="current-password"
                    style="width:100%;box-sizing:border-box;background:#121416;border:1px solid #2f3338;border-radius:8px;color:white;padding:12px 44px 12px 14px;font-size:14px;outline:none;transition:border-color 0.15s ease,box-shadow 0.15s ease;">
                <button id="authToggleVisibility" type="button"
                    style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#8e9297;font-size:0.85rem;padding:4px;">&#x1F441;</button>
            </div>
            <div id="authError" style="display:none;font-size:0.78rem;color:#ff4444;background:rgba(255,68,68,0.1);border:1px solid rgba(255,68,68,0.25);border-radius:6px;padding:8px 12px;text-align:center;">
                Incorrect password. Try again.
            </div>
            <button id="authSubmitBtn"
                style="background:#3d85ff;color:white;border:none;border-radius:8px;padding:12px;font-size:0.9rem;font-weight:700;cursor:pointer;width:100%;">
                Enter
            </button>
            <button id="authCancelBtn"
                style="background:none;color:#8e9297;border:none;font-size:0.8rem;cursor:pointer;padding:4px;">
                Cancel
            </button>
        </div>
    `;
    document.body.appendChild(overlay);
    const input     = overlay.querySelector('#authPasswordInput');
    const submitBtn = overlay.querySelector('#authSubmitBtn');
    const errorEl   = overlay.querySelector('#authError');
    const toggleBtn = overlay.querySelector('#authToggleVisibility');
    const cancelBtn = overlay.querySelector('#authCancelBtn');

    setTimeout(() => input.focus(), 50);

    toggleBtn.addEventListener('click', () => {
        input.type = input.type === 'password' ? 'text' : 'password';
        toggleBtn.textContent = input.type === 'password' ? '\u{1F441}' : '\u{1F648}';
    });
    input.addEventListener('focus', () => { input.style.borderColor='#3d85ff'; input.style.boxShadow='0 0 0 3px rgba(61,133,255,0.15)'; });
    input.addEventListener('blur',  () => { input.style.borderColor='#2f3338'; input.style.boxShadow='none'; });

    function closeModal() {
        overlay.style.transition = 'opacity 0.2s ease';
        overlay.style.opacity    = '0';
        setTimeout(() => overlay.remove(), 200);
    }

    cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    function attempt() {
        const entry = input.value;
        if (entry === PASSWORDS.ADMIN) {
            sessionStorage.setItem('mtg_access_level', 'admin');
            closeModal();
            onSuccess('admin');
            window.location.reload();
        } else if (entry === PASSWORDS.USER) {
            sessionStorage.setItem('mtg_access_level', 'user');
            closeModal();
            onSuccess('user');
            window.location.reload();
        } else {
            errorEl.style.display = 'block';
            input.style.borderColor = '#ff4444';
            input.style.boxShadow   = '0 0 0 3px rgba(255,68,68,0.15)';
            input.value = '';
            setTimeout(() => input.focus(), 50);
        }
    }

    submitBtn.addEventListener('click', attempt);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') attempt(); });
}

// ---------------------------------------------------------------------------
// Login button injected into every page header
// ---------------------------------------------------------------------------

export async function initAuthButton() {
    const PASSWORDS = await getPasswords();
    const level = sessionStorage.getItem('mtg_access_level');

    const btn = document.createElement('button');
    btn.id = 'authHeaderBtn';

    function updateBtn(currentLevel) {
        if (currentLevel === 'admin') {
            btn.textContent = '\u{1F513} Admin';
            btn.style.cssText = 'position:absolute;top:0;right:0;background:rgba(61,133,255,0.15);color:#3d85ff;border:1px solid rgba(61,133,255,0.3);border-radius:8px;padding:7px 14px;font-size:0.75rem;font-weight:800;cursor:pointer;letter-spacing:0.5px;';
            btn.onclick = () => {
                sessionStorage.removeItem('mtg_access_level');
                window.location.reload();
            };
        } else if (currentLevel === 'user') {
            btn.textContent = '\u{1F513} User';
            btn.style.cssText = 'position:absolute;top:0;right:0;background:rgba(76,175,80,0.15);color:#4caf50;border:1px solid rgba(76,175,80,0.3);border-radius:8px;padding:7px 14px;font-size:0.75rem;font-weight:800;cursor:pointer;letter-spacing:0.5px;';
            btn.onclick = () => {
                sessionStorage.removeItem('mtg_access_level');
                window.location.reload();
            };
        } else {
            btn.textContent = '\u{1F512} Login';
            btn.style.cssText = 'position:absolute;top:0;right:0;background:rgba(255,255,255,0.06);color:#8e9297;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:7px 14px;font-size:0.75rem;font-weight:800;cursor:pointer;letter-spacing:0.5px;';
            btn.onclick = () => {
                buildLoginModal(PASSWORDS, (newLevel) => {
                    updateBtn(newLevel);
                    const adminPages = ['standings.html', 'insight.html', 'database.html'];
                    const current = window.location.pathname.split('/').pop();
                    if (adminPages.includes(current)) window.location.reload();
                });
            };
        }
    }

    updateBtn(level);

    const header = document.querySelector('header');
    if (header) {
        header.style.position = 'relative';
        header.appendChild(btn);
    }
}

// ---------------------------------------------------------------------------
// Auth check
// ---------------------------------------------------------------------------

export async function checkAuth(requireAdmin = false) {
    document.body.classList.add('auth-passed');
    const level = sessionStorage.getItem('mtg_access_level') || 'guest';

    // Apply role class so CSS can restrict UI by auth state
    document.body.classList.remove('role-guest', 'role-user', 'role-admin');
    document.body.classList.add(`role-${level}`);

    // requireAdmin === 'admin' → strict admin-only (standings, insight)
    // requireAdmin === true    → any logged-in user (database, history, record)
    if (requireAdmin === 'admin' && level !== 'admin') {
        window.location.replace('record.html');
        return false;
    }
    if (requireAdmin === true && level !== 'admin' && level !== 'user') {
        window.location.replace('record.html');
        return false;
    }
    return level;
}

export function applyAccessRestrictions() {}

// ---------------------------------------------------------------------------
// Shared state  (allPlayers / allDecks live here; pages import the getters)
// ---------------------------------------------------------------------------

let _allPlayers = [];
let _allDecks   = [];

export const getAllPlayers = () => _allPlayers;
export const getAllDecks   = () => _allDecks;

export function setAllPlayers(players) { _allPlayers = players; }
export function setAllDecks(decks)     { _allDecks   = decks;   }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MODERN_COLORS = [
    "#16171a", "#7f0622", "#d62411", "#ff8426",
    "#ffd100", "#f2f3ccff", "#ff80a4", "#ff2674",
    "#94216a", "#5e1a83ff", "#234975", "#68aed4",
    "#65c227ff", "#10d275", "#007899", "#311b55ff"
];

export const BRACKET_COLORS = {
    "1":   "#9c27b0", "1.5": "#9c27b0",
    "2":   "#3d85ff", "2.5": "#3d85ff",
    "3":   "#4caf50", "3.5": "#4caf50",
    "4":   "#ff7b00", "4.5": "#ff7b00",
    "5":   "#ff4444"
};

export const TAG_COLORS = {
    "Aggro":          "#ff4444", "Aristocrats":  "#9c27b0",
    "Artifacts":      "#607d8b", "Big Mana":     "#4caf50",
    "Blink":          "#00bcd4", "Burn":         "#ff5722",
    "Combo":          "#ffeb3b", "Control":      "#2196f3",
    "Group Hug":      "#8bc34a", "Lands":        "#14a35c",
    "Lifegain":       "#fc79a4", "Midrange":     "#ff9800",
    "Mill":           "#3f51b5", "Reanimator":   "#7b5ea7",
    "Spellslinger":   "#03a9f4", "Stax":         "#856b69",
    "Tokens":         "#ffc107", "Tribal":       "#cddc39",
    "Voltron":        "#ac0505", "+1/+1 Counters": "#009688",
    "Mono Color":     "#9e9e9e", "Budget":       "#43a047",
    "Recursion":      "#673ab7", "Go Wide":      "#fdd835",
    "Goad":           "#e53935", "Graveyard":    "#8d9b8a",
    "Enchantress":    "#ab47bc", "Storm":        "#1e88e5",
    "Theft":          "#f4511e",
    "Drain":          "#5c9e8a"
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

export const getPlayerColor = (name) => {
    const player = _allPlayers.find(p => p.name === name);
    return player ? player.color : "var(--accent)";
};

export const formatBracket = (val) => {
    if (val == 5) return "cEDH";
    if (val && val.toString().includes('.5')) return val.toString().replace('.5', '+');
    return val || "1";
};

export const getColorPips = (identity) => {
    if (!identity || identity.length === 0) return '';
    const pipMap = { W: '⚪', U: '🔵', B: '⚫', R: '🔴', G: '🟢' };
    return identity.map(c => pipMap[c] || '').join('');
};

export const getColorPipsHtml = (identity) => {
    if (!identity || identity.length === 0) return '';
    const colorMap = { W: '#f9faf4', U: '#2196f3', B: '#2a2a2a', R: '#e53935', G: '#43a047' };
    const borderMap = { W: '#ccc',    U: '#1565c0', B: '#555',    R: '#b71c1c', G: '#2e7d32' };
    return identity.map(c => {
        const bg  = colorMap[c]  || '#888';
        const bd  = borderMap[c] || '#555';
        return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${bg};border:1px solid ${bd};margin-right:1px;vertical-align:middle;"></span>`;
    }).join('');
};

export const getTagStyle = (tag) => {
    const color = TAG_COLORS[tag] || "var(--text-dim)";
    return `background-color: ${color}22; color: ${color}; border: 1px solid ${color}44;`;
};

export function renderColorGrid(containerId, activeColor, onSelect) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = MODERN_COLORS.map(color => `
        <div class="color-swatch ${color === activeColor ? 'active' : ''}"
             style="background-color: ${color}"
             data-color="${color}"></div>
    `).join('');
    container.querySelectorAll('.color-swatch').forEach(swatch => {
        swatch.onclick = () => {
            container.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            onSelect(swatch.dataset.color);
        };
    });
}

// Modal — each page that needs it must have the #customModal markup in its HTML
export function openModal(title, bodyHtml, actions) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = bodyHtml;
    const actionsEl = document.getElementById('modalActions');
    actionsEl.innerHTML = '';
    actions.forEach(action => {
        const btn = document.createElement('button');
        btn.textContent = action.label;
        btn.style.backgroundColor = action.color || 'var(--border)';
        btn.onclick = () => { action.onClick(); closeModal(); };
        actionsEl.appendChild(btn);
    });
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = closeModal;
    actionsEl.appendChild(cancelBtn);
    document.getElementById('customModal').classList.add('active');
}

export function closeModal() {
    document.getElementById('customModal').classList.remove('active');
}