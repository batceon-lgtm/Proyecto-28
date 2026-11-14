const app = document.querySelector('#app');
const state = { role: 'guest', view: 'dashboard' };
const auth = { user: null, mode: 'guest' };
let countdownTimer = null;
const supabaseClient = window.supabase?.createClient(window.SUPABASE_URL, window.SUPABASE_PUBLISHABLE_KEY);
const adminDirectory = {
  'al.t_creo': { name: 'Alexander', email: 'al.t_creo@proyecto28.local' },
  'broncano78': { name: 'Fabián', email: 'broncano78@proyecto28.local' },
  'cabezon12': { name: 'Carlos', email: 'cabezon12@proyecto28.local' },
  'ninhoviejo22': { name: 'Guillermo', email: 'ninhoviejo22@proyecto28.local' }
};
// Las cuentas reales deben validarse en un backend. Nunca se publican
// contraseñas ni hashes en este frontend público.
const adminUsers = [];

const adminNav = [
  ['dashboard','◈','Dashboard'], ['guests','♧','Invitados'], ['budget','₡','Caja / presupuesto'], ['tasks','✓','Tareas'], ['music','♫','Música'], ['content','♡','Contenido']
];

function layout() {
  if (!auth.user) { app.innerHTML = authView(); bindAuth(); return; }
  const admin = state.role === 'admin';
  app.innerHTML = `<div class="shell">
    <aside class="sidebar"><div class="brand">Celebración<span>Portal del evento</span></div>
      <nav class="nav">${admin ? adminNav.map(([id,icon,label])=>`<button class="${state.view===id?'active':''}" data-view="${id}">${icon} &nbsp; ${label}</button>`).join('') : `<button class="active">⌂ &nbsp; Mi invitación</button><button data-view="guest-songs">♫ &nbsp; Música</button><button data-view="guest-wall">♡ &nbsp; Dedicatorias</button>`}</nav>
      <div class="sidebar-footer">Fiesta de cumpleaños<br><span>Configuración del evento</span></div>
    </aside><main class="main"><header class="topbar"><div><div class="eyebrow">${admin ? 'Área privada' : 'Área de invitados'}</div><strong>${admin ? 'Organización del evento' : 'Te esperamos'}</strong></div><div class="profile"><span>${auth.user.name || ''}</span><button class="btn ghost" id="switch-role">Cerrar sesión</button><span class="avatar">${admin ? 'AD' : 'IN'}</span></div></header>
    <section class="content">${admin ? adminView() : guestView()}</section></main></div><div class="toast" id="toast"></div>`;
  app.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => { state.view = btn.dataset.view; layout(); }));
  if (!admin) prepareLocationPlaceholders();
  document.querySelector('#switch-role').addEventListener('click', async () => { if (state.role === 'admin' && supabaseClient) await supabaseClient.auth.signOut(); auth.user = null; state.role='guest'; state.view='dashboard'; layout(); });
  app.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', () => toast(btn.dataset.action)));
  const confirmButton = app.querySelector('[data-confirm-attendance]');
  if (confirmButton) confirmButton.addEventListener('click', () => document.querySelector('#attendance-modal')?.classList.add('open'));
  const locationButton = app.querySelector('[data-location-jump]');
  if (locationButton) locationButton.addEventListener('click', () => document.querySelector('#event-location')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  const closeModal = app.querySelector('[data-close-attendance]');
  if (closeModal) closeModal.addEventListener('click', () => document.querySelector('#attendance-modal')?.classList.remove('open'));
  const attendanceForm = app.querySelector('#attendance-form');
  if (attendanceForm) attendanceForm.addEventListener('submit', async e => {
    e.preventDefault();
    const attending = new FormData(attendanceForm).get('attending') === 'yes';
    const button = attendanceForm.querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = 'Guardando...';
    let error = null;
    if (supabaseClient) ({ error } = await supabaseClient.rpc('confirm_guest_attendance', { p_name: auth.user.name, p_attending: attending }));
    else localStorage.setItem('guestAttendance_' + auth.user.name.toLowerCase(), JSON.stringify({ name: auth.user.name, attending }));
    button.disabled = false; button.textContent = 'Guardar respuesta';
    if (error) { toast('No se pudo guardar la confirmación. Ejecuta el SQL actualizado.'); return; }
    document.querySelector('#attendance-modal')?.classList.remove('open');
    toast(attending ? 'Asistencia confirmada' : 'Respuesta guardada');
  });
  if (!admin) startCountdown();
  if (admin) loadAttendanceSummary();
  if (admin && state.view === 'guests') loadGuestList();
}

