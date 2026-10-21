// Secciones que llegan en las próximas etapas de la versión en Supabase
import { start, page } from '../core.js';

const ctx = await start();
if (ctx) page(`<section class="panel calm"><span class="calm-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg></span><h3>En construcción</h3><p>Esta sección llega en la próxima etapa de la versión en Supabase.</p></section>`);
