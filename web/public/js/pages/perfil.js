// Mi perfil: cada persona ve sus datos y cambia su nombre visible
import { db, e, start, page, displayName, initials, onSubmit, flash, reload } from '../core.js';

const ctx = await start();
if (ctx) {
  const { perfil, admin } = ctx;
  const { data: rows = [] } = await db.from('productos').select('cantidad').eq('usuario_id', perfil.id);
  const units = rows.reduce((sum, r) => sum + r.cantidad, 0);
  page(`<section class="panel profile">
   <div class="profile-top"><span class="avatar">${e(initials(perfil))}</span><div><h2>${e(displayName(perfil))}</h2><p>Usuario de acceso: <b>${e(perfil.usuario)}</b> · ${admin ? 'Administrador' : 'Empleado'} · ${e(perfil.area || 'Sin área')}</p><p>${rows.length} productos registrados · ${units.toLocaleString('es')} unidades</p></div></div>
   <form autocomplete="off" class="grid-form profile-form"><label class="wide">Tu nombre<input name="nombre" value="${e(perfil.nombre)}" maxlength="100"></label><button>Guardar nombre</button></form>
   <p class="hint">Tu nombre se muestra en el menú, en las alertas y en los reportes para que se sepa quién registró cada producto. ${admin ? 'Tu contraseña y tu área se cambian desde Usuarios.' : 'Para cambiar tu contraseña o tu área, pídeselo al administrador.'}</p>
  </section>`);
  onSubmit(document.querySelector('.profile-form'), async ({ nombre }) => {
    const { error } = await db.rpc('guardar_mi_nombre', { nuevo: nombre });
    if (error) throw new Error('No se pudo guardar tu nombre.');
    flash('ok', 'Tu nombre se guardó.');
    reload();
  });
}
