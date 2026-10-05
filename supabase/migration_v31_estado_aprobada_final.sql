-- v31 · La venta termina en "aprobada"
--
-- La máquina de estados queda:
--
--   borrador → pendiente_aprobacion → aprobada
--                                   ↘ rechazada
--
-- `en_oic` quería decir "en producción", pero era un estado que no cambiaba
-- nada: lo que mueve la producción son las tareas de arte y operaciones, las
-- fechas reales y la asignación de buses. Ninguna pantalla lo seteaba —sólo se
-- llegaba por API— y el nombre hablaba del papel (la OIC) en vez de la etapa.
--
-- `facturada` y `cobrada` ya habían salido de la máquina: hoy son fechas que
-- administración carga en paralelo, sin frenar la producción.
--
-- Las filas que quedaron en esos estados pasan a `aprobada`, que es lo que
-- significan todas: la venta está cerrada y la campaña sigue su curso. La
-- factura y el cobro no se pierden, viven en fecha_facturacion / fecha_cobro.
--
-- Idempotente: en la segunda corrida no queda ninguna fila para mover, así que
-- no actualiza ni anota nada.

-- Las tres partes ven la misma foto de la tabla, así que `previas` conserva el
-- estado viejo aunque el update ya haya corrido.
with previas as (
  select id, estado
    from ordenes_venta
   where estado in ('en_oic', 'facturada', 'cobrada')
),
movidas as (
  update ordenes_venta
     set estado     = 'aprobada',
         updated_at = now()
   where id in (select id from previas)
  returning id
)
insert into orden_historial (orden_id, estado_anterior, estado_nuevo, comentario)
select p.id, p.estado, 'aprobada',
       'Estado unificado en "aprobada": la producción se sigue por tareas y fechas reales'
  from previas p
 where exists (select 1 from movidas m where m.id = p.id);
