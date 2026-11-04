-- Make the demonstration inventory session reliable by targeting the
-- immutable demo_workspace_registry, not editable warehouse labels.
-- The dashboard receives 40 completed lines (39 correct = 97.5%) when the
-- demo account signs in after this migration is applied.

begin;

create or replace function public.ensure_demo_inventory_accuracy(_org uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role_claim text;
  v_warehouse uuid;
  v_user uuid;
  v_count uuid;
  v_line_count integer;
  v_item record;
  v_expected numeric;
  v_counted numeric;
  v_divergence_created boolean := false;
  v_description text := 'Inventário demonstrativo — conferência inicial (dados fictícios)';
begin
  v_role_claim := coalesce(
    auth.jwt() ->> 'role',
    current_setting('request.jwt.claim.role', true),
    ''
  );
  if v_role_claim <> 'service_role' then
    raise exception 'Esta função está disponível apenas para o serviço de provisionamento.';
  end if;

  perform pg_advisory_xact_lock(hashtext(_org::text)::bigint);

  if not exists (
    select 1
      from public.demo_workspace_registry
     where singleton = true
       and org_id = _org
  ) then
    raise exception 'A organização informada não é o ambiente oficial de demonstração.';
  end if;

  select w.id
    into v_warehouse
    from public.warehouses w
   where w.org_id = _org
     and w.active
   order by (w.code = 'CD01') desc, w.created_at
   limit 1;

  if v_warehouse is null then
    raise exception 'O ambiente demonstrativo ainda não possui um armazém ativo.';
  end if;

  select om.user_id
    into v_user
    from public.organization_members om
   where om.org_id = _org
     and om.role = 'gestao'
   order by om.created_at
   limit 1;

  if v_user is null then
    raise exception 'O ambiente demonstrativo ainda não possui um perfil de Gestão.';
  end if;

  select ic.id
    into v_count
    from public.inventory_counts ic
   where ic.org_id = _org
     and (
       ic.description = v_description
       or ic.description like v_description || ' — revisão%'
     )
     and ic.status = 'concluido'
   order by ic.completed_at desc nulls last, ic.created_at desc
   limit 1;

  if v_count is not null then
    select count(*)
      into v_line_count
      from public.inventory_count_items
     where count_id = v_count;

    if v_line_count = 40 then
      return;
    end if;
  end if;

  -- Use a new versioned label if a previous incomplete demonstration attempt
  -- exists; historical rows are never deleted or overwritten.
  if exists (
    select 1
      from public.inventory_counts
     where org_id = _org
       and description = v_description
  ) then
    v_description := v_description || ' — revisão';
  end if;

  insert into public.inventory_counts(
    org_id, warehouse_id, description, created_by, status, completed_at
  )
  values (
    _org, v_warehouse, v_description, v_user, 'em_andamento', null
  )
  returning id into v_count;

  for v_item in
    with position_lots as (
      select b.material_id, b.location_id,
             (array_agg(b.lot order by b.quantity desc, b.lot))[1] as lot
        from public.inventory_balances b
       where b.org_id = _org
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
             ) as lot
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
       where m.org_id = _org
         and m.status = 'ativo'
         and l.org_id = _org
         and l.warehouse_id = v_warehouse
         and l.active
         and not exists (
           select 1
             from public.locations child
            where child.parent_id = l.id
         )
       order by m.code, l.code
       limit 40
    )
    select material_id, material_code, location_id, location_code, lot
      from candidates
     order by material_code, location_code
  loop
    select coalesce((
      select b.quantity
        from public.inventory_balances b
       where b.org_id = _org
         and b.material_id = v_item.material_id
         and b.location_id = v_item.location_id
         and b.lot = v_item.lot
    ), 0)
    into v_expected;

    v_counted := v_expected;
    if not v_divergence_created then
      -- Keep the fictitious KPI at 39/40 even if the seeded stock has changed.
      v_counted := case
        when v_expected > 0 then greatest(0, v_expected - 1)
        else v_expected + 1
      end;
      v_divergence_created := true;
    end if;

    perform public._apply_adjustment(
      _org,
      v_user,
      v_item.material_id,
      v_item.location_id,
      v_item.lot,
      v_counted,
      case
        when v_counted <> v_expected then 'Divergência demonstrativa fictícia'
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

  if v_line_count <> 40 or not v_divergence_created then
    raise exception 'Não foi possível gerar as 40 linhas demonstrativas. Foram geradas %.', v_line_count;
  end if;

  update public.inventory_counts
     set status = 'concluido',
         completed_at = now()
   where id = v_count;
end;
$$;

revoke all on function public.ensure_demo_inventory_accuracy(uuid)
  from public, anon, authenticated;
grant execute on function public.ensure_demo_inventory_accuracy(uuid)
  to service_role;

-- Prevent fresh positive balances from being inserted directly into a
-- structural or non-storage address. Existing legacy rows can still be
-- reduced/emptied through a traceable transfer to a valid storage position.
create or replace function public.prevent_new_parent_stock_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.quantity > 0 and not public.is_storage_location(new.org_id, new.location_id) then
      raise exception 'Novos saldos só podem ser registrados em posições finais de armazenagem.';
    end if;
    return new;
  end if;

  if new.location_id is distinct from old.location_id
     and not public.is_storage_location(new.org_id, new.location_id) then
    raise exception 'O destino do saldo precisa ser uma posição final de armazenagem.';
  end if;

  if not public.is_storage_location(new.org_id, new.location_id)
     and new.quantity > old.quantity then
    raise exception 'O saldo de um endereço estrutural não pode ser aumentado. Transfira o saldo legado para uma posição final.';
  end if;

  return new;
end;
$;

drop trigger if exists inventory_balances_storage_guard on public.inventory_balances;
create trigger inventory_balances_storage_guard
before insert or update of location_id, quantity on public.inventory_balances
for each row
execute function public.prevent_new_parent_stock_balance();

commit;
