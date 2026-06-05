create or replace function public.gridwild_set_owned_equipment(
  p_player_id uuid,
  p_slot text,
  p_item_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.gridwild_store_items%rowtype;
  v_equipment public.player_equipment%rowtype;
begin
  if p_slot not in ('title', 'frame', 'trail', 'companion', 'hat') then
    raise exception 'Invalid equipment slot.';
  end if;

  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'Player not found.';
  end if;

  if p_item_id is not null then
    select *
    into v_item
    from public.gridwild_store_items
    where item_id = p_item_id
      and is_active = true;

    if not found then
      raise exception 'Store item is not available.';
    end if;

    if v_item.slot <> p_slot then
      raise exception 'Item does not belong in that equipment slot.';
    end if;

    if not exists (
      select 1
      from public.player_inventory
      where player_id = p_player_id
        and item_id = p_item_id
    ) then
      raise exception 'Item is not owned.';
    end if;
  end if;

  insert into public.player_equipment (
    player_id,
    title,
    frame,
    trail,
    companion,
    hat,
    updated_at
  )
  values (
    p_player_id,
    case when p_slot = 'title' then p_item_id else null end,
    case when p_slot = 'frame' then p_item_id else null end,
    case when p_slot = 'trail' then p_item_id else null end,
    case when p_slot = 'companion' then p_item_id else null end,
    case when p_slot = 'hat' then p_item_id else null end,
    now()
  )
  on conflict (player_id) do update
  set
    title = case when p_slot = 'title' then excluded.title else player_equipment.title end,
    frame = case when p_slot = 'frame' then excluded.frame else player_equipment.frame end,
    trail = case when p_slot = 'trail' then excluded.trail else player_equipment.trail end,
    companion = case when p_slot = 'companion' then excluded.companion else player_equipment.companion end,
    hat = case when p_slot = 'hat' then excluded.hat else player_equipment.hat end,
    updated_at = now()
  returning * into v_equipment;

  return jsonb_build_object('equipment', to_jsonb(v_equipment));
end;
$$;

