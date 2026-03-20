// -----------------------------------------------------------------------------
// File: static/app.js
// Project: snap-coin-msg
// Description: Multi-wallet panel layout - left/right columns, per-wallet ledger
// Version: 2.0.0
// -----------------------------------------------------------------------------

const state = {
    ws:          null,
    chainWs:     null,
    dictionary:  {},
    decodeView:  true,
    contacts:    {},
    wallets:     {},
    // per-wallet compose state keyed by wallet id
    compose:     {},
    // which wallet is expanded in each column
    expanded:    { left: null, right: null },
};

// -----------------------------------------------------------------------------
// WEBSOCKET - opcode messages
// -----------------------------------------------------------------------------
function connectWs() {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    ws.onopen    = () => setAppStatus(true);
    ws.onclose   = () => { setAppStatus(false); setTimeout(connectWs, 3000); };
    ws.onmessage = (e) => handleOpcodeEvent(JSON.parse(e.data));
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
    ws.onclose   = () => setTimeout(connectChainWs, 3000);
    ws.onmessage = (e) => {
        const ev = JSON.parse(e.data);
        appendChainEvent(ev);
        if (ev.event_type === 'BLOCK' && ev.height) updateHeightDisplay(ev.height);
    };
    state.chainWs = ws;
}

// -----------------------------------------------------------------------------
// CHAIN EVENTS
// -----------------------------------------------------------------------------
function updateHeightDisplay(height) {
    const el = document.getElementById('chain-height');
    el.textContent = height;
    el.classList.add('updated');
    setTimeout(() => el.classList.remove('updated'), 2000);
}

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
// CENTER COLUMN - two independent collapsible sections
// -----------------------------------------------------------------------------
const sectionState = { events: false, workspace: false };

function toggleSection(name) {
    sectionState[name] = !sectionState[name];
    const body = document.getElementById(`body-${name}`);
    const btn  = document.getElementById(`btn-toggle-${name}`);
    body.classList.toggle('hidden', !sectionState[name]);
    btn.textContent = sectionState[name] ? 'COLLAPSE' : 'EXPAND';
    if (name === 'workspace' && sectionState[name]) renderWorkspaceTab('contacts');
}

document.getElementById('btn-toggle-events').onclick    = () => toggleSection('events');
document.getElementById('btn-toggle-workspace').onclick = () => toggleSection('workspace');

document.querySelectorAll('.workspace-tab').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.workspace-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderWorkspaceTab(btn.dataset.tab);
    };
});

function renderWorkspaceTab(tab) {
    const body = document.getElementById('workspace-body');
    body.innerHTML = '';

    if (tab === 'contacts') {
        renderWorkspaceContacts(body);
    } else if (tab === 'import-wallet') {
        renderWorkspaceAddWallet(body);
    } else if (tab === 'create-wallet') {
        renderWorkspaceCreateWallet(body);
    }
}

function renderWorkspaceContacts(body) {
    const list = document.createElement('div');
    list.className = 'ws-list';

    Object.values(state.contacts).forEach(c => {
        const item = document.createElement('div');
        item.className = 'ws-item';
        item.innerHTML = `<span class="ws-item-name">${c.nickname}</span><span class="ws-item-addr">${shortAddr(c.address)}</span>`;
        list.appendChild(item);
    });

    const form = document.createElement('div');
    form.className = 'ws-form';
    form.innerHTML = `
        <div class="ws-form-title">ADD CONTACT</div>
        <input class="modal-input" id="ws-nick" placeholder="nickname">
        <input class="modal-input" id="ws-addr" placeholder="SNAP address">
        <button class="btn-ws-submit" id="ws-add-contact">ADD</button>
    `;

    body.appendChild(list);
    body.appendChild(form);

    document.getElementById('ws-add-contact').onclick = async () => {
        const nick = document.getElementById('ws-nick').value.trim();
        const addr = document.getElementById('ws-addr').value.trim();
        if (!nick || !addr) return;
        await fetch('/api/contacts/add', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: `c_${Date.now()}`, nickname: nick, address: addr }),
        });
        await loadContacts();
        renderWorkspaceTab('contacts');
    };
}

