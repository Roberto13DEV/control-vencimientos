-- 2026-10-21 · Permite eliminar usuarios desde el sistema.
-- La regla "un empleado no puede pasar productos a nombre de otra persona" también frenaba al servidor
-- (clave secreta) al mover los productos del usuario eliminado. Ahora el servidor sí puede; los empleados siguen sin poder.
-- Pégalo en Supabase → SQL Editor → New query → Run.
create or replace function public.productos_dueno() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() and coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then new.usuario_id := auth.uid();
    elsif new.usuario_id is distinct from old.usuario_id then new.usuario_id := old.usuario_id;
    end if;
  end if;
  return new;
end $$;
