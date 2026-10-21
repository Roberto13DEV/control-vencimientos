// Inicio de sesión y, si aún no hay usuarios, creación del administrador (primer acceso)
import { db, e, emailOf, go, audit, enhance, onSubmit } from '../core.js';

const root = document.getElementById('page');
const pending = sessionStorage.getItem('flash');
if (pending) { sessionStorage.removeItem('flash'); const [type, text] = JSON.parse(pending); document.getElementById('flash').innerHTML = `<div class="alert ${type === 'ok' ? 'ok' : 'error'}">${e(text)}</div>`; }

const { data: { session } } = await db.auth.getSession();
if (session) go('/');

let setup = false;
try { setup = (await (await fetch('/api/setup')).json()).necesario === true; } catch { /* sin servidor: se muestra el inicio de sesión */ }

root.innerHTML = `<h1>${setup ? 'Primer acceso' : 'Bienvenido'}</h1><p>${setup ? 'Crea la cuenta administradora.' : 'Ingresa para gestionar tu inventario.'}</p>
<form id="login"><label>Usuario<input name="usuario" required autofocus autocomplete="username"></label><label>Contraseña<input type="password" name="clave" minlength="${setup ? 10 : 1}" required autocomplete="${setup ? 'new-password' : 'current-password'}"></label><button>${setup ? 'Crear administrador' : 'Ingresar'}</button></form>`;
enhance(root);

async function signIn(usuario, clave) {
  const { data, error } = await db.auth.signInWithPassword({ email: emailOf(usuario), password: clave });
  if (error) throw new Error('Datos incorrectos o usuario desactivado.');
  const { data: perfil } = await db.from('perfiles').select('*').eq('id', data.user.id).maybeSingle();
  if (!perfil || !perfil.activo) { await db.auth.signOut(); throw new Error('Tu usuario fue desactivado.'); }
  await audit(perfil, 'Inicio de sesión');
  sessionStorage.clear(); // sin páginas guardadas de otra sesión
  sessionStorage.setItem('perfil', JSON.stringify(perfil));
  sessionStorage.setItem('alert_popup', '1'); // la ventana de alertas se muestra una vez al entrar
  go('/');
}

onSubmit(document.getElementById('login'), async ({ usuario, clave }) => {
  if (setup) {
    const response = await fetch('/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario, clave }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'No se pudo crear el administrador.');
  }
  await signIn(usuario.trim(), clave);
});