async function loadAttendanceSummary() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient.rpc('get_attendance_summary');
  if (error || !data) return;
  const confirmed = document.querySelector('#confirmed-count');
  const declined = document.querySelector('#declined-count');
  if (confirmed) confirmed.textContent = data.confirmed ?? 0;
  if (declined) declined.textContent = data.declined ?? 0;
}

async function loadGuestList() {
  const body = document.querySelector('#guest-table-body');
  if (!body || !supabaseClient) return;
  const { data, error } = await supabaseClient.rpc('list_guests');
  if (error) { body.innerHTML = '<tr><td colspan="4">No se pudo cargar la lista.</td></tr>'; return; }
  const guests = Array.isArray(data) ? data : [];
  const total = document.querySelector('#guest-total');
  const confirmed = document.querySelector('#guest-confirmed');
  const pending = document.querySelector('#guest-pending');
  const declined = document.querySelector('#guest-declined');
  if (total) total.textContent = guests.length;
  if (confirmed) confirmed.textContent = guests.filter(g => g.attending === true).length;
  if (pending) pending.textContent = guests.filter(g => g.attending === null).length;
  if (declined) declined.textContent = guests.filter(g => g.attending === false).length;
  body.innerHTML = guests.length ? guests.map(guest => `<tr><td><strong>${guest.name}</strong></td><td>Invitado</td><td>0</td><td><span class="pill ${guest.attending === false ? 'warn' : ''}">${guest.attending === true ? 'Confirmado' : guest.attending === false ? 'No asistirá' : 'Pendiente'}</span></td></tr>`).join('') : '<tr><td colspan="4">Todavía no hay invitados registrados.</td></tr>';
}

function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  const target = new Date('2026-11-28T18:00:00-05:00').getTime();
  const update = () => {
    const remaining = Math.max(0, target - Date.now());
    const totalSeconds = Math.floor(remaining / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const set = (name, value) => { const node = document.querySelector(`[data-countdown="${name}"]`); if (node) node.textContent = String(value).padStart(2, '0'); };
    set('days', days); set('hours', hours); set('minutes', minutes); set('seconds', seconds);
    if (remaining === 0) clearInterval(countdownTimer);
  };
  update();
  countdownTimer = setInterval(update, 1000);
}

function authView() { return `<div class="auth-screen"><div class="auth-card"><div class="brand auth-brand">Celebración<span>Portal del evento</span></div><div class="auth-tabs"><button class="${auth.mode==='guest'?'selected':''}" data-auth-mode="guest">Invitado</button><button class="${auth.mode==='admin'?'selected':''}" data-auth-mode="admin">Administrador</button></div>${auth.mode==='guest' ? `<div class="eyebrow">Acceso de invitado</div><h1>Tu invitación empieza aquí.</h1><p class="sub">Regístrate una sola vez con tu nombre para confirmar tu asistencia y participar.</p><form id="guest-form" class="auth-form"><label>Nombre completo<input name="guestName" required maxlength="80" placeholder="Ej. María Fernanda" /></label><button class="btn">Entrar como invitado</button></form><p class="auth-note">Cada nombre solo puede registrarse una vez.</p>` : `<div class="eyebrow">Acceso privado</div><h1>Panel de administración</h1><p class="sub">Ingresa con tu usuario y contraseña.</p><form id="admin-form" class="auth-form"><label>Usuario<input name="username" required autocomplete="username" /></label><label>Contraseña<input name="password" type="password" required autocomplete="current-password" /></label><button class="btn">Ingresar</button></form><p id="auth-error" class="auth-error"></p>`}</div></div>`; }

