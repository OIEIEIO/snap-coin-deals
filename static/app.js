// -----------------------------------------------------------------------------
// File: static/app.js
// Tree: snap-coin-msg/static/app.js
// Description: Multi-wallet panel layout - left/right columns, per-wallet ledger
// Version: 2.7.2
// Changes: JS clear on snap-amount-input after render to defeat Chrome autofill
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
        if (ev.event_type === 'BLOCK' && ev.height) {
            updateHeightDisplay(ev.height);
            onBlock();
        }
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

    body.appendChild(list);
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
        await loadContacts();
        renderWorkspaceTab('import-wallet');
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
        await loadContacts();

        // overlay modal
        const overlay = document.createElement('div');
        overlay.className = 'cw-overlay';
        overlay.innerHTML = `
            <div class="cw-modal">
                <div class="cw-modal-title">WALLET CREATED</div>
                <div class="cw-key-warning">⚠ SAVE YOUR PRIVATE KEY — THIS IS THE ONLY TIME IT WILL BE SHOWN</div>

                <div class="cw-field-label">WALLET ADDRESS</div>
                <div class="cw-field-row">
                    <div class="cw-field-value" id="cw-address">${data.address}</div>
                    <button class="cw-copy-btn" id="cw-copy-address">COPY</button>
                </div>

                <div class="cw-field-label">PRIVATE KEY</div>
                <div class="cw-field-row">
                    <div class="cw-field-value cw-key-accent" id="cw-privkey">${data.private_key}</div>
                    <button class="cw-copy-btn" id="cw-copy-key">COPY</button>
                </div>

                <div class="cw-confirm-row">
                    <input type="checkbox" id="cw-confirm-check">
                    <label for="cw-confirm-check" class="cw-confirm-label">I have saved my private key</label>
                </div>
                <button class="btn-ws-submit cw-done-btn" id="cw-done" disabled>DONE</button>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('cw-copy-address').onclick = () => {
            navigator.clipboard.writeText(data.address);
            document.getElementById('cw-copy-address').textContent = 'COPIED';
            setTimeout(() => document.getElementById('cw-copy-address').textContent = 'COPY', 1500);
        };
        document.getElementById('cw-copy-key').onclick = () => {
            navigator.clipboard.writeText(data.private_key);
            document.getElementById('cw-copy-key').textContent = 'COPIED';
            setTimeout(() => document.getElementById('cw-copy-key').textContent = 'COPY', 1500);
        };
        document.getElementById('cw-confirm-check').onchange = (e) => {
            document.getElementById('cw-done').disabled = !e.target.checked;
        };
        document.getElementById('cw-done').onclick = () => {
            document.body.removeChild(overlay);
        };
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
    const isOpcode    = entry.is_opcode !== false && entry.category !== 'transfer';
    const token       = isOpcode
        ? (entry.token || entry.display || entry.meaning || entry.amount)
        : entry.amount;
    const status      = pending ? 'PENDING' : 'CONFIRMED';
    const statusClass = pending ? 'pending' : 'confirmed';
    const isTx        = direction === 'outbound';
    const labelClass  = isTx ? 'we-tx' : 'we-rx';
    const addrLabel   = isTx ? 'to' : 'from';
    const addrDisplay = counterparty ? resolveContact(counterparty) : '';
    const tokenClass  = isOpcode ? 'we-token' : 'we-token we-token-snap';

    el.className      = `wallet-entry ${statusClass}`;
    el.dataset.amount = entry.amount;
    el.dataset.dir    = direction;

    if (state.decodeView) {
        el.innerHTML = `
            <div class="we-main">
                <span class="${labelClass}">${isTx ? 'TX' : 'RX'}</span>
                <span class="${tokenClass}">${token}</span>
            </div>
            <div class="we-meta">
                ${addrDisplay ? `<span class="we-counterparty">${addrLabel}: ${addrDisplay}</span>` : ''}
                <span class="we-status ${statusClass}">${status}</span>
            </div>`;
    } else {
        el.innerHTML = `
            <div class="we-main">
                <span class="${labelClass}">${isTx ? 'TX' : 'RX'}</span>
                <span class="${tokenClass}">${token}</span>
            </div>
            <div class="we-meta">
                ${isOpcode ? `<span class="we-amount">${entry.amount}</span>` : ''}
                <span class="we-category">[${(entry.category || 'transfer').toUpperCase()}]</span>
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

        // oldest-first from API, prepend each so newest ends up on top
        data.entries.forEach(e => {
            const entry  = { token: e.token, amount: e.amount, category: e.category, meaning: e.meaning, is_opcode: e.is_opcode };
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

    // defeat browser autofill on load
    setTimeout(() => {
        document.querySelectorAll('.snap-amount-input').forEach(el => el.value = '');
    }, 0);
}

function buildWalletPanel(w, col, expanded) {
    const panel = document.createElement('div');
    panel.className  = `wallet-panel${expanded ? ' expanded' : ''}`;
    panel.id         = `panel-${w.id}`;

    // --- HEADER ---
    const header = document.createElement('div');

    if (expanded) {
        header.className = 'wp-header wp-expanded';
        header.innerHTML = `
            <div class="wp-header-info">
                <div class="wp-header-left">
                    <span class="wp-label">${w.label}</span>
                    ${!w.can_send ? '<span class="item-badge view">VIEW</span>' : ''}
                    ${w.locked   ? '<span class="item-badge demo">DEMO</span>' : ''}
                </div>
                <div class="wp-header-right-info">
                    <span class="wp-balance" id="balance-${w.id}"></span>
                    <button class="wp-btn-text" id="btn-hide-${w.id}">HIDE</button>
                </div>
            </div>
            <div class="wp-header-actions">
                <button class="wp-btn-text" id="btn-refresh-${w.id}">REFRESH</button>
                ${!w.locked ? `<button class="wp-btn-text btn-delete-wallet" id="btn-delete-${w.id}">DELETE</button>` : ''}
                <button class="wp-btn-text" id="btn-move-${w.id}">${col === 'left' ? 'MOVE RIGHT' : 'MOVE LEFT'}</button>
                <button class="wp-btn-text" id="btn-up-${w.id}">UP</button>
                <button class="wp-btn-text" id="btn-down-${w.id}">DOWN</button>
                <button class="wp-btn-text" id="toggle-${w.id}">COLLAPSE</button>
            </div>
        `;
    } else {
        header.className = 'wp-header';
        header.innerHTML = `
            <div class="wp-header-left">
                <span class="wp-label">${w.label}</span>
                ${!w.can_send ? '<span class="item-badge view">VIEW</span>' : ''}
                ${w.locked   ? '<span class="item-badge demo">DEMO</span>' : ''}
            </div>
            <div class="wp-header-right">
                <button class="wp-btn-text" id="btn-move-${w.id}">${col === 'left' ? 'MOVE RIGHT' : 'MOVE LEFT'}</button>
                <button class="wp-btn-text" id="btn-up-${w.id}">UP</button>
                <button class="wp-btn-text" id="btn-down-${w.id}">DOWN</button>
                <button class="wp-btn-text" id="toggle-${w.id}">EXPAND</button>
            </div>
        `;
    }

    // toggle
    header.querySelector(`#toggle-${w.id}`).onclick = (e) => {
        e.stopPropagation();
        toggleWalletPanel(w.id, col);
    };

    // move — all wallets
    const moveBtn = header.querySelector(`#btn-move-${w.id}`);
    if (moveBtn) moveBtn.onclick = async (e) => {
        e.stopPropagation();
        const newCol = col === 'left' ? 'right' : 'left';
        await fetch('/api/wallets/move', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ id: w.id, column: newCol }),
        });
        await loadWallets();
    };

    // up
    header.querySelector(`#btn-up-${w.id}`).onclick = async (e) => {
        e.stopPropagation();
        await fetch('/api/wallets/reorder', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ id: w.id, direction: 'up' }),
        });
        await loadWallets();
    };

    // down
    header.querySelector(`#btn-down-${w.id}`).onclick = async (e) => {
        e.stopPropagation();
        await fetch('/api/wallets/reorder', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ id: w.id, direction: 'down' }),
        });
        await loadWallets();
    };

    // delete — only present on unlocked wallets
    const deleteBtn = header.querySelector(`#btn-delete-${w.id}`);
    if (deleteBtn) deleteBtn.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete wallet "${w.label}"? This cannot be undone.`)) return;
        const res = await fetch('/api/wallets/delete', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ id: w.id }),
        });
        if (res.ok) {
            await loadWallets();
        } else {
            alert('delete failed');
        }
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

        // SNAP send row
        const snapRow = document.createElement('div');
        snapRow.className = 'wp-snap-row';
        snapRow.innerHTML = `
            <span class="routing-label">SNAP</span>
            <input class="snap-amount-input" id="snap-amount-${w.id}" type="text" inputmode="decimal" placeholder="amount e.g. 1.5" autocomplete="off">
            <button class="btn-snap-send" id="snap-send-${w.id}">SEND SNAP</button>
        `;
        body.appendChild(snapRow);

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

    // defeat browser autofill — clear snap amount after DOM settles
    setTimeout(() => {
        const el = document.getElementById(`snap-amount-${walletId}`);
        if (el) el.value = '';
    }, 0);
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

    // SEND OPCODE
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
            } else if (res.status === 403) {
                alert('Demo sandbox: sends are restricted to wallets loaded in this app.\n\nWant to keep the demo running? Send SNAP to the demo wallets to top them up!');
            } else {
                alert('send failed — check PIN or node connection');
            }
        });
    };

    // SEND SNAP
    const snapSendBtn = document.getElementById(`snap-send-${walletId}`);
    if (snapSendBtn) snapSendBtn.onclick = () => {
        const toAddr = document.getElementById(`to-${walletId}`)?.value;
        const rawAmount = document.getElementById(`snap-amount-${walletId}`)?.value.trim();
        const amount = parseFloat(rawAmount);
        if (!toAddr)          { alert('select a TO contact');      return; }
        if (!amount || amount <= 0) { alert('enter a valid amount'); return; }

        promptPin(async (pin) => {
            const res = await fetch('/api/wallets/send-snap', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    from_wallet_id: walletId,
                    to_address:     toAddr,
                    amount,
                    pin,
                }),
            });
            if (res.ok) {
                document.getElementById(`snap-amount-${walletId}`).value = '';
                updateWalletBalance(walletId, wallet.address);
            } else if (res.status === 403) {
                alert('Demo sandbox: sends are restricted to wallets loaded in this app.\n\nWant to keep the demo running? Send SNAP to the demo wallets to top them up!');
            } else {
                alert('send failed — check PIN, amount, or node connection');
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

    // always start collapsed — user expands what they need
    state.expanded = { left: null, right: null };

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
// AUTO REFRESH - balance on every block, history every 20 blocks (~2 min)
// -----------------------------------------------------------------------------
let blocksSinceHistoryRefresh = 0;

function refreshExpandedWallets(includeHistory = false) {
    Object.values(state.wallets).forEach(w => {
        const col = w.column === 'right' ? 'right' : 'left';
        if (state.expanded[col] !== w.id) return;
        updateWalletBalance(w.id, w.address);
        if (includeHistory) loadWalletHistory(w.id, w.address);
    });
}

function onBlock() {
    blocksSinceHistoryRefresh++;
    refreshExpandedWallets(false);
    if (blocksSinceHistoryRefresh >= 20) {
        blocksSinceHistoryRefresh = 0;
        refreshExpandedWallets(true);
    }
}

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
// Tree: snap-coin-msg/static/app.js
// Created: 2026-03-19 | Updated: 2026-03-23
// -----------------------------------------------------------------------------