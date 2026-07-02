// ============================================================================
// Data model. In a real app this would come from an API (see README "Backend").
// Here it lives in the browser; folder moves persist via localStorage so a
// message you "Send to Completed Work" stays there across page reloads.
// ============================================================================
const STORE_KEY = 'ehrInboxOverrides';   // persisted folder moves (id -> folder)
const INBOUND_KEY = 'ehrInboxInbound';   // messages received via the API hook

const MESSAGES = [
  {
    id: 1,
    from: 'Harris, Daniel',
    subject: 'Rx Request — Medication refill denied: metformin 500 mg',
    preview: 'Rx Request — Medication refill denied: metformin 50…',
    source: 'Patient Portal',
    time: '06/27 1:43 PM',
    folder: 'My Requests',
    flagged: false,
    body: 'Patient requested a refill of metformin 500 mg via the Patient Portal. The pharmacy refill was denied because the prescription has expired and the patient is due for A1c follow-up labs before renewal. Please review and advise on next steps.',
  },
  {
    id: 2,
    from: 'Rodriguez, Maria',
    subject: 'Prior Auth Renewal — adalimumab (Humira) Pen 40 mg',
    preview: 'Prior Auth Renewal — adalimumab (Humira) Pen 40m…',
    source: 'Rodriguez, Maria (Patient Portal)',
    time: '06/26 9:17 AM',
    folder: 'My Requests',
    flagged: true,
    body: 'Prior authorization for adalimumab (Humira) Pen 40 mg is up for renewal. The patient reports continued benefit for rheumatoid arthritis with no adverse effects. The payer requires updated clinical notes and recent labs to process the renewal.',
  },
];

// ---- persistence helpers ----
function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
  catch { return {}; }
}
function saveOverride(id, folder) {
  const o = loadOverrides();
  o[id] = folder;
  localStorage.setItem(STORE_KEY, JSON.stringify(o));
}
function loadInbound() {
  try { return JSON.parse(localStorage.getItem(INBOUND_KEY)) || []; }
  catch { return []; }
}
function saveInbound(arr) {
  localStorage.setItem(INBOUND_KEY, JSON.stringify(arr));
}

// Re-hydrate messages that arrived via the API hook on previous visits,
// then apply persisted folder moves on top.
MESSAGES.push(...loadInbound());
(function applyOverrides() {
  const o = loadOverrides();
  MESSAGES.forEach((m) => {
    if (m.homeFolder === undefined) m.homeFolder = m.folder; // natural folder before any move
    if (o[m.id] !== undefined) m.folder = o[m.id];
  });
})();

// ---- state ----
let activeFolder = 'My Requests';
let activeId = null;

const els = {
  items: document.getElementById('msgItems'),
  count: document.querySelector('.msglist__count'),
  empty: document.getElementById('readerEmpty'),
  content: document.getElementById('readerContent'),
  // behaviors column (message header + actions)
  actionsDetail: document.getElementById('actionsDetail'),
  actionsEmpty: document.getElementById('actionsEmpty'),
  actions: document.getElementById('rActions'),
  title: document.getElementById('rTitle'),
  from: document.getElementById('rFrom'),
  time: document.getElementById('rTime'),
  // body column
  subject: document.getElementById('rSubject'),
  fromBody: document.getElementById('rFromBody'),
  timeBody: document.getElementById('rTimeBody'),
  body: document.getElementById('rBody'),
};

// ---- render the message list for the active folder ----
function renderList() {
  const list = MESSAGES.filter((m) => m.folder === activeFolder);
  els.count.textContent = `${list.length} Message${list.length === 1 ? '' : 's'}`;
  els.items.innerHTML = '';

  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'msglist__empty';
    li.textContent = 'No messages in this folder.';
    els.items.appendChild(li);
    return;
  }

  list.forEach((m) => {
    const li = document.createElement('li');
    li.className = 'msg' + (m.id === activeId ? ' msg--active' : '');
    li.innerHTML = `
      <div class="msg__row1">
        <span class="msg__from">${m.from}</span>
        <span class="msg__time">${m.flagged ? '<span class="msg__flag" title="Flagged">⚑</span> ' : ''}${m.time}</span>
      </div>
      <div class="msg__source">${m.source}</div>
      <div class="msg__subject">${m.preview}</div>`;
    li.addEventListener('click', () => openMessage(m.id));
    els.items.appendChild(li);
  });
}