function renderWorkspaceAddWallet(body) {
    body.innerHTML = `
        <div class="ws-form">
            <div class="ws-form-title">ADD WALLET</div>
            <input class="modal-input" id="ws-aw-label" placeholder="label" autocomplete="off">
            <input class="modal-input" id="ws-aw-address" placeholder="SNAP address" autocomplete="off">
            <input class="modal-input" id="ws-aw-key" type="password" placeholder="private key (optional)" autocomplete="new-password">
            <input class="modal-input" id="ws-aw-pin" type="password" placeholder="PIN (if private key set)" autocomplete="new-password">
            <div class="ws-form-row">
                <label class="ws-label">column</label>
                <select class="routing-select" id="ws-aw-col">
                    <option value="left">left</option>
                    <option value="right">right</option>
                </select>
            </div>
            <button class="btn-ws-submit" id="ws-do-add">ADD WALLET</button>
        </div>
    `;
    document.getElementById('ws-do-add').onclick = async () => {
        const key = document.getElementById('ws-aw-key').value;
        const pin = document.getElementById('ws-aw-pin').value;
        await fetch('/api/wallets/add', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id:          `w_${Date.now()}`,
                label:       document.getElementById('ws-aw-label').value,
                address:     document.getElementById('ws-aw-address').value,
                private_key: key || null,
                pin:         pin || null,
                column:      document.getElementById('ws-aw-col').value,
            }),
        });
        await loadWallets();
        renderWorkspaceTab('add-wallet');
    };
}

function renderWorkspaceCreateWallet(body) {
    body.innerHTML = `
        <div class="ws-form">
            <div class="ws-form-title">CREATE WALLET</div>
            <input class="modal-input" id="ws-cw-label" placeholder="label">
            <input class="modal-input" id="ws-cw-pin" type="password" placeholder="PIN">
            <div class="ws-form-row">
                <label class="ws-label">column</label>
                <select class="routing-select" id="ws-cw-col">
                    <option value="left">left</option>
                    <option value="right">right</option>
                </select>
            </div>
            <button class="btn-ws-submit" id="ws-do-create">CREATE WALLET</button>
            <div id="ws-create-result" class="hidden"></div>
        </div>
    `;
    document.getElementById('ws-do-create').onclick = async () => {
        const res = await fetch('/api/wallets/create', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id:     `w_${Date.now()}`,
                label:  document.getElementById('ws-cw-label').value,
                pin:    document.getElementById('ws-cw-pin').value,
                column: document.getElementById('ws-cw-col').value,
            }),
        });
        if (!res.ok) { alert('create wallet failed'); return; }
        const data = await res.json();
        await loadWallets();

        const result = document.getElementById('ws-create-result');
        result.classList.remove('hidden');
        result.innerHTML = `
            <div class="ws-key-warning">⚠ SAVE THIS PRIVATE KEY — SHOWN ONCE</div>
            <div class="ws-key-address">address: ${shortAddr(data.address)}</div>
            <div class="ws-key-value">${data.private_key}</div>
        `;
    };
}

