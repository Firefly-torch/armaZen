-- Fix: rename PL/pgSQL variable "lot" to "v_lot" in _apply_movement and _apply_adjustment
-- to resolve "column reference 'lot' is ambiguous" error (variable vs. inventory_balances.lot column)

create or replace function public._apply_movement(_org uuid, _user uuid, _type public.movement_type, _material uuid, _qty numeric,
  _from uuid, _to uuid, _lot text, _reference text, _notes text, _reason text, _request uuid, _at timestamptz default now(), _reversal_of uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare m record; bal numeric; mid uuid; v_lot text := coalesce(trim(_lot),'');
begin
  if _request is not null then
    select id into mid from public.stock_movements where request_id=_request;
    if mid is not null then return mid; end if;
  end if;
  if _qty is null or _qty <= 0 then raise exception 'A quantidade deve ser maior que zero.'; end if;
  select * into m from public.materials where id=_material;
  if m.id is null or m.org_id <> _org then raise exception 'Material inexistente.'; end if;
  if m.status <> 'ativo' and _type <> 'estorno' then raise exception 'Material % está inativo.', m.code; end if;
  if _type in ('saida','transferencia') or (_type='estorno' and _from is not null) then
    if _from is null then raise exception 'Informe o endereço de origem.'; end if;
    perform public._check_location(_org,_from,false);
    select quantity into bal from public.inventory_balances where material_id=_material and location_id=_from and inventory_balances.lot=v_lot for update;
    if coalesce(bal,0) < _qty then raise exception 'Quantidade insuficiente: saldo disponível % %.', coalesce(bal,0), m.unit; end if;
    update public.inventory_balances set quantity=quantity-_qty, updated_at=now() where material_id=_material and location_id=_from and inventory_balances.lot=v_lot;
    delete from public.inventory_balances where material_id=_material and location_id=_from and inventory_balances.lot=v_lot and quantity=0;
  end if;
  if _type in ('entrada','transferencia') or (_type='estorno' and _to is not null) then
    if _to is null then raise exception 'Informe o endereço de destino.'; end if;
    if _type='transferencia' and _to=_from then raise exception 'Origem e destino devem ser diferentes.'; end if;
    perform public._check_location(_org,_to,true);
    insert into public.inventory_balances(org_id,material_id,location_id,lot,quantity) values (_org,_material,_to,v_lot,_qty)
    on conflict (material_id,location_id,lot) do update set quantity=public.inventory_balances.quantity+excluded.quantity, updated_at=now();
  end if;
  insert into public.stock_movements(org_id,type,material_id,quantity,from_location_id,to_location_id,lot,reference,notes,reason,request_id,user_id,created_at,reversal_of)
  values (_org,_type,_material,_qty,_from,_to,v_lot,nullif(trim(_reference),''),nullif(trim(_notes),''),nullif(trim(_reason),''),_request,_user,_at,_reversal_of)
  returning id into mid;
  return mid;
end $$;

create or replace function public._apply_adjustment(_org uuid, _user uuid, _material uuid, _location uuid, _lot text, _counted numeric, _reason text, _count uuid, _at timestamptz default now())
returns uuid language plpgsql security definer set search_path=public as $$
declare bal numeric; diff numeric; mid uuid; v_lot text := coalesce(trim(_lot),''); m record; iid uuid;
begin
  if _counted is null or _counted < 0 then raise exception 'A quantidade contada não pode ser negativa.'; end if;
  if coalesce(trim(_reason),'') = '' then raise exception 'Informe o motivo do ajuste.'; end if;
  select * into m from public.materials where id=_material and org_id=_org;
  if m.id is null then raise exception 'Material inexistente.'; end if;
  perform public._check_location(_org,_location,false);
  if _count is null then
    insert into public.inventory_counts(org_id, description, created_by, created_at) values (_org, 'Contagem avulsa', _user, _at) returning id into _count;
  elsif not exists (select 1 from public.inventory_counts where id=_count and org_id=_org) then raise exception 'Inventário inexistente.'; end if;
  insert into public.inventory_balances(org_id,material_id,location_id,lot,quantity) values (_org,_material,_location,v_lot,0) on conflict do nothing;
  select quantity into bal from public.inventory_balances where material_id=_material and location_id=_location and inventory_balances.lot=v_lot for update;
  diff := _counted - bal;
  if diff <> 0 then
    update public.inventory_balances set quantity=_counted, updated_at=now() where material_id=_material and location_id=_location and inventory_balances.lot=v_lot;
    insert into public.stock_movements(org_id,type,material_id,quantity,from_location_id,to_location_id,lot,reason,expected_qty,counted_qty,user_id,created_at,reference)
    values (_org,'ajuste',_material,abs(diff), case when diff<0 then _location end, case when diff>0 then _location end, v_lot, trim(_reason), bal, _counted, _user, _at, 'Inventário')
    returning id into mid;
  end if;
  delete from public.inventory_balances where material_id=_material and location_id=_location and inventory_balances.lot=v_lot and quantity=0;
  insert into public.inventory_count_items(org_id,count_id,material_id,location_id,lot,expected_qty,counted_qty,difference,reason,movement_id,user_id,created_at)
  values (_org,_count,_material,_location,v_lot,bal,_counted,diff,trim(_reason),mid,_user,_at) returning id into iid;
  return iid;
end $$;

-- Re-grant execute privileges (create or replace may have reset them)
revoke execute on function public._apply_movement(uuid,uuid,public.movement_type,uuid,numeric,uuid,uuid,text,text,text,text,uuid,timestamptz,uuid),
  public._apply_adjustment(uuid,uuid,uuid,uuid,text,numeric,text,uuid,timestamptz) from authenticated;
