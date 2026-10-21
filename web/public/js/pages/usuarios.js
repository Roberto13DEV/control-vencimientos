// Usuarios (solo administrador): crear, editar y desactivar; una tarjeta por persona con sus números
import { db, e, start, page, api, displayName, initials, onSubmit, flash, reload, today, addDays, DIAS_PROXIMO } from '../core.js';

const ctx = await start({ adminOnly: true });
if (ctx) {
  const { perfil: me } = ctx;
  const [{ data: people = [] }, { data: products = [] }] = await Promise.all([
    db.from('perfiles').select('*'),
    db.from('productos').select('usuario_id,cantidad,vencimiento'),
  ]);
  const day = today();
  const limit = addDays(day, DIAS_PROXIMO);
  const stats = (id) => {
    const mine = products.filter((p) => p.usuario_id === id);
    return {
      productos: mine.length,
      vencidos: mine.filter((p) => p.vencimiento < day).length,
      porVencer: mine.filter((p) => p.vencimiento >= day && p.vencimiento <= limit).length,
      unidades: mine.reduce((sum, p) => sum + p.cantidad, 0),
    };
  };
  // Activos primero, luego por área y por nombre
  people.sort((a, b) => (b.activo - a.activo) || ((a.area ? 0 : 1) - (b.area ? 0 : 1)) || (a.area || '').localeCompare(b.area || '') || displayName(a).localeCompare(displayName(b)));

  const card = (u) => {
    const s = stats(u.id);
    const tone = s.vencidos ? 'crit' : s.porVencer ? 'warn' : 'ok';
    return `<article class="member t-${tone}${u.activo ? '' : ' off'}">
     <div class="member-top"><span class="avatar">${e(initials(u))}</span><div><b>${e(displayName(u))}</b><small>@${e(u.usuario)} · ${u.rol === 'admin' ? 'Administrador' : 'Empleado'}${u.activo ? '' : ' · Inactivo'}</small></div><span class="area-pill">${e(u.area || 'Sin área')}</span></div>
     <div class="member-stats"><div><b>${s.productos}</b><small>Productos</small></div><div class="t-warn"><b>${s.porVencer}</b><small>Por vencer</small></div><div class="t-crit"><b>${s.vencidos}</b><small>Vencidos</small></div><div><b>${s.unidades.toLocaleString('es')}</b><small>Unidades</small></div></div>
     <div class="member-actions">
      <a href="/?usuario=${u.id}">Resumen</a><a href="/productos?usuario=${u.id}">Productos</a><a href="/reportes?usuario=${u.id}">Reporte</a>
      <details class="add-expiry"><summary>Editar</summary><form autocomplete="off" class="user-edit" data-id="${u.id}" data-title="Editar a ${e(displayName(u))}">
       <label>Nombre<input name="nombre" maxlength="100" value="${e(u.nombre)}"></label>
       <label>Usuario de acceso<input name="usuario" minlength="3" maxlength="50" required value="${e(u.usuario)}"></label>
       <label>Área<input name="area" maxlength="80" value="${e(u.area)}"></label>
       <label>Contraseña nueva<input type="password" name="clave" minlength="10" autocomplete="new-password"></label>
       <p class="hint">Deja la contraseña vacía si no quieres cambiarla. Mínimo 10 caracteres.</p><button>Guardar</button></form></details>
      ${u.id === me.id ? '' : `<div class="inline-delete"><button type="button" class="toggle${u.activo ? ' delete' : ''}" data-id="${u.id}" data-active="${u.activo ? 1 : 0}">${u.activo ? 'Desactivar' : 'Activar'}</button></div>`}
     </div></article>`;
  };

  page(`<section class="panel"><h2>Nuevo usuario</h2><form autocomplete="off" class="grid-form user-form" id="new-user">
    <label>Nombre<input name="nombre" maxlength="100"></label>
    <label>Usuario de acceso<input name="usuario" minlength="3" maxlength="50" required></label>
    <label>Contraseña<input type="password" name="clave" minlength="10" autocomplete="new-password" placeholder="Mínimo 10 caracteres" required></label>
    <label>Área<input name="area" maxlength="80"></label>
    <label>Rol<select name="rol"><option value="empleado">Empleado</option><option value="admin">Administrador</option></select></label>
    <button>Crear usuario</button></form>
    <p class="hint">Cada empleado solo verá y registrará sus propios productos. Tú, como administrador, ves los de todos. El usuario de acceso solo puede tener letras, números, puntos o guiones, sin espacios.</p></section>
   <section class="team-head"><div><h2>Equipo</h2><p>${people.length} usuarios · por vencer en ${DIAS_PROXIMO} días o menos</p></div></section>
   <div class="team">${people.map(card).join('')}</div>`);

  onSubmit(document.getElementById('new-user'), async (data) => {
    const result = await api('usuarios', { accion: 'crear', ...data });
    flash('ok', result.mensaje);
    reload();
  });
  document.querySelectorAll('.user-edit').forEach((form) => onSubmit(form, async (data) => {
    const result = await api('usuarios', { accion: 'editar', id: form.dataset.id, ...data });
    flash('ok', result.mensaje);
    reload();
  }));
  document.querySelectorAll('.toggle').forEach((button) => button.addEventListener('click', async () => {
    if (button.dataset.active === '1' && !confirm('¿Desactivar este usuario? Ya no podrá ingresar.')) return;
    button.disabled = true;
    try {
      const result = await api('usuarios', { accion: 'estado', id: button.dataset.id });
      flash('ok', result.mensaje);
      reload();
    } catch (error) {
      button.disabled = false;
      alert(error.message);
    }
  }));
}
