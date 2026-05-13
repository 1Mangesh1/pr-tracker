/* ============================================================
   Dispatch — PR tracker (browser-only, GitHub REST)
   ============================================================ */

const STORE = {
  pat:      'dispatch.pat',
  orgs:     'dispatch.orgs',
  from:     'dispatch.from',
  to:       'dispatch.to',
  status:   'dispatch.status',
  scope:    'dispatch.scope',
};

const PRESETS = [
  { id: '1',    label: '24h' },
  { id: '7',    label: '7d' },
  { id: '30',   label: '30d' },
  { id: '90',   label: '90d' },
  { id: '365',  label: '1y' },
  { id: 'all',  label: 'All time' },
];

const STATUSES = [
  { id: 'open',   label: 'Open' },
  { id: 'merged', label: 'Merged' },
  { id: 'closed', label: 'Closed' },
  { id: 'all',    label: 'All' },
];

const SCOPES = [
  { id: 'org',  label: 'All in orgs' },
  { id: 'mine', label: 'Only mine' },
];

const EPOCH = '2008-01-01'; // GitHub's birth year

/* ---------- state ---------------------------------------- */
function todayISO() { return new Date().toISOString().slice(0, 10); }
function daysAgoISO(n) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }

const state = {
  pat:          localStorage.getItem(STORE.pat) || '',
  user:         null,
  orgs:         [],
  selectedOrgs: safeJSON(localStorage.getItem(STORE.orgs), []),
  from:         localStorage.getItem(STORE.from) || daysAgoISO(30),
  to:           localStorage.getItem(STORE.to) || todayISO(),
  status:       localStorage.getItem(STORE.status) || 'open',
  scope:        localStorage.getItem(STORE.scope) || 'org',
  prs:          [],
  loading:      false,
  error:        null,
  rateLimit:    null,
  lastFetch:    null,
};

function safeJSON(s, fb) { try { return JSON.parse(s) ?? fb; } catch { return fb; } }

const $ = (s, r = document) => r.querySelector(s);
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

