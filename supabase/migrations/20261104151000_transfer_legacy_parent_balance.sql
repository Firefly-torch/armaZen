-- Safely transfer a complete legacy parent balance to a confirmed final
-- descendant position, preserving lot, expiry date, and movement history.

begin;

create or replace function public.transfer_legacy_parent_balance(
  _org uuid,
  _material uuid,
  _from uuid,
  _to uuid,
  _lot text,
  _qty numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_quantity numeric;
  v_source_expiry date;
  v_destination_expiry date;
  v_destination_exists boolean := false;
  v_source_warehouse uuid;
  v_destination_warehouse uuid;
  v_destination_status text;
  v_is_descendant boolean := false;
  v_has_children boolean := false;
  v_movement_id uuid;
  v_lot text := coalesce(trim(_lot), '');
begin
  if not public.has_org_role(_org, 'gestao') then
    raise exception 'Somente Gestão pode regularizar saldos legados em endereços-pai.';
  end if;
  if _qty is null or _qty <= 0 then
    raise exception 'A quantidade da transferência precisa ser maior que zero.';
  end if;
  if _from is null or _to is null or _from = _to then
    raise exception 'Informe um endereço-pai e uma posição descendente diferentes.';
  end if;

  perform public._check_location(_org, _from, false);
  perform public._check_location(_org, _to, true);

  select l.warehouse_id
    into v_source_warehouse
    from public.locations l
   where l.id = _from
     and l.org_id = _org;

  select l.warehouse_id, l.status
    into v_destination_warehouse, v_destination_status
    from public.locations l
   where l.id = _to
     and l.org_id = _org;

  if v_source_warehouse is null
     or v_destination_warehouse is distinct from v_source_warehouse then
    raise exception 'A origem e o destino precisam pertencer ao mesmo armazém.';
  end if;
  if v_destination_status <> 'disponivel' then
    raise exception 'A posição de destino precisa estar disponível.';
  end if;

  select exists (
    select 1 from public.locations child where child.parent_id = _from
  ) into v_has_children;
  if not v_has_children then
    raise exception 'A origem informada não é um endereço-pai estrutural.';
  end if;

  with recursive parent_chain(id, parent_id, depth) as (
    select l.id, l.parent_id, 0
      from public.locations l
     where l.id = _to
       and l.org_id = _org
    union all
    select parent.id, parent.parent_id, child.depth + 1
      from public.locations parent
      join parent_chain child on parent.id = child.parent_id
     where parent.org_id = _org
       and child.parent_id is not null
       and child.depth < 20
  )
  select exists (
    select 1 from parent_chain where id = _from
  ) into v_is_descendant;

  if not v_is_descendant then
    raise exception 'O destino precisa ser uma posição final descendente do endereço-pai selecionado.';
  end if;

  if not public.is_storage_location(_org, _to) then
    raise exception 'O destino precisa ser uma posição final de armazenagem.';
  end if;

  if not exists (
    select 1 from public.materials m
     where m.id = _material
       and m.org_id = _org
  ) then
    raise exception 'Material inexistente nesta organização.';
  end if;

  select b.quantity, b.expiry_date
    into v_source_quantity, v_source_expiry
    from public.inventory_balances b
   where b.org_id = _org
     and b.material_id = _material
     and b.location_id = _from
     and b.lot = v_lot
   for update;

  if not found or v_source_quantity is null or v_source_quantity <= 0 then
    raise exception 'Não há saldo positivo deste material/lote no endereço-pai.';
  end if;
  if abs(v_source_quantity - _qty) > 0.0005 then
    raise exception 'O saldo foi alterado. Atualize a tela e confira a quantidade antes de transferir.';
  end if;

  select b.expiry_date
    into v_destination_expiry
    from public.inventory_balances b
   where b.org_id = _org
     and b.material_id = _material
     and b.location_id = _to
     and b.lot = v_lot
   for update;
  v_destination_exists := found;

  if v_destination_exists
     and v_source_expiry is not null
     and v_destination_expiry is not null
     and v_source_expiry <> v_destination_expiry then
    raise exception 'O destino já possui o mesmo lote com outra validade. Escolha outra posição para preservar a rastreabilidade.';
  end if;

  insert into public.inventory_balances(
    org_id, material_id, location_id, lot, expiry_date, quantity
  )
  values (
    _org, _material, _to, v_lot, v_source_expiry, v_source_quantity
  )
  on conflict (material_id, location_id, lot)
  do update
    set quantity = public.inventory_balances.quantity + excluded.quantity,
        expiry_date = coalesce(public.inventory_balances.expiry_date, excluded.expiry_date),
        updated_at = now();

  delete from public.inventory_balances
   where org_id = _org
     and material_id = _material
     and location_id = _from
     and lot = v_lot;

  insert into public.stock_movements(
    org_id, type, material_id, quantity, from_location_id, to_location_id,
    lot, reference, notes, reason, user_id, created_at
  )
  values (
    _org,
    'transferencia'::public.movement_type,
    _material,
    v_source_quantity,
    _from,
    _to,
    v_lot,
    'Regularização de saldo legado em endereço-pai',
    'Transferência confirmada pela Gestão após conferência física. Lote e validade preservados.',
    'Regularização de endereço-pai',
    auth.uid(),
    now()
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

revoke all on function public.transfer_legacy_parent_balance(uuid, uuid, uuid, uuid, text, numeric)
  from public, anon;
grant execute on function public.transfer_legacy_parent_balance(uuid, uuid, uuid, uuid, text, numeric)
  to authenticated;

commit;
