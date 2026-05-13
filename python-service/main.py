from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import geopandas as gpd
import tempfile
import os
import json

app = FastAPI(title="GeoPackage Converter API", version="1.0.0")

# Configure CORS so the Next.js frontend can call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, change this to your Vercel URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "GeoPackage Converter API is running"}

@app.post("/convert-gpkg")
async def convert_gpkg(file: UploadFile = File(...)):
    if not file.filename.endswith('.gpkg'):
        raise HTTPException(status_code=400, detail="Hanya file .gpkg yang didukung")

    try:
        # Create a temporary file to save the uploaded GeoPackage
        with tempfile.NamedTemporaryFile(delete=False, suffix=".gpkg") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        # Inspect the GeoPackage file as an SQLite database to look for images/media
        import sqlite3
        try:
            conn = sqlite3.connect(tmp_path)
            cursor = conn.cursor()
            
            # List all tables
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in cursor.fetchall()]
            print(f"[GPKG Inspect] All tables: {tables}")
            
            # Check for media tables
            media_tables = [t for t in tables if 'media' in t or 'attachment' in t or 'photo' in t]
            if media_tables:
                print(f"[GPKG Inspect] Found suspected media tables: {media_tables}")
            
            conn.close()
        except Exception as e:
            print(f"[GPKG Inspect] Failed: {e}")

        import fiona
        layers = fiona.listlayers(tmp_path)
        
        if not layers:
            os.unlink(tmp_path)
            raise HTTPException(status_code=400, detail="GeoPackage tidak memiliki layer")

        # Use Fiona to read features directly
        features = []
        detected_crs = "Unknown"
        
        for layer in layers:
            try:
                with fiona.open(tmp_path, layer=layer) as src:
                    detected_crs = str(src.crs) if src.crs else "None"
                    print(f"Reading layer {layer} via Fiona. CRS: {detected_crs}")
                    
                    for feat in src:
                        # Fiona returns features as Model objects in newer versions.
                        # We must convert them to pure dicts for JSON serialization.
                        # Try to use __geo_interface__ which returns a pure dict, otherwise manual mapping
                        try:
                            if hasattr(feat, '__geo_interface__'):
                                feat_dict = dict(feat.__geo_interface__)
                            else:
                                feat_dict = {
                                    "type": "Feature",
                                    "properties": dict(feat.get('properties', {})),
                                    "geometry": dict(feat.get('geometry', {})) if feat.get('geometry') else None
                                }
                                if hasattr(feat, 'id'):
                                    feat_dict['id'] = feat.id
                                    
                            # Check for BLOB/bytes in properties (often used for images in GPKG)
                            properties = feat_dict.get('properties', {})
                            for key, val in properties.items():
                                if isinstance(val, bytes):
                                    import base64
                                    print(f"Found binary data in property '{key}' ({len(val)} bytes)")
                                    
                                    # Try to detect image type from magic numbers
                                    mime_type = "image/jpeg" # Default fallback
                                    if val.startswith(b'\x89PNG\r\n\x1a\n'):
                                        mime_type = "image/png"
                                    elif val.startswith(b'GIF87a') or val.startswith(b'GIF89a'):
                                        mime_type = "image/gif"
                                    elif val.startswith(b'\xff\xd8'):
                                        mime_type = "image/jpeg"
                                        
                                    encoded = base64.b64encode(val).decode('utf-8')
                                    properties[key] = f"data:{mime_type};base64,{encoded}"
                                    print(f"Converted property '{key}' to base64 data URL.")
                                    
                            if feat_dict.get('geometry') is not None:
                                features.append(feat_dict)
                        except Exception as e:
                            print(f"Failed to process feature: {e}")
                            # Fallback to simplest possible dict
                            try:
                                features.append({
                                    "type": "Feature",
                                    "properties": {},
                                    "geometry": None
                                })
                            except:
                                pass
                            
                if features:
                    print(f"Successfully read {len(features)} features from layer {layer} via Fiona")
                    
                    try:
                        print("Converting Fiona features to GeoDataFrame for robust serialization...")
                        import geopandas as gpd
                        gdf = gpd.GeoDataFrame.from_features(features, crs=detected_crs)
                        
                        # Remove Z coordinates
                        from shapely.ops import transform
                        def remove_z(geom):
                            if geom is None: return None
                            if geom.has_z: return transform(lambda x, y, z=None: (x, y), geom)
                            return geom
                        gdf.geometry = gdf.geometry.apply(remove_z)
                        
                        # Convert to GeoJSON string (GeoPandas handles serialization perfectly)
                        geojson_str = gdf.to_json()
                        geojson_data = json.loads(geojson_str)
                        
                        # Add metadata
                        geojson_data['detected_crs'] = detected_crs
                        geojson_data['total_features'] = len(features)
                        
                        # Clean up temporary file
                        os.unlink(tmp_path)
                        
                        return JSONResponse(content=geojson_data)
                    except Exception as e:
                        print(f"Failed to serialize via GeoPandas: {e}. Falling back to direct JSON response.")
                        # Break loop and use direct JSON response at the end
                        break
            except Exception as e:
                print(f"Failed to read layer {layer} with Fiona: {e}")
                continue
                
        if not features:
            # Fallback to GeoPandas if Fiona failed or returned nothing
            print("Fiona returned 0 features or failed. Falling back to GeoPandas...")
            try:
                gdf = gpd.read_file(tmp_path)
                if not gdf.empty:
                    print(f"GeoPandas read successful. Shape: {gdf.shape}")
                    
                    # Remove Z coordinates
                    from shapely.ops import transform
                    def remove_z(geom):
                        if geom is None: return None
                        if geom.has_z: return transform(lambda x, y, z=None: (x, y), geom)
                        return geom
                    gdf.geometry = gdf.geometry.apply(remove_z)
                    
                    # Convert to GeoJSON
                    geojson_str = gdf.to_json()
                    geojson_data = json.loads(geojson_str)
                    
                    os.unlink(tmp_path)
                    return JSONResponse(content=geojson_data)
            except Exception as e:
                print(f"GeoPandas fallback also failed: {e}")
                
            os.unlink(tmp_path)
            raise HTTPException(status_code=400, detail="Tidak ada layer dengan geometri valid yang ditemukan")

        # Build GeoJSON
        geojson_data = {
            "type": "FeatureCollection",
            "features": features,
            "detected_crs": detected_crs,
            "total_features": len(features)
        }

        # Clean up temporary file
        os.unlink(tmp_path)

        return JSONResponse(content=geojson_data)

    except Exception as e:
        # Clean up if error happens
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            os.unlink(tmp_path)
        
        print(f"Error processing GeoPackage: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Gagal memproses GeoPackage: {str(e)}")

