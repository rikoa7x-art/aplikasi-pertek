import type { PipeNode, Pipe } from '../types';

// Calculate distance between two coordinates using Haversine formula
export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

// Get elevation from Open Elevation API
export async function getElevation(lat: number, lng: number): Promise<number> {
  try {
    const response = await fetch(
      `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lng}`
    );
    const data = await response.json();
    if (data.results && data.results.length > 0) {
      return data.results[0].elevation;
    }
    return 0;
  } catch {
    // Fallback: estimate elevation (return 0 if API fails)
    console.warn('Elevation API failed, using fallback');
    return estimateElevation(lat, lng);
  }
}

// Simple elevation estimation fallback
function estimateElevation(_lat: number, _lng: number): number {
  // Return a random reasonable elevation for demo purposes
  return Math.round(50 + Math.random() * 200);
}

// Batch elevation lookup
export async function getElevationBatch(locations: { lat: number; lng: number }[]): Promise<number[]> {
  try {
    const locStr = locations.map(l => `${l.lat},${l.lng}`).join('|');
    const response = await fetch(
      `https://api.open-elevation.com/api/v1/lookup?locations=${locStr}`
    );
    const data = await response.json();
    if (data.results) {
      return data.results.map((r: { elevation: number }) => r.elevation);
    }
    return locations.map(() => 0);
  } catch {
    return locations.map((l) => estimateElevation(l.lat, l.lng));
  }
}

// Calculate pipe headloss using Hazen-Williams formula
export function calculateHeadloss(pipe: Pipe, flowRate: number): number {
  const D = pipe.diameter / 1000; // Convert mm to m
  const L = pipe.length;
  const C = pipe.roughness;
  const Q = flowRate / 1000; // Convert L/s to m³/s

  if (D <= 0 || C <= 0 || L <= 0) return 0;

  // Hazen-Williams: hf = 10.67 * L * Q^1.852 / (C^1.852 * D^4.87)
  const hf = 10.67 * L * Math.pow(Math.abs(Q), 1.852) / (Math.pow(C, 1.852) * Math.pow(D, 4.87));
  return hf;
}

// Calculate velocity in pipe
export function calculateVelocity(pipe: Pipe, flowRate: number): number {
  const D = pipe.diameter / 1000; // Convert mm to m
  const A = Math.PI * Math.pow(D / 2, 2); // Cross-sectional area
  const Q = flowRate / 1000; // Convert L/s to m³/s

  if (A <= 0) return 0;
  return Math.abs(Q) / A;
}

