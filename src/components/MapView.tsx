import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { ACCESSORY_CATALOG } from '../types';
import type { PipeNode, Pipe, DrawMode } from '../types';

// Fix default marker icon
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)['_getIconUrl'];
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface MapViewProps {
  nodes: PipeNode[];
  pipes: Pipe[];
  drawMode: DrawMode;
  selectedNodeId: string | null;
  selectedPipeId: string | null;
  pipeStartNodeId: string | null;
  pipeWaypoints: string[]; // Array of node IDs for multi-node routing
  onMapClick: (lat: number, lng: number) => void;
  onNodeClick: (nodeId: string) => void;
  onNodeDrag: (nodeId: string, lat: number, lng: number) => void;
  onPipeClick: (pipeId: string, latlng?: { lat: number; lng: number }) => void;
  mapCenter: [number, number];
  mapZoom: number;
  hideJunctions: boolean;
}

const nodeColors: Record<string, string> = {
  junction: '#3B82F6',
  reservoir: '#10B981',
  tank: '#8B5CF6',
  pump: '#F59E0B',
};

const nodeSymbols: Record<string, string> = {
  junction: '',
  reservoir: '💧',
  tank: '🏗️',
  pump: '⚡',
};

function createNodeIcon(node: PipeNode, isSelected: boolean, isPipeStart: boolean, zoom: number = 15): L.DivIcon {
  const type = node.type;
  const color = nodeColors[type] || '#3B82F6';
  const symbol = nodeSymbols[type] || '';
  const hasAccessories = node.accessories && node.accessories.length > 0;

  // Scale size based on zoom level (reference zoom = 15)
  // At zoom 15: scale = 1.0 (normal)
  // At zoom 12: scale ~0.55 (smaller)
  // At zoom 10: scale ~0.4 (minimum)
  const scale = Math.max(0.4, Math.min(1.2, (zoom - 8) / (15 - 8)));
  const baseSize = type === 'junction' ? (hasAccessories ? 32 : 28) : 36;
  const size = Math.round(baseSize * scale);
  let border = '2px solid white';
  if (isPipeStart) border = '3px solid #F59E0B';
  else if (isSelected) border = '3px solid #EF4444';
  else if (hasAccessories) border = '3px solid #F97316';

  // Build accessory icons badge
  let accessoryBadge = '';
  if (hasAccessories) {
    const icons = node.accessories
      .map(a => ACCESSORY_CATALOG.find(c => c.type === a.type)?.icon || '🔧')
      .join('');
    accessoryBadge = `
      <div style="
        position: absolute;
        top: -8px;
        right: -12px;
        background: #F97316;
        color: white;
        padding: 1px 4px;
        border-radius: 8px;
        font-size: 10px;
        white-space: nowrap;
        box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        z-index: 10;
        line-height: 1.2;
      ">${icons}</div>
    `;
  }

  return L.divIcon({
    className: 'custom-node-icon',
    html: `
      <div style="position: relative;">
        <div style="
          background: ${hasAccessories ? `linear-gradient(135deg, ${color}, #F97316)` : color};
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          border: ${border};
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: ${Math.round((type === 'junction' ? 14 : 16) * scale)}px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          cursor: pointer;
        ">
          ${symbol}
        </div>
        ${accessoryBadge}
      </div>
      <div style="
        position: absolute;
        top: ${size + 2}px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.75);
        color: white;
        padding: 1px 6px;
        border-radius: 3px;
        font-size: ${Math.round(10 * scale)}px;
        white-space: nowrap;
        font-family: monospace;
      ">${node.label}</div>
    `,
    iconSize: [size + 24, size + 20],
    iconAnchor: [(size + 24) / 2, size / 2],
  });
}

export function MapView({
  nodes,
  pipes,
  drawMode,
  selectedNodeId,
  selectedPipeId,
  pipeStartNodeId,
  pipeWaypoints,
  onMapClick,
  onNodeClick,
  onNodeDrag,
  onPipeClick,
  mapCenter,
  mapZoom,
  hideJunctions,
}: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const polylinesRef = useRef<Map<string, L.Polyline>>(new Map());
  const zoomRef = useRef<number>(mapZoom);
  const labelsRef = useRef<Map<string, L.Marker>>(new Map());

  // Keep refs to latest callbacks so event handlers always use latest state
  const onMapClickRef = useRef(onMapClick);
  const onNodeClickRef = useRef(onNodeClick);
  const onNodeDragRef = useRef(onNodeDrag);
  const onPipeClickRef = useRef(onPipeClick);

  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);
  useEffect(() => { onNodeClickRef.current = onNodeClick; }, [onNodeClick]);
  useEffect(() => { onNodeDragRef.current = onNodeDrag; }, [onNodeDrag]);
  useEffect(() => { onPipeClickRef.current = onPipeClick; }, [onPipeClick]);

  // Initialize map - only once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: mapCenter,
      zoom: mapZoom,
      zoomControl: true,
    });

    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    });

    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '© Esri',
      maxZoom: 19,
    });

    const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenTopoMap',
      maxZoom: 17,
    });

    osmLayer.addTo(map);

    L.control.layers({
      'OpenStreetMap': osmLayer,
      'Satellite': satelliteLayer,
      'Topographic': topoLayer,
    }).addTo(map);

    L.control.scale({ metric: true, imperial: false }).addTo(map);

    // Map click handler - uses ref so it always has latest callback
    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClickRef.current(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;

    // Zoom-end: refresh all node marker icons to scale with zoom
    map.on('zoomend', () => {
      const currentZoom = map.getZoom();
      // Re-render is handled by React state; store zoom for next render
      if (zoomRef.current !== currentZoom) {
        zoomRef.current = currentZoom;
        // Force marker icon refresh
        markersRef.current.forEach((marker, id) => {
          const node = nodes.find(n => n.id === id);
          if (node) {
            const isSelected = node.id === selectedNodeId;
            const isPipeStart = node.id === pipeStartNodeId;
            marker.setIcon(createNodeIcon(node, isSelected, isPipeStart, currentZoom));
          }
        });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update cursor based on draw mode
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const cursorMap: Record<string, string> = {
      select: 'grab',
      node: 'crosshair',
      pipe: 'pointer',
      reservoir: 'crosshair',
      tank: 'crosshair',
      pump: 'crosshair',
      delete: 'not-allowed',
      accessory: 'crosshair',
    };

    container.style.cursor = cursorMap[drawMode] || 'default';
  }, [drawMode]);

  // Sync markers with nodes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentNodeIds = new Set(nodes.map(n => n.id));

    // Remove markers for deleted nodes
    markersRef.current.forEach((marker, id) => {
      if (!currentNodeIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    // Add or update markers
    nodes.forEach(node => {
      const isSelected = node.id === selectedNodeId;
      const isPipeStart = node.id === pipeStartNodeId;
      const icon = createNodeIcon(node, isSelected, isPipeStart, mapRef.current?.getZoom() || 15);

      // Determine if this marker should be hidden
      const shouldHide = hideJunctions && node.type === 'junction';

      let marker = markersRef.current.get(node.id);

      if (marker) {
        // Update existing marker
        marker.setLatLng([node.lat, node.lng]);
        marker.setIcon(icon);
        marker.unbindTooltip();
        marker.bindTooltip(buildNodeTooltip(node), { direction: 'top', offset: [0, -20] });
        // Show/hide based on hideJunctions
        if (shouldHide) {
          marker.setOpacity(0);
          marker.getElement()?.style.setProperty('pointer-events', 'none');
        } else {
          marker.setOpacity(1);
          marker.getElement()?.style.setProperty('pointer-events', 'auto');
        }
      } else {
        // Create new marker
        marker = L.marker([node.lat, node.lng], {
          icon,
          draggable: true,
          zIndexOffset: 1000,
        });

        const nodeId = node.id;
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          onNodeClickRef.current(nodeId);
        });

        marker.on('dragend', () => {
          if (!marker) return;
          const pos = marker.getLatLng();
          onNodeDragRef.current(nodeId, pos.lat, pos.lng);
        });

        marker.bindTooltip(buildNodeTooltip(node), { direction: 'top', offset: [0, -20] });

        // Hide if needed
        if (shouldHide) {
          marker.setOpacity(0);
        }

        marker.addTo(map);
        markersRef.current.set(node.id, marker);
      }
    });
  }, [nodes, selectedNodeId, pipeStartNodeId, hideJunctions]);

  // Update draggable state when drawMode changes
  useEffect(() => {
    markersRef.current.forEach((marker) => {
      if (drawMode === 'select') {
        marker.dragging?.enable();
      } else {
        marker.dragging?.disable();
      }
    });
  }, [drawMode, nodes]);

  // Sync polylines with pipes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentPipeIds = new Set(pipes.map(p => p.id));

    // Remove old polylines and labels
    polylinesRef.current.forEach((polyline, id) => {
      if (!currentPipeIds.has(id)) {
        polyline.remove();
        polylinesRef.current.delete(id);
      }
    });
    labelsRef.current.forEach((label, id) => {
      if (!currentPipeIds.has(id)) {
        label.remove();
        labelsRef.current.delete(id);
      }
    });

    // Add/update polylines
    pipes.forEach(pipe => {
      const startNode = nodes.find(n => n.id === pipe.startNodeId);
      const endNode = nodes.find(n => n.id === pipe.endNodeId);

      if (!startNode || !endNode) return;

      const latlngs: L.LatLngExpression[] = pipe.routeCoordinates && pipe.routeCoordinates.length > 1
        ? pipe.routeCoordinates.map(([lat, lng]) => [lat, lng] as L.LatLngExpression)
        : [[startNode.lat, startNode.lng], [endNode.lat, endNode.lng]];

      // Color based on velocity (or selection)
      let color = '#3B82F6';
      let weight = 5;
      let opacity = 0.85;

      if (pipe.id === selectedPipeId) {
        color = '#EF4444';
        weight = 7;
        opacity = 1;
      } else if (pipe.velocity !== undefined) {
        if (pipe.velocity < 0.3) color = '#EF4444';
        else if (pipe.velocity > 3.0) color = '#F59E0B';
        else color = '#10B981';
      }

      const existingPolyline = polylinesRef.current.get(pipe.id);
      if (existingPolyline) {
        existingPolyline.setLatLngs(latlngs);
        existingPolyline.setStyle({ color, weight, opacity });
        existingPolyline.unbindTooltip();
        existingPolyline.bindTooltip(buildPipeTooltip(pipe, startNode, endNode), { sticky: true });
      } else {
        const polyline = L.polyline(latlngs, {
          color,
          weight,
          opacity,
          lineJoin: 'round',
          lineCap: 'round',
        });

        const pipeId = pipe.id;
        polyline.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          onPipeClickRef.current(pipeId, { lat: e.latlng.lat, lng: e.latlng.lng });
        });

        polyline.bindTooltip(buildPipeTooltip(pipe, startNode, endNode), { sticky: true });

        polyline.addTo(map);
        polylinesRef.current.set(pipe.id, polyline);
      }

      // Pipe label at midpoint of route
      let midLat: number, midLng: number;
      if (pipe.routeCoordinates && pipe.routeCoordinates.length > 2) {
        const midIdx = Math.floor(pipe.routeCoordinates.length / 2);
        midLat = pipe.routeCoordinates[midIdx][0];
        midLng = pipe.routeCoordinates[midIdx][1];
      } else {
        midLat = (startNode.lat + endNode.lat) / 2;
        midLng = (startNode.lng + endNode.lng) / 2;
      }

      const existingLabel = labelsRef.current.get(pipe.id);
      const routeIcon = pipe.routeCoordinates && pipe.routeCoordinates.length > 2 ? '🛣️' : '📏';
      const labelHtml = `<div style="
        background: rgba(255,255,255,0.95);
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: bold;
        color: #1E40AF;
        border: 1px solid ${pipe.id === selectedPipeId ? '#EF4444' : '#93C5FD'};
        white-space: nowrap;
        box-shadow: 0 1px 4px rgba(0,0,0,0.2);
        pointer-events: none;
      ">${routeIcon} ${pipe.length.toFixed(0)}m | ⌀${pipe.diameter}mm</div>`;

      if (existingLabel) {
        existingLabel.setLatLng([midLat, midLng]);
        existingLabel.setIcon(L.divIcon({
          className: 'pipe-label',
          html: labelHtml,
          iconSize: [120, 20],
          iconAnchor: [60, 10],
        }));
      } else {
        const labelIcon = L.divIcon({
          className: 'pipe-label',
          html: labelHtml,
          iconSize: [120, 20],
          iconAnchor: [60, 10],
        });

        const label = L.marker([midLat, midLng], {
          icon: labelIcon,
          interactive: false,
          zIndexOffset: 500,
        });

        label.addTo(map);
        labelsRef.current.set(pipe.id, label);
      }
    });
  }, [pipes, nodes, selectedPipeId]);

  // Draw waypoint path visualization (dashed lines + numbered badges)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || pipeWaypoints.length < 2) {
      // Clear any existing waypoint visualization
      map?.eachLayer((layer) => {
        if ((layer as any)._waypointPreview) {
          map.removeLayer(layer);
        }
      });
      return;
    }

    // Remove old waypoint previews
    map.eachLayer((layer) => {
      if ((layer as any)._waypointPreview) {
        map.removeLayer(layer);
      }
    });

    // Draw dashed lines connecting waypoints
    const waypointNodes = pipeWaypoints.map(id => nodes.find(n => n.id === id)).filter(Boolean) as PipeNode[];
    for (let i = 0; i < waypointNodes.length - 1; i++) {
      const start = waypointNodes[i];
      const end = waypointNodes[i + 1];

      const previewLine = L.polyline(
        [[start.lat, start.lng], [end.lat, end.lng]],
        {
          color: '#3B82F6',
          weight: 3,
          opacity: 0.6,
          dashArray: '10, 10',
          lineJoin: 'round',
        }
      );

      (previewLine as any)._waypointPreview = true;
      previewLine.addTo(map);
    }

    // Add numbered badges to waypoints
    waypointNodes.forEach((node, index) => {
      const numberBadge = L.divIcon({
        className: 'waypoint-number-badge',
        html: `<div style="
          background: #3B82F6;
          color: white;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: bold;
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        ">${index + 1}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const badge = L.marker([node.lat, node.lng], {
        icon: numberBadge,
        interactive: false,
        zIndexOffset: 2000,
      });

      (badge as any)._waypointPreview = true;
      badge.addTo(map);
    });

    return () => {
      // Cleanup waypoint visualization
      map.eachLayer((layer) => {
        if ((layer as any)._waypointPreview) {
          map.removeLayer(layer);
        }
      });
    };
  }, [pipeWaypoints, nodes]);

  return (
    <div
      ref={mapContainerRef}
      className="w-full h-full"
      style={{ minHeight: '100%' }}
    />
  );
}

function buildNodeTooltip(node: PipeNode): string {
  const typeLabels: Record<string, string> = {
    junction: 'Junction',
    reservoir: 'Reservoir',
    tank: 'Tanki',
    pump: 'Pompa',
  };
  let html = `<b>${node.label}</b> (${typeLabels[node.type] || node.type})<br/>`;
  html += `Elevasi: <b>${node.elevation.toFixed(1)} mdpl</b><br/>`;
  html += `Lat: ${node.lat.toFixed(6)}, Lng: ${node.lng.toFixed(6)}`;
  if (node.demand !== undefined && node.demand > 0) {
    html += `<br/>Demand: ${node.demand} L/s`;
  }
  if (node.pressure !== undefined) {
    html += `<br/>Tekanan: <b>${node.pressure.toFixed(2)} bar</b>`;
  }
  // Show accessories
  if (node.accessories && node.accessories.length > 0) {
    html += `<br/><b style="color:#F97316">🔧 Aksesoris:</b>`;
    node.accessories.forEach(acc => {
      const info = ACCESSORY_CATALOG.find(a => a.type === acc.type);
      html += `<br/>&nbsp;&nbsp;${info?.icon || '🔧'} ${acc.label}`;
      if (acc.status) {
        html += ` <span style="color:${acc.status === 'open' ? 'green' : 'red'}">(${acc.status === 'open' ? 'Terbuka' : acc.status === 'closed' ? 'Tertutup' : 'Sebagian'})</span>`;
      }
    });
  }
  return html;
}

function buildPipeTooltip(pipe: Pipe, startNode: PipeNode, endNode: PipeNode): string {
  const hasRoute = pipe.routeCoordinates && pipe.routeCoordinates.length > 2;
  let html = `<b>${startNode.label} → ${endNode.label}</b><br/>`;
  html += `Panjang Jalur: <b>${pipe.length.toFixed(1)} m</b>${hasRoute ? ' 🛣️' : ''}<br/>`;
  if (hasRoute && pipe.straightLength) {
    html += `Garis Lurus: ${pipe.straightLength.toFixed(1)} m<br/>`;
  }
  html += `Diameter: ${pipe.diameter} mm | ${pipe.material}<br/>`;
  html += `Beda Elevasi: ${(startNode.elevation - endNode.elevation).toFixed(1)} m`;
  if (pipe.flowRate !== undefined) {
    html += `<br/>Debit: <b>${pipe.flowRate.toFixed(3)} L/s</b>`;
  }
  if (pipe.velocity !== undefined) {
    html += `<br/>Kecepatan: <b>${pipe.velocity.toFixed(3)} m/s</b>`;
  }
  if (pipe.headloss !== undefined) {
    html += `<br/>Headloss: <b>${pipe.headloss.toFixed(3)} m</b>`;
  }
  return html;
}
