-- 2026-10-21 · Alertas que se pueden cerrar y "Dar de baja" para los empleados.
-- Pégalo en Supabase → SQL Editor → New query → Run. Debe decir "Success. No rows returned".

-- 1) "Ya lo revisé": la alerta de "Vence pronto" se apaga, pero el producto sigue en el inventario
alter table public.productos add column if not exists alerta_revisada timestamptz;

-- 2) Si cambia el vencimiento, las alertas vuelven a quedar pendientes (también la de "Ya lo revisé")
create or replace function public.productos_antes_de_actualizar() returns trigger
language plpgsql as $$
begin
  new.actualizado := now();
  if new.fecha_cambio is distinct from old.fecha_cambio or new.vencimiento <> old.vencimiento then
    new.cambio_reportado := null;
  end if;
  if new.vencimiento <> old.vencimiento then
    new.alerta_revisada := null;
  end if;
  if not new.tiene_cambio then
    new.fecha_cambio := null;
  end if;
  return new;
end $$;

-- 3) "Dar de baja": cada empleado puede eliminar sus propios productos; el administrador, cualquiera
drop policy if exists productos_eliminar on public.productos;
create policy productos_eliminar on public.productos for delete to authenticated
  using (esta_activo() and (es_admin() or usuario_id = auth.uid()));
