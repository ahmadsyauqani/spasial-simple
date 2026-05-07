declare module 'tokml' {
  function tokml(geojson: any, options?: any): string;
  export default tokml;
}

declare module 'shp-write' {
  export function zip(geojson: any, options?: any): Promise<any>;
  export function download(geojson: any, options?: any): void;
}

declare module 'dxf-writer' {
  class DxfWriter {
    constructor();
    drawPoint(x: number, y: number, z?: number): void;
    drawPolyline(points: number[][], closed?: boolean): void;
    toDxfString(): string;
  }
  export default DxfWriter;
}

declare module 'reproject' {
  export function reproject(geojson: any, from: string, to: string, defs: any): any;
  // If used as a default or function directly
  const content: any;
  export default content;
}
