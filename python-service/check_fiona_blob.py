import fiona
import sqlite3

# Create GPKG with BLOB
conn = sqlite3.connect('test_fiona_blob.gpkg')
conn.executescript("""
CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT, srs_id INTEGER PRIMARY KEY, organization TEXT, organization_coordsys_id INTEGER, definition TEXT, description TEXT);
INSERT INTO gpkg_spatial_ref_sys VALUES ('WGS 84', 4326, 'EPSG', 4326, 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]]', '');

CREATE TABLE gpkg_contents (table_name TEXT PRIMARY KEY, data_type TEXT, identifier TEXT, description TEXT, last_change DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER);
INSERT INTO gpkg_contents (table_name, data_type, identifier) VALUES ('test_layer', 'features', 'test_layer');

CREATE TABLE gpkg_geometry_columns (table_name TEXT PRIMARY KEY, column_name TEXT, geometry_type_name TEXT, srs_id INTEGER, z TINYINT, m TINYINT);
INSERT INTO gpkg_geometry_columns VALUES ('test_layer', 'geom', 'POINT', 4326, 0, 0);

CREATE TABLE test_layer (id INTEGER PRIMARY KEY AUTOINCREMENT, geom BLOB, photo BLOB, name TEXT);
INSERT INTO test_layer (geom, photo, name) VALUES (x'47504B4700010100000000000000F03F000000000000F03F', x'FFD8FFE000104A46494600010101004800480000', 'Test Point');
""")
conn.commit()
conn.close()

try:
    with fiona.open('test_fiona_blob.gpkg', 'r') as src:
        feat = next(iter(src))
        print("Fiona properties:", feat['properties'])
except Exception as e:
    print("Fiona error:", e)
