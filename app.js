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
  ['dashboard','◈','Dashboard'], ['guests','♧','Invitados'], ['budget','₡','Caja / presupuesto'], ['tasks','✓','Tareas'], ['music','♫','Música'], ['dedications','♡','Dedicatorias'], ['content','♡','Contenido']
];

function layout() {
  if (!auth.user) { app.innerHTML = authView(); bindAuth(); return; }
  const admin = state.role === 'admin';
  app.innerHTML = `<div class="shell">
    <aside class="sidebar"><div class="brand">Celebración<span>Portal del evento</span></div>
      <nav class="nav">${admin ? adminNav.map(([id,icon,label])=>`<button class="${state.view===id?'active':''}" data-view="${id}">${icon} &nbsp; ${label}</button>`).join('') : `<button class="${state.view==='dashboard'?'active':''}" data-view="dashboard">⌂ &nbsp; Mi invitación</button><button class="${state.view==='guest-songs'?'active':''}" data-view="guest-songs">♫ &nbsp; Música</button><button class="${state.view==='guest-wall'?'active':''}" data-view="guest-wall">♡ &nbsp; Dedicatorias</button>`}</nav>
      <div class="sidebar-footer">Fiesta de cumpleaños<br><span>Configuración del evento</span></div>
    </aside><main class="main"><header class="topbar"><div><div class="eyebrow">${admin ? 'Área privada' : 'Área de invitados'}</div><strong>${admin ? 'Organización del evento' : 'Te esperamos'}</strong></div><div class="profile"><span>${auth.user.name || ''}</span><button class="btn ghost" id="switch-role">Cerrar sesión</button><span class="avatar">${admin ? 'AD' : 'IN'}</span></div></header>
    <section class="content">${admin ? adminView() : guestView()}</section></main></div><div class="toast" id="toast"></div>`;
  app.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => { state.view = btn.dataset.view; layout(); }));
  app.querySelectorAll('[data-scroll]').forEach(btn => btn.addEventListener('click', event => { event.preventDefault(); const target = document.querySelector('#' + btn.dataset.scroll); if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 18, behavior: 'auto' }); }));
  if (!admin) { prepareLocationPlaceholders(); prepareGuestDetails(); if (state.view === 'dashboard') { removeGuestMusicFromHome(); removeGuestDedicationFromHome(); } loadPublicMusic(); if (state.view === 'guest-wall') loadDedications(); }
  if (admin && state.view === 'music') { prepareAdminMusic(); preparePlaylistAdmin(); loadSongSuggestions(); loadPlaylistsAdmin(); }
  if (admin && state.view === 'dashboard') { prepareAdminDashboardDedications(); loadAdminDedications(); }
  if (admin && state.view === 'dedications') loadAdminDedications();
  if (admin && state.view === 'content') { prepareAdminContentDedications(); loadAdminContentDedications(); }
  document.querySelector('#switch-role').addEventListener('click', async () => { if (state.role === 'admin' && supabaseClient) await supabaseClient.auth.signOut(); auth.user = null; state.role='guest'; state.view='dashboard'; layout(); });
  app.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', () => toast(btn.dataset.action)));
  const confirmButton = app.querySelector('[data-confirm-attendance]');
  if (confirmButton) confirmButton.addEventListener('click', () => document.querySelector('#attendance-modal')?.classList.add('open'));
  const locationButton = app.querySelector('[data-location-jump]');
  if (locationButton) locationButton.addEventListener('click', event => { event.preventDefault(); const target = document.querySelector('#event-location'); if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 18, behavior: 'auto' }); });
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
  const songForm = app.querySelector('#song-suggestion-form');
  if (songForm) songForm.addEventListener('submit', async e => {
    e.preventDefault();
    const formData = new FormData(songForm);
    const songTitle = String(formData.get('songTitle') || '').trim();
    const artist = String(formData.get('artist') || '').trim();
    const spotifyUrl = String(formData.get('spotifyUrl') || '').trim();
    const button = songForm.querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = 'Enviando...';
    let error = null;
    if (supabaseClient) ({ error } = await supabaseClient.rpc('register_song_suggestion', { p_guest_name: auth.user.name, p_song_title: songTitle, p_artist: artist || null, p_spotify_url: spotifyUrl || null }));
    button.disabled = false; button.textContent = 'Enviar sugerencia';
    if (error) { toast(error.message || 'No se pudo enviar la sugerencia. Ejecuta el SQL actualizado.'); return; }
    songForm.reset(); toast('Sugerencia enviada al equipo');
  });
  const playlistForm = app.querySelector('#playlist-form');
  if (playlistForm) playlistForm.addEventListener('submit', async e => {
    e.preventDefault();
    const formData = new FormData(playlistForm);
    const title = String(formData.get('playlistTitle') || '').trim();
    const url = String(formData.get('playlistUrl') || '').trim();
    const button = playlistForm.querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = 'Guardando...';
    const { error } = await supabaseClient.rpc('add_spotify_playlist', { p_title: title, p_spotify_url: url });
    button.disabled = false; button.textContent = 'Agregar playlist';
    if (error) { toast(error.message || 'No se pudo guardar la playlist.'); return; }
    playlistForm.reset(); toast('Playlist agregada'); loadPlaylistsAdmin();
  });
  const dedicationForm = app.querySelector('#dedication-form');
  const openDedication = app.querySelector('[data-open-dedication]');
  if (openDedication) openDedication.addEventListener('click', () => document.querySelector('#dedication-modal')?.classList.add('open'));
  const closeDedication = app.querySelector('[data-close-dedication]');
  if (closeDedication) closeDedication.addEventListener('click', () => document.querySelector('#dedication-modal')?.classList.remove('open'));
  if (dedicationForm) dedicationForm.addEventListener('submit', async e => {
    e.preventDefault();
    const formData = new FormData(dedicationForm);
    const id = String(formData.get('dedicationId') || '');
    const target = String(formData.get('dedicationTarget') || 'general');
    const message = String(formData.get('dedicationMessage') || '').trim();
    const button = dedicationForm.querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = id ? 'Guardando cambios...' : 'Publicando...';
    const rpc = id ? 'update_dedication' : 'add_dedication';
    const params = id ? { p_id: id, p_guest_name: auth.user.name, p_guest_token: auth.user.token, p_target: target, p_message: message } : { p_guest_name: auth.user.name, p_guest_token: auth.user.token, p_target: target, p_message: message };
    const { error } = await supabaseClient.rpc(rpc, params);
    button.disabled = false; button.textContent = id ? 'Guardar cambios' : 'Publicar dedicatoria';
    if (error) { toast(error.message || 'No se pudo guardar la dedicatoria.'); return; }
    dedicationForm.reset(); dedicationForm.querySelector('[name="dedicationId"]').value = ''; button.textContent = 'Publicar dedicatoria'; document.querySelector('#dedication-modal')?.classList.remove('open'); toast(id ? 'Dedicatoria actualizada' : 'Dedicatoria publicada'); loadDedications();
  });
  app.querySelectorAll('[data-edit-dedication]').forEach(button => button.addEventListener('click', () => {
    const form = document.querySelector('#dedication-form'); if (!form) return;
    form.querySelector('[name="dedicationId"]').value = button.dataset.id;
    form.querySelector('[name="dedicationTarget"]').value = button.dataset.target;
    form.querySelector('[name="dedicationMessage"]').value = button.dataset.message;
    form.querySelector('button[type="submit"]').textContent = 'Guardar cambios';
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  app.querySelectorAll('[data-delete-dedication]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('¿Eliminar esta dedicatoria?')) return;
    const { error } = await supabaseClient.rpc('delete_dedication', { p_id: button.dataset.id, p_guest_name: auth.user.name, p_guest_token: auth.user.token });
    if (error) { toast(error.message || 'No se pudo eliminar la dedicatoria.'); return; }
    toast('Dedicatoria eliminada'); loadDedications();
  }));
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

async function loadSongSuggestions() {
  const body = document.querySelector('#song-suggestions-body');
  if (!body || !supabaseClient) return;
  const { data, error } = await supabaseClient.rpc('list_song_suggestions');
  if (error) { body.innerHTML = '<tr><td colspan="5">No se pudieron cargar las sugerencias. Ejecuta el SQL actualizado.</td></tr>'; return; }
  const songs = Array.isArray(data) ? data : [];
  body.innerHTML = songs.length ? songs.map(song => `<tr><td><strong>${escapeHtml(song.song_title)}</strong></td><td>${escapeHtml(song.artist || '—')}</td><td>${escapeHtml(song.guest_name)}</td><td>${song.spotify_url ? `<a class="song-link" href="${escapeHtml(song.spotify_url)}" target="_blank" rel="noreferrer">Abrir Spotify ↗</a>` : '—'}</td><td><span class="pill">${song.status === 'approved' ? 'Aprobada' : song.status === 'rejected' ? 'Descartada' : 'Pendiente'}</span></td></tr>`).join('') : '<tr><td colspan="5">Todavía no hay sugerencias.</td></tr>';
}

async function loadPublicMusic() {
  if (!supabaseClient) return;
  const songsNode = document.querySelector('#public-song-suggestions');
  const playlistsNode = document.querySelector('#public-playlists');
  const [songsResult, playlistsResult] = await Promise.all([
    supabaseClient.rpc('list_public_song_suggestions'),
    supabaseClient.rpc('list_spotify_playlists')
  ]);
  if (songsNode) {
    if (songsResult.error) songsNode.innerHTML = '<p class="form-hint">Las sugerencias aparecerán aquí cuando se configure la sección musical.</p>';
    else {
      const songs = Array.isArray(songsResult.data) ? songsResult.data : [];
      songsNode.innerHTML = songs.length ? songs.map(song => `<div class="public-song"><span>♫</span><div><strong>${escapeHtml(song.song_title)}</strong><small>${escapeHtml(song.artist || 'Artista no indicado')}</small></div>${song.spotify_url ? `<a class="song-link" href="${escapeHtml(song.spotify_url)}" target="_blank" rel="noreferrer">Spotify ↗</a>` : ''}</div>`).join('') : '<p class="form-hint">Todavía no hay canciones sugeridas.</p>';
    }
  }
  if (playlistsNode) {
    if (playlistsResult.error) playlistsNode.innerHTML = '<p class="form-hint">Las playlists aparecerán aquí cuando el administrador las agregue.</p>';
    else {
      const playlists = Array.isArray(playlistsResult.data) ? playlistsResult.data : [];
      playlistsNode.innerHTML = playlists.length ? playlists.map(playlist => `<div class="playlist-embed"><h3>${escapeHtml(playlist.title)}</h3><iframe src="${escapeHtml(getSpotifyEmbedUrl(playlist.spotify_url))}" title="${escapeHtml(playlist.title)}" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe><a class="song-link" href="${escapeHtml(playlist.spotify_url)}" target="_blank" rel="noreferrer">Abrir en Spotify ↗</a></div>`).join('') : '<p class="form-hint">El administrador todavía no ha agregado playlists.</p>';
    }
  }
}

async function loadPlaylistsAdmin() {
  const node = document.querySelector('#admin-playlists');
  if (!node || !supabaseClient) return;
  const { data, error } = await supabaseClient.rpc('list_spotify_playlists');
  if (error) { node.innerHTML = '<p class="form-hint">No se pudieron cargar las playlists. Ejecuta el SQL actualizado.</p>'; return; }
  const playlists = Array.isArray(data) ? data : [];
  node.innerHTML = playlists.length ? playlists.map(playlist => `<div class="admin-playlist"><strong>${escapeHtml(playlist.title)}</strong><a class="song-link" href="${escapeHtml(playlist.spotify_url)}" target="_blank" rel="noreferrer">Abrir ↗</a></div>`).join('') : '<p class="form-hint">Todavía no hay playlists agregadas.</p>';
}

async function loadDedications() {
  const list = document.querySelector('#dedications-list');
  if (!list || !supabaseClient) return;
  const { data, error } = await supabaseClient.rpc('list_dedications', { p_guest_name: auth.user.name, p_guest_token: auth.user.token });
  if (error) { list.innerHTML = '<p class="form-hint">No se pudieron cargar las dedicatorias. Ejecuta el SQL actualizado.</p>'; return; }
  const dedications = Array.isArray(data) ? data : [];
  const labels = { general: 'Para todos', fabian: 'Para Fabián', alexander: 'Para Alexander' };
  list.innerHTML = dedications.length ? dedications.map(item => `<article class="dedication-card"><div class="dedication-meta"><span class="pill">${labels[item.target] || 'Para todos'}</span></div><p>${escapeHtml(item.message)}</p>${item.can_edit ? `<div class="dedication-actions"><button class="btn ghost" data-edit-dedication data-id="${item.id}" data-target="${item.target}" data-message="${escapeHtml(item.message)}">Editar</button><button class="btn ghost" data-delete-dedication data-id="${item.id}">Eliminar</button></div>` : ''}</article>`).join('') : '<p class="form-hint">Todavía no hay dedicatorias publicadas.</p>';
  list.querySelectorAll('[data-edit-dedication]').forEach(button => button.addEventListener('click', () => {
    const form = document.querySelector('#dedication-form'); if (!form) return;
    form.querySelector('[name="dedicationId"]').value = button.dataset.id; form.querySelector('[name="dedicationTarget"]').value = button.dataset.target; form.querySelector('[name="dedicationMessage"]').value = button.dataset.message; form.querySelector('button[type="submit"]').textContent = 'Guardar cambios'; form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  list.querySelectorAll('[data-delete-dedication]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('¿Eliminar esta dedicatoria?')) return;
    const { error: deleteError } = await supabaseClient.rpc('delete_dedication', { p_id: button.dataset.id, p_guest_name: auth.user.name, p_guest_token: auth.user.token });
    if (deleteError) { toast(deleteError.message || 'No se pudo eliminar la dedicatoria.'); return; }
    toast('Dedicatoria eliminada'); loadDedications();
  }));
}

function getSpotifyEmbedUrl(url) {
  try { const parsed = new URL(url); const parts = parsed.pathname.split('/').filter(Boolean); const id = parts[parts.indexOf('playlist') + 1]; return id ? `https://open.spotify.com/embed/playlist/${id}?utm_source=generator&theme=0` : url; } catch { return url; }
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
  if (guestForm) guestForm.addEventListener('submit', async e => { e.preventDefault(); const name = new FormData(guestForm).get('guestName').trim(); if (!name) return; const button = guestForm.querySelector('button'); button.disabled = true; button.textContent = 'Guardando...'; if (supabaseClient) { const { error } = await supabaseClient.rpc('register_guest', { p_name: name }); if (error) { button.disabled = false; button.textContent = 'Entrar como invitado'; alert('No se pudo guardar el invitado. Ejecuta la configuración SQL de Supabase.'); return; } } else { const names = JSON.parse(localStorage.getItem('eventGuestNames') || '[]'); if (!names.some(n => n.toLowerCase() === name.toLowerCase())) { names.push(name); localStorage.setItem('eventGuestNames', JSON.stringify(names)); } } auth.user={name, token:getGuestToken(name), role:'guest'}; state.role='guest'; layout(); });
  const adminForm = document.querySelector('#admin-form');
  if (adminForm) adminForm.addEventListener('submit', async e => { e.preventDefault(); const data = new FormData(adminForm); const username = String(data.get('username')).trim().toLowerCase(); const record = adminDirectory[username]; if (!record || !supabaseClient) { document.querySelector('#auth-error').textContent='La autenticación todavía no está configurada.'; return; } const { data: result, error } = await supabaseClient.auth.signInWithPassword({ email: record.email, password: data.get('password') }); if (error) { const message = error.message?.toLowerCase().includes('email not confirmed') ? 'La cuenta existe, pero debes activar la confirmación automática en Supabase.' : 'Usuario o contraseña incorrectos. Verifica que la cuenta use el correo interno indicado y que la contraseña coincida.'; document.querySelector('#auth-error').textContent=message; return; } auth.user={name:record.name, username, role:'admin', id:result.user.id}; state.role='admin'; state.view='dashboard'; layout(); });
}

function adminView() {
  const views = { dashboard: dashboard, guests: guests, budget: budget, tasks: tasks, music: music, dedications: adminDedicationsPage, content: content };
  return `<div class="view active">${(views[state.view] || dashboard)()}</div>`;
}

function dashboard() { return `<div class="hero"><div class="hero-copy"><div class="eyebrow">Resumen del evento · 28 de noviembre, 2026</div><h1>Una celebración que se organiza con calma.</h1><p class="sub">Todo lo importante del cumpleaños, en un solo lugar. Revisa avances, presupuesto y confirmaciones.</p><div class="actions"><button class="btn" data-action="Evento actualizado">Editar evento</button><button class="btn secondary" data-action="Invitación copiada">Compartir invitación</button></div></div></div><div class="grid stats"><div class="card stat"><div class="label">Confirmados</div><div class="value" id="confirmed-count">0</div><div class="trend">Respuestas afirmativas</div></div><div class="card stat"><div class="label">No asistirán</div><div class="value" id="declined-count">0</div><div class="trend">Respuestas negativas</div></div><div class="card stat"><div class="label">Canciones</div><div class="value">24</div><div class="trend">8 pendientes de revisar</div></div><div class="card stat"><div class="label">Tareas abiertas</div><div class="value">7</div><div class="trend">3 vencen esta semana</div></div></div><div class="grid two"><div class="card"><div class="section-head"><h2>Próximas tareas</h2><small>Ver todas</small></div><div class="event-list"><div class="event-row"><div class="date-box">18<br><small>NOV</small></div><div class="row-main"><strong>Confirmar menú con catering</strong><span>Responsable: Ana · vence hoy</span></div><span class="pill warn">Urgente</span></div><div class="event-row"><div class="date-box">20<br><small>NOV</small></div><div class="row-main"><strong>Revisar playlist de la fiesta</strong><span>Responsable: Diego</span></div><span class="pill">En curso</span></div><div class="event-row"><div class="date-box">22<br><small>NOV</small></div><div class="row-main"><strong>Comprar decoración</strong><span>Responsable: Ana</span></div><span class="pill">Pendiente</span></div></div></div>${budgetCard()}</div>`; }
function adminDedicationsPage() { return `<div class="section-head"><div><div class="eyebrow">Moderación</div><h1>Dedicatorias</h1><p class="sub">Revisa todos los mensajes y quién los publicó.</p></div></div><div class="card admin-dedications-card"><div class="section-head"><h2>Todos los mensajes</h2><small>Visibles únicamente para administradores</small></div><div id="admin-dedications-list"><p class="form-hint">Cargando dedicatorias...</p></div></div>`; }
function budgetCard() { return `<div class="card"><div class="section-head"><h2>Caja</h2><button class="btn ghost" data-view="budget">Abrir</button></div><div class="money">S/ 1,760 <span>disponible</span></div><div class="progress"><i style="width:65%"></i></div><small style="color:var(--muted)">S/ 3,240 gastado de S/ 5,000</small><div class="event-list" style="margin-top:18px"><div class="event-row"><div class="row-main"><strong>Comida y bebidas</strong><span>S/ 1,500</span></div><span>46%</span></div><div class="event-row"><div class="row-main"><strong>Decoración</strong><span>S/ 820</span></div><span>25%</span></div><div class="event-row"><div class="row-main"><strong>Música y local</strong><span>S/ 920</span></div><span>29%</span></div></div></div>`; }
function guests() { return `<div class="section-head"><div><div class="eyebrow">Administración</div><h1>Invitados</h1></div><button class="btn" data-action="Formulario de invitado abierto">+ Agregar invitado</button></div><div class="grid stats"><div class="card stat"><div class="label">Total</div><div class="value" id="guest-total">0</div></div><div class="card stat"><div class="label">Confirmados</div><div class="value" id="guest-confirmed">0</div></div><div class="card stat"><div class="label">Pendientes</div><div class="value" id="guest-pending">0</div></div><div class="card stat"><div class="label">Rechazaron</div><div class="value" id="guest-declined">0</div></div></div><div class="card" style="margin-top:24px"><div class="section-head"><h2>Lista de invitados</h2><input style="max-width:210px" placeholder="Buscar nombre..." /></div><table class="table"><thead><tr><th>Nombre</th><th>Grupo</th><th>Acompañantes</th><th>Estado</th></tr></thead><tbody id="guest-table-body"><tr><td colspan="4">Cargando invitados...</td></tr></tbody></table></div>`; }
function budget() { return `<div class="section-head"><div><div class="eyebrow">Finanzas del evento</div><h1>Caja / presupuesto</h1></div><button class="btn" data-action="Nuevo gasto agregado">+ Registrar gasto</button></div><div class="grid stats"><div class="card stat"><div class="label">Presupuesto total</div><div class="value">S/ 5,000</div></div><div class="card stat"><div class="label">Gastos pagados</div><div class="value">S/ 3,240</div></div><div class="card stat"><div class="label">Pendiente de pago</div><div class="value">S/ 780</div></div><div class="card stat"><div class="label">Saldo disponible</div><div class="value">S/ 1,760</div></div></div><div class="card" style="margin-top:24px"><div class="section-head"><h2>Movimientos recientes</h2><select><option>Todas las categorías</option><option>Comida</option><option>Decoración</option></select></div><table class="table"><thead><tr><th>Concepto</th><th>Categoría</th><th>Proveedor</th><th>Estado</th><th>Importe</th></tr></thead><tbody><tr><td><strong>Catering y bebidas</strong><br><small>14 may 2026</small></td><td>Comida</td><td>Sabor & Arte</td><td><span class="pill">Pagado</span></td><td><strong>S/ 1,500</strong></td></tr><tr><td><strong>Arreglo floral</strong><br><small>12 may 2026</small></td><td>Decoración</td><td>Flor Studio</td><td><span class="pill warn">Pendiente</span></td><td><strong>S/ 480</strong></td></tr><tr><td><strong>Alquiler del local</strong><br><small>10 may 2026</small></td><td>Local</td><td>Casa Verde</td><td><span class="pill">Pagado</span></td><td><strong>S/ 920</strong></td></tr></tbody></table></div>`; }
function tasks() { return `<div class="section-head"><div><div class="eyebrow">Organización</div><h1>Lista de tareas</h1></div><button class="btn" data-action="Nueva tarea agregada">+ Nueva tarea</button></div><div class="card"><div class="event-list"><div class="event-row"><span class="pill">En curso</span><div class="row-main"><strong>Confirmar menú con catering</strong><span>Ana · vence hoy</span></div><button class="btn ghost" data-action="Tarea marcada como completada">Completar</button></div><div class="event-row"><span class="pill">Pendiente</span><div class="row-main"><strong>Comprar decoración</strong><span>Ana · 22 mayo</span></div><button class="btn ghost" data-action="Tarea abierta">Abrir</button></div><div class="event-row"><span class="pill warn">Urgente</span><div class="row-main"><strong>Enviar recordatorio a invitados</strong><span>Diego · 19 mayo</span></div><button class="btn ghost" data-action="Recordatorio enviado">Enviar</button></div></div></div>`; }
function music() { return `<div class="section-head"><div><div class="eyebrow">Participación de invitados</div><h1>Sugerencias musicales</h1></div><button class="btn" data-action="Playlist actualizada">Crear playlist</button></div><div class="card"><div class="section-head"><h2>Para revisar</h2><small>8 pendientes</small></div>${[['Dancing Queen','ABBA','12 votos'],['La vida es un carnaval','Celia Cruz','9 votos'],['Vivir mi vida','Marc Anthony','7 votos'],['September','Earth, Wind & Fire','5 votos']].map(s=>`<div class="song"><span class="icon">♫</span><div class="row-main"><strong>${s[0]}</strong><span>${s[1]}</span></div><span>${s[2]}</span><button class="btn ghost" data-action="Canción aprobada">Aprobar</button></div>`).join('')}</div>`; }
function content() { return `<div class="section-head"><div><div class="eyebrow">Comunidad</div><h1>Contenido de invitados</h1></div><button class="btn" data-action="Contenido aprobado">Moderar pendientes</button></div><div class="grid two"><div class="card"><div class="section-head"><h2>Dedicatorias recientes</h2><small>12 publicadas</small></div><p>“Que este nuevo año venga lleno de momentos bonitos y mucha música.”</p><small style="color:var(--muted)">— María Fernanda · hace 2 horas</small><hr style="border:0;border-top:1px solid var(--line);margin:18px 0"><p>“¡A celebrar como se debe! Nos vemos en la pista.”</p><small style="color:var(--muted)">— Diego Ramírez · ayer</small></div><div class="card"><div class="section-head"><h2>Galería</h2><small>24 fotos</small></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">${['#dce8df','#f2dfda','#e8ddc7','#cedbd1','#ead2cc','#d9e4df'].map(c=>`<div style="height:90px;border-radius:10px;background:${c};display:grid;place-items:center;font-size:22px">✦</div>`).join('')}</div></div></div>`; }

function getGuestToken(name) { const key = 'eventGuestToken_' + name.trim().toLowerCase(); let token = localStorage.getItem(key); if (!token) { token = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`; localStorage.setItem(key, token); } return token; }
function guestView() { return state.view === 'guest-songs' ? guestMusicPage() : state.view === 'guest-wall' ? guestDedicationsPage() : guestHomePage(); }
function guestMusicPage() { return `<div class="music-page"><div class="section-head"><div><div class="eyebrow">Área de invitados</div><h1>Música del evento</h1><p class="sub">Sugiere una canción y revisa las playlists preparadas para la celebración.</p></div><button class="btn secondary" data-view="dashboard">← Mi invitación</button></div><div class="card music-panel"><div class="section-head"><div><h2>Sugerir una canción</h2><small>La canción es obligatoria; el artista y Spotify son opcionales.</small></div></div><form id="song-suggestion-form" class="song-suggestion-form"><label>Nombre de la canción *<input name="songTitle" required maxlength="160" placeholder="Ej. Dancing Queen" /></label><label>Artista <span>(opcional)</span><input name="artist" maxlength="120" placeholder="Ej. ABBA" /></label><label>Enlace de Spotify <span>(opcional)</span><input name="spotifyUrl" type="url" placeholder="https://open.spotify.com/..." /></label><button class="btn" type="submit">Enviar sugerencia</button></form><p class="form-hint">No se mostrará quién envió la sugerencia.</p><div class="music-subhead"><h3>Canciones sugeridas</h3><small>Participación de invitados</small></div><div id="public-song-suggestions"><p class="form-hint">Cargando sugerencias...</p></div><div class="music-subhead playlist-heading"><h3>Playlists del evento</h3><small>Escucha una vista previa</small></div><div id="public-playlists"><p class="form-hint">Cargando playlists...</p></div></div></div>`; }
function guestDedicationsPage() { return `<div class="dedications-page"><div class="section-head"><div><div class="eyebrow">Área de invitados</div><h1>Dedicatorias</h1><p class="sub">Deja un mensaje y elige si va dirigido a todos, a Fabián o a Alexander.</p></div><button class="btn secondary" data-view="dashboard">← Mi invitación</button></div><div class="card dedication-panel"><div class="section-head"><div><h2>Escribe una dedicatoria</h2><small>Puedes publicar como máximo 3 dedicatorias.</small></div></div><form id="dedication-form" class="song-suggestion-form"><input type="hidden" name="dedicationId" /><label>¿Para quién es?<select name="dedicationTarget"><option value="general">Para todos</option><option value="fabian">Para Fabián</option><option value="alexander">Para Alexander</option></select></label><label>Mensaje<textarea name="dedicationMessage" required maxlength="500" placeholder="Escribe tu mensaje..."></textarea></label><button class="btn" type="submit">Publicar dedicatoria</button></form><div class="music-subhead"><h3>Dedicatorias publicadas</h3><small>Los cambios se actualizan para todos</small></div><div id="dedications-list"><p class="form-hint">Cargando dedicatorias...</p></div></div></div>`; }
function guestHomePage() { return `<div class="guest-hero"><div class="eyebrow">Cumpleaños de Fabián y Alex</div><h1>Nocturnal Fest</h1><p class="sub">Una noche para compartir, disfrutar y vivir experiencias lindas, con buena música, parrilla, piscina y la mejor compañía.</p><div class="countdown"><div><b data-countdown="days">00</b><span>Días</span></div><div><b data-countdown="hours">00</b><span>Horas</span></div><div><b data-countdown="minutes">00</b><span>Minutos</span></div><div><b data-countdown="seconds">00</b><span>Segundos</span></div></div><div class="eyebrow">Chaclacayo · 28 de noviembre de 2026 · 6:00 p. m.</div><div class="actions" style="justify-content:center"><button class="btn" data-confirm-attendance>Confirmar asistencia</button><button class="btn secondary" data-location-jump>Cómo llegar</button></div></div><div id="attendance-modal" class="modal"><div class="modal-card"><button class="modal-close" data-close-attendance>×</button><div class="eyebrow">Confirmación de asistencia</div><h2>¿Vas a acompañarnos?</h2><p class="sub">Invitado: <strong>${auth.user?.name || 'Invitado'}</strong></p><form id="attendance-form" class="attendance-form"><label><input type="radio" name="attending" value="yes" checked /> Sí, asistiré</label><label><input type="radio" name="attending" value="no" /> No podré asistir</label><button class="btn" type="submit">Guardar respuesta</button></form></div></div><section id="event-location" class="location-section"><div class="section-head"><div><div class="eyebrow">Ubicación del evento</div><h2>Casa de Campo Rumi Wasi</h2><p class="sub">Chaclacayo · Lima Este</p></div><a class="btn secondary" href="https://www.google.com/maps/search/?api=1&query=-11.952357292175293,-76.71927642822266" target="_blank" rel="noreferrer">Abrir en Google Maps</a></div><div class="location-grid"><div class="location-sketch"><div class="sketch-label">Lima</div><div class="sketch-road"><span class="road-dot"></span><i></i><span class="road-dot"></span></div><div class="sketch-label destination">Chaclacayo</div><div class="sketch-pin">⌖</div><strong>Casa de Campo Rumi Wasi</strong><small>Coordenadas aproximadas: -11.952357, -76.719276</small></div><div class="route-list"><div class="route-item"><span class="route-icon">🚗</span><div><strong>En taxi o aplicativo</strong><p>Indica “Casa de Campo Rumi Wasi, Chaclacayo” y comparte la ubicación exacta.</p><span class="pill">Precio: consultar según origen</span></div></div><div class="route-item"><span class="route-icon">🚌</span><div><strong>Desde Lima Este</strong><p>Toma un bus hacia Chaclacayo y completa el último tramo en taxi local.</p><span class="pill">Ruta sugerida</span></div></div><div class="route-item"><span class="route-icon">📍</span><div><strong>Antes de salir</strong><p>Revisa el tráfico y calcula tu hora de partida. La entrada será desde las 6:00 p. m.</p></div></div></div></div></section><div class="grid guest-grid"><div class="card"><span class="icon">◉</span><h3>Traer ropa de baño</h3><p class="sub">La piscina estará lista.<br>Ven preparado para mojarte.</p></div><div class="card"><span class="icon">✦</span><h3>Dress code</h3><p class="sub">Retro ochentero + neón<br>Brilla a tu manera.</p></div><div class="card"><span class="icon">♨</span><h3>Habrá parrilla</h3><p class="sub">Recepción · Cena · Música<br>Juegos · Baile · Piscina</p></div></div><div class="grid two"><div class="card"><div class="section-head"><h2>Elige una canción</h2><small>Vota por tus favoritas</small></div>${[['Dancing Queen','ABBA','12'],['La vida es un carnaval','Celia Cruz','9'],['Vivir mi vida','Marc Anthony','7']].map(s=>`<div class="song"><span>♫</span><div class="row-main"><strong>${s[0]}</strong><span>${s[1]}</span></div><button class="vote" data-action="Voto registrado">♡ ${s[2]}</button></div>`).join('')}<div class="actions"><button class="btn ghost" data-action="Sugerencia enviada">+ Sugerir canción</button></div></div><div class="card"><div class="section-head"><h2>Deja una dedicatoria</h2></div><textarea placeholder="Escribe un mensaje para el cumpleañero..."></textarea><div class="actions"><button class="btn" data-action="Dedicatoria publicada">Publicar mensaje</button></div></div></div>`; }
function prepareLocationPlaceholders() {
  const mapPreview = document.querySelector('.location-sketch');
  if (mapPreview) mapPreview.innerHTML = '<iframe class="location-map-preview" title="Mapa de Casa de Campo Rumi Wasi" src="https://www.google.com/maps?q=-11.952357292175293,-76.71927642822266&z=16&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe><strong>Casa de Campo Rumi Wasi</strong><small>Chaclacayo · Lima Este</small>';
  const items = document.querySelectorAll('#event-location .route-item');
  const content = [
    ['🗺️', 'Ruta desde Lima', 'Aquí agregaremos el recorrido recomendado, los puntos de referencia y las alternativas de transporte.'],
    ['⏱️', 'Tiempos de transporte', 'Se añadirá el tiempo estimado según el punto de partida de cada invitado.'],
    ['💳', 'Costos aproximados', 'Se incluirán las tarifas orientativas de taxi, bus u otras opciones cuando definamos las rutas.']
  ];
  items.forEach((item, index) => { if (!content[index]) return; const [icon, title, description] = content[index]; item.innerHTML = `<span class="route-icon">${icon}</span><div><strong>${title}</strong><p>${description}</p><span class="pill">Próximamente</span></div>`; });
}
function prepareGuestDetails() {
  const grid = document.querySelector('.guest-grid');
  if (!grid) return;
  grid.innerHTML = '<div class="card"><span class="icon">◉</span><h3>Traer ropa de baño</h3><p class="sub">La piscina estará lista.<br>Ven preparado para mojarte.</p></div><div class="card"><span class="icon">♨</span><h3>Habrá parrilla</h3><p class="sub">Disfruta de una parrilla preparada para compartir.</p></div><div class="card"><span class="icon">🥤</span><h3>Bebidas gratuitas</h3><p class="sub">Habrá bebidas para todos, pero también puedes traer las tuyas. No hay problema.</p></div>';
}
function prepareGuestMusic() {
  const card = document.querySelector('.grid.two .card:first-child');
  if (!card) return;
  card.id = 'guest-music';
  card.innerHTML = '<div class="section-head"><div><h2>Sugerencias de canciones</h2><small>Escribe la canción que te gustaría escuchar</small></div></div><form id="song-suggestion-form" class="song-suggestion-form"><label>Nombre de la canción *<input name="songTitle" required maxlength="160" placeholder="Ej. Dancing Queen" /></label><label>Artista <span>(opcional)</span><input name="artist" maxlength="120" placeholder="Ej. ABBA" /></label><label>Enlace de Spotify <span>(opcional)</span><input name="spotifyUrl" type="url" placeholder="https://open.spotify.com/..." /></label><button class="btn" type="submit">Enviar sugerencia</button></form><p class="form-hint">Si no recuerdas el artista, no hay problema. Solo necesitamos el nombre de la canción.</p>';
}
function prepareAdminMusic() {
  const card = document.querySelector('.view .card');
  if (!card) return;
  card.innerHTML = '<div class="section-head"><div><h2>Sugerencias recibidas</h2><small>Revisa canciones y enlaces enviados por invitados</small></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Canción</th><th>Artista</th><th>Invitado</th><th>Spotify</th><th>Estado</th></tr></thead><tbody id="song-suggestions-body"><tr><td colspan="5">Cargando sugerencias...</td></tr></tbody></table></div>';
}
function prepareAdminDashboardDedications() {
  const view = document.querySelector('.view');
  if (!view || document.querySelector('#admin-dedications-list')) return;
  view.insertAdjacentHTML('beforeend', '<div class="card admin-dedications-card"><div class="section-head"><div><div class="eyebrow">Comunidad</div><h2>Dedicatorias recientes</h2><small>Mensajes enviados por los invitados</small></div><button class="btn ghost" data-action="Dedicatorias visibles en el panel de invitados">Ver panel</button></div><div id="admin-dedications-list"><p class="form-hint">Cargando dedicatorias...</p></div></div>');
  const button = view.querySelector('.admin-dedications-card [data-action]');
  if (button) button.addEventListener('click', () => toast(button.dataset.action));
}
function prepareAdminContentDedications() {
  const card = document.querySelector('.view .grid.two .card:first-child');
  if (!card) return;
  card.innerHTML = '<div class="section-head"><div><h2>Dedicatorias recientes</h2><small>Mensajes reales enviados por los invitados</small></div></div><div id="content-dedications-list"><p class="form-hint">Cargando dedicatorias...</p></div>';
}
async function loadAdminContentDedications() {
  const list = document.querySelector('#content-dedications-list');
  if (!list || !supabaseClient) return;
  const { data, error } = await supabaseClient.rpc('list_all_dedications');
  if (error) { list.innerHTML = '<p class="form-hint">No se pudieron cargar las dedicatorias. Ejecuta el SQL actualizado.</p>'; return; }
  const labels = { general: 'Para todos', fabian: 'Para Fabián', alexander: 'Para Alexander' };
  const dedications = Array.isArray(data) ? data : [];
  list.innerHTML = dedications.length ? dedications.map(item => `<article class="dedication-card"><div class="dedication-meta"><span class="pill">${labels[item.target] || 'Para todos'}</span><small>${escapeHtml(item.guest_name)}</small></div><p>${escapeHtml(item.message)}</p></article>`).join('') : '<p class="form-hint">Todavía no hay dedicatorias publicadas.</p>';
}
async function loadAdminDedications() {
  const list = document.querySelector('#admin-dedications-list');
  if (!list || !supabaseClient) return;
  const { data, error } = await supabaseClient.rpc('list_all_dedications');
  if (error) { list.innerHTML = '<p class="form-hint">No se pudieron cargar las dedicatorias. Ejecuta el SQL actualizado.</p>'; return; }
  const labels = { general: 'Para todos', fabian: 'Para Fabián', alexander: 'Para Alexander' };
  const dedications = Array.isArray(data) ? data : [];
  list.innerHTML = dedications.length ? dedications.map(item => `<article class="dedication-card"><div class="dedication-meta"><span class="pill">${labels[item.target] || 'Para todos'}</span><small>${escapeHtml(item.guest_name)}</small></div><p>${escapeHtml(item.message)}</p></article>`).join('') : '<p class="form-hint">Todavía no hay dedicatorias publicadas.</p>';
}
function removeGuestMusicFromHome() {
  const card = document.querySelector('.grid.two .card:first-child');
  if (card) card.remove();
}
function removeGuestDedicationFromHome() {
  const card = document.querySelector('.grid.two .card');
  if (card) card.remove();
}
function prepareGuestMusicPanel() {
  const card = document.querySelector('.grid.two .card:first-child');
  if (!card || document.querySelector('#public-song-suggestions')) return;
  const wall = document.querySelector('.grid.two .card:nth-child(2)');
  if (wall) wall.id = 'guest-wall';
  card.insertAdjacentHTML('beforeend', '<div class="public-music"><div class="music-subhead"><h3>Canciones sugeridas</h3><small>Sin mostrar quién las envió</small></div><div id="public-song-suggestions"><p class="form-hint">Cargando sugerencias...</p></div><div class="music-subhead playlist-heading"><h3>Playlists del evento</h3><small>Escucha una vista previa</small></div><div id="public-playlists"><p class="form-hint">Cargando playlists...</p></div></div>');
}
function preparePlaylistAdmin() {
  const card = document.querySelector('.view .card');
  if (!card || document.querySelector('#playlist-form')) return;
  card.insertAdjacentHTML('beforeend', '<hr class="music-divider"><div class="music-subhead"><div><h2>Playlists de Spotify</h2><small>Agrega playlists públicas para mostrarlas a los invitados</small></div></div><form id="playlist-form" class="song-suggestion-form"><label>Nombre de la playlist *<input name="playlistTitle" required maxlength="120" placeholder="Ej. Playlist de la fiesta" /></label><label>Enlace público de Spotify *<input name="playlistUrl" type="url" required placeholder="https://open.spotify.com/playlist/..." /></label><button class="btn" type="submit">Agregar playlist</button></form><div id="admin-playlists" class="admin-playlists"><p class="form-hint">Cargando playlists...</p></div>');
}
function guestDedicationsPage() { return `<div class="dedications-page"><div class="section-head"><div><div class="eyebrow">Área de invitados</div><h1>Dedicatorias</h1><p class="sub">Escribe un mensaje para todos, para Fabián o para Alexander.</p></div><div class="dedication-header-actions"><button class="btn" data-open-dedication>Nueva dedicatoria</button><button class="btn secondary" data-view="dashboard">← Mi invitación</button></div></div><div class="card dedication-panel"><div class="music-subhead"><div><h2>Dedicatorias publicadas</h2><small>Máximo 6 por invitado · puedes editar o eliminar las tuyas</small></div></div><div id="dedications-list"><p class="form-hint">Cargando dedicatorias...</p></div></div></div><div id="dedication-modal" class="modal"><div class="modal-card dedication-modal-card"><button class="modal-close" data-close-dedication>×</button><div class="eyebrow">Nueva dedicatoria</div><h2>Comparte un mensaje</h2><form id="dedication-form" class="song-suggestion-form"><input type="hidden" name="dedicationId" /><label>¿Para quién es?<select name="dedicationTarget"><option value="general">Para todos</option><option value="fabian">Para Fabián</option><option value="alexander">Para Alexander</option></select></label><label>Mensaje<textarea name="dedicationMessage" required maxlength="500" placeholder="Escribe tu mensaje..."></textarea></label><button class="btn" type="submit">Publicar dedicatoria</button></form></div></div>`; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char])); }
function toast(message) { const el = document.querySelector('#toast'); if (!el) return; el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2200); }
layout();
if (supabaseClient) supabaseClient.auth.getSession().then(({data}) => { if (data.session?.user?.email) { const username = data.session.user.email.split('@')[0]; const record = adminDirectory[username]; if (record) { auth.user={name:record.name, username, role:'admin', id:data.session.user.id}; state.role='admin'; layout(); } } });

