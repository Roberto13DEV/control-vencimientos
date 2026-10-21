// Modo app: la sesión, la barra lateral y la conexión a Supabase se cargan una sola vez.
// Al hacer clic en un enlace interno solo cambia el contenido (sin recargar la página), con la pestaña deslizándose.
import { start, showFlash, countAlerts, alertTotal, e } from './core.js';

const routes = {
  index: ['Resumen', './pages/index.js'],
  alertas: ['Alertas', './pages/alertas.js'],
  productos: ['Productos', './pages/productos.js'],
  reportes: ['Reportes', './pages/reportes.js'],
  usuarios: ['Usuarios', './pages/usuarios.js', true],
  historial: ['Historial', './pages/historial.js', true],
  perfil: ['Mi perfil', './pages/perfil.js'],
};
const pageOf = (path) => (path === '/' || path === '/index' || path === '/index.html' ? 'index' : path.replace(/^\/|\.html$/g, ''));
const keyOf = () => `page:${location.pathname}${location.search}`;

const ctx = await start();
if (ctx) {
  let controller = null;
  let first = true;

  // Arma el contenido de la sección: muestra al instante la última versión guardada y luego la actualiza
  const frame = (name) => {
    const [title] = routes[name];
    const cached = sessionStorage.getItem(keyOf());
    document.querySelector('main.content').innerHTML = `${name === 'index' ? '' : `<header><div><p class="eyebrow">Control de vencimientos</p><h1>${e(title)}</h1></div></header>`}<div id="flash"></div><div id="page" class="enter${cached ? ' stale' : ''}">${cached || '<p class="hint">Cargando…</p>'}</div>`;
    document.body.dataset.page = name;
    document.title = `${title} | Control de vencimientos`;
    window.setActiveNav(name);
  };

  async function show() {
    const name = pageOf(location.pathname);
    const route = routes[name];
    if (!route) { location.reload(); return; }
    controller?.abort();
    controller = new AbortController();
    const { signal } = controller;
    if (!first) {
      frame(name);
      window.scrollTo(0, 0);
    }
    first = false;
    if (route[2] && !ctx.admin) {
      document.getElementById('page').innerHTML = '<section class="panel"><h2>Acceso denegado</h2><p>Esta sección es solo para el administrador.</p></section>';
      return;
    }
    try {
      const module = await import(route[1]);
      if (signal.aborted) return;
      await module.default(ctx, signal);
      if (!signal.aborted) showFlash();
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error(error);
        document.getElementById('page').innerHTML = '<section class="panel"><h2>No se pudo cargar</h2><p>Revisa tu conexión a internet y vuelve a intentarlo.</p></section>';
      }
    }
    if (!signal.aborted) updateBadge();
  }

  // Número de alertas en el menú (se actualiza en cada cambio de sección)
  async function updateBadge() {
    const found = await countAlerts();
    const total = alertTotal(found);
    sessionStorage.setItem('alertas', String(total));
    const link = document.querySelector('aside nav a[href="/alertas"]');
    if (!link) return;
    let badge = link.querySelector('.count');
    if (!total) { badge?.remove(); return; }
    if (!badge) { badge = document.createElement('span'); badge.className = 'count'; link.appendChild(badge); }
    badge.textContent = total;
  }

  const navigate = (url) => {
    if (url.href !== location.href) history.pushState(null, '', url);
    show();
  };

  // Enlaces internos: cambian la sección sin recargar
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href]');
    if (!link || link.target || link.hasAttribute('download') || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !routes[pageOf(url.pathname)]) return;
    event.preventDefault();
    link.closest('dialog')?.close();
    navigate(url);
  });

  // Formularios de búsqueda y filtros (los que no guardan datos): también sin recargar
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (event.defaultPrevented || (form.method || 'get').toLowerCase() !== 'get' || form.getAttribute('method') === 'dialog') return;
    const url = new URL(form.getAttribute('action') || location.pathname, location.href);
    if (!routes[pageOf(url.pathname)]) return;
    event.preventDefault();
    new FormData(form).forEach((value, key) => { if (String(value) !== '') url.searchParams.set(key, value); });
    navigate(url);
  });

  window.addEventListener('popstate', show);
  window.router = { refresh: show };
  show();
}