// -----------------------------------------------------------------------------
// OPCODE EVENT - route to correct wallet panel
// -----------------------------------------------------------------------------
function handleOpcodeEvent(event) {
    const entries   = state.dictionary.entries || {};
    const matchPair = Object.entries(entries).find(([, e]) => e.amount === event.amount);
    const entry     = matchPair
        ? { ...matchPair[1], token: matchPair[0] }
        : { meaning: event.meaning, amount: event.amount, category: event.category, token: event.meaning };

    const pending = event.pending === true;

    // find any wallet panel that matches sender or receiver
    Object.values(state.wallets).forEach(w => {
        const isSender   = event.from === w.address;
        const isReceiver = event.to   === w.address;
        if (!isSender && !isReceiver) return;

        const dir         = isSender ? 'outbound' : 'inbound';
        const counterpart = isSender ? event.to : event.from;
        const ledgerId    = `ledger-${w.id}`;

        if (pending) {
            prependToLedger(ledgerId, createEntry(entry, dir, true, counterpart));
        } else {
            confirmEntry(ledgerId, event.amount, dir) ||
            prependToLedger(ledgerId, createEntry(entry, dir, false, counterpart));
        }

        // update balance in wallet header
        updateWalletBalance(w.id, w.address);
    });
}

function confirmEntry(ledgerId, amount, dir) {
    const ledger  = document.getElementById(ledgerId);
    if (!ledger) return false;
    const entries = ledger.querySelectorAll('.wallet-entry.pending');
    for (const el of entries) {
        if (el.dataset.amount === amount && el.dataset.dir === dir) {
            el.classList.remove('pending');
            el.classList.add('confirmed');
            const statusEl = el.querySelector('.we-status');
            if (statusEl) { statusEl.textContent = 'CONFIRMED'; statusEl.className = 'we-status confirmed'; }
            return true;
        }
    }
    return false;
}

function appendToLedger(ledgerId, el) {
    const ledger = document.getElementById(ledgerId);
    if (!ledger) return;
    ledger.appendChild(el);
    ledger.scrollTop = ledger.scrollHeight;
}

function prependToLedger(ledgerId, el) {
    const ledger = document.getElementById(ledgerId);
    if (!ledger) return;
    ledger.insertBefore(el, ledger.firstChild);
}

// -----------------------------------------------------------------------------
// ENTRY RENDER
// -----------------------------------------------------------------------------
function createEntry(entry, direction, pending = false, counterparty = '') {
    const el          = document.createElement('div');
    const token       = entry.token || entry.display || entry.meaning || entry.amount;
    const status      = pending ? 'PENDING' : 'CONFIRMED';
    const statusClass = pending ? 'pending' : 'confirmed';
    const isTx        = direction === 'outbound';
    const labelClass  = isTx ? 'we-tx' : 'we-rx';
    const addrLabel   = isTx ? 'to' : 'from';
    const addrDisplay = counterparty ? resolveContact(counterparty) : '';

    el.className      = `wallet-entry ${statusClass}`;
    el.dataset.amount = entry.amount;
    el.dataset.dir    = direction;

    if (state.decodeView) {
        el.innerHTML = `
            <div class="we-main">
                <span class="${labelClass}">${isTx ? 'TX' : 'RX'}</span>
                <span class="we-token">${token}</span>
            </div>
            <div class="we-meta">
                ${addrDisplay ? `<span class="we-counterparty">${addrLabel}: ${addrDisplay}</span>` : ''}
                <span class="we-status ${statusClass}">${status}</span>
            </div>`;
    } else {
        el.innerHTML = `
            <div class="we-main">
                <span class="${labelClass}">${isTx ? 'TX' : 'RX'}</span>
                <span class="we-token">${token}</span>
            </div>
            <div class="we-meta">
                <span class="we-amount">${entry.amount}</span>
                <span class="we-category">[${(entry.category || '').toUpperCase()}]</span>
                ${addrDisplay ? `<span class="we-counterparty">${addrLabel}: ${addrDisplay}</span>` : ''}
                <span class="we-status ${statusClass}">${status}</span>
            </div>`;
    }
    return el;
}

function resolveContact(address) {
    const c = Object.values(state.contacts).find(c => c.address === address);
    return c ? c.nickname : shortAddr(address);
}

// -----------------------------------------------------------------------------
// DECODE TOGGLE
// -----------------------------------------------------------------------------
document.getElementById('btn-decode-toggle').onclick = () => {
    state.decodeView = !state.decodeView;
    const btn = document.getElementById('btn-decode-toggle');
    btn.textContent = state.decodeView ? 'DECODE' : 'FULL';
    btn.classList.toggle('active', state.decodeView);
};

