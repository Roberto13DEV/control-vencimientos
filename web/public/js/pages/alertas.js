// Alertas: pedir cambio al proveedor, vencen pronto y vencidos; además la lista de reportados que esperan al proveedor.
// Cada alerta se cierra con su botón: "Ya lo reporté", "Ya lo revisé" o "Dar de baja". El administrador las ve por persona.
import { db, e, paint, audit, flash, reload, displayName, initials, today, daysBetween, alertFilters, withoutChanges, byOwner, viewingBanner, ownerParam } from '../core.js';

export default async function render(ctx, signal) {
  // Si se cambia de sección mientras carga, este dibujo se cancela
  const page = (html) => { if (signal.aborted) throw new DOMException('Cancelado', 'AbortError'); paint(html); };
  const { perfil: me, admin } = ctx;
  await viewingBanner(ctx);
  const day = today();
  const select = '*, perfiles(id,usuario,nombre,area)';
  const [{ data: changes = [] }, { data: expired = [] }, { data: soonAll = [] }, { data: reported = [] }] = await Promise.all(['cambio', 'vencido', 'pronto', 'reportado'].map((kind) =>
    alertFilters(byOwner(ctx, db.from('productos').select(select)), kind).order('vencimiento')));
  const soon = withoutChanges(soonAll, changes);
  const rows = [
    ...changes.map((r) => ({ ...r, tipo: 'cambio' })), ...soon.map((r) => ({ ...r, tipo: 'pronto' })),
    ...expired.map((r) => ({ ...r, tipo: 'vencido' })), ...reported.map((r) => ({ ...r, tipo: 'reportado' })),
  ];

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
  const when = (iso) => { const left = daysBetween(day, iso); return left === 0 ? 'Vence hoy' : left === 1 ? 'Vence mañana' : `Vence en ${days(left)}`; };
  const meta = (r, provider) => e([provider && r.proveedor ? 'Proveedor ' + r.proveedor : r.categoria, r.cantidad + ' unidades'].filter(Boolean).join(' · '));
  const remove = (r) => `<button class="delete" type="button" data-baja="${r.id}" data-name="${e(r.producto)}">Dar de baja</button>`;
  const list = (cls, items, row) => `<ul class="alert-list">${items.map((r) => `<li class="${cls}">${row(r)}</li>`).join('')}</ul>`;

  const group = (items) => {
    const person = items[0].perfiles || { usuario: '?' };
    const toReport = items.filter((r) => r.tipo === 'cambio');
    const coming = items.filter((r) => r.tipo === 'pronto');
    const gone = items.filter((r) => r.tipo === 'vencido');
    const waiting = items.filter((r) => r.tipo === 'reportado');
    return `<section class="panel alert-group">
     ${admin ? `<div class="alert-person"><span class="avatar">${e(initials(person))}</span><div><b>${e(displayName(person))}</b><small>${e(person.area || 'Sin área')}</small></div>
      <div class="alert-counts">${toReport.length ? `<span class="pill t-warn">${toReport.length} por reportar</span>` : ''}${coming.length ? `<span class="pill t-crit">${coming.length} ${coming.length === 1 ? 'vence' : 'vencen'} pronto</span>` : ''}${gone.length ? `<span class="pill t-crit">${gone.length} ${gone.length === 1 ? 'vencido' : 'vencidos'}</span>` : ''}${waiting.length ? `<span class="pill t-ok">${waiting.length} ${waiting.length === 1 ? 'reportado' : 'reportados'}</span>` : ''}</div>
      <a class="link" href="/productos?usuario=${e(person.id || '')}">Ver sus productos →</a></div>` : ''}
     ${toReport.length ? `<h3 class="alert-title t-warn">Pedir cambio al proveedor</h3>${list('t-warn', toReport, (r) => {
       const late = daysBetween(r.fecha_cambio, day);
       return `<div class="prod"><b>${e(r.producto)}</b><small>${meta(r, true)}</small></div>
        <div class="when"><b>${late === 0 ? 'Avisar hoy' : 'Atrasado ' + days(late)}</b><small>Aviso programado: ${short(r.fecha_cambio)}</small><small>${when(r.vencimiento)} · el ${short(r.vencimiento)}</small></div>
        <div class="alert-actions"><button class="done" type="button" data-reported="${r.id}">Ya lo reporté</button></div>`;
     })}` : ''}
     ${coming.length ? `<h3 class="alert-title t-crit">Vencen pronto</h3>${list('t-crit', coming, (r) => `<div class="prod"><b>${e(r.producto)}</b><small>${meta(r)}</small></div>
        <div class="when"><b>${when(r.vencimiento)}</b><small>el ${short(r.vencimiento)}</small></div>
        <div class="alert-actions"><button class="ghost" type="button" data-reviewed="${r.id}">Ya lo revisé</button>${remove(r)}</div>`)}` : ''}
     ${gone.length ? `<h3 class="alert-title t-crit">Productos vencidos</h3>${list('t-crit', gone, (r) => `<div class="prod"><b>${e(r.producto)}</b><small>${meta(r)}</small></div>
        <div class="when"><b>Venció hace ${days(-daysBetween(day, r.vencimiento))}</b><small>el ${short(r.vencimiento)}</small></div>
        <div class="alert-actions">${remove(r)}</div>`)}` : ''}
     ${waiting.length ? `<h3 class="alert-title t-ok">Reportados · esperando que se lo lleven</h3>${list('t-ok', waiting, (r) => `<div class="prod"><b>${e(r.producto)}</b><small>${meta(r, true)}</small></div>
        <div class="when"><b>✓ Reportado el ${short(r.cambio_reportado.slice(0, 10))}</b><small>${when(r.vencimiento)} · el ${short(r.vencimiento)}</small></div>
        <div class="alert-actions"><span class="note">¿Ya se lo llevaron?</span>${remove(r)}</div>`)}` : ''}
    </section>`;
  };

  page(rows.length ? ordered.map(group).join('')
    : `<section class="panel calm"><span class="calm-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg></span><h3>Todo al día</h3><p>No hay alertas pendientes${admin && !ownerParam() ? ' en ningún usuario' : ''}.</p></section>`);

  // Marca una fecha en el producto y recarga (la alerta desaparece)
  const mark = (selector, field, done, message, error) => document.querySelectorAll(selector).forEach((button) => button.addEventListener('click', async () => {
    button.disabled = true;
    const id = +button.dataset[field];
    const { error: failed } = await db.from('productos').update({ [done]: new Date().toISOString() }).eq('id', id);
    if (failed) { button.disabled = false; alert(error); return; }
    await audit(me, `${message}: producto #${id}`);
    flash('ok', 'Listo, la alerta quedó cerrada.');
    reload();
  }));
  // "Ya lo reporté": pasa a "Reportados · esperando que se lo lleven" (vuelve si cambia el día de aviso o el vencimiento)
  mark('[data-reported]', 'reported', 'cambio_reportado', 'Cambio reportado al proveedor', 'No se pudo marcar como reportado.');
  // "Ya lo revisé": se apaga la alerta de "Vence pronto"; si llega a vencerse, vuelve a salir en "Vencidos"
  mark('[data-reviewed]', 'reviewed', 'alerta_revisada', 'Alerta revisada (vence pronto)', 'No se pudo marcar como revisado.');

  // "Dar de baja": el producto se elimina (el empleado, solo los suyos)
  document.querySelectorAll('[data-baja]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm(`¿Dar de baja ${button.dataset.name}? Se eliminará del inventario.`)) return;
    button.disabled = true;
    const { error } = await db.from('productos').delete().eq('id', +button.dataset.baja);
    if (error) { button.disabled = false; alert('No se pudo dar de baja.'); return; }
    await audit(me, `Producto dado de baja #${button.dataset.baja}`);
    flash('ok', 'Producto dado de baja.');
    reload();
  }));
}
