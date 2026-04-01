import type { PipeNode, Pipe, Pump } from '../types';

/**
 * Export pipe network to EPANET INP format
 * This generates a valid .inp file that can be opened in EPANET 2.x
 */
export function generateEpanetINP(nodes: PipeNode[], pipes: Pipe[], pumps: Pump[] = []): string {
    const lines: string[] = [];

    // Create short node IDs for EPANET compatibility
    const nodeIdMap = new Map<string, string>();
    let junctionCounter = 1;
    let reservoirCounter = 1;
    let tankCounter = 1;

    nodes.forEach(node => {
        let shortId: string;
        if (node.type === 'reservoir') {
            shortId = `R${reservoirCounter++}`;
        } else if (node.type === 'tank') {
            shortId = `T${tankCounter++}`;
        } else {
            shortId = `J${junctionCounter++}`;
        }
        nodeIdMap.set(node.id, shortId);
    });

    // Create short pipe IDs
    const pipeIdMap = new Map<string, string>();
    pipes.forEach((pipe, index) => {
        pipeIdMap.set(pipe.id, `P${index + 1}`);
    });

    // Create short pump IDs and curve IDs
    const pumpIdMap = new Map<string, string>();
    const pumpCurveMap = new Map<string, string>();
    pumps.forEach((pump, index) => {
        pumpIdMap.set(pump.id, `PMP${index + 1}`);
        pumpCurveMap.set(pump.id, `PUMP${index + 1}`);
    });

    // ── [TITLE] ──
    lines.push('[TITLE]');
    lines.push(`PDAM Pipe Network - Exported ${new Date().toISOString().slice(0, 19)}`);
    lines.push('');

    // ── [JUNCTIONS] ──
    // ID  Elevation  Demand  Pattern
    lines.push('[JUNCTIONS]');
    lines.push(';ID             \tElev          \tDemand        \tPattern');
    nodes.forEach(node => {
        if (node.type === 'junction') {
            const id = nodeIdMap.get(node.id) || '';
            const elev = node.elevation.toFixed(2);
            const demand = (node.demand || 0).toFixed(4);
            lines.push(` ${id.padEnd(16)}\t${elev.padEnd(14)}\t${demand.padEnd(14)}\t`);
        }
    });
    lines.push('');

    // ── [RESERVOIRS] ──
    // ID  Head  Pattern
    lines.push('[RESERVOIRS]');
    lines.push(';ID             \tHead          \tPattern');
    nodes.forEach(node => {
        if (node.type === 'reservoir') {
            const id = nodeIdMap.get(node.id) || '';
            const head = node.elevation.toFixed(2);
            lines.push(` ${id.padEnd(16)}\t${head.padEnd(14)}\t`);
        }
    });
    lines.push('');

    // ── [TANKS] ──
    // ID  Elevation  InitLevel  MinLevel  MaxLevel  Diameter  MinVol  VolCurve
    lines.push('[TANKS]');
    lines.push(';ID             \tElevation     \tInitLevel     \tMinLevel      \tMaxLevel      \tDiameter      \tMinVol        \tVolCurve');
    nodes.forEach(node => {
        if (node.type === 'tank') {
            const id = nodeIdMap.get(node.id) || '';
            const elev = node.elevation.toFixed(2);
            // Default tank parameters
            lines.push(` ${id.padEnd(16)}\t${elev.padEnd(14)}\t${'3.00'.padEnd(14)}\t${'0.00'.padEnd(14)}\t${'6.00'.padEnd(14)}\t${'15.00'.padEnd(14)}\t${'0.00'.padEnd(14)}\t`);
        }
    });
    lines.push('');

    // ── [PIPES] ──
    // ID  Node1  Node2  Length  Diameter  Roughness  MinorLoss  Status
    lines.push('[PIPES]');
    lines.push(';ID             \tNode1          \tNode2          \tLength        \tDiameter      \tRoughness     \tMinorLoss     \tStatus');
    pipes.forEach(pipe => {
        const id = pipeIdMap.get(pipe.id) || '';
        const node1 = nodeIdMap.get(pipe.startNodeId) || '';
        const node2 = nodeIdMap.get(pipe.endNodeId) || '';
        const length = pipe.length.toFixed(2);
        const diameter = pipe.diameter.toFixed(2);
        const roughness = pipe.roughness.toFixed(2);
        lines.push(` ${id.padEnd(16)}\t${node1.padEnd(15)}\t${node2.padEnd(15)}\t${length.padEnd(14)}\t${diameter.padEnd(14)}\t${roughness.padEnd(14)}\t${'0.00'.padEnd(14)}\tOpen`);
    });
    lines.push('');

    // ── [PUMPS] ──
    lines.push('[PUMPS]');
    lines.push(';ID             \tNode1          \tNode2          \tParameters');
    pumps.forEach(pump => {
        const id = pumpIdMap.get(pump.id) || '';
        const node1 = nodeIdMap.get(pump.startNodeId) || '';
        const node2 = nodeIdMap.get(pump.endNodeId) || '';
        const curveId = pumpCurveMap.get(pump.id) || '';
        let params = `HEAD ${curveId}`;
        if (pump.speed !== 1.0) {
            params += ` SPEED ${pump.speed.toFixed(2)}`;
        }
        lines.push(` ${id.padEnd(16)}\t${node1.padEnd(15)}\t${node2.padEnd(15)}\t${params}`);
    });
    lines.push('');

    // ── [VALVES] ── (map accessories)
    lines.push('[VALVES]');
    lines.push(';ID             \tNode1          \tNode2          \tDiameter      \tType          \tSetting       \tMinorLoss');
    lines.push('');

    // ── [TAGS] ──
    lines.push('[TAGS]');
    lines.push('');

    // ── [DEMANDS] ──
    lines.push('[DEMANDS]');
    lines.push(';Junction       \tDemand        \tPattern       \tCategory');
    lines.push('');

    // ── [STATUS] ──
    lines.push('[STATUS]');
    lines.push(';ID             \tStatus/Setting');
    pumps.forEach(pump => {
        const id = pumpIdMap.get(pump.id) || '';
        if (pump.status === 'off') {
            lines.push(` ${id.padEnd(16)}\tClosed`);
        }
    });
    lines.push('');

    // ── [PATTERNS] ──
    lines.push('[PATTERNS]');
    lines.push(';ID             \tMultipliers');
    lines.push('');

    // ── [CURVES] ──
    lines.push('[CURVES]');
    lines.push(';ID             \tX-Value       \tY-Value');
    lines.push('');

    // ── [CURVES] ──
    lines.push('[CURVES]');
    lines.push(';ID             \tX-Value       \tY-Value');
    pumps.forEach(pump => {
        const curveId = pumpCurveMap.get(pump.id) || '';
        // EPANET pump curve: flow (LPS) vs head (m)
        pump.pumpCurve.forEach(point => {
            lines.push(` ${curveId.padEnd(16)}\t${point.flow.toFixed(4).padEnd(14)}\t${point.head.toFixed(4)}`);
        });
    });
    lines.push('');

    // ── [CONTROLS] ──
    lines.push('[CONTROLS]');
    lines.push('');

    // ── [RULES] ──
    lines.push('[RULES]');
    lines.push('');

    // ── [ENERGY] ──
    lines.push('[ENERGY]');
    lines.push(' Global Efficiency  \t75');
    lines.push(' Global Price       \t0');
    lines.push(' Demand Charge      \t0');
    lines.push('');

    // ── [EMITTERS] ──
    lines.push('[EMITTERS]');
    lines.push(';Junction       \tCoefficient');
    lines.push('');

    // ── [QUALITY] ──
    lines.push('[QUALITY]');
    lines.push(';Node           \tInitQual');
    lines.push('');

    // ── [SOURCES] ──
    lines.push('[SOURCES]');
    lines.push(';Node           \tType          \tQuality       \tPattern');
    lines.push('');

    // ── [REACTIONS] ──
    lines.push('[REACTIONS]');
    lines.push(';Type     \tPipe/Tank      \tCoefficient');
    lines.push('');

    lines.push('[REACTIONS]');
    lines.push(' Order Bulk           \t1');
    lines.push(' Order Tank           \t1');
    lines.push(' Order Wall           \t1');
    lines.push(' Global Bulk          \t0');
    lines.push(' Global Wall          \t0');
    lines.push(' Limiting Potential   \t0');
    lines.push(' Roughness Correlation\t0');
    lines.push('');

    // ── [MIXING] ──
    lines.push('[MIXING]');
    lines.push(';Tank           \tModel');
    lines.push('');

    // ── [TIMES] ──
    lines.push('[TIMES]');
    lines.push(' Duration            \t0:00');
    lines.push(' Hydraulic Timestep  \t1:00');
    lines.push(' Quality Timestep    \t0:05');
    lines.push(' Pattern Timestep    \t1:00');
    lines.push(' Pattern Start       \t0:00');
    lines.push(' Report Timestep     \t1:00');
    lines.push(' Report Start        \t0:00');
    lines.push(' Start ClockTime     \t12 am');
    lines.push(' Statistic           \tNone');
    lines.push('');

    // ── [REPORT] ──
    lines.push('[REPORT]');
    lines.push(' Status              \tNo');
    lines.push(' Summary             \tNo');
    lines.push(' Page                \t0');
    lines.push('');

    // ── [OPTIONS] ──
    lines.push('[OPTIONS]');
    lines.push(' Units               \tLPS');
    lines.push(' Headloss            \tH-W');
    lines.push(' Specific Gravity    \t1');
    lines.push(' Viscosity           \t1');
    lines.push(' Trials              \t40');
    lines.push(' Accuracy            \t0.001');
    lines.push(' CHECKFREQ           \t2');
    lines.push(' MAXCHECK            \t10');
    lines.push(' DAMPLIMIT           \t0');
    lines.push(' Unbalanced          \tContinue 10');
    lines.push(' Pattern             \t1');
    lines.push(' Demand Multiplier   \t1.0');
    lines.push(' Emitter Exponent    \t0.5');
    lines.push(' Quality             \tNone mg/L');
    lines.push(' Diffusivity         \t1');
    lines.push(' Tolerance           \t0.01');
    lines.push('');

    // ── [COORDINATES] ──
    // Use lat/lng scaled to reasonable EPANET coordinates
    lines.push('[COORDINATES]');
    lines.push(';Node           \tX-Coord       \tY-Coord');

    // Find bounds for coordinate scaling
    if (nodes.length > 0) {
        const lats = nodes.map(n => n.lat);
        const lngs = nodes.map(n => n.lng);
        const minLat = Math.min(...lats);
        const minLng = Math.min(...lngs);

        // Scale to meters (approximate)
        const LAT_TO_M = 111320; // 1 degree latitude ≈ 111320 m
        const LNG_TO_M = 111320 * Math.cos((minLat + Math.max(...lats)) / 2 * Math.PI / 180);

        nodes.forEach(node => {
            const id = nodeIdMap.get(node.id) || '';
            const x = ((node.lng - minLng) * LNG_TO_M).toFixed(2);
            const y = ((node.lat - minLat) * LAT_TO_M).toFixed(2);
            lines.push(` ${id.padEnd(16)}\t${x.padEnd(14)}\t${y}`);
        });
    }
    lines.push('');

    // ── [VERTICES] ──
    // Add pipe route coordinates as vertices for accurate pipe paths
    lines.push('[VERTICES]');
    lines.push(';Link           \tX-Coord       \tY-Coord');

    if (nodes.length > 0) {
        const lats = nodes.map(n => n.lat);
        const lngs = nodes.map(n => n.lng);
        const minLat = Math.min(...lats);
        const minLng = Math.min(...lngs);
        const LAT_TO_M = 111320;
        const LNG_TO_M = 111320 * Math.cos((minLat + Math.max(...lats)) / 2 * Math.PI / 180);

        pipes.forEach(pipe => {
            const pipeShortId = pipeIdMap.get(pipe.id) || '';
            // Add intermediate route coordinates as vertices (skip first and last = nodes)
            if (pipe.routeCoordinates && pipe.routeCoordinates.length > 2) {
                for (let i = 1; i < pipe.routeCoordinates.length - 1; i++) {
                    const [lat, lng] = pipe.routeCoordinates[i];
                    const x = ((lng - minLng) * LNG_TO_M).toFixed(2);
                    const y = ((lat - minLat) * LAT_TO_M).toFixed(2);
                    lines.push(` ${pipeShortId.padEnd(16)}\t${x.padEnd(14)}\t${y}`);
                }
            }
        });
    }
    lines.push('');

    // ── [LABELS] ──
    lines.push('[LABELS]');
    lines.push(';X-Coord        \tY-Coord       \tLabel & Anchor Node');
    lines.push('');

    // ── [BACKDROP] ──
    lines.push('[BACKDROP]');
    lines.push(' DIMENSIONS     \t0.00          \t0.00          \t10000.00      \t10000.00');
    lines.push(' UNITS          \tNone');
    lines.push(' FILE           \t');
    lines.push(' OFFSET         \t0.00          \t0.00');
    lines.push('');

    // ── [END] ──
    lines.push('[END]');

    return lines.join('\n');
}

/**
 * Trigger download of INP file
 */
export function downloadINP(nodes: PipeNode[], pipes: Pipe[], pumps: Pump[] = []): void {
    const content = generateEpanetINP(nodes, pipes, pumps);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pdam-network-${new Date().toISOString().slice(0, 10)}.inp`;
    a.click();
    URL.revokeObjectURL(url);
}