// -----------------------------------------------------------------------------
// NODE STATUS
// -----------------------------------------------------------------------------
async function pollNodeStatus() {
    try {
        const res  = await fetch('/api/node/status');
        const data = await res.json();
        setNodeStatus(data.online, data.addr);
    } catch { setNodeStatus(false, ''); }
}

function setNodeStatus(online, addr) {
    document.getElementById('node-status-dot').className     = `status-dot ${online ? 'node-online' : 'node-offline'}`;
    document.getElementById('node-status-label').textContent = `node: ${online ? 'online' : 'offline'}${addr ? ' ' + addr : ''}`;
}

// -----------------------------------------------------------------------------
// WALLET BALANCE
// -----------------------------------------------------------------------------
async function updateWalletBalance(walletId, address) {
    if (!address) return;
    try {
        const res  = await fetch(`/api/chain/balance/${address}`);
        const data = await res.json();
        const el   = document.getElementById(`balance-${walletId}`);
        if (el) el.textContent = data.display + ' SNAP';
    } catch {}
}

// -----------------------------------------------------------------------------
// WALLET HISTORY - load per wallet
// -----------------------------------------------------------------------------
async function loadWalletHistory(walletId, address) {
    const ledger = document.getElementById(`ledger-${walletId}`);
    if (!ledger) return;
    ledger.innerHTML = `
        <div class="ledger-loading-full">
            <div class="ledger-loading-icon">⚙</div>
            <div class="ledger-loading-msg">scanning chain history...</div>
            <div class="ledger-loading-sub">scanning from opcode genesis block</div>
        </div>
    `;

    // animate the gear icon
    let frame = 0;
    const frames = ['⚙', '✦', '⚙', '✧'];
    const anim = setInterval(() => {
        const icon = ledger.querySelector('.ledger-loading-icon');
        if (icon) { icon.textContent = frames[frame % frames.length]; frame++; }
        else clearInterval(anim);
    }, 400);

    try {
        const res = await fetch('/api/history', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ address }),
        });
        if (!res.ok) { ledger.innerHTML = ''; return; }
        const data = await res.json();
        ledger.innerHTML = '';

        // newest at top - prepend in reverse order
        [...data.entries].reverse().forEach(e => {
            const entry  = { token: e.token, amount: e.amount, category: e.category, meaning: e.meaning };
            const isTx   = e.from_wallet === address;
            const cp     = isTx ? e.to_wallet : e.from_wallet;
            prependToLedger(`ledger-${walletId}`, createEntry(entry, isTx ? 'outbound' : 'inbound', false, cp));
        });

    } catch (err) {
        ledger.innerHTML = '';
        console.warn('history load failed:', err);
    }
}

// -----------------------------------------------------------------------------
// REGISTER WALLET ADDRESS FOR LIVE EVENTS
// -----------------------------------------------------------------------------
async function registerWalletWatch(address) {
    // register with a dummy pair using itself — backend just needs to watch the address
    await fetch('/api/conversations/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ wallet_a: address, wallet_b: address }),
    });
}

// -----------------------------------------------------------------------------
// WALLET PANELS - render
// -----------------------------------------------------------------------------
function renderWallets() {
    const leftContainer  = document.getElementById('wallets-left');
    const rightContainer = document.getElementById('wallets-right');
    leftContainer.innerHTML  = '';
    rightContainer.innerHTML = '';

    const sorted = Object.values(state.wallets).sort((a, b) => (a.order || 0) - (b.order || 0));

    sorted.forEach(w => {
        const col       = w.column === 'right' ? 'right' : 'left';
        const container = col === 'left' ? leftContainer : rightContainer;
        const isExpanded = state.expanded[col] === w.id;
        container.appendChild(buildWalletPanel(w, col, isExpanded));
    });
}