const fmtAge = (iso) => {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60); if (m < 60) return `${m}m`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h`;
  const d = Math.round(h / 24); if (d < 30) return `${d}d`;
  const mo = Math.round(d / 30); if (mo < 12) return `${mo}mo`;
  return `${Math.round(mo / 12)}y`;
};

/* ---------- GitHub API ---------------------------------- */
async function gh(path) {
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${state.pat}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  state.rateLimit = {
    remaining: r.headers.get('x-ratelimit-remaining'),
    limit:     r.headers.get('x-ratelimit-limit'),
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

function buildQuery(org) {
  const from = state.from || EPOCH;
  const to = state.to || todayISO();
  const parts = [`org:${org}`, 'is:pr', `updated:${from}..${to}`];
  if (state.status === 'open')   parts.push('is:open');
  if (state.status === 'merged') parts.push('is:merged');
  if (state.status === 'closed') parts.push('is:closed', '-is:merged');
  if (state.scope === 'mine' && state.user) parts.push(`author:${state.user.login}`);
  return parts.join(' ');
}

async function fetchPRsForOrg(org) {
  const q = buildQuery(org);
  const data = await gh(`/search/issues?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=100`);
  return (data.items || []).map((i) => ({
    org,
    id: i.id,
    number: i.number,
    title: i.title,
    url: i.html_url,
    draft: !!i.draft,
    merged: !!i.pull_request?.merged_at,
    closed: i.state === 'closed',
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
    const results = await Promise.all(targets.map((o) =>
      fetchPRsForOrg(o).catch((e) => { console.error(`org ${o}:`, e); return []; })
    ));
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
  localStorage.setItem(STORE.from,   state.from);
  localStorage.setItem(STORE.to,     state.to);
  localStorage.setItem(STORE.status, state.status);
  localStorage.setItem(STORE.scope,  state.scope);
}

function signOut() {
  state.pat = ''; state.user = null; state.orgs = []; state.prs = [];
  state.selectedOrgs = []; state.error = null;
  localStorage.removeItem(STORE.pat);
  localStorage.removeItem(STORE.orgs);
  render();
}

/* ---------- preset chips -------------------------------- */
function presetActiveId() {
  if (state.to !== todayISO()) return null;
  if (state.from === EPOCH) return 'all';
  for (const p of PRESETS) {
    if (p.id === 'all') continue;
    if (state.from === daysAgoISO(Number(p.id))) return p.id;
  }
  return null;
}
function applyPreset(id) {
  state.to = todayISO();
  state.from = id === 'all' ? EPOCH : daysAgoISO(Number(id));
  persist(); fetchAllPRs();
}

/* ---------- export ------------------------------------- */
function exportMarkdown() {
  const fmt = (d) => d ? new Date(d).toISOString().slice(0, 10) : '';
  const lines = [];
  const scope = state.scope === 'mine' ? `@${state.user?.login}` : 'all';
  lines.push(`# Dispatch — pull requests (${scope})`);
  lines.push('');
  lines.push(`_Window:_ \`${state.from} → ${state.to}\`  ·  _State:_ \`${state.status}\`  ·  _Generated:_ \`${new Date().toISOString()}\``);
  lines.push('');
  lines.push(`Total: **${state.prs.length}** pull request${state.prs.length === 1 ? '' : 's'}.`);
  lines.push('');

  const groups = new Map();
  for (const pr of state.prs) {
    if (!groups.has(pr.org)) groups.set(pr.org, []);
    groups.get(pr.org).push(pr);
  }
  const sorted = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length);

  for (const org of sorted) {
    const items = groups.get(org);
    lines.push(`## ${org} _(${items.length})_`);
    lines.push('');
    for (const pr of items) {
      const st = pr.merged ? 'merged' : pr.closed ? 'closed' : pr.draft ? 'draft' : 'open';
      const head = `- [\`${st}\`] [${pr.repo}#${pr.number}](${pr.url}) — **${pr.title.replace(/\|/g, '\\|')}**`;
      const body = `  · @${pr.author?.login ?? '?'} · updated ${fmt(pr.updatedAt)}` +
                   (pr.mergedAt ? ` · merged ${fmt(pr.mergedAt)}` : '') +
                   (pr.closedAt && !pr.mergedAt ? ` · closed ${fmt(pr.closedAt)}` : '');
      lines.push(head);
      lines.push(body);
    }
    lines.push('');
  }

  const md = lines.join('\n');
  const filename = `dispatch-${state.scope === 'mine' ? (state.user?.login || 'me') : 'orgs'}-${state.from}_${state.to}.md`;
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- render: header bar -------------------------- */
function renderBar() {
  const r = $('#barRight');
  r.innerHTML = '';
  if (!state.user) {
    r.append(el('span', {}, 'unsigned'));
    return;
  }
  r.append(
    el('span', { class: 'bar-user' },
      state.user.avatar_url ? el('img', { class: 'avatar', src: state.user.avatar_url, alt: '' }) : null,
      `@${state.user.login}`
    ),
    el('button', {
      class: 'btn btn--ghost btn--sm',
      onclick: () => fetchAllPRs(),
      disabled: state.loading,
    }, state.loading ? 'Refreshing…' : 'Refresh'),
    el('button', {
      class: 'btn btn--ghost btn--sm',
      onclick: exportMarkdown,
      disabled: !state.prs.length,
      title: 'Download visible PRs as Markdown',
    }, 'Export .md'),
    el('button', { class: 'btn btn--ghost btn--sm', onclick: signOut }, 'Sign out'),
  );

  const rl = state.rateLimit;
  $('#footRate').textContent = rl ? `Rate · ${rl.remaining}/${rl.limit}` : '—';
}

/* ---------- render: console ----------------------------- */
function renderConsole() {
  const c = $('#console');
  c.innerHTML = '';
  if (!state.pat) { c.append(renderGate()); return; }
  c.append(renderToolbar());
}

