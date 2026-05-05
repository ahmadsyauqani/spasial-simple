import * as L from 'leaflet';
import { db } from './offlineDb';

export class OfflineTileLayer extends L.TileLayer {
  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const tile = document.createElement('img');
    const tileId = `${coords.z}-${coords.x}-${coords.y}-${(this as any)._url}`;

    db.tiles.get(tileId).then(cached => {
      if (cached) {
        tile.src = URL.createObjectURL(cached.tile);
        L.DomEvent.on(tile, 'load', () => {
          done(undefined, tile);
        });
      } else {
        const url = this.getTileUrl(coords);
        tile.src = url;
        L.DomEvent.on(tile, 'load', () => {
          done(undefined, tile);
        });
        L.DomEvent.on(tile, 'error', () => {
          done(new Error('Tile load error'), tile);
        });
      }
    }).catch(e => {
      tile.src = this.getTileUrl(coords);
      done(undefined, tile);
    });

    return tile;
  }
}

export const createOfflineTileLayer = (url: string, options: L.TileLayerOptions) => {
  return new OfflineTileLayer(url, options);
};
