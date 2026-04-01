import { useState } from 'react';
import { ACCESSORY_CATALOG } from '../types';
import type { PipeNode, Pipe, Pump, AccessoryType } from '../types';
import { PIPE_MATERIALS } from '../utils/calculations';

interface PropertiesPanelProps {
  selectedNode: PipeNode | null;
  selectedPipe: Pipe | null;
  selectedPump: Pump | null;
  nodes: PipeNode[];
  pipes: Pipe[];
  pumps: Pump[];
  onUpdateNode: (node: PipeNode) => void;
  onUpdatePipe: (pipe: Pipe) => void;
  onUpdatePump: (pump: Pump) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeletePipe: (pipeId: string) => void;
  onDeletePump: (pumpId: string) => void;
  onReroutePipe: (pipeId: string) => void;
  onRemoveAccessory: (nodeId: string, accessoryIndex: number) => void;
  onAddAccessoryToNode: (nodeId: string, accessoryType: AccessoryType) => void;
}

export function PropertiesPanel({
  selectedNode,
  selectedPipe,
  selectedPump,
  nodes,
  pipes,
  pumps,
  onUpdateNode,
  onUpdatePipe,
  onUpdatePump,
  onDeleteNode,
  onDeletePipe,
  onDeletePump,
  onReroutePipe,
  onRemoveAccessory,
  onAddAccessoryToNode,
}: PropertiesPanelProps) {
  const [activeTab, setActiveTab] = useState<'properties' | 'network' | 'results'>('properties');

  return (
    <div className="w-80 panel-glass border-l border-gray-200/50 flex flex-col h-full overflow-hidden shadow-xl">
      {/* Tabs */}
      <div className="flex border-b border-gray-200/70">
        {(['properties', 'network', 'results'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wide transition-all
              ${activeTab === tab
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/70'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50/50'
              }`}
          >
            {tab === 'properties' ? 'Properti' : tab === 'network' ? 'Jaringan' : 'Hasil'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'properties' && (
          <PropertiesTab
            selectedNode={selectedNode}
            selectedPipe={selectedPipe}
            selectedPump={selectedPump}
            nodes={nodes}
            pipes={pipes}
            pumps={pumps}
            onUpdateNode={onUpdateNode}
            onUpdatePipe={onUpdatePipe}
            onUpdatePump={onUpdatePump}
            onDeleteNode={onDeleteNode}
            onDeletePipe={onDeletePipe}
            onDeletePump={onDeletePump}
            onReroutePipe={onReroutePipe}
            onRemoveAccessory={onRemoveAccessory}
            onAddAccessoryToNode={onAddAccessoryToNode}
          />
        )}
        {activeTab === 'network' && (
          <NetworkTab nodes={nodes} pipes={pipes} pumps={pumps} />
        )}
        {activeTab === 'results' && (
          <ResultsTab nodes={nodes} pipes={pipes} pumps={pumps} />
        )}
      </div>
    </div>
  );
}

function PropertiesTab({
  selectedNode,
  selectedPipe,
  selectedPump,
  nodes,
  pipes,
  pumps: _pumps,
  onUpdateNode,
  onUpdatePipe,
  onUpdatePump,
  onDeleteNode,
  onDeletePipe,
  onDeletePump,
  onReroutePipe,
  onRemoveAccessory,
  onAddAccessoryToNode,
}: {
  selectedNode: PipeNode | null;
  selectedPipe: Pipe | null;
  selectedPump: Pump | null;
  nodes: PipeNode[];
  pipes: Pipe[];
  pumps: Pump[];
  onUpdateNode: (node: PipeNode) => void;
  onUpdatePipe: (pipe: Pipe) => void;
  onUpdatePump: (pump: Pump) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeletePipe: (pipeId: string) => void;
  onDeletePump: (pumpId: string) => void;
  onReroutePipe: (pipeId: string) => void;
  onRemoveAccessory: (nodeId: string, accessoryIndex: number) => void;
  onAddAccessoryToNode: (nodeId: string, accessoryType: AccessoryType) => void;
}) {
  const [showAddAccessory, setShowAddAccessory] = useState(false);

  if (selectedNode) {
    // Count connected pipes
    const connectedPipes = pipes.filter(
      p => p.startNodeId === selectedNode.id || p.endNodeId === selectedNode.id
    );


    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
            {selectedNode.type === 'junction' ? '⚬ Junction' :
              selectedNode.type === 'reservoir' ? '💧 Reservoir' :
                '🏗️ Tanki'}
          </h3>
          <button
            onClick={() => onDeleteNode(selectedNode.id)}
            className="text-xs px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200"
          >
            Hapus
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Label</label>
            <input
              type="text"
              value={selectedNode.label}
              onChange={(e) => onUpdateNode({ ...selectedNode, label: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Latitude</label>
              <input
                type="number"
                step="0.000001"
                value={selectedNode.lat}
                onChange={(e) => onUpdateNode({ ...selectedNode, lat: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Longitude</label>
              <input
                type="number"
                step="0.000001"
                value={selectedNode.lng}
                onChange={(e) => onUpdateNode({ ...selectedNode, lng: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Elevasi (mdpl)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                value={selectedNode.elevation}
                onChange={(e) => onUpdateNode({ ...selectedNode, elevation: parseFloat(e.target.value) || 0 })}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-400">m</span>
            </div>
          </div>

          {selectedNode.type === 'junction' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Kebutuhan Air (Demand)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={selectedNode.demand || 0}
                  onChange={(e) => onUpdateNode({ ...selectedNode, demand: parseFloat(e.target.value) || 0 })}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-400">L/s</span>
              </div>
            </div>
          )}

          {/* Connected pipes info */}
          <div className="bg-gray-50 p-3 rounded-lg">
            <label className="block text-xs font-medium text-gray-600 mb-1">Pipa Terhubung</label>
            <span className="text-lg font-bold text-gray-800">{connectedPipes.length}</span>
            <span className="text-xs text-gray-500 ml-1">pipa</span>
            {connectedPipes.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {connectedPipes.map(p => {
                  const otherNodeId = p.startNodeId === selectedNode.id ? p.endNodeId : p.startNodeId;
                  const otherNode = nodes.find(n => n.id === otherNodeId);
                  return (
                    <div key={p.id} className="text-[10px] text-gray-500">
                      → {otherNode?.label} ({p.length.toFixed(0)}m, ⌀{p.diameter}mm)
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Accessories section */}
          <div className="border-t border-gray-200 pt-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-orange-700 uppercase tracking-wide">🔧 Aksesoris</label>
              <button
                onClick={() => setShowAddAccessory(!showAddAccessory)}
                className="text-xs px-2 py-1 bg-orange-100 text-orange-600 rounded hover:bg-orange-200"
              >
                + Tambah
              </button>
            </div>

            {selectedNode.accessories.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Belum ada aksesoris</p>
            ) : (
              <div className="space-y-1.5">
                {selectedNode.accessories.map((acc, idx) => {
                  const info = ACCESSORY_CATALOG.find(a => a.type === acc.type);
                  return (
                    <div key={idx} className="flex items-center justify-between bg-orange-50 p-2 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{info?.icon || '🔧'}</span>
                        <div>
                          <div className="text-xs font-medium text-gray-800">{acc.label}</div>
                          {acc.size && <div className="text-[10px] text-gray-500">⌀{acc.size}mm</div>}
                          {acc.status && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${acc.status === 'open' ? 'bg-green-100 text-green-700' :
                              acc.status === 'closed' ? 'bg-red-100 text-red-700' :
                                'bg-amber-100 text-amber-700'
                              }`}>
                              {acc.status === 'open' ? 'Terbuka' : acc.status === 'closed' ? 'Tertutup' : 'Sebagian'}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => onRemoveAccessory(selectedNode.id, idx)}
                        className="text-xs text-red-400 hover:text-red-600 p-1"
                        title="Hapus aksesoris"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quick add accessory dropdown */}
            {showAddAccessory && (
              <div className="mt-2 bg-white border border-orange-200 rounded-lg shadow-lg p-2 space-y-1 max-h-48 overflow-y-auto">
                {ACCESSORY_CATALOG.map(acc => (
                  <button
                    key={acc.type}
                    onClick={() => {
                      onAddAccessoryToNode(selectedNode.id, acc.type);
                      setShowAddAccessory(false);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-orange-50 flex items-center gap-2"
                  >
                    <span>{acc.icon}</span>
                    <span>{acc.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedNode.pressure !== undefined && (
            <div className="bg-blue-50 p-3 rounded-lg">
              <label className="block text-xs font-medium text-blue-600 mb-1">Tekanan</label>
              <span className="text-lg font-bold text-blue-800">{selectedNode.pressure.toFixed(2)} bar</span>
            </div>
          )}
        </div>

        <div className="bg-gray-50 p-3 rounded-lg text-xs text-gray-500">
          <p>ID: {selectedNode.id.slice(0, 12)}...</p>
        </div>
      </div>
    );
  }

  if (selectedPipe) {
    const startNode = nodes.find(n => n.id === selectedPipe.startNodeId);
    const endNode = nodes.find(n => n.id === selectedPipe.endNodeId);
    const selectedMaterial = PIPE_MATERIALS.find(m => m.name === selectedPipe.material);
    const hasRoute = selectedPipe.routeCoordinates && selectedPipe.routeCoordinates.length > 2;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">🔗 Pipa</h3>
          <button
            onClick={() => onDeletePipe(selectedPipe.id)}
            className="text-xs px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200"
          >
            Hapus
          </button>
        </div>

        <div className="space-y-3">
          <div className="bg-gray-50 p-3 rounded-lg text-xs space-y-1">
            <p><span className="font-medium">Dari:</span> {startNode?.label || 'N/A'}
              {startNode && startNode.accessories.length > 0 && (
                <span className="ml-1 text-orange-500">
                  {startNode.accessories.map(a => ACCESSORY_CATALOG.find(c => c.type === a.type)?.icon).join('')}
                </span>
              )}
            </p>
            <p><span className="font-medium">Ke:</span> {endNode?.label || 'N/A'}
              {endNode && endNode.accessories.length > 0 && (
                <span className="ml-1 text-orange-500">
                  {endNode.accessories.map(a => ACCESSORY_CATALOG.find(c => c.type === a.type)?.icon).join('')}
                </span>
              )}
            </p>
            {startNode && endNode && (
              <p><span className="font-medium">Beda Elevasi:</span> {(startNode.elevation - endNode.elevation).toFixed(1)} m</p>
            )}
          </div>

          {/* Route info */}
          <div className={`p-3 rounded-lg text-xs space-y-2 ${hasRoute ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {hasRoute ? '🛣️ Mengikuti Jalur Jalan' : '📏 Garis Lurus'}
              </span>
              <button
                onClick={() => onReroutePipe(selectedPipe.id)}
                className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-all"
              >
                🔄 Cari Ulang Rute
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-gray-500">Jarak Jalur:</span>
                <p className="font-bold text-gray-800">{selectedPipe.length.toFixed(1)} m</p>
              </div>
              <div>
                <span className="text-gray-500">Garis Lurus:</span>
                <p className="font-bold text-gray-800">{selectedPipe.straightLength.toFixed(1)} m</p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Panjang Pipa (jalur jalan)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                value={selectedPipe.length}
                onChange={(e) => onUpdatePipe({ ...selectedPipe, length: parseFloat(e.target.value) || 0 })}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-400">m</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Material Pipa</label>
            <select
              value={selectedPipe.material}
              onChange={(e) => {
                const mat = PIPE_MATERIALS.find(m => m.name === e.target.value);
                onUpdatePipe({
                  ...selectedPipe,
                  material: e.target.value,
                  roughness: mat?.roughness || selectedPipe.roughness,
                });
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              {PIPE_MATERIALS.map(m => (
                <option key={m.name} value={m.name}>{m.name} (C={m.roughness})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Diameter</label>
            <select
              value={selectedPipe.diameter}
              onChange={(e) => onUpdatePipe({ ...selectedPipe, diameter: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              {(selectedMaterial?.diameters || [50, 75, 100, 150, 200, 250, 300]).map(d => (
                <option key={d} value={d}>{d} mm</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Koefisien Kekasaran (C)</label>
            <input
              type="number"
              step="1"
              value={selectedPipe.roughness}
              onChange={(e) => onUpdatePipe({ ...selectedPipe, roughness: parseFloat(e.target.value) || 100 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Results */}
          {selectedPipe.flowRate !== undefined && (
            <div className="space-y-2">
              <div className="bg-green-50 p-3 rounded-lg">
                <label className="block text-xs font-medium text-green-600 mb-1">Debit Aliran</label>
                <span className="text-lg font-bold text-green-800">{selectedPipe.flowRate.toFixed(3)} L/s</span>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <label className="block text-xs font-medium text-blue-600 mb-1">Kecepatan Aliran</label>
                <span className="text-lg font-bold text-blue-800">{selectedPipe.velocity?.toFixed(3)} m/s</span>
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${(selectedPipe.velocity || 0) >= 0.3 && (selectedPipe.velocity || 0) <= 3.0
                  ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                  {(selectedPipe.velocity || 0) >= 0.3 && (selectedPipe.velocity || 0) <= 3.0 ? 'OK' : 'Perlu disesuaikan'}
                </span>
              </div>
              <div className="bg-amber-50 p-3 rounded-lg">
                <label className="block text-xs font-medium text-amber-600 mb-1">Headloss</label>
                <span className="text-lg font-bold text-amber-800">{selectedPipe.headloss?.toFixed(3)} m</span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-gray-50 p-3 rounded-lg text-xs text-gray-500">
          <p>ID: {selectedPipe.id.slice(0, 12)}...</p>
        </div>
      </div>
    );
  }

  // ── PUMP PROPERTIES ──
  if (selectedPump) {
    const startNode = nodes.find(n => n.id === selectedPump.startNodeId);
    const endNode = nodes.find(n => n.id === selectedPump.endNodeId);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">⚡ Pompa</h3>
          <button
            onClick={() => onDeletePump(selectedPump.id)}
            className="text-xs px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200"
          >🗑️ Hapus Pompa</button>
        </div>

        {/* Label */}
        <div>
          <label className="block text-[10px] font-medium text-gray-500 uppercase mb-1">Label</label>
          <input
            type="text"
            value={selectedPump.label}
            onChange={e => onUpdatePump({ ...selectedPump, label: e.target.value })}
            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        {/* Connection */}
        <div className="bg-amber-50 p-3 rounded-lg">
          <label className="block text-[10px] font-medium text-amber-700 uppercase mb-1">Koneksi</label>
          <p className="text-sm font-medium text-amber-900">
            {startNode?.label || '?'} → {endNode?.label || '?'}
          </p>
        </div>

        {/* Design Flow */}
        <div>
          <label className="block text-[10px] font-medium text-gray-500 uppercase mb-1">Debit Desain (L/s)</label>
          <input
            type="number"
            step="0.1"
            min="0.01"
            value={selectedPump.designFlow}
            onChange={e => onUpdatePump({ ...selectedPump, designFlow: parseFloat(e.target.value) || 0 })}
            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        {/* Design Head */}
        <div>
          <label className="block text-[10px] font-medium text-gray-500 uppercase mb-1">Head Desain (m)</label>
          <input
            type="number"
            step="0.5"
            min="0.1"
            value={selectedPump.designHead}
            onChange={e => onUpdatePump({ ...selectedPump, designHead: parseFloat(e.target.value) || 0 })}
            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        {/* Speed */}
        <div>
          <label className="block text-[10px] font-medium text-gray-500 uppercase mb-1">
            Kecepatan Relatif: {(selectedPump.speed * 100).toFixed(0)}%
          </label>
          <input
            type="range"
            min="0.1"
            max="1.5"
            step="0.05"
            value={selectedPump.speed}
            onChange={e => onUpdatePump({ ...selectedPump, speed: parseFloat(e.target.value) })}
            className="w-full accent-amber-500"
          />
        </div>

        {/* Status */}
        <div className="flex items-center gap-3">
          <label className="block text-[10px] font-medium text-gray-500 uppercase">Status</label>
          <button
            onClick={() => onUpdatePump({ ...selectedPump, status: selectedPump.status === 'on' ? 'off' : 'on' })}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedPump.status === 'on'
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
              }`}
          >
            {selectedPump.status === 'on' ? '✅ ON' : '❌ OFF'}
          </button>
        </div>

        {/* Analysis Results */}
        {selectedPump.flowRate !== undefined && selectedPump.flowRate > 0 && (
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-3 rounded-lg border border-amber-200">
            <h4 className="text-[10px] font-bold text-amber-800 uppercase mb-2">Hasil Analisis</h4>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">Debit Operasi</span>
                <span className="font-bold text-amber-800">{selectedPump.flowRate?.toFixed(3)} L/s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Head Gain</span>
                <span className="font-bold text-amber-800">{selectedPump.headGain?.toFixed(2)} m</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Daya</span>
                <span className="font-bold text-amber-800">{selectedPump.power?.toFixed(2)} kW</span>
              </div>
            </div>
          </div>
        )}

        {/* Pump Curve Info */}
        <div className="bg-gray-50 p-3 rounded-lg">
          <h4 className="text-[10px] font-bold text-gray-600 uppercase mb-1">Kurva Pompa</h4>
          <div className="text-[10px] text-gray-500 space-y-0.5">
            {selectedPump.pumpCurve.map((pt, i) => (
              <div key={i} className="flex justify-between">
                <span>Q = {pt.flow} L/s</span>
                <span>H = {pt.head} m</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center text-gray-400 py-12">
      <div className="text-4xl mb-3">🖱️</div>
      <p className="text-sm font-medium">Pilih node, pipa, atau pompa</p>
      <p className="text-xs mt-1">untuk melihat dan mengedit properti</p>
      <div className="mt-6 text-left bg-orange-50 p-4 rounded-lg">
        <h4 className="text-xs font-bold text-orange-700 mb-2">💡 Tips: Menambah Percabangan</h4>
        <ol className="text-xs text-orange-600 space-y-1.5 list-decimal list-inside">
          <li>Pilih tool <b>Aksesoris 🔧</b> di toolbar</li>
          <li>Pilih jenis (Tee, Valve, dll) dari dropdown</li>
          <li>Klik pada <b>garis pipa</b> di peta</li>
          <li>Pipa otomatis terpecah & junction baru dibuat</li>
          <li>Gunakan tool <b>Pipa 🔗</b> untuk menghubungkan pipa baru dari junction tersebut</li>
        </ol>
      </div>
    </div>
  );
}

function NetworkTab({ nodes, pipes, pumps: _pumps }: { nodes: PipeNode[]; pipes: Pipe[]; pumps: Pump[] }) {
  const totalLength = pipes.reduce((sum, p) => sum + p.length, 0);
  const totalStraight = pipes.reduce((sum, p) => sum + p.straightLength, 0);
  const routedPipes = pipes.filter(p => p.routeCoordinates && p.routeCoordinates.length > 2);
  const totalAccessories = nodes.reduce((sum, n) => sum + n.accessories.length, 0);
  const nodesWithAccessories = nodes.filter(n => n.accessories.length > 0);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-blue-50 p-3 rounded-lg text-center">
          <div className="text-2xl font-bold text-blue-700">{nodes.length}</div>
          <div className="text-xs text-blue-500 font-medium">Node</div>
        </div>
        <div className="bg-green-50 p-3 rounded-lg text-center">
          <div className="text-2xl font-bold text-green-700">{pipes.length}</div>
          <div className="text-xs text-green-500 font-medium">Pipa</div>
        </div>
        <div className="bg-purple-50 p-3 rounded-lg text-center">
          <div className="text-xl font-bold text-purple-700">{totalLength.toFixed(0)}</div>
          <div className="text-xs text-purple-500 font-medium">🛣️ Panjang Jalur (m)</div>
        </div>
        <div className="bg-orange-50 p-3 rounded-lg text-center">
          <div className="text-xl font-bold text-orange-700">{totalAccessories}</div>
          <div className="text-xs text-orange-500 font-medium">🔧 Aksesoris</div>
        </div>
      </div>

      {/* Routing stats */}
      {pipes.length > 0 && (
        <div className="bg-indigo-50 p-3 rounded-lg text-xs text-indigo-700">
          <p>🛣️ Pipa mengikuti jalan: <b>{routedPipes.length}</b> / {pipes.length}</p>
          {totalStraight > 0 && (
            <p className="mt-1">Rasio rata-rata: <b>{((totalLength / totalStraight) * 100).toFixed(0)}%</b> dari garis lurus</p>
          )}
        </div>
      )}

      {/* Accessories summary */}
      {totalAccessories > 0 && (
        <div className="bg-orange-50 p-3 rounded-lg text-xs text-orange-700">
          <h4 className="font-bold mb-1">🔧 Aksesoris Terpasang</h4>
          {nodesWithAccessories.map(node => (
            <div key={node.id} className="flex items-center gap-1 mt-1">
              <span className="font-medium">{node.label}:</span>
              {node.accessories.map((acc, i) => {
                const info = ACCESSORY_CATALOG.find(a => a.type === acc.type);
                return (
                  <span key={i} className="inline-flex items-center gap-0.5 bg-white px-1.5 py-0.5 rounded text-[10px]">
                    {info?.icon} {acc.label}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Node list */}
      <div>
        <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Daftar Node</h4>
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {nodes.map(node => (
            <div key={node.id} className="flex items-center justify-between text-xs bg-gray-50 p-2 rounded">
              <span className="font-medium">
                {node.label}
                {node.accessories.length > 0 && (
                  <span className="ml-1 text-orange-500">
                    {node.accessories.map(a => ACCESSORY_CATALOG.find(c => c.type === a.type)?.icon).join('')}
                  </span>
                )}
              </span>
              <span className="text-gray-500">{node.elevation.toFixed(0)} mdpl</span>
            </div>
          ))}
          {nodes.length === 0 && <p className="text-xs text-gray-400">Belum ada node</p>}
        </div>
      </div>

      {/* Pipe list */}
      <div>
        <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Daftar Pipa</h4>
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {pipes.map(pipe => {
            const startNode = nodes.find(n => n.id === pipe.startNodeId);
            const endNode = nodes.find(n => n.id === pipe.endNodeId);
            const hasRoute = pipe.routeCoordinates && pipe.routeCoordinates.length > 2;
            return (
              <div key={pipe.id} className="text-xs bg-gray-50 p-2 rounded">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {hasRoute ? '🛣️' : '📏'} {startNode?.label} → {endNode?.label}
                  </span>
                  <span className="text-gray-500">{pipe.length.toFixed(0)}m</span>
                </div>
                <div className="text-gray-400 mt-0.5">⌀{pipe.diameter}mm | {pipe.material}</div>
              </div>
            );
          })}
          {pipes.length === 0 && <p className="text-xs text-gray-400">Belum ada pipa</p>}
        </div>
      </div>
    </div>
  );
}

function ResultsTab({ nodes, pipes, pumps: _pumps }: { nodes: PipeNode[]; pipes: Pipe[]; pumps: Pump[] }) {
  const hasResults = pipes.some(p => p.flowRate !== undefined);

  if (!hasResults) {
    return (
      <div className="text-center text-gray-400 py-12">
        <div className="text-4xl mb-3">📊</div>
        <p className="text-sm font-medium">Belum ada hasil analisis</p>
        <p className="text-xs mt-1">Klik "Analisis Hidrolik" untuk menjalankan</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wide">Hasil Analisis Pipa</h4>
      <div className="space-y-2">
        {pipes.map(pipe => {
          const startNode = nodes.find(n => n.id === pipe.startNodeId);
          const endNode = nodes.find(n => n.id === pipe.endNodeId);
          const velocityOk = (pipe.velocity || 0) >= 0.3 && (pipe.velocity || 0) <= 3.0;

          return (
            <div key={pipe.id} className="bg-gray-50 p-3 rounded-lg text-xs space-y-1">
              <div className="font-bold text-gray-700">{startNode?.label} → {endNode?.label}</div>
              <div className="grid grid-cols-2 gap-1 text-gray-500">
                <span>Debit: <b className="text-gray-700">{pipe.flowRate?.toFixed(3)} L/s</b></span>
                <span>
                  Kecepatan: <b className={velocityOk ? 'text-green-700' : 'text-red-700'}>
                    {pipe.velocity?.toFixed(3)} m/s
                  </b>
                </span>
                <span>Headloss: <b className="text-gray-700">{pipe.headloss?.toFixed(3)} m</b></span>
                <span>Panjang: <b className="text-gray-700">{pipe.length.toFixed(0)} m</b></span>
              </div>
            </div>
          );
        })}
      </div>

      <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wide mt-4">Hasil Analisis Node</h4>
      <div className="space-y-2">
        {nodes.filter(n => n.pressure !== undefined).map(node => (
          <div key={node.id} className="bg-gray-50 p-3 rounded-lg text-xs space-y-1">
            <div className="font-bold text-gray-700">
              {node.label}
              {node.accessories.length > 0 && (
                <span className="ml-1 text-orange-500 font-normal">
                  {node.accessories.map(a => ACCESSORY_CATALOG.find(c => c.type === a.type)?.icon).join('')}
                </span>
              )}
            </div>
            <div className="text-gray-500">
              Elevasi: <b className="text-gray-700">{node.elevation.toFixed(1)} mdpl</b> |
              Tekanan: <b className={`${(node.pressure || 0) > 0 ? 'text-green-700' : 'text-red-700'}`}>
                {node.pressure?.toFixed(2)} bar
              </b>
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="bg-gray-50 p-3 rounded-lg">
        <h5 className="text-xs font-bold text-gray-600 mb-2">Legenda Warna Pipa</h5>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-1 bg-green-500 rounded"></div>
            <span>Kecepatan normal (0.3-3.0 m/s)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-1 bg-red-500 rounded"></div>
            <span>Kecepatan terlalu rendah (&lt;0.3 m/s)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-1 bg-amber-500 rounded"></div>
            <span>Kecepatan terlalu tinggi (&gt;3.0 m/s)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
