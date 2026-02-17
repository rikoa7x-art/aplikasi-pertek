/**
 * Geometry utility for finding nearest point on a polyline route.
 */

/**
 * Find the nearest point on a pipe route to a given click position.
 * Returns the projected point and the segment index where it lies.
 */
export function findNearestPointOnPipe(
  clickLat: number,
  clickLng: number,
  routeCoordinates: [number, number][]
): { lat: number; lng: number; segmentIndex: number; distance: number } {
  if (routeCoordinates.length === 0) {
    return { lat: clickLat, lng: clickLng, segmentIndex: 0, distance: 0 };
  }

  if (routeCoordinates.length === 1) {
    return {
      lat: routeCoordinates[0][0],
      lng: routeCoordinates[0][1],
      segmentIndex: 0,
      distance: 0,
    };
  }

  let minDist = Infinity;
  let bestPoint = { lat: routeCoordinates[0][0], lng: routeCoordinates[0][1] };
  let bestSegmentIndex = 0;

  for (let i = 0; i < routeCoordinates.length - 1; i++) {
    const ax = routeCoordinates[i][1]; // lng
    const ay = routeCoordinates[i][0]; // lat
    const bx = routeCoordinates[i + 1][1]; // lng
    const by = routeCoordinates[i + 1][0]; // lat

    const projected = projectPointOnSegment(clickLng, clickLat, ax, ay, bx, by);
    const dist = Math.sqrt(
      Math.pow(projected.x - clickLng, 2) + Math.pow(projected.y - clickLat, 2)
    );

    if (dist < minDist) {
      minDist = dist;
      bestPoint = { lat: projected.y, lng: projected.x };
      bestSegmentIndex = i;
    }
  }

  return {
    lat: bestPoint.lat,
    lng: bestPoint.lng,
    segmentIndex: bestSegmentIndex,
    distance: minDist,
  };
}

/**
 * Project point P onto line segment AB.
 * Returns the closest point on AB to P.
 */
function projectPointOnSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number
): { x: number; y: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // A and B are the same point
    return { x: ax, y: ay };
  }

  // Parameter t for the projection of P onto line AB
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t)); // Clamp to [0, 1]

  return {
    x: ax + t * dx,
    y: ay + t * dy,
  };
}
