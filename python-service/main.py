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

        # Read the first layer that has geometry
        gdf = None
        for layer in layers:
            try:
                gdf_temp = gpd.read_file(tmp_path, layer=layer)
                if not gdf_temp.empty and gdf_temp.geometry.notnull().any():
                    gdf = gdf_temp
                    break
            except Exception as e:
                print(f"Skipping layer {layer}: {e}")
                continue
                
        if gdf is None:
            os.unlink(tmp_path)
            raise HTTPException(status_code=400, detail="Tidak ada layer dengan geometri valid yang ditemukan")

        print(f"Layer read successfully. Shape: {gdf.shape}, CRS: {gdf.crs}")
        detected_crs = str(gdf.crs) if gdf.crs else "None"
        
        # Remove Z coordinates if present (often causes issues with GeoJSON export/rendering)
        from shapely.ops import transform
        def remove_z(geom):
            if geom is None:
                return None
            if geom.has_z:
                return transform(lambda x, y, z=None: (x, y), geom)
            return geom
            
        try:
            print(f"Original geometry types: {gdf.geometry.type.unique()}")
            gdf.geometry = gdf.geometry.apply(remove_z)
            print("Successfully processed Z coordinates.")
        except Exception as e:
            print(f"Warning: Failed to remove Z coordinates: {e}")
        if gdf.crs is not None:
            try:
                # Use to_epsg() which might be None if it's a custom CRS
                epsg = gdf.crs.to_epsg()
                if epsg != 4326:
                    print(f"Converting from {gdf.crs} to EPSG:4326")
                    gdf = gdf.to_crs(epsg=4326)
            except Exception as e:
                print(f"Failed to convert CRS automatically: {e}. Trying fallback to EPSG:4326 directly.")
                try:
                    gdf = gdf.to_crs("EPSG:4326")
                except Exception as e2:
                    print(f"Fallback conversion also failed: {e2}")
        else:
            print("Warning: CRS is None! Coordinates might be projected and incorrect.")

        # Convert to GeoJSON string
        geojson_str = gdf.to_json()
        geojson_data = json.loads(geojson_str)
        
        # Add metadata to the root of the object
        geojson_data['detected_crs'] = detected_crs
        geojson_data['total_features'] = len(gdf)

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
