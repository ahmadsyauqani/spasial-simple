import fiona
import geopandas as gpd
import json
import base64

all_features = []
with fiona.open('test_attr.gpkg', 'r') as src:
    for feat in src:
        feat_dict = dict(feat.__geo_interface__)
        properties = feat_dict.get('properties', {})
        for key, val in properties.items():
            if isinstance(val, bytes):
                print(f"Found bytes in {key}")
                encoded = base64.b64encode(val).decode('utf-8')
                properties[key] = f"data:image/jpeg;base64,{encoded}"
        all_features.append(feat_dict)

print("Features before gpd:", all_features)
try:
    gdf = gpd.GeoDataFrame.from_features(all_features)
    geojson_str = gdf.to_json()
    print("GeoJSON properties:", json.loads(geojson_str)["features"][0]["properties"])
except Exception as e:
    print("Error:", e)
