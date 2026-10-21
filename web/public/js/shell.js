// Barra lateral: se dibuja al instante con los datos guardados de la visita anterior (sin parpadeo al cambiar
// de página) y core.js la vuelve a dibujar cuando confirma la sesión. Es un script clásico para que corra antes de pintar.
(function () {
  var icons = {
    index: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    alertas: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    productos: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    reportes: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    usuarios: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7M17 4a4 4 0 0 1 0 8M22 21c0-3-1.5-5.5-4-6.5"/>',
    historial: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>'
  };
  var nav = [['index', 'Resumen'], ['alertas', 'Alertas'], ['productos', 'Productos'], ['reportes', 'Reportes'], ['usuarios', 'Usuarios', true], ['historial', 'Historial', true]];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function svg(path) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + path + '</svg>'; }

  window.renderShell = function (perfil, alerts) {
    var aside = document.querySelector('aside');
    if (!aside || !perfil) return;
    var page = document.body.dataset.page;
    var items = nav.filter(function (n) { return !n[2] || perfil.rol === 'admin'; });
    var tab = items.map(function (n) { return n[0]; }).indexOf(page);
    var name = (perfil.nombre || '').trim() || perfil.usuario;
    var html = '<div class="brand"><b>VENCE<span>+</span></b><small>Control inteligente</small></div><nav aria-label="Principal">';
    if (tab >= 0) html += '<span class="tab" style="--i:' + tab + '" aria-hidden="true"></span>';
    items.forEach(function (n) {
      var active = n[0] === page;
      html += '<a class="' + (active ? 'active' : '') + '" href="' + (n[0] === 'index' ? '/' : '/' + n[0]) + '"' + (active ? ' aria-current="page"' : '') + '>' + svg(icons[n[0]]) + '<span class="lbl">' + n[1] + '</span>';
      if (n[0] === 'alertas' && alerts) html += '<span class="count">' + alerts + '</span>';
      html += '</a>';
    });
    html += '</nav><div class="rail-foot"><a class="user' + (page === 'perfil' ? ' current' : '') + '" href="/perfil" title="Mi perfil"><div class="avatar">' + esc(name.slice(0, 2).toUpperCase()) + '</div><div class="lbl"><b>' + esc(name) + '</b><small>' + (perfil.rol === 'admin' ? 'Administrador' : 'Empleado') + ' · Mi perfil</small></div></a>';
    html += '<div class="logout"><button type="button" id="logout" aria-label="Cerrar sesión">' + svg('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"/>') + '<span class="lbl">Cerrar sesión</span></button></div></div>';
    aside.innerHTML = html;
  };

  try {
    var cached = JSON.parse(sessionStorage.getItem('perfil') || 'null');
    if (cached) window.renderShell(cached, +sessionStorage.getItem('alertas') || 0);
  } catch (error) { /* sin datos guardados: core.js dibuja la barra al cargar */ }
})();
