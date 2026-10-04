-- Après 010_survey_editor.sql. Un logo public par édition, enregistré dans crm_settings.payload.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('lcs-branding','lcs-branding',true,5242880,array['image/png','image/jpeg','image/webp']);

create policy lcs_branding_upload on storage.objects for insert to authenticated
with check (
 bucket_id='lcs-branding'
 and public.crm_has_role((storage.foldername(name))[1],array['admin','editor'])
 and (storage.foldername(name))[2] ~ '^[0-9]{4}$'
 and exists(
  select 1 from public.crm_editions e
  where e.workspace_id::text=(storage.foldername(name))[1]
    and e.year::text=(storage.foldername(name))[2]
    and e.closed_at is null
 )
 and name ~ '^[0-9a-f-]{36}/[0-9]{4}/[0-9a-f-]{36}[.](png|jpg|jpeg|webp)$'
);

create or replace function public.crm_public_survey_info(p_code text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; wid uuid; current_year integer; logo text;
begin
 select workspace_id into wid from public.crm_survey_sites where code=p_code;
 select max(year) into current_year from public.crm_editions where workspace_id=wid;
 if current_year is null then raise exception 'Formulaire indisponible' using errcode='22023'; end if;
 select payload->>'logoPath' into logo from public.crm_settings
 where workspace_id=wid and edition_year=current_year and id='main';
 select jsonb_build_object(
  'year',current_year,
  'logo',case when logo like wid::text||'/'||current_year::text||'/%' then logo else null end,
  'forms',coalesce(jsonb_object_agg(type,jsonb_build_object('version',version,'questions',questions)),'{}'::jsonb)
 ) into result
 from public.crm_survey_forms where workspace_id=wid and edition_year=current_year;
 return result;
end;$$;
revoke all on function public.crm_public_survey_info(text) from public;
grant execute on function public.crm_public_survey_info(text) to anon,authenticated;
commit;
