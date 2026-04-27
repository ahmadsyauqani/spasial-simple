-- Jalankan skrip pamungkas ini di SQL Editor Supabase untuk menyelesaikan "Peta Bolong"!
-- Skrip ini merakit seluruh geometri menjadi 1 File JSON raksasa langsung di dalam Database 
-- Sehingga terhindar dari pemotongan batas 1000 Baris (API Row Limit) bawaan Supabase.

CREATE OR REPLACE FUNCTION get_layer_feature_collection(p_layer_id UUID, p_group_key TEXT)
RETURNS JSONB AS $$
DECLARE
  v_geojson JSONB;
BEGIN
  IF p_group_key IS NULL OR p_group_key = '' OR p_group_key = 'none' THEN
    -- Kembalikan patahan asli secara UUUH (Anti terpotong)
    SELECT jsonb_build_object(
      'type', 'FeatureCollection',
      'features', COALESCE(jsonb_agg(
        jsonb_build_object(
          'type', 'Feature',
          'properties', jsonb_build_object('db_id', g.id) || COALESCE(g.properties, '{}'::jsonb),
          'geometry', ST_AsGeoJSON(g.geom)::jsonb
        )
      ), '[]'::jsonb)
    ) INTO v_geojson
    FROM public.geometries g
    WHERE g.layer_id = p_layer_id;
  ELSE
    -- Kembalikan versi tergabung (Dissolved)
    SELECT jsonb_build_object(
      'type', 'FeatureCollection',
      'features', COALESCE(jsonb_agg(
        jsonb_build_object(
          'type', 'Feature',
          'properties', jsonb_build_object(p_group_key, dissolved.grp_val),
          'geometry', ST_AsGeoJSON(dissolved.geom)::jsonb
        )
      ), '[]'::jsonb)
    ) INTO v_geojson
    FROM (
      SELECT 
        g.properties->>p_group_key as grp_val,
        ST_Union(ST_Buffer(ST_MakeValid(g.geom), 0.0)) as geom
      FROM public.geometries g
      WHERE g.layer_id = p_layer_id
      GROUP BY g.properties->>p_group_key
    ) dissolved;
  END IF;

  RETURN v_geojson;
END;
$$ LANGUAGE plpgsql;