function renderGate() {
  let value = '';
  const input = el('input', {
    type: 'password',
    placeholder: 'ghp_•••••••••••••••••••••••',
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
      if (!state.selectedOrgs.length) state.selectedOrgs = state.orgs.map((o) => o.login);
      persist();
      await fetchAllPRs();
    } catch (e) {
      state.error = `Token rejected — ${e.message}`;
      state.pat = ''; localStorage.removeItem(STORE.pat);
      render();
    }
  };
  return el('div', { class: 'gate' },
    el('h2', {}, 'Paste a GitHub token.'),
    el('p', { class: 'gate-help' },
      'Stays in this tab — never sent anywhere except ',
      el('code', {}, 'api.github.com'), '. Create one at ',
      el('a', { href: 'https://github.com/settings/tokens', target: '_blank', rel: 'noopener' }, 'github.com/settings/tokens'),
      ' with scopes ', el('code', {}, 'repo'), ' and ', el('code', {}, 'read:org'), '.'
    ),
    el('div', { class: 'field' },
      el('label', { for: 'pat-input' }, 'Personal access token'),
      Object.assign(input, { id: 'pat-input' }),
    ),
    el('button', { class: 'btn btn--accent', onclick: submit }, 'Continue'),
    state.error ? el('div', { class: 'gate-err' }, state.error) : null
  );
}

function renderToolbar() {
  const t = el('div', { class: 'toolbar' });

  /* row 1: orgs */
  const orgsRow = el('div', { class: 'toolbar-row' },
    el('span', { class: 'toolbar-label' }, 'Orgs'),
  );
  state.orgs.forEach((o) => {
    const sel = state.selectedOrgs.includes(o.login);
    orgsRow.append(
      el('button', {
        class: 'chip chip-org',
        'aria-pressed': String(sel),
        onclick: () => {
          state.selectedOrgs = sel
            ? state.selectedOrgs.filter((x) => x !== o.login)
            : [...state.selectedOrgs, o.login];
          persist(); fetchAllPRs();
        },
      },
        o.avatar_url ? el('img', { src: o.avatar_url, alt: '' }) : null,
        o.login,
      )
    );
  });
  if (!state.orgs.length) {
    orgsRow.append(el('span', { style: 'font-family:var(--mono);font-size:11px;color:var(--ink-mute);' },
      'No organisations on this account.'));
  }
  t.append(orgsRow);

  /* row 2: date range */
  const activePreset = presetActiveId();
  const dateRow = el('div', { class: 'toolbar-row' },
    el('span', { class: 'toolbar-label' }, 'Window'),
    el('span', { class: 'date-pick' },
      el('input', {
        type: 'date', value: state.from, max: state.to || todayISO(),
        'aria-label': 'From',
        onchange: (e) => { state.from = e.target.value; persist(); fetchAllPRs(); },
      }),
      el('span', { class: 'date-sep' }, '→'),
      el('input', {
        type: 'date', value: state.to, min: state.from, max: todayISO(),
        'aria-label': 'To',
        onchange: (e) => { state.to = e.target.value; persist(); fetchAllPRs(); },
      }),
    ),
    ...PRESETS.map((p) =>
      el('button', {
        class: 'chip',
        'aria-pressed': String(activePreset === p.id),
        onclick: () => applyPreset(p.id),
      }, p.label)
    )
  );
  t.append(dateRow);

  /* row 3: state + scope */
  const stateRow = el('div', { class: 'toolbar-row' },
    el('span', { class: 'toolbar-label' }, 'State'),
    ...STATUSES.map((s) =>
      el('button', {
        class: 'chip',
        'aria-pressed': String(state.status === s.id),
        onclick: () => { state.status = s.id; persist(); fetchAllPRs(); },
      }, s.label)
    ),
    el('span', { class: 'toolbar-label', style: 'margin-left:14px;' }, 'Scope'),
    ...SCOPES.map((s) =>
      el('button', {
        class: 'chip',
        'aria-pressed': String(state.scope === s.id),
        onclick: () => { state.scope = s.id; persist(); fetchAllPRs(); },
      }, s.label)
    ),
  );
  t.append(stateRow);

  return t;
}