// ---- reset the detail + actions panes to their empty state ----
function showEmptyReader() {
  activeId = null;
  els.content.hidden = true;
  els.empty.hidden = false;
  els.actionsDetail.hidden = true;
  els.actionsEmpty.hidden = false;
  els.actions.innerHTML = '';
}

// ---- open a message into the behaviors rail + body ----
function openMessage(id) {
  const m = MESSAGES.find((x) => x.id === id);
  if (!m) return;
  activeId = id;

  // behaviors column header
  els.title.textContent = m.from;             // centered name
  els.from.textContent = m.source || m.from;  // FROM = origin/source line
  els.time.textContent = m.time;
  // body column
  els.subject.textContent = m.subject;
  els.fromBody.textContent = m.source || m.from;
  els.timeBody.textContent = m.time;
  els.body.textContent = m.body;

  renderActions(m);
  els.actionsDetail.hidden = false;
  els.actionsEmpty.hidden = true;
  els.empty.hidden = true;
  els.content.hidden = false;
  selectReaderTab('Message'); // always land on the message when opening
  renderList(); // refresh active-row highlight
}

// ---- reader sub-tabs: Message / Meds / Vitals / Labs / SMART App ----
function selectReaderTab(name) {
  document.querySelectorAll('.reader__tab').forEach((t) =>
    t.classList.toggle('reader__tab--active', t.dataset.tab === name));
  document.querySelectorAll('.reader__panel').forEach((p) => {
    p.hidden = p.dataset.panel !== name;
  });
}
document.querySelectorAll('.reader__tab').forEach((t) => {
  t.addEventListener('click', () => selectReaderTab(t.dataset.tab));
});

// ---- action menu: resolved messages get Reactivate; active ones get Done/Complete/Reject ----
const TERMINAL_FOLDERS = ['Completed Work', 'Sent Messages'];

function reactivateTarget(m) {
  const home = m.homeFolder;
  return home && !TERMINAL_FOLDERS.includes(home) ? home : 'My Requests';
}

function renderActions(m) {
  els.actions.innerHTML = '';
  const common = [
    { icon: '↩', label: 'Reply' },   // inert for now
    { icon: '↪', label: 'Forward' }, // inert for now
    { icon: '⚑', label: 'Flag', fn: () => toggleFlag(m.id) },
  ];
  const groups = TERMINAL_FOLDERS.includes(m.folder)
    ? [[
        ...common,
        { icon: '↻', label: 'Reactivate', strong: true,
          fn: () => moveMessage(m.id, reactivateTarget(m), 'Reactivated') },
      ]]
    : [
        [...common, { icon: '✓', label: 'Done', fn: () => moveMessage(m.id, 'Completed Work', 'Marked done') }],
        [
          { icon: '✓', label: 'Complete', fn: () => moveMessage(m.id, 'Completed Work', 'Completed') },
          { icon: '✕', label: 'Reject', fn: () => moveMessage(m.id, 'Completed Work', 'Rejected') },
        ],
      ];
  groups.forEach((group) => {
    const wrap = document.createElement('div');
    wrap.className = 'actions-pane__group';
    group.forEach((a) => {
      const btn = document.createElement('button');
      btn.className = 'actions-pane__action' + (a.strong ? ' actions-pane__action--strong' : '');
      btn.innerHTML = `<span class="actions-pane__action-icon">${a.icon}</span><span>${a.label}</span>`;
      if (a.fn) btn.addEventListener('click', a.fn);
      wrap.appendChild(btn);
    });
    els.actions.appendChild(wrap);
  });
}

// ---- toggle a message's flag (updates the list flag icon, keeps reader open) ----
function toggleFlag(id) {
  const m = MESSAGES.find((x) => x.id === id);
  if (!m) return;
  m.flagged = !m.flagged;
  renderList();
  toast(m.flagged ? 'Flagged' : 'Unflagged');
}

// ---- move a message between folders + persist ----
function moveMessage(id, folder, label) {
  const m = MESSAGES.find((x) => x.id === id);
  if (!m) return;
  m.folder = folder;
  saveOverride(id, folder);

  showEmptyReader();
  renderList();
  toast(label ? `${label} — “${m.from}”` : `Moved “${m.from}” to ${folder}`);
}