function buildWalletPanel(w, col, expanded) {
    const panel = document.createElement('div');
    panel.className  = `wallet-panel${expanded ? ' expanded' : ''}`;
    panel.id         = `panel-${w.id}`;

    // --- HEADER ---
    const header = document.createElement('div');
    header.className = 'wp-header';
    header.innerHTML = `
        <div class="wp-header-left">
            <span class="wp-label">${w.label}</span>
            ${!w.can_send ? '<span class="item-badge view">VIEW</span>' : ''}
        </div>
        <div class="wp-header-right">
            <span class="wp-balance" id="balance-${w.id}"></span>
            ${expanded ? `<button class="wp-btn-text" id="btn-hide-${w.id}">HIDE</button>` : ''}
            ${expanded ? `<button class="wp-btn-text" id="btn-refresh-${w.id}">REFRESH</button>` : ''}
            <button class="wp-btn-text" id="btn-move-${w.id}">${col === 'left' ? 'MOVE RIGHT' : 'MOVE LEFT'}</button>
            <button class="wp-btn-text" id="toggle-${w.id}">${expanded ? 'COLLAPSE' : 'EXPAND'}</button>
        </div>
    `;

    // toggle
    header.querySelector(`#toggle-${w.id}`).onclick = (e) => {
        e.stopPropagation();
        toggleWalletPanel(w.id, col);
    };

    // move
    header.querySelector(`#btn-move-${w.id}`).onclick = async (e) => {
        e.stopPropagation();
        const newCol = col === 'left' ? 'right' : 'left';
        await fetch('/api/wallets/move', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ id: w.id, column: newCol }),
        });
        await loadWallets();
    };

    if (expanded) {
        // refresh - balance + history
        header.querySelector(`#btn-refresh-${w.id}`).onclick = (e) => {
            e.stopPropagation();
            updateWalletBalance(w.id, w.address);
            loadWalletHistory(w.id, w.address);
        };

        // hide/show balance
        let balanceHidden = false;
        header.querySelector(`#btn-hide-${w.id}`).onclick = (e) => {
            e.stopPropagation();
            balanceHidden = !balanceHidden;
            const balEl = document.getElementById(`balance-${w.id}`);
            if (balanceHidden) {
                balEl.dataset.actual = balEl.textContent;
                balEl.textContent = '••••••••';
            } else {
                balEl.textContent = balEl.dataset.actual || '';
            }
            e.target.textContent = balanceHidden ? 'SHOW' : 'HIDE';
        };
    }

    panel.appendChild(header);

    if (!expanded) return panel;

    // --- BODY ---
    const body = document.createElement('div');
    body.className = 'wp-body';

    // ledger
    const ledger = document.createElement('div');
    ledger.className = 'wp-ledger';
    ledger.id        = `ledger-${w.id}`;
    body.appendChild(ledger);

    if (w.can_send) {
        // TO selector
        const toRow = document.createElement('div');
        toRow.className = 'wp-to-row';
        toRow.innerHTML = `
            <span class="routing-label">TO</span>
            <select class="routing-select wp-to-select" id="to-${w.id}">
                <option value="">select contact</option>
            </select>
        `;
        body.appendChild(toRow);

        // keyboard
        const kbArea = document.createElement('div');
        kbArea.className = 'wp-keyboard';
        kbArea.innerHTML = `
            <div class="keyboard-tabs" id="kb-tabs-${w.id}"></div>
            <div class="keyboard-keys" id="kb-keys-${w.id}"></div>
        `;
        body.appendChild(kbArea);

        // compose + send
        const composeArea = document.createElement('div');
        composeArea.className = 'wp-compose';
        composeArea.innerHTML = `
            <div class="compose-tokens" id="compose-${w.id}"></div>
            <div class="compose-controls">
                <button class="btn-compose btn-clear-wallet" data-id="${w.id}">CLEAR</button>
                <button class="btn-compose btn-send btn-send-wallet" data-id="${w.id}">SEND</button>
            </div>
        `;
        body.appendChild(composeArea);
    }

    panel.appendChild(body);

    // defer until panel is in the DOM
    requestAnimationFrame(() => {
        if (w.can_send) populateToSelect(w.id);
        buildWalletKeyboard(w.id);
        if (w.can_send) wireComposeButtons(w.id, w);
        updateWalletBalance(w.id, w.address);
        loadWalletHistory(w.id, w.address);
        registerWalletWatch(w.address);
    });

    return panel;
}

