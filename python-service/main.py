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
            from PIL import Image
            import io
            
            for img_file in image_files:
                with zip_ref.open(img_file) as img:
                    img_data = img.read()
                    
                    try:
                        # Perkecil ukuran gambar untuk menghemat database & mencegah timeout
                        image = Image.open(io.BytesIO(img_data))
                        image.thumbnail((300, 300)) # Maksimal 300x300 px
                        
                        # Simpan kembali ke bytes
                        out_io = io.BytesIO()
                        image.save(out_io, format=image.format or 'JPEG', quality=80)
                        val = out_io.getvalue()
                        debug_logs.append(f"Resized image {img_file} to fit in database")
                    except Exception as e:
                        print(f"Gagal me-resize gambar {img_file}: {e}")
                        val = img_data # Fallback ke data asli
                        debug_logs.append(f"Failed to resize {img_file}, using original size")
                        
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
            
        # Aktifkan driver KML di Fiona (tetap jaga-jaga jika ingin pakai Fiona)
        fiona.drvsupport.supported_drivers['KML'] = 'rw'
        
        features = []
        
        # Coba parse menggunakan XML ElementTree untuk ekstraksi gambar yang lebih kuat
        try:
            import xml.etree.ElementTree as ET
            root = ET.fromstring(kml_content)
            
            # Deteksi namespace
            ns = ""
            if '}' in root.tag:
                ns = root.tag.split('}')[0] + '}'
                
            placemarks = root.findall(f'.//{ns}Placemark')
            debug_logs.append(f"Found {len(placemarks)} placemarks using ElementTree")
            
            for idx, pm in enumerate(placemarks):
                name_tag = pm.find(f'{ns}name')
                name = name_tag.text if name_tag is not None else ""
                
                desc_tag = pm.find(f'{ns}description')
                description = desc_tag.text if desc_tag is not None else ""
                
                properties = {
                    "Name": name,
                    "Description": description
                }
                
                # Ekstrak ExtendedData
                extended_data = pm.find(f'{ns}ExtendedData')
                if extended_data is not None:
                    data_tags = extended_data.findall(f'{ns}Data')
                    for dt in data_tags:
                        data_name = dt.get('name')
                        val_tag = dt.find(f'{ns}value')
                        if val_tag is not None and val_tag.text:
                            properties[data_name] = val_tag.text
                            
                # Ekstrak Icon (Kadang foto disimpan sebagai Icon atau IconStyle)
                icon_tag = pm.find(f'.//{ns}Icon/{ns}href')
                if icon_tag is not None and icon_tag.text:
                    properties["Foto"] = icon_tag.text
                    debug_logs.append(f"Found Icon href: {icon_tag.text}")
                    
                style_icon_tag = pm.find(f'.//{ns}IconStyle/{ns}Icon/{ns}href')
                if style_icon_tag is not None and style_icon_tag.text:
                    properties["Foto"] = style_icon_tag.text
                    debug_logs.append(f"Found IconStyle href: {style_icon_tag.text}")
                    
                # Ekstrak Geometri (Point)
                point = pm.find(f'.//{ns}Point')
                geometry = None
                if point is not None:
                    coords_tag = point.find(f'{ns}coordinates')
                    if coords_tag is not None and coords_tag.text:
                        coords_str = coords_tag.text.strip()
                        parts = coords_str.split(',')
                        if len(parts) >= 2:
                            try:
                                lon = float(parts[0])
                                lat = float(parts[1])
                                geometry = {"type": "Point", "coordinates": [lon, lat]}
                            except:
                                pass
                                
                # Jika bukan Point, coba LineString
                if not geometry:
                    ls = pm.find(f'.//{ns}LineString')
                    if ls is not None:
                        coords_tag = ls.find(f'{ns}coordinates')
                        if coords_tag is not None and coords_tag.text:
                            coords_str = coords_tag.text.strip().split()
                            coords = []
                            for c in coords_str:
                                parts = c.split(',')
                                if len(parts) >= 2:
                                    try:
                                        coords.append([float(parts[0]), float(parts[1])])
                                    except:
                                        pass
                            if coords:
                                geometry = {"type": "LineString", "coordinates": coords}
                                
                # Ganti path gambar dengan Base64
                for key, val in properties.items():
                    if isinstance(val, str):
                        for img_path, base64_str in images_base64.items():
                            img_filename = os.path.basename(img_path)
                            
                            # Jika path lengkap ada di dalam value (misal deskripsi HTML)
                            if img_path in val:
                                properties[key] = val.replace(img_path, base64_str)
                                debug_logs.append(f"Replaced path {img_path} in {key}")
                            # Jika value HANYA berisi nama file saja
                            elif val == img_filename or val == img_path:
                                properties[key] = base64_str
                                debug_logs.append(f"Matched filename {img_filename} for property {key}")
                                
                if geometry:
                    features.append({
                        "type": "Feature",
                        "properties": properties,
                        "geometry": geometry
                    })
                    
            debug_logs.append(f"Successfully parsed {len(features)} features with images")
            
        except Exception as e:
            debug_logs.append(f"ElementTree parsing failed: {e}. Falling back to Fiona.")
            print(f"ElementTree parsing failed: {e}")
            
            # Fallback ke Fiona jika XML parser gagal
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
                            
                            # Ganti path gambar dengan Base64
                            for key, val in properties.items():
                                if isinstance(val, str):
                                    for img_path, base64_str in images_base64.items():
                                        if img_path in val:
                                            properties[key] = val.replace(img_path, base64_str)
                                            
                            if feat_dict.get('geometry') is not None:
                                features.append(feat_dict)
                        except Exception as e:
                            continue
            except Exception as e2:
                debug_logs.append(f"Fiona also failed: {e2}")
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
