// -----------------------------------------------------------------------------
// File: static/app.js
// Project: snap-coin-msg
// Description: Frontend logic - WebSocket client, keyboard, conversation views
// Version: 0.3.0
// -----------------------------------------------------------------------------

const state = {
    ws: null,
    dictionary: {},
    activeCategory: null,
    activeWalletId: null,
    contactAddress: null,
    composeTokens: [],
    contacts: {},
    wallets: {},
};

// -----------------------------------------------------------------------------
// WEBSOCKET - app connection
// -----------------------------------------------------------------------------
function connectWs() {
    const ws = new WebSocket(`ws://${location.host}/ws`);

    ws.onopen = () => setAppStatus(true);
    ws.onclose = () => {
        setAppStatus(false);
        setTimeout(connectWs, 3000);
    };
    ws.onmessage = (e) => {
        const event = JSON.parse(e.data);
        appendLedgerEntry(event);
    };

    state.ws = ws;
}

function setAppStatus(connected) {
    const dot   = document.getElementById('app-status-dot');
    const label = document.getElementById('app-status-label');
    dot.className   = `status-dot ${connected ? 'connected' : 'disconnected'}`;
    label.textContent = `app: ${connected ? 'connected' : 'disconnected'}`;
}

// -----------------------------------------------------------------------------
// NODE STATUS - separate poll
// -----------------------------------------------------------------------------
async function pollNodeStatus() {
    try {
        const res = await fetch('/api/node/status');
        if (res.ok) {
            const data = await res.json();
            setNodeStatus(data.online, data.addr);
        } else {
            setNodeStatus(false, '');
        }
    } catch {
        setNodeStatus(false, '');
    }
}

function setNodeStatus(online, addr) {
    const dot   = document.getElementById('node-status-dot');
    const label = document.getElementById('node-status-label');
    dot.className     = `status-dot ${online ? 'node-online' : 'node-offline'}`;
    label.textContent = `node: ${online ? 'online' : 'offline'}${addr ? ' ' + addr : ''}`;
}

// -----------------------------------------------------------------------------
// DICTIONARY
// -----------------------------------------------------------------------------
async function loadDictionary() {
    const res = await fetch('/api/dictionary');
    if (!res.ok) return;
    state.dictionary = await res.json();
    buildKeyboardTabs();
}

function buildKeyboardTabs() {
    const tabs = document.getElementById('keyboard-tabs');
    tabs.innerHTML = '';

    const categories = [...new Set(
        Object.values(state.dictionary.entries || {}).map(e => e.category)
    )].sort();

    categories.unshift('custom');

    categories.forEach((cat, i) => {
        const btn = document.createElement('button');
        btn.className = `keyboard-tab${i === 1 ? ' active' : ''}`;
        btn.textContent = cat.toUpperCase();
        btn.dataset.category = cat;
        btn.onclick = () => selectKeyboardTab(cat);
        tabs.appendChild(btn);
    });

    selectKeyboardTab(categories[1] || 'custom');
}

function selectKeyboardTab(category) {
    state.activeCategory = category;

    document.querySelectorAll('.keyboard-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.category === category);
    });

    const keys = document.getElementById('keyboard-keys');
    keys.innerHTML = '';

    const entries = state.dictionary.entries || {};

    Object.entries(entries)
        .filter(([, e]) => e.category === category)
        .sort((a, b) => a[1].amount.localeCompare(b[1].amount))
        .forEach(([token, entry]) => {
            const btn = document.createElement('button');
            btn.className = `key-btn${entry.type === 'phrase' ? ' phrase' : ''}`;
            btn.textContent = entry.display || token;
            btn.title = `${entry.amount}  —  ${entry.meaning}`;
            btn.onclick = () => addToken(token);
            keys.appendChild(btn);
        });
}

// -----------------------------------------------------------------------------
// COMPOSE
// -----------------------------------------------------------------------------
function addToken(token) {
    state.composeTokens.push(token);
    renderCompose();
}

function renderCompose() {
    const area = document.getElementById('compose-tokens');
    area.innerHTML = '';
    state.composeTokens.forEach((token, i) => {
        const span = document.createElement('span');
        span.className = 'compose-token';
        span.textContent = token;
        span.title = 'click to remove';
        span.onclick = () => {
            state.composeTokens.splice(i, 1);
            renderCompose();
        };
        area.appendChild(span);
    });
}

document.getElementById('btn-clear').onclick = () => {
    state.composeTokens = [];
    renderCompose();
};

