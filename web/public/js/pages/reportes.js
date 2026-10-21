// Reportes: vencimientos de un mes (todos, por vencer o vencidos), de una persona o de todas, con descarga en PDF
import { db, e, paint, displayName, today, daysBetween, dmy, params, ownerParam, byOwner, DIAS_PROXIMO, DIAS_CRITICO } from '../core.js';

export default async function render(ctx, signal) {
  // Si se cambia de sección mientras carga, este dibujo se cancela
  const page = (html) => { if (signal.aborted) throw new DOMException('Cancelado', 'AbortError'); paint(html); };
  const { perfil: me, admin } = ctx;
  const day = today();
  const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const types = { todos: 'Todos los del mes', por_vencer: 'Por vencer', vencidos: 'Vencidos' };
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get('mes') || '') ? params.get('mes') : day.slice(0, 7);
  const tipo = types[params.get('tipo')] ? params.get('tipo') : 'todos';
  const from = `${mes}-01`;
  const lastDay = new Date(+mes.slice(0, 4), +mes.slice(5, 7), 0).getDate();
  const to = `${mes}-${String(lastDay).padStart(2, '0')}`;

  // El estado (vencido / por vencer) se calcula respecto a hoy, no al mes elegido
  let query = byOwner(ctx, db.from('productos').select('producto,categoria,proveedor,lote,cantidad,tiene_cambio,fecha_cambio,vencimiento,perfiles(usuario,nombre)'))
    .gte('vencimiento', from).lte('vencimiento', to).order('vencimiento').order('producto');
  if (tipo === 'por_vencer') query = query.gte('vencimiento', day);
  if (tipo === 'vencidos') query = query.lt('vencimiento', day);
  const ownerId = admin ? ownerParam() : me.id;
  const [{ data: found = [] }, { data: team = [] }, { data: person }] = await Promise.all([
    query,
    admin ? db.from('perfiles').select('id,usuario,nombre,area') : Promise.resolve({ data: [] }),
    ownerId ? db.from('perfiles').select('usuario,nombre,area').eq('id', ownerId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  team.sort((a, b) => displayName(a).localeCompare(displayName(b)));
  const rows = found.map((r) => ({ ...r, dias: daysBetween(day, r.vencimiento), responsable: displayName(r.perfiles || {}) }));
  const expired = rows.filter((r) => r.dias < 0);
  const units = (list) => list.reduce((sum, r) => sum + r.cantidad, 0);
  const hasLot = rows.some((r) => r.lote);
  const showOwner = admin && !ownerParam();
  const tone = (d) => (d <= DIAS_CRITICO ? 'crit' : d <= DIAS_PROXIMO ? 'warn' : 'ok');
  const label = (d) => (d < 0 ? 'Vencido' : d <= DIAS_CRITICO ? 'Crítico' : d <= DIAS_PROXIMO ? 'Próximo' : 'Vigente');
  const daysText = (d) => (d < 0 ? `hace ${-d} d` : d === 0 ? 'Hoy' : `${d} d`);
  const monthName = `${monthNames[+mes.slice(5, 7) - 1]} ${mes.slice(0, 4)}`;
  const title = `Reporte de vencimientos · ${monthName.charAt(0).toUpperCase() + monthName.slice(1)}`;
  const subtitle = `${types[tipo]} · del 1 al ${lastDay} de ${monthName}`;
  // De quién es el reporte: la persona elegida (o uno mismo, si es empleado) o todas
  const personName = person ? displayName(person) + (person.area ? ' · ' + person.area : '') : null;
  const colaborador = `Colaborador: ${personName || 'todas las personas'}`;
  const now = new Date();
  const generated = `${dmy(day)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const lineOf = (r) => [r.categoria, showOwner ? r.responsable || 'Sin responsable' : ''].filter(Boolean).join(' · ');
  const emptyText = `No hay productos ${tipo === 'vencidos' ? 'vencidos' : tipo === 'por_vencer' ? 'por vencer' : 'que venzan'} en ${monthName}.`;

  const personSelect = admin ? `<label>Persona<select name="usuario" data-auto><option value="">Todas las personas</option>${team.map((t) => `<option value="${t.id}"${ownerParam() === t.id ? ' selected' : ''}>${e(displayName(t) + (t.area ? ' · ' + t.area : ''))}</option>`).join('')}</select></label>` : '';
  page(`<section class="panel report-form"><form autocomplete="off" class="report-filters">
     <label>Mes<input type="month" name="mes" data-auto value="${mes}" required></label>${personSelect}
     <label>Mostrar<select name="tipo" data-auto>${Object.entries(types).map(([key, text]) => `<option value="${key}"${key === tipo ? ' selected' : ''}>${text}</option>`).join('')}</select></label>
     <button>Ver reporte</button><button type="button" class="ghost" id="pdf">Descargar PDF</button></form></section>
   <article class="report">
    <header class="report-head"><div><b class="report-brand">VENCE<span>+</span></b><h2>${e(title)}</h2><p class="report-who">${e(colaborador)}</p><p>${e(subtitle)}</p></div><div class="report-meta"><span>Generado el ${generated}</span><span>Por ${e(displayName(me))}</span></div></header>
    <div class="report-kpis"><div><small>Productos</small><b>${rows.length}</b></div><div><small>Unidades</small><b>${units(rows).toLocaleString('es')}</b></div>
     <div class="t-crit"><small>Vencidos</small><b>${expired.length}</b><small>${units(expired)} unidades</small></div><div class="t-warn"><small>Por vencer</small><b>${rows.length - expired.length}</b><small>${units(rows) - units(expired)} unidades</small></div></div>
    ${!rows.length ? `<p class="report-empty">${e(emptyText)}</p>` : `<div class="table"><table><thead><tr><th>Producto</th><th>Proveedor</th>${hasLot ? '<th>Lote</th>' : ''}<th class="num">Cant.</th><th>Vence</th><th>Días</th><th>Estado</th><th>Pedir cambio</th></tr></thead><tbody>
     ${rows.map((r) => `<tr class="t-${tone(r.dias)}"><td><b>${e(r.producto)}</b>${lineOf(r) ? `<small>${e(lineOf(r))}</small>` : ''}</td><td>${e(r.proveedor || '—')}</td>${hasLot ? `<td>${e(r.lote || '—')}</td>` : ''}<td class="num">${r.cantidad}</td><td>${dmy(r.vencimiento)}</td><td>${daysText(r.dias)}</td><td><span class="pill">${label(r.dias)}</span></td><td>${r.tiene_cambio ? dmy(r.fecha_cambio) : '—'}</td></tr>`).join('')}
     </tbody></table></div>`}
    <footer class="report-foot">Control de Vencimientos · VENCE+ — Estados calculados al ${dmy(day)}.</footer>
   </article>`);

  // ---------- PDF (A4), generado en el navegador con jsPDF; sin columnas de Estado ni Pedir cambio ----------
  const slug = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const fileName = `reporte-vencimientos-${mes}${tipo === 'todos' ? '' : '-' + tipo.replace('_', '-')}${person && admin ? '-' + slug(displayName(person)) : ''}.pdf`;
  const loadPdf = () => window.jspdf ? Promise.resolve(window.jspdf) : new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.onload = () => resolve(window.jspdf);
    script.onerror = () => reject(new Error('No se pudo cargar el generador de PDF. Revisa tu conexión a internet.'));
    document.head.appendChild(script);
  });

  document.getElementById('pdf').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const { jsPDF } = await loadPdf();
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const C = { ink: [17, 18, 20], muted: [122, 127, 135], line: [236, 238, 240], sunken: [245, 246, 247], crit: [255, 90, 31], warn: [242, 161, 58] };
      const t = (text) => String(text ?? '').replace(/—/g, '-'); // la fuente estándar del PDF no tiene la raya larga
      const font = (style, size, color) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color); };
      // Texto centrado verticalmente en una "celda" (como en la versión PHP con FPDF)
      const cell = (x, y, w, h, text, align = 'left') => doc.text(t(text), align === 'right' ? x + w : x, y + h / 2 + doc.getFontSize() * 0.3528 * 0.35, { align });
      const fit = (text, width) => { let s = t(text); if (doc.getTextWidth(s) <= width) return s; while (s && doc.getTextWidth(s + '...') > width) s = s.slice(0, -1); return s + '...'; };

      // Encabezado
      font('bold', 15, C.ink); cell(15, 15, 30, 7, 'VENCE'); const plusX = 15 + doc.getTextWidth('VENCE'); doc.setTextColor(...C.crit); cell(plusX, 15, 5, 7, '+');
      font('normal', 9, C.muted); cell(15, 16, 180, 5, `Generado el ${generated}`, 'right'); cell(15, 21, 180, 5, `Por ${displayName(me)}`, 'right');
      font('bold', 17, C.ink); cell(15, 27, 180, 8, title);
      font('bold', 10, C.ink); cell(15, 35, 180, 5, colaborador);
      font('normal', 9.5, C.muted); cell(15, 40, 180, 5, subtitle);
      doc.setLineWidth(0.6); doc.setDrawColor(...C.ink); doc.line(15, 49, 195, 49);

      // Totales
      const kpis = [['Productos', String(rows.length), '', null], ['Unidades', units(rows).toLocaleString('es'), '', null],
        ['Vencidos', String(expired.length), `${units(expired).toLocaleString('es')} unidades`, 'crit'], ['Por vencer', String(rows.length - expired.length), `${(units(rows) - units(expired)).toLocaleString('es')} unidades`, 'warn']];
      kpis.forEach(([name, value, note, tn], i) => {
        const x = 15 + i * 46; const y = 55;
        doc.setFillColor(...C.sunken); doc.rect(x, y, 42, 20, 'F');
        if (tn) { doc.setFillColor(...C[tn]); doc.rect(x, y, 1.2, 20, 'F'); }
        font('normal', 8, C.muted); cell(x + 4, y + 2.5, 36, 4, name);
        font('bold', 15, C.ink); cell(x + 4, y + 6.5, 36, 7, value);
        if (note) { font('normal', 7.5, C.muted); cell(x + 4, y + 13.5, 36, 4, note); }
      });

      // Tabla
      const cols = [['producto', 'Producto', hasLot ? 89 : 105, 'left'], ['proveedor', 'Proveedor', 26, 'left'], ...(hasLot ? [['lote', 'Lote', 16, 'left']] : []),
        ['cantidad', 'Cant.', 12, 'right'], ['vence', 'Vence', 20, 'left'], ['dias', 'Días', 17, 'left']];
      let y = 83;
      const tableHead = () => {
        font('bold', 8, C.muted); let x = 15;
        cols.forEach(([, name, w, align]) => { cell(x, y, align === 'right' ? w - 3 : w, 7, name, align); x += w; });
        y += 7; doc.setLineWidth(0.2); doc.setDrawColor(...C.line); doc.line(15, y, 195, y);
      };
      if (!rows.length) { font('normal', 11, C.muted); doc.text(t(emptyText), 105, 101, { align: 'center' }); }
      else {
        tableHead();
        rows.forEach((r) => {
          const h = 11;
          if (y + h > 297 - 20) { doc.addPage(); y = 15; tableHead(); }
          const values = { proveedor: r.proveedor || '—', lote: r.lote || '—', cantidad: String(r.cantidad), vence: dmy(r.vencimiento), dias: daysText(r.dias) };
          let x = 15;
          cols.forEach(([key, , w, align]) => {
            if (key === 'producto') {
              font('bold', 9, C.ink); cell(x + 1, y + 1.5, w - 2, 4, fit(r.producto, w - 3));
              if (lineOf(r)) { font('normal', 7.5, C.muted); cell(x + 1, y + 5.6, w - 2, 4, fit(lineOf(r), w - 3)); }
            } else {
              font('normal', 9, C.ink); cell(x, y + 3, w - (align === 'right' ? 3 : 1), 5, fit(values[key], w - 2), align);
            }
            x += w;
          });
          y += h; doc.setDrawColor(...C.line); doc.line(15, y, 195, y);
        });
      }

      // Pie de página en todas las hojas
      const pages = doc.getNumberOfPages();
      for (let p = 1; p <= pages; p += 1) {
        doc.setPage(p); font('normal', 8, C.muted);
        cell(15, 297 - 13, 180, 5, `Control de Vencimientos · VENCE+ - Datos al ${dmy(day)}`);
        cell(15, 297 - 13, 180, 5, `Página ${p} de ${pages}`, 'right');
      }
      doc.setProperties({ title, author: displayName(me) });
      doc.save(fileName);
    } catch (error) {
      alert(error.message || 'No se pudo generar el PDF.');
    } finally {
      button.disabled = false;
    }
  });
}
