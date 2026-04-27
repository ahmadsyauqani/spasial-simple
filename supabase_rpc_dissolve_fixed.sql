-- Jalankan ini di SQL Editor Supabase-mu untuk menimpa mesin yang lama!
-- Ini telah dilengkapi pelindung "TopologyException" (MakeValid + Buffer 0) untuk data wilayah SHP yang tidak rapi.

CREATE OR REPLACE FUNCTION get_dissolved_geometries(p_layer_id UUID, p_group_key TEXT)
RETURNS TABLE(properties JSONB, geom JSONB) AS $$
BEGIN
  IF p_group_key IS NULL OR p_group_key = '' OR p_group_key = 'none' THEN
    RETURN QUERY 
    SELECT 
      jsonb_build_object('db_id', g.id) || COALESCE(g.properties, '{}'::jsonb) as properties,
      ST_AsGeoJSON(g.geom)::JSONB as geom 
    FROM public.geometries g 
    WHERE g.layer_id = p_layer_id;
  ELSE
    RETURN QUERY
    SELECT 
      jsonb_build_object(p_group_key, g.properties->>p_group_key) as properties,
      -- Memperbaiki geometri yang error/ tumpang tindih sebelum dilebur!
      ST_AsGeoJSON(ST_Union(ST_Buffer(ST_MakeValid(g.geom), 0.0)))::JSONB as geom
    FROM public.geometries g
    WHERE g.layer_id = p_layer_id
    GROUP BY g.properties->>p_group_key;
  END IF;
END;
$$ LANGUAGE plpgsql;
