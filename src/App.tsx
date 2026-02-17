import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { MapView } from './components/MapView';
import { Toolbar } from './components/Toolbar';
import { PropertiesPanel } from './components/PropertiesPanel';
import { StatusBar } from './components/StatusBar';
import { PipeDialog } from './components/PipeDialog';
import { AccessoryDialog } from './components/AccessoryDialog';
import { calculateDistance, getElevation, runHydraulicAnalysis } from './utils/calculations';
import { getRoute } from './utils/routing';
import { downloadINP } from './utils/epanetExport';
import { findNearestPointOnPipe } from './utils/geometry';
import { ACCESSORY_CATALOG } from './types';
import type { PipeNode, Pipe, DrawMode, AccessoryType } from './types';

export function App() {
  const [nodes, setNodes] = useState<PipeNode[]>([]);
  const [pipes, setPipes] = useState<Pipe[]>([]);
  const [drawMode, setDrawMode] = useState<DrawMode>('select');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedPipeId, setSelectedPipeId] = useState<string | null>(null);
  const [pipeStartNodeId, setPipeStartNodeId] = useState<string | null>(null);
  const [pipeWaypoints, setPipeWaypoints] = useState<string[]>([]); // Multi-node routing: array of node IDs
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
  const [mousePosition] = useState<{ lat: number; lng: number } | null>(null);
  const [showPanel, setShowPanel] = useState(true);
  const [isRouting, setIsRouting] = useState(false);
  const [hideJunctions, setHideJunctions] = useState(false);

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

  const nodeCounterRef = useRef({ junction: 0, reservoir: 0, tank: 0, pump: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use refs for nodes/pipes so callbacks always see latest state
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const pipesRef = useRef(pipes);
  pipesRef.current = pipes;

  // Map center (Indonesia - Jakarta)
  const mapCenter: [number, number] = [-6.2, 106.816];
  const mapZoom = 13;

  const showStatus = useCallback((msg: string, duration = 3000) => {
    setStatusMessage(msg);
    if (duration > 0) {
      setTimeout(() => setStatusMessage(''), duration);
    }
  }, []);

  // Handle draw mode change - reset pipe drawing state
  const handleSetDrawMode = useCallback((mode: DrawMode) => {
    setDrawMode(mode);
    setPipeStartNodeId(null);
    setPipeWaypoints([]); // Clear multi-node waypoints
    if (mode !== 'select') {
      setSelectedNodeId(null);
      setSelectedPipeId(null);
    }
  }, []);

  // Handle map click (for placing nodes)
  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    // In pipe mode, clicking the map (not a node) should cancel pipe start selection
    if (drawMode === 'pipe') {
      setPipeStartNodeId(null);
      return;
    }

    // In accessory mode, clicking map (not a pipe) cancels
    if (drawMode === 'accessory') {
      return;
    }

    if (drawMode === 'select' || drawMode === 'delete') return;

    const nodeType = drawMode === 'node' ? 'junction' : drawMode as 'junction' | 'reservoir' | 'tank' | 'pump';
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
    showStatus(`✅ ${nodeType.charAt(0).toUpperCase() + nodeType.slice(1)} "${newNode.label}" ditambahkan (Elevasi: ${newNode.elevation} mdpl)`);
  }, [drawMode, showStatus]);

  // Handle node click - the most critical function for pipe drawing
  const handleNodeClick = useCallback((nodeId: string) => {
    if (drawMode === 'delete') {
      setNodes(prev => prev.filter(n => n.id !== nodeId));
      setPipes(prev => prev.filter(p => p.startNodeId !== nodeId && p.endNodeId !== nodeId));
      setSelectedNodeId(null);
      showStatus('🗑️ Node dihapus');
      return;
    }

    if (drawMode === 'pipe') {
      // Multi-node pipe routing: add node to waypoints array
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
  }, [drawMode, showStatus]);

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
      // Only listen when in pipe mode with waypoints
      if (drawMode !== 'pipe' || pipeWaypoints.length < 2) return;

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
  }, [drawMode, pipeWaypoints, handleFinalizePipePath, showStatus]);

  // Handle pipe click - can be for selecting or adding accessory
  const handlePipeClick = useCallback((pipeId: string, latlng?: { lat: number; lng: number }) => {
    if (drawMode === 'delete') {
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
    showStatus(`✅ Pipa ditambahkan: ${startNode?.label} → ${endNode?.label} | ${newPipe.length.toFixed(0)}m (jalur jalan), ⌀${diameter}mm, ${material}`);
  }, [pendingPipe, showStatus]);

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

  // Run hydraulic analysis
  const handleRunAnalysis = useCallback(() => {
    if (nodes.length < 2 || pipes.length < 1) {
      showStatus('⚠️ Minimal 2 node dan 1 pipa diperlukan untuk analisis');
      return;
    }

    setIsAnalyzing(true);
    showStatus('⏳ Menjalankan analisis hidrolik...');

    setTimeout(() => {
      const result = runHydraulicAnalysis(nodes, pipes);
      setNodes(result.nodes);
      setPipes(result.pipes);
      setIsAnalyzing(false);
      showStatus('✅ Analisis hidrolik selesai!');
    }, 500);
  }, [nodes, pipes, showStatus]);

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
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setPipes(prev => prev.filter(p => p.startNodeId !== nodeId && p.endNodeId !== nodeId));
    setSelectedNodeId(null);
    showStatus('🗑️ Node dihapus');
  }, [showStatus]);

  // Delete pipe
  const handleDeletePipe = useCallback((pipeId: string) => {
    setPipes(prev => prev.filter(p => p.id !== pipeId));
    setSelectedPipeId(null);
    showStatus('🗑️ Pipa dihapus');
  }, [showStatus]);

  // Clear all
  const handleClearAll = useCallback(() => {
    if (nodes.length === 0 && pipes.length === 0) return;
    if (confirm('Hapus semua node dan pipa? Tindakan ini tidak dapat dibatalkan.')) {
      setNodes([]);
      setPipes([]);
      setSelectedNodeId(null);
      setSelectedPipeId(null);
      setPipeStartNodeId(null);
      nodeCounterRef.current = { junction: 0, reservoir: 0, tank: 0, pump: 0 };
      showStatus('🧹 Semua data telah dihapus');
    }
  }, [nodes.length, pipes.length, showStatus]);

  // Export
  const handleExport = useCallback(() => {
    const data = { nodes, pipes };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pdam-network-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus('💾 Jaringan berhasil di-export');
  }, [nodes, pipes, showStatus]);

  // Export EPANET INP
  const handleExportINP = useCallback(() => {
    if (nodes.length === 0) {
      showStatus('⚠️ Tidak ada data untuk di-export');
      return;
    }
    downloadINP(nodes, pipes);
    showStatus('💾 File EPANET .inp berhasil di-export');
  }, [nodes, pipes, showStatus]);

  // Import
  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.nodes && data.pipes) {
          // Ensure backwards compatibility — add accessories array if missing
          const importedNodes = data.nodes.map((n: PipeNode) => ({
            ...n,
            accessories: n.accessories || [],
          }));
          setNodes(importedNodes);
          setPipes(data.pipes);
          setSelectedNodeId(null);
          setSelectedPipeId(null);
          showStatus('📂 Jaringan berhasil di-import');
        }
      } catch {
        showStatus('❌ Error: File tidak valid');
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

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 px-4 py-2.5 flex items-center justify-between shadow-lg z-10">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-1.5">
            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">PDAM Pipe Network Planner</h1>
            <p className="text-blue-200 text-[10px]">Perencanaan Jaringan Distribusi Air Minum — Aksesoris & Percabangan Pipa</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPanel(!showPanel)}
            className="text-white/80 hover:text-white text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-all"
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
        isAnalyzing={isAnalyzing}
        hideJunctions={hideJunctions}
        onToggleHideJunctions={() => setHideJunctions(h => !h)}
        selectedAccessoryType={selectedAccessoryType}
        onSelectAccessoryType={setSelectedAccessoryType}
      />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Map */}
        <div className="flex-1 relative">
          <MapView
            nodes={nodes}
            pipes={pipes}
            drawMode={drawMode}
            selectedNodeId={selectedNodeId}
            selectedPipeId={selectedPipeId}
            pipeStartNodeId={pipeStartNodeId}
            pipeWaypoints={pipeWaypoints}
            onMapClick={handleMapClick}
            onNodeClick={handleNodeClick}
            onNodeDrag={handleNodeDrag}
            onPipeClick={handlePipeClick}
            mapCenter={mapCenter}
            mapZoom={mapZoom}
            hideJunctions={hideJunctions}
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

          {/* Pipe mode overlay instructions */}
          {drawMode === 'pipe' && !isRouting && (
            <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-[1000] px-5 py-2.5 rounded-full shadow-lg text-sm font-medium ${pipeStartNodeId
              ? 'bg-amber-500 text-white animate-pulse'
              : 'bg-blue-600 text-white'
              }`}>
              {pipeStartNodeId
                ? '🔗 Klik node tujuan — jalur pipa akan mengikuti jalan'
                : '👆 Klik node awal untuk mulai menggambar pipa'}
            </div>
          )}

          {/* Accessory mode overlay */}
          {drawMode === 'accessory' && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] px-5 py-2.5 rounded-full shadow-lg text-sm font-medium bg-orange-500 text-white">
              🔧 Klik pada garis pipa untuk menambahkan aksesoris di titik tersebut
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
            nodes={nodes}
            pipes={pipes}
            onUpdateNode={handleUpdateNode}
            onUpdatePipe={handleUpdatePipe}
            onDeleteNode={handleDeleteNode}
            onDeletePipe={handleDeletePipe}
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

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileImport}
        className="hidden"
      />
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
