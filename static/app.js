// =============================================================================
// File: static/app.js
// Tree: snap-coin-deals/static/app.js
// Description: SNAP Deals frontend — auth, member, business, admin views
// Version: 1.6.0
// Comments: Fixed hidden/active class conflict — show/hide use display directly
//           Role-based views — member | business | admin
//           Token stored in sessionStorage only — cleared on tab close
//           API helper attaches bearer token to all protected requests
//           Added: collapsible QR code on pending claim rows
//           Added: expandable deal cards — collapsed = header only
//           Fixed: business name no longer truncated in card header
//           Added: profile page — member info from lookup, metrics grid
//           Added: wallet address step after member login
//           Added: admin enroll member — create wallet, enroll, send SNAP
//           Added: admin post deal — business selector, onboarding fee, wallet, PIN
//           post deal creates deal wallet in backend, fires DEAL_POSTED opcode
//           frontend sends onboarding_fee SNAP from admin wallet to deal wallet
//           Added: admin business cards — expandable, suspend, edit modal
//           Added: admin deal cards — expandable, cancel, edit modal, shows all deals
// =============================================================================

'use strict';

// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------

const state = {
    token:        null,
    role:         null,
    businessId:   null,
    wallet:       null,
    pendingClaim: null,
};

// -----------------------------------------------------------------------------
// Show / hide helpers
// -----------------------------------------------------------------------------

function show(el) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (el) el.style.display = '';
}

function hide(el) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (el) el.style.display = 'none';
}

function showFlex(el) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (el) el.style.display = 'flex';
}

// -----------------------------------------------------------------------------
// API helper
// -----------------------------------------------------------------------------

async function api(method, path, body = null, auth = true) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
    }
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(path, opts);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
}

const GET  = (path, auth = true)       => api('GET',  path, null, auth);
const POST = (path, body, auth = true) => api('POST', path, body, auth);

// -----------------------------------------------------------------------------
// Auth — step 1: token
// -----------------------------------------------------------------------------

async function login() {
    const token = document.getElementById('login-token-input').value.trim();
    const err   = document.getElementById('login-error');

    if (!token) return;

    try {
        const res = await POST('/api/auth/login', { token }, false);

        if (!res.success) {
            show(err);
            return;
        }

        hide(err);
        state.token = token;
        state.role  = res.role;

        sessionStorage.setItem('snap_token', token);
        sessionStorage.setItem('snap_role',  res.role);

        if (res.role === 'member') {
            // step 2 — ask for wallet address
            showWalletStep();
        } else {
            // admin/business — go straight to app
            await bootApp();
        }

    } catch (e) {
        show(err);
    }
}

// -----------------------------------------------------------------------------
// Auth — step 2: wallet address (member only)
// -----------------------------------------------------------------------------

function showWalletStep() {
    hide('login-step-token');
    hide('login-wallet-error');
    document.getElementById('login-wallet-input').value = '';
    show('login-step-wallet');
    setTimeout(() => document.getElementById('login-wallet-input')?.focus(), 100);
}

async function submitWalletAddress() {
    const wallet = document.getElementById('login-wallet-input').value.trim();
    const err    = document.getElementById('login-wallet-error');

    if (!wallet) return;

    hide(err);

    try {
        const res = await POST('/api/members/lookup', { wallet });

        if (!res.found || !res.active) {
            show(err);
            return;
        }

        state.wallet = wallet;
        sessionStorage.setItem('snap_wallet', wallet);

        await bootApp();

    } catch (e) {
        show(err);
    }
}

// -----------------------------------------------------------------------------
// Logout
// -----------------------------------------------------------------------------

function logout() {
    sessionStorage.removeItem('snap_token');
    sessionStorage.removeItem('snap_role');
    sessionStorage.removeItem('snap_business_id');
    sessionStorage.removeItem('snap_wallet');

    state.token      = null;
    state.role       = null;
    state.businessId = null;
    state.wallet     = null;

    hide('screen-app');
    // reset login to step 1
    show('login-step-token');
    hide('login-step-wallet');
    hide('login-error');
    document.getElementById('login-token-input').value = '';
    showFlex('screen-login');
}

// -----------------------------------------------------------------------------
// Boot
// -----------------------------------------------------------------------------

async function bootApp() {
    hide('screen-login');
    showFlex('screen-app');

    renderRoleBadge();
    renderNav();
    await loadInitialView();
}

function renderRoleBadge() {
    const badge = document.getElementById('header-role-badge');
    badge.textContent = state.role.toUpperCase();
    badge.className   = `role-${state.role}`;
}

// -----------------------------------------------------------------------------
// Navigation
// -----------------------------------------------------------------------------

const NAV_CONFIG = {
    member: [
        { id: 'deals',     icon: '🏷️', label: 'Deals'   },
        { id: 'my-claims', icon: '✅',  label: 'Claims'  },
        { id: 'profile',   icon: '👤',  label: 'Profile' },
    ],
    business: [
        { id: 'biz-deals',   icon: '📋', label: 'My Deals' },
        { id: 'biz-claims',  icon: '📥', label: 'Claims'   },
        { id: 'biz-scanner', icon: '🔍', label: 'Verify'   },
    ],
    admin: [
        { id: 'admin-members',    icon: '👥', label: 'Members'    },
        { id: 'admin-businesses', icon: '🏪', label: 'Businesses' },
        { id: 'admin-deals',      icon: '🏷️', label: 'Deals'      },
    ],
};

function renderNav() {
    const nav  = document.getElementById('bottom-nav');
    const tabs = NAV_CONFIG[state.role] || [];

    nav.innerHTML = tabs.map(t => `
        <button class="nav-tab" data-view="${t.id}">
            <span class="nav-icon">${t.icon}</span>
            <span>${t.label}</span>
        </button>
    `).join('');

    nav.querySelectorAll('.nav-tab').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
}

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => { v.style.display = 'none'; });
    document.querySelectorAll('.nav-tab').forEach(t => { t.classList.remove('active'); });

    const view = document.getElementById(`view-${viewId}`);
    if (view) view.style.display = 'block';

    const tab = document.querySelector(`.nav-tab[data-view="${viewId}"]`);
    if (tab) tab.classList.add('active');

    loadView(viewId);
}

async function loadInitialView() {
    const first = NAV_CONFIG[state.role]?.[0];
    if (first) switchView(first.id);
}

async function loadView(viewId) {
    switch (viewId) {
        case 'deals':            return loadDeals();
        case 'my-claims':        return loadMyClaims();
        case 'profile':          return loadProfile();
        case 'biz-deals':        return loadBizDeals();
        case 'biz-claims':       return loadBizClaims();
        case 'biz-scanner':      return;
        case 'admin-members':    return loadAdminMembers();
        case 'admin-businesses': return loadAdminBusinesses();
        case 'admin-deals':      return loadAdminDeals();
    }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function avatarInitials(name) {
    return (name || 'SD').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function formatCAD(val) {
    return `$${Number(val).toFixed(2)}`;
}

function formatDate(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return iso; }
}

function truncate(str, len = 12) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '…' : str;
}