function toggleWalletPanel(walletId, col) {
    const alreadyExpanded = state.expanded[col] === walletId;
    const newExpanded     = alreadyExpanded ? null : walletId;
    state.expanded[col]   = newExpanded;

    // only rebuild the affected column, not both
    const container = document.getElementById(col === 'left' ? 'wallets-left' : 'wallets-right');
    container.innerHTML = '';

    const sorted = Object.values(state.wallets)
        .filter(w => (w.column || 'left') === col)
        .sort((a, b) => (a.order || 0) - (b.order || 0));

    sorted.forEach(w => {
        container.appendChild(buildWalletPanel(w, col, state.expanded[col] === w.id));
    });
}

// -----------------------------------------------------------------------------
// TO CONTACT SELECTOR - per wallet
// -----------------------------------------------------------------------------
function populateToSelect(walletId) {
    const select = document.getElementById(`to-${walletId}`);
    if (!select) return;
    const prev = select.value;
    select.innerHTML = '<option value="">select contact</option>';
    Object.values(state.contacts).forEach(c => {
        const opt = document.createElement('option');
        opt.value       = c.address;
        opt.textContent = c.nickname;
        select.appendChild(opt);
    });
    if (prev) select.value = prev;
}

// -----------------------------------------------------------------------------
// KEYBOARD - per wallet
// -----------------------------------------------------------------------------
function buildWalletKeyboard(walletId) {
    const tabsEl = document.getElementById(`kb-tabs-${walletId}`);
    const keysEl = document.getElementById(`kb-keys-${walletId}`);
    if (!tabsEl || !keysEl) return;

    const categories = [...new Set(
        Object.values(state.dictionary.entries || {}).map(e => e.category)
    )].sort();

    categories.unshift('custom');
    tabsEl.innerHTML = '';

    categories.forEach((cat, i) => {
        const btn = document.createElement('button');
        btn.className        = `keyboard-tab${i === 1 ? ' active' : ''}`;
        btn.textContent      = cat.toUpperCase();
        btn.dataset.category = cat;
        btn.onclick          = () => selectWalletKeyboardTab(walletId, cat);
        tabsEl.appendChild(btn);
    });

    selectWalletKeyboardTab(walletId, categories[1] || 'custom');
}

function selectWalletKeyboardTab(walletId, category) {
    const tabsEl = document.getElementById(`kb-tabs-${walletId}`);
    const keysEl = document.getElementById(`kb-keys-${walletId}`);
    if (!tabsEl || !keysEl) return;

    tabsEl.querySelectorAll('.keyboard-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.category === category);
    });

    keysEl.innerHTML = '';
    const entries = state.dictionary.entries || {};

    Object.entries(entries)
        .filter(([, e]) => e.category === category)
        .sort((a, b) => a[1].amount.localeCompare(b[1].amount))
        .forEach(([token, entry]) => {
            const btn = document.createElement('button');
            btn.className   = `key-btn${entry.type === 'phrase' ? ' phrase' : ''}`;
            btn.textContent = entry.display || token;
            btn.title       = `${entry.amount} — ${entry.meaning}`;
            btn.onclick     = () => addWalletToken(walletId, token);
            keysEl.appendChild(btn);
        });
}

