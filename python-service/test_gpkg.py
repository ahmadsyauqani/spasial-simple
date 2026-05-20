import geopandas as gpd
from shapely.geometry import Point
import base64
import os

# Create dummy gpkg with images (blob)
gdf = gpd.GeoDataFrame({
    'name': ['Test 1', 'Test 2'],
    'image': [b'\xff\xd8\xff\xe0testimagebytes1', b'\x89PNG\r\n\x1a\ntestimagebytes2'],
    'geometry': [Point(1, 1), Point(2, 2)]
})
gdf.to_file("test.gpkg", driver="GPKG")

import fiona
with fiona.open("test.gpkg", "r") as src:
    features = []
    for feat in src:
        feat_dict = {
            "type": "Feature",
            "properties": dict(feat.get('properties', {})),
            "geometry": dict(feat.get('geometry', {})) if feat.get('geometry') else None
        }
        properties = feat_dict['properties']
        for k, v in properties.items():
            if isinstance(v, bytes):
                print(f"Found bytes in {k}")
                encoded = base64.b64encode(v).decode('utf-8')
                properties[k] = f"data:image/jpeg;base64,{encoded}"
        features.append(feat_dict)

import json
gdf2 = gpd.GeoDataFrame.from_features(features)
print(gdf2.head())
print(gdf2.to_json()[:200])
