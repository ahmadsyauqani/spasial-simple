-- Karena kita ingin kembali ke "Tampilan Mulus Bawaan Data Asli",
-- Kita harus MEMBUNUH fungsi pemecah belah (Subdivide) yang sebelumnya kita buat.
-- Jalankan skrip ini di SQL Editor untuk menanam trik Insert normal:

CREATE OR REPLACE FUNCTION insert_geometry(p_layer_id UUID, p_properties JSONB, p_geom_geojson JSONB)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.geometries (layer_id, properties, geom)
  -- Memasukkan 1 Poligon Asli = 1 Baris Database (Tidak lagi dikerat-kerat!)
  VALUES (p_layer_id, p_properties, ST_SetSRID(ST_GeomFromGeoJSON(p_geom_geojson::text), 4326));
END;
$$ LANGUAGE plpgsql;
