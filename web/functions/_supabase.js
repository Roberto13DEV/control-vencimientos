// Ayudas para las funciones del servidor (Cloudflare Pages Functions).
// Usan la clave secreta de Supabase, que nunca llega al navegador.

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

// Los usuarios entran con su "usuario de acceso"; Supabase Auth necesita un correo, así que se arma uno interno
export const emailOf = (usuario) => `${usuario.toLowerCase()}@control-vencimientos.app`;
export const validUser = (usuario) => /^[a-z0-9._-]{3,50}$/i.test(usuario);
export const clean = (value, max = 100) => String(value ?? '').trim().slice(0, max) || null;

export function supabase(env) {
  const key = env.SUPABASE_SECRET_KEY;
  const call = (base) => async (path, init = {}) => {
    const response = await fetch(`${env.SUPABASE_URL}/${base}/${path}`, {
      ...init,
      headers: { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=representation', ...init.headers },
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { ok: response.ok, status: response.status, body };
  };
  return { rest: call('rest/v1'), auth: call('auth/v1') };
}

// Quién hace la petición: valida su sesión con Supabase y trae su perfil
export async function caller(request, env) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const user = await response.json();
  const { body } = await supabase(env).rest(`perfiles?id=eq.${user.id}&select=*`);
  return Array.isArray(body) && body[0]?.activo ? body[0] : null;
}

export async function audit(env, perfil, accion) {
  await supabase(env).rest('historial', {
    method: 'POST',
    body: JSON.stringify({ usuario_id: perfil.id, usuario: perfil.usuario, accion }),
  });
}

// Crea el usuario en Supabase Auth y su perfil; si el perfil falla, borra el usuario para no dejar restos
export async function createUser(env, { usuario, clave, nombre, area, rol }) {
  const s = supabase(env);
  const created = await s.auth('admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: emailOf(usuario), password: clave, email_confirm: true, user_metadata: { usuario } }),
  });
  if (!created.ok) return { error: created.status === 422 ? 'Ese usuario de acceso ya existe.' : 'No se pudo crear el usuario.' };
  const id = created.body.id;
  const perfil = await s.rest('perfiles', {
    method: 'POST',
    body: JSON.stringify({ id, usuario, nombre: clean(nombre), area: clean(area, 80), rol }),
  });
  if (!perfil.ok) {
    await s.auth(`admin/users/${id}`, { method: 'DELETE' });
    return { error: 'No se pudo guardar el perfil del usuario.' };
  }
  return { perfil: perfil.body[0] };
}
