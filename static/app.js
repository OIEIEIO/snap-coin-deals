// -----------------------------------------------------------------------------
// File: static/app.js
// Project: snap-coin-msg
// Description: Frontend - UTXO wallet ledger, chain events, keyboard
// Version: 0.9.0
// -----------------------------------------------------------------------------

const state = {
    ws:             null,
    chainWs:        null,
    dictionary:     {},
    activeCategory: null,
    activeWalletId: null,
    activeAddress:  null,
    contactAddress: null,
    composeTokens:  [],
    contacts:       {},
    wallets:        {},
};

// -----------------------------------------------------------------------------
// WEBSOCKET - opcode messages
// -----------------------------------------------------------------------------
function connectWs() {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    ws.onopen  = () => setAppStatus(true);
    ws.onclose = () => { setAppStatus(false); setTimeout(connectWs, 3000); };
    ws.onmessage = (e) => {
        const event = JSON.parse(e.data);
        handleOpcodeEvent(event);
    };
    state.ws = ws;
}

function setAppStatus(connected) {
    document.getElementById('app-status-dot').className     = `status-dot ${connected ? 'connected' : 'disconnected'}`;
    document.getElementById('app-status-label').textContent = `app: ${connected ? 'connected' : 'disconnected'}`;
}

// -----------------------------------------------------------------------------
// WEBSOCKET - chain events
// -----------------------------------------------------------------------------
function connectChainWs() {
    const ws = new WebSocket(`ws://${location.host}/ws/chain`);
    ws.onclose = () => setTimeout(connectChainWs, 3000);
    ws.onmessage = (e) => {
        const event = JSON.parse(e.data);
        appendChainEvent(event);
        if (event.event_type === 'BLOCK' && event.height) {
            updateHeightDisplay(event.height);
        }
    };
    state.chainWs = ws;
}

// -----------------------------------------------------------------------------
// CHAIN HEIGHT
// -----------------------------------------------------------------------------
function updateHeightDisplay(height) {
    const el = document.getElementById('chain-height');
    el.textContent = height;
    el.classList.add('updated');
    setTimeout(() => el.classList.remove('updated'), 2000);
}

// -----------------------------------------------------------------------------
// CHAIN EVENTS - newest at top
// -----------------------------------------------------------------------------
function appendChainEvent(event) {
    const container = document.getElementById('col-entries-chain');
    const entry     = document.createElement('div');
    const isOpcode  = event.is_opcode && event.event_type === 'MEMPOOL';
    entry.className = `chain-entry ${event.event_type}${isOpcode ? ' opcode' : ''}`;

    if (event.event_type === 'BLOCK' && event.height) {
        entry.innerHTML = `<span class="ce-type">BLOCK</span><span class="ce-height">#${event.height}</span><span class="ce-detail">${event.detail}</span>`;
    } else {
        entry.innerHTML = `<span class="ce-type">${event.event_type}</span><span class="ce-detail">${event.detail}</span>`;
    }

    container.insertBefore(entry, container.firstChild);
    while (container.children.length > 300) container.removeChild(container.lastChild);
}

// -----------------------------------------------------------------------------
// OPCODE EVENT - pure UTXO ledger logic
// from = sender (inputs owner)
// to   = receiver (outputs receiver)
//
// wallet A: from=A → SENT outbound | to=A → RECEIVED inbound
// wallet B: from=B → SENT outbound | to=B → RECEIVED inbound
// -----------------------------------------------------------------------------
function handleOpcodeEvent(event) {
    const entries    = state.dictionary.entries || {};
    const matchEntry = Object.values(entries).find(e => e.amount === event.amount)
        || { meaning: event.meaning, amount: event.amount, category: event.category };

    if (event.from === state.activeAddress) {
        appendToCol('col-entries-a', createEntry(matchEntry, 'outbound'));
        updateBalance(state.activeAddress, 'col-balance-a');
    }

    if (event.to === state.activeAddress) {
        appendToCol('col-entries-a', createEntry(matchEntry, 'inbound'));
        updateBalance(state.activeAddress, 'col-balance-a');
    }

    if (event.from === state.contactAddress) {
        appendToCol('col-entries-b', createEntry(matchEntry, 'outbound'));
        updateBalance(state.contactAddress, 'col-balance-b');
    }

    if (event.to === state.contactAddress) {
        appendToCol('col-entries-b', createEntry(matchEntry, 'inbound'));
        updateBalance(state.contactAddress, 'col-balance-b');
    }
}

