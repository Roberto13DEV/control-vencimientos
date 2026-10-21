// Primer acceso: solo funciona mientras no exista ningún usuario, y crea la cuenta administradora
import { json, supabase, validUser, createUser, audit } from '../_supabase.js';

async function hasUsers(env) {
  const { body } = await supabase(env).rest('perfiles?select=id&limit=1');
  return Array.isArray(body) && body.length > 0;
}

export async function onRequestGet({ env }) {
  return json({ necesario: !(await hasUsers(env)) });
}

export async function onRequestPost({ request, env }) {
  if (await hasUsers(env)) return json({ error: 'El administrador ya fue creado.' }, 403);
  const { usuario = '', clave = '' } = await request.json().catch(() => ({}));
  const login = String(usuario).trim();
  if (!validUser(login)) return json({ error: 'El usuario debe tener entre 3 y 50 letras, números, puntos o guiones, sin espacios.' }, 400);
  if (String(clave).length < 10) return json({ error: 'La contraseña debe tener mínimo 10 caracteres.' }, 400);
  const result = await createUser(env, { usuario: login, clave, rol: 'admin' });
  if (result.error) return json({ error: result.error }, 400);
  await audit(env, result.perfil, 'Administrador creado');
  return json({ ok: true });
}