// ---- tiny toast ----
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// ---- sidebar folder selection ----
document.querySelectorAll('.sidebar__item').forEach((f) => {
  f.addEventListener('click', () => {
    document.querySelectorAll('.sidebar__item').forEach((x) => x.classList.remove('sidebar__item--active'));
    f.classList.add('sidebar__item--active');
    activeFolder = f.dataset.folder;
    showEmptyReader();
    renderList();
  });
});

// ---- top tab selection: swap between the inbox (SMART Application) and the ED Track Board ----
const tabs = document.querySelectorAll('.tabstrip .tab[role="tab"]');
const workspaceView = document.querySelector('.workspace');
const trackboardView = document.getElementById('trackboard');
tabs.forEach((t) => {
  t.addEventListener('click', (e) => {
    if (e.target.classList.contains('tab__close')) return;
    tabs.forEach((x) => { x.classList.remove('tab--active'); x.removeAttribute('aria-selected'); });
    t.classList.add('tab--active');
    t.setAttribute('aria-selected', 'true');
    const showBoard = /ED Trackboard/i.test(t.textContent);
    if (trackboardView) trackboardView.hidden = !showBoard;
    if (workspaceView) workspaceView.hidden = showBoard;
  });
});

// ============================================================================
// ED Track Board — patient list shown when the "ED Trackboard" tab is active.
// Sample roster; most Epic columns are intentionally blank (as on a real board).
// ============================================================================
const ED_COLS = [
  'Bed', 'OOB', 'Vis', 'Acu', 'TT', 'Patient', 'Age', 'Complaint', 'SMART App',
  'PV', '<30d', 'MD/LIP', 'Res', 'RN', 'New Data', 'Lab Stat', 'Img Stat', 'Radi',
  'Co-S', 'Con', 'Stick', 'Falls', 'BH', 'Mec', 'Dispo', 'Bed', 'Reg', 'Pwc',
];

const ED_PATIENTS = [
  { bed: '07-P', tt: '2819…', name: 'Anderson, Linda',   sex: 'U', age: 77, smart: 'Low',  res: 'SJP', newData: '1/2/2', lab: '1/9' },
  { bed: '08-P', tt: 'bef7…', name: 'Bechtelar, Rhett',  sex: 'M', age: 33, smart: 'Low',  res: 'SJP', newData: '0/3/3', lab: '0/6' },
  { bed: '09-P', tt: 'e694…', name: 'Becker, Lashandra', sex: 'F', age: 64, smart: 'Low',  res: 'SJP', newData: '1/4/0', lab: '1/4' },
  { bed: '10-P', tt: 'fd31…', name: 'Bernier, Antione',  sex: 'M', age: 10, smart: 'Med',  res: 'SJP', newData: '1/3/3', lab: '0/7' },
  { bed: '11-P', tt: 'b336…', name: 'Bernier, Tracey',   sex: 'F', age: 59, smart: 'Low',  res: 'SJP', newData: '0/3/0', lab: '1/2' },
  { bed: '12-P', tt: '3216…', name: 'Blick, Saul',       sex: 'M', age: 15, smart: 'Low',  res: 'SJP', newData: '4/4/3', lab: '0/0' },
  { bed: '13-P', tt: '034e…', name: 'Borer, Elaine',     sex: 'F', age: 14, smart: 'Med',  res: 'SJP', newData: '1/1/1', lab: '2/2' },
  { bed: '14-P', tt: 'd8ac…', name: 'Bradtke, Loise',    sex: 'F', age: 10, smart: 'High', res: 'SJP', newData: '0/0/3', lab: '0/5' },
  { bed: '15-P', tt: 'fa95…', name: 'Braun, Rufus',      sex: 'M', age: 67, smart: 'Low',  res: 'SJP', newData: '0/3/2', lab: '2/7' },
  { bed: '16-P', tt: 'LASS…', name: 'BREAKTHEGLASS, BREAKTHEGLASS', sex: 'F', age: 43, smart: 'Low', res: 'SJP', newData: '0/4/3', lab: '2/8' },
  { bed: '17-P', tt: '046f…', name: 'Brown, Yevette',    sex: 'F', age: 68, smart: 'Med',  res: 'SJP', newData: '0/0/4', lab: '0/3' },
  { bed: '18-P', tt: 'EVEL…', name: 'BTGAPPTLEVEL, BTGAPPTLEVEL', sex: 'M', age: 25, smart: 'Med', res: 'SJP', newData: '2/1/3', lab: '2/3' },
];

