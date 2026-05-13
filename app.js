/* ============================================================
   Dispatch — PR tracker
   Pure browser. Talks to GitHub REST. No backend.
   ============================================================ */

const STORE = {
  pat:     'dispatch.pat',
  orgs:    'dispatch.orgs',
  range:   'dispatch.range',
  status:  'dispatch.status',
  groupBy: 'dispatch.groupBy',
  issue:   'dispatch.issueNo',
};

const RANGES = [
  { id: '1',   label: '24 h' },
  { id: '3',   label: '3 d' },
  { id: '7',   label: '7 d' },
  { id: '14',  label: '14 d' },
  { id: '30',  label: '30 d' },
  { id: '90',  label: '90 d' },
];

const STATUSES = [
  { id: 'open',   label: 'Open' },
  { id: 'merged', label: 'Merged' },
  { id: 'closed', label: 'Closed' },
  { id: 'all',    label: 'All' },
];

const state = {
  pat: localStorage.getItem(STORE.pat) || '',
  user: null,
  orgs: [],
  selectedOrgs: safeJSON(localStorage.getItem(STORE.orgs), []),
  range: localStorage.getItem(STORE.range) || '7',
  status: localStorage.getItem(STORE.status) || 'open',
  groupBy: localStorage.getItem(STORE.groupBy) || 'org',
  prs: [],
  loading: false,
  error: null,
  rateLimit: null,
  lastFetch: null,
};

/* ---------- helpers ------------------------------------- */
function safeJSON(s, fallback) { try { return JSON.parse(s) ?? fallback; } catch { return fallback; } }
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, attrs = {}, ...children) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k in n && typeof v !== 'string') n[k] = v;
    else n.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    n.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return n;
};

