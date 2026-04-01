import { v4 as uuidv4 } from 'uuid';
import type { PipeNode, Pipe, Pump, PumpCurvePoint } from '../types';

/**
 * Parse an EPANET .inp file and return the pipe network data.
 * Supports: JUNCTIONS, RESERVOIRS, TANKS, PIPES, PUMPS, COORDINATES, VERTICES, CURVES
 */
export function parseEpanetINP(content: string): {
    nodes: PipeNode[];
    pipes: Pipe[];
    pumps: Pump[];
} {
    // Split into sections
    const sections = parseSections(content);

    // ID maps: short EPANET ID → our UUID
    const nodeIdMap = new Map<string, string>();
    const pipeIdMap = new Map<string, string>();
    const pumpIdMap = new Map<string, string>();

    // Parse coordinates first so we can assign lat/lng when creating nodes
    const coordMap = parseCoordinates(sections['COORDINATES'] || []);
    const verticesMap = parseVertices(sections['VERTICES'] || []);

    // Determine coordinate system — EPANET coordinates are in meters,
    // our export uses a reference point. We need to convert back to lat/lng.
    // We'll use the centroid of coordinates as reference and convert meters → degrees
    const { refLat, refLng, latScale, lngScale } = computeCoordScaling(coordMap);

    // Parse nodes
    const nodes: PipeNode[] = [];

    // Junctions
    for (const line of sections['JUNCTIONS'] || []) {
        const parts = splitLine(line);
        if (parts.length < 2) continue;
        const id = uuidv4();
        const shortId = parts[0];
        nodeIdMap.set(shortId, id);

        const coord = coordMap.get(shortId);
        const lat = coord ? refLat + coord.y / latScale : 0;
        const lng = coord ? refLng + coord.x / lngScale : 0;

        nodes.push({
            id,
            lat,
            lng,
            elevation: parseFloat(parts[1]) || 0,
            type: 'junction',
            label: shortId,
            demand: parseFloat(parts[2]) || 0,
            accessories: [],
        });
    }

    // Reservoirs
    for (const line of sections['RESERVOIRS'] || []) {
        const parts = splitLine(line);
        if (parts.length < 2) continue;
        const id = uuidv4();
        const shortId = parts[0];
        nodeIdMap.set(shortId, id);

        const coord = coordMap.get(shortId);
        const lat = coord ? refLat + coord.y / latScale : 0;
        const lng = coord ? refLng + coord.x / lngScale : 0;

        nodes.push({
            id,
            lat,
            lng,
            elevation: parseFloat(parts[1]) || 0,
            type: 'reservoir',
            label: shortId,
            accessories: [],
        });
    }

    // Tanks
    for (const line of sections['TANKS'] || []) {
        const parts = splitLine(line);
        if (parts.length < 2) continue;
        const id = uuidv4();
        const shortId = parts[0];
        nodeIdMap.set(shortId, id);

        const coord = coordMap.get(shortId);
        const lat = coord ? refLat + coord.y / latScale : 0;
        const lng = coord ? refLng + coord.x / lngScale : 0;

        nodes.push({
            id,
            lat,
            lng,
            elevation: parseFloat(parts[1]) || 0,
            type: 'tank',
            label: shortId,
            accessories: [],
        });
    }

    // Parse curves (needed for pumps)
    const curveMap = parseCurves(sections['CURVES'] || []);

    // Parse pipes
    const pipes: Pipe[] = [];
    for (const line of sections['PIPES'] || []) {
        const parts = splitLine(line);
        if (parts.length < 6) continue;
        const id = uuidv4();
        const shortId = parts[0];
        pipeIdMap.set(shortId, id);

        const startNodeId = nodeIdMap.get(parts[1]) || '';
        const endNodeId = nodeIdMap.get(parts[2]) || '';
        const length = parseFloat(parts[3]) || 0;
        const diameter = parseFloat(parts[4]) || 100;
        const roughness = parseFloat(parts[5]) || 150;

        // Build route coordinates from vertices + start/end nodes
        const startNode = nodes.find(n => n.id === startNodeId);
        const endNode = nodes.find(n => n.id === endNodeId);

        let routeCoordinates: [number, number][] = [];
        if (startNode && endNode) {
            routeCoordinates.push([startNode.lat, startNode.lng]);

            // Add vertices for this pipe
            const verts = verticesMap.get(shortId);
            if (verts) {
                for (const v of verts) {
                    const vLat = refLat + v.y / latScale;
                    const vLng = refLng + v.x / lngScale;
                    routeCoordinates.push([vLat, vLng]);
                }
            }

            routeCoordinates.push([endNode.lat, endNode.lng]);
        }

        // Guess material from roughness
        let material = 'PVC';
        if (roughness >= 140) material = 'PVC';
        else if (roughness >= 120) material = 'DCI';
        else if (roughness >= 100) material = 'Steel';
        else material = 'Cast Iron';

        // Calculate straight-line distance
        const straightLength = startNode && endNode
            ? haversineDistance(startNode.lat, startNode.lng, endNode.lat, endNode.lng)
            : length;

        pipes.push({
            id,
            startNodeId,
            endNodeId,
            length,
            straightLength: Math.round(straightLength * 10) / 10,
            diameter,
            roughness,
            material,
            routeCoordinates,
        });
    }

    // Parse pumps
    const pumps: Pump[] = [];
    for (const line of sections['PUMPS'] || []) {
        const parts = splitLine(line);
        if (parts.length < 3) continue;
        const id = uuidv4();
        const shortId = parts[0];
        pumpIdMap.set(shortId, id);

        const startNodeId = nodeIdMap.get(parts[1]) || '';
        const endNodeId = nodeIdMap.get(parts[2]) || '';

        // Parse pump parameters (HEAD curveId, SPEED n, etc.)
        let curveId = '';
        let speed = 1.0;
        for (let i = 3; i < parts.length; i++) {
            if (parts[i].toUpperCase() === 'HEAD' && i + 1 < parts.length) {
                curveId = parts[i + 1];
                i++;
            } else if (parts[i].toUpperCase() === 'SPEED' && i + 1 < parts.length) {
                speed = parseFloat(parts[i + 1]) || 1.0;
                i++;
            }
        }

        // Get pump curve from curves section
        const pumpCurve: PumpCurvePoint[] = curveMap.get(curveId) || [];

        // Extract design point (middle point of curve, or first point)
        let designFlow = 10;
        let designHead = 20;
        if (pumpCurve.length > 0) {
            const designIdx = Math.floor(pumpCurve.length / 2);
            designFlow = pumpCurve[designIdx].flow;
            designHead = pumpCurve[designIdx].head;
        }

        // Parse pump status
        const statusLines = sections['STATUS'] || [];
        let status: 'on' | 'off' = 'on';
        for (const sl of statusLines) {
            const sp = splitLine(sl);
            if (sp.length >= 2 && sp[0] === shortId) {
                status = sp[1].toLowerCase().includes('close') ? 'off' : 'on';
            }
        }

        pumps.push({
            id,
            startNodeId,
            endNodeId,
            label: shortId,
            designFlow,
            designHead,
            speed,
            status,
            pumpCurve,
        });
    }

    return { nodes, pipes, pumps };
}


