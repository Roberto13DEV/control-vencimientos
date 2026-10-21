// Núcleo común de todas las páginas: conexión a Supabase, sesión, permisos, avisos y comportamientos de formularios
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const db = createClient(SUPABASE_URL, SUPABASE_KEY);
export const DIAS_PROXIMO = 20;
export const DIAS_CRITICO = 3;

export const e = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Nombre visible: el que puso la persona o, si no tiene, su usuario de acceso
export const displayName = (u) => (u?.nombre || '').trim() || u?.usuario || '';
export const initials = (u) => displayName(u).slice(0, 2).toUpperCase();
export const emailOf = (usuario) => `${usuario.trim().toLowerCase()}@control-vencimientos.app`;

// Fechas en hora local (las comparaciones de vencimiento son por día)
const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => isoDate(new Date());
export const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return isoDate(d); };
export const daysBetween = (from, to) => Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000);
export const dmy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

// Avisos de una página a la siguiente (como los mensajes "Producto guardado")
export const flash = (type, text) => sessionStorage.setItem('flash', JSON.stringify([type, text]));
export function showFlash() {
  const raw = sessionStorage.getItem('flash');
  if (!raw) return;
  sessionStorage.removeItem('flash');
  const [type, text] = JSON.parse(raw);
  notify(type, text);
}

// Aviso arriba de la página: el de éxito se va solo a los 3 s y el de error a los 6 s (o al tocarlo)
export function notify(type, text) {
  const box = document.getElementById('flash');
  if (!box) return;
  box.querySelectorAll('.alert').forEach((old) => old.remove());
  box.insertAdjacentHTML('afterbegin', `<div class="alert ${type === 'ok' ? 'ok' : 'error'}" role="status" title="Toca para cerrar">${e(text)}</div>`);
  const alert = box.firstElementChild;
  const close = () => { alert.classList.add('hiding'); setTimeout(() => alert.remove(), 300); };
  alert.addEventListener('click', close);
  setTimeout(close, type === 'ok' ? 3000 : 6000);
}
export const go = (url) => { location.href = url; };
// En modo app, "recargar" vuelve a dibujar solo el contenido de la sección actual
export const reload = () => (window.router ? window.router.refresh() : location.reload());

export async function audit(perfil, accion) {
  await db.from('historial').insert({ usuario_id: perfil.id, usuario: perfil.usuario, accion });
}

// Llama a una función del servidor (Cloudflare) con la sesión actual
export async function api(path, body) {
  const { data: { session } } = await db.auth.getSession();
  const response = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({ error: 'El servidor no respondió.' }));
  if (!response.ok) throw new Error(result.error || 'No se pudo completar la acción.');
  return result;
}

// Alertas: el día de pedir el cambio llegó (y aún no se reportó) o el producto ya venció
// "pronto": vence hoy o en los próximos DIAS_CRITICO días (Crítico), salvo que ya se haya revisado o reportado
// "reportado": ya se avisó al proveedor y se espera que se lo lleve (no cuenta como alerta)
export function alertFilters(query, kind) {
  const day = today();
  if (kind === 'cambio') return query.eq('tiene_cambio', true).lte('fecha_cambio', day).gte('vencimiento', day).is('cambio_reportado', null);
  if (kind === 'pronto') return query.gte('vencimiento', day).lte('vencimiento', addDays(day, DIAS_CRITICO)).is('alerta_revisada', null).is('cambio_reportado', null);
  if (kind === 'reportado') return query.eq('tiene_cambio', true).not('cambio_reportado', 'is', null).gte('vencimiento', day);
  return query.lt('vencimiento', day);
}
// Un producto que ya está en "pedir cambio" no se repite en "vencen pronto"
export const withoutChanges = (soon, changes) => { const ids = new Set(changes.map((r) => r.id)); return soon.filter((r) => !ids.has(r.id)); };
export const alertTotal = (found) => found.cambio.length + found.vencido.length + found.pronto.length;
export async function countAlerts() {
  const [cambio, vencido, pronto] = await Promise.all(['cambio', 'vencido', 'pronto'].map((kind) =>
    alertFilters(db.from('productos').select('id,usuario_id'), kind)));
  const changes = cambio.data || [];
  return { cambio: changes, vencido: vencido.data || [], pronto: withoutChanges(pronto.data || [], changes) };
}