/* ---------- render: report ------------------------------ */
function renderReport() {
  const root = $('#report');
  root.innerHTML = '';
  if (!state.pat) return;

  if (state.error) {
    root.append(el('div', { class: 'notice notice--error' },
      el('h3', {}, 'Could not fetch'),
      el('p', {}, state.error),
    ));
    return;
  }

  if (state.loading && !state.prs.length) {
    root.append(el('div', { class: 'loading' },
      'Compiling the wire',
      el('span', { class: 'loading-bar', 'aria-hidden': 'true' }),
    ));
    return;
  }

  const scopeLabel = state.scope === 'mine' ? 'your' : 'all';
  const stLabel = STATUSES.find((s) => s.id === state.status)?.label.toLowerCase() ?? state.status;

  root.append(el('div', { class: 'report-head' },
    el('h2', {},
      stLabel === 'all' ? '' : `${stLabel[0].toUpperCase() + stLabel.slice(1)} `,
      el('em', {}, scopeLabel === 'your' ? 'your pull requests' : 'pull requests'),
      ` · ${state.from} → ${state.to}.`
    ),
    el('div', { class: 'report-meta' },
      el('strong', {}, String(state.prs.length)), ' filed',
      ' · ',
      el('strong', {}, String(state.selectedOrgs.length || state.orgs.length)), ' org',
      (state.selectedOrgs.length || state.orgs.length) === 1 ? '' : 's',
      state.lastFetch ? ` · ${state.lastFetch.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '',
    )
  ));

  if (!state.prs.length) {
    root.append(el('div', { class: 'notice' },
      el('h3', {}, 'The wire is quiet.'),
      el('p', {}, 'Widen the date range, switch state to ', el('em', {}, 'All'), ', or select another org.')
    ));
    return;
  }

  // group by org
  const groups = new Map();
  for (const pr of state.prs) {
    if (!groups.has(pr.org)) groups.set(pr.org, []);
    groups.get(pr.org).push(pr);
  }
  const sortedKeys = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length);
  for (const key of sortedKeys) {
    const items = groups.get(key);
    root.append(el('section', { class: 'org-section' },
      el('div', { class: 'org-section-head' },
        el('span', { class: 'org-section-name' }, key),
        el('span', { class: 'org-section-line' }),
        el('span', { class: 'org-section-count' }, `${items.length}`)
      ),
      renderPrList(items)
    ));
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
    pr.draft  ? 'pill pill--draft'  : 'pill pill--open';
  const pillText =
    pr.merged ? 'Merged' : pr.closed ? 'Closed' : pr.draft ? 'Draft' : 'Open';

  const labels = (pr.labels || []).slice(0, 3).map((l) =>
    el('span', {
      class: 'pr-label',
      style: l.color ? `border-color: #${l.color}55; color: #${darken(l.color)};` : '',
    }, l.name)
  );

  return el('li', { class: 'pr', style: `--i:${i};` },
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
        labels.length ? el('span', { class: 'sep' }, ...labels) : null,
      )
    ),
    el('div', { class: 'pr-meta' },
      el('div', { class: 'age', title: new Date(pr.updatedAt).toLocaleString() }, fmtAge(pr.updatedAt)),
    )
  );
}

function darken(hex) {
  if (!hex || hex.length < 6) return '555';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const f = 0.45;
  return [r, g, b].map((c) => Math.round(c * f).toString(16).padStart(2, '0')).join('');
}

/* ---------- master render ------------------------------- */
function render() {
  renderBar();
  renderConsole();
  renderReport();
}

/* ---------- boot ---------------------------------------- */
(async function boot() {
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
      state.pat = ''; localStorage.removeItem(STORE.pat);
      render();
    }
  }
})();
