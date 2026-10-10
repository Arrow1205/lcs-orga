CREATE OR REPLACE FUNCTION public.crm_vip_clear(
  p_workspace uuid, p_year integer, p_values jsonb DEFAULT '{}'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE expected integer; removed integer; scope text := p_values->>'kind';
BEGIN
  IF NOT public.crm_has_role(p_workspace::text, ARRAY['admin','editor']) THEN
    RAISE EXCEPTION 'Lecture seule' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.crm_v2_status WHERE workspace_id=p_workspace FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.crm_editions WHERE workspace_id=p_workspace AND year=p_year AND closed_at IS NULL) THEN
    RAISE EXCEPTION 'Édition inconnue ou clôturée' USING ERRCODE='42501';
  END IF;
  IF scope IS NULL OR scope NOT IN ('VIP','Early Access','all') OR jsonb_typeof(p_values->'records') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Liste invalide';
  END IF;
  expected := jsonb_array_length(p_values->'records');
  IF expected=0 OR expected <> (SELECT count(*) FROM public.crm_vip_participants WHERE workspace_id=p_workspace AND edition_year=p_year AND (scope='all' OR payload->>'kind'=scope)) THEN
    RAISE EXCEPTION 'Liste modifiée : actualise avant de supprimer' USING ERRCODE='40001';
  END IF;
  DELETE FROM public.crm_vip_participants p
  USING jsonb_to_recordset(p_values->'records') AS r(id uuid, version bigint)
  WHERE p.workspace_id=p_workspace AND p.edition_year=p_year
    AND (scope='all' OR p.payload->>'kind'=scope)
    AND p.id=r.id AND p.version=r.version;
  GET DIAGNOSTICS removed = ROW_COUNT;
  IF removed<>expected THEN
    RAISE EXCEPTION 'Liste modifiée : actualise avant de supprimer' USING ERRCODE='40001';
  END IF;
  RETURN jsonb_build_object('deleted',removed);
END;
$$;
REVOKE ALL ON FUNCTION public.crm_vip_clear(uuid,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_vip_clear(uuid,integer,jsonb) TO authenticated;
