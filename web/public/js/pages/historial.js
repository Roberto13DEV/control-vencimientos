// Historial: solo los ingresos al sistema (quién entró, qué día y a qué hora)
import { db, e, start, page, displayName } from '../core.js';

const ctx = await start({ adminOnly: true });
if (ctx) {
  const { data: rows = [] } = await db.from('historial')
    .select('fecha,usuario,perfiles(usuario,nombre,area)')
    .eq('accion', 'Inicio de sesión').order('id', { ascending: false }).limit(500);
  const day = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const hour = new Intl.DateTimeFormat('es', { hour: 'numeric', minute: '2-digit', hour12: true });
  const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1).replace(',', '');
  const body = rows.map((r) => {
    const person = r.perfiles || { usuario: r.usuario };
    const at = new Date(r.fecha);
    return `<tr><td><b>${e(displayName(person))}</b><small>${e(['@' + person.usuario, person.area].filter(Boolean).join(' · '))}</small></td><td>${e(capital(day.format(at)))}</td><td>${e(hour.format(at))}</td></tr>`;
  }).join('');
  page(`<section class="panel"><h2>Ingresos al sistema</h2><div class="table"><table><tr><th>Persona</th><th>Día</th><th>Hora</th></tr>
   ${body || '<tr><td colspan="3" class="empty">Todavía no hay ingresos registrados</td></tr>'}</table></div></section>`);
}
