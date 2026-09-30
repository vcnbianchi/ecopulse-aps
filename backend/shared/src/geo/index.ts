import ngeohash from 'ngeohash';

// --- Particionamento geoespacial ------------------------------------------
//
// Cada relato recebe um GeoHash (precisão 9 ≈ célula de 4.8m x 4.8m).
// O PREFIXO do geohash (PARTITION_PREFIX_LENGTH caracteres) identifica um
// quadrante maior (precisão 5 ≈ 4.9km x 4.9km). Um hash consistente desse
// prefixo (FNV-1a) módulo PARTITION_COUNT define a partição/shard.
//
// Consequência: relatos geograficamente próximos caem sempre na MESMA partição
// (localidade espacial), e quadrantes diferentes são distribuídos entre as
// N filas `reports_partition_N`, consumidas por instâncias distintas do
// geo-processing-service (sharding horizontal / balanceamento de carga).

export const GEOHASH_PRECISION = parseInt(process.env.GEOHASH_PRECISION || '9');
export const PARTITION_COUNT = parseInt(process.env.PARTITION_COUNT || '4');
export const PARTITION_PREFIX_LENGTH = parseInt(process.env.PARTITION_PREFIX_LENGTH || '5');

export function computeGeohash(lat: number, lng: number, precision: number = GEOHASH_PRECISION): string {
  return ngeohash.encode(lat, lng, precision);
}

/** Hash consistente (FNV-1a 32 bits) de uma string. */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Índice da partição (0..PARTITION_COUNT-1) para um geohash, usando o prefixo. */
export function partitionForGeohash(geohash: string, partitionCount: number = PARTITION_COUNT): number {
  const prefix = geohash.substring(0, PARTITION_PREFIX_LENGTH);
  return fnv1a(prefix) % partitionCount;
}

export interface GeoPartitionInfo {
  geohash: string;
  prefix: string;
  partition: number;
}

export function resolveGeoPartition(lat: number, lng: number): GeoPartitionInfo {
  const geohash = computeGeohash(lat, lng);
  return {
    geohash,
    prefix: geohash.substring(0, PARTITION_PREFIX_LENGTH),
    partition: partitionForGeohash(geohash),
  };
}

// --- Distância (Haversine) ------------------------------------------------

export function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}
