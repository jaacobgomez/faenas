import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

// ─── Utilidades ──────────────────────────────────────────────────────────────

const $app = document.getElementById('app');
const $toast = document.getElementById('toast');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Fechas como 'AAAA-MM-DD', calculadas en UTC para que no bailen con el horario de verano.
const parse = (s) => new Date(s + 'T00:00:00Z');
const fmt = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
const addMonths = (s, n) => { const d = parse(s.slice(0, 8) + '01'); d.setUTCMonth(d.getUTCMonth() + n); return fmt(d); };
const isoDow = (s) => ((parse(s).getUTCDay() + 6) % 7) + 1;
const mondayOf = (s) => addDays(s, 1 - isoDow(s));
const todayMadrid = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const longDate = (s) => parse(s).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const monthName = (s) => parse(s).toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DAYS_LONG = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const SLOTS = [['manana', 'Mañana'], ['tarde', 'Tarde'], ['noche', 'Noche']];

const ERRORS = {
  sesion_caducada: 'Tu sesión ha caducado. Vuelve a entrar.',
  pin_incorrecto: 'PIN incorrecto.',
  pin_formato: 'El PIN son de 4 a 6 números.',
  bloqueado: 'Demasiados intentos. Prueba dentro de 15 minutos.',
  no_existe: 'Ese miembro no existe en esta casa.',
  ya_hecha: 'Alguien se te ha adelantado con esa.',
  fecha_fuera_de_rango: 'Solo se puede marcar hoy y los dos días anteriores.',
  no_toca_ese_dia: 'Esa tarea no toca ese día.',
  dias_invalidos: 'Elige al menos un día.',
  tarea_no_existe: 'Esa tarea ya no existe.',
  miembro_no_existe: 'Ese miembro no está en esta casa.',
};

function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => $toast.classList.remove('show'), 2600);
}

// ─── Almacenamiento local (solo comodidad: sesiones por casa en este móvil) ───

function loadStore() {
  try { return JSON.parse(localStorage.getItem('faenas')) || { houses: {} }; }
  catch { return { houses: {} }; }
}
function saveStore() {
  try { localStorage.setItem('faenas', JSON.stringify(store)); } catch { /* modo privado */ }
}

// ─── API (RPC de Supabase vía REST, sin librerías) ───────────────────────────

