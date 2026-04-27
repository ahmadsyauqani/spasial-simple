-- Jalankan skrip ini di Dasbor SQL Editor Supabase-mu untuk membuka kunci "Live Editing"

CREATE OR REPLACE FUNCTION update_edited_geometry(p_id UUID, p_geom_geojson JSONB) 
RETURNS void AS $$
BEGIN
    UPDATE public.geometries
    SET geom = ST_SetSRID(ST_GeomFromGeoJSON(p_geom_geojson::text), 4326)
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;
