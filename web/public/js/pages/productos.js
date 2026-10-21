// Productos: registrar, ver agrupados por producto (con sus fechas debajo), editar, agregar vencimientos y eliminar
import { db, e, start, page, onSubmit, flash, reload, audit, displayName, today, daysBetween, dmy, DIAS_PROXIMO, params, ownerParam, byOwner, viewingBanner } from '../core.js';

const ctx = await start();
if (ctx) {
  const { perfil: me, admin } = ctx;
  const filtered = await viewingBanner(ctx);
  const q = (params.get('q') || '').trim();

  let query = byOwner(ctx, db.from('productos').select('*, perfiles(usuario,nombre,area)'));
  if (q) {
    const like = `"%${q.replace(/["\\%]/g, '')}%"`;
    query = query.or(`producto.ilike.${like},codigo.ilike.${like},categoria.ilike.${like},lote.ilike.${like}`);
  }
  const [{ data: rows = [] }, { data: team = [] }] = await Promise.all([
    query,
    admin ? db.from('perfiles').select('id,usuario,nombre,area').eq('activo', true) : Promise.resolve({ data: [] }),
  ]);
  team.sort((a, b) => displayName(a).localeCompare(displayName(b)));

  // Un producto con varias fechas de vencimiento se muestra una sola vez y sus fechas se despliegan debajo
  const day = today();
  rows.forEach((r) => { r.grupo = r.producto_origen_id ?? r.id; r.dias = daysBetween(day, r.vencimiento); });
  rows.sort((a, b) => a.producto.localeCompare(b.producto) || a.grupo - b.grupo || a.vencimiento.localeCompare(b.vencimiento));
  const groups = new Map();
  rows.forEach((r) => { if (!groups.has(r.grupo)) groups.set(r.grupo, []); groups.get(r.grupo).push(r); });

  const cols = admin ? 7 : 6;
  const meta = (r) => [r.codigo, r.categoria, r.lote ? `Lote ${r.lote}` : ''].filter(Boolean).join(' · ');
  const badge = (d) => `<b class="badge ${d < 0 ? 'bad' : d <= DIAS_PROXIMO ? 'warn' : 'good'}">${d < 0 ? 'Vencido' : d <= DIAS_PROXIMO ? 'Próximo' : 'Vigente'}</b>`;
  const exchange = (r) => !r.tiene_cambio ? 'No'
    : !r.fecha_cambio ? 'Sí<small class="missing">Falta elegir el día de aviso</small>'
    : `Sí<small>Avisar el ${dmy(r.fecha_cambio)}${r.cambio_reportado ? ' · reportado' : ''}</small>`;
  const owner = (r) => (admin ? `<td><b class="owner-name">${e(displayName(r.perfiles || {}))}</b><small>${e(r.perfiles?.area || 'Sin área')}</small></td>` : '');
  const exchangeFields = (r, withDate) => `<label class="exchange-check"><input type="checkbox" name="tiene_cambio" value="1"${r.tiene_cambio ? ' checked' : ''}> Tiene cambio con proveedor</label><label class="exchange-date">¿Qué día te aviso para pedir el cambio?<input type="date" name="fecha_cambio" value="${withDate ? e(r.fecha_cambio) : ''}"></label>`;
  const edit = (r) => `<details class="add-expiry"><summary>Editar</summary><form autocomplete="off" data-action="editar" data-id="${r.id}" data-group="${r.grupo}" data-title="Editar producto">
    <label>Producto<input name="producto" value="${e(r.producto)}" required></label><label>Categoría<input name="categoria" value="${e(r.categoria)}"></label><label>Proveedor<input name="proveedor" value="${e(r.proveedor)}"></label>
    <label>Cantidad<input type="number" name="cantidad" min="0" value="${r.cantidad}" required></label><label>Vencimiento<input type="date" name="vencimiento" value="${e(r.vencimiento)}" required></label>${exchangeFields(r, true)}<button>Guardar cambios</button></form></details>`;
  const add = (r) => `<details class="add-expiry"><summary>+ Vencimiento</summary><form autocomplete="off" data-action="agregar" data-id="${r.id}" data-title="Agregar otro vencimiento a ${e(r.producto)}">
    <label>Cantidad<input type="number" name="cantidad" min="0" value="0" required></label><label>Nueva fecha<input type="date" name="vencimiento" required></label>${exchangeFields(r, false)}<button>Agregar</button></form></details>`;
  const remove = (r) => (admin ? `<div class="inline-delete"><button type="button" class="delete" data-delete="${r.id}">Eliminar</button></div>` : '');

  let body = '';
  if (!groups.size) {
    body = `<tbody><tr><td colspan="${cols}" class="empty">${q || filtered
      ? `No hay productos${filtered ? ' de ' + e(displayName(filtered)) : ''}${q ? ' que coincidan con «' + e(q) + '»' : ''}. <a class="link" href="/productos">Quitar filtros</a>`
      : 'No hay productos registrados'}</td></tr></tbody>`;
  }
  groups.forEach((dates, gid) => {
    const first = dates[0];
    if (dates.length === 1) {
      body += `<tbody><tr><td><strong>${e(first.producto)}</strong><small>${e(meta(first))}</small></td><td>${first.cantidad}</td><td>${dmy(first.vencimiento)}</td><td>${exchange(first)}</td><td>${badge(first.dias)}</td>${owner(first)}<td>${edit(first)} ${add(first)}${remove(first)}</td></tr></tbody>`;
      return;
    }
    // Fila resumen: unidades totales, la fecha que vence primero y el estado de la fecha más urgente
    const total = dates.reduce((sum, r) => sum + r.cantidad, 0);
    const soonest = Math.min(...dates.map((r) => r.dias));
    const notices = dates.map((r) => r.fecha_cambio).filter(Boolean).sort();
    const withExchange = dates.filter((r) => r.tiene_cambio).length;
    const missing = dates.filter((r) => r.tiene_cambio && !r.fecha_cambio).length;
    const open = q !== '';
    body += `<tbody class="group${open ? ' open' : ''}" id="grupo-${gid}">
     <tr class="group-head"><td><button type="button" class="group-toggle" aria-expanded="${open}" aria-controls="grupo-${gid}"><span class="chev" aria-hidden="true"></span><span><strong>${e(first.producto)}</strong><small>${e([first.codigo, first.categoria].filter(Boolean).join(' · '))}</small></span><span class="dates-chip">${dates.length} fechas</span></button></td>
      <td><b>${total}</b><small>en total</small></td><td>${dmy(first.vencimiento)}<small>vence primero</small></td>
      <td>${!withExchange ? 'No' : missing ? `Sí<small class="missing">Falta el día en ${missing} ${missing === 1 ? 'fecha' : 'fechas'}</small>` : `Sí<small>Próximo aviso: ${dmy(notices[0])}</small>`}</td>
      <td>${badge(soonest)}</td>${owner(first)}<td>${add(first)}</td></tr>
     ${dates.map((r, i) => `<tr class="group-row"><td><span class="date-mark">Fecha ${i + 1}</span>${r.lote ? `<small>Lote ${e(r.lote)}</small>` : ''}</td><td>${r.cantidad}</td><td>${dmy(r.vencimiento)}</td><td>${exchange(r)}</td><td>${badge(r.dias)}</td>${admin ? '<td></td>' : ''}<td>${edit(r)}${remove(r)}</td></tr>`).join('')}
    </tbody>`;
  });

  const personSelect = admin ? `<select name="usuario" aria-label="Persona" onchange="this.form.q.value='';this.form.submit()"><option value="">Todas las personas</option>${team.map((t) => `<option value="${t.id}"${ownerParam() === t.id ? ' selected' : ''}>${e(displayName(t) + (t.area ? ' · ' + t.area : ''))}</option>`).join('')}</select>` : '';
  page(`<section class="panel"><h2>Nuevo producto</h2><form autocomplete="off" class="grid-form product-form" id="new-product">
     <label class="wide">Producto<input name="producto" required></label><label>Categoría<input name="categoria"></label><label>Proveedor<input name="proveedor"></label>
     <label>Cantidad<input type="number" name="cantidad" min="0" value="0" required></label><label>Vencimiento<input type="date" name="vencimiento" required></label>
     <label class="exchange-check"><input type="checkbox" name="tiene_cambio" value="1"> Tiene cambio con proveedor</label><label class="exchange-date">¿Qué día te aviso para pedir el cambio?<input type="date" name="fecha_cambio"></label><button>Guardar producto</button></form></section>
   <section class="panel"><div class="panel-head"><h2>Inventario y vencimientos</h2><form autocomplete="off" class="search"><input name="q" value="${e(q)}" placeholder="Buscar producto o categoría">${personSelect}<button>Buscar</button></form></div>
   <div class="table"><table class="products"><thead><tr><th>Producto</th><th>Cantidad</th><th>Vencimiento</th><th>Cambio</th><th>Estado</th>${admin ? '<th>Responsable</th>' : ''}<th>Acciones</th></tr></thead>${body}</table></div></section>`);

  // ---------- Guardar ----------
  const text = (value) => String(value ?? '').trim() || null;
  // Si tiene cambio con proveedor, el día de aviso es obligatorio y no puede ser después del vencimiento
  const exchangeData = (data) => {
    const tiene = data.tiene_cambio === '1';
    if (!tiene) return { tiene_cambio: false, fecha_cambio: null };
    if (!data.fecha_cambio) throw new Error('Pon la fecha en que quieres que te avise para pedir el cambio.');
    if (data.fecha_cambio > data.vencimiento) throw new Error('La fecha para pedir el cambio no puede ser después del vencimiento.');
    return { tiene_cambio: true, fecha_cambio: data.fecha_cambio };
  };
  const done = (message) => { flash('ok', message); reload(); };
  const check = ({ error }, message) => { if (error) throw new Error(message); };

  onSubmit(document.getElementById('new-product'), async (data) => {
    const producto = text(data.producto);
    if (!producto || !data.vencimiento) throw new Error('Completa nombre y una fecha válida.');
    check(await db.from('productos').insert({ producto, categoria: text(data.categoria), proveedor: text(data.proveedor), cantidad: Math.max(0, +data.cantidad || 0), vencimiento: data.vencimiento, ...exchangeData(data) }), 'No se pudo guardar el producto.');
    await audit(me, `Producto registrado: ${producto}`);
    done('Producto guardado.');
  });

  document.querySelectorAll('form[data-action="editar"]').forEach((form) => onSubmit(form, async (data) => {
    const producto = text(data.producto);
    if (!producto || !data.vencimiento) throw new Error('Completa nombre y una fecha válida.');
    const id = +form.dataset.id;
    const group = +form.dataset.group;
    const cambio = exchangeData(data);
    // Nombre, categoría y proveedor valen para todas las fechas del producto; lo demás solo para esta fecha
    check(await db.from('productos').update({ producto, categoria: text(data.categoria), proveedor: text(data.proveedor) }).or(`id.eq.${group},producto_origen_id.eq.${group}`), 'No se pudo actualizar el producto.');
    check(await db.from('productos').update({ cantidad: Math.max(0, +data.cantidad || 0), vencimiento: data.vencimiento, ...cambio }).eq('id', id), 'No se pudo actualizar esta fecha.');
    await audit(me, `Producto editado: ${producto} #${id}`);
    done('Producto actualizado.');
  }));

  document.querySelectorAll('form[data-action="agregar"]').forEach((form) => onSubmit(form, async (data) => {
    if (!data.vencimiento) throw new Error('Selecciona una fecha válida.');
    const source = rows.find((r) => r.id === +form.dataset.id);
    check(await db.from('productos').insert({
      codigo: source.codigo, producto: source.producto, categoria: source.categoria, proveedor: source.proveedor,
      cantidad: Math.max(0, +data.cantidad || 0), vencimiento: data.vencimiento, producto_origen_id: source.grupo, usuario_id: source.usuario_id, ...exchangeData(data),
    }), 'No se pudo agregar la fecha.');
    await audit(me, `Nuevo vencimiento agregado al producto #${source.id}`);
    done('Nueva fecha de vencimiento agregada.');
  }));

  document.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm('¿Eliminar este vencimiento?')) return;
    button.disabled = true;
    const { error } = await db.from('productos').delete().eq('id', +button.dataset.delete);
    if (error) { button.disabled = false; alert('No se pudo eliminar.'); return; }
    await audit(me, `Producto eliminado #${button.dataset.delete}`);
    done('Producto eliminado.');
  }));

  // Clic en un producto con varias fechas para desplegarlas o recogerlas
  document.addEventListener('click', (event) => {
    const toggle = event.target.closest?.('.group-toggle');
    if (!toggle) return;
    const group = document.getElementById(toggle.getAttribute('aria-controls'));
    const open = !group.classList.contains('open');
    group.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });
}