const fmtDate = (d) =>
  d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtAge = (iso) => {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.round(mo / 12)}y`;
};
const bumpIssue = () => {
  const n = Number(localStorage.getItem(STORE.issue) || '0') + 1;
  localStorage.setItem(STORE.issue, String(n));
  return n;
};

/* ---------- GitHub API ---------------------------------- */
async function gh(path, opts = {}) {
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
  const r = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${state.pat}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.headers || {}),
    },
  });
  state.rateLimit = {
    remaining: r.headers.get('x-ratelimit-remaining'),
    limit:     r.headers.get('x-ratelimit-limit'),
    reset:     r.headers.get('x-ratelimit-reset'),
  };
  if (!r.ok) {
    let detail = '';
    try { detail = (await r.json())?.message || ''; } catch {}
    throw new Error(`${r.status} · ${detail || r.statusText}`);
  }
  return r.json();
}

async function fetchUserAndOrgs() {
  const [user, orgs] = await Promise.all([gh('/user'), gh('/user/orgs?per_page=100')]);
  state.user = user;
  state.orgs = orgs;
}

function buildSearchQuery(org) {
  const days = Number(state.range);
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const parts = [`org:${org}`, 'is:pr', `updated:>=${since}`];
  if (state.status === 'open')   parts.push('is:open');
  if (state.status === 'merged') parts.push('is:merged');
  if (state.status === 'closed') parts.push('is:closed', '-is:merged');
  return parts.join(' ');
}

async function fetchPRsForOrg(org) {
  const q = buildSearchQuery(org);
  const data = await gh(
    `/search/issues?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=100`
  );
  return (data.items || []).map((i) => ({
    org,
    id: i.id,
    number: i.number,
    title: i.title,
    url: i.html_url,
    draft: !!i.draft,
    merged: !!i.pull_request?.merged_at,
    closed: i.state === 'closed',
    state: i.state,
    author: i.user,
    labels: i.labels || [],
    comments: i.comments,
    createdAt: i.created_at,
    updatedAt: i.updated_at,
    closedAt: i.closed_at,
    mergedAt: i.pull_request?.merged_at,
    repo: i.repository_url?.split('/').slice(-2).join('/'),
  }));
}

async function fetchAllPRs() {
  state.loading = true; state.error = null; render();
  try {
    const targets = state.selectedOrgs.length ? state.selectedOrgs : state.orgs.map((o) => o.login);
    if (!targets.length) { state.prs = []; return; }
    const results = await Promise.all(targets.map((o) => fetchPRsForOrg(o).catch((e) => {
      console.error(`org ${o} failed:`, e); return [];
    })));
    state.prs = results.flat().sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
    state.lastFetch = new Date();
  } catch (e) {
    state.error = e.message || String(e);
  } finally {
    state.loading = false;
    render();
  }
}

/* ---------- persistence --------------------------------- */
function persist() {
  if (state.pat) localStorage.setItem(STORE.pat, state.pat); else localStorage.removeItem(STORE.pat);
  localStorage.setItem(STORE.orgs,   JSON.stringify(state.selectedOrgs));
  localStorage.setItem(STORE.range,  state.range);
  localStorage.setItem(STORE.status, state.status);
  localStorage.setItem(STORE.groupBy, state.groupBy);
}

function signOut() {
  state.pat = ''; state.user = null; state.orgs = []; state.prs = [];
  state.selectedOrgs = []; state.error = null;
  localStorage.removeItem(STORE.pat);
  localStorage.removeItem(STORE.orgs);
  render();
}

/* ---------- rendering: masthead ------------------------- */
function renderMasthead() {
  $('#mastDate').textContent = fmtDate(new Date());
  const issue = Number(localStorage.getItem(STORE.issue) || '1');
  $('#mastIssue').textContent = `№ ${String(issue).padStart(3, '0')}`;
  $('#mastUser').textContent = state.user
    ? `filed by @${state.user.login}`
    : 'unregistered correspondent';

  const rate = state.rateLimit;
  $('#colophonRate').textContent = rate
    ? `Rate · ${rate.remaining}/${rate.limit} remaining`
    : 'Rate · —';
}

/* ---------- rendering: console (gate or toolbar) ------- */
function renderConsole() {
  const console_ = $('#console');
  console_.innerHTML = '';

  if (!state.pat) {
    console_.append(renderGate());
    return;
  }
  console_.append(renderToolbar());
}

function renderGate() {
  let value = '';
  const input = el('input', {
    type: 'password',
    placeholder: 'ghp_•••••••••••••••••••••••••••••••••••••',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': 'GitHub personal access token',
    oninput: (e) => { value = e.target.value.trim(); },
    onkeydown: (e) => { if (e.key === 'Enter') submit(); },
  });

  const submit = async () => {
    if (!value) return;
    state.pat = value;
    persist();
    try {
      await fetchUserAndOrgs();
      // pre-select all orgs first time
      if (!state.selectedOrgs.length) state.selectedOrgs = state.orgs.map((o) => o.login);
      persist();
      await fetchAllPRs();
    } catch (e) {
      state.error = `Token rejected — ${e.message}`;
      state.pat = '';
      localStorage.removeItem(STORE.pat);
      render();
    }
  };

  return el('div', { class: 'gate' },
    el('div', {},
      el('div', { class: 'gate-head' }, 'Credentials'),
      el('h2', {}, 'Provide a token, the rest is automatic.'),
      el('p', {},
        'Dispatch is a single HTML page. Paste a GitHub fine-grained or classic personal access token and it queries the GitHub REST API directly from this tab.'
      ),
      el('ol', {},
        el('li', {},
          'Open ',
          el('a', { class: 'link', href: 'https://github.com/settings/tokens', target: '_blank', rel: 'noopener' },
            'github.com/settings/tokens'),
          '.'
        ),
        el('li', {}, 'Generate a token. Scopes: ', el('code', {}, 'repo'), ' and ', el('code', {}, 'read:org'), '.'),
        el('li', {}, 'Paste it on the right. It stays in ', el('code', {}, 'localStorage'), ' — never sent anywhere else.'),
      ),
    ),
    el('div', { class: 'gate-form' },
      el('div', { class: 'field' },
        el('label', { for: 'pat-input' }, 'Personal Access Token'),
        Object.assign(input, { id: 'pat-input' }),
      ),
      el('div', { class: 'gate-actions' },
        el('button', { class: 'btn btn--accent', onclick: submit }, 'File the credential ↗'),
        el('span', { style: 'font-family:var(--mono);font-size:11px;color:var(--ink-mute);letter-spacing:.12em;text-transform:uppercase;' },
          '⏎ to submit'
        ),
      ),
      state.error
        ? el('div', { style: 'font-family:var(--mono);font-size:11px;color:var(--accent-deep);margin-top:6px;' }, state.error)
        : null
    )
  );
}

function renderToolbar() {
  const root = el('div', { class: 'toolbar' });

  /* left: filters */
  const left = el('div', { style: 'display:grid;gap:14px;min-width:0;' });

  // orgs row
  const orgsRow = el('div', { class: 'toolbar-row' },
    el('span', { class: 'toolbar-label' }, 'Orgs'),
  );
  state.orgs.forEach((o) => {
    const selected = state.selectedOrgs.includes(o.login);
    orgsRow.append(
      el('button', {
        class: 'chip chip-org chip--accent',
        'aria-pressed': String(selected),
        onclick: () => {
          if (selected) state.selectedOrgs = state.selectedOrgs.filter((x) => x !== o.login);
          else state.selectedOrgs = [...state.selectedOrgs, o.login];
          persist(); fetchAllPRs();
        },
      },
        o.avatar_url ? el('img', { src: o.avatar_url, alt: '' }) : null,
        o.login,
      )
    );
  });
  left.append(orgsRow);

  // range row
  const rangeRow = el('div', { class: 'toolbar-row' },
    el('span', { class: 'toolbar-label' }, 'Window'),
    ...RANGES.map((r) =>
      el('button', {
        class: 'chip',
        'aria-pressed': String(state.range === r.id),
        onclick: () => { state.range = r.id; persist(); fetchAllPRs(); },
      }, r.label)
    )
  );
  left.append(rangeRow);

  // status row
  const statusRow = el('div', { class: 'toolbar-row' },
    el('span', { class: 'toolbar-label' }, 'State'),
    ...STATUSES.map((s) =>
      el('button', {
        class: 'chip',
        'aria-pressed': String(state.status === s.id),
        onclick: () => { state.status = s.id; persist(); fetchAllPRs(); },
      }, s.label)
    ),
    el('span', { class: 'toolbar-label', style: 'margin-left:14px;' }, 'Group'),
    el('button', {
      class: 'chip',
      'aria-pressed': String(state.groupBy === 'org'),
      onclick: () => { state.groupBy = 'org'; persist(); render(); }
    }, 'By org'),
    el('button', {
      class: 'chip',
      'aria-pressed': String(state.groupBy === 'repo'),
      onclick: () => { state.groupBy = 'repo'; persist(); render(); }
    }, 'By repo'),
    el('button', {
      class: 'chip',
      'aria-pressed': String(state.groupBy === 'none'),
      onclick: () => { state.groupBy = 'none'; persist(); render(); }
    }, 'Flat')
  );
  left.append(statusRow);

  root.append(left);

  /* right: user + refresh + sign out */
  const right = el('div', { class: 'toolbar-actions' });
  if (state.user) {
    right.append(
      el('span', { class: 'toolbar-user' },
        state.user.avatar_url ? el('img', { src: state.user.avatar_url, alt: '' }) : null,
        `@${state.user.login}`,
      )
    );
  }
  right.append(
    el('button', {
      class: 'btn btn--ghost',
      onclick: () => fetchAllPRs(),
      disabled: state.loading,
    }, state.loading ? 'Refreshing…' : 'Refresh ↻'),
    el('button', {
      class: 'btn btn--ghost',
      onclick: signOut,
      title: 'Clear token from this browser',
    }, 'Sign out'),
  );
  root.append(right);

  return root;
}

/* ---------- rendering: report --------------------------- */
function renderReport() {
  const root = $('#report');
  root.innerHTML = '';

  if (!state.pat) return;

  if (state.error) {
    root.append(
      el('div', { class: 'notice notice--error' },
        el('h3', {}, 'Could not fetch dispatches'),
        el('p', {}, state.error),
      )
    );
    return;
  }

  if (state.loading && !state.prs.length) {
    root.append(
      el('div', { class: 'loading' },
        'Compiling the wire',
        el('span', { class: 'loading-bar', 'aria-hidden': 'true' }),
        state.selectedOrgs.length ? `${state.selectedOrgs.length} org(s)` : 'all orgs',
      )
    );
    return;
  }

  // head
  const range = RANGES.find((r) => r.id === state.range)?.label ?? state.range;
  const statusLabel = STATUSES.find((s) => s.id === state.status)?.label ?? state.status;
  root.append(
    el('div', { class: 'report-head' },
      el('h2', {},
        statusLabel === 'All' ? 'The ' : statusLabel + ' ',
        el('em', {}, 'pull requests'),
        ' of the past ', range, '.'
      ),
      el('div', { class: 'report-meta' },
        el('strong', {}, String(state.prs.length)), ' filed',
        ' · ',
        el('strong', {}, state.selectedOrgs.length || state.orgs.length), ' org(s)',
        state.lastFetch ? el('div', {}, 'as of ', el('strong', {}, state.lastFetch.toLocaleTimeString())) : ''
      )
    ),
    el('div', { class: 'report-rule' })
  );

  if (!state.prs.length) {
    root.append(
      el('div', { class: 'notice' },
        el('h3', {}, 'The wire is quiet.'),
        el('p', {},
          'No pull requests match this window. Widen the time range, switch to ',
          el('em', {}, 'All'),
          ', or add another organisation to the selection above.')
      )
    );
    return;
  }

  if (state.groupBy === 'none') {
    root.append(renderPrList(state.prs));
    return;
  }

  // group by org / repo
  const groups = new Map();
  for (const pr of state.prs) {
    const key = state.groupBy === 'org' ? pr.org : pr.repo;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(pr);
  }
  const sortedKeys = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length);
  for (const key of sortedKeys) {
    const items = groups.get(key);
    const section = el('section', { class: 'org-section' },
      el('div', { class: 'org-section-head' },
        el('span', { class: 'org-section-name' }, key),
        el('span', { class: 'org-section-line' }),
        el('span', { class: 'org-section-count' }, `${items.length} open thread${items.length === 1 ? '' : 's'}`)
      ),
      renderPrList(items)
    );
    root.append(section);
  }
}

function renderPrList(prs) {
  const ul = el('ul', { class: 'pr-list' });
  prs.forEach((pr, i) => ul.append(renderPr(pr, i)));
  return ul;
}

function renderPr(pr, i) {
  const pillClass =
    pr.merged ? 'pill pill--merged' :
    pr.closed ? 'pill pill--closed' :
    pr.draft  ? 'pill pill--draft'  :
                'pill pill--open';
  const pillText =
    pr.merged ? 'Merged' :
    pr.closed ? 'Closed' :
    pr.draft  ? 'Draft'  :
                'Open';

  const labels = (pr.labels || []).slice(0, 4).map((l) =>
    el('span', {
      class: 'pr-label',
      style: l.color ? `border-color: #${l.color}66; color: #${darken(l.color)};` : '',
    }, l.name)
  );

  return el('li', { class: 'pr', style: `--i:${i};` },
    el('span', { class: 'pr-num' }, String(i + 1).padStart(2, '0')),
    el('span', { class: pillClass }, pillText),
    el('div', { class: 'pr-main' },
      el('a', { href: pr.url, target: '_blank', rel: 'noopener', class: 'pr-title' },
        pr.title,
        el('span', { class: 'pr-num-inline' }, `#${pr.number}`)
      ),
      el('div', { class: 'pr-sub' },
        el('span', { class: 'repo' }, pr.repo || pr.org),
        el('span', { class: 'sep' },
          pr.author?.avatar_url ? el('img', { src: pr.author.avatar_url, alt: '' }) : null,
          `@${pr.author?.login ?? 'unknown'}`
        ),
        pr.comments ? el('span', { class: 'sep' }, `${pr.comments} comment${pr.comments === 1 ? '' : 's'}`) : null,
        labels.length ? el('span', { class: 'labels sep' }, ...labels) : null,
      )
    ),
    el('div', { class: 'pr-meta' },
      el('div', { class: 'age', title: new Date(pr.updatedAt).toLocaleString() }, fmtAge(pr.updatedAt)),
      el('div', {}, 'updated'),
    ),
  );
}

function darken(hex) {
  // gh label colors are short hex; mute them for editorial look
  if (!hex || hex.length < 6) return '555';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const f = 0.45;
  return [r, g, b].map((c) => Math.round(c * f).toString(16).padStart(2, '0')).join('');
}

/* ---------- master render ------------------------------- */
function render() {
  renderMasthead();
  renderConsole();
  renderReport();
}

/* ---------- boot ---------------------------------------- */
(async function boot() {
  bumpIssue();
  render();
  if (state.pat) {
    try {
      await fetchUserAndOrgs();
      if (!state.selectedOrgs.length) state.selectedOrgs = state.orgs.map((o) => o.login);
      persist();
      render();
      await fetchAllPRs();
    } catch (e) {
      state.error = `Stored token failed — ${e.message}. Sign in again.`;
      state.pat = '';
      localStorage.removeItem(STORE.pat);
      render();
    }
  }
})();
