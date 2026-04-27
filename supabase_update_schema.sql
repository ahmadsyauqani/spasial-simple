-- Jalankan ini di SQL Editor Supabase untuk memperbarui skema:

-- 1. Tambahkan kolom penyimpan gaya warna (kustomisasi styling UI)
ALTER TABLE public.spatial_layers 
ADD COLUMN IF NOT EXISTS style JSONB DEFAULT '{"color": "#3b82f6", "fillColor": "#3b82f6", "fillOpacity": 0.2, "weight": 2}';

-- 2. Tambahkan kolom penyimpan urutan Z-Index (Atas/Bawah)
ALTER TABLE public.spatial_layers 
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
