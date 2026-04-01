import type { PipeNode, Pipe, Pump, PumpCurvePoint } from '../types';

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

// Get elevation from Open-Meteo Elevation API
export async function getElevation(lat: number, lng: number): Promise<number> {
  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`
    );
    const data = await response.json();
    if (data.elevation && data.elevation.length > 0) {
      return data.elevation[0];
    }
    return 0;
  } catch (error) {
    // Fallback: estimate elevation (return 0 if API fails)
    console.warn('Elevation API failed, using fallback', error);
    return estimateElevation(lat, lng);
  }
}

// Simple elevation estimation fallback
function estimateElevation(_lat: number, _lng: number): number {
  // Return 0 as safe default — random values corrupt hydraulic analysis
  console.warn('⚠️ Elevation API gagal — menggunakan elevasi default 0m. Atur elevasi secara manual di panel properti.');
  return 0;
}

// Batch elevation lookup
export async function getElevationBatch(locations: { lat: number; lng: number }[]): Promise<number[]> {
  if (locations.length === 0) return [];
  try {
    const lats = locations.map(l => l.lat).join(',');
    const lngs = locations.map(l => l.lng).join(',');
    const response = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`
    );
    const data = await response.json();
    if (data.elevation) {
      return data.elevation;
    }
    return locations.map(() => 0);
  } catch (error) {
    console.warn('Batch Elevation API failed, using fallback', error);
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

// ── EPANET-STYLE PUMP FUNCTIONS ──

/**
 * Generate a 3-point pump curve from a single design point.
 * EPANET algorithm: given ONE design point (Qd, Hd):
 *   shutoffHead ≈ 1.33 * Hd
 *   maxFlow ≈ 2.0 * Qd
 *   Curve: H = h0 * (1 - (Q/Qmax)^n) where n ≈ 1.852 (like Hazen-Williams)
 */
export function generatePumpCurve(designFlow: number, designHead: number): PumpCurvePoint[] {
  if (designFlow <= 0 || designHead <= 0) {
    return [
      { flow: 0, head: 0 },
      { flow: designFlow, head: designHead },
    ];
  }

  const shutoffHead = 1.33 * designHead;
  const maxFlow = 2.0 * designFlow;

  return [
    { flow: 0, head: Math.round(shutoffHead * 100) / 100 },
    { flow: Math.round(designFlow * 1000) / 1000, head: Math.round(designHead * 100) / 100 },
    { flow: Math.round(maxFlow * 1000) / 1000, head: 0 },
  ];
}

/**
 * Calculate pump head gain at a given flow rate using the pump curve.
 * Uses the parabolic formula: H = h0 - A * Q^B
 * where h0 = shutoff head, and A, B are derived from the design point.
 */
export function getPumpHeadAtFlow(pump: Pump, flowRate: number): number {
  if (pump.status === 'off' || flowRate <= 0) return 0;

  const curve = pump.pumpCurve;
  if (!curve || curve.length < 2) return pump.designHead;

  const h0 = curve[0].head; // shutoff head
  const Qd = pump.designFlow;
  const Hd = pump.designHead;

  if (Qd <= 0 || h0 <= 0) return 0;

  // Derive coefficient A from design point: Hd = h0 - A * Qd^B
  // Use B = 1.852 (standard EPANET exponent)
  const B = 1.852;
  const A = (h0 - Hd) / Math.pow(Qd, B);

  // Apply speed factor: H = speed² * h0 - A * Q^B / speed^(B-1)
  const s = pump.speed || 1.0;
  const H = s * s * h0 - A * Math.pow(flowRate, B) / Math.pow(s, B - 1);

  return Math.max(0, Math.round(H * 100) / 100);
}

/**
 * Calculate pump power consumption.
 * P = ρ * g * Q * H / (η * 1000) [kW]
 * where ρ=1000 kg/m³, g=9.81 m/s², Q in m³/s, H in m, η = efficiency (default 0.75)
 */
export function calculatePumpPower(flowRate_Ls: number, headGain: number, efficiency: number = 0.75): number {
  const Q_m3s = flowRate_Ls / 1000;
  if (Q_m3s <= 0 || headGain <= 0) return 0;

  const rho = 1000; // kg/m³
  const g = 9.81;   // m/s²
  const P = (rho * g * Q_m3s * headGain) / (efficiency * 1000); // kW
  return Math.round(P * 100) / 100;
}

// EPANET-style demand-driven hydraulic analysis
// Now supports PUMPS as links (add head) alongside PIPES (lose head)
// Q = accumulated downstream demands (continuity: ΣQ_in = ΣQ_out + demand)
// hf = Hazen-Williams headloss from actual Q
// P = (source_elevation - node_elevation - cumulative_headloss + cumulative_pump_head) in bar
export function runHydraulicAnalysis(nodes: PipeNode[], pipes: Pipe[], pumps: Pump[] = []): {
  nodes: PipeNode[];
  pipes: Pipe[];
  pumps: Pump[];
} {
  const updatedNodes = nodes.map(n => ({ ...n }));
  const updatedPipes = pipes.map(p => ({ ...p }));
  const updatedPumps = pumps.map(p => ({ ...p }));

  // Find sources (reservoir/tank)
  const sources = updatedNodes.filter(n => n.type === 'reservoir' || n.type === 'tank');

  if (sources.length === 0 || (updatedPipes.length === 0 && updatedPumps.length === 0)) {
    return { nodes: updatedNodes, pipes: updatedPipes, pumps: updatedPumps };
  }

  // ── STEP 1: Build adjacency graph (pipes + pumps as edges) ──
  // linkId format: "pipe:<id>" or "pump:<id>" to distinguish
  interface LinkEdge {
    linkId: string;
    linkType: 'pipe' | 'pump';
    neighborId: string;
  }
  const adjacency = new Map<string, LinkEdge[]>();
  updatedNodes.forEach(n => adjacency.set(n.id, []));

  updatedPipes.forEach(p => {
    const lid = `pipe:${p.id}`;
    adjacency.get(p.startNodeId)?.push({ linkId: lid, linkType: 'pipe', neighborId: p.endNodeId });
    adjacency.get(p.endNodeId)?.push({ linkId: lid, linkType: 'pipe', neighborId: p.startNodeId });
  });

  updatedPumps.forEach(p => {
    const lid = `pump:${p.id}`;
    adjacency.get(p.startNodeId)?.push({ linkId: lid, linkType: 'pump', neighborId: p.endNodeId });
    adjacency.get(p.endNodeId)?.push({ linkId: lid, linkType: 'pump', neighborId: p.startNodeId });
  });

  // ── STEP 2: BFS from source to build directed tree ──
  const linkUpstream = new Map<string, string>(); // linkId -> upstream nodeId
  const linkDownstream = new Map<string, string>(); // linkId -> downstream nodeId
  const nodeOrder: string[] = [];
  const nodeChildren = new Map<string, string[]>(); // nodeId -> [child linkIds]
  const nodeLinkFromParent = new Map<string, string>(); // nodeId -> parent linkId

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
    for (const { linkId, neighborId } of neighbors) {
      if (visitedBFS.has(neighborId)) {
        // This neighbor is upstream (already visited)
        linkUpstream.set(linkId, neighborId);
        linkDownstream.set(linkId, nodeId);
        nodeLinkFromParent.set(nodeId, linkId);

        // Register this link as a child of the upstream node
        const children = nodeChildren.get(neighborId) || [];
        children.push(linkId);
        nodeChildren.set(neighborId, children);
      }
    }

    // Add unvisited neighbors to BFS queue
    for (const { neighborId } of neighbors) {
      if (!visitedBFS.has(neighborId)) bfsQueue.push(neighborId);
    }
  }

  // ── STEP 3: Calculate flow per link (demand accumulation) ──
  const nodeTotalDemand = new Map<string, number>();

  for (let i = nodeOrder.length - 1; i >= 0; i--) {
    const nodeId = nodeOrder[i];
    const node = updatedNodes.find(n => n.id === nodeId);
    if (!node) continue;

    const ownDemand = (node.type === 'junction' ? (node.demand || 0) : 0);

    const childLinks = nodeChildren.get(nodeId) || [];
    let childDemandSum = 0;
    for (const clId of childLinks) {
      const downNodeId = linkDownstream.get(clId);
      if (downNodeId) {
        childDemandSum += nodeTotalDemand.get(downNodeId) || 0;
      }
    }

    nodeTotalDemand.set(nodeId, ownDemand + childDemandSum);
  }

  // ── STEP 4: Set Q, V, hf for each PIPE ──
  updatedPipes.forEach(pipe => {
    const lid = `pipe:${pipe.id}`;
    const downNodeId = linkDownstream.get(lid);
    if (!downNodeId) {
      pipe.flowRate = 0;
      pipe.velocity = 0;
      pipe.headloss = 0;
      return;
    }

    const Q_Ls = nodeTotalDemand.get(downNodeId) || 0;
    const Q_m3s = Q_Ls / 1000;

    pipe.flowRate = Math.round(Q_Ls * 1000) / 1000;

    const D_m = pipe.diameter / 1000;
    const A = Math.PI * Math.pow(D_m / 2, 2);
    const L = pipe.length;
    const C = pipe.roughness;

    if (A > 0 && Q_m3s > 0) {
      pipe.velocity = Math.round((Q_m3s / A) * 1000) / 1000;
    } else {
      pipe.velocity = 0;
    }

    if (L > 0 && D_m > 0 && C > 0 && Q_m3s > 0) {
      pipe.headloss = Math.round(
        (10.67 * L * Math.pow(Q_m3s, 1.852)) /
        (Math.pow(C, 1.852) * Math.pow(D_m, 4.87)) * 1000
      ) / 1000;
    } else {
      pipe.headloss = 0;
    }
  });

  // ── STEP 4b: Set Q, head gain, power for each PUMP ──
  updatedPumps.forEach(pump => {
    const lid = `pump:${pump.id}`;
    const downNodeId = linkDownstream.get(lid);
    if (!downNodeId || pump.status === 'off') {
      pump.flowRate = 0;
      pump.headGain = 0;
      pump.power = 0;
      return;
    }

    const Q_Ls = nodeTotalDemand.get(downNodeId) || 0;
    pump.flowRate = Math.round(Q_Ls * 1000) / 1000;

    // Calculate head gain from pump curve at this flow
    pump.headGain = getPumpHeadAtFlow(pump, Q_Ls);

    // Calculate power
    pump.power = calculatePumpPower(Q_Ls, pump.headGain);
  });

  // ── STEP 5: Propagate pressure from sources (in bar) ──
  // Now accounts for pump head GAIN alongside pipe headLOSS
  const METERS_PER_BAR = 10.197;

  // Track cumulative head changes (losses - gains) per node
  const nodeCumulativeHeadChange = new Map<string, number>();

  sources.forEach(source => {
    source.pressure = 0;
    source.headloss = 0;
    nodeCumulativeHeadChange.set(source.id, 0);
  });

  for (let i = 0; i < nodeOrder.length; i++) {
    const nodeId = nodeOrder[i];
    const node = updatedNodes.find(n => n.id === nodeId);
    if (!node) continue;

    if (node.type === 'reservoir' || node.type === 'tank') continue;

    const parentLinkId = nodeLinkFromParent.get(nodeId);
    if (!parentLinkId) continue;

    const upNodeId = linkUpstream.get(parentLinkId);
    if (!upNodeId) continue;

    const upstreamCumHl = nodeCumulativeHeadChange.get(upNodeId) || 0;

    let linkHeadChange = 0; // positive = loss, negative = gain

    if (parentLinkId.startsWith('pipe:')) {
      // PIPE: adds headloss (positive = loss)
      const pipeRealId = parentLinkId.slice(5);
      const parentPipe = updatedPipes.find(p => p.id === pipeRealId);
      linkHeadChange = parentPipe?.headloss || 0;
    } else if (parentLinkId.startsWith('pump:')) {
      // PUMP: subtracts head (negative = gain)
      const pumpRealId = parentLinkId.slice(5);
      const parentPump = updatedPumps.find(p => p.id === pumpRealId);
      linkHeadChange = -(parentPump?.headGain || 0);
    }

    const cumulativeHl = upstreamCumHl + linkHeadChange;
    nodeCumulativeHeadChange.set(nodeId, cumulativeHl);

    const source = sources[0];
    const staticHead = source.elevation - node.elevation;
    const pressureHead = staticHead - cumulativeHl; // cumulativeHl can be negative (net gain)

    node.pressure = Math.round((pressureHead / METERS_PER_BAR) * 100) / 100;
    node.headloss = Math.round(cumulativeHl * 1000) / 1000;
  }

  return { nodes: updatedNodes, pipes: updatedPipes, pumps: updatedPumps };
}

// Pipe material options
export const PIPE_MATERIALS = [
  { name: 'PVC', roughness: 150, diameters: [25, 40, 50, 75, 100, 150, 200, 250, 300] },
  { name: 'HDPE', roughness: 140, diameters: [25, 40, 63, 90, 110, 160, 200, 250, 315] },
  { name: 'GI (Galvanized Iron)', roughness: 120, diameters: [25, 40, 50, 75, 100, 150, 200] },
  { name: 'DCI (Ductile Cast Iron)', roughness: 130, diameters: [100, 150, 200, 250, 300, 400, 500] },
  { name: 'Steel', roughness: 110, diameters: [100, 150, 200, 250, 300, 400, 500, 600] },
];
