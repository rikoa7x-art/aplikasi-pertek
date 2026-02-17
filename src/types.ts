export type AccessoryType = 'valve_gate' | 'valve_butterfly' | 'valve_check' | 'valve_prv' | 'tee' | 'cross' | 'elbow' | 'reducer' | 'meter' | 'hydrant' | 'blowoff' | 'air_valve';

export interface Accessory {
  type: AccessoryType;
  label: string;
  size?: number; // mm
  status?: 'open' | 'closed' | 'partial';
  notes?: string;
}

export const ACCESSORY_CATALOG: { type: AccessoryType; name: string; icon: string; description: string; category: string }[] = [
  { type: 'valve_gate', name: 'Gate Valve', icon: '🔴', description: 'Katup gerbang untuk buka/tutup aliran', category: 'Valve' },
  { type: 'valve_butterfly', name: 'Butterfly Valve', icon: '🦋', description: 'Katup kupu-kupu untuk kontrol aliran', category: 'Valve' },
  { type: 'valve_check', name: 'Check Valve', icon: '✅', description: 'Katup searah (non-return)', category: 'Valve' },
  { type: 'valve_prv', name: 'PRV (Pressure Reducing)', icon: '⬇️', description: 'Katup pengatur tekanan', category: 'Valve' },
  { type: 'tee', name: 'Tee', icon: '🔀', description: 'Percabangan T — hubungkan pipa baru', category: 'Fitting' },
  { type: 'cross', name: 'Cross', icon: '➕', description: 'Percabangan silang (4 arah)', category: 'Fitting' },
  { type: 'elbow', name: 'Elbow', icon: '↪️', description: 'Belokan pipa 90° / 45°', category: 'Fitting' },
  { type: 'reducer', name: 'Reducer', icon: '🔽', description: 'Penyambung ukuran berbeda', category: 'Fitting' },
  { type: 'meter', name: 'Water Meter', icon: '🔢', description: 'Meteran air', category: 'Instrument' },
  { type: 'hydrant', name: 'Hydrant', icon: '🚒', description: 'Hydrant pemadam kebakaran', category: 'Instrument' },
  { type: 'blowoff', name: 'Blow-off Valve', icon: '💨', description: 'Katup pembuangan sedimen', category: 'Instrument' },
  { type: 'air_valve', name: 'Air Release Valve', icon: '🌬️', description: 'Katup pelepas udara', category: 'Instrument' },
];

export interface PipeNode {
  id: string;
  lat: number;
  lng: number;
  elevation: number; // meters above sea level (mdpl)
  type: 'junction' | 'reservoir' | 'tank' | 'pump';
  label: string;
  demand?: number; // L/s
  pressure?: number; // m
  headloss?: number;
  accessories: Accessory[]; // Accessories installed at this node
}

export interface Pipe {
  id: string;
  startNodeId: string;
  endNodeId: string;
  length: number; // meters (actual road distance)
  straightLength: number; // meters (straight-line distance for reference)
  diameter: number; // mm
  roughness: number; // Hazen-Williams C
  material: string;
  velocity?: number; // m/s
  flowRate?: number; // L/s
  headloss?: number; // m
  routeCoordinates: [number, number][]; // Array of [lat, lng] from OSRM routing
}

export type DrawMode = 'select' | 'node' | 'pipe' | 'reservoir' | 'tank' | 'pump' | 'delete' | 'accessory';

export interface PipeNetwork {
  nodes: PipeNode[];
  pipes: Pipe[];
}

export interface ElevationResult {
  elevation: number;
  lat: number;
  lng: number;
}
