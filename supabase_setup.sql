-- 1. Enable PostGIS Extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Create Tables
CREATE TABLE public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.spatial_layers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    geometry_type TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.geometries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    layer_id UUID REFERENCES public.spatial_layers(id) ON DELETE CASCADE,
    properties JSONB,
    geom GEOMETRY(Geometry, 4326)
);

-- 3. Optimization: GiST Index
CREATE INDEX geometries_geom_idx ON public.geometries USING GIST (geom);

-- 4. Insert Function with ST_Subdivide
-- This function allows the client to insert large geometries safely
CREATE OR REPLACE FUNCTION insert_subdivided_geometry(
    p_layer_id UUID,
    p_properties JSONB,
    p_geom_geojson JSONB
) RETURNS void AS $$
BEGIN
    INSERT INTO public.geometries (layer_id, properties, geom)
    SELECT 
        p_layer_id, 
        p_properties, 
        -- St_Subdivide works on standard geometries, so we convert GeoJSON -> Geometry -> Subdivide
        ST_Subdivide(ST_SetSRID(ST_GeomFromGeoJSON(p_geom_geojson::text), 4326), 255);
END;
$$ LANGUAGE plpgsql;

-- 5. RPC: Calculate Area (returns Area in square meters for Web Mercator / Spherical)
CREATE OR REPLACE FUNCTION calculate_feature_area(p_geom_id UUID) RETURNS FLOAT AS $$
DECLARE
    v_area FLOAT;
BEGIN
    -- Using geography to get accurate meters area
    SELECT ST_Area(geom::GEOGRAPHY) INTO v_area
    FROM public.geometries
    WHERE id = p_geom_id;
    
    RETURN v_area;
END;
$$ LANGUAGE plpgsql;

-- 6. RPC: Intersect two layers
-- Returns the intersected geometries as a FeatureCollection JSON
CREATE OR REPLACE FUNCTION intersect_layers(layer_id_A UUID, layer_id_B UUID) RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(jsonb_agg(
            jsonb_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(intersection_geom)::jsonb,
                'properties', jsonb_build_object(
                    'source_A', a.properties,
                    'source_B', b.properties
                )
            )
        ), '[]'::jsonb)
    ) INTO result
    FROM public.geometries a
    JOIN public.geometries b ON ST_Intersects(a.geom, b.geom)
    -- ST_Intersection calculates the actual overlapping shape
    CROSS JOIN LATERAL ST_Intersection(a.geom, b.geom) AS intersection_geom
    WHERE a.layer_id = layer_id_A 
      AND b.layer_id = layer_id_B
      AND ST_Dimension(intersection_geom) >= 0; -- Only keep valid intersections (not empty)

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 7. Disable RLS (Row Level Security) for public access
-- Since this is a public spatial analytics sandbox without user login
ALTER TABLE public.projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.spatial_layers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.geometries DISABLE ROW LEVEL SECURITY;

