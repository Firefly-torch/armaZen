-- Inventory accuracy now uses only the latest completed count per stock key.
-- This migration adds a ledger-backed balance audit/rebuild function and adds
-- a clearly identified fictitious 97.5% count to seeded demo workspaces only.

begin;

create or replace function public.reconcile_inventory_balances(
  _org uuid,
  _apply boolean default false
)
returns table (
  material_id uuid,
  location_id uuid,
  lot text,
  recorded_quantity numeric,
  ledger_quantity numeric,
  difference numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_org_role(_org, 'gestao') then
    raise exception 'Somente Gestão pode conferir ou reconstruir saldos.';
  end if;

  perform pg_advisory_xact_lock(hashtext(_org::text)::bigint);

  -- The ledger must be interpretable before it can be treated as the source of
  -- truth. Reject orphaned endpoints and cross-organization references.
  if exists (
    select 1
      from public.stock_movements sm
     where sm.org_id = _org
       and (
         (sm.from_location_id is null and sm.to_location_id is null)
         or not exists (
           select 1 from public.materials m
            where m.id = sm.material_id and m.org_id = _org
         )
         or (
           sm.from_location_id is not null
           and not exists (
             select 1 from public.locations l
              where l.id = sm.from_location_id and l.org_id = _org
           )
         )
         or (
           sm.to_location_id is not null
           and not exists (
             select 1 from public.locations l
              where l.id = sm.to_location_id and l.org_id = _org
           )
         )
       )
  ) then
    raise exception 'Há movimentações com material ou endereço inválido. A reconstrução foi cancelada.';
  end if;

  -- A running negative balance indicates an impossible chronological ledger.
  -- Do not hide it by rebuilding a positive final total.
  if exists (
    with deltas as (
      select sm.material_id, sm.to_location_id as location_id,
             coalesce(sm.lot, '') as lot, sm.quantity as delta,
             sm.created_at, sm.number
        from public.stock_movements sm
       where sm.org_id = _org and sm.to_location_id is not null
      union all
      select sm.material_id, sm.from_location_id as location_id,
             coalesce(sm.lot, '') as lot, -sm.quantity as delta,
             sm.created_at, sm.number
        from public.stock_movements sm
       where sm.org_id = _org and sm.from_location_id is not null
    ),
    running AS (
      select sum(delta) over (
        partition by material_id, location_id, lot
        order by created_at, number
        rows between unbounded preceding and current row
      ) as running_quantity
      from deltas
    )
    select 1 from running where running_quantity < 0
  ) then
    raise exception 'O histórico contém uma saída maior que o saldo acumulado em pelo menos uma posição/lote. Corrija o livro de movimentações antes de reconstruir.';
  end if;

  drop table if exists pg_temp.armazen_balance_reconcile_stage;

  create temporary table pg_temp.armazen_balance_reconcile_stage
  on commit drop
  as
  with deltas as (
    select sm.material_id, sm.to_location_id as location_id,
           coalesce(sm.lot, '') as lot, sm.quantity as delta
      from public.stock_movements sm
     where sm.org_id = _org and sm.to_location_id is not null
    union all
    select sm.material_id, sm.from_location_id as location_id,
           coalesce(sm.lot, '') as lot, -sm.quantity as delta
      from public.stock_movements sm
     where sm.org_id = _org and sm.from_location_id is not null
  ),
  ledger as (
    select d.material_id, d.location_id, d.lot,
           sum(d.delta) as ledger_quantity,
           count(*) as movement_count
      from deltas d
     group by d.material_id, d.location_id, d.lot
  ),
  all_keys as (
    select l.material_id, l.location_id, l.lot from ledger l
    union
    select b.material_id, b.location_id, b.lot
      from public.inventory_balances b
     where b.org_id = _org
  )
  select k.material_id,
         k.location_id,
         k.lot,
         coalesce(b.quantity, 0)::numeric as recorded_quantity,
         coalesce(l.ledger_quantity, 0)::numeric as ledger_quantity,
         (coalesce(l.ledger_quantity, 0) - coalesce(b.quantity, 0))::numeric as difference,
         b.expiry_date,
         coalesce(l.movement_count, 0) > 0 as has_movement
    from all_keys k
    left join public.inventory_balances b
      on b.org_id = _org
     and b.material_id = k.material_id
     and b.location_id = k.location_id
     and b.lot = k.lot
    left join ledger l
      on l.material_id = k.material_id
     and l.location_id = k.location_id
     and l.lot = k.lot;

  if _apply then
    -- A positive balance without any stock movement cannot be reconstructed
    -- safely; keep it untouched and require an explicit manual investigation.
    if exists (
      select 1
        from pg_temp.armazen_balance_reconcile_stage s
       where s.recorded_quantity > 0
         and not s.has_movement
    ) then
      raise exception 'Existem saldos positivos sem movimentação correspondente. A reconstrução foi cancelada para evitar apagar estoque sem rastreabilidade.';
    end if;

    delete from public.inventory_balances
     where org_id = _org;

    insert into public.inventory_balances(
      org_id, material_id, location_id, lot, expiry_date, quantity
    )
    select _org, s.material_id, s.location_id, s.lot,
           s.expiry_date, s.ledger_quantity
      from pg_temp.armazen_balance_reconcile_stage s
     where s.ledger_quantity > 0;
  end if;

  return query
  select s.material_id, s.location_id, s.lot,
         s.recorded_quantity, s.ledger_quantity, s.difference
    from pg_temp.armazen_balance_reconcile_stage s
   where abs(s.difference) > 0.0005
   order by s.material_id, s.location_id, s.lot;
end;
$$;

revoke all on function public.reconcile_inventory_balances(uuid, boolean)
  from public, anon;
grant execute on function public.reconcile_inventory_balances(uuid, boolean)
  to authenticated;

-- Add one fictitious, completed 40-line inventory to demo-seeded workspaces.
-- Three old demo count keys are recounted so their previous discrepancies are
-- superseded; one different line remains divergent: 39/40 = 97.5%.
do $demo_inventory$
declare
  v_org record;
  v_user uuid;
  v_count uuid;
  v_item record;
  v_expected numeric;
  v_counted numeric;
  v_line_count integer;
begin
  for v_org in
    select w.org_id, w.id as warehouse_id
      from public.warehouses w
     where w.code = 'CD01'
       and w.name = 'Centro de Distribuição DEMO'
       and w.description = 'Dados fictícios para demonstração — editáveis.'
       and exists (
         select 1 from public.materials m
          where m.org_id = w.org_id and m.code = 'MP-001'
            and m.description like '%(DEMO)%'
       )
  loop
    select om.user_id
      into v_user
      from public.organization_members om
     where om.org_id = v_org.org_id
       and om.role = 'gestao'
     order by om.created_at
     limit 1;

    if v_user is null then
      continue;
    end if;

    if exists (
      select 1
        from public.inventory_counts ic
       where ic.org_id = v_org.org_id
         and ic.description = 'Inventário demonstrativo — conferência inicial (dados fictícios)'
    ) then
      continue;
    end if;

    insert into public.inventory_counts(
      org_id, warehouse_id, description, created_by, status, completed_at
    )
    values (
      v_org.org_id,
      v_org.warehouse_id,
      'Inventário demonstrativo — conferência inicial (dados fictícios)',
      v_user,
      'em_andamento',
      null
    )
    returning id into v_count;

    for v_item in
      with position_lots as (
        select b.material_id, b.location_id,
               (array_agg(b.lot order by b.quantity desc, b.lot))[1] as lot
          from public.inventory_balances b
         where b.org_id = v_org.org_id
           and b.quantity > 0
         group by b.material_id, b.location_id
      ),
      candidates as (
        select m.id as material_id,
               m.code as material_code,
               l.id as location_id,
               l.code as location_code,
               coalesce(
                 pl.lot,
                 case
                   when m.tracks_lot then 'DEMO-' || replace(m.code, '-', '') || '-' || replace(l.code, '-', '')
                   else ''
                 end
               ) as lot,
               case
                 when (m.code = 'MP-002' and l.code = 'EXT-C02-P01')
                   or (m.code = 'EM-101' and l.code = 'EXT-PAT-B02')
                   or (m.code = 'QM-011' and l.code = 'INT-FAB-E01-N02') then 0
                 when m.code = 'MP-001' and l.code = 'EXT-C01-P01' then 1
                 else 2
               end as priority
          from public.materials m
          cross join public.locations l
          join public.location_levels lv
            on lv.id = l.level_id
           and lv.org_id = l.org_id
           and lv.warehouse_id = l.warehouse_id
           and lv.is_storage
          join public.warehouses wh
            on wh.id = l.warehouse_id
           and wh.org_id = l.org_id
           and wh.active
          left join position_lots pl
            on pl.material_id = m.id
           and pl.location_id = l.id
         where m.org_id = v_org.org_id
           and m.status = 'ativo'
           and m.code in ('MP-001','MP-002','QM-010','QM-011','EM-100','EM-101','MC-200')
           and l.org_id = v_org.org_id
           and l.warehouse_id = v_org.warehouse_id
           and l.active
           and not exists (
             select 1 from public.locations child where child.parent_id = l.id
           )
      )
      select material_id, material_code, location_id, location_code, lot
        from candidates
       order by priority, material_code, location_code
       limit 40
    loop
      select coalesce((
        select b.quantity
          from public.inventory_balances b
         where b.org_id = v_org.org_id
           and b.material_id = v_item.material_id
           and b.location_id = v_item.location_id
           and b.lot = v_item.lot
      ), 0)
      into v_expected;

      v_counted := v_expected;
      if v_item.material_code = 'MP-001'
         and v_item.location_code = 'EXT-C01-P01'
         and v_item.lot = 'L2401'
         and v_expected > 0 then
        v_counted := greatest(0, v_expected - 1);
      end if;

      perform public._apply_adjustment(
        v_org.org_id,
        v_user,
        v_item.material_id,
        v_item.location_id,
        v_item.lot,
        v_counted,
        case
          when v_counted <> v_expected then 'Divergência demonstrativa de 1 unidade'
          else 'Conferência demonstrativa sem divergência'
        end,
        v_count,
        now()
      );
    end loop;

    select count(*)
      into v_line_count
      from public.inventory_count_items
     where count_id = v_count;

    if v_line_count <> 40 then
      raise exception 'A conferência demonstrativa deveria ter 40 linhas, mas foram geradas %.', v_line_count;
    end if;

    update public.inventory_counts
       set status = 'concluido',
           completed_at = now()
     where id = v_count;
  end loop;
end;
$demo_inventory$;

commit;