// Ventana con las alertas pendientes: se muestra una sola vez, al entrar al sistema
function alertPopup(admin, found) {
  if (!sessionStorage.getItem('alert_popup')) return;
  sessionStorage.removeItem('alert_popup');
  const change = found.cambio.length;
  const expired = found.vencido.length;
  const soon = found.pronto.length;
  if (!change && !expired && !soon) return;
  const people = new Set([...found.cambio, ...found.vencido, ...found.pronto].map((r) => r.usuario_id)).size;
  const bell = '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>';
  document.body.insertAdjacentHTML('beforeend', `<dialog class="alert-popup"><span class="kpi-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${bell}</svg></span><h2>${admin ? 'Hay alertas pendientes' : 'Tienes alertas pendientes'}</h2>
   <ul>${change ? `<li class="t-warn"><b>${change}</b> ${change === 1 ? 'producto para pedir cambio al proveedor' : 'productos para pedir cambio al proveedor'}</li>` : ''}${soon ? `<li class="t-crit"><b>${soon}</b> ${soon === 1 ? 'producto vence pronto' : 'productos vencen pronto'}</li>` : ''}${expired ? `<li class="t-crit"><b>${expired}</b> ${expired === 1 ? 'producto vencido' : 'productos vencidos'}</li>` : ''}</ul>
   ${admin ? `<p>En ${people} ${people === 1 ? 'usuario' : 'usuarios'}. Revisa quién tiene cada producto.</p>` : ''}
   <form method="dialog" class="popup-actions"><a class="btn" href="/alertas">Ver alertas</a><button class="ghost">Más tarde</button></form></dialog>`);
  document.querySelector('dialog.alert-popup').showModal();
}

// Cerrar sesión siempre funciona: aunque Supabase no responda, la sesión se borra de este navegador
export async function logout(perfil) {
  const button = document.getElementById('logout');
  if (button) button.disabled = true;
  try { if (perfil) await audit(perfil, 'Cierre de sesión'); } catch { /* sin conexión: igual se cierra */ }
  try { await db.auth.signOut({ scope: 'local' }); } catch { /* se limpia abajo */ }
  try { Object.keys(localStorage).filter((key) => key.startsWith('sb-')).forEach((key) => localStorage.removeItem(key)); } catch { /* sin acceso */ }
  sessionStorage.clear();
  location.replace('/login');
}

// Arranque de cada página: exige sesión, carga el perfil y dibuja la barra lateral
export async function start({ adminOnly = false } = {}) {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { go('/login'); return null; }
  // El perfil y las alertas se piden al mismo tiempo (cada consulta tarda unos 0.3 s)
  const [{ data: perfil }, found] = await Promise.all([
    db.from('perfiles').select('*').eq('id', session.user.id).maybeSingle(),
    countAlerts(),
  ]);
  if (!perfil || !perfil.activo) {
    await db.auth.signOut();
    sessionStorage.clear();
    flash('error', 'Tu usuario fue desactivado.');
    go('/login');
    return null;
  }
  const alerts = alertTotal(found);
  sessionStorage.setItem('perfil', JSON.stringify(perfil));
  sessionStorage.setItem('alertas', String(alerts));
  window.renderShell(perfil, alerts);
  // El botón funciona aunque la barra lateral se vuelva a dibujar
  document.addEventListener('click', (event) => { if (event.target.closest?.('#logout')) logout(perfil); });
  showFlash();
  const admin = perfil.rol === 'admin';
  alertPopup(admin, found);
  if (adminOnly && !admin) {
    page('<section class="panel"><h2>Acceso denegado</h2><p>Esta sección es solo para el administrador.</p></section>');
    return null;
  }
  return { perfil, admin, alerts };
}

// Persona elegida por el administrador (?usuario=ID). Los empleados ya ven solo lo suyo gracias a los permisos de Supabase
export const params = { get: (key) => new URLSearchParams(location.search).get(key) };
export const ownerParam = () => params.get('usuario') || '';
export const byOwner = (ctx, query) => (ctx.admin && ownerParam() ? query.eq('usuario_id', ownerParam()) : query);
export async function viewingBanner(ctx) {
  if (!ctx.admin || !ownerParam()) return null;
  const { data: person } = await db.from('perfiles').select('*').eq('id', ownerParam()).maybeSingle();
  if (!person) return null;
  const here = location.pathname;
  document.getElementById('flash').insertAdjacentHTML('beforeend', `<div class="viewing"><span>${person.id === ctx.perfil.id ? 'Viendo <b>tus</b> productos' : `Viendo los productos de <b>${e(displayName(person))}</b>${person.area ? ' · ' + e(person.area) : ''}`}</span><a href="${e(here)}">Ver todos</a></div>`);
  return person;
}

// Dibuja la página y la guarda para mostrarla al instante la próxima vez que se abra (luego se actualiza sola)
export const paint = (html) => {
  const root = document.getElementById('page');
  root.innerHTML = html;
  root.classList.remove('stale');
  enhance(root);
  try { sessionStorage.setItem(`page:${location.pathname}${location.search}`, html); } catch { /* sin espacio: no pasa nada */ }
};
export const setError = (text) => { document.querySelectorAll('details.add-expiry[open]').forEach((d) => d.removeAttribute('open')); notify('error', text); window.scrollTo({ top: 0, behavior: 'smooth' }); };