function escAttr(str) {
    if (!str) return '';
    return str.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

function showEmpty(containerId, icon, message) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">${icon}</div>
            <div class="empty-state-text">${message}</div>
        </div>
    `;
}

function showLoading(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `<div class="loading-pulse">Loading</div>`;
}

async function fetchBalance(wallet) {
    if (!wallet || wallet.startsWith('snap_placeholder')) return null;
    try {
        const res = await GET(`/api/chain/balance/${wallet}`);
        return res.display ?? null;
    } catch { return null; }
}

// -----------------------------------------------------------------------------
// MEMBER — Deals feed
// -----------------------------------------------------------------------------

async function loadDeals() {
    showLoading('deals-feed');

    try {
        const [dealsRes, bizRes] = await Promise.all([
            GET('/api/deals', false),
            GET('/api/businesses', false),
        ]);

        const deals      = dealsRes.deals    || [];
        const businesses = bizRes.businesses || [];
        const bizMap     = Object.fromEntries(businesses.map(b => [b.id, b]));

        document.getElementById('deals-savings-total').textContent =
            `${formatCAD(dealsRes.total_value || 0)} in savings`;

        if (deals.length === 0) {
            showEmpty('deals-feed', '🏷️', 'No deals available right now');
            return;
        }

        let claimedDealIds = new Set();
        if (state.wallet) {
            try {
                const claimsRes = await POST('/api/claims/by-member', { member_id: state.wallet });
                claimedDealIds  = new Set((claimsRes.claims || []).map(c => c.deal_id));
            } catch {}
        }

        document.getElementById('deals-feed').innerHTML = deals.map(deal => {
            const biz     = bizMap[deal.business_id] || {};
            const claimed = claimedDealIds.has(deal.id);
            return renderDealCard(deal, biz, claimed);
        }).join('');

        document.querySelectorAll('.deal-card-header').forEach(header => {
            header.addEventListener('click', () => toggleDealCard(header.dataset.dealId));
        });

        document.querySelectorAll('.btn-claim[data-deal-id]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openClaimModal(btn.dataset.dealId, deals, businesses);
            });
        });

    } catch (e) {
        showEmpty('deals-feed', '⚠️', 'Could not load deals');
    }
}

function renderDealCard(deal, biz, claimed) {
    const initials = avatarInitials(biz.name || 'SD');
    const category = (biz.category || 'other').toLowerCase();
    const left     = deal.claims_max > 0
        ? `${deal.claims_max - deal.claims_count} left`
        : 'Unlimited';

    const claimBtn = claimed
        ? `<div class="claimed-badge">✓ CLAIMED</div>`
        : `<button class="btn-claim" data-deal-id="${deal.id}">CLAIM THIS DEAL</button>`;

    return `
        <div class="deal-card${claimed ? ' claimed' : ''}" id="deal-card-${deal.id}">
            <div class="deal-card-header" data-deal-id="${deal.id}">
                <div class="biz-avatar ${category}">${initials}</div>
                <div class="deal-card-header-info">
                    <div class="biz-name-full">${biz.name || 'Local Business'}</div>
                    <div class="biz-category">${category}</div>
                </div>
                <div class="deal-value-pill">${formatCAD(deal.cad_value)}</div>
                <span class="deal-expand-icon">▾</span>
            </div>
            <div class="deal-card-body" id="deal-body-${deal.id}">
                <div class="deal-title">${deal.title}</div>
                <div class="deal-description">${deal.description}</div>
                <div class="deal-meta">
                    <span class="deal-meta-item deal-meta-prominent">🏷 ${left}</span>
                    <span class="deal-meta-item deal-meta-prominent">📅 Exp ${formatDate(deal.expires_at)}</span>
                </div>
                <div class="deal-card-footer">${claimBtn}</div>
            </div>
        </div>
    `;
}

function toggleDealCard(dealId) {
    const body = document.getElementById(`deal-body-${dealId}`);
    const card = document.getElementById(`deal-card-${dealId}`);
    const icon = card?.querySelector('.deal-expand-icon');
    if (!body) return;

    const isOpen = body.classList.contains('open');
    body.classList.toggle('open', !isOpen);
    if (icon) icon.textContent = isOpen ? '▾' : '▴';
}

// -----------------------------------------------------------------------------
// MEMBER — Claim modal
// -----------------------------------------------------------------------------

function openClaimModal(dealId, deals, businesses) {
    if (!state.token) { logout(); return; }

    const deal = deals.find(d => d.id === dealId);
    const biz  = businesses.find(b => b.id === deal?.business_id);
    if (!deal) return;

    state.pendingClaim = { deal, biz };

    document.getElementById('modal-claim-body').innerHTML = `
        <div style="margin-bottom:8px"><strong>${deal.title}</strong></div>
        <div style="font-size:13px;color:var(--text-dim);margin-bottom:12px">
            ${biz?.name || 'Local Business'}
        </div>
        <div style="font-family:var(--font-mono);font-size:13px;color:var(--accent)">
            Value: ${formatCAD(deal.cad_value)} CAD
        </div>
    `;

    showFlex('modal-claim');
}

async function confirmClaim() {
    const { deal } = state.pendingClaim || {};
    if (!deal) return;

    const btn = document.getElementById('btn-claim-confirm');
    btn.textContent = 'CLAIMING…';
    btn.disabled    = true;

    try {
        await POST('/api/claims/create', {
            id:          `claim_${Date.now()}`,
            member_id:   state.wallet || 'member_unknown',
            deal_id:     deal.id,
            business_id: deal.business_id,
            cad_value:   deal.cad_value,
        });

        closeClaimModal();
        await loadDeals();

    } catch (e) {
        btn.textContent = 'CLAIM';
        btn.disabled    = false;
        alert('Could not claim deal. Please try again.');
    }
}

function closeClaimModal() {
    hide('modal-claim');
    state.pendingClaim = null;
    const btn = document.getElementById('btn-claim-confirm');
    btn.textContent = 'CLAIM';
    btn.disabled    = false;
}

// -----------------------------------------------------------------------------
// MEMBER — My Claims
// -----------------------------------------------------------------------------

async function loadMyClaims() {
    showLoading('my-claims-list');

    try {
        const res    = await POST('/api/claims/by-member', { member_id: state.wallet || 'member_unknown' });
        const claims = res.claims || [];

        document.getElementById('claims-total-saved').textContent =
            `${formatCAD(res.total_value || 0)} saved`;

        if (claims.length === 0) {
            showEmpty('my-claims-list', '🏷️', 'No claims yet — find a deal!');
            return;
        }

        const bizRes   = await GET('/api/businesses', false);
        const bizMap   = Object.fromEntries((bizRes.businesses || []).map(b => [b.id, b]));
        const dealsRes = await GET('/api/deals', false);
        const dealMap  = Object.fromEntries((dealsRes.deals || []).map(d => [d.id, d]));

        document.getElementById('my-claims-list').innerHTML = claims.map(claim => {
            const deal = dealMap[claim.deal_id]    || {};
            const biz  = bizMap[claim.business_id] || {};
            return renderClaimRow(claim, deal, biz);
        }).join('');

        document.querySelectorAll('.btn-show-qr').forEach(btn => {
            btn.addEventListener('click', () => toggleClaimQR(btn.dataset.claimId));
        });

    } catch (e) {
        showEmpty('my-claims-list', '⚠️', 'Could not load claims');
    }
}

function renderClaimRow(claim, deal, biz) {
    const status   = claim.redeemed ? 'redeemed' : 'pending';
    const label    = claim.redeemed ? 'REDEEMED' : 'PENDING';
    const category = (biz.category || 'other').toLowerCase();

    const qrToggle = !claim.redeemed
        ? `<button class="btn-show-qr" data-claim-id="${claim.id}">SHOW QR</button>`
        : '';

    return `
        <div class="claim-row" id="claim-row-${claim.id}">
            <div class="claim-row-main">
                <div class="biz-avatar ${category}"
                     style="width:36px;height:36px;font-size:12px">
                    ${avatarInitials(biz.name || 'SD')}
                </div>
                <div class="claim-row-info">
                    <div class="claim-row-title">${deal.title || claim.deal_id}</div>
                    <div class="claim-row-biz">${biz.name || ''} · ${formatDate(claim.claimed_at)}</div>
                </div>
                <div class="claim-row-value">${formatCAD(claim.cad_value_redeemed)}</div>
                <div class="claim-status ${status}">${label}</div>
                ${qrToggle}
            </div>
            <div class="claim-qr-panel" id="qr-panel-${claim.id}">
                <div class="claim-qr-label">SHOW THIS AT THE COUNTER</div>
                <div class="claim-qr-canvas" id="qr-canvas-${claim.id}"></div>
                <div class="claim-qr-id">${claim.id}</div>
            </div>
        </div>
    `;
}

function toggleClaimQR(claimId) {
    const panel = document.getElementById(`qr-panel-${claimId}`);
    const btn   = document.querySelector(`.btn-show-qr[data-claim-id="${claimId}"]`);
    if (!panel) return;

    const isOpen = panel.classList.contains('open');

    if (isOpen) {
        panel.classList.remove('open');
        if (btn) btn.textContent = 'SHOW QR';
    } else {
        panel.classList.add('open');
        if (btn) btn.textContent = 'HIDE QR';

        const canvas = document.getElementById(`qr-canvas-${claimId}`);
        if (canvas && !canvas.hasChildNodes()) {
            new QRCode(canvas, {
                text:         claimId,
                width:        180,
                height:       180,
                colorDark:    '#000000',
                colorLight:   '#ffffff',
                correctLevel: QRCode.CorrectLevel.M,
            });
        }
    }
}

// -----------------------------------------------------------------------------
// MEMBER — Profile
// -----------------------------------------------------------------------------

async function loadProfile() {
    const content = document.getElementById('profile-content');
    content.innerHTML = `<div class="loading-pulse">Loading</div>`;

    let memberName    = '—';
    let enrolledAt    = '—';
    let walletAddress = state.wallet || '—';

    if (state.wallet) {
        try {
            const res = await POST('/api/members/lookup', { wallet: state.wallet });
            if (res.found) {
                memberName = res.name        || '—';
                enrolledAt = formatDate(res.enrolled_at);
            }
        } catch {}
    }

    const balance = await fetchBalance(state.wallet);

    let claimsTotal    = 0;
    let claimsPending  = 0;
    let claimsRedeemed = 0;
    let totalSaved     = 0;

    try {
        const res    = await POST('/api/claims/by-member', { member_id: state.wallet || 'member_unknown' });
        const claims = res.claims || [];
        claimsTotal    = claims.length;
        claimsPending  = claims.filter(c => !c.redeemed).length;
        claimsRedeemed = claims.filter(c =>  c.redeemed).length;
        totalSaved     = res.total_value || 0;
    } catch {}

    content.innerHTML = `
        <div class="profile-hero">
            <div class="profile-avatar">${avatarInitials(memberName)}</div>
            <div class="profile-hero-info">
                <div class="profile-name">${memberName}</div>
                <div class="profile-role-tag">${(state.role || '').toUpperCase()}</div>
            </div>
        </div>

        <div class="profile-card">
            <div class="profile-label">Member Since</div>
            <div class="profile-value">${enrolledAt}</div>
        </div>

        <div class="profile-card">
            <div class="profile-label">Wallet Address</div>
            <div class="profile-value profile-address">${walletAddress}</div>
        </div>

        <div class="profile-card">
            <div class="profile-label">SNAP Balance</div>
            <div class="profile-value" style="color:var(--accent)">
                ${balance !== null ? `${balance} SNAP` : '—'}
            </div>
        </div>

        <div class="profile-card">
            <div class="profile-label">Network</div>
            <div class="profile-value">Halifax · Dartmouth · Nova Scotia</div>
        </div>

        <div class="profile-section-title">My Activity</div>

        <div class="profile-metrics">
            <div class="metric-card">
                <div class="metric-value">${claimsTotal}</div>
                <div class="metric-label">Total Claims</div>
            </div>
            <div class="metric-card">
                <div class="metric-value" style="color:var(--amber)">${claimsPending}</div>
                <div class="metric-label">Pending</div>
            </div>
            <div class="metric-card">
                <div class="metric-value" style="color:var(--green)">${claimsRedeemed}</div>
                <div class="metric-label">Redeemed</div>
            </div>
            <div class="metric-card">
                <div class="metric-value" style="color:var(--accent)">${formatCAD(totalSaved)}</div>
                <div class="metric-label">Total Saved</div>
            </div>
        </div>
    `;
}

// -----------------------------------------------------------------------------
// BUSINESS — My Deals
// -----------------------------------------------------------------------------

async function loadBizDeals() {
    showLoading('biz-deals-list');

    if (!state.businessId) {
        showEmpty('biz-deals-list', '🏪', 'No business ID configured');
        return;
    }

    try {
        const res   = await POST('/api/deals/by-business', { business_id: state.businessId });
        const deals = res.deals || [];

        if (deals.length === 0) {
            showEmpty('biz-deals-list', '📋', 'No active deals — post one!');
            return;
        }

        document.getElementById('biz-deals-list').innerHTML = deals.map(deal => `
            <div class="biz-deal-row">
                <div class="biz-deal-row-header">
                    <div class="biz-deal-row-title">${deal.title}</div>
                    <div class="deal-value-pill">${formatCAD(deal.cad_value)}</div>
                </div>
                <div class="biz-deal-row-meta">
                    <span>${deal.claims_max > 0
                        ? `${deal.claims_count} / ${deal.claims_max} claimed`
                        : `${deal.claims_count} claimed`}</span>
                    <span>Exp ${formatDate(deal.expires_at)}</span>
                    <span style="color:${deal.active ? 'var(--green)' : 'var(--red)'}">
                        ${deal.active ? '● ACTIVE' : '● INACTIVE'}
                    </span>
                </div>
            </div>
        `).join('');

    } catch (e) {
        showEmpty('biz-deals-list', '⚠️', 'Could not load deals');
    }
}

// -----------------------------------------------------------------------------
// BUSINESS — Claims
// -----------------------------------------------------------------------------

async function loadBizClaims() {
    showLoading('biz-claims-list');

    if (!state.businessId) {
        showEmpty('biz-claims-list', '📥', 'No business ID configured');
        return;
    }

    try {
        const res    = await POST('/api/claims/by-business', { business_id: state.businessId });
        const claims = res.claims || [];

        if (claims.length === 0) {
            showEmpty('biz-claims-list', '📥', 'No claims yet');
            return;
        }

        document.getElementById('biz-claims-list').innerHTML = claims.map(claim => `
            <div class="biz-claim-row">
                <div class="biz-claim-info">
                    <div class="biz-claim-title">${claim.deal_id}</div>
                    <div class="biz-claim-meta">
                        ${truncate(claim.member_id, 16)} · ${formatDate(claim.claimed_at)}
                    </div>
                </div>
                <div class="claim-row-value">${formatCAD(claim.cad_value_redeemed)}</div>
                <div class="claim-status ${claim.redeemed ? 'redeemed' : 'pending'}">
                    ${claim.redeemed ? 'REDEEMED' : 'PENDING'}
                </div>
                ${!claim.redeemed ? `
                    <button class="btn-action-sm" onclick="redeemClaim('${claim.id}')">REDEEM</button>
                ` : ''}
            </div>
        `).join('');

    } catch (e) {
        showEmpty('biz-claims-list', '⚠️', 'Could not load claims');
    }
}

async function redeemClaim(claimId) {
    if (!state.businessId) return;
    try {
        await POST('/api/claims/redeem', { id: claimId, business_id: state.businessId });
        await loadBizClaims();
    } catch { alert('Could not redeem claim. Please try again.'); }
}

// -----------------------------------------------------------------------------
// BUSINESS — Scanner
// -----------------------------------------------------------------------------

async function verifyMember() {
    const wallet = document.getElementById('scanner-wallet-input').value.trim();
    const result = document.getElementById('scanner-result');
    if (!wallet) return;

    result.className = '';
    result.style.display = 'block';
    result.innerHTML = '<div class="loading-pulse">Checking</div>';

    try {
        const res = await POST('/api/members/lookup', { wallet });

        if (res.found && res.active) {
            result.classList.add('verified');
            result.innerHTML = `
                <div class="scanner-result-status ok">✓ Active Member</div>
                <div class="scanner-result-detail">
                    ${res.name || 'Member'}<br>
                    Enrolled ${formatDate(res.enrolled_at)}<br>
                    <span style="word-break:break-all">${wallet}</span>
                </div>
            `;
        } else {
            result.classList.add('unverified');
            result.innerHTML = `
                <div class="scanner-result-status bad">✗ ${res.found ? 'Suspended' : 'Not a Member'}</div>
                <div class="scanner-result-detail">${res.message}</div>
            `;
        }
    } catch {
        result.classList.add('unverified');
        result.innerHTML = `
            <div class="scanner-result-status bad">✗ Lookup Failed</div>
            <div class="scanner-result-detail">Please try again</div>
        `;
    }
}

// -----------------------------------------------------------------------------
// BUSINESS — Post deal modal
// -----------------------------------------------------------------------------

async function openPostDealModal() {
    // populate business selector
    const sel = document.getElementById('post-deal-business-id');
    sel.innerHTML = '<option value="">Select business…</option>';
    try {
        const res = await GET('/api/businesses/all');
        (res.businesses || []).forEach(b => {
            const opt = document.createElement('option');
            opt.value       = b.id;
            opt.textContent = b.name;
            sel.appendChild(opt);
        });
        // if business role, pre-select their business
        if (state.businessId) sel.value = state.businessId;
    } catch {}
    showFlex('modal-post-deal');
}

function closePostDealModal() {
    hide('modal-post-deal');
    ['post-deal-title','post-deal-description','post-deal-value',
     'post-deal-claims-max','post-deal-onboarding-fee',
     'post-deal-admin-wallet-id','post-deal-pin']
        .forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('post-deal-error').style.display = 'none';
}

async function submitPostDeal() {
    const businessId    = document.getElementById('post-deal-business-id').value.trim();
    const title         = document.getElementById('post-deal-title').value.trim();
    const desc          = document.getElementById('post-deal-description').value.trim();
    const cadValue      = parseFloat(document.getElementById('post-deal-value').value);
    const claimsMax     = parseInt(document.getElementById('post-deal-claims-max').value) || 0;
    const onboardingFee = parseFloat(document.getElementById('post-deal-onboarding-fee').value);
    const adminWalletId = document.getElementById('post-deal-admin-wallet-id').value.trim();
    const pin           = document.getElementById('post-deal-pin').value.trim();
    const errEl         = document.getElementById('post-deal-error');

    errEl.style.display = 'none';

    if (!businessId || !title || !desc || !cadValue || !onboardingFee || !adminWalletId || !pin) {
        errEl.textContent   = 'All fields are required';
        errEl.style.display = 'block';
        return;
    }

    if (onboardingFee <= 0) {
        errEl.textContent   = 'Onboarding fee must be greater than zero';
        errEl.style.display = 'block';
        return;
    }

    const btn = document.getElementById('btn-post-deal-confirm');
    btn.textContent = 'POSTING…';
    btn.disabled    = true;

    try {
        // step 1 — post deal — backend creates deal wallet and fires DEAL_POSTED opcode
        const dealRes = await POST('/api/deals/post', {
            id:              `deal_${businessId}_${Date.now()}`,
            business_id:     businessId,
            title,
            description:     desc,
            cad_value:       cadValue,
            onboarding_fee:  onboardingFee,
            claims_max:      claimsMax,
        });

        // step 2 — send onboarding fee SNAP from admin wallet to deal wallet
        await POST('/api/wallets/send-snap', {
            from_wallet_id: adminWalletId,
            to_address:     dealRes.wallet,
            amount:         onboardingFee,
            pin,
        });

        closePostDealModal();

        // reload whichever deals view is active
        if (state.role === 'admin') {
            await loadAdminDeals();
        } else {
            await loadBizDeals();
        }

    } catch (e) {
        errEl.textContent   = `Could not post deal: ${e.message}`;
        errEl.style.display = 'block';
        btn.textContent = 'POST';
        btn.disabled    = false;
    } finally {
        if (!document.getElementById('post-deal-error').textContent) {
            btn.textContent = 'POST';
            btn.disabled    = false;
        }
    }
}

// -----------------------------------------------------------------------------
// ADMIN — Members
// -----------------------------------------------------------------------------

// store members by id for safe onclick access
const _memberStore = {};

async function loadAdminMembers() {
    showLoading('admin-members-list');

    try {
        const res     = await GET('/api/members');
        const members = res.members || [];

        document.getElementById('admin-members-count-bar').innerHTML =
            `<div class="admin-count-bar">${res.total || 0} members enrolled</div>`;

        if (members.length === 0) {
            showEmpty('admin-members-list', '👥', 'No members enrolled yet');
            return;
        }

        members.forEach(m => { _memberStore[m.id] = m; });

        document.getElementById('admin-members-list').innerHTML = members.map(m => {
            const statusLabel = m.active ? 'Active' : 'Suspended';
            const suspendBtn  = m.active
                ? `<button class="btn-claim" style="background:var(--danger,#c0392b);margin-right:8px"
                       onclick="suspendMember('${m.id}')">SUSPEND</button>`
                : `<span class="claimed-badge">SUSPENDED</span>`;

            return `
            <div class="deal-card" id="member-card-${m.id}">
                <div class="deal-card-header" onclick="toggleMemberCard('${m.id}')" style="cursor:pointer">
                    <div class="biz-avatar other" style="width:36px;height:36px;font-size:12px">
                        ${avatarInitials(m.name)}
                    </div>
                    <div class="deal-card-header-info">
                        <div class="biz-name-full">${m.name}</div>
                        <div class="biz-category">${truncate(m.wallet, 16)} · Enrolled ${formatDate(m.enrolled_at)}</div>
                    </div>
                    <div class="deal-value-pill" id="member-bal-${m.id}">…</div>
                    <div class="status-dot ${m.active ? 'active' : 'inactive'}" style="margin-right:8px"></div>
                    <span class="deal-expand-icon">▾</span>
                </div>
                <div class="deal-card-body" id="member-body-${m.id}">
                    <div class="deal-meta" style="margin-top:4px">
                        <span class="deal-meta-item deal-meta-prominent">🎁 Starter: ${m.starter_snap} SNAP</span>
                        <span class="deal-meta-item deal-meta-prominent">📅 ${formatDate(m.enrolled_at)}</span>
                        <span class="deal-meta-item deal-meta-prominent">⬤ ${statusLabel}</span>
                    </div>
                    <div class="deal-meta" style="margin-top:6px">
                        <span class="deal-meta-item" style="font-family:var(--font-mono);font-size:10px;word-break:break-all">${m.wallet}</span>
                    </div>
                    <div class="deal-card-footer" style="margin-top:12px">
                        ${suspendBtn}
                        <button class="btn-claim" onclick="openEditMemberModal('${m.id}')">EDIT</button>
                    </div>
                </div>
            </div>`;
        }).join('');

        // fetch balances in parallel
        members.forEach(async m => {
            try {
                const bal = await GET(`/api/chain/balance/${m.wallet}`);
                const el  = document.getElementById(`member-bal-${m.id}`);
                if (el) el.textContent = `${parseFloat(bal.display).toString()} SNAP`;
            } catch { /* leave as … */ }
        });

    } catch { showEmpty('admin-members-list', '⚠️', 'Could not load members'); }
}

function toggleMemberCard(id) {
    const body = document.getElementById(`member-body-${id}`);
    const card = document.getElementById(`member-card-${id}`);
    const icon = card?.querySelector('.deal-expand-icon');
    if (!body) return;
    const isOpen = body.classList.contains('open');
    body.classList.toggle('open', !isOpen);
    if (icon) icon.textContent = isOpen ? '▾' : '▴';
}

async function suspendMember(id) {
    if (!confirm('Suspend this member? They will lose access.')) return;
    try {
        await POST('/api/members/suspend', { id });
        await loadAdminMembers();
    } catch (e) { alert(`Suspend failed: ${e.message}`); }
}

function openEditMemberModal(id) {
    const m = _memberStore[id];
    if (!m) return;
    document.getElementById('edit-member-id').value   = id;
    document.getElementById('edit-member-name').value = m.name;
    document.getElementById('edit-member-error').style.display = 'none';
    document.getElementById('btn-edit-member-confirm').textContent = 'SAVE';
    document.getElementById('btn-edit-member-confirm').disabled    = false;
    showFlex('modal-edit-member');
    setTimeout(() => document.getElementById('edit-member-name')?.focus(), 100);
}

function closeEditMemberModal() {
    hide('modal-edit-member');
}

async function submitEditMember() {
    const id   = document.getElementById('edit-member-id').value;
    const name = document.getElementById('edit-member-name').value.trim();
    const errEl = document.getElementById('edit-member-error');

    errEl.style.display = 'none';

    if (!name) {
        errEl.textContent   = 'Name is required';
        errEl.style.display = 'block';
        return;
    }

    const btn = document.getElementById('btn-edit-member-confirm');
    btn.textContent = 'SAVING…';
    btn.disabled    = true;

    try {
        await POST('/api/members/update', { id, name });
        closeEditMemberModal();
        await loadAdminMembers();
    } catch (e) {
        errEl.textContent   = `Update failed: ${e.message}`;
        errEl.style.display = 'block';
        btn.textContent = 'SAVE';
        btn.disabled    = false;
    }
}

// -----------------------------------------------------------------------------
// ADMIN — Enroll member modal
// -----------------------------------------------------------------------------

function openEnrollMemberModal() {
    ['enroll-name','enroll-admin-wallet-id','enroll-wallet-pin'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('enroll-starter-snap').value = '100';
    document.getElementById('enroll-error').style.display = 'none';
    showFlex('modal-enroll-member');
    setTimeout(() => document.getElementById('enroll-name')?.focus(), 100);
}

function closeEnrollMemberModal() {
    hide('modal-enroll-member');
}

async function submitEnrollMember() {
    const name          = document.getElementById('enroll-name').value.trim();
    const starterSnap   = parseFloat(document.getElementById('enroll-starter-snap').value) || 100;
    const adminWalletId = document.getElementById('enroll-admin-wallet-id').value.trim();
    const pin           = document.getElementById('enroll-wallet-pin').value.trim();
    const errEl         = document.getElementById('enroll-error');

    errEl.style.display = 'none';

    if (!name || !adminWalletId || !pin) {
        errEl.textContent   = 'All fields are required';
        errEl.style.display = 'block';
        return;
    }

    const btn = document.getElementById('btn-enroll-confirm');
    btn.textContent = 'ENROLLING…';
    btn.disabled    = true;

    try {
        // step 1 — create a new wallet for the member
        const memberId   = `member_${Date.now()}`;
        const walletRes  = await POST('/api/wallets/create', {
            id:    memberId,
            label: name,
            pin,
        });

        const memberAddress = walletRes.address;

        // step 2 — enroll the member
        await POST('/api/members/enroll', {
            id:     memberId,
            name,
            wallet: memberAddress,
        });

        // step 3 — send starter SNAP — non-fatal, member is enrolled even if send fails
        try {
            await POST('/api/wallets/send-snap', {
                from_wallet_id: adminWalletId,
                to_address:     memberAddress,
                amount:         starterSnap,
                pin,
            });
        } catch (sendErr) {
            console.warn('SNAP send failed after member enroll:', sendErr.message);
        }

        closeEnrollMemberModal();
        showEnrollResult(name, memberAddress, starterSnap);
        await loadAdminMembers();

    } catch (e) {
        errEl.textContent   = `Enrollment failed: ${e.message}`;
        errEl.style.display = 'block';
        btn.textContent = 'ENROLL';
        btn.disabled    = false;
    }
}

// -----------------------------------------------------------------------------
// ADMIN — Enroll result modal
// -----------------------------------------------------------------------------

function showEnrollResult(name, address, snap) {
    document.getElementById('enroll-result-name').textContent = name;
    document.getElementById('enroll-result-address').textContent = address;
    document.getElementById('enroll-result-snap').textContent = `${snap} SNAP`;
    showFlex('modal-enroll-result');
}

function closeEnrollResult() {
    hide('modal-enroll-result');
}

function copyEnrollAddress() {
    const addr = document.getElementById('enroll-result-address').textContent;
    navigator.clipboard.writeText(addr).catch(() => {});
    const btn = document.getElementById('btn-copy-enroll-address');
    btn.textContent = 'COPIED ✓';
    setTimeout(() => { btn.textContent = 'COPY WALLET ADDRESS'; }, 2000);
}

// -----------------------------------------------------------------------------
// ADMIN — Businesses
// -----------------------------------------------------------------------------

// store businesses by id so onclick handlers can look up safely — avoids apostrophe issues
const _bizStore  = {};

// store deals by id for safe onclick access
const _dealStore = {};

async function loadAdminBusinesses() {
    showLoading('admin-biz-list');

    try {
        const res        = await GET('/api/businesses/all');
        const businesses = res.businesses || [];

        document.getElementById('admin-biz-count').textContent = `${res.total || 0} total`;

        if (businesses.length === 0) {
            showEmpty('admin-biz-list', '🏪', 'No businesses enrolled yet');
            return;
        }

        // cache all businesses for safe access from onclick
        businesses.forEach(b => { _bizStore[b.id] = b; });

        document.getElementById('admin-biz-list').innerHTML = businesses.map(b => {
            const category    = (b.category || 'other').toLowerCase();
            const statusLabel = b.active ? 'Active' : 'Suspended';
            const suspendBtn  = b.active
                ? `<button class="btn-claim" style="background:var(--danger,#c0392b);margin-right:8px"
                       onclick="suspendBusiness('${b.id}')">SUSPEND</button>`
                : `<span class="claimed-badge">SUSPENDED</span>`;

            return `
            <div class="deal-card" id="biz-card-${b.id}">
                <div class="deal-card-header" onclick="toggleBizCard('${b.id}')" style="cursor:pointer">
                    <div class="biz-avatar ${category}" style="width:36px;height:36px;font-size:12px">
                        ${avatarInitials(b.name)}
                    </div>
                    <div class="deal-card-header-info">
                        <div class="biz-name-full">${b.name}</div>
                        <div class="biz-category">${category} · ${truncate(b.wallet, 16)} · ${formatDate(b.enrolled_at)}</div>
                    </div>
                    <div class="deal-value-pill" id="biz-bal-${b.id}">…</div>
                    <div class="status-dot ${b.active ? 'active' : 'inactive'}" style="margin-right:8px"></div>
                    <span class="deal-expand-icon">▾</span>
                </div>
                <div class="deal-card-body" id="biz-body-${b.id}">
                    <div class="deal-description">${b.description}</div>
                    <div class="deal-meta" style="margin-top:10px">
                        <span class="deal-meta-item deal-meta-prominent">💰 Fee: ${b.onboarding_fee > 0 ? b.onboarding_fee + ' SNAP' : 'None'}</span>
                        <span class="deal-meta-item deal-meta-prominent">📅 ${formatDate(b.enrolled_at)}</span>
                        <span class="deal-meta-item deal-meta-prominent">⬤ ${statusLabel}</span>
                    </div>
                    <div class="deal-meta" style="margin-top:6px">
                        <span class="deal-meta-item" style="font-family:var(--font-mono);font-size:10px;word-break:break-all">${b.wallet}</span>
                    </div>
                    <div class="deal-card-footer" style="margin-top:12px">
                        ${suspendBtn}
                        <button class="btn-claim" onclick="openEditBizModal('${b.id}')">EDIT</button>
                    </div>
                </div>
            </div>`;
        }).join('');

        // fetch balances in parallel and update pills
        businesses.forEach(async b => {
            try {
                const bal = await GET(`/api/chain/balance/${b.wallet}`);
                const el  = document.getElementById(`biz-bal-${b.id}`);
                if (el) el.textContent = `${parseFloat(bal.display).toString()} SNAP`;
            } catch { /* leave as … */ }
        });

    } catch { showEmpty('admin-biz-list', '⚠️', 'Could not load businesses'); }
}

function toggleBizCard(id) {
    const body = document.getElementById(`biz-body-${id}`);
    const card = document.getElementById(`biz-card-${id}`);
    const icon = card?.querySelector('.deal-expand-icon');
    if (!body) return;
    const isOpen = body.classList.contains('open');
    body.classList.toggle('open', !isOpen);
    if (icon) icon.textContent = isOpen ? '▾' : '▴';
}

async function suspendBusiness(id) {
    if (!confirm('Suspend this business? It will be hidden from members.')) return;
    try {
        await POST('/api/businesses/suspend', { id });
        await loadAdminBusinesses();
    } catch (e) { alert(`Suspend failed: ${e.message}`); }
}

function openEditBizModal(id) {
    const b = _bizStore[id];
    if (!b) return;
    document.getElementById('edit-biz-id').value          = id;
    document.getElementById('edit-biz-name').value        = b.name;
    document.getElementById('edit-biz-category').value    = b.category;
    document.getElementById('edit-biz-description').value = b.description;
    document.getElementById('edit-biz-error').style.display = 'none';
    document.getElementById('btn-edit-biz-confirm').textContent = 'SAVE';
    document.getElementById('btn-edit-biz-confirm').disabled    = false;
    showFlex('modal-edit-business');
    setTimeout(() => document.getElementById('edit-biz-name')?.focus(), 100);
}

function closeEditBizModal() {
    hide('modal-edit-business');
}

async function submitEditBusiness() {
    const id          = document.getElementById('edit-biz-id').value;
    const name        = document.getElementById('edit-biz-name').value.trim();
    const category    = document.getElementById('edit-biz-category').value;
    const description = document.getElementById('edit-biz-description').value.trim();
    const errEl       = document.getElementById('edit-biz-error');

    errEl.style.display = 'none';

    if (!name || !category || !description) {
        errEl.textContent   = 'All fields are required';
        errEl.style.display = 'block';
        return;
    }

    const btn = document.getElementById('btn-edit-biz-confirm');
    btn.textContent = 'SAVING…';
    btn.disabled    = true;

    try {
        await POST('/api/businesses/update', { id, name, category, description });
        closeEditBizModal();
        await loadAdminBusinesses();
    } catch (e) {
        errEl.textContent   = `Update failed: ${e.message}`;
        errEl.style.display = 'block';
        btn.textContent = 'SAVE';
        btn.disabled    = false;
    }
}

// -----------------------------------------------------------------------------
// ADMIN — All Deals
// -----------------------------------------------------------------------------

async function loadAdminDeals() {
    showLoading('admin-deals-list');

    try {
        const [dealsRes, bizRes] = await Promise.all([
            GET('/api/deals/all'),
            GET('/api/businesses/all'),
        ]);

        const deals  = dealsRes.deals || [];
        const bizMap = Object.fromEntries((bizRes.businesses || []).map(b => [b.id, b]));

        deals.forEach(d => { _dealStore[d.id] = d; });

        document.getElementById('admin-deals-count').textContent = `${dealsRes.total || 0} total`;

        if (deals.length === 0) {
            showEmpty('admin-deals-list', '🏷️', 'No deals posted yet');
            return;
        }

        document.getElementById('admin-deals-list').innerHTML = deals.map(deal => {
            const biz       = bizMap[deal.business_id] || {};
            const category  = (biz.category || 'other').toLowerCase();
            const left      = deal.claims_max > 0
                ? `${deal.claims_max - deal.claims_count} / ${deal.claims_max} left`
                : 'Unlimited';
            const statusLabel = deal.active ? 'Active' : 'Cancelled';
            const cancelBtn   = deal.active
                ? `<button class="btn-claim" style="background:var(--danger,#c0392b);margin-right:8px"
                       onclick="cancelDeal('${deal.id}','${deal.business_id}')">CANCEL</button>`
                : `<span class="claimed-badge">CANCELLED</span>`;

            return `
            <div class="deal-card" id="admin-deal-card-${deal.id}">
                <div class="deal-card-header" onclick="toggleAdminDealCard('${deal.id}')" style="cursor:pointer">
                    <div class="biz-avatar ${category}" style="width:36px;height:36px;font-size:12px">
                        ${avatarInitials(biz.name || 'SD')}
                    </div>
                    <div class="deal-card-header-info">
                        <div class="biz-name-full">${deal.title}</div>
                        <div class="biz-category">${biz.name || deal.business_id} · ${formatCAD(deal.cad_value)} · ${deal.claims_count} claimed</div>
                    </div>
                    <div class="deal-value-pill" id="deal-bal-${deal.id}">…</div>
                    <div class="status-dot ${deal.active ? 'active' : 'inactive'}" style="margin-right:8px"></div>
                    <span class="deal-expand-icon">▾</span>
                </div>
                <div class="deal-card-body" id="admin-deal-body-${deal.id}">
                    <div class="deal-description">${deal.description}</div>
                    <div class="deal-meta" style="margin-top:10px">
                        <span class="deal-meta-item deal-meta-prominent">💰 ${formatCAD(deal.cad_value)} / ${deal.snap_value} SNAP</span>
                        <span class="deal-meta-item deal-meta-prominent">🏷 ${left}</span>
                        <span class="deal-meta-item deal-meta-prominent">📅 Exp ${formatDate(deal.expires_at)}</span>
                        <span class="deal-meta-item deal-meta-prominent">⬤ ${statusLabel}</span>
                    </div>
                    <div class="deal-meta" style="margin-top:6px">
                        <span class="deal-meta-item" style="font-family:var(--font-mono);font-size:10px;word-break:break-all">${deal.wallet}</span>
                    </div>
                    <div class="deal-card-footer" style="margin-top:12px">
                        ${cancelBtn}
                        ${deal.active ? `<button class="btn-claim"
                            onclick="openEditDealModal('${deal.id}')">EDIT</button>` : ''}
                    </div>
                </div>
            </div>`;
        }).join('');

        // fetch deal wallet balances in parallel
        deals.forEach(async deal => {
            try {
                const bal = await GET(`/api/chain/balance/${deal.wallet}`);
                const el  = document.getElementById(`deal-bal-${deal.id}`);
                if (el) el.textContent = `${parseFloat(bal.display).toString()} SNAP`;
            } catch { /* leave as … */ }
        });

    } catch { showEmpty('admin-deals-list', '⚠️', 'Could not load deals'); }
}

function toggleAdminDealCard(id) {
    const body = document.getElementById(`admin-deal-body-${id}`);
    const card = document.getElementById(`admin-deal-card-${id}`);
    const icon = card?.querySelector('.deal-expand-icon');
    if (!body) return;
    const isOpen = body.classList.contains('open');
    body.classList.toggle('open', !isOpen);
    if (icon) icon.textContent = isOpen ? '▾' : '▴';
}

async function cancelDeal(id, businessId) {
    if (!confirm('Cancel this deal? It will be hidden from members.')) return;
    try {
        await POST('/api/deals/cancel', { id, business_id: businessId });
        await loadAdminDeals();
    } catch (e) { alert(`Cancel failed: ${e.message}`); }
}

function openEditDealModal(id) {
    const d = _dealStore[id];
    if (!d) return;
    document.getElementById('edit-deal-id').value          = id;
    document.getElementById('edit-deal-business-id').value = d.business_id;
    document.getElementById('edit-deal-title').value       = d.title;
    document.getElementById('edit-deal-description').value = d.description;
    document.getElementById('edit-deal-cad-value').value   = d.cad_value;
    document.getElementById('edit-deal-expires-at').value  = d.expires_at ? d.expires_at.slice(0,10) : '';
    document.getElementById('edit-deal-claims-max').value  = d.claims_max;
    document.getElementById('edit-deal-error').style.display = 'none';
    document.getElementById('btn-edit-deal-confirm').textContent = 'SAVE';
    document.getElementById('btn-edit-deal-confirm').disabled    = false;
    showFlex('modal-edit-deal');
    setTimeout(() => document.getElementById('edit-deal-title')?.focus(), 100);
}

function closeEditDealModal() {
    hide('modal-edit-deal');
}

async function submitEditDeal() {
    const id          = document.getElementById('edit-deal-id').value;
    const businessId  = document.getElementById('edit-deal-business-id').value;
    const title       = document.getElementById('edit-deal-title').value.trim();
    const description = document.getElementById('edit-deal-description').value.trim();
    const cadValue    = parseFloat(document.getElementById('edit-deal-cad-value').value);
    const expiresAt   = document.getElementById('edit-deal-expires-at').value;
    const claimsMax   = parseInt(document.getElementById('edit-deal-claims-max').value) || 0;
    const errEl       = document.getElementById('edit-deal-error');

    errEl.style.display = 'none';

    if (!title || !description || isNaN(cadValue) || cadValue <= 0) {
        errEl.textContent   = 'Title, description and a valid value are required';
        errEl.style.display = 'block';
        return;
    }

    const btn = document.getElementById('btn-edit-deal-confirm');
    btn.textContent = 'SAVING…';
    btn.disabled    = true;

    try {
        await POST('/api/deals/update', {
            id,
            business_id: businessId,
            title,
            description,
            cad_value:  cadValue,
            expires_at: expiresAt ? `${expiresAt}T23:59:59Z` : '',
            claims_max: claimsMax,
        });
        closeEditDealModal();
        await loadAdminDeals();
    } catch (e) {
        errEl.textContent   = `Update failed: ${e.message}`;
        errEl.style.display = 'block';
        btn.textContent = 'SAVE';
        btn.disabled    = false;
    }
}

// -----------------------------------------------------------------------------
// ADMIN — Enroll business modal
// -----------------------------------------------------------------------------

function openEnrollBusinessModal() {
    ['enroll-biz-name','enroll-biz-description','enroll-biz-onboarding-fee',
     'enroll-biz-admin-wallet-id','enroll-biz-pin'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('enroll-biz-category').value = '';
    document.getElementById('enroll-biz-error').style.display = 'none';
    showFlex('modal-enroll-business');
    setTimeout(() => document.getElementById('enroll-biz-name')?.focus(), 100);
}

function closeEnrollBusinessModal() {
    hide('modal-enroll-business');
}

async function submitEnrollBusiness() {
    const name          = document.getElementById('enroll-biz-name').value.trim();
    const category      = document.getElementById('enroll-biz-category').value;
    const description   = document.getElementById('enroll-biz-description').value.trim();
    const onboardingFee = parseFloat(document.getElementById('enroll-biz-onboarding-fee').value) || 0;
    const adminWalletId = document.getElementById('enroll-biz-admin-wallet-id').value.trim();
    const pin           = document.getElementById('enroll-biz-pin').value.trim();
    const errEl         = document.getElementById('enroll-biz-error');

    errEl.style.display = 'none';

    if (!name || !category || !description || !adminWalletId || !pin) {
        errEl.textContent   = 'All fields are required';
        errEl.style.display = 'block';
        return;
    }

    const btn = document.getElementById('btn-enroll-biz-confirm');
    btn.textContent = 'ENROLLING…';
    btn.disabled    = true;

    try {
        // step 1 — enroll business — backend creates wallet internally
        const bizId  = `biz_${Date.now()}`;
        const bizRes = await POST('/api/businesses/enroll', {
            id:             bizId,
            name,
            category,
            description,
            onboarding_fee: onboardingFee,
        });

        if (!bizRes.success) {
            errEl.textContent   = bizRes.message || 'Enrollment failed';
            errEl.style.display = 'block';
            btn.textContent = 'ENROLL';
            btn.disabled    = false;
            return;
        }

        // step 2 — send onboarding fee SNAP from admin wallet to business wallet
        // non-fatal — business is enrolled even if SNAP send fails
        if (onboardingFee > 0) {
            try {
                await POST('/api/wallets/send-snap', {
                    from_wallet_id: adminWalletId,
                    to_address:     bizRes.wallet,
                    amount:         onboardingFee,
                    pin,
                });
            } catch (sendErr) {
                console.warn('SNAP send failed after enrollment:', sendErr.message);
            }
        }

        closeEnrollBusinessModal();
        showEnrollBizResult(name, bizRes.wallet, onboardingFee);
        await loadAdminBusinesses();

    } catch (e) {
        errEl.textContent   = `Enrollment failed: ${e.message}`;
        errEl.style.display = 'block';
        btn.textContent = 'ENROLL';
        btn.disabled    = false;
    }
}

// -----------------------------------------------------------------------------
// ADMIN — Enroll business result modal
// -----------------------------------------------------------------------------

function showEnrollBizResult(name, address, snap) {
    document.getElementById('enroll-biz-result-name').textContent    = name;
    document.getElementById('enroll-biz-result-address').textContent = address;
    document.getElementById('enroll-biz-result-snap').textContent    = snap > 0 ? `${snap} SNAP` : 'None';
    showFlex('modal-enroll-biz-result');
}

function closeEnrollBizResult() {
    hide('modal-enroll-biz-result');
}

function copyBizAddress() {
    const addr = document.getElementById('enroll-biz-result-address').textContent;
    navigator.clipboard.writeText(addr).catch(() => {});
    const btn = document.getElementById('btn-copy-biz-address');
    btn.textContent = 'COPIED ✓';
    setTimeout(() => { btn.textContent = 'COPY WALLET ADDRESS'; }, 2000);
}

// -----------------------------------------------------------------------------
// Event listeners
// -----------------------------------------------------------------------------

document.getElementById('btn-login')
    .addEventListener('click', login);

document.getElementById('login-token-input')
    .addEventListener('keydown', e => { if (e.key === 'Enter') login(); });

document.getElementById('btn-login-wallet')
    .addEventListener('click', submitWalletAddress);

document.getElementById('login-wallet-input')
    .addEventListener('keydown', e => { if (e.key === 'Enter') submitWalletAddress(); });

document.getElementById('btn-logout')
    .addEventListener('click', logout);

document.getElementById('btn-claim-cancel')
    .addEventListener('click', closeClaimModal);

document.getElementById('btn-claim-confirm')
    .addEventListener('click', confirmClaim);

document.getElementById('btn-post-deal')
    .addEventListener('click', openPostDealModal);

document.getElementById('btn-admin-post-deal')
    .addEventListener('click', openPostDealModal);

document.getElementById('btn-post-deal-cancel')
    .addEventListener('click', closePostDealModal);

document.getElementById('btn-post-deal-confirm')
    .addEventListener('click', submitPostDeal);

document.getElementById('btn-verify-member')
    .addEventListener('click', verifyMember);

document.getElementById('scanner-wallet-input')
    .addEventListener('keydown', e => { if (e.key === 'Enter') verifyMember(); });

document.getElementById('modal-claim')
    .addEventListener('click', e => { if (e.target === e.currentTarget) closeClaimModal(); });

document.getElementById('modal-post-deal')
    .addEventListener('click', e => { if (e.target === e.currentTarget) closePostDealModal(); });

document.getElementById('btn-enroll-member')
    .addEventListener('click', openEnrollMemberModal);

document.getElementById('btn-enroll-business')
    .addEventListener('click', openEnrollBusinessModal);

document.getElementById('btn-enroll-biz-cancel')
    .addEventListener('click', closeEnrollBusinessModal);

document.getElementById('btn-enroll-biz-confirm')
    .addEventListener('click', submitEnrollBusiness);

document.getElementById('modal-enroll-business')
    .addEventListener('click', e => { if (e.target === e.currentTarget) closeEnrollBusinessModal(); });

document.getElementById('btn-copy-biz-address')
    .addEventListener('click', copyBizAddress);

document.getElementById('btn-enroll-biz-result-done')
    .addEventListener('click', closeEnrollBizResult);

document.getElementById('modal-enroll-biz-result')
    .addEventListener('click', e => { if (e.target === e.currentTarget) closeEnrollBizResult(); });

document.getElementById('btn-edit-biz-cancel')
    .addEventListener('click', closeEditBizModal);

document.getElementById('btn-edit-biz-confirm')
    .addEventListener('click', submitEditBusiness);

document.getElementById('modal-edit-business')
    .addEventListener('click', e => { if (e.target === e.currentTarget) closeEditBizModal(); });

document.getElementById('btn-edit-deal-cancel')
    .addEventListener('click', closeEditDealModal);

document.getElementById('btn-edit-deal-confirm')
    .addEventListener('click', submitEditDeal);

document.getElementById('modal-edit-deal')
    .addEventListener('click', e => { if (e.target === e.currentTarget) closeEditDealModal(); });

document.getElementById('btn-edit-member-cancel')
    .addEventListener('click', closeEditMemberModal);

document.getElementById('btn-edit-member-confirm')
    .addEventListener('click', submitEditMember);

document.getElementById('modal-edit-member')
    .addEventListener('click', e => { if (e.target === e.currentTarget) closeEditMemberModal(); });

document.getElementById('btn-enroll-cancel')
    .addEventListener('click', closeEnrollMemberModal);

document.getElementById('btn-enroll-confirm')
    .addEventListener('click', submitEnrollMember);

document.getElementById('modal-enroll-member')
    .addEventListener('click', e => { if (e.target === e.currentTarget) closeEnrollMemberModal(); });

document.getElementById('btn-copy-enroll-address')
    .addEventListener('click', copyEnrollAddress);

document.getElementById('btn-enroll-result-done')
    .addEventListener('click', closeEnrollResult);

document.getElementById('modal-enroll-result')
    .addEventListener('click', e => { if (e.target === e.currentTarget) closeEnrollResult(); });

// -----------------------------------------------------------------------------
// Init — restore session on page load
// -----------------------------------------------------------------------------

(async function init() {
    const token  = sessionStorage.getItem('snap_token');
    const role   = sessionStorage.getItem('snap_role');

    if (!token || !role) return;

    try {
        const res = await fetch('/api/auth/verify', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) return;

        const data = await res.json();
        if (!data.success) return;

        state.token = token;
        state.role  = data.role;

        const storedBizId  = sessionStorage.getItem('snap_business_id');
        const storedWallet = sessionStorage.getItem('snap_wallet');
        if (storedBizId)  state.businessId = storedBizId;
        if (storedWallet) state.wallet     = storedWallet;

        await bootApp();

    } catch {}
})();

// =============================================================================
// File: static/app.js
// Tree: snap-coin-deals/static/app.js
// Created: 2026-04-02 | Updated: 2026-04-04 | Version: 1.6.0
// =============================================================================