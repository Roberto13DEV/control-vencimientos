// Alertas: cambios que toca pedir al proveedor, productos que vencen pronto (crítico) y vencidos. El administrador las ve agrupadas por persona
import { db, e, paint, audit, flash, reload, displayName, initials, today, daysBetween, alertFilters, withoutChanges, byOwner, viewingBanner, ownerParam, DIAS_CRITICO } from '../core.js';

export default async function render(ctx, signal) {
  // Si se cambia de sección mientras carga, este dibujo se cancela
  const page = (html) => { if (signal.aborted) throw new DOMException('Cancelado', 'AbortError'); paint(html); };
  const { perfil: me, admin } = ctx;
  await viewingBanner(ctx);
  const day = today();
  const select = '*, perfiles(id,usuario,nombre,area)';
  const [{ data: changes = [] }, { data: expired = [] }, { data: soonAll = [] }] = await Promise.all(['cambio', 'vencido', 'pronto'].map((kind) =>
    alertFilters(byOwner(ctx, db.from('productos').select(select)), kind).order('vencimiento')));
  const soon = withoutChanges(soonAll, changes);
  const rows = [...changes.map((r) => ({ ...r, tipo: 'cambio' })), ...soon.map((r) => ({ ...r, tipo: 'pronto' })), ...expired.map((r) => ({ ...r, tipo: 'vencido' }))];

  // Agrupadas por persona: el empleado solo tiene su grupo; el administrador ve uno por cada usuario con alertas
  const groups = new Map();
  rows.forEach((r) => { const key = r.usuario_id || 'sin'; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(r); });
  const ordered = [...groups.values()].sort((a, b) => {
    const pa = a[0].perfiles || {}; const pb = b[0].perfiles || {};
    return ((pa.area ? 0 : 1) - (pb.area ? 0 : 1)) || (pa.area || '').localeCompare(pb.area || '') || displayName(pa).localeCompare(displayName(pb));
  });

  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const short = (iso) => `${+iso.slice(8, 10)} ${months[+iso.slice(5, 7) - 1]}`;
  const days = (n) => `${n} ${n === 1 ? 'día' : 'días'}`;

  const group = (list) => {
    const person = list[0].perfiles || { usuario: '?' };
    const toReport = list.filter((r) => r.tipo === 'cambio');
    const coming = list.filter((r) => r.tipo === 'pronto');
    const gone = list.filter((r) => r.tipo === 'vencido');
    return `<section class="panel alert-group">
     ${admin ? `<div class="alert-person"><span class="avatar">${e(initials(person))}</span><div><b>${e(displayName(person))}</b><small>${e(person.area || 'Sin área')}</small></div>
      <div class="alert-counts">${toReport.length ? `<span class="pill t-warn">${toReport.length} por reportar</span>` : ''}${coming.length ? `<span class="pill t-crit">${coming.length} ${coming.length === 1 ? 'vence' : 'vencen'} pronto</span>` : ''}${gone.length ? `<span class="pill t-crit">${gone.length} ${gone.length === 1 ? 'vencido' : 'vencidos'}</span>` : ''}</div>
      <a class="link" href="/productos?usuario=${e(person.id || '')}">Ver sus productos →</a></div>` : ''}
     ${toReport.length ? `<h3 class="alert-title t-warn">Pedir cambio al proveedor</h3><ul class="alert-list">${toReport.map((r) => {
       const late = daysBetween(r.fecha_cambio, day);
       return `<li class="t-warn"><div class="prod"><b>${e(r.producto)}</b><small>${e([r.proveedor ? 'Proveedor ' + r.proveedor : '', r.cantidad + ' unidades'].filter(Boolean).join(' · '))}</small></div>
        <div class="when"><b>${late === 0 ? 'Avisar hoy' : 'Atrasado ' + days(late)}</b><small>Aviso programado: ${short(r.fecha_cambio)}</small><small>Vence el ${short(r.vencimiento)} · en ${days(daysBetween(day, r.vencimiento))}</small></div>
        <div><button class="done" type="button" data-reported="${r.id}">Ya lo reporté</button></div></li>`;
     }).join('')}</ul>` : ''}
     ${coming.length ? `<h3 class="alert-title t-crit">Vencen pronto · ${DIAS_CRITICO} días o menos</h3><ul class="alert-list">${coming.map((r) => {
       const left = daysBetween(day, r.vencimiento);
       const find = new URLSearchParams({ q: r.producto, ...(admin && r.usuario_id ? { usuario: r.usuario_id } : {}) });
       return `<li class="t-crit"><div class="prod"><b>${e(r.producto)}</b><small>${e([r.categoria, r.cantidad + ' unidades'].filter(Boolean).join(' · '))}</small></div>
        <div class="when"><b>${left === 0 ? 'Vence hoy' : left === 1 ? 'Vence mañana' : 'Vence en ' + days(left)}</b><small>el ${short(r.vencimiento)}</small></div>
        <div><a class="link" href="/productos?${e(find.toString())}">Ver producto →</a></div></li>`;
     }).join('')}</ul>` : ''}
     ${gone.length ? `<h3 class="alert-title t-crit">Productos vencidos</h3><ul class="alert-list">${gone.map((r) => `<li class="t-crit"><div class="prod"><b>${e(r.producto)}</b><small>${e([r.categoria, r.cantidad + ' unidades'].filter(Boolean).join(' · '))}</small></div>
        <div class="when"><b>Venció hace ${days(-daysBetween(day, r.vencimiento))}</b><small>el ${short(r.vencimiento)}</small></div>
        ${admin ? `<div><button class="delete" type="button" data-baja="${r.id}">Dar de baja</button></div>` : '<small class="note">Retíralo de la venta; el administrador lo da de baja.</small>'}</li>`).join('')}</ul>` : ''}
    </section>`;
  };

  page(rows.length ? ordered.map(group).join('')
    : `<section class="panel calm"><span class="calm-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg></span><h3>Todo al día</h3><p>No hay cambios por reportar, productos por vencer en ${DIAS_CRITICO} días ni vencidos${admin && !ownerParam() ? ' en ningún usuario' : ''}.</p></section>`);

  // "Ya lo reporté": la alerta de cambio desaparece hasta que cambie el día de aviso o el vencimiento
  document.querySelectorAll('[data-reported]').forEach((button) => button.addEventListener('click', async () => {
    button.disabled = true;
    const { error } = await db.from('productos').update({ cambio_reportado: new Date().toISOString() }).eq('id', +button.dataset.reported);
    if (error) { button.disabled = false; alert('No se pudo marcar como reportado.'); return; }
    await audit(me, `Cambio reportado al proveedor: producto #${button.dataset.reported}`);
    flash('ok', 'Listo, el cambio quedó marcado como reportado.');
    reload();
  }));
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