function appendToCol(colId, el) {
    const col = document.getElementById(colId);
    col.appendChild(el);
    col.scrollTop = col.scrollHeight;
}

function createEntry(entry, direction) {
    const el = document.createElement('div');
    el.className = `wallet-entry ${direction}`;
    el.innerHTML = `
        <div class="we-meaning">${entry.meaning || entry.amount}</div>
        <div>
            <span class="we-amount">${entry.amount}</span>
            <span class="we-category">[${(entry.category || '').toUpperCase()}]</span>
        </div>
    `;
    return el;
}

// -----------------------------------------------------------------------------
// NODE STATUS
// -----------------------------------------------------------------------------
async function pollNodeStatus() {
    try {
        const res  = await fetch('/api/node/status');
        const data = await res.json();
        setNodeStatus(data.online, data.addr);
    } catch {
        setNodeStatus(false, '');
    }
}

function setNodeStatus(online, addr) {
    document.getElementById('node-status-dot').className     = `status-dot ${online ? 'node-online' : 'node-offline'}`;
    document.getElementById('node-status-label').textContent = `node: ${online ? 'online' : 'offline'}${addr ? ' ' + addr : ''}`;
}

// -----------------------------------------------------------------------------
// WALLET BALANCE
// -----------------------------------------------------------------------------
async function updateBalance(address, elementId) {
    if (!address) return;
    try {
        const res  = await fetch(`/api/chain/balance/${address}`);
        const data = await res.json();
        document.getElementById(elementId).textContent = data.display + ' SNAP';
    } catch {
        document.getElementById(elementId).textContent = '';
    }
}

// -----------------------------------------------------------------------------
// REGISTER PAIR
// -----------------------------------------------------------------------------
async function registerPair(addrA, addrB) {
    if (!addrA || !addrB) return;
    await fetch('/api/conversations/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_a: addrA, wallet_b: addrB }),
    });
    document.getElementById('col-entries-a').innerHTML = '';
    document.getElementById('col-entries-b').innerHTML = '';
    updateBalance(addrA, 'col-balance-a');
    updateBalance(addrB, 'col-balance-b');
}

function tryRegisterPair() {
    if (state.activeAddress && state.contactAddress) {
        registerPair(state.activeAddress, state.contactAddress);
    }
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
        btn.className        = `keyboard-tab${i === 1 ? ' active' : ''}`;
        btn.textContent      = cat.toUpperCase();
        btn.dataset.category = cat;
        btn.onclick          = () => selectKeyboardTab(cat);
        tabs.appendChild(btn);
    });

    selectKeyboardTab(categories[1] || 'custom');
}

function selectKeyboardTab(category) {
    state.activeCategory = category;
    document.querySelectorAll('.keyboard-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.category === category);
    });

    const keys    = document.getElementById('keyboard-keys');
    keys.innerHTML = '';
    const entries = state.dictionary.entries || {};

    Object.entries(entries)
        .filter(([, e]) => e.category === category)
        .sort((a, b) => a[1].amount.localeCompare(b[1].amount))
        .forEach(([token, entry]) => {
            const btn = document.createElement('button');
            btn.className   = `key-btn${entry.type === 'phrase' ? ' phrase' : ''}`;
            btn.textContent = entry.display || token;
            btn.title       = `${entry.amount}  —  ${entry.meaning}`;
            btn.onclick     = () => addToken(token);
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
        span.className   = 'compose-token';
        span.textContent = token;
        span.title       = 'click to remove';
        span.onclick     = () => { state.composeTokens.splice(i, 1); renderCompose(); };
        area.appendChild(span);
    });
}

