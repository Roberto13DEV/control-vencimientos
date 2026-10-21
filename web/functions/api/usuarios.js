// Administración de usuarios (solo el administrador): crear, editar y activar o desactivar
import { json, supabase, caller, validUser, clean, emailOf, createUser, audit } from '../_supabase.js';

const BANNED = '876000h'; // un usuario desactivado queda bloqueado en Supabase Auth y no puede iniciar sesión

export async function onRequestPost({ request, env }) {
  const me = await caller(request, env);
  if (!me || me.rol !== 'admin') return json({ error: 'Solo el administrador puede hacer esto.' }, 403);
  const body = await request.json().catch(() => ({}));
  const s = supabase(env);

  if (body.accion === 'crear') {
    const usuario = String(body.usuario || '').trim();
    if (!validUser(usuario)) return json({ error: 'El usuario de acceso debe tener entre 3 y 50 letras, números, puntos o guiones, sin espacios.' }, 400);
    if (String(body.clave || '').length < 10) return json({ error: 'La contraseña debe tener mínimo 10 caracteres.' }, 400);
    const rol = body.rol === 'admin' ? 'admin' : 'empleado';
    const result = await createUser(env, { usuario, clave: body.clave, nombre: body.nombre, area: body.area, rol });
    if (result.error) return json({ error: result.error }, 400);
    await audit(env, me, `Usuario creado: ${usuario}${body.area ? ` (${clean(body.area, 80)})` : ''}`);
    return json({ ok: true, mensaje: 'Usuario creado.' });
  }

  const id = String(body.id || '');
  const found = await s.rest(`perfiles?id=eq.${encodeURIComponent(id)}&select=*`);
  const target = Array.isArray(found.body) ? found.body[0] : null;
  if (!target) return json({ error: 'El usuario no existe.' }, 404);

  if (body.accion === 'editar') {
    const usuario = String(body.usuario || '').trim();
    const clave = String(body.clave || '');
    if (!validUser(usuario)) return json({ error: 'El usuario de acceso debe tener entre 3 y 50 letras, números, puntos o guiones, sin espacios.' }, 400);
    if (clave && clave.length < 10) return json({ error: 'La contraseña nueva debe tener mínimo 10 caracteres.' }, 400);
    if (usuario.toLowerCase() !== target.usuario.toLowerCase()) {
      const taken = await s.rest(`perfiles?usuario=ilike.${encodeURIComponent(usuario)}&select=id`);
      if (Array.isArray(taken.body) && taken.body.length) return json({ error: 'Ese usuario de acceso ya lo tiene otra persona.' }, 400);
    }
    const authChanges = {};
    if (usuario !== target.usuario) Object.assign(authChanges, { email: emailOf(usuario), email_confirm: true });
    if (clave) authChanges.password = clave;
    if (Object.keys(authChanges).length) {
      const updated = await s.auth(`admin/users/${id}`, { method: 'PUT', body: JSON.stringify(authChanges) });
      if (!updated.ok) return json({ error: 'No se pudo actualizar el acceso del usuario.' }, 400);
    }
    const nombre = clean(body.nombre);
    const area = clean(body.area, 80);
    const saved = await s.rest(`perfiles?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ usuario, nombre, area }) });
    if (!saved.ok) return json({ error: 'No se pudo guardar el usuario.' }, 400);
    await audit(env, me, `Usuario editado: ${usuario} · ${nombre || 'sin nombre'} · ${area || 'sin área'}${clave ? ' · contraseña cambiada' : ''}`);
    return json({ ok: true, mensaje: 'Usuario actualizado.' });
  }

  if (body.accion === 'estado') {
    if (target.id === me.id) return json({ error: 'No puedes desactivar tu propio usuario.' }, 400);
    const activo = !target.activo;
    await s.auth(`admin/users/${id}`, { method: 'PUT', body: JSON.stringify({ ban_duration: activo ? 'none' : BANNED }) });
    await s.rest(`perfiles?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ activo }) });
    await audit(env, me, `Usuario ${activo ? 'activado' : 'desactivado'}: ${target.usuario}`);
    return json({ ok: true, mensaje: activo ? 'Usuario activado.' : 'Usuario desactivado.' });
  }

  // Eliminar: sus productos pasan al administrador que elimina (no se pierde inventario); el historial se conserva
  if (body.accion === 'eliminar') {
    if (target.id === me.id) return json({ error: 'No puedes eliminar tu propio usuario.' }, 400);
    const moved = await s.rest(`productos?usuario_id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ usuario_id: me.id }) });
    if (!moved.ok) return json({ error: 'No se pudieron pasar sus productos a tu nombre; no se eliminó nada.' }, 400);
    const removed = await s.auth(`admin/users/${id}`, { method: 'DELETE' });
    if (!removed.ok) return json({ error: 'No se pudo eliminar el usuario.' }, 400);
    const count = Array.isArray(moved.body) ? moved.body.length : 0;
    await audit(env, me, `Usuario eliminado: ${target.usuario}${count ? ` · ${count} productos pasaron a ${me.usuario}` : ''}`);
    return json({ ok: true, mensaje: count ? `Usuario eliminado. Sus ${count} productos ahora están a tu nombre.` : 'Usuario eliminado.' });
  }

  return json({ error: 'Acción no válida.' }, 400);
}
