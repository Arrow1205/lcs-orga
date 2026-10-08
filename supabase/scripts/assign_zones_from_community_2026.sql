-- SQL Editor Supabase : remplace la zone affectée selon la communauté en 2026.
-- Les communautés inconnues et les autres années restent intactes.
begin;
create temporary table _lcs_zone_scope(workspace_id uuid, edition_year integer) on commit drop;
do $$
declare
  target_year integer := 2026;
  target_workspace uuid := null; -- Renseigner un UUID seulement si plusieurs espaces existent.
  workspace_count integer;
begin
  if target_workspace is null then
    select count(*), (array_agg(workspace_id))[1]
      into workspace_count, target_workspace
      from public.crm_editions where year=target_year;
    if workspace_count<>1 then
      raise exception 'Renseigne target_workspace : % espaces pour %.',workspace_count,target_year;
    end if;
  end if;
  perform 1 from public.crm_v2_status where workspace_id=target_workspace for update;
  if not found then raise exception 'Espace non migré ou inexistant'; end if;
  perform 1 from public.crm_editions
    where workspace_id=target_workspace and year=target_year and closed_at is null for update;
  if not found then raise exception 'Édition absente ou clôturée : rouvre-la avant de modifier les zones.'; end if;
  insert into _lcs_zone_scope values(target_workspace,target_year);
end $$;

create or replace function pg_temp.lcs_zone_key(value text) returns text
language sql immutable as $$
  select case
    when k in ('basket','basketball','nba') then 'basket'
    when k in ('soccer','football','foot') then 'soccer'
    when k in ('sportus','sportsus','baseball','nfl','mlb','hockey') then 'sportsus'
    when k in ('tcg','pokemon','tcgpokemon') then 'tcg'
    else k end
  from (select lower(regexp_replace(translate(coalesce(value,''),
    'éèêëàâäîïôöùûüç','eeeeaaaiioouuuc'),'[^a-zA-Z0-9]','','g')) as k) normalized;
$$;

create temporary table _lcs_zone_changes on commit drop as
select e.workspace_id,e.edition_year,e.id,e.payload as before_data,
  jsonb_set(e.payload,'{zone}',to_jsonb(z.id),true) as after_data
from public.crm_exhibitors e
join _lcs_zone_scope s using(workspace_id,edition_year)
join lateral (
  select min(zone.id) as id
  from public.crm_zones zone
  where zone.workspace_id=e.workspace_id and zone.edition_year=e.edition_year
    and pg_temp.lcs_zone_key(e.payload->>'community')<>''
    and (pg_temp.lcs_zone_key(zone.id)=pg_temp.lcs_zone_key(e.payload->>'community')
      or pg_temp.lcs_zone_key(zone.payload->>'name')=pg_temp.lcs_zone_key(e.payload->>'community'))
  having count(*)=1
) z on true
where e.payload->>'zone' is distinct from z.id;

insert into public.crm_history
  (workspace_id,edition_year,entity,record_id,before_data,after_data,changed_by)
select workspace_id,edition_year,'exhibitors',id,before_data,after_data,auth.uid()
from _lcs_zone_changes;

update public.crm_exhibitors e
set payload=c.after_data,version=e.version+1,updated_at=now(),updated_by=auth.uid()
from _lcs_zone_changes c
where e.workspace_id=c.workspace_id and e.edition_year=c.edition_year and e.id=c.id;

update public.crm_v2_status
set revision=revision+1
where workspace_id in (select distinct workspace_id from _lcs_zone_changes);

select count(*) as exposants_modifies from _lcs_zone_changes;
commit;