const BED_ICON = '<svg class="ed-bed__icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6v12"/><path d="M2 12h16a4 4 0 0 1 4 4v2"/><path d="M22 18H2"/><path d="M6 12V9h4a2 2 0 0 1 2 2v1"/></svg>';
const DISCH_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-7 9 7"/><path d="M5 9v11h14V9"/></svg>';

// idx distinguishes the two "Bed" columns — only the first carries the bed/number.
function edCell(col, p, idx) {
  switch (col) {
    case 'Bed':       return idx === 0 ? `<span class="ed-bed">${BED_ICON}${p.bed}</span>` : '';
    case 'TT':        return `<span class="ed-tt">${p.tt}</span>`;
    case 'Patient':   return `<span class="ed-name">${p.name} (${p.sex})</span>`;
    case 'Age':       return `${p.age} y.o.`;
    case 'Complaint': return '<span class="ed-link">See chart</span>';
    case 'SMART App': return `<span class="ed-pill ed-pill--${p.smart.toLowerCase()}">${p.smart}</span>`;
    case 'Res':       return `<span class="ed-res">${p.res}</span>`;
    case 'New Data':  return `<span class="ed-nums">[${p.newData}]</span>`;
    case 'Lab Stat':  return `<span class="ed-nums">[${p.lab}]</span>`;
    case 'Dispo':     return `<span class="ed-dispo">${DISCH_ICON}Disch…</span>`;
    case 'Pwc':       return `<button class="ed-x" data-bed="${p.bed}" title="Remove">✕</button>`;
    default:          return '';
  }
}

