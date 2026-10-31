import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

// ─── Utilidades ──────────────────────────────────────────────────────────────

const $app = document.getElementById('app');
const $toast = document.getElementById('toast');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Color por casa (styles.css → [data-casa]): azul en la de papá, rosa en la de mamá.
const setCasa = (name) => {
  const n = String(name ?? '').toLowerCase();
  const casa = n.includes('papá') ? 'papa' : n.includes('mamá') ? 'mama' : '';
  if (casa) document.documentElement.dataset.casa = casa;
  else delete document.documentElement.dataset.casa;
};

// Fechas como 'AAAA-MM-DD', calculadas en UTC para que no bailen con el horario de verano.
const parse = (s) => new Date(s + 'T00:00:00Z');
const fmt = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
const addMonths = (s, n) => { const d = parse(s.slice(0, 8) + '01'); d.setUTCMonth(d.getUTCMonth() + n); return fmt(d); };
const isoDow = (s) => ((parse(s).getUTCDay() + 6) % 7) + 1;
const mondayOf = (s) => addDays(s, 1 - isoDow(s));
const todayMadrid = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const longDate = (s) => parse(s).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const shortDate = (s) => parse(s).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthName = (s) => parse(s).toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const madridDay = (ts) => new Date(ts).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const madridTime = (ts) => new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
const madridHour = () => +new Date().toLocaleTimeString('es-ES', { hour: '2-digit', hour12: false, timeZone: 'Europe/Madrid' });
const pts = (n) => (Math.round(n * 10) / 10).toLocaleString('es-ES');
const listNames = (names) => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

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
  no_hecha: 'Esa tarea aún está sin marcar.',
  solo_participantes: 'Solo puede cambiarlo quien la ha hecho.',
  fecha_invalida: 'Falta la fecha.',
  mensaje_invalido: 'Ese mensaje no se puede enviar.',
  producto_invalido: 'Escribe el nombre del producto.',
};

const icon = (name) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
const ICONS = {
  hoy: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8.5 12.2 2.4 2.4 4.6-5"/>',
  semana: '<rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  compra: '<path d="M3.5 4.5h2.2l2.1 10.2a1.5 1.5 0 0 0 1.5 1.2h7.6a1.5 1.5 0 0 0 1.5-1.2L20 8H6.4"/><circle cx="10" cy="19.5" r="1.1"/><circle cx="17" cy="19.5" r="1.1"/>',
  chat: '<path d="M20 11.5a7.5 7.5 0 0 1-11 6.6L4.5 19.5l1.4-4.2A7.5 7.5 0 1 1 20 11.5Z"/>',
  puntos: '<path d="M8 4.5h8v5.2a4 4 0 0 1-8 0V4.5ZM8 6.5H4.8c0 3 1.2 4.6 3.6 5M16 6.5h3.2c0 3-1.2 4.6-3.6 5M12 13.7v3.3M8.5 20h7M10 17h4l.6 3H9.4l.6-3Z"/>',
  ajustes: '<path d="M4 7.5h9M17 7.5h3M4 16.5h3M11 16.5h9"/><circle cx="15" cy="7.5" r="2"/><circle cx="9" cy="16.5" r="2"/>',
  gente: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.5-3.2 2.7-5 5.5-5s5 1.8 5.5 5M15.5 5.8a3 3 0 0 1 0 5.4M17.5 14.4c1.7.7 2.7 2.3 3 4.6"/>',
  enviar: '<path d="M12 19V5.5M6 11l6-6 6 6"/>',
  atras: '<path d="m14.5 6-6 6 6 6"/>',
  adelante: '<path d="m9.5 6 6 6-6 6"/>',
  cruz: '<path d="m7 7 10 10M17 7 7 17"/>',
  mas: '<path d="M12 5.5v13M5.5 12h13"/>',
  cambiar: '<path d="M4 8.5h13l-3.5-3.5M20 15.5H7l3.5 3.5"/>',
  compartir: '<path d="M12 15V4.5M7.5 8.5 12 4l4.5 4.5M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',
};
const LOGO = '<svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="var(--accent)"/><path d="M14 27 32 12l18 15" fill="none" stroke="var(--on-accent)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><path d="m23 38 6.5 6.5L42 31" fill="none" stroke="var(--on-accent)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function toast(msg, action) {
  $toast.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  if (action) $toast.querySelector('button').onclick = () => { $toast.classList.remove('show'); action.fn(); };
  $toast.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => $toast.classList.remove('show'), action ? 5000 : 2600);
}

// ─── Almacenamiento local (sesiones por casa, preferencias y última copia) ───

function loadStore() {
  try { return JSON.parse(localStorage.getItem('faenas')) || { houses: {} }; }
  catch { return { houses: {} }; }
}
function saveStore() {
  try { localStorage.setItem('faenas', JSON.stringify(store)); } catch { /* modo privado */ }
}

function applyPrefs() {
  const root = document.documentElement;
  const { theme = 'auto', size = 'normal' } = store.prefs || {};
  if (theme === 'auto') delete root.dataset.theme; else root.dataset.theme = theme;
  root.dataset.size = size;
}

// ─── API (RPC de Supabase vía REST, sin librerías) ───────────────────────────

async function rpc(fn, args = {}) {
  const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (!SUPABASE_KEY.startsWith('sb_')) headers.Authorization = `Bearer ${SUPABASE_KEY}`;
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
  } catch {
    throw new Error('Sin conexión. Prueba otra vez en un momento.');
  }
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
  weekTab: 'tareas',
  today: todayMadrid(),
  day: todayMadrid(),
  week: mondayOf(todayMadrid()),
  month: todayMadrid().slice(0, 8) + '01',
  login: null,       // { house, members, selected }
  editing: null,     // id de tarea en edición, 'new', o null
  sheet: null,       // panel abierto: { type: 'people' | 'once', ... }
  busy: false,
  gen: 0,            // sube con cada escritura: una lectura más vieja se descarta
  offline: false,    // se está viendo la última copia guardada
  chat: null,        // mensajes cargados (null = sin cargar)
  draft: '',
  ring: null,        // último porcentaje pintado, para animar el anillo
};
if (S.slug) { store.last = S.slug; saveStore(); }
applyPrefs();

const token = () => store.houses[S.slug]?.token;
const member = (id) => S.data?.members.find((m) => m.id === id);
const hasV2 = () => S.data?.version >= 2;   // la base de datos ya tiene chat, compra y reparto

async function refresh(gen) {
  const from = [S.week, addDays(S.today, -2)].sort()[0];
  const to = [addDays(S.week, 6), S.today].sort()[1];
  const data = await rpc('get_state', { p_token: token(), p_from: from, p_to: to, p_month: S.month });
  if (gen !== undefined && gen !== S.gen) return false;
  S.data = data;
  S.offline = false;
  if (S.data.today !== S.today) {  // pasó la medianoche con la app abierta
    S.today = S.data.today;
    if (S.day > S.today) S.day = S.today;
  }
  store.houses[S.slug].name = S.data.house.name;
  store.houses[S.slug].snapshot = S.data;
  saveStore();
  return true;
}

