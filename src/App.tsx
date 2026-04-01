import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { MapView } from './components/MapView';
import { Toolbar } from './components/Toolbar';
import { PropertiesPanel } from './components/PropertiesPanel';
import { StatusBar } from './components/StatusBar';
import { PipeDialog } from './components/PipeDialog';
import { PumpDialog } from './components/PumpDialog';
import { AccessoryDialog } from './components/AccessoryDialog';
import { ConfirmDialog } from './components/ConfirmDialog';
import { calculateDistance, getElevation, runHydraulicAnalysis, generatePumpCurve } from './utils/calculations';
import { getRoute } from './utils/routing';
import { downloadINP } from './utils/epanetExport';
import { parseEpanetINP } from './utils/epanetImport';
import { findNearestPointOnPipe } from './utils/geometry';
import { ACCESSORY_CATALOG } from './types';
import type { PipeNode, Pipe, Pump, DrawMode, AccessoryType } from './types';

const STORAGE_KEY = 'PDAM_NETWORK_DATA';

function loadSavedData(): { nodes: PipeNode[]; pipes: Pipe[]; pumps: Pump[] } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.nodes && data?.pipes) {
      // Ensure backwards compatibility
      const nodes = data.nodes.map((n: PipeNode) => ({ ...n, accessories: n.accessories || [] }));
      return { nodes, pipes: data.pipes, pumps: data.pumps || [] };
    }
    return null;
  } catch {
    return null;
  }
}