@app.post("/convert-kmz")
async def convert_kmz(file: UploadFile = File(...)):
    import tempfile
    import os
    import zipfile
    import fiona
    import geopandas as gpd
    import json
    from fastapi.responses import JSONResponse
    from fastapi import HTTPException
    
    # Save KMZ to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".kmz") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name
        
    debug_logs = []
    try:
        with zipfile.ZipFile(tmp_path, 'r') as zip_ref:
            # Cari file KML di dalam KMZ
            kml_files = [f for f in zip_ref.namelist() if f.endswith('.kml')]
            debug_logs.append(f"Files in ZIP: {zip_ref.namelist()}")
            if not kml_files:
                os.unlink(tmp_path)
                raise HTTPException(status_code=400, detail="Tidak ada file KML di dalam KMZ")
                
            # Ekstrak file KML pertama
            with zip_ref.open(kml_files[0]) as kml_file:
                kml_content = kml_file.read()
                
            # Ekstrak semua gambar di dalam KMZ
            image_extensions = ('.jpg', '.jpeg', '.png', '.gif')
            image_files = [f for f in zip_ref.namelist() if f.lower().endswith(image_extensions)]
            
            images_base64 = {}
            for img_file in image_files:
                with zip_ref.open(img_file) as img:
                    val = img.read()
                    import base64
                    mime_type = "image/jpeg"
                    if img_file.lower().endswith('.png'): mime_type = "image/png"
                    elif img_file.lower().endswith('.gif'): mime_type = "image/gif"
                    
                    encoded = base64.b64encode(val).decode('utf-8')
                    images_base64[img_file] = f"data:{mime_type};base64,{encoded}"
                    debug_logs.append(f"Extracted image {img_file}")
                    
        # Simpan KML ke file sementara agar bisa dibaca Fiona
        with tempfile.NamedTemporaryFile(delete=False, suffix=".kml") as tmp_kml:
            tmp_kml.write(kml_content)
            tmp_kml_path = tmp_kml.name
            
        # Aktifkan driver KML di Fiona
        fiona.drvsupport.supported_drivers['KML'] = 'rw'
        
        features = []
        try:
            with fiona.open(tmp_kml_path, 'r') as src:
                for idx, feat in enumerate(src):
                    try:
                        if hasattr(feat, '__geo_interface__'):
                            feat_dict = dict(feat.__geo_interface__)
                        else:
                            feat_dict = {
                                "type": "Feature",
                                "properties": dict(feat.get('properties', {})),
                                "geometry": dict(feat.get('geometry', {})) if feat.get('geometry') else None
                            }
                            
                        properties = feat_dict.get('properties', {})
                        
                        if idx < 3:
                            debug_logs.append(f"Feature {idx} properties: {list(properties.keys())}")
                            if 'description' in properties:
                                debug_logs.append(f"Feature {idx} description snippet: {str(properties['description'])[:100]}")
                        
                        # Ganti path gambar dengan Base64 di properties (misal di dalam deskripsi HTML)
                        for key, val in properties.items():
                            if isinstance(val, str):
                                for img_path, base64_str in images_base64.items():
                                    if img_path in val:
                                        properties[key] = val.replace(img_path, base64_str)
                                        debug_logs.append(f"Replaced {img_path} in {key}")
                                        
                            # Konversi bytes ke base64 (jika ada BLOB langsung)
                            elif isinstance(val, bytes):
                                import base64
                                mime_type = "image/jpeg"
                                if val.startswith(b'\x89PNG\r\n\x1a\n'): mime_type = "image/png"
                                elif val.startswith(b'GIF8'): mime_type = "image/gif"
                                elif val.startswith(b'\xff\xd8'): mime_type = "image/jpeg"
                                
                                encoded = base64.b64encode(val).decode('utf-8')
                                properties[key] = f"data:{mime_type};base64,{encoded}"
                                
                        if feat_dict.get('geometry') is not None:
                            features.append(feat_dict)
                    except Exception as e:
                        debug_logs.append(f"Error parsing feature {idx}: {e}")
                        continue
        except Exception as e:
            debug_logs.append(f"Fiona failed: {e}. Trying GeoPandas fallback.")
            # Fallback ke GeoPandas langsung
            gdf = gpd.read_file(tmp_kml_path)
            geojson_str = gdf.to_json()
            geojson_data = json.loads(geojson_str)
            
            os.unlink(tmp_kml_path)
            os.unlink(tmp_path)
            return JSONResponse(content={"geojson": geojson_data, "debug_logs": debug_logs})
            
        os.unlink(tmp_kml_path)
        os.unlink(tmp_path)
        
        if not features:
            raise HTTPException(status_code=400, detail="Gagal mengekstrak fitur dari file KML di dalam KMZ")
            
        # Gunakan GeoPandas untuk serialisasi agar rapi
        gdf = gpd.GeoDataFrame.from_features(features)
        
        # Hapus koordinat Z jika ada
        from shapely.ops import transform
        def remove_z(geom):
            if geom is None: return None
            if geom.has_z: return transform(lambda x, y, z=None: (x, y), geom)
            return geom
        gdf.geometry = gdf.geometry.apply(remove_z)
        
        geojson_str = gdf.to_json()
        geojson_data = json.loads(geojson_str)
        
        return JSONResponse(content={"geojson": geojson_data, "debug_logs": debug_logs})
        
    except Exception as e:
        if os.path.exists(tmp_path): os.unlink(tmp_path)
        if 'tmp_kml_path' in locals() and os.path.exists(tmp_kml_path): os.unlink(tmp_kml_path)
        print(f"Error in convert_kmz: {e}")
        raise HTTPException(status_code=500, detail=f"Gagal memproses KMZ: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
