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

        # Read the GeoPackage using GeoPandas
        # By default, geopandas reads the first layer. 
        # For multi-layer support, you'd need to list layers with fiona first,
        # but for this simple converter, we'll read the first active geometry layer.
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
                        # Fiona returns features as dictionaries matching GeoJSON
                        if feat.get('geometry') is not None:
                            features.append(feat)
                            
                if features:
                    print(f"Successfully read {len(features)} features from layer {layer} via Fiona")
                    break # Stop at first layer with features
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