function logout() {
  const t = token();
  if (t) rpc('logout', { p_token: t }).catch(() => {});
  if (store.houses[S.slug]) { delete store.houses[S.slug].token; delete store.houses[S.slug].snapshot; }
  saveStore();
  resetHouse();
  start();
}

function resetHouse() {
  S.data = null; S.login = null; S.view = 'hoy'; S.editing = null; S.sheet = null; S.chat = null; S.draft = ''; S.ring = null;
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

const initial = (m) => esc([...String(m.name)][0]?.toUpperCase() || '?');
const avatar = (m, size = '') => m ? `<span class="avatar ${size}" style="--c:${esc(m.color)}" title="${esc(m.name)}">${initial(m)}</span>` : '';
const chip = (m) => m ? `<span class="chip" style="--c:${esc(m.color)}">${avatar(m, 'xs')}${esc(m.name)}</span>` : '';
const stack = (ms) => `<span class="stack">${ms.map((m) => avatar(m, 'sm')).join('')}</span>`;
const people = (c) => [c.member_id, ...(c.helpers || [])];

function tasksFor(day) {
  const dow = isoDow(day);
  return S.data.tasks.filter((t) => t.once_on
    ? t.once_on <= day && (!t.once_done_on || t.once_done_on === day)
    : t.days.includes(dow));
}
// En la semana, un encargo sale una sola vez: el día que se hizo o, si sigue pendiente, hoy.
const onceDay = (t) => t.once_done_on || (t.once_on > S.today ? t.once_on : S.today);
const weekTasksFor = (day) => S.data.tasks.filter((t) => t.once_on ? onceDay(t) === day : t.days.includes(isoDow(day)));
const doneFor = (taskId, day) => S.data.completions.find((c) => c.task_id === taskId && c.done_on === day);

function availableAt(dow, slot) {
  return S.data.availability.filter((a) => a.dow === dow && a.slot === slot).map((a) => member(a.member_id)).filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Hoy ─────────────────────────────────────────────────────────────────────

function greeting() {
  const h = madridHour();
  const hello = h < 6 ? 'Qué horas' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
  return `${hello}, ${member(S.data.me)?.name ?? ''}`;
}

function taskRow(t, day) {
  const c = doneFor(t.id, day);
  const assigned = t.assigned_to && member(t.assigned_to);
  let meta;
  if (c) {
    const ms = people(c).map(member).filter(Boolean);
    meta = `${stack(ms)}<span>${esc(listNames(ms.map((m) => m.name)))}</span>${c.covered ? '<span class="tag">cubrió</span>' : ''}`;
  } else {
    const who = assigned ? (assigned.id === S.data.me ? 'Te toca a ti' : `Le toca a ${esc(assigned.name)}`) : 'Quien llegue primero';
    const since = t.once_on && t.once_on < day ? ` · desde el ${shortDate(t.once_on)}` : '';
    meta = `${t.once_on ? '<span class="tag">Encargo</span>' : ''}<span>${who}${since}</span>`;
  }
  const count = c ? people(c).length : 1;
  const value = c ? (count > 1 ? pts(c.points / count) : `+${pts(c.points)}`) : pts(t.points);
  const side = hasV2()
    ? `<button class="task-side" data-action="people" data-task="${t.id}" aria-label="${c ? 'Quién la ha hecho' : 'Hacerla entre varios o pedir ayuda'}">${icon('gente')}</button>` : '';
  return `
    <div class="task ${c ? 'done' : ''}" data-row="${t.id}">
      <button class="task-main" data-action="toggle" data-task="${t.id}" aria-pressed="${!!c}">
        <span class="check"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 12.5 3.8 3.8 7.2-8"/></svg></span>
        <span class="task-emoji">${esc(t.emoji)}</span>
        <span class="task-body">
          <span class="task-name">${esc(t.name)}</span>
          <span class="task-meta">${meta}</span>
        </span>
        <span class="pts">${value}<small>pt${count > 1 ? ' c/u' : ''}</small></span>
      </button>
      ${side}
    </div>`;
}

function taskSection(title, tasks, day) {
  if (!tasks.length) return '';
  return `<h2>${title}</h2><div class="list">${tasks.map((t) => taskRow(t, day)).join('')}</div>`;
}

function viewHoy() {
  const day = S.day;
  const tasks = tasksFor(day);
  const done = tasks.filter((t) => doneFor(t.id, day));
  const pending = tasks.filter((t) => !doneFor(t.id, day));
  const mine = pending.filter((t) => t.assigned_to === S.data.me);
  const free = pending.filter((t) => !t.assigned_to);
  const others = pending.filter((t) => t.assigned_to && t.assigned_to !== S.data.me);
  const label = day === S.today ? 'Hoy' : day === addDays(S.today, -1) ? 'Ayer' : 'Anteayer';
  const pct = tasks.length ? Math.round((done.length / tasks.length) * 100) : 100;
  const myPoints = done.reduce((sum, t) => {
    const c = doneFor(t.id, day);
    const p = people(c);
    return sum + (p.includes(S.data.me) ? c.points / p.length : 0);
  }, 0);

  const summary = !tasks.length ? 'Hoy no toca nada. Disfrútalo, que dura poco.'
    : !pending.length ? 'Casa en orden. Se puede presumir.'
    : mine.length ? `Te ${mine.length === 1 ? 'toca una' : `tocan ${mine.length}`}, y quedan ${pending.length} en total.`
    : `${pending.length === 1 ? 'Queda una' : `Quedan ${pending.length}`}. Nadie está mirando… todavía.`;

  const R = 26, L = 2 * Math.PI * R;
  const from = S.ring ?? pct;
  S.ring = pct;
  const avail = SLOTS.map(([slot, name]) => {
    const ms = availableAt(isoDow(day), slot);
    return `<div class="slot-row"><span class="slot-name">${name}</span><span class="chips">${ms.length ? ms.map(chip).join('') : '<span class="muted">Nadie</span>'}</span></div>`;
  }).join('');

  return `
    <p class="hello">${esc(greeting())}</p>
    <div class="nav-row">
      <button class="icon-btn" data-action="day" data-n="-1" ${day <= addDays(S.today, -2) ? 'disabled' : ''} aria-label="Día anterior">${icon('atras')}</button>
      <div class="nav-title"><strong>${label}</strong><span class="muted">${longDate(day)}</span></div>
      <button class="icon-btn" data-action="day" data-n="1" ${day >= S.today ? 'disabled' : ''} aria-label="Día siguiente">${icon('adelante')}</button>
    </div>
    <section class="card summary ${!pending.length && tasks.length ? 'complete' : ''}">
      <div class="ring" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Tareas hechas">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="${R}"/>
          <circle class="ring-value" cx="32" cy="32" r="${R}" stroke-dasharray="${L}" stroke-dashoffset="${L * (1 - from / 100)}" data-to="${L * (1 - pct / 100)}"/>
        </svg>
        <span>${done.length}/${tasks.length}</span>
      </div>
      <div class="summary-text">
        <strong>${esc(summary)}</strong>
        ${myPoints ? `<span class="muted">Hoy llevas ${pts(myPoints)} pt.</span>` : ''}
      </div>
    </section>
    ${taskSection('Te tocan a ti', mine, day)}
    ${taskSection('Para quien llegue primero', free, day)}
    ${taskSection('De los demás', others, day)}
    ${taskSection('Hechas', done, day)}
    ${hasV2() ? `<button class="btn ghost add-once" data-action="once" data-task="">${icon('mas')} Añadir un encargo</button>` : ''}
    <h2>¿Quién puede ${label.toLowerCase()}?</h2>
    <div class="card">${avail}</div>`;
}

// ─── Semana y horarios ───────────────────────────────────────────────────────

function viewSemana() {
  const tabs = `
    <div class="seg" role="tablist">
      <button role="tab" aria-selected="${S.weekTab === 'tareas'}" data-action="weektab" data-tab="tareas">Tareas</button>
      <button role="tab" aria-selected="${S.weekTab === 'horario'}" data-action="weektab" data-tab="horario">Horarios</button>
    </div>`;
  return tabs + (S.weekTab === 'tareas' ? weekTasks() : weekSchedule());
}

function weekTasks() {
  const days = [...Array(7)].map((_, i) => addDays(S.week, i));
  const minWeek = addDays(mondayOf(S.today), -42), maxWeek = addDays(mondayOf(S.today), 42);
  const cards = days.map((d, i) => {
    const tasks = weekTasksFor(d);
    const pills = tasks.map((t) => {
      const c = doneFor(t.id, d);
      const ms = c ? people(c).map(member).filter(Boolean) : [];
      return `<span class="pill ${c ? 'done' : ''}" title="${esc(t.name)}${ms.length ? ' · ' + esc(listNames(ms.map((m) => m.name))) : ''}">${esc(t.emoji)}${ms.length ? stack(ms) : ''}</span>`;
    }).join('');
    const avail = SLOTS.map(([slot, name]) => {
      const ms = availableAt(i + 1, slot);
      return `<span class="mini-slot"><span class="muted">${name[0]}</span>${ms.map((m) => avatar(m, 'xs')).join('') || '<span class="muted">·</span>'}</span>`;
    }).join('');
    return `
      <div class="card day-card ${d === S.today ? 'is-today' : ''}">
        <div class="day-head"><strong>${DAYS_LONG[i]} ${parse(d).getUTCDate()}</strong><span class="avail">${avail}</span></div>
        <div class="pills">${pills || '<span class="muted">Sin tareas</span>'}</div>
      </div>`;
  }).join('');

  return `
    <div class="nav-row">
      <button class="icon-btn" data-action="week" data-n="-7" ${S.week <= minWeek ? 'disabled' : ''} aria-label="Semana anterior">${icon('atras')}</button>
      <div class="nav-title"><strong>Semana del ${parse(S.week).getUTCDate()}</strong>
        <span class="muted">${S.week === mondayOf(S.today) ? 'Esta semana' : monthName(S.week)}</span></div>
      <button class="icon-btn" data-action="week" data-n="7" ${S.week >= maxWeek ? 'disabled' : ''} aria-label="Semana siguiente">${icon('adelante')}</button>
    </div>
    <p class="hint">Arriba, quién está: mañana, tarde y noche. Las tareas con persona ya están hechas.</p>
    <div class="week-grid">${cards}</div>`;
}

function weekSchedule() {
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
    <div class="week-grid">${others}</div>`;
}

// ─── Compra ──────────────────────────────────────────────────────────────────

// Orden de pasillo: gana el primer grupo con una palabra que encaje.
const AISLES = [
  ['Fruta y verdura', 'manzana|plátano|platano|naranja|mandarina|limón|limon|pera|uva|fresa|melón|melon|sandía|sandia|kiwi|aguacate|tomate|lechuga|cebolla|ajo|patata|zanahoria|pimiento|calabacín|calabacin|berenjena|pepino|brócoli|brocoli|espinaca|champiñ|fruta|verdura|ensalada'],
  ['Carne y pescado', 'pollo|pavo|ternera|cerdo|carne|hamburguesa|salchicha|filete|lomo|chorizo|jamón|jamon|salmón|salmon|merluza|atún fresco|gamba|pescado|bacalao|lubina|dorada'],
  ['Lácteos y huevos', 'leche|yogur|queso|mantequilla|nata|huevo|kéfir|kefir'],
  ['Pan y desayuno', 'pan\\b|pan de|tostada|cereal|galleta|magdalena|café|cafe|cacao|mermelada|bollería|bolleria'],
  ['Despensa', 'arroz|pasta|macarr|espagueti|harina|azúcar|azucar|sal\\b|aceite|vinagre|atún|atun|lata|tomate frito|legumbre|lenteja|garbanzo|alubia|caldo|especia|salsa|mayonesa|ketchup'],
  ['Bebidas', 'agua|zumo|refresco|coca|cerveza|vino|bebida|fanta|aquarius'],
  ['Congelados', 'congelad|helado|pizza|croqueta|varitas'],
  ['Limpieza y hogar', 'detergente|suavizante|lavavajillas|fregasuelos|lejía|lejia|bolsa|papel|servilleta|estropajo|bayeta|limpia|amoniaco|film|aluminio|pila'],
  ['Aseo', 'champú|champu|gel|desodorante|pasta de dientes|dentífrico|dentifrico|cepillo|compresa|tampón|tampon|crema|jabón|jabon|maquinilla'],
].map(([name, words]) => [name, new RegExp(`(^|\\s)(${words})`, 'i')]);
// El más específico primero: "pasta de dientes" no es pasta, ni "tomate frito" es verdura.
const AISLE_SEARCH = ['Aseo', 'Limpieza y hogar', 'Despensa'].map((n) => AISLES.find(([a]) => a === n))
  .concat(AISLES.filter(([a]) => !['Aseo', 'Limpieza y hogar', 'Despensa'].includes(a)));
const aisleOf = (name) => AISLE_SEARCH.find(([, re]) => re.test(name))?.[0] ?? 'Otros';

function shopLists() {
  const items = S.data.shopping;
  const pending = items.filter((i) => !i.bought);
  const bought = items.filter((i) => i.bought);
  const row = (i) => {
    const by = member(i.bought ? i.bought_by : i.added_by);
    return `
      <div class="shop-item ${i.bought ? 'done' : ''}">
        <button class="shop-main" data-action="shop-toggle" data-id="${esc(i.id)}" aria-pressed="${i.bought}">
          <span class="check"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 12.5 3.8 3.8 7.2-8"/></svg></span>
          <span class="shop-name">${esc(i.name)}</span>
          ${by ? avatar(by, 'xs') : ''}
        </button>
        <button class="shop-x" data-action="shop-remove" data-id="${esc(i.id)}" aria-label="Quitar ${esc(i.name)}">${icon('cruz')}</button>
      </div>`;
  };
  const groups = [...AISLES.map(([n]) => n), 'Otros']
    .map((aisle) => [aisle, pending.filter((i) => aisleOf(i.name) === aisle)])
    .filter(([, list]) => list.length)
    .map(([aisle, list]) => `<h2>${aisle}</h2><div class="card shop-group">${list.map(row).join('')}</div>`).join('');
  const sugg = S.data.suggestions || [];

  return `
    ${!pending.length && !bought.length ? `<div class="empty-state">${icon('compra')}<strong>La lista está vacía</strong><span>Lo que falte en casa, apúntalo aquí. Lo ve toda la familia al momento.</span></div>` : ''}
    ${pending.length && bought.length === 0 ? '' : !pending.length && bought.length ? '<p class="hint center">Todo comprado. Directos a casa.</p>' : ''}
    ${groups}
    ${sugg.length ? `<h2>¿Lo de siempre?</h2><div class="suggestions">${sugg.map((n) =>
      `<button class="sugg" data-action="shop-add" data-name="${esc(n)}">${icon('mas')}${esc(n)}</button>`).join('')}</div>` : ''}
    ${bought.length ? `
      <div class="section-head"><h2>En el carro · ${bought.length}</h2>
        <button class="link" data-action="shop-clear">Quitar de la lista</button></div>
      <div class="card shop-group">${bought.map(row).join('')}</div>` : ''}`;
}

function viewCompra() {
  return `
    <form class="shop-add" data-form="shop" autocomplete="off">
      <input id="shop-input" name="name" maxlength="60" placeholder="Añadir a la lista…" aria-label="Producto" enterkeyhint="done">
      <button class="btn" aria-label="Añadir">${icon('mas')}</button>
    </form>
    <div id="shop-lists">${shopLists()}</div>
    <button class="btn ghost share-list" data-action="shop-share">${icon('compartir')} Copiar o compartir la lista</button>`;
}

// ─── Chat ────────────────────────────────────────────────────────────────────

const QUICK = ['Voy yo.', '¿Quién hay en casa?', 'Llego tarde.', '¿Falta algo de la compra?'];

function dayLabel(day) {
  if (day === S.today) return 'Hoy';
  if (day === addDays(S.today, -1)) return 'Ayer';
  return parse(day).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

function chatList() {
  if (!S.chat) return '<p class="hint center">Cargando…</p>';
  if (!S.chat.length) {
    return `<div class="empty-state">${icon('chat')}<strong>Empieza la conversación</strong><span>Aquí se habla de lo de casa. Y de quién no ha sacado la basura.</span></div>`;
  }
  let lastDay = null, lastWho = null;
  return S.chat.map((g) => {
    const m = member(g.member_id);
    const mine = g.member_id === S.data.me;
    const day = madridDay(g.created_at);
    const sep = day !== lastDay ? `<div class="chat-day"><span>${esc(dayLabel(day))}</span></div>` : '';
    const first = sep || lastWho !== g.member_id;
    lastDay = day; lastWho = g.member_id;
    return `${sep}
      <div class="msg ${mine ? 'mine' : ''} ${first ? 'first' : ''}">
        ${!mine ? (first ? avatar(m, 'sm') : '<span class="avatar-gap"></span>') : ''}
        <div class="bubble" ${mine ? `data-action="msg-delete" data-id="${esc(g.id)}"` : ''}>
          ${!mine && first ? `<span class="msg-who" style="--c:${esc(m?.color)}">${esc(m?.name ?? 'Alguien')}</span>` : ''}
          <span class="msg-body">${esc(g.body)}</span>
          <time>${madridTime(g.created_at)}</time>
        </div>
      </div>`;
  }).join('');
}

function viewChat() {
  return `
    <div id="chat-list" class="chat-list" aria-live="polite">${chatList()}</div>
    <div class="composer-wrap">
      ${S.chat && !S.chat.length ? `<div class="quick">${QUICK.map((q) => `<button class="sugg" data-action="quick" data-text="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : ''}
      <form class="composer" data-form="chat">
        <textarea id="chat-input" name="body" rows="1" maxlength="1000" placeholder="Escribe a la familia…" aria-label="Mensaje">${esc(S.draft)}</textarea>
        <button class="btn" aria-label="Enviar">${icon('enviar')}</button>
      </form>
    </div>`;
}

const nearBottom = () => innerHeight + scrollY >= document.documentElement.scrollHeight - 140;
const toBottom = () => window.scrollTo(0, document.documentElement.scrollHeight);

async function loadChat() {
  const list = await rpc('get_messages', { p_token: token() });
  if (S.view !== 'chat') return;
  S.chat = list;
  if (S.data) S.data.unread = 0;
  render();
  toBottom();
}

async function pollChat() {
  if (document.visibilityState !== 'visible' || S.view !== 'chat' || !S.chat) return;
  const after = S.chat[S.chat.length - 1]?.created_at ?? null;
  const fresh = await rpc('get_messages', { p_token: token(), p_after: after }).catch(() => []);
  if (S.view !== 'chat' || !S.chat) return;
  const known = new Set(S.chat.map((g) => g.id));
  const add = fresh.filter((g) => !known.has(g.id));
  if (!add.length) return;
  const stick = nearBottom();
  S.chat.push(...add);
  paint();
  if (stick) toBottom();
}

async function sendChat(input) {
  const body = S.draft.trim();
  if (!body || sendChat.busy) return;
  sendChat.busy = true;
  try {
    const g = await rpc('send_message', { p_token: token(), p_body: body });
    S.draft = '';
    input.value = '';
    input.style.height = '';
    S.chat = [...(S.chat || []), g];
    if (document.querySelector('.quick')) render(); else paint();
    document.getElementById('chat-input')?.focus();
    toBottom();
  } catch (e) { toast(e.message); }
  sendChat.busy = false;
}

// ─── Puntos ──────────────────────────────────────────────────────────────────

function viewPuntos() {
  const rank = S.data.ranking;
  const max = Math.max(1, ...rank.map((r) => r.points));
  const total = rank.reduce((sum, r) => sum + r.points, 0);
  const rows = rank.map((r, i) => {
    const m = member(r.member_id);
    const lead = i === 0 && r.points > 0;
    const notes = [`${r.done} ${r.done === 1 ? 'tarea' : 'tareas'}`];
    if (r.shared) notes.push(`${r.shared} entre varios`);
    if (r.covered) notes.push(`cubrió ${r.covered}`);
    return `
      <div class="rank-row ${lead ? 'lead' : ''}">
        <span class="rank-pos">${i + 1}</span>
        ${avatar(m)}
        <div class="rank-body">
          <div class="rank-top"><strong>${esc(m?.name)}</strong><strong class="rank-points">${pts(r.points)} pt</strong></div>
          <div class="bar"><div style="--w:${(r.points / max) * 100}%;background:${esc(m?.color)}"></div></div>
          <span class="muted small">${notes.join(' · ')}</span>
        </div>
      </div>`;
  }).join('');
  const thisMonth = S.today.slice(0, 8) + '01';

  return `
    <div class="nav-row">
      <button class="icon-btn" data-action="month" data-n="-1" ${S.month <= addMonths(thisMonth, -12) ? 'disabled' : ''} aria-label="Mes anterior">${icon('atras')}</button>
      <div class="nav-title"><strong>${monthName(S.month)}</strong><span class="muted">${S.month === thisMonth ? 'En juego' : 'Cerrado'}</span></div>
      <button class="icon-btn" data-action="month" data-n="1" ${S.month >= thisMonth ? 'disabled' : ''} aria-label="Mes siguiente">${icon('adelante')}</button>
    </div>
    <div class="card team"><span class="team-num">${pts(total)}</span><span class="muted">puntos entre todos este mes</span></div>
    <div class="card">${rows}</div>
    <h2>Premio del mes</h2>
    <form class="card prize" data-form="prize">
      <input name="prize" maxlength="80" placeholder="Por decidir… (¿elige peli? ¿se libra de la basura?)" value="${esc(S.data.house.prize)}" aria-label="Premio del mes">
      <button class="btn">Guardar</button>
    </form>
    <p class="hint">Cada tarea suma sus puntos. Si la hacéis entre varios, se reparten a partes iguales. Si haces una que le tocaba a otro, +1 por cubrirle.</p>`;
}

// ─── Ajustes ─────────────────────────────────────────────────────────────────

function taskForm(t) {
  const days = new Set(t?.days || [1, 2, 3, 4, 5, 6, 7]);
  return `
    <form class="task-form" data-form="task" data-id="${t?.id || ''}">
      <div class="form-row">
        <input name="emoji" class="emoji-input" maxlength="4" value="${esc(t?.emoji || '🧹')}" aria-label="Emoji">
        <input name="name" required maxlength="40" placeholder="Nombre de la tarea" value="${esc(t?.name || '')}" aria-label="Nombre">
      </div>
      <label>Puntos <input name="points" type="number" min="1" max="20" value="${t?.points || 1}"></label>
      <div class="days">${DAYS.map((d, i) => `
        <label class="day-toggle"><input type="checkbox" name="day" value="${i + 1}" ${days.has(i + 1) ? 'checked' : ''}><span>${d}</span></label>`).join('')}
      </div>
      <label>Le toca a
        <select name="assigned">
          <option value="">Libre (quien llegue primero)</option>
          ${S.data.members.map((m) => `<option value="${m.id}" ${t?.assigned_to === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
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
    <input name="link" required placeholder="Pega aquí el enlace de la casa" aria-label="Enlace de la casa">
    <button class="btn">Añadir</button>
  </form>`;

const seg = (name, value, options) => `
  <div class="seg" role="radiogroup">${options.map(([v, label]) =>
    `<button role="radio" aria-checked="${value === v}" data-action="pref" data-pref="${name}" data-value="${v}">${label}</button>`).join('')}
  </div>`;

function viewAjustes() {
  const me = member(S.data.me);
  const { theme = 'auto', size = 'normal' } = store.prefs || {};
  const recurring = S.data.tasks.filter((t) => !t.once_on);
  const onces = S.data.tasks.filter((t) => t.once_on && !t.once_done_on);
  const tasks = recurring.map((t) => S.editing === t.id ? taskForm(t) : `
    <button class="task-line" data-action="edit" data-task="${t.id}">
      <span>${esc(t.emoji)} ${esc(t.name)}</span>
      <span class="muted small">${t.points} pt · ${t.days.length === 7 ? 'diaria' : t.days.map((d) => DAYS[d - 1]).join(' ')}</span>
    </button>`).join('');
  const houses = Object.entries(store.houses).filter(([slug, h]) => slug !== S.slug && h.token);

  return `
    <h2>Aspecto en este móvil</h2>
    <div class="card settings">
      <div class="setting"><span>Tema</span>${seg('theme', theme, [['auto', 'Auto'], ['light', 'Claro'], ['dark', 'Oscuro']])}</div>
      <div class="setting"><span>Letra</span>${seg('size', size, [['normal', 'Normal'], ['large', 'Grande']])}</div>
    </div>
    <h2>Tareas de ${esc(S.data.house.name)}</h2>
    <div class="card list-lines">
      ${tasks}
      ${S.editing === 'new' ? taskForm(null) : `<button class="btn ghost" data-action="edit" data-task="new">${icon('mas')} Nueva tarea</button>`}
    </div>
    ${hasV2() ? `<h2>Encargos pendientes</h2>
    <div class="card list-lines">
      ${onces.map((t) => `
        <button class="task-line" data-action="once" data-task="${t.id}">
          <span>${esc(t.emoji)} ${esc(t.name)}</span>
          <span class="muted small">${t.points} pt · ${shortDate(t.once_on)}</span>
        </button>`).join('')}
      <button class="btn ghost" data-action="once" data-task="">${icon('mas')} Nuevo encargo</button>
    </div>` : ''}
    <h2>Tu cuenta</h2>
    <form class="card" data-form="pin">
      <div class="mb">${chip(me)}</div>
      <label>PIN actual <input name="old" type="password" inputmode="numeric" pattern="\\d{4,6}" required></label>
      <label>PIN nuevo <input name="new" type="password" inputmode="numeric" pattern="\\d{4,6}" required></label>
      <button class="btn">Cambiar PIN</button>
    </form>
    ${houses.length ? `<h2>Otras casas</h2><div class="card">${houses.map(([slug, h]) =>
      `<button class="btn ghost" data-action="switch" data-slug="${esc(slug)}">${esc(h.name || 'Casa')}</button>`).join('')}</div>` : ''}
    <h2>Añadir otra casa</h2>
    <div class="card">${addHouseForm()}</div>
    <div class="card">
      <button class="btn ghost" data-action="share">Copiar enlace de esta casa</button>
      <button class="btn ghost danger" data-action="logout">Cerrar sesión</button>
    </div>`;
}

// ─── Paneles ─────────────────────────────────────────────────────────────────

function peopleSheet() {
  const { task: id, day, selected } = S.sheet;
  const t = S.data.tasks.find((x) => x.id === id);
  if (!t) return '';
  const c = doneFor(id, day);
  const owner = c ? c.member_id : S.data.me;
  const inGroup = c ? people(c).includes(S.data.me) : true;
  const base = c ? c.points - (c.covered ? 1 : 0) : t.points;
  const n = selected.size;
  const covers = t.assigned_to && !selected.has(t.assigned_to);
  const total = base + (covers ? 1 : 0);
  const rows = S.data.members.map((m) => {
    const on = selected.has(m.id);
    const locked = m.id === owner || (!inGroup && m.id !== S.data.me);
    return `
      <button class="person ${on ? 'on' : ''}" data-action="person" data-member="${m.id}" aria-pressed="${on}" ${locked ? 'disabled' : ''}>
        ${avatar(m)}<span class="person-name">${esc(m.name)}${m.id === owner ? ' <span class="muted small">· la marca</span>' : ''}</span>
        <span class="check"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 12.5 3.8 3.8 7.2-8"/></svg></span>
      </button>`;
  }).join('');
  return `
    <h3><span>${esc(t.emoji)}</span> ${esc(t.name)}</h3>
    <p class="muted">¿Quién ${c ? 'la ha hecho' : 'la hace'}?</p>
    <div class="people">${rows}</div>
    <p class="split">${n > 1 ? `${pts(total)} pt entre ${n}: <strong>${pts(total / n)} pt para cada uno</strong>` : `<strong>${pts(total)} pt</strong> para quien la hace`}</p>
    <div class="sheet-actions">
      ${!c ? `<button class="btn ghost" data-action="ask-help">${icon('chat')} Pedir ayuda en el chat</button>` : ''}
      <button class="btn" data-action="people-save">${c ? 'Guardar' : 'Marcar como hecha'}</button>
    </div>`;
}

function onceSheet() {
  const t = S.data.tasks.find((x) => x.id === S.sheet.id);
  return `
    <h3>${t ? 'Editar encargo' : 'Nuevo encargo'}</h3>
    <p class="muted">Algo de una sola vez, como llamar al del gas. Sigue en la lista hasta que alguien lo haga.</p>
    <form data-form="once" data-id="${t?.id || ''}">
      <div class="form-row">
        <input name="emoji" class="emoji-input" maxlength="4" value="${esc(t?.emoji || '📌')}" aria-label="Emoji">
        <input name="name" required maxlength="40" placeholder="¿Qué hay que hacer?" value="${esc(t?.name || '')}" aria-label="Nombre">
      </div>
      <div class="form-2">
        <label>Desde el día <input name="date" type="date" required value="${esc(t?.once_on || S.today)}"></label>
        <label>Puntos <input name="points" type="number" min="1" max="20" value="${t?.points || 2}"></label>
      </div>
      <label>Le toca a
        <select name="assigned">
          <option value="">Libre (quien llegue primero)</option>
          ${S.data.members.map((m) => `<option value="${m.id}" ${t?.assigned_to === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
        </select>
      </label>
      <div class="sheet-actions">
        ${t ? '<button type="button" class="btn ghost danger" data-action="archive-once">Quitar</button>' : ''}
        <button class="btn">Guardar</button>
      </div>
    </form>`;
}

function sheetMarkup(animate) {
  if (!S.sheet) return '';
  const body = S.sheet.type === 'people' ? peopleSheet() : onceSheet();
  return `
    <div class="scrim ${animate ? 'anim' : ''}" data-action="sheet-close"></div>
    <div class="sheet ${animate ? 'anim' : ''}" role="dialog" aria-modal="true">
      <button class="icon-btn sheet-x" data-action="sheet-close" aria-label="Cerrar">${icon('cruz')}</button>
      ${body}
    </div>`;
}

function paintSheet(animate = false) {
  const root = document.getElementById('sheet-root');
  if (!root) return;
  const y = root.querySelector('.sheet')?.scrollTop ?? 0;
  root.innerHTML = sheetMarkup(animate);
  const sheet = root.querySelector('.sheet');
  if (sheet) sheet.scrollTop = y;
  document.body.classList.toggle('locked', !!S.sheet);
  if (animate && sheet) (sheet.querySelector('input[name=name]') || sheet.querySelector('.sheet-x')).focus();
}

// ─── Pintado ─────────────────────────────────────────────────────────────────

const VIEWS = {
  hoy: ['hoy', 'Hoy', viewHoy],
  semana: ['semana', 'Semana', viewSemana],
  compra: ['compra', 'Compra', viewCompra, true],
  chat: ['chat', 'Chat', viewChat, true],
  puntos: ['puntos', 'Puntos', viewPuntos],
  ajustes: ['ajustes', 'Ajustes', viewAjustes],
};
const TITLES = { semana: 'La semana', compra: 'Lista de la compra', chat: 'Chat de casa', puntos: 'Puntos', ajustes: 'Ajustes' };

function tabsMarkup() {
  return Object.entries(VIEWS).filter(([, v]) => !v[3] || hasV2()).map(([k, [ic, name]]) => {
    const n = k === 'chat' ? S.data.unread : 0;
    return `<button data-action="view" data-view="${k}" class="${S.view === k ? 'active' : ''} ${k === 'ajustes' ? 'only-wide' : ''}" ${S.view === k ? 'aria-current="page"' : ''}>
      ${icon(ic)}<span class="tab-label">${name}</span>${n ? `<span class="badge" aria-label="${n} sin leer">${n > 9 ? '9+' : n}</span>` : ''}</button>`;
  }).join('');
}

function syncBadge() {
  if (!S.data) return;
  const n = S.data.unread || 0;
  if ('setAppBadge' in navigator) (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}

function render(enter = false) {
  if (!S.data) return;
  if (VIEWS[S.view][3] && !hasV2()) S.view = 'hoy';
  setCasa(S.data.house.name);
  const me = member(S.data.me);
  const others = Object.entries(store.houses).filter(([slug, h]) => slug !== S.slug && h.token);
  const title = TITLES[S.view];
  $app.dataset.view = S.view;
  $app.innerHTML = `
    <nav class="tabs" aria-label="Secciones">
      <div class="rail-brand">${LOGO}<span>Faenas</span></div>
      ${tabsMarkup()}
    </nav>
    <div class="page">
      <header class="top">
        <div class="top-title">
          <span class="brand">${esc(S.data.house.name)}</span>
          ${title ? `<h1>${title}</h1>` : '<h1>Faenas</h1>'}
        </div>
        <div class="top-right">
          ${others.length ? `<button class="icon-btn" data-action="switch" data-slug="${esc(others[0][0])}" title="Ir a ${esc(others[0][1].name || 'otra casa')}" aria-label="Ir a ${esc(others[0][1].name || 'otra casa')}">${icon('cambiar')}</button>` : ''}
          <button class="me-btn" data-action="view" data-view="ajustes" aria-label="Ajustes">${avatar(me)}</button>
        </div>
      </header>
      ${S.offline ? '<p class="offline">Sin conexión: estás viendo la última copia.</p>' : ''}
      <main class="${enter ? 'enter' : ''}">${VIEWS[S.view][2]()}</main>
    </div>
    <div id="sheet-root">${sheetMarkup(false)}</div>`;
  const ring = $app.querySelector('.ring-value');
  if (ring) requestAnimationFrame(() => requestAnimationFrame(() => ring.setAttribute('stroke-dashoffset', ring.dataset.to)));
  syncBadge();
}

// Lo que cambia solo por datos: en Compra y Chat no se toca el cuadro de texto ni el teclado.
function paint() {
  const tabs = $app.querySelector('.tabs');
  if (S.view === 'compra' && document.getElementById('shop-lists')) {
    document.getElementById('shop-lists').innerHTML = shopLists();
  } else if (S.view === 'chat' && document.getElementById('chat-list')) {
    document.getElementById('chat-list').innerHTML = chatList();
  } else return render();
  if (tabs) tabs.innerHTML = `<div class="rail-brand">${LOGO}<span>Faenas</span></div>${tabsMarkup()}`;
  syncBadge();
}

// ─── Entrada ─────────────────────────────────────────────────────────────────

function renderLogin() {
  const L = S.login;
  setCasa(L?.house);
  if (!S.slug || !L) {
    const known = Object.entries(store.houses);
    $app.innerHTML = `
      <div class="login">
        ${LOGO}<h1>Faenas</h1>
        <p class="muted">La casa, entre todos. Abre el enlace de tu casa para entrar.</p>
        ${known.map(([slug, h]) => `<button class="btn" data-action="switch" data-slug="${esc(slug)}">${esc(h.name || slug)}</button>`).join('')}
        ${addHouseForm()}
      </div>`;
    return;
  }
  const sel = L.members.find((m) => m.id === L.selected);
  $app.innerHTML = `
    <div class="login">
      ${LOGO}<span class="brand">Faenas</span><h1>${esc(L.house)}</h1>
      ${!sel ? `<p class="muted">¿Quién eres?</p>
        <div class="who">${L.members.map((m) => `
          <button class="who-btn" data-action="pick" data-member="${m.id}" style="--c:${esc(m.color)}">
            ${avatar(m, 'lg')}${esc(m.name)}</button>`).join('')}</div>`
      : `<p>${sel.has_pin ? `Hola, ${esc(sel.name)}. Tu PIN:` : `Te damos la bienvenida, ${esc(sel.name)}. Crea tu PIN (4 a 6 números) y apúntatelo en la cabeza.`}</p>
        <form data-form="login" class="pin-form">
          <input name="pin" type="password" inputmode="numeric" autocomplete="off" pattern="\\d{4,6}" maxlength="6" required autofocus aria-label="PIN">
          <button class="btn">${sel.has_pin ? 'Entrar' : 'Crear PIN y entrar'}</button>
          <button type="button" class="btn ghost" data-action="pick" data-member="">No soy yo</button>
        </form>`}
    </div>`;
  $app.querySelector('input[name=pin]')?.focus();
}

async function start() {
  if (S.slug && !store.houses[S.slug]) { store.houses[S.slug] = {}; saveStore(); }
  if (S.slug && token()) {
    try { await refresh(); render(true); return; } catch (e) {
      if (token()) {
        const copy = store.houses[S.slug].snapshot;
        if (copy) { S.data = copy; S.offline = true; render(true); }
        toast(e.message);
        return;
      }
    }
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
  S.gen++;
  try { await fn(); } catch (e) { toast(e.message); if (!token()) { resetHouse(); start(); } } finally { S.busy = false; S.gen++; }
}

// La compra se marca al momento y se guarda detrás, en orden: en el súper no hay que esperar a nadie.
let ops = Promise.resolve();
let opsPending = 0;
function mutate(local, remote) {
  local();
  paint();
  S.gen++;
  opsPending++;
  ops = ops.then(remote).catch((e) => toast(e.message)).then(async () => {
    S.gen++;
    if (--opsPending === 0) { try { if (await refresh(S.gen)) paint(); } catch { /* el siguiente refresco lo arregla */ } }
  });
}

function addShopping(name) {
  const clean = name.trim();
  if (!clean) return;
  mutate(() => {
    const same = S.data.shopping.find((i) => i.name.toLowerCase() === clean.toLowerCase());
    if (same) { same.bought = false; same.bought_by = null; }
    else S.data.shopping.push({ id: `tmp-${Date.now()}`, name: clean, added_by: S.data.me, bought_by: null, bought: false });
    S.data.suggestions = (S.data.suggestions || []).filter((n) => n.toLowerCase() !== clean.toLowerCase());
  }, () => rpc('add_shopping', { p_token: token(), p_name: clean }));
}

function celebrate() {
  const box = document.createElement('div');
  box.className = 'confetti';
  box.setAttribute('aria-hidden', 'true');
  const colors = ['var(--accent)', '#d9a441', '#2f8f6a', '#c45a3c'];
  box.innerHTML = [...Array(18)].map((_, i) =>
    `<i style="left:${5 + Math.random() * 90}%;background:${colors[i % 4]};animation-delay:${Math.random() * .25}s;--r:${Math.random() * 300 - 150}deg"></i>`).join('');
  document.body.append(box);
  setTimeout(() => box.remove(), 1800);
}

function openChatWith(text) {
  S.sheet = null;
  document.body.classList.remove('locked');
  S.draft = text;
  goTo('chat');
  setTimeout(() => {
    const input = document.getElementById('chat-input');
    if (input) { input.focus(); input.setSelectionRange(text.length, text.length); autoGrow(input); }
  }, 60);
}

function goTo(view) {
  S.view = view;
  S.editing = null;
  if (view === 'chat') {
    S.chat = null;
    render(true);
    window.scrollTo(0, 0);
    loadChat().catch((e) => toast(e.message));
  } else {
    render(true);
    window.scrollTo(0, 0);
    poll();
  }
}

const autoGrow = (el) => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px`; };

$app.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const d = el.dataset;
  switch (d.action) {
    case 'view': goTo(d.view); break;
    case 'day': S.day = addDays(S.day, +d.n); S.ring = null; render(true); break;
    case 'week': S.week = addDays(S.week, +d.n); act(async () => { await refresh(); render(); }); break;
    case 'weektab': S.weekTab = d.tab; render(true); break;
    case 'month': S.month = addMonths(S.month, +d.n); act(async () => { await refresh(); render(); }); break;
    case 'toggle': {
      if (S.offline) { toast('Sin conexión: de momento solo se puede mirar.'); break; }
      const c = doneFor(d.task, S.day);
      if (c && c.member_id !== S.data.me) {
        if (hasV2()) openPeople(d.task); else toast(`Ya la hizo ${member(c.member_id)?.name}. Llegas tarde.`);
        break;
      }
      const row = el.closest('.task');
      if (!c) row.classList.add('just', 'done');
      else row.classList.remove('done');
      const day = S.day, wasPending = tasksFor(day).some((t) => !doneFor(t.id, day));
      act(async () => {
        const [r] = await Promise.all([rpc('toggle_task', { p_token: token(), p_task: d.task, p_date: day }), sleep(c ? 0 : 520)]);
        await refresh(); render();
        if (r.done) {
          const allDone = !tasksFor(day).some((t) => !doneFor(t.id, day));
          if (allDone && wasPending) celebrate();
          const task = d.task;
          toast(allDone ? 'Todo hecho. La casa os lo agradece.' : pick(['Hecho.', 'Impecable.', 'Un paso más cerca de la gloria.', 'Esto ya no te lo quita nadie.']),
            hasV2() && S.data.members.length > 1 ? { label: '¿Entre varios?', fn: () => openPeople(task) } : null);
        }
      });
      break;
    }
    case 'people': openPeople(d.task); break;
    case 'person': {
      const set = S.sheet.selected;
      if (set.has(d.member)) set.delete(d.member); else set.add(d.member);
      paintSheet();
      break;
    }
    case 'people-save': savePeople(); break;
    case 'ask-help': {
      const t = S.data.tasks.find((x) => x.id === S.sheet.task);
      const when = S.sheet.day === S.today ? 'hoy' : `del ${shortDate(S.sheet.day)}`;
      openChatWith(`¿Alguien puede con ${t.emoji} ${t.name} ${when}?`);
      break;
    }
    case 'once': S.sheet = { type: 'once', id: d.task || null }; paintSheet(true); break;
    case 'archive-once': {
      const id = S.sheet.id;
      if (!confirm('¿Quitar este encargo?')) break;
      act(async () => { await rpc('archive_task', { p_token: token(), p_id: id }); closeSheet(); await refresh(); render(); });
      break;
    }
    case 'sheet-close': closeSheet(); break;
    case 'avail': {
      const on = el.getAttribute('aria-pressed') !== 'true';
      el.classList.toggle('on', on);
      act(async () => {
        await rpc('set_availability', { p_token: token(), p_dow: +d.dow, p_slot: d.slot, p_available: on });
        await refresh(); render();
      });
      break;
    }
    case 'pref': {
      store.prefs = { ...store.prefs, [d.pref]: d.value };
      saveStore(); applyPrefs(); render();
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
    case 'shop-add': addShopping(d.name); break;
    case 'shop-toggle': {
      if (d.id.startsWith('tmp-')) break;   // aún guardándose
      mutate(() => {
        const i = S.data.shopping.find((x) => x.id === d.id);
        if (i) { i.bought = !i.bought; i.bought_by = i.bought ? S.data.me : null; }
      }, () => rpc('toggle_shopping', { p_token: token(), p_id: d.id }));
      break;
    }
    case 'shop-remove': {
      if (d.id.startsWith('tmp-')) break;
      mutate(() => { S.data.shopping = S.data.shopping.filter((x) => x.id !== d.id); },
        () => rpc('remove_shopping', { p_token: token(), p_id: d.id }));
      break;
    }
    case 'shop-clear':
      mutate(() => { S.data.shopping = S.data.shopping.filter((x) => !x.bought); },
        () => rpc('clear_bought', { p_token: token() }));
      break;
    case 'shop-share': {
      const lines = S.data.shopping.filter((i) => !i.bought).map((i) => `- ${i.name}`);
      if (!lines.length) { toast('La lista está vacía.'); break; }
      const text = `Lista de la compra\n${lines.join('\n')}`;
      if (navigator.share) navigator.share({ text }).catch(() => {});
      else navigator.clipboard?.writeText(text).then(() => toast('Lista copiada.'), () => prompt('Copia la lista:', text));
      break;
    }
    case 'quick': {
      const input = document.getElementById('chat-input');
      S.draft = d.text; input.value = d.text; input.focus();
      break;
    }
    case 'msg-delete': {
      if (!confirm('¿Borrar este mensaje?')) break;
      S.chat = S.chat.filter((g) => g.id !== d.id);
      paint();
      rpc('delete_message', { p_token: token(), p_id: d.id }).catch((e) => toast(e.message));
      break;
    }
    case 'pick': S.login.selected = d.member || null; renderLogin(); break;
    case 'switch': {
      S.slug = d.slug; store.last = d.slug; saveStore();
      history.replaceState(null, '', `?casa=${encodeURIComponent(d.slug)}`);
      resetHouse();
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

function openPeople(taskId) {
  if (S.offline) { toast('Sin conexión: de momento solo se puede mirar.'); return; }
  const c = doneFor(taskId, S.day);
  S.sheet = { type: 'people', task: taskId, day: S.day, selected: new Set(c ? people(c) : [S.data.me]) };
  paintSheet(true);
}

function closeSheet() {
  S.sheet = null;
  paintSheet();
}

function savePeople() {
  const { task, day, selected } = S.sheet;
  const c = doneFor(task, day);
  const owner = c ? c.member_id : S.data.me;
  const helpers = [...selected].filter((id) => id !== owner);
  act(async () => {
    // Refresca tras marcar: si lo siguiente falla, reintentar no debe desmarcarla.
    if (!c) { await rpc('toggle_task', { p_token: token(), p_task: task, p_date: day }); await refresh(); }
    await rpc('set_helpers', { p_token: token(), p_task: task, p_date: day, p_members: helpers });
    closeSheet();
    await refresh(); render();
    toast(helpers.length ? 'Puntos repartidos. Aquí nadie se queda sin lo suyo.' : 'Guardado.');
  });
}

$app.addEventListener('input', (ev) => {
  if (ev.target.id === 'chat-input') { S.draft = ev.target.value; autoGrow(ev.target); }
});

$app.addEventListener('keydown', (ev) => {
  // En ordenador, Intro envía; en el móvil, Intro es salto de línea y se envía con el botón.
  if (ev.target.id === 'chat-input' && ev.key === 'Enter' && !ev.shiftKey && matchMedia('(pointer: fine)').matches) {
    ev.preventDefault();
    sendChat(ev.target);
  }
});

document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && S.sheet) closeSheet(); });

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
        await refresh(); render(true);
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
    case 'once':
      act(async () => {
        await rpc('upsert_once', {
          p_token: token(), p_id: form.dataset.id || null, p_name: f.get('name'), p_emoji: f.get('emoji'),
          p_points: +f.get('points'), p_date: f.get('date'), p_assigned: f.get('assigned') || null,
        });
        closeSheet(); await refresh(); render(); toast('Encargo apuntado.');
      });
      break;
    case 'shop': {
      const input = form.elements.name;
      addShopping(input.value);
      input.value = '';
      input.focus();
      break;
    }
    case 'chat': sendChat(form.elements.body); break;
    case 'prize':
      act(async () => { await rpc('set_prize', { p_token: token(), p_prize: f.get('prize') }); await refresh(); render(); toast('Premio guardado.'); });
      break;
    case 'addhouse': {
      const raw = String(f.get('link')).trim();
      let slug = raw;
      try { slug = new URL(raw).searchParams.get('casa') || raw; } catch { /* han pegado solo el código */ }
      S.slug = slug; store.last = slug; saveStore();
      history.replaceState(null, '', `?casa=${encodeURIComponent(slug)}`);
      resetHouse();
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
  if (document.visibilityState !== 'visible' || !token() || S.editing || S.sheet || S.busy || opsPending) return;
  if (!S.data && !S.login) return start();
  if (!S.data) return;
  const active = document.activeElement;
  if (active?.matches('input, select, textarea') && !['shop-input', 'chat-input'].includes(active.id)) return;
  const gen = S.gen;
  try { if (await refresh(gen)) paint(); } catch { if (!token()) { resetHouse(); start(); } }
}
setInterval(poll, 20000);
setInterval(pollChat, 5000);
document.addEventListener('visibilitychange', () => { poll(); pollChat(); });

// El teclado del móvil no debe tapar el cuadro del chat.
if (window.visualViewport) {
  const onViewport = () => {
    const kb = Math.max(0, innerHeight - visualViewport.height - visualViewport.offsetTop);
    document.documentElement.style.setProperty('--kb', `${kb}px`);
    document.body.classList.toggle('kb', kb > 80);
  };
  visualViewport.addEventListener('resize', onViewport);
  visualViewport.addEventListener('scroll', onViewport);
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

start();