export const page = (html) => paint(html);

// ---------- Comportamientos de formularios (los mismos que la versión PHP) ----------

const eyeOpen = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const eyeClosed = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.9 9.9 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

function syncExchange(form) {
  const box = form.querySelector('input[name="tiene_cambio"]');
  const date = form.querySelector('.exchange-date');
  if (!box || !date) return;
  date.style.display = box.checked ? '' : 'none';
  date.querySelector('input').required = box.checked;
}

export function enhance(root = document) {
  // Ojito para mostrar u ocultar la contraseña
  root.querySelectorAll('input[type="password"]:not([data-eye])').forEach((input) => {
    input.dataset.eye = '1';
    const wrap = document.createElement('span');
    const toggle = document.createElement('button');
    wrap.className = 'pw';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    toggle.type = 'button';
    toggle.className = 'pw-toggle';
    toggle.setAttribute('aria-label', 'Mostrar contraseña');
    toggle.innerHTML = eyeOpen;
    wrap.appendChild(toggle);
    toggle.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.innerHTML = show ? eyeClosed : eyeOpen;
      toggle.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
      input.focus();
    });
  });
  // Sin sugerencias del navegador
  root.querySelectorAll('form[autocomplete="off"] input:not([type="password"]):not([type="hidden"])').forEach((input) => input.setAttribute('autocomplete', 'off'));
  root.querySelectorAll('form').forEach(syncExchange);
  root.querySelectorAll('input[type="date"], input[type="month"]').forEach(markEmptyDate);
}

// El iPhone deja en blanco una fecha sin elegir: la etiqueta guarda la guía (dd/mm/aaaa) y el CSS la muestra encima
function markEmptyDate(input) {
  const label = input.closest('label');
  if (!label) return;
  label.dataset.hint = input.type === 'month' ? 'mm/aaaa' : 'dd/mm/aaaa';
  label.classList.toggle('date-empty', !input.value);
}
['input', 'change'].forEach((type) => document.addEventListener(type, (event) => {
  if (event.target.matches?.('input[type="date"], input[type="month"]')) markEmptyDate(event.target);
}));

// Pantalla fija como una app: el iPhone ignora "user-scalable=no", así que el pellizco para hacer zoom se bloquea aquí
['gesturestart', 'gesturechange', 'gestureend'].forEach((type) => document.addEventListener(type, (event) => event.preventDefault(), { passive: false }));
// Cualquier toque con dos dedos o más se cancela: así no hay pellizco en ningún navegador (incluido el de WhatsApp)
['touchstart', 'touchmove'].forEach((type) => document.addEventListener(type, (event) => {
  if (event.touches.length > 1 || (event.scale !== undefined && event.scale !== 1)) event.preventDefault();
}, { passive: false }));
// En la computadora: sin zoom con Ctrl + rueda (o pellizco en el touchpad) ni con Ctrl + / Ctrl -. Ctrl+0 sí funciona para volver al 100 %
document.addEventListener('wheel', (event) => { if (event.ctrlKey || event.metaKey) event.preventDefault(); }, { passive: false });
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && ['+', '-', '=', '_', 'Add', 'Subtract'].includes(event.key)) event.preventDefault();
});
document.addEventListener('change', (event) => { if (event.target.name === 'tiene_cambio') syncExchange(event.target.form); });
// Filtros que se aplican solos al cambiarlos (data-auto); "limpiar-busqueda" además borra el texto buscado
document.addEventListener('change', (event) => {
  const field = event.target.closest?.('[data-auto]');
  if (!field) return;
  if (field.dataset.auto === 'limpiar-busqueda' && field.form.q) field.form.q.value = '';
  field.form.requestSubmit();
});
// Ventanas emergentes (details.add-expiry): se cierran al hacer clic fuera o con Esc
document.addEventListener('click', (event) => {
  const open = event.target.closest?.('details.add-expiry[open]');
  if (open && event.target === open) open.removeAttribute('open');
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') document.querySelectorAll('details.add-expiry[open]').forEach((d) => d.removeAttribute('open'));
});

// Datos de un formulario como objeto
export const formData = (form) => Object.fromEntries(new FormData(form).entries());

// Envía un formulario sin recargar: desactiva el botón mientras trabaja y muestra el error si falla
export function onSubmit(form, handler) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button:not([type="button"])');
    if (button) button.disabled = true;
    try { await handler(formData(form), form); }
    catch (error) { setError(error.message || 'Ocurrió un error.'); }
    finally { if (button) button.disabled = false; }
  });
}
