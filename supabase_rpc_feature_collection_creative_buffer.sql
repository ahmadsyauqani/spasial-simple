CREATE OR REPLACE FUNCTION get_layer_feature_collection(p_layer_id UUID, p_group_key TEXT)
RETURNS JSONB AS $$
DECLARE
  v_geojson JSONB;
BEGIN
  IF p_group_key IS NULL OR p_group_key = '' OR p_group_key = 'none' THEN
    SELECT jsonb_build_object('type', 'FeatureCollection', 'features', COALESCE(jsonb_agg(
      jsonb_build_object('type', 'Feature', 'properties', jsonb_build_object('db_id', g.id) || COALESCE(g.properties, '{}'::jsonb), 'geometry', ST_AsGeoJSON(g.geom)::jsonb)
    ), '[]'::jsonb)) INTO v_geojson FROM public.geometries g WHERE g.layer_id = p_layer_id;
  ELSE
    SELECT jsonb_build_object('type', 'FeatureCollection', 'features', COALESCE(jsonb_agg(
      jsonb_build_object('type', 'Feature', 'properties', dissolved.full_props, 'geometry', ST_AsGeoJSON(dissolved.geom)::jsonb)
    ), '[]'::jsonb)) INTO v_geojson 
    FROM (
      SELECT g.properties->>p_group_key as grp_val,
        -- Mengambil seluruh properti asli dari potongan pertama yang tergabung
        (jsonb_agg(g.properties))->0 as full_props,
        -- THE ULTIMATE SPEED: ST_MakeValid menjamin Union jalan, tanpa Buffer lelet!
        ST_UnaryUnion(ST_Collect(ST_MakeValid(g.geom))) as geom
      FROM public.geometries g WHERE g.layer_id = p_layer_id GROUP BY g.properties->>p_group_key
    ) dissolved;
  END IF;
  RETURN v_geojson;
END;
$$ LANGUAGE plpgsql;