export function App() {
  const saved = loadSavedData();
  const [nodes, setNodes] = useState<PipeNode[]>(saved?.nodes || []);
  const [pipes, setPipes] = useState<Pipe[]>(saved?.pipes || []);
  const [pumps, setPumps] = useState<Pump[]>(saved?.pumps || []);
  const [drawMode, setDrawMode] = useState<DrawMode>('select');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedPipeId, setSelectedPipeId] = useState<string | null>(null);
  const [pipeStartNodeId, setPipeStartNodeId] = useState<string | null>(null);
  const [pipeWaypoints, setPipeWaypoints] = useState<string[]>([]); // Multi-node routing: array of node IDs
  const [pipeDrawingMode, setPipeDrawingMode] = useState<'auto' | 'manual'>('auto');
  const [manualPathPoints, setManualPathPoints] = useState<[number, number][]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showPipeDialog, setShowPipeDialog] = useState(false);
  const [pendingPipe, setPendingPipe] = useState<{
    startNodeId: string;
    endNodeId: string;
    straightLength: number;
    routeLength: number;
    elevationDiff: number;
    routeCoordinates: [number, number][];
    routeSuccess: boolean;
  } | null>(null);
  const [showPanel, setShowPanel] = useState(true);
  const [isRouting, setIsRouting] = useState(false);
  const [hideJunctions, setHideJunctions] = useState(false);
  const [mousePosition, setMousePosition] = useState<{ lat: number; lng: number } | null>(null);

  // Confirm dialog state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmDialogConfig, setConfirmDialogConfig] = useState({ title: '', message: '', confirmLabel: '' });
  const confirmCallbackRef = useRef<(() => void) | null>(null);

  // Keyboard shortcuts modal
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

  // Zoom-to-Fit trigger (increment to trigger)
  const [zoomToFitTrigger, setZoomToFitTrigger] = useState(0);

  // Undo/Redo history
  interface HistoryState {
    nodes: PipeNode[];
    pipes: Pipe[];
    pumps: Pump[];
  }
  const historyRef = useRef<HistoryState[]>([]);
  const historyIndexRef = useRef(-1);
  const isUndoRedoRef = useRef(false);

  // Accessory state
  const [selectedAccessoryType, setSelectedAccessoryType] = useState<AccessoryType>('tee');
  const [showAccessoryDialog, setShowAccessoryDialog] = useState(false);
  const [pendingAccessory, setPendingAccessory] = useState<{
    pipeId: string;
    lat: number;
    lng: number;
    segmentIndex: number;
    elevation: number;
  } | null>(null);

  // Pump dialog state
  const [showPumpDialog, setShowPumpDialog] = useState(false);
  const [pendingPump, setPendingPump] = useState<{
    startNodeId: string;
    endNodeId: string;
  } | null>(null);
  const [selectedPumpId, setSelectedPumpId] = useState<string | null>(null);

  const nodeCounterRef = useRef({ junction: 0, reservoir: 0, tank: 0 });
  const pumpCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use refs for nodes/pipes/pumps so callbacks always see latest state
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const pipesRef = useRef(pipes);
  pipesRef.current = pipes;
  const pumpsRef = useRef(pumps);
  pumpsRef.current = pumps;

  // Map center (Indonesia - Jakarta)
  const mapCenter: [number, number] = [-6.2, 106.816];
  const mapZoom = 13;

  // ── Undo/Redo helpers ──
  const pushHistory = useCallback(() => {
    if (isUndoRedoRef.current) return;
    const snapshot: HistoryState = {
      nodes: JSON.parse(JSON.stringify(nodesRef.current)),
      pipes: JSON.parse(JSON.stringify(pipesRef.current)),
      pumps: JSON.parse(JSON.stringify(pumpsRef.current)),
    };
    // Trim any future states if we're not at the end
    const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    newHistory.push(snapshot);
    // Limit to 50 states
    if (newHistory.length > 50) newHistory.shift();
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
  }, []);

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    const state = historyRef.current[historyIndexRef.current];
    isUndoRedoRef.current = true;
    setNodes(JSON.parse(JSON.stringify(state.nodes)));
    setPipes(JSON.parse(JSON.stringify(state.pipes)));
    setPumps(JSON.parse(JSON.stringify(state.pumps)));
    isUndoRedoRef.current = false;
    showStatus('↩️ Undo');
  }, []);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    const state = historyRef.current[historyIndexRef.current];
    isUndoRedoRef.current = true;
    setNodes(JSON.parse(JSON.stringify(state.nodes)));
    setPipes(JSON.parse(JSON.stringify(state.pipes)));
    setPumps(JSON.parse(JSON.stringify(state.pumps)));
    isUndoRedoRef.current = false;
    showStatus('↪️ Redo');
  }, []);

  // Push initial state
  useEffect(() => {
    // If we restored data, update counters from saved state
    if (nodesRef.current.length > 0) {
      const parseMaxLabel = (nodes: PipeNode[], type: string, prefix: string) => {
        let max = 0;
        nodes.filter(n => n.type === type).forEach(n => {
          const match = n.label.match(new RegExp(`^${prefix}(\\d+)$`));
          if (match) max = Math.max(max, parseInt(match[1]));
        });
        return max || nodes.filter(n => n.type === type).length;
      };
      nodeCounterRef.current = {
        junction: parseMaxLabel(nodesRef.current, 'junction', 'J'),
        reservoir: parseMaxLabel(nodesRef.current, 'reservoir', 'R'),
        tank: parseMaxLabel(nodesRef.current, 'tank', 'T'),
      };
      let maxPump = 0;
      pumpsRef.current.forEach(p => {
        const m = p.label.match(/^PMP(\d+)$/);
        if (m) maxPump = Math.max(maxPump, parseInt(m[1]));
      });
      pumpCounterRef.current = maxPump || pumpsRef.current.length;
    }
    pushHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save to localStorage (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, pipes, pumps }));
      } catch {
        // localStorage may be full; silently ignore
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [nodes, pipes, pumps]);

  const showStatus = useCallback((msg: string, duration = 3000) => {
    // Clear previous timer to prevent race condition
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }
    setStatusMessage(msg);
    if (duration > 0) {
      statusTimerRef.current = setTimeout(() => {
        setStatusMessage('');
        statusTimerRef.current = null;
      }, duration);
    }
  }, []);

  // Handle draw mode change - reset pipe drawing state
  const handleSetDrawMode = useCallback((mode: DrawMode) => {
    setDrawMode(mode);
    setPipeStartNodeId(null);
    setPipeWaypoints([]); // Clear multi-node waypoints
    setManualPathPoints([]); // Clear manual path points
    if (mode !== 'select') {
      setSelectedNodeId(null);
      setSelectedPipeId(null);
      setSelectedPumpId(null);
    }
  }, []);

  // Handle map click (for placing nodes)
  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    // In pipe mode, handle based on drawing mode
    if (drawMode === 'pipe') {
      if (pipeDrawingMode === 'manual' && pipeStartNodeId) {
        // Manual mode: add clicked point as a path waypoint
        setManualPathPoints(prev => [...prev, [lat, lng]]);
        showStatus(`📍 Titik jalur ${manualPathPoints.length + 1} ditambahkan. Klik titik lain atau klik node tujuan.`);
        return;
      }
      // Auto mode: clicking map cancels pipe start
      setPipeStartNodeId(null);
      setManualPathPoints([]);
      return;
    }

    // In pump mode, clicking map (not a node) cancels
    if (drawMode === 'pump') {
      setPipeStartNodeId(null);
      return;
    }

    // In accessory mode, clicking map (not a pipe) cancels
    if (drawMode === 'accessory') {
      return;
    }

    if (drawMode === 'select' || drawMode === 'delete') return;

    const nodeType = drawMode === 'node' ? 'junction' : drawMode as 'junction' | 'reservoir' | 'tank';
    nodeCounterRef.current[nodeType]++;
    const counter = nodeCounterRef.current[nodeType];

    const labelPrefix: Record<string, string> = {
      junction: 'J',
      reservoir: 'R',
      tank: 'T',
      pump: 'P',
    };

    showStatus('📡 Mengambil data elevasi...');

    let elevation = 0;
    try {
      elevation = await getElevation(lat, lng);
    } catch {
      elevation = 0;
    }

    const newNode: PipeNode = {
      id: uuidv4(),
      lat,
      lng,
      elevation: Math.round(elevation * 10) / 10,
      type: nodeType,
      label: `${labelPrefix[nodeType]}${counter}`,
      demand: nodeType === 'junction' ? 0 : undefined,
      accessories: [],
    };

    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
    setSelectedPipeId(null);
    pushHistory();
    showStatus(`✅ ${nodeType.charAt(0).toUpperCase() + nodeType.slice(1)} "${newNode.label}" ditambahkan (Elevasi: ${newNode.elevation} mdpl)`);
  }, [drawMode, pipeDrawingMode, pipeStartNodeId, manualPathPoints, showStatus, pushHistory]);

  // Handle node click - the most critical function for pipe drawing
  const handleNodeClick = useCallback((nodeId: string) => {
    if (drawMode === 'delete') {
      pushHistory();
      setNodes(prev => prev.filter(n => n.id !== nodeId));
      setPipes(prev => prev.filter(p => p.startNodeId !== nodeId && p.endNodeId !== nodeId));
      setPumps(prev => prev.filter(p => p.startNodeId !== nodeId && p.endNodeId !== nodeId));
      setSelectedNodeId(null);
      showStatus('🗑️ Node dihapus');
      return;
    }

    // PUMP MODE: select 2 nodes (suction → discharge)
    if (drawMode === 'pump') {
      if (!pipeStartNodeId) {
        // First node selected (suction)
        setPipeStartNodeId(nodeId);
        setSelectedNodeId(nodeId);
        showStatus('⚡ Node suction dipilih. Klik node discharge (tujuan pompa).');
      } else {
        // Second node selected (discharge) — open pump dialog
        if (pipeStartNodeId === nodeId) {
          showStatus('⚠️ Tidak bisa membuat pompa ke node yang sama');
          return;
        }
        // Check if pump already exists between these nodes
        const exists = pumpsRef.current.some(
          p => (p.startNodeId === pipeStartNodeId && p.endNodeId === nodeId) ||
            (p.startNodeId === nodeId && p.endNodeId === pipeStartNodeId)
        );
        if (exists) {
          showStatus('⚠️ Pompa sudah ada antara kedua node ini');
          return;
        }
        setPendingPump({ startNodeId: pipeStartNodeId, endNodeId: nodeId });
        setShowPumpDialog(true);
      }
      return;
    }

    if (drawMode === 'pipe') {
      // ── MANUAL PIPE ROUTING ──
      if (pipeDrawingMode === 'manual') {
        if (!pipeStartNodeId) {
          // First node click: set as start
          setPipeStartNodeId(nodeId);
          setSelectedNodeId(nodeId);
          setManualPathPoints([]);
          const startNode = nodesRef.current.find(n => n.id === nodeId);
          showStatus(`✏️ Node awal "${startNode?.label}" dipilih. Klik titik-titik di peta untuk membuat jalur, lalu klik node tujuan.`);
        } else {
          // Second node click: finalize manual pipe
          if (pipeStartNodeId === nodeId) {
            showStatus('⚠️ Tidak bisa membuat pipa ke node yang sama');
            return;
          }
          // Check if pipe already exists
          const exists = pipesRef.current.some(
            p => (p.startNodeId === pipeStartNodeId && p.endNodeId === nodeId) ||
              (p.startNodeId === nodeId && p.endNodeId === pipeStartNodeId)
          );
          if (exists) {
            showStatus('⚠️ Pipa sudah ada antara kedua node ini');
            return;
          }

          const startNode = nodesRef.current.find(n => n.id === pipeStartNodeId);
          const endNode = nodesRef.current.find(n => n.id === nodeId);
          if (!startNode || !endNode) return;

          // Build route coordinates: startNode → manualPathPoints → endNode
          const routeCoords: [number, number][] = [
            [startNode.lat, startNode.lng],
            ...manualPathPoints,
            [endNode.lat, endNode.lng],
          ];

          // Calculate total length from route coordinates
          const routeLength = calculateRouteLength(routeCoords);
          const straightDist = calculateDistance(startNode.lat, startNode.lng, endNode.lat, endNode.lng);

          // Create pipe directly (no dialog for manual, use defaults)
          const newPipe: Pipe = {
            id: uuidv4(),
            startNodeId: pipeStartNodeId,
            endNodeId: nodeId,
            length: Math.round(routeLength * 10) / 10,
            straightLength: Math.round(straightDist * 10) / 10,
            diameter: 100,
            roughness: 150,
            material: 'PVC',
            routeCoordinates: routeCoords,
          };

          setPipes(prev => [...prev, newPipe]);
          setSelectedPipeId(newPipe.id);
          setSelectedNodeId(null);
          setPipeStartNodeId(null);
          setManualPathPoints([]);
          pushHistory();
          showStatus(`✅ Pipa manual dibuat: ${startNode.label} → ${endNode.label} | ${newPipe.length.toFixed(0)}m (${manualPathPoints.length} titik belok)`);
        }
        return;
      }

      // ── AUTO PIPE ROUTING (Multi-node) ──
      setPipeWaypoints(prev => {
        // Check if clicking the same node twice (cancel last waypoint)
        if (prev.length > 0 && prev[prev.length - 1] === nodeId) {
          showStatus('❌ Waypoint terakhir dibatalkan');
          const newWaypoints = prev.slice(0, -1);
          if (newWaypoints.length === 0) {
            setPipeStartNodeId(null);
            setSelectedNodeId(null);
          }
          return newWaypoints;
        }

        // Add node to waypoints
        const newWaypoints = [...prev, nodeId];
        setPipeStartNodeId(newWaypoints[0]); // Keep first node as start reference
        setSelectedNodeId(nodeId);

        if (newWaypoints.length === 1) {
          showStatus('🔗 Waypoint pertama dipilih. Klik node berikutnya atau tekan Enter/Space untuk selesai.');
        } else {
          showStatus(`✅ Waypoint ${newWaypoints.length} ditambahkan. Klik node lainnya atau tekan Enter/Space untuk membuat ${newWaypoints.length - 1} pipa.`);
        }

        return newWaypoints;
      });
      return;
    }

    // Select mode or other modes: just select the node
    setSelectedNodeId(nodeId);
    setSelectedPipeId(null);
    setSelectedPumpId(null);
  }, [drawMode, pipeStartNodeId, pipeDrawingMode, manualPathPoints, showStatus]);

  // Finalize multi-node pipe path - create pipes through all waypoints
  const handleFinalizePipePath = useCallback(async () => {
    if (pipeWaypoints.length < 2) {
      showStatus('⚠️ Minimal 2 waypoint diperlukan untuk membuat pipa');
      return;
    }

    setIsRouting(true);
    showStatus(`🛣️ Membuat ${pipeWaypoints.length - 1} segmen pipa melalui ${pipeWaypoints.length} waypoint...`, 0);

    try {
      const currentNodes = nodesRef.current;
      const newPipes: Pipe[] = [];

      // Create pipes for each pair of consecutive waypoints
      for (let i = 0; i < pipeWaypoints.length - 1; i++) {
        const startNodeId = pipeWaypoints[i];
        const endNodeId = pipeWaypoints[i + 1];

        // Check if pipe already exists
        const currentPipes = pipesRef.current;
        const exists = currentPipes.some(
          p => (p.startNodeId === startNodeId && p.endNodeId === endNodeId) ||
            (p.startNodeId === endNodeId && p.endNodeId === startNodeId)
        );

        if (exists) {
          showStatus(`⚠️ Pipa sudah ada antara waypoint ${i + 1} dan ${i + 2}, dilewati`);
          continue;
        }

        const startNode = currentNodes.find(n => n.id === startNodeId);
        const endNode = currentNodes.find(n => n.id === endNodeId);

        if (!startNode || !endNode) continue;

        const straightDist = calculateDistance(startNode.lat, startNode.lng, endNode.lat, endNode.lng);

        // Get route for this segment
        const routeResult = await getRoute(startNode.lat, startNode.lng, endNode.lat, endNode.lng);

        // Create pipe with default values (user can edit later)
        const newPipe: Pipe = {
          id: uuidv4(),
          startNodeId,
          endNodeId,
          length: Math.round(routeResult.distance * 10) / 10,
          straightLength: Math.round(straightDist * 10) / 10,
          diameter: 100, // Default diameter
          roughness: 150, // Default PVC roughness
          material: 'PVC',
          routeCoordinates: routeResult.coordinates,
        };

        newPipes.push(newPipe);
      }

      // Add all new pipes
      if (newPipes.length > 0) {
        setPipes(prev => [...prev, ...newPipes]);
        pushHistory();
        showStatus(`✅ ${newPipes.length} pipa berhasil dibuat! Total ${pipeWaypoints.length} waypoint.`);
      } else {
        showStatus('⚠️ Tidak ada pipa baru yang dibuat');
      }

    } catch (error) {
      showStatus('❌ Error saat membuat pipa');
    } finally {
      setIsRouting(false);
      setPipeWaypoints([]); // Clear waypoints
      setPipeStartNodeId(null);
      setSelectedNodeId(null);
    }
  }, [pipeWaypoints, showStatus]);

  // Keyboard listener for Enter/Space to finalize pipe path
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (drawMode !== 'pipe') return;

      // Manual mode: Escape cancels, Backspace removes last point
      if (pipeDrawingMode === 'manual') {
        if (e.key === 'Escape') {
          e.preventDefault();
          setManualPathPoints([]);
          setPipeStartNodeId(null);
          setSelectedNodeId(null);
          showStatus('❌ Pembuatan pipa manual dibatalkan');
        } else if (e.key === 'Backspace' && manualPathPoints.length > 0) {
          e.preventDefault();
          setManualPathPoints(prev => prev.slice(0, -1));
          showStatus(`↩️ Titik terakhir dihapus. Sisa ${manualPathPoints.length - 1} titik.`);
        }
        return;
      }

      // Auto mode: Enter/Space to finalize, Escape to cancel
      if (pipeWaypoints.length < 2) return;

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleFinalizePipePath();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setPipeWaypoints([]);
        setPipeStartNodeId(null);
        setSelectedNodeId(null);
        showStatus('❌ Pembuatan pipa dibatalkan');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawMode, pipeDrawingMode, pipeWaypoints, manualPathPoints, handleFinalizePipePath, showStatus]);

  // Global keyboard shortcuts: Ctrl+Z (Undo), Ctrl+Y (Redo)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleUndo, handleRedo]);

  // Handle pipe click - can be for selecting or adding accessory
  const handlePipeClick = useCallback((pipeId: string, latlng?: { lat: number; lng: number }) => {
    if (drawMode === 'delete') {
      pushHistory();
      setPipes(prev => prev.filter(p => p.id !== pipeId));
      showStatus('🗑️ Pipa dihapus');
      return;
    }

    // ACCESSORY MODE: clicking a pipe places an accessory there
    if (drawMode === 'accessory' && latlng) {
      const pipe = pipesRef.current.find(p => p.id === pipeId);
      if (!pipe) return;

      // Find the nearest point on the pipe route
      const nearest = findNearestPointOnPipe(latlng.lat, latlng.lng, pipe.routeCoordinates);

      showStatus('📡 Mengambil data elevasi titik aksesoris...', 0);

      getElevation(nearest.lat, nearest.lng)
        .then(elevation => {
          setPendingAccessory({
            pipeId,
            lat: nearest.lat,
            lng: nearest.lng,
            segmentIndex: nearest.segmentIndex,
            elevation: Math.round(elevation * 10) / 10,
          });
          setShowAccessoryDialog(true);
          showStatus(`📍 Titik aksesoris dipilih di pipa. Pilih jenis aksesoris.`);
        })
        .catch(() => {
          setPendingAccessory({
            pipeId,
            lat: nearest.lat,
            lng: nearest.lng,
            segmentIndex: nearest.segmentIndex,
            elevation: 0,
          });
          setShowAccessoryDialog(true);
        });
      return;
    }

    setSelectedPipeId(pipeId);
    setSelectedNodeId(null);
  }, [drawMode, showStatus]);

  // Confirm accessory placement — this splits the pipe and creates a junction
  const handleConfirmAccessory = useCallback((accessoryType: AccessoryType, accessoryLabel: string, diameter?: number) => {
    if (!pendingAccessory) return;

    const pipe = pipesRef.current.find(p => p.id === pendingAccessory.pipeId);
    if (!pipe) return;

    const startNode = nodesRef.current.find(n => n.id === pipe.startNodeId);
    const endNode = nodesRef.current.find(n => n.id === pipe.endNodeId);
    if (!startNode || !endNode) return;

    // Create new junction node at the accessory point
    nodeCounterRef.current.junction++;
    const counter = nodeCounterRef.current.junction;

    const newNode: PipeNode = {
      id: uuidv4(),
      lat: pendingAccessory.lat,
      lng: pendingAccessory.lng,
      elevation: pendingAccessory.elevation,
      type: 'junction',
      label: `J${counter}`,
      demand: 0,
      accessories: [{
        type: accessoryType,
        label: accessoryLabel,
        size: diameter || pipe.diameter,
        status: accessoryType.startsWith('valve') ? 'open' : undefined,
      }],
    };

    // Split the route coordinates at the segment index
    const segIdx = pendingAccessory.segmentIndex;
    const routeCoords = pipe.routeCoordinates;

    // First half: from start to the new point
    const firstHalf: [number, number][] = [
      ...routeCoords.slice(0, segIdx + 1),
      [pendingAccessory.lat, pendingAccessory.lng],
    ];

    // Second half: from the new point to end
    const secondHalf: [number, number][] = [
      [pendingAccessory.lat, pendingAccessory.lng],
      ...routeCoords.slice(segIdx + 1),
    ];

    // Calculate distances for each segment
    const firstLength = calculateRouteLength(firstHalf);
    const secondLength = calculateRouteLength(secondHalf);
    const firstStraight = calculateDistance(startNode.lat, startNode.lng, pendingAccessory.lat, pendingAccessory.lng);
    const secondStraight = calculateDistance(pendingAccessory.lat, pendingAccessory.lng, endNode.lat, endNode.lng);

    // Create two new pipes to replace the original
    const pipe1: Pipe = {
      id: uuidv4(),
      startNodeId: pipe.startNodeId,
      endNodeId: newNode.id,
      length: Math.round(firstLength * 10) / 10,
      straightLength: Math.round(firstStraight * 10) / 10,
      diameter: pipe.diameter,
      roughness: pipe.roughness,
      material: pipe.material,
      routeCoordinates: firstHalf,
    };

    const pipe2: Pipe = {
      id: uuidv4(),
      startNodeId: newNode.id,
      endNodeId: pipe.endNodeId,
      length: Math.round(secondLength * 10) / 10,
      straightLength: Math.round(secondStraight * 10) / 10,
      diameter: pipe.diameter,
      roughness: pipe.roughness,
      material: pipe.material,
      routeCoordinates: secondHalf,
    };

    // Apply changes
    setNodes(prev => [...prev, newNode]);
    setPipes(prev => {
      const filtered = prev.filter(p => p.id !== pendingAccessory.pipeId);
      return [...filtered, pipe1, pipe2];
    });

    setSelectedNodeId(newNode.id);
    setSelectedPipeId(null);
    setShowAccessoryDialog(false);
    setPendingAccessory(null);
    pushHistory();

    const accName = accessoryLabel || accessoryType;
    showStatus(`✅ ${accName} ditambahkan di ${newNode.label}. Pipa ${startNode.label}→${endNode.label} dipecah menjadi 2 segmen. Anda sekarang bisa menghubungkan pipa baru ke ${newNode.label}.`);
  }, [pendingAccessory, showStatus]);

  const handleCancelAccessory = useCallback(() => {
    setShowAccessoryDialog(false);
    setPendingAccessory(null);
    showStatus('❌ Penambahan aksesoris dibatalkan');
  }, [showStatus]);

  // Create pipe after dialog confirmation
  const handleCreatePipe = useCallback((diameter: number, material: string, roughness: number) => {
    if (!pendingPipe) return;

    const startNode = nodesRef.current.find(n => n.id === pendingPipe.startNodeId);
    const endNode = nodesRef.current.find(n => n.id === pendingPipe.endNodeId);

    const newPipe: Pipe = {
      id: uuidv4(),
      startNodeId: pendingPipe.startNodeId,
      endNodeId: pendingPipe.endNodeId,
      length: pendingPipe.routeLength,
      straightLength: pendingPipe.straightLength,
      diameter,
      roughness,
      material,
      routeCoordinates: pendingPipe.routeCoordinates,
    };

    setPipes(prev => [...prev, newPipe]);
    setSelectedPipeId(newPipe.id);
    setSelectedNodeId(null);
    setShowPipeDialog(false);
    setPendingPipe(null);
    pushHistory();
    showStatus(`✅ Pipa ditambahkan: ${startNode?.label} → ${endNode?.label} | ${newPipe.length.toFixed(0)}m (jalur jalan), ⌀${diameter}mm, ${material}`);
  }, [pendingPipe, showStatus, pushHistory]);

  // Handle pipe dialog cancel
  const handleCancelPipe = useCallback(() => {
    setShowPipeDialog(false);
    setPendingPipe(null);
    showStatus('❌ Pembuatan pipa dibatalkan');
  }, [showStatus]);

  // Handle node drag - re-route connected pipes
  const handleNodeDrag = useCallback(async (nodeId: string, lat: number, lng: number) => {
    showStatus('📡 Mengambil data elevasi & rute baru...', 0);
    let elevation = 0;
    try {
      elevation = await getElevation(lat, lng);
    } catch {
      elevation = 0;
    }

    setNodes(prev => prev.map(n => {
      if (n.id !== nodeId) return n;
      return { ...n, lat, lng, elevation: Math.round(elevation * 10) / 10 };
    }));

    const currentNodes = nodesRef.current.map(n =>
      n.id === nodeId ? { ...n, lat, lng } : n
    );
    const connectedPipes = pipesRef.current.filter(
      p => p.startNodeId === nodeId || p.endNodeId === nodeId
    );

    for (const pipe of connectedPipes) {
      const sNode = currentNodes.find(n => n.id === pipe.startNodeId);
      const eNode = currentNodes.find(n => n.id === pipe.endNodeId);

      if (sNode && eNode) {
        try {
          const routeResult = await getRoute(sNode.lat, sNode.lng, eNode.lat, eNode.lng);
          const straightDist = calculateDistance(sNode.lat, sNode.lng, eNode.lat, eNode.lng);

          setPipes(prev => prev.map(p => {
            if (p.id !== pipe.id) return p;
            return {
              ...p,
              length: Math.round(routeResult.distance * 10) / 10,
              straightLength: Math.round(straightDist * 10) / 10,
              routeCoordinates: routeResult.coordinates,
            };
          }));
        } catch {
          const straightDist = calculateDistance(sNode.lat, sNode.lng, eNode.lat, eNode.lng);
          setPipes(prev => prev.map(p => {
            if (p.id !== pipe.id) return p;
            return {
              ...p,
              length: Math.round(straightDist * 10) / 10,
              straightLength: Math.round(straightDist * 10) / 10,
              routeCoordinates: [[sNode.lat, sNode.lng], [eNode.lat, eNode.lng]],
            };
          }));
        }
      }
    }

    showStatus(`✅ Node dipindahkan (Elevasi: ${elevation.toFixed(1)} mdpl). Rute pipa diperbarui.`);
  }, [showStatus]);

  // Create pump after dialog confirmation
  const handleCreatePump = useCallback((designFlow: number, designHead: number, speed: number) => {
    if (!pendingPump) return;

    pumpCounterRef.current++;
    const counter = pumpCounterRef.current;
    const startNode = nodesRef.current.find(n => n.id === pendingPump.startNodeId);
    const endNode = nodesRef.current.find(n => n.id === pendingPump.endNodeId);

    const pumpCurve = generatePumpCurve(designFlow, designHead);

    const newPump: Pump = {
      id: uuidv4(),
      startNodeId: pendingPump.startNodeId,
      endNodeId: pendingPump.endNodeId,
      label: `PMP${counter}`,
      designFlow,
      designHead,
      speed,
      status: 'on',
      pumpCurve,
    };

    setPumps(prev => [...prev, newPump]);
    setSelectedPumpId(newPump.id);
    setSelectedNodeId(null);
    setSelectedPipeId(null);
    setShowPumpDialog(false);
    setPendingPump(null);
    setPipeStartNodeId(null);
    pushHistory();
    showStatus(`⚡ Pompa ${newPump.label} ditambahkan: ${startNode?.label} → ${endNode?.label} | Q=${designFlow} L/s, H=${designHead} m`);
  }, [pendingPump, showStatus, pushHistory]);

  // Handle pump dialog cancel
  const handleCancelPump = useCallback(() => {
    setShowPumpDialog(false);
    setPendingPump(null);
    setPipeStartNodeId(null);
    showStatus('❌ Pembuatan pompa dibatalkan');
  }, [showStatus]);

  // Run hydraulic analysis
  const handleRunAnalysis = useCallback(() => {
    if (nodes.length < 2 || (pipes.length < 1 && pumps.length < 1)) {
      showStatus('⚠️ Minimal 2 node dan 1 pipa/pompa diperlukan untuk analisis');
      return;
    }

    setIsAnalyzing(true);
    showStatus('⏳ Menjalankan analisis hidrolik...');

    setTimeout(() => {
      const result = runHydraulicAnalysis(nodes, pipes, pumps);
      setNodes(result.nodes);
      setPipes(result.pipes);
      setPumps(result.pumps);
      setIsAnalyzing(false);
      showStatus('✅ Analisis hidrolik selesai!');
    }, 500);
  }, [nodes, pipes, pumps, showStatus]);

  // Update node
  const handleUpdateNode = useCallback((updatedNode: PipeNode) => {
    setNodes(prev => prev.map(n => n.id === updatedNode.id ? updatedNode : n));
  }, []);

  // Update pipe
  const handleUpdatePipe = useCallback((updatedPipe: Pipe) => {
    setPipes(prev => prev.map(p => p.id === updatedPipe.id ? updatedPipe : p));
  }, []);

  // Delete node
  const handleDeleteNode = useCallback((nodeId: string) => {
    pushHistory();
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setPipes(prev => prev.filter(p => p.startNodeId !== nodeId && p.endNodeId !== nodeId));
    setPumps(prev => prev.filter(p => p.startNodeId !== nodeId && p.endNodeId !== nodeId));
    setSelectedNodeId(null);
    showStatus('🗑️ Node dihapus');
  }, [showStatus, pushHistory]);

  // Delete pipe
  const handleDeletePipe = useCallback((pipeId: string) => {
    pushHistory();
    setPipes(prev => prev.filter(p => p.id !== pipeId));
    setSelectedPipeId(null);
    showStatus('🗑️ Pipa dihapus');
  }, [showStatus, pushHistory]);

  // Delete pump
  const handleDeletePump = useCallback((pumpId: string) => {
    pushHistory();
    setPumps(prev => prev.filter(p => p.id !== pumpId));
    setSelectedPumpId(null);
    showStatus('🗑️ Pompa dihapus');
  }, [showStatus, pushHistory]);

  // Update pump
  const handleUpdatePump = useCallback((updatedPump: Pump) => {
    setPumps(prev => prev.map(p => p.id === updatedPump.id ? updatedPump : p));
  }, []);

  // Clear all
  const handleClearAll = useCallback(() => {
    if (nodes.length === 0 && pipes.length === 0 && pumps.length === 0) return;
    confirmCallbackRef.current = () => {
      pushHistory();
      setNodes([]);
      setPipes([]);
      setPumps([]);
      setSelectedNodeId(null);
      setSelectedPipeId(null);
      setSelectedPumpId(null);
      setPipeStartNodeId(null);
      nodeCounterRef.current = { junction: 0, reservoir: 0, tank: 0 };
      pumpCounterRef.current = 0;
      showStatus('🧹 Semua data telah dihapus');
    };
    setConfirmDialogConfig({
      title: 'Hapus Semua Data',
      message: 'Hapus semua node, pipa, dan pompa? Data yang sudah dihapus bisa dikembalikan dengan Undo (Ctrl+Z).',
      confirmLabel: 'Ya, Hapus Semua',
    });
    setShowConfirmDialog(true);
  }, [nodes.length, pipes.length, pumps.length, showStatus, pushHistory]);

  // Print hydraulic analysis results
  const handlePrintResults = useCallback(() => {
    const hasResults = pipes.some(p => p.flowRate !== undefined);
    if (!hasResults) {
      showStatus('⚠️ Belum ada hasil analisis. Jalankan "Analisis Hidrolik" terlebih dahulu.');
      return;
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    const totalLength = pipes.reduce((s, p) => s + p.length, 0);
    const totalAccessories = nodes.reduce((s, n) => s + n.accessories.length, 0);
    const totalDemand = nodes.reduce((s, n) => s + (n.demand || 0), 0);

    // Identify issues
    const velocityIssues = pipes.filter(p => {
      const v = p.velocity || 0;
      return v > 0 && (v < 0.3 || v > 3.0);
    });
    const pressureIssues = nodes.filter(n => n.pressure !== undefined && n.pressure < 0);

    const pipeRows = pipes.map((pipe, idx) => {
      const sn = nodes.find(n => n.id === pipe.startNodeId);
      const en = nodes.find(n => n.id === pipe.endNodeId);
      const vOk = (pipe.velocity || 0) >= 0.3 && (pipe.velocity || 0) <= 3.0;
      const hasIssue = pipe.velocity !== undefined && pipe.velocity > 0 && !vOk;
      return `<tr${hasIssue ? ' class="issue-row"' : ''}>
        <td style="text-align:center">${idx + 1}</td>
        <td>${sn?.label || '-'} → ${en?.label || '-'}</td>
        <td style="text-align:right">${pipe.length.toFixed(1)}</td>
        <td style="text-align:center">⌀${pipe.diameter}</td>
        <td style="text-align:center">${pipe.material}</td>
        <td style="text-align:right">${pipe.roughness}</td>
        <td style="text-align:right">${pipe.flowRate?.toFixed(3) || '-'}</td>
        <td style="text-align:right;font-weight:bold" class="${vOk ? 'ok' : 'warning'}">${pipe.velocity?.toFixed(3) || '-'}</td>
        <td style="text-align:right">${pipe.headloss?.toFixed(3) || '-'}</td>
      </tr>`;
    }).join('');

    const nodeRows = nodes.filter(n => n.pressure !== undefined).map((node, idx) => {
      const pOk = (node.pressure || 0) > 0;
      return `<tr${!pOk ? ' class="issue-row"' : ''}>
        <td style="text-align:center">${idx + 1}</td>
        <td>${node.label}</td>
        <td style="text-align:center">${node.type === 'junction' ? 'Junction' : node.type === 'reservoir' ? 'Reservoir' : 'Tanki'}</td>
        <td style="text-align:right">${node.elevation.toFixed(1)}</td>
        <td style="text-align:right">${node.demand || 0}</td>
        <td style="text-align:right;font-weight:bold" class="${pOk ? 'ok' : 'warning'}">${node.pressure?.toFixed(2) || '-'}</td>
      </tr>`;
    }).join('');

    const pumpRows = pumps.filter(p => p.flowRate !== undefined && p.flowRate > 0).map((pump, idx) => {
      const sn = nodes.find(n => n.id === pump.startNodeId);
      const en = nodes.find(n => n.id === pump.endNodeId);
      return `<tr>
        <td style="text-align:center">${idx + 1}</td>
        <td>${pump.label}</td>
        <td>${sn?.label || '-'} → ${en?.label || '-'}</td>
        <td style="text-align:center">${pump.status === 'on' ? 'ON' : 'OFF'}</td>
        <td style="text-align:right">${pump.flowRate?.toFixed(3) || '-'}</td>
        <td style="text-align:right">${pump.headGain?.toFixed(2) || '-'}</td>
        <td style="text-align:right">${pump.power?.toFixed(2) || '-'}</td>
      </tr>`;
    }).join('');

    // Issue summary section
    const hasIssues = velocityIssues.length > 0 || pressureIssues.length > 0;
    const issueSummaryHtml = hasIssues ? `
<h2>⚠️ Ringkasan Masalah</h2>
<div class="issue-box">
  ${velocityIssues.length > 0 ? `<div class="issue-item">
    <b>Kecepatan di luar batas (0.3–3.0 m/s):</b> ${velocityIssues.length} pipa
    <ul>${velocityIssues.map(p => {
      const sn = nodes.find(n => n.id === p.startNodeId);
      const en = nodes.find(n => n.id === p.endNodeId);
      return `<li>${sn?.label}→${en?.label}: ${p.velocity?.toFixed(3)} m/s (${(p.velocity || 0) < 0.3 ? 'terlalu rendah' : 'terlalu tinggi'})</li>`;
    }).join('')}</ul>
  </div>` : ''}
  ${pressureIssues.length > 0 ? `<div class="issue-item">
    <b>Tekanan negatif:</b> ${pressureIssues.length} node
    <ul>${pressureIssues.map(n => `<li>${n.label}: ${n.pressure?.toFixed(2)} bar</li>`).join('')}</ul>
  </div>` : ''}
</div>` : `<div class="no-issue">✅ Tidak ada masalah ditemukan — semua kecepatan dan tekanan dalam batas normal.</div>`;

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Hasil Analisis Hidrolik</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; padding: 20px; color: #1f2937; font-size: 11px; }
  h1 { font-size: 18px; color: #1e40af; margin-bottom: 4px; }
  h2 { font-size: 13px; color: #374151; margin: 16px 0 6px; border-bottom: 2px solid #3b82f6; padding-bottom: 3px; }
  .header { border-bottom: 3px solid #1e40af; padding-bottom: 10px; margin-bottom: 14px; }
  .meta { color: #6b7280; font-size: 10px; }
  .summary { display: flex; gap: 14px; margin: 10px 0; flex-wrap: wrap; }
  .summary-item { background: #f0f9ff; padding: 6px 12px; border-radius: 6px; border: 1px solid #bfdbfe; }
  .summary-item .val { font-size: 16px; font-weight: bold; color: #1e40af; }
  .summary-item .lbl { font-size: 9px; color: #6b7280; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 12px; }
  th { background: #1e40af; color: white; padding: 5px 8px; text-align: left; font-size: 10px; font-weight: 600; }
  td { padding: 4px 8px; border-bottom: 1px solid #e5e7eb; }
  tr:nth-child(even) { background: #f9fafb; }
  tr:hover { background: #eff6ff; }
  .ok { color: #16a34a; }
  .warning { color: #dc2626; }
  .issue-row { background: #fef2f2 !important; }
  .issue-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 10px 14px; margin: 6px 0; }
  .issue-item { margin-bottom: 6px; }
  .issue-item ul { margin: 4px 0 0 18px; }
  .issue-item li { margin: 2px 0; }
  .no-issue { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 8px 12px; margin: 6px 0; color: #16a34a; font-weight: 500; }
  .legend { margin-top: 10px; padding: 8px 12px; background: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb; }
  .legend span { margin-right: 16px; font-size: 10px; }
  .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
  .footer { margin-top: 20px; text-align: center; color: #9ca3af; font-size: 9px; border-top: 1px solid #e5e7eb; padding-top: 8px; }
  @media print {
    body { padding: 10px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { margin: 10mm; }
    .ok, .warning, td, th, b, span { color: #000 !important; }
    .issue-row { background: #f5f5f5 !important; }
    tr:nth-child(even) { background: #f5f5f5 !important; }
    th { background: #333 !important; color: white !important; }
  }
</style></head><body>

<div class="header">
  <h1>📊 Laporan Hasil Analisis Hidrolik</h1>
  <div class="meta">PDAM Pipe Network Planner &bull; ${dateStr} pukul ${timeStr}</div>
</div>

<div class="summary">
  <div class="summary-item"><div class="val">${nodes.length}</div><div class="lbl">Node</div></div>
  <div class="summary-item"><div class="val">${pipes.length}</div><div class="lbl">Pipa</div></div>
  <div class="summary-item"><div class="val">${totalLength.toFixed(0)} m</div><div class="lbl">Total Panjang</div></div>
  <div class="summary-item"><div class="val">${totalDemand.toFixed(1)} L/s</div><div class="lbl">Total Demand</div></div>
  <div class="summary-item"><div class="val">${pumps.length}</div><div class="lbl">Pompa</div></div>
  <div class="summary-item"><div class="val">${totalAccessories}</div><div class="lbl">Aksesoris</div></div>
</div>

${issueSummaryHtml}

<h2>🔗 Analisis Pipa</h2>
<table>
  <thead><tr>
    <th style="text-align:center">No</th><th>Segmen</th><th style="text-align:right">Panjang (m)</th><th style="text-align:center">Diameter (mm)</th>
    <th style="text-align:center">Material</th><th style="text-align:right">C</th>
    <th style="text-align:right">Debit (L/s)</th><th style="text-align:right">Kecepatan (m/s)</th><th style="text-align:right">Headloss (m)</th>
  </tr></thead>
  <tbody>${pipeRows}</tbody>
</table>

<div class="legend">
  <b>Legenda Kecepatan:</b>
  <span><span class="dot" style="background:#16a34a"></span> Normal (0.3–3.0 m/s)</span>
  <span><span class="dot" style="background:#dc2626"></span> Terlalu rendah (&lt;0.3) / tinggi (&gt;3.0)</span>
</div>

<h2>📍 Analisis Node</h2>
<table>
  <thead><tr>
    <th style="text-align:center">No</th><th>Label</th><th style="text-align:center">Tipe</th><th style="text-align:right">Elevasi (mdpl)</th>
    <th style="text-align:right">Demand (L/s)</th><th style="text-align:right">Tekanan (bar)</th>
  </tr></thead>
  <tbody>${nodeRows}</tbody>
</table>

${pumpRows ? `
<h2>⚡ Analisis Pompa</h2>
<table>
  <thead><tr>
    <th style="text-align:center">No</th><th>Label</th><th>Koneksi</th><th style="text-align:center">Status</th>
    <th style="text-align:right">Debit (L/s)</th><th style="text-align:right">Head Gain (m)</th><th style="text-align:right">Daya (kW)</th>
  </tr></thead>
  <tbody>${pumpRows}</tbody>
</table>` : ''}

<div class="footer">Dicetak oleh PDAM Pipe Network Planner — ${dateStr}</div>
</body></html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.onload = () => printWindow.print();
    }

    showStatus('🖨️ Membuka halaman cetak...');
  }, [nodes, pipes, pumps, showStatus]);

  // Export
  const handleExport = useCallback(() => {
    const data = { nodes, pipes, pumps };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pdam-network-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus('💾 Jaringan berhasil di-export');
  }, [nodes, pipes, pumps, showStatus]);

  // Save Project (with project name & metadata)
  const handleSaveProject = useCallback(() => {
    const defaultName = `PDAM Network ${new Date().toLocaleDateString('id-ID')}`;
    const projectName = prompt('Nama proyek:', defaultName);
    if (!projectName) return;

    const data = {
      projectName,
      savedAt: new Date().toISOString(),
      version: '1.0',
      nodes,
      pipes,
      pumps,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus(`💾 Proyek "${projectName}" berhasil disimpan`);
  }, [nodes, pipes, pumps, showStatus]);

  // Export EPANET INP
  const handleExportINP = useCallback(() => {
    if (nodes.length === 0) {
      showStatus('⚠️ Tidak ada data untuk di-export');
      return;
    }
    downloadINP(nodes, pipes, pumps);
    showStatus('💾 File EPANET .inp berhasil di-export');
  }, [nodes, pipes, pumps, showStatus]);

  // Import
  const handleImport = useCallback(() => {
    // If there's existing data, confirm before importing
    if (nodesRef.current.length > 0 || pipesRef.current.length > 0) {
      confirmCallbackRef.current = () => {
        fileInputRef.current?.click();
      };
      setConfirmDialogConfig({
        title: 'Import Data Baru',
        message: 'Data yang ada saat ini akan ditimpa dengan data dari file. Anda dapat membatalkan dengan Undo (Ctrl+Z) setelah import.',
        confirmLabel: 'Ya, Import Data',
      });
      setShowConfirmDialog(true);
    } else {
      fileInputRef.current?.click();
    }
  }, []);

  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const isINP = file.name.toLowerCase().endsWith('.inp');

        if (isINP) {
          // Parse EPANET INP file
          const result = parseEpanetINP(content);
          if (result.nodes.length === 0) {
            showStatus('⚠️ File INP tidak mengandung data node');
            return;
          }
          setNodes(result.nodes);
          setPipes(result.pipes);
          setPumps(result.pumps);
          setSelectedNodeId(null);
          setSelectedPipeId(null);
          setSelectedPumpId(null);
          // Reset counters based on highest label number in imported data
          const parseMaxLabel = (nodes: PipeNode[], type: string, prefix: string) => {
            let max = 0;
            nodes.filter(n => n.type === type).forEach(n => {
              const match = n.label.match(new RegExp(`^${prefix}(\\d+)$`));
              if (match) max = Math.max(max, parseInt(match[1]));
            });
            return max || nodes.filter(n => n.type === type).length;
          };
          nodeCounterRef.current = {
            junction: parseMaxLabel(result.nodes, 'junction', 'J'),
            reservoir: parseMaxLabel(result.nodes, 'reservoir', 'R'),
            tank: parseMaxLabel(result.nodes, 'tank', 'T'),
          };
          let maxPump = 0;
          result.pumps.forEach(p => {
            const m = p.label.match(/^PMP(\d+)$/);
            if (m) maxPump = Math.max(maxPump, parseInt(m[1]));
          });
          pumpCounterRef.current = maxPump || result.pumps.length;
          pushHistory();
          showStatus(`📂 File EPANET berhasil di-import: ${result.nodes.length} node, ${result.pipes.length} pipa, ${result.pumps.length} pompa`);
        } else {
          // Parse JSON file
          const data = JSON.parse(content);
          if (data.nodes && data.pipes) {
            // Ensure backwards compatibility — add accessories array if missing
            const importedNodes = data.nodes.map((n: PipeNode) => ({
              ...n,
              accessories: n.accessories || [],
            }));
            setNodes(importedNodes);
            setPipes(data.pipes);
            setPumps(data.pumps || []);
            setSelectedNodeId(null);
            setSelectedPipeId(null);
            setSelectedPumpId(null);
            // Reset counters based on highest label number
            const parseMaxLabel = (nodes: PipeNode[], type: string, prefix: string) => {
              let max = 0;
              nodes.filter(n => n.type === type).forEach(n => {
                const match = n.label.match(new RegExp(`^${prefix}(\\d+)$`));
                if (match) max = Math.max(max, parseInt(match[1]));
              });
              return max || nodes.filter(n => n.type === type).length;
            };
            nodeCounterRef.current = {
              junction: parseMaxLabel(importedNodes, 'junction', 'J'),
              reservoir: parseMaxLabel(importedNodes, 'reservoir', 'R'),
              tank: parseMaxLabel(importedNodes, 'tank', 'T'),
            };
            const importedPumps = data.pumps || [];
            let maxPump = 0;
            importedPumps.forEach((p: Pump) => {
              const m = p.label.match(/^PMP(\d+)$/);
              if (m) maxPump = Math.max(maxPump, parseInt(m[1]));
            });
            pumpCounterRef.current = maxPump || importedPumps.length;
            pushHistory();
            const projectInfo = data.projectName ? ` — Proyek: "${data.projectName}"` : '';
            showStatus(`📂 Jaringan berhasil di-import${projectInfo}`);
          }
        }
      } catch (err) {
        console.error('Import error:', err);
        showStatus('❌ Error: File tidak valid atau format tidak didukung');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [showStatus]);

  // Re-route a specific pipe (called from properties panel)
  const handleReroutePipe = useCallback(async (pipeId: string) => {
    const pipe = pipesRef.current.find(p => p.id === pipeId);
    if (!pipe) return;

    const startNode = nodesRef.current.find(n => n.id === pipe.startNodeId);
    const endNode = nodesRef.current.find(n => n.id === pipe.endNodeId);
    if (!startNode || !endNode) return;

    showStatus('🛣️ Mencari ulang jalur jalan...', 0);

    try {
      const routeResult = await getRoute(startNode.lat, startNode.lng, endNode.lat, endNode.lng);
      const straightDist = calculateDistance(startNode.lat, startNode.lng, endNode.lat, endNode.lng);

      setPipes(prev => prev.map(p => {
        if (p.id !== pipeId) return p;
        return {
          ...p,
          length: Math.round(routeResult.distance * 10) / 10,
          straightLength: Math.round(straightDist * 10) / 10,
          routeCoordinates: routeResult.coordinates,
        };
      }));

      if (routeResult.success) {
        showStatus(`✅ Jalur diperbarui! Jarak: ${routeResult.distance.toFixed(0)}m`);
      } else {
        showStatus('⚠️ Routing gagal, menggunakan garis lurus');
      }
    } catch {
      showStatus('❌ Gagal mencari jalur jalan');
    }
  }, [showStatus]);

  // Remove an accessory from a node
  const handleRemoveAccessory = useCallback((nodeId: string, accessoryIndex: number) => {
    setNodes(prev => prev.map(n => {
      if (n.id !== nodeId) return n;
      const newAccessories = [...n.accessories];
      newAccessories.splice(accessoryIndex, 1);
      return { ...n, accessories: newAccessories };
    }));
    showStatus('🗑️ Aksesoris dihapus dari node');
  }, [showStatus]);

  // Add accessory to existing node (from properties panel)
  const handleAddAccessoryToNode = useCallback((nodeId: string, accessoryType: AccessoryType) => {
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (!node) return;

    const info = ACCESSORY_CATALOG.find(a => a.type === accessoryType);

    setNodes(prev => prev.map(n => {
      if (n.id !== nodeId) return n;
      return {
        ...n,
        accessories: [...n.accessories, {
          type: accessoryType,
          label: info?.name || accessoryType,
          status: accessoryType.startsWith('valve') ? 'open' as const : undefined,
        }],
      };
    }));
    showStatus(`✅ ${info?.name || accessoryType} ditambahkan ke ${node.label}`);
  }, [showStatus]);

  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) || null : null;
  const selectedPipe = selectedPipeId ? pipes.find(p => p.id === selectedPipeId) || null : null;
  const selectedPump = selectedPumpId ? pumps.find(p => p.id === selectedPumpId) || null : null;

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* Header */}
      <div className="glass-header px-4 py-2.5 flex items-center justify-between shadow-lg z-10">
        <div className="flex items-center gap-3">
          <div className="bg-white/15 backdrop-blur-md rounded-xl p-2 shadow-inner shadow-white/10">
            <svg className="w-6 h-6 text-white drop-shadow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <h1 className="text-white font-extrabold text-lg leading-tight tracking-tight">PDAM Pipe Network Planner</h1>
            <p className="text-blue-200/80 text-[10px] font-medium">Perencanaan Jaringan Distribusi Air Minum — Aksesoris & Percabangan Pipa</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(nodes.length > 0 || pipes.length > 0) && (
            <div className="hidden sm:flex items-center gap-3 text-[10px] text-blue-200/70 font-medium mr-3">
              <span>📍 {nodes.length} node</span>
              <span>🔗 {pipes.length} pipa</span>
              {pumps.length > 0 && <span>⚡ {pumps.length} pompa</span>}
            </div>
          )}
          <button
            onClick={() => setShowPanel(!showPanel)}
            className="text-white/90 hover:text-white text-xs px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition-all backdrop-blur-sm border border-white/10"
          >
            {showPanel ? '◀ Sembunyikan Panel' : '▶ Tampilkan Panel'}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <Toolbar
        drawMode={drawMode}
        onSetDrawMode={handleSetDrawMode}
        onRunAnalysis={handleRunAnalysis}
        onClearAll={handleClearAll}
        onExport={handleExport}
        onExportINP={handleExportINP}
        onImport={handleImport}
        onSaveProject={handleSaveProject}
        isAnalyzing={isAnalyzing}
        hideJunctions={hideJunctions}
        onToggleHideJunctions={() => setHideJunctions(h => !h)}
        selectedAccessoryType={selectedAccessoryType}
        onSelectAccessoryType={setSelectedAccessoryType}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={historyIndexRef.current > 0}
        canRedo={historyIndexRef.current < historyRef.current.length - 1}
        onZoomToFit={() => setZoomToFitTrigger(t => t + 1)}
        onShowShortcuts={() => setShowShortcutsModal(true)}
        onPrintResults={handlePrintResults}
      />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Map */}
        <div className="flex-1 relative">
          <MapView
            nodes={nodes}
            pipes={pipes}
            pumps={pumps}
            drawMode={drawMode}
            selectedNodeId={selectedNodeId}
            selectedPipeId={selectedPipeId}
            selectedPumpId={selectedPumpId}
            pipeStartNodeId={pipeStartNodeId}
            pipeWaypoints={pipeWaypoints}
            manualPathPoints={manualPathPoints}
            onMapClick={handleMapClick}
            onNodeClick={handleNodeClick}
            onNodeDrag={handleNodeDrag}
            onPipeClick={handlePipeClick}
            onPumpClick={(pumpId: string) => { setSelectedPumpId(pumpId); setSelectedPipeId(null); setSelectedNodeId(null); }}
            onMouseMove={(lat, lng) => setMousePosition({ lat, lng })}
            mapCenter={mapCenter}
            mapZoom={mapZoom}
            hideJunctions={hideJunctions}
            zoomToFitTrigger={zoomToFitTrigger}
          />

          {/* Routing overlay */}
          {isRouting && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] px-6 py-3 rounded-full shadow-lg text-sm font-medium bg-indigo-600 text-white flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              🛣️ Mencari jalur jalan...
            </div>
          )}

          {/* Pipe mode overlay instructions + Auto/Manual toggle */}
          {drawMode === 'pipe' && !isRouting && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-2">
              {/* Auto/Manual Toggle */}
              <div className="bg-white rounded-full shadow-lg p-1 flex items-center gap-1">
                <button
                  onClick={() => { setPipeDrawingMode('auto'); setManualPathPoints([]); setPipeStartNodeId(null); }}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${pipeDrawingMode === 'auto'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-500 hover:bg-gray-100'
                    }`}
                >
                  🛣️ Auto (Ikuti Jalan)
                </button>
                <button
                  onClick={() => { setPipeDrawingMode('manual'); setPipeWaypoints([]); setPipeStartNodeId(null); }}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${pipeDrawingMode === 'manual'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-gray-500 hover:bg-gray-100'
                    }`}
                >
                  ✏️ Manual (Gambar Sendiri)
                </button>
              </div>
              {/* Instruction */}
              <div className={`px-5 py-2.5 rounded-full shadow-lg text-sm font-medium ${pipeStartNodeId
                ? (pipeDrawingMode === 'manual' ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white animate-pulse')
                : (pipeDrawingMode === 'manual' ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white')
                }`}>
                {pipeDrawingMode === 'manual'
                  ? (pipeStartNodeId
                    ? `✏️ Klik peta untuk titik belok (${manualPathPoints.length} titik) → Klik node tujuan | Backspace=hapus titik | Esc=batal`
                    : '✏️ Klik node awal untuk mulai menggambar jalur manual')
                  : (pipeStartNodeId
                    ? '🔗 Klik node tujuan — jalur pipa akan mengikuti jalan'
                    : '👆 Klik node awal untuk mulai menggambar pipa')}
              </div>
            </div>
          )}

          {/* Accessory mode overlay */}
          {drawMode === 'accessory' && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] px-5 py-2.5 rounded-full shadow-lg text-sm font-medium bg-orange-500 text-white">
              🔧 Klik pada garis pipa untuk menambahkan aksesoris di titik tersebut
            </div>
          )}

          {/* Pump mode overlay */}
          {drawMode === 'pump' && (
            <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-[1000] px-5 py-2.5 rounded-full shadow-lg text-sm font-medium ${pipeStartNodeId ? 'bg-amber-500 text-white animate-pulse' : 'bg-amber-600 text-white'
              }`}>
              {pipeStartNodeId
                ? '⚡ Klik node discharge (tujuan pompa)'
                : '⚡ Klik node suction (sumber pompa)'}
            </div>
          )}

          {/* Getting started overlay */}
          {nodes.length === 0 && pipes.length === 0 && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[1000] bg-white rounded-2xl shadow-2xl p-6 max-w-md text-center">
              <div className="text-4xl mb-3">🗺️</div>
              <h3 className="font-bold text-gray-800 mb-3 text-lg">Mulai Perencanaan</h3>
              <div className="text-sm text-gray-600 space-y-2 text-left">
                <p className="flex items-start gap-2">
                  <span className="bg-green-100 text-green-700 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">1</span>
                  <span>Pilih tool <b>Reservoir</b> 💧 dan klik pada peta untuk menempatkan sumber air</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="bg-blue-100 text-blue-700 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">2</span>
                  <span>Pilih tool <b>Junction</b> ⚬ dan klik untuk menambah titik distribusi</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="bg-purple-100 text-purple-700 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">3</span>
                  <span>Pilih tool <b>Pipa</b> 🔗, klik node awal → klik node tujuan</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="bg-orange-100 text-orange-700 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">4</span>
                  <span>Pilih tool <b>Aksesoris</b> 🔧, klik pada pipa untuk menambah Valve/Tee/dll</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="bg-amber-100 text-amber-700 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">5</span>
                  <span>Jalankan <b>Analisis Hidrolik</b> ▶️ untuk melihat hasil</span>
                </p>
              </div>
              <div className="mt-4 bg-orange-50 p-3 rounded-lg">
                <p className="text-xs text-orange-700 font-medium">🔧 Tambah Tee di pipa → Pipa terpecah → Hubungkan pipa baru!</p>
                <p className="text-xs text-orange-500 mt-1">Aksesoris: Valve, Tee, Elbow, Reducer, Hydrant, dll</p>
              </div>
              <p className="text-xs text-gray-400 mt-3">Elevasi (mdpl) diambil otomatis dari data SRTM</p>
            </div>
          )}
        </div>

        {/* Properties Panel */}
        {showPanel && (
          <PropertiesPanel
            selectedNode={selectedNode}
            selectedPipe={selectedPipe}
            selectedPump={selectedPump}
            nodes={nodes}
            pipes={pipes}
            pumps={pumps}
            onUpdateNode={handleUpdateNode}
            onUpdatePipe={handleUpdatePipe}
            onUpdatePump={handleUpdatePump}
            onDeleteNode={handleDeleteNode}
            onDeletePipe={handleDeletePipe}
            onDeletePump={handleDeletePump}
            onReroutePipe={handleReroutePipe}
            onRemoveAccessory={handleRemoveAccessory}
            onAddAccessoryToNode={handleAddAccessoryToNode}
          />
        )}
      </div>

      {/* Status Bar */}
      <StatusBar
        drawMode={drawMode}
        nodeCount={nodes.length}
        pipeCount={pipes.length}
        pumpCount={pumps.length}
        mousePosition={mousePosition}
        statusMessage={statusMessage}
        accessoryCount={nodes.reduce((sum, n) => sum + n.accessories.length, 0)}
      />

      {/* Pipe Dialog */}
      <PipeDialog
        isOpen={showPipeDialog}
        straightLength={pendingPipe?.straightLength || 0}
        routeLength={pendingPipe?.routeLength || 0}
        elevationDiff={pendingPipe?.elevationDiff || 0}
        startNodeLabel={nodes.find(n => n.id === pendingPipe?.startNodeId)?.label || ''}
        endNodeLabel={nodes.find(n => n.id === pendingPipe?.endNodeId)?.label || ''}
        routeSuccess={pendingPipe?.routeSuccess || false}
        onConfirm={handleCreatePipe}
        onCancel={handleCancelPipe}
      />

      {/* Accessory Dialog */}
      <AccessoryDialog
        isOpen={showAccessoryDialog}
        selectedType={selectedAccessoryType}
        pipeDiameter={pendingAccessory ? (pipesRef.current.find(p => p.id === pendingAccessory.pipeId)?.diameter || 100) : 100}
        elevation={pendingAccessory?.elevation || 0}
        onConfirm={handleConfirmAccessory}
        onCancel={handleCancelAccessory}
      />

      {/* Pump Dialog */}
      <PumpDialog
        isOpen={showPumpDialog}
        startNodeLabel={nodes.find(n => n.id === pendingPump?.startNodeId)?.label || ''}
        endNodeLabel={nodes.find(n => n.id === pendingPump?.endNodeId)?.label || ''}
        onConfirm={handleCreatePump}
        onCancel={handleCancelPump}
      />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.inp"
        onChange={handleFileImport}
        className="hidden"
      />

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        title={confirmDialogConfig.title || 'Konfirmasi'}
        message={confirmDialogConfig.message || 'Apakah Anda yakin?'}
        confirmLabel={confirmDialogConfig.confirmLabel || 'Ya'}
        variant="danger"
        onConfirm={() => { confirmCallbackRef.current?.(); setShowConfirmDialog(false); }}
        onCancel={() => setShowConfirmDialog(false)}
      />

      {/* Keyboard Shortcuts Modal */}
      {showShortcutsModal && (
        <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4 animate-fadeIn" onClick={() => setShowShortcutsModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scaleIn" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
              <h2 className="text-lg font-bold text-white">⌨️ Keyboard Shortcuts</h2>
            </div>
            <div className="p-6 space-y-3">
              {[
                ['Ctrl + Z', 'Undo'],
                ['Ctrl + Y', 'Redo'],
                ['Enter / Space', 'Finalisasi pipa (mode auto)'],
                ['Escape', 'Batalkan pembuatan pipa'],
                ['Backspace', 'Hapus titik terakhir (mode manual)'],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between">
                  <kbd className="px-2.5 py-1 bg-gray-100 rounded-lg text-xs font-mono font-bold text-gray-700 border border-gray-200 shadow-sm">{key}</kbd>
                  <span className="text-sm text-gray-600">{desc}</span>
                </div>
              ))}
            </div>
            <div className="px-6 pb-6">
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="w-full px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-all"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper to calculate route length from coordinates
function calculateRouteLength(coords: [number, number][]): number {
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += calculateDistance(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]);
  }
  return total;
}