// -----------------------------------------------------------------------------
// COMPOSE - per wallet
// -----------------------------------------------------------------------------
function addWalletToken(walletId, token) {
    if (!state.compose[walletId]) state.compose[walletId] = [];
    state.compose[walletId].push(token);
    renderWalletCompose(walletId);
}

function renderWalletCompose(walletId) {
    const area = document.getElementById(`compose-${walletId}`);
    if (!area) return;
    area.innerHTML = '';
    (state.compose[walletId] || []).forEach((token, i) => {
        const span = document.createElement('span');
        span.className   = 'compose-token';
        span.textContent = token;
        span.title       = 'click to remove';
        span.onclick     = () => {
            state.compose[walletId].splice(i, 1);
            renderWalletCompose(walletId);
        };
        area.appendChild(span);
    });
}

function wireComposeButtons(walletId, wallet) {
    // CLEAR
    const clearBtn = document.querySelector(`.btn-clear-wallet[data-id="${walletId}"]`);
    if (clearBtn) clearBtn.onclick = () => {
        state.compose[walletId] = [];
        renderWalletCompose(walletId);
    };

    // SEND
    const sendBtn = document.querySelector(`.btn-send-wallet[data-id="${walletId}"]`);
    if (sendBtn) sendBtn.onclick = () => {
        const tokens  = state.compose[walletId] || [];
        const toAddr  = document.getElementById(`to-${walletId}`)?.value;
        if (!tokens.length) { alert('compose a message first'); return; }
        if (!toAddr)        { alert('select a TO contact');     return; }

        promptPin(async (pin) => {
            const res = await fetch('/api/send', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    tokens,
                    from_wallet_id: walletId,
                    to_address:     toAddr,
                    pin,
                }),
            });
            if (res.ok) {
                state.compose[walletId] = [];
                renderWalletCompose(walletId);
            } else {
                alert('send failed — check PIN or node connection');
            }
        });
    };
}

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
    document.getElementById('pin-cancel').onclick = () => overlay.classList.add('hidden');
    input.onkeydown = (e) => { if (e.key === 'Enter') document.getElementById('pin-confirm').click(); };
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

    // auto-expand first wallet in each column if none set
    const left  = Object.values(state.wallets).filter(w => (w.column || 'left') === 'left').sort((a,b) => (a.order||0)-(b.order||0));
    const right = Object.values(state.wallets).filter(w => w.column === 'right').sort((a,b) => (a.order||0)-(b.order||0));
    if (!state.expanded.left  && left.length)  state.expanded.left  = left[0].id;
    if (!state.expanded.right && right.length) state.expanded.right = right[0].id;

    renderWallets();
}



// -----------------------------------------------------------------------------
// CONTACTS
// -----------------------------------------------------------------------------
async function loadContacts() {
    const res  = await fetch('/api/contacts');
    if (!res.ok) return;
    const data = await res.json();
    state.contacts = {};
    data.contacts.forEach(c => state.contacts[c.id] = c);
}

// -----------------------------------------------------------------------------
// DICTIONARY
// -----------------------------------------------------------------------------
async function loadDictionary() {
    const res = await fetch('/api/dictionary');
    if (!res.ok) return;
    state.dictionary = await res.json();
}

// -----------------------------------------------------------------------------
// UTILS
// -----------------------------------------------------------------------------
function shortAddr(addr) {
    if (!addr || addr.length < 12) return addr || '';
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

// -----------------------------------------------------------------------------
// INIT
// -----------------------------------------------------------------------------
async function init() {
    connectWs();
    connectChainWs();
    await loadDictionary();
    await loadContacts();
    await loadWallets();
    pollNodeStatus();
    setInterval(pollNodeStatus, 10000);
}

init();

// -----------------------------------------------------------------------------
// File: static/app.js
// Project: snap-coin-msg
// Created: 2026-03-19 | Updated: 2026-03-20
// -----------------------------------------------------------------------------