// EPANET-style demand-driven hydraulic analysis
// Q = accumulated downstream demands (continuity: ΣQ_in = ΣQ_out + demand)
// hf = Hazen-Williams headloss from actual Q
// P = (source_elevation - node_elevation - cumulative_headloss) in bar
export function runHydraulicAnalysis(nodes: PipeNode[], pipes: Pipe[]): {
  nodes: PipeNode[];
  pipes: Pipe[];
} {
  const updatedNodes = nodes.map(n => ({ ...n }));
  const updatedPipes = pipes.map(p => ({ ...p }));

  // Find sources (reservoir/tank)
  const sources = updatedNodes.filter(n => n.type === 'reservoir' || n.type === 'tank');

  if (sources.length === 0 || updatedPipes.length === 0) {
    return { nodes: updatedNodes, pipes: updatedPipes };
  }

  // ── STEP 1: Build adjacency graph ──
  const adjacency = new Map<string, { pipeId: string; neighborId: string }[]>();
  updatedNodes.forEach(n => adjacency.set(n.id, []));
  updatedPipes.forEach(p => {
    adjacency.get(p.startNodeId)?.push({ pipeId: p.id, neighborId: p.endNodeId });
    adjacency.get(p.endNodeId)?.push({ pipeId: p.id, neighborId: p.startNodeId });
  });

  // ── STEP 2: BFS from source to build directed tree ──
  // Determine upstream/downstream direction for each pipe
  const pipeUpstream = new Map<string, string>(); // pipeId -> upstream nodeId
  const pipeDownstream = new Map<string, string>(); // pipeId -> downstream nodeId
  const nodeOrder: string[] = []; // BFS traversal order
  const nodeChildren = new Map<string, string[]>(); // nodeId -> [child pipeIds]
  const nodePipeFromParent = new Map<string, string>(); // nodeId -> parent pipeId

  const visitedBFS = new Set<string>();

  sources.forEach(source => {
    visitedBFS.add(source.id);
    nodeOrder.push(source.id);
    nodeChildren.set(source.id, []);
  });

  const bfsQueue: string[] = [];
  sources.forEach(source => {
    const neighbors = adjacency.get(source.id) || [];
    for (const { neighborId } of neighbors) {
      if (!visitedBFS.has(neighborId)) bfsQueue.push(neighborId);
    }
  });

  while (bfsQueue.length > 0) {
    const nodeId = bfsQueue.shift()!;
    if (visitedBFS.has(nodeId)) continue;
    visitedBFS.add(nodeId);
    nodeOrder.push(nodeId);
    nodeChildren.set(nodeId, []);

    const neighbors = adjacency.get(nodeId) || [];
    for (const { pipeId, neighborId } of neighbors) {
      if (visitedBFS.has(neighborId)) {
        // This neighbor is upstream (already visited)
        pipeUpstream.set(pipeId, neighborId);
        pipeDownstream.set(pipeId, nodeId);
        nodePipeFromParent.set(nodeId, pipeId);

        // Register this pipe as a child of the upstream node
        const children = nodeChildren.get(neighborId) || [];
        children.push(pipeId);
        nodeChildren.set(neighborId, children);
      }
    }

    // Add unvisited neighbors to BFS queue
    for (const { neighborId } of neighbors) {
      if (!visitedBFS.has(neighborId)) bfsQueue.push(neighborId);
    }
  }

  // ── STEP 3: Calculate flow per pipe (demand accumulation) ──
  // Traverse in REVERSE BFS order (leaf nodes first, back to source)
  // Each pipe carries: demand at downstream node + all demands further downstream
  const nodeTotalDemand = new Map<string, number>(); // nodeId -> total demand at and below

  for (let i = nodeOrder.length - 1; i >= 0; i--) {
    const nodeId = nodeOrder[i];
    const node = updatedNodes.find(n => n.id === nodeId);
    if (!node) continue;

    // This node's own demand (only junctions have demand)
    const ownDemand = (node.type === 'junction' ? (node.demand || 0) : 0);

    // Sum demands from all downstream children
    const childPipes = nodeChildren.get(nodeId) || [];
    let childDemandSum = 0;
    for (const cpId of childPipes) {
      const downNodeId = pipeDownstream.get(cpId);
      if (downNodeId) {
        childDemandSum += nodeTotalDemand.get(downNodeId) || 0;
      }
    }

    nodeTotalDemand.set(nodeId, ownDemand + childDemandSum);
  }

  // ── STEP 4: Set Q, V, hf for each pipe ──
  updatedPipes.forEach(pipe => {
    const downNodeId = pipeDownstream.get(pipe.id);
    if (!downNodeId) {
      pipe.flowRate = 0;
      pipe.velocity = 0;
      pipe.headloss = 0;
      return;
    }

    // Flow = total demand at and below the downstream node
    const Q_Ls = nodeTotalDemand.get(downNodeId) || 0;
    const Q_m3s = Q_Ls / 1000; // L/s to m³/s

    pipe.flowRate = Math.round(Q_Ls * 1000) / 1000; // L/s with 3 decimals

    const D_m = pipe.diameter / 1000; // mm to m
    const A = Math.PI * Math.pow(D_m / 2, 2); // m²
    const L = pipe.length; // m
    const C = pipe.roughness; // HW coefficient

    // Velocity: V = Q / A
    if (A > 0 && Q_m3s > 0) {
      pipe.velocity = Math.round((Q_m3s / A) * 1000) / 1000; // m/s
    } else {
      pipe.velocity = 0;
    }

    // Headloss: Hazen-Williams
    // hf = 10.67 * L * Q^1.852 / (C^1.852 * D^4.87)
    if (L > 0 && D_m > 0 && C > 0 && Q_m3s > 0) {
      pipe.headloss = Math.round(
        (10.67 * L * Math.pow(Q_m3s, 1.852)) /
        (Math.pow(C, 1.852) * Math.pow(D_m, 4.87)) * 1000
      ) / 1000; // m with 3 decimals
    } else {
      pipe.headloss = 0;
    }
  });

  // ── STEP 5: Propagate pressure from sources (in bar) ──
  // P = (source_elevation - node_elevation - cumulative_headloss) / 10.197
  const METERS_PER_BAR = 10.197;

  // Initialize sources
  sources.forEach(source => {
    source.pressure = 0; // Source = 0 bar gauge
    source.headloss = 0;
  });

  // Traverse in BFS order (source first → downstream)
  for (let i = 0; i < nodeOrder.length; i++) {
    const nodeId = nodeOrder[i];
    const node = updatedNodes.find(n => n.id === nodeId);
    if (!node) continue;

    // Skip sources (already initialized)
    if (node.type === 'reservoir' || node.type === 'tank') continue;

    // Find the pipe connecting this node to its parent
    const parentPipeId = nodePipeFromParent.get(nodeId);
    if (!parentPipeId) continue;

    const parentPipe = updatedPipes.find(p => p.id === parentPipeId);
    const upNodeId = pipeUpstream.get(parentPipeId);
    const upNode = upNodeId ? updatedNodes.find(n => n.id === upNodeId) : null;
    if (!parentPipe || !upNode) continue;

    // Cumulative headloss = upstream node's cumulative + this pipe's headloss
    const upstreamCumHl = upNode.headloss || 0;
    const pipeHl = parentPipe.headloss || 0;
    const cumulativeHl = upstreamCumHl + pipeHl;

    // Static head from source to this node
    const source = sources[0]; // Primary source
    const staticHead = source.elevation - node.elevation;

    // Pressure = remaining head after friction losses
    const pressureHead = staticHead - cumulativeHl;

    node.pressure = Math.round((pressureHead / METERS_PER_BAR) * 100) / 100; // bar
    node.headloss = Math.round(cumulativeHl * 1000) / 1000; // m
  }

  return { nodes: updatedNodes, pipes: updatedPipes };
}

// Pipe material options
export const PIPE_MATERIALS = [
  { name: 'PVC', roughness: 150, diameters: [50, 75, 100, 150, 200, 250, 300] },
  { name: 'HDPE', roughness: 140, diameters: [63, 90, 110, 160, 200, 250, 315] },
  { name: 'GI (Galvanized Iron)', roughness: 120, diameters: [50, 75, 100, 150, 200] },
  { name: 'DCI (Ductile Cast Iron)', roughness: 130, diameters: [100, 150, 200, 250, 300, 400, 500] },
  { name: 'Steel', roughness: 110, diameters: [100, 150, 200, 250, 300, 400, 500, 600] },
];
