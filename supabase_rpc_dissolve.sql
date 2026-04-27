-- Jalankan di SQL Editor Supabase untuk menciptakan mesin pelebur poligon

CREATE OR REPLACE FUNCTION get_dissolved_geometries(p_layer_id UUID, p_group_key TEXT)
RETURNS TABLE(properties JSONB, geom JSONB) AS $$
BEGIN
  IF p_group_key IS NULL OR p_group_key = '' OR p_group_key = 'none' THEN
    -- Kembalikan murni patahan asli beserta id-nya jika opsi penggabungan tidak aktif
    RETURN QUERY 
    SELECT 
      jsonb_build_object('db_id', g.id) || COALESCE(g.properties, '{}'::jsonb) as properties,
      ST_AsGeoJSON(g.geom)::JSONB as geom 
    FROM public.geometries g 
    WHERE g.layer_id = p_layer_id;
  ELSE
    -- Eksekusi ST_Union tingkat server berdasarkan kesamaan atribut teks JSONB
    RETURN QUERY
    SELECT 
      jsonb_build_object(p_group_key, g.properties->>p_group_key) as properties,
      ST_AsGeoJSON(ST_Union(g.geom))::JSONB as geom
    FROM public.geometries g
    WHERE g.layer_id = p_layer_id
    GROUP BY g.properties->>p_group_key;
  END IF;
END;
$$ LANGUAGE plpgsql;
