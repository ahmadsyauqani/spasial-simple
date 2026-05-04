-- Table to store PDF Map Overlays (Avenza-style)
CREATE TABLE IF NOT EXISTS pdf_overlays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL, -- Public URL of the image or base64 (Storage is better for production)
  bounds JSONB NOT NULL, -- [[lat, lng], [lat, lng]]
  opacity FLOAT DEFAULT 0.7,
  visible BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE pdf_overlays ENABLE ROW LEVEL SECURITY;

-- Allow public read/write for now (adjust as needed for security)
CREATE POLICY "Public Read" ON pdf_overlays FOR SELECT USING (true);
CREATE POLICY "Public Insert" ON pdf_overlays FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update" ON pdf_overlays FOR UPDATE USING (true);
CREATE POLICY "Public Delete" ON pdf_overlays FOR DELETE USING (true);
