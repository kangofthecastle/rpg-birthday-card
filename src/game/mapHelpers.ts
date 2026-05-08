export interface TiledProperty {
  readonly name: string;
  readonly type: string;
  readonly value: string | number | boolean;
}

export interface TiledObject {
  readonly id: number;
  readonly name: string;
  readonly type?: string;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
  readonly point?: boolean;
  readonly properties?: readonly TiledProperty[];
}

export interface TiledObjectLayer {
  readonly id: number;
  readonly name: string;
  readonly type: 'objectgroup';
  readonly objects: readonly TiledObject[];
}

export interface TiledTileLayer {
  readonly id: number;
  readonly name: string;
  readonly type: 'tilelayer';
  readonly width: number;
  readonly height: number;
  readonly data: readonly number[];
}

export type TiledLayer = TiledObjectLayer | TiledTileLayer;

export interface TiledMapJson {
  readonly width: number;
  readonly height: number;
  readonly tilewidth: number;
  readonly tileheight: number;
  readonly layers: readonly TiledLayer[];
}

export interface PointObject {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export interface RectObject {
  readonly id: string;
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly properties: Record<string, string | number | boolean>;
}

export function getObjectLayer(
  map: TiledMapJson,
  layerName: string,
): TiledObjectLayer | undefined {
  return map.layers.find(
    (layer): layer is TiledObjectLayer =>
      layer.type === 'objectgroup' && layer.name === layerName,
  );
}

export function getPointObject(
  map: TiledMapJson,
  layerName: string,
  objectName: string,
): PointObject {
  const object = getObjectLayer(map, layerName)?.objects.find(
    (candidate) => candidate.name === objectName,
  );

  if (!object) {
    throw new Error(`Missing point object ${layerName}/${objectName}`);
  }

  return {
    id: object.name,
    x: object.x,
    y: object.y,
  };
}

export function getRectObjects(map: TiledMapJson, layerName: string): RectObject[] {
  return (
    getObjectLayer(map, layerName)?.objects.map((object) => ({
      id: object.name,
      type: object.type ?? '',
      x: object.x,
      y: object.y,
      width: object.width ?? 0,
      height: object.height ?? 0,
      properties: getProperties(object),
    })) ?? []
  );
}

export function getStringProperty(
  object: TiledObject,
  propertyName: string,
): string | undefined {
  const value = getProperties(object)[propertyName];
  return typeof value === 'string' ? value : undefined;
}

function getProperties(object: TiledObject): Record<string, string | number | boolean> {
  return Object.fromEntries(
    object.properties?.map((property) => [property.name, property.value]) ?? [],
  );
}