function bindAuth() {
  app.querySelectorAll('[data-auth-mode]').forEach(btn => btn.addEventListener('click', () => { auth.mode=btn.dataset.authMode; layout(); }));
  const guestForm = document.querySelector('#guest-form');
  if (guestForm) guestForm.addEventListener('submit', async e => { e.preventDefault(); const name = new FormData(guestForm).get('guestName').trim(); if (!name) return; const button = guestForm.querySelector('button'); button.disabled = true; button.textContent = 'Guardando...'; if (supabaseClient) { const { error } = await supabaseClient.rpc('register_guest', { p_name: name }); if (error) { button.disabled = false; button.textContent = 'Entrar como invitado'; alert('No se pudo guardar el invitado. Ejecuta la configuración SQL de Supabase.'); return; } } else { const names = JSON.parse(localStorage.getItem('eventGuestNames') || '[]'); if (!names.some(n => n.toLowerCase() === name.toLowerCase())) { names.push(name); localStorage.setItem('eventGuestNames', JSON.stringify(names)); } } auth.user={name, role:'guest'}; state.role='guest'; layout(); });
  const adminForm = document.querySelector('#admin-form');
  if (adminForm) adminForm.addEventListener('submit', async e => { e.preventDefault(); const data = new FormData(adminForm); const username = String(data.get('username')).trim().toLowerCase(); const record = adminDirectory[username]; if (!record || !supabaseClient) { document.querySelector('#auth-error').textContent='La autenticación todavía no está configurada.'; return; } const { data: result, error } = await supabaseClient.auth.signInWithPassword({ email: record.email, password: data.get('password') }); if (error) { const message = error.message?.toLowerCase().includes('email not confirmed') ? 'La cuenta existe, pero debes activar la confirmación automática en Supabase.' : 'Usuario o contraseña incorrectos. Verifica que la cuenta use el correo interno indicado y que la contraseña coincida.'; document.querySelector('#auth-error').textContent=message; return; } auth.user={name:record.name, username, role:'admin', id:result.user.id}; state.role='admin'; state.view='dashboard'; layout(); });
}

function adminView() {
  const views = { dashboard: dashboard, guests: guests, budget: budget, tasks: tasks, music: music, content: content };
  return `<div class="view active">${(views[state.view] || dashboard)()}</div>`;
}

