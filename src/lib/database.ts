import { supabase } from "./supabase";

export async function getOrCreateDefaultProject() {
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, name")
    .eq("name", "Default Project")
    .limit(1);

  if (error) throw new Error("Gagal mengambil proyek: " + error.message);

  if (projects && projects.length > 0) {
    return projects[0];
  }

  const { data: newProject, error: insertError } = await supabase
    .from("projects")
    .insert([{ name: "Default Project" }])
    .select()
    .single();

  if (insertError) throw new Error("Gagal membuat proyek default: " + insertError.message);
  return newProject;
}

export async function uploadLayerToSupabase(projectId: string, layerName: string, geojson: any) {
  // 1. Create spatial layer record
  const { data: layer, error: layerError } = await supabase
    .from("spatial_layers")
    .insert([{ project_id: projectId, name: layerName, geometry_type: geojson.type }])
    .select()
    .single();

  if (layerError) throw new Error("Gagal membuat metadata layer: " + layerError.message);

  // 2. Insert geometries
  // Free tier constraint: We shouldn't send massive GeoJSON at once.
  // We'll iterate through features and insert them using our RPC subdivide logic if they are polygons,
  // or just directly using standard INSERT for points/lines. (RPC handles Subdivide inherently for all)
  
  const features = geojson.features || [geojson];
  
  // Chunking to avoid payload too large (batch 50 features at a time)
  const batchSize = 50;
  for (let i = 0; i < features.length; i += batchSize) {
    const batch = features.slice(i, i + batchSize);
    
    const promises = batch.map((feature: any) => 
      supabase.rpc("insert_subdivided_geometry", {
        p_layer_id: layer.id,
        p_properties: feature.properties || {},
        p_geom_geojson: feature.geometry
      })
    );
    
    await Promise.all(promises);
  }

  return layer;
}

export async function fetchActiveLayers() {
  const { data, error } = await supabase
    .from("spatial_layers")
    .select("id, name, geometry_type, project_id, created_at, style, sort_order")
    .order("sort_order", { ascending: true });
    
  if (error) throw new Error("Gagal load layers: " + error.message);
  return data;
}

export async function deleteLayerFromSupabase(layerId: string) {
  const { error } = await supabase
    .from("spatial_layers")
    .delete()
    .eq("id", layerId);

  if (error) throw new Error("Gagal menghapus layer: " + error.message);
  return true;
}

export async function updateLayerStyleInSupabase(layerId: string, style: any) {
  const { error } = await supabase
    .from("spatial_layers")
    .update({ style })
    .eq("id", layerId);
  if (error) throw new Error("Gagal update style layer: " + error.message);
  return true;
}

export async function updateLayerOrderInSupabase(updates: { id: string, sort_order: number }[]) {
  // Free tier simple update loop since bulk upsert can be tricky to type safely
  const promises = updates.map(u => 
    supabase.from("spatial_layers").update({ sort_order: u.sort_order }).eq("id", u.id)
  );
  await Promise.all(promises);
  return true;
}

export async function updateGeometryInSupabase(geometryId: string, geojson: any) {
  const { error } = await supabase
    .rpc("update_edited_geometry", {
      p_id: geometryId,
      p_geom_geojson: geojson
    });
    
  if (error) {
    console.error("Gagal sync vertex PostGIS:", error);
    throw new Error(error.message);
  }
  return true;
}

export async function updateFeaturePropertiesInSupabase(featureId: string, properties: any) {
  const { error } = await supabase
    .from("layer_geometries")
    .update({ properties })
    .eq("id", featureId);
  if (error) throw new Error("Gagal update atribut: " + error.message);
  return true;
}

// PDF Map Overlays (Avenza Style)
export async function uploadPdfImage(fileId: string, dataUrl: string) {
  const base64Data = dataUrl.split(',')[1];
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: 'image/png' });

  const { data, error } = await supabase.storage
    .from('pdf-overlays')
    .upload(`${fileId}.png`, blob, {
      contentType: 'image/png',
      upsert: true
    });

  if (error) throw error;
  
  const { data: { publicUrl } } = supabase.storage
    .from('pdf-overlays')
    .getPublicUrl(`${fileId}.png`);
    
  return publicUrl;
}

export async function savePdfOverlay(projectId: string, overlay: any) {
  const { data, error } = await supabase
    .from("pdf_overlays")
    .insert([{ 
      project_id: projectId,
      name: overlay.name,
      url: overlay.url,
      bounds: overlay.bounds,
      opacity: overlay.opacity,
      visible: overlay.visible
    }])
    .select()
    .single();
    
  if (error) throw new Error("Gagal menyimpan PDF overlay: " + error.message);
  return data;
}

export async function fetchPdfOverlays() {
  const { data, error } = await supabase
    .from("pdf_overlays")
    .select("*")
    .order("created_at", { ascending: true });
    
  if (error) throw new Error("Gagal load PDF overlays: " + error.message);
  return data;
}

export async function deletePdfOverlayFromSupabase(id: string) {
  const { error } = await supabase
    .from("pdf_overlays")
    .delete()
    .eq("id", id);
    
  if (error) throw new Error("Gagal menghapus PDF overlay: " + error.message);
  return true;
}

export async function updatePdfOverlaySettings(id: string, settings: any) {
  const { error } = await supabase
    .from("pdf_overlays")
    .update(settings)
    .eq("id", id);
  return !error;
}
