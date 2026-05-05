import Dexie, { Table } from 'dexie';

export interface LocalLayer {
  id: string;
  name: string;
  geojson: any;
  lastUpdated: number;
}

export interface OfflineTile {
  id: string; // z-x-y-basemap
  tile: Blob;
  expires: number;
}

export class SAKAGISDatabase extends Dexie {
  layers!: Table<LocalLayer>;
  tiles!: Table<OfflineTile>;

  constructor() {
    super('SAKAGIS_DB');
    this.version(1).stores({
      layers: 'id, name, lastUpdated',
      tiles: 'id, expires'
    });
  }
}

export const db = new SAKAGISDatabase();