// ─── Helpers ────────────────────────────────────────────────

/** Split INP content into sections */
function parseSections(content: string): Record<string, string[]> {
    const sections: Record<string, string[]> = {};
    let currentSection = '';

    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();

        // Check for section header [SECTION_NAME]
        const sectionMatch = line.match(/^\[([A-Z_]+)\]$/);
        if (sectionMatch) {
            currentSection = sectionMatch[1];
            if (!sections[currentSection]) {
                sections[currentSection] = [];
            }
            continue;
        }

        // Skip empty lines, comments, and END
        if (!line || line.startsWith(';') || line === '[END]') continue;

        if (currentSection) {
            sections[currentSection].push(line);
        }
    }

    return sections;
}

/** Split a line by whitespace/tabs */
function splitLine(line: string): string[] {
    return line.trim().split(/[\s\t]+/).filter(Boolean);
}

/** Parse [COORDINATES] section → Map<nodeId, {x, y}> */
function parseCoordinates(lines: string[]): Map<string, { x: number; y: number }> {
    const map = new Map<string, { x: number; y: number }>();
    for (const line of lines) {
        const parts = splitLine(line);
        if (parts.length < 3) continue;
        map.set(parts[0], {
            x: parseFloat(parts[1]) || 0,
            y: parseFloat(parts[2]) || 0,
        });
    }
    return map;
}

/** Parse [VERTICES] section → Map<pipeId, {x, y}[]> */
function parseVertices(lines: string[]): Map<string, { x: number; y: number }[]> {
    const map = new Map<string, { x: number; y: number }[]>();
    for (const line of lines) {
        const parts = splitLine(line);
        if (parts.length < 3) continue;
        const pipeId = parts[0];
        if (!map.has(pipeId)) map.set(pipeId, []);
        map.get(pipeId)!.push({
            x: parseFloat(parts[1]) || 0,
            y: parseFloat(parts[2]) || 0,
        });
    }
    return map;
}

/** Parse [CURVES] section → Map<curveId, PumpCurvePoint[]> */
function parseCurves(lines: string[]): Map<string, PumpCurvePoint[]> {
    const map = new Map<string, PumpCurvePoint[]>();
    for (const line of lines) {
        const parts = splitLine(line);
        if (parts.length < 3) continue;
        const curveId = parts[0];
        if (!map.has(curveId)) map.set(curveId, []);
        map.get(curveId)!.push({
            flow: parseFloat(parts[1]) || 0,
            head: parseFloat(parts[2]) || 0,
        });
    }
    return map;
}

/**
 * Compute reference point and scaling factors for meter-to-degree conversion.
 * Our export uses: x = (lng - minLng) * LNG_TO_M, y = (lat - minLat) * LAT_TO_M
 * So to reverse: lat = minLat + y / LAT_TO_M, lng = minLng + x / LNG_TO_M
 * 
 * Since we don't know the original minLat/minLng, we use a reasonable default
 * (Indonesia/Jakarta area) and treat coordinates as relative offsets.
 */
function computeCoordScaling(coordMap: Map<string, { x: number; y: number }>): {
    refLat: number;
    refLng: number;
    latScale: number;
    lngScale: number;
} {
    if (coordMap.size === 0) {
        return { refLat: -6.2, refLng: 106.816, latScale: 111320, lngScale: 111320 };
    }

    // The default reference for Indonesian projects
    const refLat = -6.2;
    const refLng = 106.816;
    const LAT_TO_M = 111320;
    const LNG_TO_M = 111320 * Math.cos(refLat * Math.PI / 180);

    return {
        refLat,
        refLng,
        latScale: LAT_TO_M,
        lngScale: LNG_TO_M,
    };
}

/** Haversine distance in meters */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
