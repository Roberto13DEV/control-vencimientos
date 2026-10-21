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
function showFlash() {
  const raw = sessionStorage.getItem('flash');
  if (!raw) return;
  sessionStorage.removeItem('flash');
  const [type, text] = JSON.parse(raw);
  document.getElementById('flash').innerHTML = `<div class="alert ${type === 'ok' ? 'ok' : 'error'}">${e(text)}</div>`;
}
export const go = (url) => { location.href = url; };
export const reload = () => location.reload();

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
export function alertFilters(query, kind) {
  const day = today();
  return kind === 'cambio'
    ? query.eq('tiene_cambio', true).lte('fecha_cambio', day).gte('vencimiento', day).is('cambio_reportado', null)
    : query.lt('vencimiento', day);
}
async function countAlerts() {
  const [cambio, vencido] = await Promise.all(['cambio', 'vencido'].map((kind) =>
    alertFilters(db.from('productos').select('usuario_id'), kind)));
  return { cambio: cambio.data || [], vencido: vencido.data || [] };
}

// Ventana con las alertas pendientes: se muestra una sola vez, al entrar al sistema
function alertPopup(admin, found) {
  if (!sessionStorage.getItem('alert_popup')) return;
  sessionStorage.removeItem('alert_popup');
  const change = found.cambio.length;
  const expired = found.vencido.length;
  if (!change && !expired) return;
  const people = new Set([...found.cambio, ...found.vencido].map((r) => r.usuario_id)).size;
  const bell = '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>';
  document.body.insertAdjacentHTML('beforeend', `<dialog class="alert-popup"><span class="kpi-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${bell}</svg></span><h2>${admin ? 'Hay alertas pendientes' : 'Tienes alertas pendientes'}</h2>
   <ul>${change ? `<li class="t-warn"><b>${change}</b> ${change === 1 ? 'producto para pedir cambio al proveedor' : 'productos para pedir cambio al proveedor'}</li>` : ''}${expired ? `<li class="t-crit"><b>${expired}</b> ${expired === 1 ? 'producto vencido' : 'productos vencidos'}</li>` : ''}</ul>
   ${admin ? `<p>En ${people} ${people === 1 ? 'usuario' : 'usuarios'}. Revisa quién tiene cada producto.</p>` : ''}
   <form method="dialog" class="popup-actions"><a class="btn" href="/alertas">Ver alertas</a><button class="ghost">Más tarde</button></form></dialog>`);
  document.querySelector('dialog.alert-popup').showModal();
}

export async function logout(perfil) {
  if (perfil) await audit(perfil, 'Cierre de sesión');
  await db.auth.signOut();
  sessionStorage.clear();
  go('/login');
}

// Arranque de cada página: exige sesión, carga el perfil y dibuja la barra lateral
export async function start({ adminOnly = false } = {}) {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { go('/login'); return null; }
  const { data: perfil } = await db.from('perfiles').select('*').eq('id', session.user.id).maybeSingle();
  if (!perfil || !perfil.activo) {
    await db.auth.signOut();
    sessionStorage.clear();
    flash('error', 'Tu usuario fue desactivado.');
    go('/login');
    return null;
  }
  const found = await countAlerts();
  const alerts = found.cambio.length + found.vencido.length;
  sessionStorage.setItem('perfil', JSON.stringify(perfil));
  sessionStorage.setItem('alertas', String(alerts));
  window.renderShell(perfil, alerts);
  document.getElementById('logout')?.addEventListener('click', () => logout(perfil));
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
export const params = new URLSearchParams(location.search);
export const ownerParam = () => params.get('usuario') || '';
export const byOwner = (ctx, query) => (ctx.admin && ownerParam() ? query.eq('usuario_id', ownerParam()) : query);
export async function viewingBanner(ctx) {
  if (!ctx.admin || !ownerParam()) return null;
  const { data: person } = await db.from('perfiles').select('*').eq('id', ownerParam()).maybeSingle();
  if (!person) return null;
  const here = location.pathname;
  document.getElementById('flash').insertAdjacentHTML('beforeend', `<div class="viewing"><span>Viendo los productos de <b>${e(displayName(person))}</b>${person.area ? ' · ' + e(person.area) : ''}</span><a href="${e(here)}">Ver todos</a></div>`);
  return person;
}

export const page = (html) => { const root = document.getElementById('page'); root.innerHTML = html; enhance(root); };
export const setError = (text) => { document.querySelectorAll('details.add-expiry[open]').forEach((d) => d.removeAttribute('open')); document.getElementById('flash').innerHTML = `<div class="alert error">${e(text)}</div>`; window.scrollTo({ top: 0, behavior: 'smooth' }); };

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
}

document.addEventListener('change', (event) => { if (event.target.name === 'tiene_cambio') syncExchange(event.target.form); });
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