function dashboard() { return `<div class="hero"><div class="hero-copy"><div class="eyebrow">Resumen del evento · 28 de noviembre, 2026</div><h1>Una celebración que se organiza con calma.</h1><p class="sub">Todo lo importante del cumpleaños, en un solo lugar. Revisa avances, presupuesto y confirmaciones.</p><div class="actions"><button class="btn" data-action="Evento actualizado">Editar evento</button><button class="btn secondary" data-action="Invitación copiada">Compartir invitación</button></div></div></div><div class="grid stats"><div class="card stat"><div class="label">Confirmados</div><div class="value" id="confirmed-count">0</div><div class="trend">Respuestas afirmativas</div></div><div class="card stat"><div class="label">No asistirán</div><div class="value" id="declined-count">0</div><div class="trend">Respuestas negativas</div></div><div class="card stat"><div class="label">Canciones</div><div class="value">24</div><div class="trend">8 pendientes de revisar</div></div><div class="card stat"><div class="label">Tareas abiertas</div><div class="value">7</div><div class="trend">3 vencen esta semana</div></div></div><div class="grid two"><div class="card"><div class="section-head"><h2>Próximas tareas</h2><small>Ver todas</small></div><div class="event-list"><div class="event-row"><div class="date-box">18<br><small>NOV</small></div><div class="row-main"><strong>Confirmar menú con catering</strong><span>Responsable: Ana · vence hoy</span></div><span class="pill warn">Urgente</span></div><div class="event-row"><div class="date-box">20<br><small>NOV</small></div><div class="row-main"><strong>Revisar playlist de la fiesta</strong><span>Responsable: Diego</span></div><span class="pill">En curso</span></div><div class="event-row"><div class="date-box">22<br><small>NOV</small></div><div class="row-main"><strong>Comprar decoración</strong><span>Responsable: Ana</span></div><span class="pill">Pendiente</span></div></div></div>${budgetCard()}</div>`; }
function budgetCard() { return `<div class="card"><div class="section-head"><h2>Caja</h2><button class="btn ghost" data-view="budget">Abrir</button></div><div class="money">S/ 1,760 <span>disponible</span></div><div class="progress"><i style="width:65%"></i></div><small style="color:var(--muted)">S/ 3,240 gastado de S/ 5,000</small><div class="event-list" style="margin-top:18px"><div class="event-row"><div class="row-main"><strong>Comida y bebidas</strong><span>S/ 1,500</span></div><span>46%</span></div><div class="event-row"><div class="row-main"><strong>Decoración</strong><span>S/ 820</span></div><span>25%</span></div><div class="event-row"><div class="row-main"><strong>Música y local</strong><span>S/ 920</span></div><span>29%</span></div></div></div>`; }
function guests() { return `<div class="section-head"><div><div class="eyebrow">Administración</div><h1>Invitados</h1></div><button class="btn" data-action="Formulario de invitado abierto">+ Agregar invitado</button></div><div class="grid stats"><div class="card stat"><div class="label">Total</div><div class="value" id="guest-total">0</div></div><div class="card stat"><div class="label">Confirmados</div><div class="value" id="guest-confirmed">0</div></div><div class="card stat"><div class="label">Pendientes</div><div class="value" id="guest-pending">0</div></div><div class="card stat"><div class="label">Rechazaron</div><div class="value" id="guest-declined">0</div></div></div><div class="card" style="margin-top:24px"><div class="section-head"><h2>Lista de invitados</h2><input style="max-width:210px" placeholder="Buscar nombre..." /></div><table class="table"><thead><tr><th>Nombre</th><th>Grupo</th><th>Acompañantes</th><th>Estado</th></tr></thead><tbody id="guest-table-body"><tr><td colspan="4">Cargando invitados...</td></tr></tbody></table></div>`; }
function budget() { return `<div class="section-head"><div><div class="eyebrow">Finanzas del evento</div><h1>Caja / presupuesto</h1></div><button class="btn" data-action="Nuevo gasto agregado">+ Registrar gasto</button></div><div class="grid stats"><div class="card stat"><div class="label">Presupuesto total</div><div class="value">S/ 5,000</div></div><div class="card stat"><div class="label">Gastos pagados</div><div class="value">S/ 3,240</div></div><div class="card stat"><div class="label">Pendiente de pago</div><div class="value">S/ 780</div></div><div class="card stat"><div class="label">Saldo disponible</div><div class="value">S/ 1,760</div></div></div><div class="card" style="margin-top:24px"><div class="section-head"><h2>Movimientos recientes</h2><select><option>Todas las categorías</option><option>Comida</option><option>Decoración</option></select></div><table class="table"><thead><tr><th>Concepto</th><th>Categoría</th><th>Proveedor</th><th>Estado</th><th>Importe</th></tr></thead><tbody><tr><td><strong>Catering y bebidas</strong><br><small>14 may 2026</small></td><td>Comida</td><td>Sabor & Arte</td><td><span class="pill">Pagado</span></td><td><strong>S/ 1,500</strong></td></tr><tr><td><strong>Arreglo floral</strong><br><small>12 may 2026</small></td><td>Decoración</td><td>Flor Studio</td><td><span class="pill warn">Pendiente</span></td><td><strong>S/ 480</strong></td></tr><tr><td><strong>Alquiler del local</strong><br><small>10 may 2026</small></td><td>Local</td><td>Casa Verde</td><td><span class="pill">Pagado</span></td><td><strong>S/ 920</strong></td></tr></tbody></table></div>`; }
function tasks() { return `<div class="section-head"><div><div class="eyebrow">Organización</div><h1>Lista de tareas</h1></div><button class="btn" data-action="Nueva tarea agregada">+ Nueva tarea</button></div><div class="card"><div class="event-list"><div class="event-row"><span class="pill">En curso</span><div class="row-main"><strong>Confirmar menú con catering</strong><span>Ana · vence hoy</span></div><button class="btn ghost" data-action="Tarea marcada como completada">Completar</button></div><div class="event-row"><span class="pill">Pendiente</span><div class="row-main"><strong>Comprar decoración</strong><span>Ana · 22 mayo</span></div><button class="btn ghost" data-action="Tarea abierta">Abrir</button></div><div class="event-row"><span class="pill warn">Urgente</span><div class="row-main"><strong>Enviar recordatorio a invitados</strong><span>Diego · 19 mayo</span></div><button class="btn ghost" data-action="Recordatorio enviado">Enviar</button></div></div></div>`; }
function music() { return `<div class="section-head"><div><div class="eyebrow">Participación de invitados</div><h1>Sugerencias musicales</h1></div><button class="btn" data-action="Playlist actualizada">Crear playlist</button></div><div class="card"><div class="section-head"><h2>Para revisar</h2><small>8 pendientes</small></div>${[['Dancing Queen','ABBA','12 votos'],['La vida es un carnaval','Celia Cruz','9 votos'],['Vivir mi vida','Marc Anthony','7 votos'],['September','Earth, Wind & Fire','5 votos']].map(s=>`<div class="song"><span class="icon">♫</span><div class="row-main"><strong>${s[0]}</strong><span>${s[1]}</span></div><span>${s[2]}</span><button class="btn ghost" data-action="Canción aprobada">Aprobar</button></div>`).join('')}</div>`; }
function content() { return `<div class="section-head"><div><div class="eyebrow">Comunidad</div><h1>Contenido de invitados</h1></div><button class="btn" data-action="Contenido aprobado">Moderar pendientes</button></div><div class="grid two"><div class="card"><div class="section-head"><h2>Dedicatorias recientes</h2><small>12 publicadas</small></div><p>“Que este nuevo año venga lleno de momentos bonitos y mucha música.”</p><small style="color:var(--muted)">— María Fernanda · hace 2 horas</small><hr style="border:0;border-top:1px solid var(--line);margin:18px 0"><p>“¡A celebrar como se debe! Nos vemos en la pista.”</p><small style="color:var(--muted)">— Diego Ramírez · ayer</small></div><div class="card"><div class="section-head"><h2>Galería</h2><small>24 fotos</small></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">${['#dce8df','#f2dfda','#e8ddc7','#cedbd1','#ead2cc','#d9e4df'].map(c=>`<div style="height:90px;border-radius:10px;background:${c};display:grid;place-items:center;font-size:22px">✦</div>`).join('')}</div></div></div>`; }

