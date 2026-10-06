-- v34 · Que recalcular no borre los objetivos puestos a mano
--
-- `recalcularObjetivos` reescribe el año entero: borra TODOS los objetivos de
-- los tres cuatrimestres y los vuelve a armar sumando `cliente_objetivos`.
-- Eso está bien para los que salen de la planilla —si un vendedor se queda sin
-- clientes, su objetivo tiene que desaparecer— pero la pantalla de Objetivos
-- también deja escribir un objetivo a mano, y ese se guarda directo en
-- `objetivos` sin pasar por `cliente_objetivos`.
--
-- Resultado: el gerente le ponía a mano un objetivo a alguien que no tiene
-- clientes cargados en la planilla, y al día siguiente, cuando cualquiera
-- asignaba un cliente desde esa misma pantalla, el recálculo se lo borraba.
-- Ni siquiera quedaba la fila, porque sólo reinserta si el monto da mayor a
-- cero. El vendedor aparecía con objetivo "—" y avance 0%.
--
-- Con `origen` el recálculo sabe cuáles le pertenecen. Los manuales quedan, y
-- además ganan sobre la suma de la planilla para ese vendedor y cuatrimestre:
-- si alguien se tomó el trabajo de escribirlo, es porque sabe algo que la
-- planilla no dice.
--
-- Idempotente.

alter table objetivos add column if not exists origen text not null default 'planilla';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'objetivos_origen_check'
  ) then
    alter table objetivos
      add constraint objetivos_origen_check check (origen in ('planilla', 'manual'));
  end if;
end $$;

comment on column objetivos.origen is
  'planilla = lo arma recalcularObjetivos sumando cliente_objetivos; manual = lo escribió alguien a mano y el recálculo no lo toca.';

-- Las filas que ya existen vienen todas de la planilla (la importación del
-- Excel fue lo último que corrió), así que el default ya las deja bien.