document.getElementById('btn-clear').onclick = () => {
    state.composeTokens = [];
    renderCompose();
};

document.getElementById('btn-send').onclick = () => {
    if (!state.composeTokens.length) { alert('compose a message first'); return; }
    if (!state.activeWalletId)        { alert('select a wallet first');   return; }
    if (!state.contactAddress)        { alert('select a contact first');  return; }
    promptPin(async (pin) => {
        const res = await fetch('/api/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tokens:         state.composeTokens,
                from_wallet_id: state.activeWalletId,
                to_address:     state.contactAddress,
                pin,
            }),
        });
        if (res.ok) {
            state.composeTokens = [];
            renderCompose();
        } else {
            alert('send failed — check PIN or node connection');
        }
    });
};

// -----------------------------------------------------------------------------
// PIN PROMPT
// -----------------------------------------------------------------------------
function promptPin(onConfirm) {
    const overlay = document.getElementById('pin-overlay');
    const input   = document.getElementById('pin-input');
    input.value   = '';
    overlay.classList.remove('hidden');
    input.focus();

    document.getElementById('pin-confirm').onclick = () => {
        overlay.classList.add('hidden');
        onConfirm(input.value);
    };
    document.getElementById('pin-cancel').onclick = () => {
        overlay.classList.add('hidden');
    };
    input.onkeydown = (e) => {
        if (e.key === 'Enter') document.getElementById('pin-confirm').click();
    };
}

// -----------------------------------------------------------------------------
// WALLETS
// -----------------------------------------------------------------------------
async function loadWallets() {
    const res  = await fetch('/api/wallets');
    if (!res.ok) return;
    const data = await res.json();
    state.wallets = {};
    data.wallets.forEach(w => state.wallets[w.id] = w);
    renderWallets();
}

function renderWallets() {
    const list   = document.getElementById('wallet-list');
    const select = document.getElementById('active-wallet-select');
    list.innerHTML   = '';
    select.innerHTML = '<option value="">select wallet</option>';

    Object.values(state.wallets).forEach(w => {
        const item = document.createElement('div');
        item.className = 'wallet-item';
        item.innerHTML = `<span class="item-name">${w.label}</span><span class="item-address">${w.address}</span>`;
        item.onclick = () => {
            state.activeWalletId = w.id;
            state.activeAddress  = w.address;
            select.value = w.id;
            document.getElementById('col-name-a').textContent = w.label || shortAddr(w.address);
            document.querySelectorAll('.wallet-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            tryRegisterPair();
        };
        list.appendChild(item);

        const opt       = document.createElement('option');
        opt.value       = w.id;
        opt.textContent = w.label;
        select.appendChild(opt);
    });
}

document.getElementById('active-wallet-select').onchange = (e) => {
    const w = state.wallets[e.target.value];
    if (!w) return;
    state.activeWalletId = w.id;
    state.activeAddress  = w.address;
    document.getElementById('col-name-a').textContent = w.label || shortAddr(w.address);
    tryRegisterPair();
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
    const res  = await fetch('/api/contacts');
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
        item.innerHTML = `<span class="item-name">${c.nickname}</span><span class="item-address">${c.address}</span>`;
        item.onclick = () => {
            state.contactAddress = c.address;
            document.getElementById('col-name-b').textContent = c.nickname || shortAddr(c.address);
            document.querySelectorAll('.contact-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            tryRegisterPair();
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
    const res  = await fetch('/api/watchlist');
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
    document.getElementById('modal-title').textContent  = title;
    document.getElementById('modal-body').innerHTML     = bodyHtml;
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

// -----------------------------------------------------------------------------
// INIT
// -----------------------------------------------------------------------------
async function init() {
    connectWs();
    connectChainWs();
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