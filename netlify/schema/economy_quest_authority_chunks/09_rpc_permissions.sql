revoke all on function public.gridwild_purchase_store_item(uuid, text)
  from public, anon, authenticated;
revoke all on function public.gridwild_set_owned_equipment(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.gridwild_complete_quest(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.gridwild_issue_quest(uuid, text, text, text, jsonb, text, integer, text, uuid)
  from public, anon, authenticated;
revoke all on function public.gridwild_refresh_verified_achievements(uuid)
  from public, anon, authenticated;

grant execute on function public.gridwild_purchase_store_item(uuid, text)
  to service_role;
grant execute on function public.gridwild_set_owned_equipment(uuid, text, text)
  to service_role;
grant execute on function public.gridwild_complete_quest(uuid, uuid)
  to service_role;
grant execute on function public.gridwild_issue_quest(uuid, text, text, text, jsonb, text, integer, text, uuid)
  to service_role;
grant execute on function public.gridwild_refresh_verified_achievements(uuid)
  to service_role;