function guestView() { return `<div class="guest-hero"><div class="eyebrow">Cumpleaños de Fabián y Alex</div><h1>Nocturnal Fest</h1><p class="sub">Una noche para compartir, disfrutar y vivir experiencias lindas, con buena música, parrilla, piscina y la mejor compañía.</p><div class="countdown"><div><b data-countdown="days">00</b><span>Días</span></div><div><b data-countdown="hours">00</b><span>Horas</span></div><div><b data-countdown="minutes">00</b><span>Minutos</span></div><div><b data-countdown="seconds">00</b><span>Segundos</span></div></div><div class="eyebrow">Chaclacayo · 28 de noviembre de 2026 · 6:00 p. m.</div><div class="actions" style="justify-content:center"><button class="btn" data-confirm-attendance>Confirmar asistencia</button><button class="btn secondary" data-location-jump>Cómo llegar</button></div></div><div id="attendance-modal" class="modal"><div class="modal-card"><button class="modal-close" data-close-attendance>×</button><div class="eyebrow">Confirmación de asistencia</div><h2>¿Vas a acompañarnos?</h2><p class="sub">Invitado: <strong>${auth.user?.name || 'Invitado'}</strong></p><form id="attendance-form" class="attendance-form"><label><input type="radio" name="attending" value="yes" checked /> Sí, asistiré</label><label><input type="radio" name="attending" value="no" /> No podré asistir</label><button class="btn" type="submit">Guardar respuesta</button></form></div></div><section id="event-location" class="location-section"><div class="section-head"><div><div class="eyebrow">Ubicación del evento</div><h2>Casa de Campo Rumi Wasi</h2><p class="sub">Chaclacayo · Lima Este</p></div><a class="btn secondary" href="https://www.google.com/maps/search/?api=1&query=-11.952357292175293,-76.71927642822266" target="_blank" rel="noreferrer">Abrir en Google Maps</a></div><div class="location-grid"><div class="location-sketch"><div class="sketch-label">Lima</div><div class="sketch-road"><span class="road-dot"></span><i></i><span class="road-dot"></span></div><div class="sketch-label destination">Chaclacayo</div><div class="sketch-pin">⌖</div><strong>Casa de Campo Rumi Wasi</strong><small>Coordenadas aproximadas: -11.952357, -76.719276</small></div><div class="route-list"><div class="route-item"><span class="route-icon">🚗</span><div><strong>En taxi o aplicativo</strong><p>Indica “Casa de Campo Rumi Wasi, Chaclacayo” y comparte la ubicación exacta.</p><span class="pill">Precio: consultar según origen</span></div></div><div class="route-item"><span class="route-icon">🚌</span><div><strong>Desde Lima Este</strong><p>Toma un bus hacia Chaclacayo y completa el último tramo en taxi local.</p><span class="pill">Ruta sugerida</span></div></div><div class="route-item"><span class="route-icon">📍</span><div><strong>Antes de salir</strong><p>Revisa el tráfico y calcula tu hora de partida. La entrada será desde las 6:00 p. m.</p></div></div></div></div></section><div class="grid guest-grid"><div class="card"><span class="icon">◉</span><h3>Traer ropa de baño</h3><p class="sub">La piscina estará lista.<br>Ven preparado para mojarte.</p></div><div class="card"><span class="icon">✦</span><h3>Dress code</h3><p class="sub">Retro ochentero + neón<br>Brilla a tu manera.</p></div><div class="card"><span class="icon">♨</span><h3>Habrá parrilla</h3><p class="sub">Recepción · Cena · Música<br>Juegos · Baile · Piscina</p></div></div><div class="grid two"><div class="card"><div class="section-head"><h2>Elige una canción</h2><small>Vota por tus favoritas</small></div>${[['Dancing Queen','ABBA','12'],['La vida es un carnaval','Celia Cruz','9'],['Vivir mi vida','Marc Anthony','7']].map(s=>`<div class="song"><span>♫</span><div class="row-main"><strong>${s[0]}</strong><span>${s[1]}</span></div><button class="vote" data-action="Voto registrado">♡ ${s[2]}</button></div>`).join('')}<div class="actions"><button class="btn ghost" data-action="Sugerencia enviada">+ Sugerir canción</button></div></div><div class="card"><div class="section-head"><h2>Deja una dedicatoria</h2></div><textarea placeholder="Escribe un mensaje para el cumpleañero..."></textarea><div class="actions"><button class="btn" data-action="Dedicatoria publicada">Publicar mensaje</button></div></div></div>`; }
function prepareLocationPlaceholders() {
  const items = document.querySelectorAll('#event-location .route-item');
  const content = [
    ['🗺️', 'Ruta desde Lima', 'Aquí agregaremos el recorrido recomendado, los puntos de referencia y las alternativas de transporte.'],
    ['⏱️', 'Tiempos de transporte', 'Se añadirá el tiempo estimado según el punto de partida de cada invitado.'],
    ['💳', 'Costos aproximados', 'Se incluirán las tarifas orientativas de taxi, bus u otras opciones cuando definamos las rutas.']
  ];
  items.forEach((item, index) => { if (!content[index]) return; const [icon, title, description] = content[index]; item.innerHTML = `<span class="route-icon">${icon}</span><div><strong>${title}</strong><p>${description}</p><span class="pill">Próximamente</span></div>`; });
}
function toast(message) { const el = document.querySelector('#toast'); if (!el) return; el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2200); }
layout();
if (supabaseClient) supabaseClient.auth.getSession().then(({data}) => { if (data.session?.user?.email) { const username = data.session.user.email.split('@')[0]; const record = adminDirectory[username]; if (record) { auth.user={name:record.name, username, role:'admin', id:data.session.user.id}; state.role='admin'; layout(); } } });

