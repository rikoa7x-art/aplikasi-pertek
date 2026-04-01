/**
 * OSRM Routing Service
 * Uses the public OSRM demo server to get road-following routes.
 * Falls back to straight line if routing fails.
 */

import { calculateDistance } from './calculations';

export interface RouteResult {
  coordinates: [number, number][]; // [lat, lng][]
  distance: number; // meters (road distance)
  duration: number; // seconds
  success: boolean;
}

/**
 * Get a road-following route between two points using OSRM.
 * OSRM expects coordinates as lng,lat (note: reversed from Leaflet's lat,lng)
 */
export async function getRoute(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
): Promise<RouteResult> {
  try {
    // OSRM uses lng,lat order
    const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson&steps=false`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`OSRM returned ${response.status}`);
    }

    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      throw new Error('No route found');
    }

    const route = data.routes[0];
    const geojsonCoords: [number, number][] = route.geometry.coordinates;

    // Convert from GeoJSON [lng, lat] to Leaflet [lat, lng]
    const coordinates: [number, number][] = geojsonCoords.map(
      ([lng, lat]: [number, number]) => [lat, lng]
    );

    return {
      coordinates,
      distance: route.distance, // in meters
      duration: route.duration,
      success: true,
    };
  } catch (error) {
    console.warn('OSRM routing failed, using straight line:', error);

    // Fallback to straight line
    return {
      coordinates: [
        [startLat, startLng],
        [endLat, endLng],
      ],
      distance: calculateDistance(startLat, startLng, endLat, endLng),
      duration: 0,
      success: false,
    };
  }
}

/**
 * Calculate the total distance of a route from its coordinates
 */
export function calculateRouteDistance(coordinates: [number, number][]): number {
  let total = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    total += calculateDistance(
      coordinates[i][0],
      coordinates[i][1],
      coordinates[i + 1][0],
      coordinates[i + 1][1]
    );
  }
  return total;
}