document.getElementById('btn-send').onclick = async () => {
    if (!state.composeTokens.length)  { alert('compose a message first'); return; }
    if (!state.activeWalletId)         { alert('select a wallet first');   return; }
    if (!state.contactAddress)         { alert('select a contact first');  return; }

    const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            tokens:         state.composeTokens,
            from_wallet_id: state.activeWalletId,
            to_address:     state.contactAddress,
            pin:            '',
        }),
    });

    if (res.ok) {
        state.composeTokens = [];
        renderCompose();
    } else {
        alert('send failed');
    }
};

// -----------------------------------------------------------------------------
// LEDGER
// -----------------------------------------------------------------------------
function appendLedgerEntry(event) {
    const isOutbound = event.from === state.activeWalletId;
    appendRaw(event, isOutbound);
    appendDecoded(event, isOutbound);
}

function appendRaw(event, isOutbound) {
    const container = document.getElementById('raw-entries');
    const entry = document.createElement('div');
    entry.className = `ledger-entry ${isOutbound ? 'outbound' : 'inbound'}`;
    entry.innerHTML = `
        <span class="entry-from">${resolveAddr(event.from)}</span>
        <span class="entry-arrow">→</span>
        <span class="entry-to">${resolveAddr(event.to)}</span>
        <span class="entry-amount">${event.amount}</span>
    `;
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
}

function appendDecoded(event, isOutbound) {
    const container = document.getElementById('decoded-entries');
    const entry = document.createElement('div');
    entry.className = `ledger-entry ${isOutbound ? 'outbound' : 'inbound'}`;
    entry.innerHTML = `
        <span class="entry-from">${resolveAddr(event.from)}</span>
        <span class="entry-arrow">→</span>
        <span class="entry-to">${resolveAddr(event.to)}</span>
        <span class="entry-category">[${(event.category || '').toUpperCase()}]</span>
        <span class="entry-meaning">${event.meaning}</span>
    `;
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
}

// -----------------------------------------------------------------------------
// LEDGER TABS
// -----------------------------------------------------------------------------
document.querySelectorAll('.ledger-tab').forEach(tab => {
    tab.onclick = () => {
        document.querySelectorAll('.ledger-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const mode    = tab.dataset.tab;
        const decoded = document.getElementById('ledger-decoded');
        const raw     = document.getElementById('ledger-raw');

        decoded.classList.remove('active');
        raw.classList.remove('active');

        if (mode === 'decoded')  decoded.classList.add('active');
        else if (mode === 'raw') raw.classList.add('active');
        else { decoded.classList.add('active'); raw.classList.add('active'); }
    };
});

// -----------------------------------------------------------------------------
// WALLETS
// -----------------------------------------------------------------------------
async function loadWallets() {
    const res = await fetch('/api/wallets');
    if (!res.ok) return;
    const data = await res.json();
    state.wallets = {};
    data.wallets.forEach(w => state.wallets[w.id] = w);
    renderWallets();
}

function renderWallets() {
    const list   = document.getElementById('wallet-list');
    const select = document.getElementById('active-wallet-select');
    list.innerHTML = '';
    select.innerHTML = '<option value="">select wallet</option>';

    Object.values(state.wallets).forEach(w => {
        const item = document.createElement('div');
        item.className = 'wallet-item';
        item.innerHTML = `
            <span class="item-name">${w.label}</span>
            <span class="item-address">${w.address}</span>
        `;
        item.onclick = () => {
            state.activeWalletId = w.id;
            select.value = w.id;
            document.getElementById('convo-wallet-a').textContent = w.label || shortAddr(w.address);
            document.querySelectorAll('.wallet-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        };
        list.appendChild(item);

        const opt = document.createElement('option');
        opt.value = w.id;
        opt.textContent = w.label;
        select.appendChild(opt);
    });
}

document.getElementById('active-wallet-select').onchange = (e) => {
    state.activeWalletId = e.target.value;
    const w = state.wallets[e.target.value];
    if (w) document.getElementById('convo-wallet-a').textContent = w.label || shortAddr(w.address);
};

document.getElementById('btn-add-wallet').onclick = () => {
    showModal('ADD WALLET', `
        <label class="modal-label">label</label>
        <input class="modal-input" id="m-label" placeholder="my wallet">
        <label class="modal-label">address</label>
        <input class="modal-input" id="m-address" placeholder="SNAP address">
        <label class="modal-label">private key</label>
        <input class="modal-input" id="m-key" type="password" placeholder="private key">
        <label class="modal-label">PIN</label>
        <input class="modal-input" id="m-pin" type="password" placeholder="wallet PIN">
    `, async () => {
        const id = `w_${Date.now()}`;
        await fetch('/api/wallets/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id,
                label:       document.getElementById('m-label').value,
                address:     document.getElementById('m-address').value,
                private_key: document.getElementById('m-key').value,
                pin:         document.getElementById('m-pin').value,
            }),
        });
        await loadWallets();
    });
};

