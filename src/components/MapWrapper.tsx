"use client";

import dynamic from "next/dynamic";

const MapArea = dynamic(() => import("./MapArea"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-background absolute inset-0 -z-10">
      <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
    </div>
  ),
});

const MapLayoutComposer = dynamic(() => import("./MapLayoutComposer"), {
  ssr: false,
});

export default function MapWrapper() {
  return (
    <>
      <MapArea />
      <MapLayoutComposer />
    </>
  );
}

