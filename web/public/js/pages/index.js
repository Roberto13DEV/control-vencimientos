// Resumen: indicadores, calendario de 30 días, próximos a vencer (con tarjeta de detalle), estado del inventario y vencidos
import { db, e, paint, audit, flash, reload, displayName, today, addDays, daysBetween, alertFilters, ownerParam, byOwner, viewingBanner, DIAS_PROXIMO, DIAS_CRITICO } from '../core.js';

export default async function render(ctx, signal) {
  // Si se cambia de sección mientras carga, este dibujo se cancela
  const page = (html) => { if (signal.aborted) throw new DOMException('Cancelado', 'AbortError'); paint(html); };
  const onDoc = (type, fn) => document.addEventListener(type, fn, { signal });
  const { perfil: me, admin, alerts } = ctx;
  await viewingBanner(ctx);
  const day = today();
  const [{ data: rows = [] }, { data: changes = [] }] = await Promise.all([
    byOwner(ctx, db.from('productos').select('*')).order('vencimiento').order('producto'),
    alertFilters(byOwner(ctx, db.from('productos').select('id,producto,vencimiento')), 'cambio').order('vencimiento'),
  ]);
  const items = rows.map((r) => ({ ...r, dias: daysBetween(day, r.vencimiento), grupo: r.producto_origen_id ?? r.id }));
  const units = (list) => list.reduce((sum, r) => sum + r.cantidad, 0);
  const expired = items.filter((r) => r.dias < 0);
  const soon = items.filter((r) => r.dias >= 0 && r.dias <= DIAS_PROXIMO);
  const good = items.filter((r) => r.dias > DIAS_PROXIMO);
  const total = new Set(items.map((r) => r.grupo)).size;
  const categories = new Set(items.map((r) => r.categoria).filter(Boolean)).size;
  const stock = units(items);
  const week = soon.filter((r) => r.dias <= 7).length;
  const tone = (d) => (d <= DIAS_CRITICO ? 'crit' : d <= DIAS_PROXIMO ? 'warn' : 'ok');
  const label = (d) => (d < 0 ? 'Vencido' : d <= DIAS_CRITICO ? 'Crítico' : d <= DIAS_PROXIMO ? 'Próximo' : 'En buen estado');
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const short = (iso) => `${+iso.slice(8, 10)} ${months[+iso.slice(5, 7) - 1]}`;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const weekdays = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const headline = week || expired.length ? `${plural(week, 'producto vence', 'productos vencen')} esta semana y ${plural(expired.length, 'ya venció', 'ya vencieron')}.` : 'Nada vence esta semana. Todo en orden.';
  const lineOf = (r) => [r.lote ? `Lote ${r.lote}` : '', r.codigo, r.categoria].filter(Boolean).join(' · ');

  // Si el administrador está revisando a una persona, los enlaces a Productos y Alertas la conservan
  const keep = admin && ownerParam() ? `?usuario=${ownerParam()}` : '';
  const productsUrl = (q = '', who = '') => {
    const p = new URLSearchParams();
    const person = who || (admin ? ownerParam() : '');
    if (person) p.set('usuario', person);
    if (q) p.set('q', q);
    return `/productos${p.toString() ? '?' + p : ''}`;
  };
  const icon = {
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>', clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>', stock: '<path d="M4 7h16v13H4zM8 7V4h8v3"/>', plus: '<path d="M12 5v14M5 12h14"/>',
    user: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7M19 8v6M16 11h6"/>', history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  };
  const svg = (name, width = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}">${icon[name]}</svg>`;

  // Calendario: unidades que vencen cada día durante los próximos 30 días
  const runway = Array.from({ length: 31 }, () => []);
  [...soon, ...good].forEach((r) => { if (r.dias <= 30) runway[r.dias].push(r); });
  const runMax = Math.max(1, ...runway.map(units));
  const parts = [['En buen estado', 'ok', units(good)], ['Próximos a vencer', 'warn', units(soon)], ['Vencidos', 'crit', units(expired)]];
  const later = (list) => `<ul class="later">${list.map((r) => `<li><span class="prod"><b>${e(r.producto)}</b><small>${e([r.lote ? `Lote ${r.lote}` : '', r.categoria].filter(Boolean).join(' · '))}</small></span><span class="mono">${short(r.vencimiento)}</span><em>en ${plural(r.dias, 'día', 'días')}</em></li>`).join('')}</ul>`;
  const top = soon.slice(0, 6);

  // Tarjeta de detalle: hoy, fecha para pedir el cambio (si aplica) y vencimiento, en orden
  const detail = (r, i) => {
    const points = [['Hoy', day, 'now']];
    if (r.tiene_cambio && r.fecha_cambio) points.push([`Pedir cambio al proveedor${r.cambio_reportado ? ' · reportado' : r.fecha_cambio <= day ? ' · ya toca' : ''}`, r.fecha_cambio, '']);
    points.push(['Vence', r.vencimiento, 'end']);
    points.sort((a, b) => a[1].localeCompare(b[1]));
    const provider = (r.proveedor || '').trim();
    return `<section class="dpanel detail t-${tone(r.dias)}" id="detalle-${i}"${i ? ' hidden' : ''} aria-label="Detalle de ${e(r.producto)}">
     <div class="detail-top"><span class="kpi-ico">${svg('box')}</span><div><h2>${e(r.producto)}</h2><small>${e(lineOf(r))}</small></div>${top.length > 1 ? `<button class="next" type="button" data-next="${i + 1}" aria-label="Siguiente producto">›</button>` : ''}</div>
     <div class="detail-big"><div><div class="detail-label">Restan</div><div class="detail-val">${r.dias === 0 ? 'Vence hoy' : plural(r.dias, 'día', 'días')}</div></div><span class="pill">${label(r.dias)}</span></div>
     <ol class="timeline">${points.map(([text, date, cls]) => `<li class="${cls}"><b>${e(text)}</b><small>${short(date)}</small></li>`).join('')}</ol>
     <div class="owner"><span class="avatar">${e(provider ? provider.slice(0, 2).toUpperCase() : '—')}</span><div><b>${e(provider || 'Sin proveedor')}</b><small>Proveedor · ${r.cantidad} unidades</small></div><a class="link" href="${e(productsUrl(r.producto, admin ? r.usuario_id : ''))}">Ver →</a></div>
    </section>`;
  };
  const next = good[0];

  page(`<div class="dash">
   <div class="top"><div><div class="eyebrow">Control de vencimientos · ${weekdays[new Date().getDay()]} ${+day.slice(8, 10)} de ${months[+day.slice(5, 7) - 1]}</div><h1>${e(greeting)}, ${e(displayName(me))}</h1><p>${e(headline)}</p></div>
    <div class="tools"><form autocomplete="off" class="dsearch" role="search" action="/productos">${svg('search')}${keep ? `<input type="hidden" name="usuario" value="${e(ownerParam())}">` : ''}<input name="q" placeholder="Buscar producto…" aria-label="Buscar producto"></form>
     <a class="bell" href="/alertas${keep}" title="${alerts ? plural(alerts, 'alerta pendiente', 'alertas pendientes') : 'Sin alertas'}">${svg('bell')}${alerts ? `<i>${alerts}</i>` : ''}</a><a class="btn" href="${productsUrl()}">${svg('plus', 2.4)}Nuevo producto</a></div></div>
   ${changes.length ? `<section class="change-notice"><strong>Productos que deben solicitar cambio</strong><div>${changes.map((c) => `<span>${e(c.producto)} · vence en ${daysBetween(day, c.vencimiento)} días</span>`).join('')}</div><a href="/alertas${keep}">Ver alertas</a></section>` : ''}
   <section class="kpis" aria-label="Resumen">
    <a class="kpi t-info" href="${productsUrl()}"><div class="kpi-head"><span class="kpi-label">Productos registrados</span><span class="kpi-ico">${svg('box')}</span></div><div class="kpi-val">${total}</div><div class="kpi-sub"><span>${plural(categories, 'categoría', 'categorías')}</span><b>Ver →</b></div></a>
    <a class="kpi t-warn" href="${productsUrl()}"><div class="kpi-head"><span class="kpi-label">Próximos a vencer</span><span class="kpi-ico">${svg('clock')}</span></div><div class="kpi-val">${soon.length}</div><div class="kpi-sub"><span>en ${DIAS_PROXIMO} días o menos</span><b>Ver →</b></div></a>
    <a class="kpi t-crit" href="${productsUrl()}"><div class="kpi-head"><span class="kpi-label">Vencidos</span><span class="kpi-ico">${svg('alert')}</span></div><div class="kpi-val">${expired.length}</div><div class="kpi-sub"><span>pendientes de baja</span><b>Ver →</b></div></a>
    <a class="kpi t-ok" href="${productsUrl()}"><div class="kpi-head"><span class="kpi-label">Unidades en stock</span><span class="kpi-ico">${svg('stock')}</span></div><div class="kpi-val">${stock.toLocaleString('es')}</div><div class="kpi-sub"><span>${units(soon)} en riesgo</span><b>Ver →</b></div></a>
   </section>
   <section class="dpanel"><div class="dpanel-head"><div><h2>Calendario de vencimientos · próximos 30 días</h2><p>Unidades que vencen cada día. Pasa el cursor por una barra para ver el detalle.</p></div></div>
    <div><div class="runway">${runway.map((list, i) => { const u = units(list); return `<div class="day${u ? '' : ' empty'}${i < 6 ? ' l' : i > 24 ? ' r' : ''}" style="--c:var(--${tone(i)})"><span class="tip">${short(addDays(day, i))} · ${u ? u + ' u.' : 'sin vencimientos'}${list.map((r) => '<br>' + e(r.producto)).join('')}</span><i style="height:${u ? Math.max(6, Math.round(u / runMax * 100)) : 2}%"></i></div>`; }).join('')}</div>
    <div class="runway-axis">${runway.map((_, i) => `<span>${i === 0 ? 'Hoy' : i % 5 === 0 ? +addDays(day, i).slice(8, 10) : ''}</span>`).join('')}</div></div>
    <div class="zones"><span style="--c:var(--crit)"><i></i>Crítico · 0–${DIAS_CRITICO} días</span><span style="--c:var(--warn)"><i></i>Próximo · ${DIAS_CRITICO + 1}–${DIAS_PROXIMO} días</span><span style="--c:var(--ok)"><i></i>En buen estado · +${DIAS_PROXIMO} días</span></div>
   </section>
   <div class="grid-2">
    <section class="dpanel"><div class="dpanel-head"><div><h2>Próximos a vencer</h2><p class="fefo">Orden FEFO: lo primero que vence, sale primero.</p></div><a class="link" href="${productsUrl()}">Ver todos →</a></div>
     ${!soon.length ? `<div class="calm"><span class="calm-ico">${svg('clock')}</span><h3>Nada vence en los próximos ${DIAS_PROXIMO} días</h3>${good.length ? `<p>Estos son los siguientes en vencer:</p>${later(good.slice(0, 4))}` : `<p>Registra tus productos y aquí verás, en orden, los que vencen primero.</p><a class="btn" href="${productsUrl()}">${svg('plus', 2.4)}Registrar producto</a>`}</div>`
      : `<div class="tbl-wrap"><table><thead><tr><th>Producto</th><th>Vence</th><th>Restan</th><th class="num">Stock</th><th>Estado</th></tr></thead><tbody>
       ${top.map((r, i) => `<tr class="t-${tone(r.dias)}${i ? '' : ' sel'}" data-detail="${i}" tabindex="0" aria-controls="detalle-${i}"><td class="prod"><b>${e(r.producto)}</b><small>${e(lineOf(r))}</small></td><td class="mono">${short(r.vencimiento)}</td><td><span class="days">${r.dias === 0 ? 'Hoy' : r.dias + ' d'}</span><div class="bar"><i style="width:${Math.max(6, Math.round(100 - r.dias / DIAS_PROXIMO * 100))}%"></i></div></td><td class="num mono">${r.cantidad}</td><td><span class="pill">${label(r.dias)}</span></td></tr>`).join('')}
       </tbody></table></div>${soon.length < 5 && good.length ? `<div class="after"><h3>Más adelante</h3>${later(good.slice(0, 5 - soon.length))}</div>` : ''}`}
    </section>
    <div class="side">
     ${top.map(detail).join('')}
     ${!soon.length ? `<section class="dpanel detail t-ok" aria-label="Sin productos próximos a vencer">
      <div class="detail-top"><span class="kpi-ico">${svg('box')}</span><div><h2>Nada por vencer</h2><small>Próximos ${DIAS_PROXIMO} días</small></div></div>
      <div class="detail-big"><div><div class="detail-label">Próximo vencimiento</div><div class="detail-val">${next ? 'en ' + plural(next.dias, 'día', 'días') : 'Sin productos'}</div></div><span class="pill">Todo en orden</span></div>
      <ol class="timeline"><li class="now"><b>Hoy</b><small>${short(day)}</small></li><li><b>Sin vencimientos</b><small>hasta el ${short(addDays(day, DIAS_PROXIMO))}</small></li>${next ? `<li class="end"><b>${e(next.producto)}</b><small>${short(next.vencimiento)}</small></li>` : ''}</ol>
      <div class="owner"><span class="avatar">${svg('plus', 2.4)}</span><div><b>${items.length ? 'Registra otro vencimiento' : 'Aún no hay productos'}</b><small>Aparecerán aquí al acercarse su fecha</small></div><a class="link" href="${productsUrl()}">Registrar →</a></div></section>` : ''}
     <section class="dpanel"><div class="dpanel-head"><div><h2>Estado del inventario</h2><p>Por unidades en stock</p></div></div>
      <div class="big-total"><b>${stock.toLocaleString('es')}</b><span>unidades</span></div>
      <div class="split">${parts.filter((p) => p[2]).map(([name, t, u]) => `<i style="--c:var(--${t});flex:${u}" title="${name}: ${u}"></i>`).join('')}</div>
      <div class="dlegend">${parts.map(([name, t, u]) => `<div style="--c:var(--${t})"><i></i><span>${name}</span><b>${u}</b><small>${stock ? Math.round(u / stock * 100) : 0}%</small></div>`).join('')}</div></section>
    </div>
   </div>
   <div class="grid-2">
    <section class="dpanel"><div class="dpanel-head"><div><h2>Productos vencidos</h2><p>Retíralos de la venta y regístralos como merma.</p></div><a class="link crit" href="${productsUrl()}">Ver todos →</a></div>
     <div class="tbl-wrap"><table><thead><tr><th>Producto</th><th>Venció</th><th>Hace</th><th class="num">Unid.</th><th></th></tr></thead><tbody>
     ${!expired.length ? '<tr><td colspan="5" class="empty">No hay productos vencidos</td></tr>' : [...expired].reverse().slice(0, 6).map((r) => `<tr class="t-crit"><td class="prod"><b>${e(r.producto)}</b><small>${e(lineOf(r))}</small></td><td class="mono">${short(r.vencimiento)}</td><td><span class="days">${-r.dias} d</span></td><td class="num mono">${r.cantidad}</td><td class="num">${admin ? `<button class="row-act" type="button" data-baja="${r.id}">Dar de baja</button>` : ''}</td></tr>`).join('')}
     </tbody></table></div></section>
    <section class="dpanel"><div class="dpanel-head"><h2>Acciones rápidas</h2></div><div class="actions">
     <a class="action t-ok" href="${productsUrl()}"><span class="kpi-ico">${svg('plus', 2.2)}</span><span><b>Nuevo producto</b><small>Registrar vencimiento</small></span></a>
     ${admin ? `<a class="action t-info" href="/usuarios"><span class="kpi-ico">${svg('user')}</span><span><b>Nuevo usuario</b><small>Dar acceso</small></span></a><a class="action t-warn" href="/historial"><span class="kpi-ico">${svg('history')}</span><span><b>Historial</b><small>Ver movimientos</small></span></a>` : ''}
     <a class="action t-crit" href="${productsUrl()}"><span class="kpi-ico">${svg('list')}</span><span><b>Ver inventario</b><small>Consultar y editar</small></span></a></div></section>
   </div>
   <footer>© 2026 Control de Vencimientos · VENCE+</footer>
  </div>`);

  // Al elegir un producto de "Próximos a vencer" se muestra su tarjeta de detalle
  const pick = (i) => {
    const list = document.querySelectorAll('tr[data-detail]');
    if (!list.length) return;
    i = (i + list.length) % list.length;
    list.forEach((row, n) => row.classList.toggle('sel', n === i));
    document.querySelectorAll('.detail[id^="detalle-"]').forEach((card, n) => { card.hidden = n !== i; });
  };
  onDoc('click', (event) => {
    const row = event.target.closest?.('tr[data-detail]');
    const nextButton = event.target.closest?.('.detail .next');
    if (row) pick(+row.dataset.detail);
    if (nextButton) pick(+nextButton.dataset.next);
  });
  onDoc('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches?.('tr[data-detail]')) { event.preventDefault(); pick(+event.target.dataset.detail); }
  });
  // Dar de baja un vencido (solo administrador)
  document.querySelectorAll('[data-baja]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm('¿Dar de baja este vencimiento?')) return;
    button.disabled = true;
    const { error } = await db.from('productos').delete().eq('id', +button.dataset.baja);
    if (error) { button.disabled = false; alert('No se pudo dar de baja.'); return; }
    await audit(me, `Producto eliminado #${button.dataset.baja}`);
    flash('ok', 'Producto dado de baja.');
    reload();
  }));
}
