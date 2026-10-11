export const DEMO_LAYER_ID = "local-demo-parcels";
export const DEMO_LAYER_NAME = "Contoh bidang (demo)";

/** Deterministic educational data; this is never sent to the cloud. */
export function createDemoGeojson() {
  const parcels = [
    { id: "D-01", name: "Bidang Utara", ring: [[112.95, -7.94], [112.952, -7.94], [112.952, -7.9383], [112.95, -7.9383], [112.95, -7.94]] },
    { id: "D-02", name: "Bidang Tengah", ring: [[112.9524, -7.94], [112.9544, -7.94], [112.9544, -7.9383], [112.9524, -7.9383], [112.9524, -7.94]] },
    { id: "D-03", name: "Bidang Selatan", ring: [[112.95, -7.9421], [112.952, -7.9421], [112.952, -7.9404], [112.95, -7.9404], [112.95, -7.9421]] },
  ];

  return {
    type: "FeatureCollection",
    features: parcels.map((parcel) => ({
      type: "Feature",
      properties: { NIB: parcel.id, nama: parcel.name, sumber: "Data sintetis edukasi lokal" },
      geometry: { type: "Polygon", coordinates: [parcel.ring] },
    })),
  };
}
