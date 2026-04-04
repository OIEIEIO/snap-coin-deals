// =============================================================================
// File: static/app.js
// Tree: snap-coin-deals/static/app.js
// Description: SNAP Deals frontend — auth, member, business, admin views
// Version: 0.2.0
// Comments: Fixed hidden/active class conflict — show/hide use display directly
//           Role-based views — member | business | admin
//           Token stored in sessionStorage only — cleared on tab close
//           API helper attaches bearer token to all protected requests
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
// Show / hide helpers — bypass .hidden !important conflict
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
// Auth
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

        await bootApp();

    } catch (e) {
        show(err);
    }
}

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
    showFlex('screen-login');
    document.getElementById('login-token-input').value = '';
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
    // hide all views
    document.querySelectorAll('.view').forEach(v => {
        v.style.display = 'none';
    });

    // deactivate all tabs
    document.querySelectorAll('.nav-tab').forEach(t => {
        t.classList.remove('active');
    });

    // show target view
    const view = document.getElementById(`view-${viewId}`);
    if (view) view.style.display = 'block';

    // activate nav tab
    const tab = document.querySelector(`.nav-tab[data-view="${viewId}"]`);
    if (tab) tab.classList.add('active');

    // load content
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
        return res.balance ?? null;
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

        document.querySelectorAll('.btn-claim[data-deal-id]').forEach(btn => {
            btn.addEventListener('click', () => openClaimModal(btn.dataset.dealId, deals, businesses));
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

    const footer = claimed
        ? `<div class="claimed-badge">✓ CLAIMED</div>`
        : `<button class="btn-claim" data-deal-id="${deal.id}">CLAIM THIS DEAL</button>`;

    return `
        <div class="deal-card${claimed ? ' claimed' : ''}">
            <div class="deal-card-top">
                <div class="biz-avatar ${category}">${initials}</div>
                <div class="biz-info">
                    <div class="biz-name">${biz.name || 'Local Business'}</div>
                    <div class="biz-category">${category}</div>
                </div>
                <div class="deal-value-pill">${formatCAD(deal.cad_value)}</div>
            </div>
            <div class="deal-card-body">
                <div class="deal-title">${deal.title}</div>
                <div class="deal-description">${deal.description}</div>
                <div class="deal-meta">
                    <span class="deal-meta-item">🏷 ${left}</span>
                    <span class="deal-meta-item">📅 Exp ${formatDate(deal.expires_at)}</span>
                </div>
            </div>
            <div class="deal-card-footer">${footer}</div>
        </div>
    `;
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
            const deal   = dealMap[claim.deal_id]    || {};
            const biz    = bizMap[claim.business_id] || {};
            const status = claim.redeemed ? 'redeemed' : 'pending';
            const label  = claim.redeemed ? 'REDEEMED' : 'PENDING';

            return `
                <div class="claim-row">
                    <div class="biz-avatar ${(biz.category||'other').toLowerCase()}"
                         style="width:36px;height:36px;font-size:12px">
                        ${avatarInitials(biz.name || 'SD')}
                    </div>
                    <div class="claim-row-info">
                        <div class="claim-row-title">${deal.title || claim.deal_id}</div>
                        <div class="claim-row-biz">${biz.name || ''} · ${formatDate(claim.claimed_at)}</div>
                    </div>
                    <div class="claim-row-value">${formatCAD(claim.cad_value_redeemed)}</div>
                    <div class="claim-status ${status}">${label}</div>
                </div>
            `;
        }).join('');

    } catch (e) {
        showEmpty('my-claims-list', '⚠️', 'Could not load claims');
    }
}

// -----------------------------------------------------------------------------
// MEMBER — Profile
// -----------------------------------------------------------------------------

