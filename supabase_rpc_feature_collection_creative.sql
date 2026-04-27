CREATE OR REPLACE FUNCTION get_layer_feature_collection(p_layer_id UUID, p_group_key TEXT)
RETURNS JSONB AS $$
DECLARE
  v_geojson JSONB;
BEGIN
  IF p_group_key IS NULL OR p_group_key = '' OR p_group_key = 'none' THEN
    -- Patahan Murni
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
    -- PENGGABUNGAN KREATIF SUPER CEPAT (Anti-Timeout)
    -- Menggunakan ST_UnaryUnion dan ST_Collect yang digabung dengan ST_SnapToGrid agar simpul matematika tidak patah!
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
        -- Kunci Keajaiban: Meratakan mikrometer cacat ke Grid 0.00001 lalu UnaryUnion (Mengeksekusi dalam ~100ms vs 10 detik!)
        ST_UnaryUnion(ST_Collect(ST_SnapToGrid(g.geom, 0.00001))) as geom
      FROM public.geometries g
      WHERE g.layer_id = p_layer_id
      GROUP BY g.properties->>p_group_key
    ) dissolved;
  END IF;

  RETURN v_geojson;
END;
$$ LANGUAGE plpgsql;