// -----------------------------------------------------------------------------
// CONTACTS
// -----------------------------------------------------------------------------
async function loadContacts() {
    const res = await fetch('/api/contacts');
    if (!res.ok) return;
    const data = await res.json();
    state.contacts = {};
    data.contacts.forEach(c => state.contacts[c.id] = c);
    renderContacts();
}

function renderContacts() {
    const list = document.getElementById('contact-list');
    list.innerHTML = '';
    Object.values(state.contacts).forEach(c => {
        const item = document.createElement('div');
        item.className = 'contact-item';
        item.innerHTML = `
            <span class="item-name">${c.nickname}</span>
            <span class="item-address">${c.address}</span>
        `;
        item.onclick = () => {
            state.contactAddress = c.address;
            document.getElementById('convo-wallet-b').textContent = c.nickname || shortAddr(c.address);
            document.querySelectorAll('.contact-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        };
        list.appendChild(item);
    });
}

document.getElementById('btn-add-contact').onclick = () => {
    showModal('ADD CONTACT', `
        <label class="modal-label">nickname</label>
        <input class="modal-input" id="m-nick" placeholder="name">
        <label class="modal-label">address</label>
        <input class="modal-input" id="m-addr" placeholder="SNAP address">
    `, async () => {
        const id = `c_${Date.now()}`;
        await fetch('/api/contacts/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id,
                nickname: document.getElementById('m-nick').value,
                address:  document.getElementById('m-addr').value,
            }),
        });
        await loadContacts();
    });
};

// -----------------------------------------------------------------------------
// WATCHLIST
// -----------------------------------------------------------------------------
async function loadWatchlist() {
    const res = await fetch('/api/watchlist');
    if (!res.ok) return;
    const data = await res.json();
    renderWatchlist(data.pairs);
}

function renderWatchlist(pairs) {
    const list = document.getElementById('watch-list');
    list.innerHTML = '';
    pairs.forEach(p => {
        const item = document.createElement('div');
        item.className = 'watch-item';
        item.innerHTML = `
            <span class="item-name">${p.label || 'pair'}</span>
            <span class="item-address">${shortAddr(p.wallet_a)} ⇄ ${shortAddr(p.wallet_b)}</span>
        `;
        list.appendChild(item);
    });
}

document.getElementById('btn-add-watch').onclick = () => {
    showModal('WATCH PAIR', `
        <label class="modal-label">wallet A</label>
        <input class="modal-input" id="m-wa" placeholder="SNAP address">
        <label class="modal-label">wallet B</label>
        <input class="modal-input" id="m-wb" placeholder="SNAP address">
        <label class="modal-label">label (optional)</label>
        <input class="modal-input" id="m-wl" placeholder="label">
    `, async () => {
        await fetch('/api/watchlist/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                wallet_a: document.getElementById('m-wa').value,
                wallet_b: document.getElementById('m-wb').value,
                label:    document.getElementById('m-wl').value || null,
            }),
        });
        await loadWatchlist();
    });
};

// -----------------------------------------------------------------------------
// MODAL
// -----------------------------------------------------------------------------
function showModal(title, bodyHtml, onConfirm) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.getElementById('modal-confirm').onclick = async () => {
        await onConfirm();
        closeModal();
    };
}

document.getElementById('modal-cancel').onclick = closeModal;

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('modal-body').innerHTML = '';
}

// -----------------------------------------------------------------------------
// UTILS
// -----------------------------------------------------------------------------
function shortAddr(addr) {
    if (!addr || addr.length < 12) return addr || '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function resolveAddr(addr) {
    const contact = Object.values(state.contacts).find(c => c.address === addr);
    if (contact) return contact.nickname;
    const wallet = Object.values(state.wallets).find(w => w.address === addr);
    if (wallet) return wallet.label;
    return shortAddr(addr);
}

// -----------------------------------------------------------------------------
// INIT
// -----------------------------------------------------------------------------
async function init() {
    connectWs();
    await loadWallets();
    await loadContacts();
    await loadWatchlist();
    await loadDictionary();
    pollNodeStatus();
    setInterval(pollNodeStatus, 10000);
}

init();

// -----------------------------------------------------------------------------
// File: static/app.js
// Project: snap-coin-msg
// Created: 2026-03-19
// -----------------------------------------------------------------------------