async function loadProfile() {
    const wallet  = state.wallet || '—';
    const balance = await fetchBalance(state.wallet);

    document.getElementById('profile-content').innerHTML = `
        <div class="profile-card">
            <div class="profile-label">Role</div>
            <div class="profile-value">${(state.role || '—').toUpperCase()}</div>
        </div>
        <div class="profile-card">
            <div class="profile-label">Wallet Address</div>
            <div class="profile-value">${wallet}</div>
        </div>
        <div class="profile-card">
            <div class="profile-label">SNAP Balance</div>
            <div class="profile-value" style="color:var(--accent)">
                ${balance !== null ? `${Number(balance).toFixed(8)} SNAP` : '—'}
            </div>
        </div>
        <div class="profile-card">
            <div class="profile-label">Network</div>
            <div class="profile-value">Halifax · Dartmouth · Nova Scotia</div>
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

function openPostDealModal()  { showFlex('modal-post-deal'); }

function closePostDealModal() {
    hide('modal-post-deal');
    ['post-deal-title','post-deal-description','post-deal-value','post-deal-claims-max']
        .forEach(id => { document.getElementById(id).value = ''; });
}

async function submitPostDeal() {
    const title     = document.getElementById('post-deal-title').value.trim();
    const desc      = document.getElementById('post-deal-description').value.trim();
    const cadValue  = parseFloat(document.getElementById('post-deal-value').value);
    const claimsMax = parseInt(document.getElementById('post-deal-claims-max').value) || 0;

    if (!title || !desc || !cadValue) {
        alert('Please fill in all required fields');
        return;
    }

    const btn = document.getElementById('btn-post-deal-confirm');
    btn.textContent = 'POSTING…';
    btn.disabled    = true;

    try {
        await POST('/api/deals/post', {
            id:          `deal_${state.businessId}_${Date.now()}`,
            business_id: state.businessId,
            wallet:      state.wallet || 'snap_placeholder_new_deal',
            title,
            description: desc,
            cad_value:   cadValue,
            claims_max:  claimsMax,
        });

        closePostDealModal();
        await loadBizDeals();

    } catch { alert('Could not post deal. Please try again.'); }
    finally {
        btn.textContent = 'POST';
        btn.disabled    = false;
    }
}

// -----------------------------------------------------------------------------
// ADMIN — Members
// -----------------------------------------------------------------------------

async function loadAdminMembers() {
    showLoading('admin-members-list');

    try {
        const res     = await GET('/api/members');
        const members = res.members || [];

        document.getElementById('admin-members-count').textContent = `${res.total || 0} total`;

        if (members.length === 0) {
            showEmpty('admin-members-list', '👥', 'No members enrolled yet');
            return;
        }

        document.getElementById('admin-members-list').innerHTML = members.map(m => `
            <div class="admin-row">
                <div class="status-dot ${m.active ? 'active' : 'inactive'}"></div>
                <div class="admin-row-info">
                    <div class="admin-row-name">${m.name}</div>
                    <div class="admin-row-meta">
                        ${truncate(m.wallet, 20)} · Enrolled ${formatDate(m.enrolled_at)}
                    </div>
                </div>
                <div style="font-family:var(--font-mono);font-size:11px;color:var(--accent)">
                    ${m.starter_snap} SNAP
                </div>
            </div>
        `).join('');

    } catch { showEmpty('admin-members-list', '⚠️', 'Could not load members'); }
}

// -----------------------------------------------------------------------------
// ADMIN — Businesses
// -----------------------------------------------------------------------------

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

        document.getElementById('admin-biz-list').innerHTML = businesses.map(b => `
            <div class="admin-row">
                <div class="biz-avatar ${(b.category||'other').toLowerCase()}"
                     style="width:36px;height:36px;font-size:12px">
                    ${avatarInitials(b.name)}
                </div>
                <div class="admin-row-info">
                    <div class="admin-row-name">${b.name}</div>
                    <div class="admin-row-meta">
                        ${b.category} · ${truncate(b.wallet, 16)} · ${formatDate(b.enrolled_at)}
                    </div>
                </div>
                <div class="status-dot ${b.active ? 'active' : 'inactive'}"></div>
            </div>
        `).join('');

    } catch { showEmpty('admin-biz-list', '⚠️', 'Could not load businesses'); }
}

// -----------------------------------------------------------------------------
// ADMIN — All Deals
// -----------------------------------------------------------------------------

async function loadAdminDeals() {
    showLoading('admin-deals-list');

    try {
        const [dealsRes, bizRes] = await Promise.all([
            GET('/api/deals'),
            GET('/api/businesses/all'),
        ]);

        const deals  = dealsRes.deals || [];
        const bizMap = Object.fromEntries((bizRes.businesses || []).map(b => [b.id, b]));

        document.getElementById('admin-deals-count').textContent = `${dealsRes.total || 0} active`;

        if (deals.length === 0) {
            showEmpty('admin-deals-list', '🏷️', 'No deals posted yet');
            return;
        }

        document.getElementById('admin-deals-list').innerHTML = deals.map(deal => {
            const biz = bizMap[deal.business_id] || {};
            return `
                <div class="admin-row">
                    <div class="biz-avatar ${(biz.category||'other').toLowerCase()}"
                         style="width:36px;height:36px;font-size:12px">
                        ${avatarInitials(biz.name || 'SD')}
                    </div>
                    <div class="admin-row-info">
                        <div class="admin-row-name">${deal.title}</div>
                        <div class="admin-row-meta">
                            ${biz.name || deal.business_id} ·
                            ${formatCAD(deal.cad_value)} ·
                            ${deal.claims_count} claimed
                        </div>
                    </div>
                    <div class="status-dot ${deal.active ? 'active' : 'inactive'}"></div>
                </div>
            `;
        }).join('');

    } catch { showEmpty('admin-deals-list', '⚠️', 'Could not load deals'); }
}

// -----------------------------------------------------------------------------
// Event listeners
// -----------------------------------------------------------------------------

document.getElementById('btn-login')
    .addEventListener('click', login);

document.getElementById('login-token-input')
    .addEventListener('keydown', e => { if (e.key === 'Enter') login(); });

document.getElementById('btn-logout')
    .addEventListener('click', logout);

document.getElementById('btn-claim-cancel')
    .addEventListener('click', closeClaimModal);

document.getElementById('btn-claim-confirm')
    .addEventListener('click', confirmClaim);

document.getElementById('btn-post-deal')
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

// -----------------------------------------------------------------------------
// Init — restore session on page load
// -----------------------------------------------------------------------------

(async function init() {
    const token = sessionStorage.getItem('snap_token');
    const role  = sessionStorage.getItem('snap_role');

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
// Created: 2026-04-02 | Updated: 2026-04-02 | Version: 0.2.0
// =============================================================================