async function rpc(fn, args = {}) {
  const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (!SUPABASE_KEY.startsWith('sb_')) headers.Authorization = `Bearer ${SUPABASE_KEY}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const code = body?.message || res.statusText;
    if (code === 'sesion_caducada' && store.houses[S.slug]) { delete store.houses[S.slug].token; saveStore(); }
    throw new Error(ERRORS[code] || code);
  }
  return body;
}

// ─── Estado ──────────────────────────────────────────────────────────────────

const store = loadStore();
const params = new URLSearchParams(location.search);
const S = {
  slug: params.get('casa') || store.last || null,
  data: null,
  view: 'hoy',
  today: todayMadrid(),
  day: todayMadrid(),
  week: mondayOf(todayMadrid()),
  month: todayMadrid().slice(0, 8) + '01',
  login: null,       // { house, members, selected }
  editing: null,     // id de tarea en edición, 'new', o null
  busy: false,
};
if (S.slug) { store.last = S.slug; saveStore(); }

const token = () => store.houses[S.slug]?.token;
const member = (id) => S.data?.members.find((m) => m.id === id);

async function refresh() {
  const from = [S.week, addDays(S.today, -2)].sort()[0];
  const to = [addDays(S.week, 6), S.today].sort()[1];
  S.data = await rpc('get_state', { p_token: token(), p_from: from, p_to: to, p_month: S.month });
  if (S.data.today !== S.today) {  // pasó la medianoche con la app abierta
    S.today = S.data.today;
    if (S.day > S.today) S.day = S.today;
  }
  store.houses[S.slug].name = S.data.house.name;
  saveStore();
}

function logout() {
  const t = token();
  if (t) rpc('logout', { p_token: t }).catch(() => {});
  if (store.houses[S.slug]) delete store.houses[S.slug].token;
  saveStore();
  S.data = null;
  S.login = null;
  start();
}

// ─── Vistas ──────────────────────────────────────────────────────────────────

const chip = (m) => m ? `<span class="chip" style="--c:${esc(m.color)}">${esc(m.emoji)} ${esc(m.name)}</span>` : '';
const avatar = (m) => m ? `<span class="avatar" style="--c:${esc(m.color)}" title="${esc(m.name)}">${esc(m.emoji)}</span>` : '';

function tasksFor(day) {
  const dow = isoDow(day);
  return S.data.tasks.filter((t) => t.days.includes(dow));
}
const doneFor = (taskId, day) => S.data.completions.find((c) => c.task_id === taskId && c.done_on === day);

function availableAt(dow, slot) {
  return S.data.availability.filter((a) => a.dow === dow && a.slot === slot).map((a) => member(a.member_id)).filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function viewHoy() {
  const day = S.day;
  const tasks = tasksFor(day);
  const done = tasks.filter((t) => doneFor(t.id, day)).length;
  const label = day === S.today ? 'Hoy' : day === addDays(S.today, -1) ? 'Ayer' : 'Anteayer';
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 100;

  const rows = tasks.map((t) => {
    const c = doneFor(t.id, day);
    const who = c && member(c.member_id);
    const mine = c && c.member_id === S.data.me;
    const assigned = t.assigned_to && member(t.assigned_to);
    return `
      <button class="task ${c ? 'done' : ''} ${c && !mine ? 'locked' : ''}" data-action="toggle" data-task="${t.id}">
        <span class="check" ${who ? `style="--c:${esc(who.color)}"` : ''}>${c ? '✓' : ''}</span>
        <span class="task-emoji">${esc(t.emoji)}</span>
        <span class="task-body">
          <span class="task-name">${esc(t.name)}</span>
          <span class="task-meta">${who ? `${chip(who)}${c.covered ? ' <span class="tag">cubrió</span>' : ''}`
            : assigned ? `Le toca a ${chip(assigned)}` : 'Libre: quien llegue primero'}</span>
        </span>
        <span class="pts">${c ? '+' + c.points : t.points} pt</span>
      </button>`;
  }).join('');

  const avail = SLOTS.map(([slot, name]) => {
    const ms = availableAt(isoDow(day), slot);
    return `<div class="slot-row"><span class="slot-name">${name}</span>${ms.length ? ms.map(chip).join('') : '<span class="muted">nadie</span>'}</div>`;
  }).join('');

  return `
    <div class="nav-row">
      <button class="icon-btn" data-action="day" data-n="-1" ${day <= addDays(S.today, -2) ? 'disabled' : ''} aria-label="Día anterior">‹</button>
      <div class="nav-title"><strong>${label}</strong><span class="muted">${longDate(day)}</span></div>
      <button class="icon-btn" data-action="day" data-n="1" ${day >= S.today ? 'disabled' : ''} aria-label="Día siguiente">›</button>
    </div>
    <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
      <div style="width:${pct}%"></div><span>${done}/${tasks.length} hechas</span>
    </div>
    <div class="list">${rows || '<p class="empty">Hoy no toca nada. Disfrútalo, que dura poco.</p>'}</div>
    <h2>¿Quién puede ${label.toLowerCase()}?</h2>
    <div class="card">${avail}</div>`;
}

function viewSemana() {
  const days = [...Array(7)].map((_, i) => addDays(S.week, i));
  const minWeek = addDays(mondayOf(S.today), -42), maxWeek = addDays(mondayOf(S.today), 42);
  const cards = days.map((d, i) => {
    const tasks = tasksFor(d);
    const pills = tasks.map((t) => {
      const c = doneFor(t.id, d);
      const who = c && member(c.member_id);
      return `<span class="pill ${c ? 'done' : ''}" title="${esc(t.name)}${who ? ' · ' + esc(who.name) : ''}">${esc(t.emoji)}${who ? avatar(who) : ''}</span>`;
    }).join('');
    const avail = SLOTS.map(([slot, name]) => {
      const ms = availableAt(i + 1, slot);
      return `<span class="mini-slot"><span class="muted">${name[0]}</span>${ms.map(avatar).join('') || '<span class="muted">·</span>'}</span>`;
    }).join('');
    return `
      <div class="card day-card ${d === S.today ? 'is-today' : ''}">
        <div class="day-head"><strong>${DAYS_LONG[i]} ${parse(d).getUTCDate()}</strong><span class="avail">${avail}</span></div>
        <div class="pills">${pills || '<span class="muted">Sin tareas</span>'}</div>
      </div>`;
  }).join('');

  return `
    <div class="nav-row">
      <button class="icon-btn" data-action="week" data-n="-7" ${S.week <= minWeek ? 'disabled' : ''} aria-label="Semana anterior">‹</button>
      <div class="nav-title"><strong>Semana del ${parse(S.week).getUTCDate()}</strong>
        <span class="muted">${S.week === mondayOf(S.today) ? 'esta semana' : monthName(S.week)}</span></div>
      <button class="icon-btn" data-action="week" data-n="7" ${S.week >= maxWeek ? 'disabled' : ''} aria-label="Semana siguiente">›</button>
    </div>
    <p class="hint">Disponibles: M = mañana, T = tarde, N = noche. Las tareas con avatar ya están hechas.</p>
    ${cards}`;
}

function viewRanking() {
  const rank = S.data.ranking;
  const max = Math.max(1, ...rank.map((r) => r.points));
  const rows = rank.map((r, i) => {
    const m = member(r.member_id);
    const crown = i === 0 && r.points > 0 ? '👑' : `${i + 1}.`;
    return `
      <div class="rank-row">
        <span class="rank-pos">${crown}</span>
        <div class="rank-body">
          <div class="rank-top">${chip(m)}<strong>${r.points} pt</strong></div>
          <div class="bar"><div style="width:${(r.points / max) * 100}%;background:${esc(m?.color)}"></div></div>
          <span class="muted small">${r.done} tareas${r.covered ? ` · cubrió ${r.covered}` : ''}</span>
        </div>
      </div>`;
  }).join('');
  const thisMonth = S.today.slice(0, 8) + '01';

  return `
    <div class="nav-row">
      <button class="icon-btn" data-action="month" data-n="-1" ${S.month <= addMonths(thisMonth, -12) ? 'disabled' : ''} aria-label="Mes anterior">‹</button>
      <div class="nav-title"><strong>${monthName(S.month)}</strong><span class="muted">${S.month === thisMonth ? 'en juego' : 'cerrado'}</span></div>
      <button class="icon-btn" data-action="month" data-n="1" ${S.month >= thisMonth ? 'disabled' : ''} aria-label="Mes siguiente">›</button>
    </div>
    <div class="card">${rows}</div>
    <h2>Premio del mes</h2>
    <form class="card prize" data-form="prize">
      <input name="prize" maxlength="80" placeholder="Por decidir… (¿elige peli? ¿se libra de la basura?)" value="${esc(S.data.house.prize)}">
      <button class="btn">Guardar</button>
    </form>
    <p class="hint">Cada tarea suma sus puntos. Si haces una que le tocaba a otro, +1 extra por cubrirle.</p>`;
}

function viewHorario() {
  const mine = new Set(S.data.availability.filter((a) => a.member_id === S.data.me).map((a) => `${a.dow}-${a.slot}`));
  const grid = DAYS_LONG.map((d, i) => `
    <div class="grid-row">
      <span class="grid-day">${d}</span>
      ${SLOTS.map(([slot, name]) => {
        const on = mine.has(`${i + 1}-${slot}`);
        return `<button class="slot ${on ? 'on' : ''}" data-action="avail" data-dow="${i + 1}" data-slot="${slot}" aria-pressed="${on}">${name}</button>`;
      }).join('')}
    </div>`).join('');

  const others = S.data.members.map((m) => {
    const set = new Set(S.data.availability.filter((a) => a.member_id === m.id).map((a) => `${a.dow}-${a.slot}`));
    return `
      <div class="card">
        <div class="mb">${chip(m)}</div>
        <div class="mini-grid">
          <span></span>${DAYS.map((d) => `<span class="muted">${d}</span>`).join('')}
          ${SLOTS.map(([slot, name]) => `<span class="muted">${name[0]}</span>${DAYS.map((_, i) =>
            `<span class="dot ${set.has(`${i + 1}-${slot}`) ? 'on' : ''}" style="--c:${esc(m.color)}"></span>`).join('')}`).join('')}
        </div>
      </div>`;
  }).join('');

  return `
    <h2>Mi horario</h2>
    <p class="hint">Marca cuándo sueles estar en casa y con manos libres. Es tu semana tipo: se repite.</p>
    <div class="card grid">${grid}</div>
    <h2>Todos</h2>
    ${others}`;
}

function taskForm(t) {
  const days = new Set(t?.days || [1, 2, 3, 4, 5, 6, 7]);
  return `
    <form class="card task-form" data-form="task" data-id="${t?.id || ''}">
      <div class="form-row">
        <input name="emoji" class="emoji-input" maxlength="4" value="${esc(t?.emoji || '🧹')}" aria-label="Emoji">
        <input name="name" required maxlength="40" placeholder="Nombre de la tarea" value="${esc(t?.name || '')}">
      </div>
      <label>Puntos <input name="points" type="number" min="1" max="20" value="${t?.points || 1}"></label>
      <div class="days">${DAYS.map((d, i) => `
        <label class="day-toggle"><input type="checkbox" name="day" value="${i + 1}" ${days.has(i + 1) ? 'checked' : ''}><span>${d}</span></label>`).join('')}
      </div>
      <label>Le toca a
        <select name="assigned">
          <option value="">Libre (quien llegue primero)</option>
          ${S.data.members.map((m) => `<option value="${m.id}" ${t?.assigned_to === m.id ? 'selected' : ''}>${esc(m.emoji)} ${esc(m.name)}</option>`).join('')}
        </select>
      </label>
      <div class="form-actions">
        ${t ? '<button type="button" class="btn ghost danger" data-action="archive">Archivar</button>' : ''}
        <button type="button" class="btn ghost" data-action="cancel-edit">Cancelar</button>
        <button class="btn">Guardar</button>
      </div>
    </form>`;
}

const addHouseForm = () => `
  <form data-form="addhouse" class="form-row">
    <input name="link" required placeholder="Pega aquí el enlace de la casa">
    <button class="btn">Añadir</button>
  </form>`;

function viewAjustes() {
  const me = member(S.data.me);
  const tasks = S.data.tasks.map((t) => S.editing === t.id ? taskForm(t) : `
    <button class="task-line" data-action="edit" data-task="${t.id}">
      <span>${esc(t.emoji)} ${esc(t.name)}</span>
      <span class="muted small">${t.points} pt · ${t.days.length === 7 ? 'diaria' : t.days.map((d) => DAYS[d - 1]).join(' ')}</span>
    </button>`).join('');
  const houses = Object.entries(store.houses).filter(([slug, h]) => slug !== S.slug && h.token);

  return `
    <h2>Tareas de ${esc(S.data.house.name)}</h2>
    <div class="card list-lines">
      ${tasks}
      ${S.editing === 'new' ? taskForm(null) : '<button class="btn ghost" data-action="edit" data-task="new">+ Nueva tarea</button>'}
    </div>
    <h2>Tú: ${chip(me)}</h2>
    <form class="card" data-form="pin">
      <label>PIN actual <input name="old" type="password" inputmode="numeric" pattern="\\d{4,6}" required></label>
      <label>PIN nuevo <input name="new" type="password" inputmode="numeric" pattern="\\d{4,6}" required></label>
      <button class="btn">Cambiar PIN</button>
    </form>
    ${houses.length ? `<h2>Otras casas</h2><div class="card">${houses.map(([slug, h]) =>
      `<button class="btn ghost" data-action="switch" data-slug="${esc(slug)}">🏠 ${esc(h.name || 'Casa')}</button>`).join('')}</div>` : ''}
    <h2>Añadir otra casa</h2>
    <div class="card">${addHouseForm()}</div>
    <div class="card">
      <button class="btn ghost" data-action="share">🔗 Copiar enlace de esta casa</button>
      <button class="btn ghost danger" data-action="logout">Cerrar sesión</button>
    </div>`;
}

const VIEWS = { hoy: ['🏠', 'Hoy', viewHoy], semana: ['📅', 'Semana', viewSemana], ranking: ['🏆', 'Ranking', viewRanking],
  horario: ['🕒', 'Horario', viewHorario], ajustes: ['⚙️', 'Ajustes', viewAjustes] };

function render() {
  if (!S.data) return;
  const me = member(S.data.me);
  const others = Object.entries(store.houses).filter(([slug, h]) => slug !== S.slug && h.token);
  $app.innerHTML = `
    <header class="top">
      <div><span class="brand">Faenas</span><h1>${esc(S.data.house.name)}</h1></div>
      <div class="top-right">
        ${others.length ? `<button class="icon-btn" data-action="switch" data-slug="${esc(others[0][0])}" title="Ir a ${esc(others[0][1].name || 'otra casa')}">⇄</button>` : ''}
        ${avatar(me)}
      </div>
    </header>
    <main>${VIEWS[S.view][2]()}</main>
    <nav class="tabs">${Object.entries(VIEWS).map(([k, [icon, name]]) =>
      `<button data-action="view" data-view="${k}" class="${S.view === k ? 'active' : ''}"><span>${icon}</span>${name}</button>`).join('')}
    </nav>`;
}

// ─── Entrada ─────────────────────────────────────────────────────────────────

function renderLogin() {
  const L = S.login;
  if (!S.slug || !L) {
    const known = Object.entries(store.houses);
    $app.innerHTML = `
      <div class="login">
        <div class="logo">🧹</div><h1>Faenas</h1>
        <p>Abre el enlace de tu casa para entrar.</p>
        ${known.map(([slug, h]) => `<button class="btn" data-action="switch" data-slug="${esc(slug)}">🏠 ${esc(h.name || slug)}</button>`).join('')}
        ${addHouseForm()}
      </div>`;
    return;
  }
  const sel = L.members.find((m) => m.id === L.selected);
  $app.innerHTML = `
    <div class="login">
      <div class="logo">🧹</div><h1>${esc(L.house)}</h1>
      ${!sel ? `<p>¿Quién eres?</p>
        <div class="who">${L.members.map((m) => `
          <button class="who-btn" data-action="pick" data-member="${m.id}" style="--c:${esc(m.color)}">
            <span>${esc(m.emoji)}</span>${esc(m.name)}</button>`).join('')}</div>`
      : `<p>${sel.has_pin ? `Hola, ${esc(sel.name)}. Tu PIN:` : `Bienvenido/a, ${esc(sel.name)}. Crea tu PIN (4 a 6 números) y apúntatelo en la cabeza.`}</p>
        <form data-form="login" class="pin-form">
          <input name="pin" type="password" inputmode="numeric" autocomplete="off" pattern="\\d{4,6}" maxlength="6" required autofocus>
          <button class="btn">${sel.has_pin ? 'Entrar' : 'Crear PIN y entrar'}</button>
          <button type="button" class="btn ghost" data-action="pick" data-member="">No soy yo</button>
        </form>`}
    </div>`;
  $app.querySelector('input[name=pin]')?.focus();
}

async function start() {
  if (S.slug && !store.houses[S.slug]) { store.houses[S.slug] = {}; saveStore(); }
  if (S.slug && token()) {
    try { await refresh(); render(); return; } catch (e) { if (token()) { toast(e.message); return; } }
  }
  if (S.slug) {
    try {
      const r = await rpc('list_members', { p_slug: S.slug });
      if (!r) { toast('Ese enlace no corresponde a ninguna casa.'); delete store.houses[S.slug]; S.slug = null; saveStore(); }
      else S.login = { house: r.house, members: r.members, selected: null };
    } catch (e) { toast(e.message); }
  }
  renderLogin();
}

// ─── Acciones ────────────────────────────────────────────────────────────────

async function act(fn) {
  if (S.busy) return;
  S.busy = true;
  try { await fn(); } catch (e) { toast(e.message); if (!token()) { S.data = null; start(); } } finally { S.busy = false; }
}

$app.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const d = el.dataset;
  switch (d.action) {
    case 'view': S.view = d.view; S.editing = null; render(); window.scrollTo(0, 0); break;
    case 'day': S.day = addDays(S.day, +d.n); render(); break;
    case 'week': S.week = addDays(S.week, +d.n); act(async () => { await refresh(); render(); }); break;
    case 'month': S.month = addMonths(S.month, +d.n); act(async () => { await refresh(); render(); }); break;
    case 'toggle': {
      const c = doneFor(d.task, S.day);
      if (c && c.member_id !== S.data.me) { toast(`Ya la hizo ${member(c.member_id)?.name}. Llegas tarde.`); break; }
      el.classList.add('pending');
      act(async () => {
        const r = await rpc('toggle_task', { p_token: token(), p_task: d.task, p_date: S.day });
        await refresh(); render();
        if (r.done) toast(['¡Hecho!', 'Punto para ti.', 'Así se hace.', 'Impecable, señor.'][Math.floor(Math.random() * 4)]);
      });
      break;
    }
    case 'avail': {
      const on = el.getAttribute('aria-pressed') !== 'true';
      act(async () => {
        await rpc('set_availability', { p_token: token(), p_dow: +d.dow, p_slot: d.slot, p_available: on });
        await refresh(); render();
      });
      break;
    }
    case 'edit': S.editing = d.task; render(); break;
    case 'cancel-edit': S.editing = null; render(); break;
    case 'archive': {
      const id = el.closest('form').dataset.id;
      if (!confirm('¿Archivar esta tarea? Los puntos ya ganados se mantienen.')) break;
      act(async () => { await rpc('archive_task', { p_token: token(), p_id: id }); S.editing = null; await refresh(); render(); });
      break;
    }
    case 'pick': S.login.selected = d.member || null; renderLogin(); break;
    case 'switch': {
      S.slug = d.slug; store.last = d.slug; saveStore();
      history.replaceState(null, '', `?casa=${encodeURIComponent(d.slug)}`);
      S.data = null; S.login = null; S.view = 'hoy'; S.editing = null;
      start();
      break;
    }
    case 'share': {
      const url = `${location.origin}${location.pathname}?casa=${encodeURIComponent(S.slug)}`;
      navigator.clipboard?.writeText(url).then(() => toast('Enlace copiado.'), () => prompt('Copia el enlace:', url));
      break;
    }
    case 'logout': logout(); break;
  }
});

$app.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const f = new FormData(form);
  switch (form.dataset.form) {
    case 'login':
      act(async () => {
        const r = await rpc('login', { p_slug: S.slug, p_member: S.login.selected, p_pin: f.get('pin') });
        if (!r.ok) { toast(ERRORS[r.error] || r.error); form.reset(); return; }
        store.houses[S.slug] = { ...store.houses[S.slug], token: r.token };
        saveStore();
        await refresh(); render();
      });
      break;
    case 'task':
      act(async () => {
        await rpc('upsert_task', {
          p_token: token(), p_id: form.dataset.id || null, p_name: f.get('name'), p_emoji: f.get('emoji'),
          p_points: +f.get('points'), p_days: f.getAll('day').map(Number), p_assigned: f.get('assigned') || null,
        });
        S.editing = null; await refresh(); render(); toast('Tarea guardada.');
      });
      break;
    case 'prize':
      act(async () => { await rpc('set_prize', { p_token: token(), p_prize: f.get('prize') }); await refresh(); render(); toast('Premio guardado.'); });
      break;
    case 'addhouse': {
      const raw = String(f.get('link')).trim();
      let slug = raw;
      try { slug = new URL(raw).searchParams.get('casa') || raw; } catch { /* han pegado solo el código */ }
      S.slug = slug; store.last = slug; saveStore();
      history.replaceState(null, '', `?casa=${encodeURIComponent(slug)}`);
      S.data = null; S.login = null; S.view = 'hoy'; S.editing = null;
      start();
      break;
    }
    case 'pin':
      act(async () => {
        const r = await rpc('change_pin', { p_token: token(), p_old: f.get('old'), p_new: f.get('new') });
        toast(r.ok ? 'PIN cambiado.' : ERRORS[r.error] || r.error);
        if (r.ok) form.reset();
      });
      break;
  }
});

// Refresco periódico para ver lo que marcan los demás (sin pisar un formulario abierto).
async function poll() {
  if (document.visibilityState !== 'visible' || !S.data || S.editing || S.busy) return;
  if (document.activeElement?.matches('input, select')) return;
  try { await refresh(); render(); } catch { if (!token()) { S.data = null; start(); } }
}
setInterval(poll, 20000);
document.addEventListener('visibilitychange', poll);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

start();