function renderTrackboard() {
  const table = document.getElementById('edTable');
  if (!table) return;
  const head = `<thead><tr>${ED_COLS.map((c) => `<th>${c}</th>`).join('')}</tr></thead>`;
  const body = `<tbody>${ED_PATIENTS.map((p) =>
    `<tr>${ED_COLS.map((c, i) => `<td>${edCell(c, p, i)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  table.innerHTML = head + body;
  table.querySelectorAll('.ed-x').forEach((b) => {
    b.addEventListener('click', () => {
      const i = ED_PATIENTS.findIndex((p) => p.bed === b.dataset.bed);
      if (i > -1) { ED_PATIENTS.splice(i, 1); renderTrackboard(); }
    });
  });
}
renderTrackboard();

// filter chips: move the active highlight (visual only for this mock)
document.querySelectorAll('.tb-filter').forEach((f) => {
  f.addEventListener('click', () => {
    document.querySelectorAll('.tb-filter').forEach((x) => x.classList.remove('tb-filter--active'));
    f.classList.add('tb-filter--active');
  });
});

// toolbar Refresh re-renders the board
document.querySelectorAll('.tb-tool').forEach((b) => {
  if (/Refresh/.test(b.textContent)) {
    b.addEventListener('click', () => { renderTrackboard(); toast('Track board refreshed'); });
  }
});

// ---- "Refresh" spins briefly (visible feedback), then full-reloads → re-pulls Supabase ----
document.querySelectorAll('.msglist__action').forEach((b) => {
  if (/Refresh/.test(b.textContent)) {
    b.addEventListener('click', () => {
      b.classList.add('loading');
      const glyph = b.querySelector('.refresh-glyph');
      if (glyph) glyph.classList.add('spinning');
      setTimeout(() => location.reload(), 450); // let the spin register before navigating away
    });
  }
});

// ---- draggable panel dividers (resize sidebar / inbox / behaviors; body fills the rest) ----
const workspace = document.querySelector('.workspace');
const WIDTHS_KEY = 'ehrInboxWidths';
const MIN_W = { '--w-sidebar': 150, '--w-list': 240, '--w-actions': 200 };
const BODY_MIN = 320;

(function restoreWidths() {
  if (window.innerWidth < 1024) return; // ignore saved widths on small screens
  try {
    const saved = JSON.parse(localStorage.getItem(WIDTHS_KEY));
    if (saved) Object.entries(saved).forEach(([k, v]) => { if (v) workspace.style.setProperty(k, v); });
  } catch (_) { /* ignore */ }
})();

function saveWidths() {
  const cs = getComputedStyle(workspace);
  localStorage.setItem(WIDTHS_KEY, JSON.stringify({
    '--w-sidebar': cs.getPropertyValue('--w-sidebar').trim(),
    '--w-list': cs.getPropertyValue('--w-list').trim(),
    '--w-actions': cs.getPropertyValue('--w-actions').trim(),
  }));
}

document.querySelectorAll('.resizer').forEach((r) => {
  r.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const varName = r.dataset.var;
    const panel = r.previousElementSibling;       // the panel this handle resizes
    const reader = document.getElementById('reader');
    const startX = e.clientX;
    const startW = panel.getBoundingClientRect().width;
    const min = MIN_W[varName] || 160;
    const max = startW + Math.max(0, reader.getBoundingClientRect().width - BODY_MIN);

    r.classList.add('dragging');
    document.body.classList.add('col-resizing');

    const onMove = (ev) => {
      const w = Math.max(min, Math.min(max, startW + (ev.clientX - startX)));
      workspace.style.setProperty(varName, w + 'px');
    };
    const onUp = () => {
      r.classList.remove('dragging');
      document.body.classList.remove('col-resizing');
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      saveWidths();
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });
});

renderList();

// ---- optional deep link: index.html?open=<id> opens that message on load ----
const openParam = new URLSearchParams(location.search).get('open');
if (openParam) {
  const m = MESSAGES.find((x) => String(x.id) === openParam);
  if (m) {
    activeFolder = m.folder;
    document.querySelectorAll('.sidebar__item').forEach((x) => {
      x.classList.toggle('sidebar__item--active', x.dataset.folder === m.folder);
    });
    renderList();
    openMessage(m.id);
  }
}

// ============================================================================
// API HOOK — receive messages from an external source.
//
// GitHub Pages is static: it can't RECEIVE an HTTP request itself. Instead the
// page (as a client) pulls/subscribes from a broker that the external source
// writes to. receiveMessage() is the single entry point — wire any transport
// below to it. Accepts a string or an object:
//   { from, subject, source, body, folder, flagged, time }
// ============================================================================
let inboundSeq = 0;
const seenExt = new Set(); // dedup by stable external id (realtime/poll sources)

function fmt(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  let h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${h}:${min} ${ap}`;
}
const fmtNow = () => fmt(new Date());

// opts: { persist = true, extId, silent = false }
// persist=false for source-of-truth transports (e.g. Supabase) that re-supply
// history on load; extId dedups; silent suppresses the toast (history backfill).
function receiveMessage(payload, opts = {}) {
  const p = typeof payload === 'string' ? { message: payload } : (payload || {});
  if (opts.extId != null) {
    if (seenExt.has(opts.extId)) return null; // already have this one
    seenExt.add(opts.extId);
  }
  const subject = p.subject || p.title || p.message || 'New message';
  const naturalFolder = p.folder || 'My Requests';
  const msg = {
    id: opts.extId != null ? 'ext-' + opts.extId : Date.now() + inboundSeq++,
    from: p.from || 'External Source',
    subject,
    preview: subject.length > 52 ? subject.slice(0, 52) + '…' : subject,
    source: p.source || 'API',
    time: p.time || fmtNow(),
    homeFolder: naturalFolder,   // where Reactivate returns it
    folder: naturalFolder,
    flagged: !!p.flagged,
    body: p.body || p.message || subject,
  };
  // honor a saved folder move for this message across reloads (Supabase re-supplies history)
  const ov = loadOverrides();
  if (ov[msg.id] !== undefined) msg.folder = ov[msg.id];
  MESSAGES.push(msg);
  if (opts.persist !== false) {
    const inbound = loadInbound();
    inbound.push(msg);
    saveInbound(inbound);
  }
  renderList();
  if (!opts.silent) toast(`New message from ${msg.from}`);
  return msg.id;
}

// Callable from the console, another tab, or any transport wired below.
window.receiveMessage = receiveMessage;

// --- Transport 1: cross-context broadcast (works today, no backend) ---
// Any page/app on the SAME ORIGIN can push a message live, e.g.:
//   new BroadcastChannel('luminai-ehr').postMessage({ from: 'Dr. Lee', subject: 'Hi' })
try {
  const chan = new BroadcastChannel('luminai-ehr');
  chan.onmessage = (e) => receiveMessage(e.data);
} catch (_) { /* BroadcastChannel unsupported */ }

// --- Transport 2: Supabase Realtime (instant, over the internet) ---
// Fill in your project URL + PUBLIC anon key. An external source INSERTs a row
// via the REST API (see README) and this page renders it in <1s via a realtime
// subscription. The anon key is safe to expose *when Row Level Security is on*.
const SUPABASE = {
  url: 'https://dvnbscuzafxpapfmnbte.supabase.co',
  anonKey: 'sb_publishable_GbB5yYuzdLR_w_hXw3WSHg_WIJYyr5O',  // publishable key (safe client-side with RLS on)
  table: 'inbasket_messages',  // cols: id, created_at, message_type, sender_id,
                               //       recipients, body, patient_id, patient_id_type
};

// SENDMESSAGE MessageType -> sidebar folder (mirrors send_inbasket.py's set).
const MSG_TYPE_TO_FOLDER = {
  'result': 'Results',
  'my-requests': 'My Requests',
  'staff-message': 'Staff Messages',
  'letter-draft': 'Letter Drafts',
  'forms-approvals': 'Forms & Approvals',
  'patient-message': 'Patient Messages',
  'new-chart': 'New Charts',
  'follow-up': 'Follow-up',
};

// Known sample patients (patient_id -> display name). Real names arrive via r.patient_name.
const PATIENT_NAMES = {
  '0337ce1a-4012-7e62-99dc-2547d449bef7': 'Bechtelar, Rhett James',
};

// send_inbasket.py --target shivank writes the body as a JSON document so the
// real patient travels per-message. Parse it here; plain-text bodies (older rows
// or Farseen-style sends) return null and are handled as raw text.
function parseBodyDoc(body) {
  if (typeof body !== 'string') return null;
  const t = body.trim();
  if (!t.startsWith('{')) return null;
  try { return JSON.parse(t); } catch { return null; }
}

// Map an inbasket_messages row (the SENDMESSAGE shape) to the UI's fields.
// Primary line = patient name (orange); second line = sender; third = subject.
function mapRow(r) {
  const doc = parseBodyDoc(r.body);
  const message = doc && typeof doc.message === 'string' ? doc.message : (r.body || '');
  const first = message.split('\n')[0] || 'In Basket message';
  const name = (doc && doc.patient_name)
    || r.patient_name
    || PATIENT_NAMES[r.patient_id]
    || r.sender_id
    || 'In Basket';
  return {
    from: name,
    subject: first.length > 90 ? first.slice(0, 90) + '…' : first,
    source: r.sender_id || 'In Basket',
    body: message,
    folder: MSG_TYPE_TO_FOLDER[r.message_type] || 'Staff Messages',
    flagged: false,
    time: r.created_at ? fmt(new Date(r.created_at)) : undefined,
  };
}

if (SUPABASE.url && SUPABASE.anonKey) {
  (async () => {
    try {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const sb = createClient(SUPABASE.url, SUPABASE.anonKey);

      // Backfill recent history (Supabase is the source of truth → don't re-persist).
      const { data } = await sb.from(SUPABASE.table)
        .select('*').order('created_at', { ascending: false }).limit(50); // newest 50
      (data || []).forEach((row) =>
        receiveMessage(mapRow(row), { persist: false, extId: row.id, silent: true }));

      // Subscribe to new inserts → instant push.
      sb.channel('inbox')
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: SUPABASE.table },
          (payload) => receiveMessage(mapRow(payload.new), { persist: false, extId: payload.new.id }))
        .subscribe();
    } catch (err) {
      console.warn('[inbox] Supabase transport not connected:', err);
    }
  })();
}

// --- Transport 3: poll any JSON endpoint (fallback / GitHub-native) ---
// Point POLL_URL at a JSON array of message objects an external source writes
// (a serverless endpoint, or even a JSON file committed to this repo).
const POLL_URL = null; // e.g. 'https://<you>.github.io/<repo>/inbox.json'
if (POLL_URL) {
  setInterval(async () => {
    try {
      const res = await fetch(POLL_URL, { cache: 'no-store' });
      const items = await res.json();
      items.forEach((it) => receiveMessage(it, { persist: false, extId: it.id }));
    } catch (_) { /* offline / not configured */ }
  }, 5000);
}
