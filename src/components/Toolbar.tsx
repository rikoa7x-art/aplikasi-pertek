import { useState, useRef, useEffect } from 'react';
import { ACCESSORY_CATALOG } from '../types';
import type { DrawMode, AccessoryType } from '../types';

interface ToolbarProps {
  drawMode: DrawMode;
  onSetDrawMode: (mode: DrawMode) => void;
  onRunAnalysis: () => void;
  onClearAll: () => void;
  onExport: () => void;
  onExportINP: () => void;
  onImport: () => void;
  onSaveProject: () => void;
  isAnalyzing: boolean;
  hideJunctions: boolean;
  onToggleHideJunctions: () => void;
  selectedAccessoryType: AccessoryType;
  onSelectAccessoryType: (type: AccessoryType) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onZoomToFit: () => void;
  onShowShortcuts: () => void;
  onPrintResults: () => void;
}

const tools: { mode: DrawMode; label: string; icon: string; shortLabel: string; description: string }[] = [
  { mode: 'select', label: 'Pilih / Geser', shortLabel: 'Pilih', icon: '🖱️', description: 'Pilih & geser node di peta' },
  { mode: 'reservoir', label: 'Reservoir', shortLabel: 'Reservoir', icon: '💧', description: 'Klik peta untuk menempatkan sumber air' },
  { mode: 'node', label: 'Junction', shortLabel: 'Junction', icon: '⚬', description: 'Klik peta untuk menempatkan titik distribusi' },
  { mode: 'tank', label: 'Tanki', shortLabel: 'Tanki', icon: '🏗️', description: 'Klik peta untuk menempatkan tanki' },
  { mode: 'pump', label: 'Pompa', shortLabel: 'Pompa', icon: '⚡', description: 'Klik peta untuk menempatkan pompa' },
  { mode: 'pipe', label: 'Gambar Pipa', shortLabel: 'Pipa', icon: '🔗', description: 'Klik node awal → klik node tujuan' },
];

export function Toolbar({
  drawMode,
  onSetDrawMode,
  onRunAnalysis,
  onClearAll,
  onExport,
  onExportINP,
  onImport,
  onSaveProject,
  isAnalyzing,
  hideJunctions,
  onToggleHideJunctions,
  selectedAccessoryType,
  onSelectAccessoryType,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onZoomToFit,
  onShowShortcuts,
  onPrintResults,
}: ToolbarProps) {
  const [showAccessoryDropdown, setShowAccessoryDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowAccessoryDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedAccInfo = ACCESSORY_CATALOG.find(a => a.type === selectedAccessoryType);
  const categories = Array.from(new Set(ACCESSORY_CATALOG.map(a => a.category)));

  return (
    <div className="toolbar-glass px-3 py-2 flex items-center gap-1 flex-wrap shadow-sm">
      {/* Drawing tools */}
      <div className="flex items-center gap-1 border-r border-gray-200/70 pr-3 mr-2">
        {tools.map(tool => (
          <button
            key={tool.mode}
            onClick={() => onSetDrawMode(tool.mode)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all
              ${drawMode === tool.mode
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 scale-[1.03] ring-2 ring-blue-400/30'
                : 'bg-gray-50/80 text-gray-700 hover:bg-gray-100 hover:shadow-sm'
              }`}
            title={tool.description}
          >
            <span className="text-base">{tool.icon}</span>
            <span className="hidden xl:inline">{tool.label}</span>
            <span className="hidden lg:inline xl:hidden">{tool.shortLabel}</span>
          </button>
        ))}

        {/* Accessory tool with dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => {
              onSetDrawMode('accessory');
              setShowAccessoryDropdown(!showAccessoryDropdown);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all
              ${drawMode === 'accessory'
                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25 scale-[1.03] ring-2 ring-orange-400/30'
                : 'bg-gray-50/80 text-gray-700 hover:bg-gray-100 hover:shadow-sm'
              }`}
            title="Klik pada pipa untuk menambahkan aksesoris (Valve, Tee, dll)"
          >
            <span className="text-base">🔧</span>
            <span className="hidden xl:inline">Aksesoris</span>
            <span className="hidden lg:inline xl:hidden">Aks.</span>
            <span className="text-[10px] ml-1 opacity-75">{selectedAccInfo?.icon}</span>
            <svg className="w-3 h-3 ml-0.5" viewBox="0 0 12 12" fill="currentColor">
              <path d="M3 5l3 3 3-3H3z" />
            </svg>
          </button>

          {/* Accessory Dropdown */}
          {showAccessoryDropdown && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-white/95 backdrop-blur-lg rounded-xl shadow-2xl border border-gray-200/50 z-[2000] overflow-hidden animate-slideDown">
              <div className="px-3 py-2 bg-orange-50 border-b border-orange-100">
                <p className="text-xs font-semibold text-orange-800">Pilih Jenis Aksesoris</p>
                <p className="text-[10px] text-orange-600">Lalu klik pada garis pipa di peta</p>
              </div>
              <div className="max-h-80 overflow-y-auto p-2">
                {categories.map(category => (
                  <div key={category} className="mb-2">
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 mb-1">{category}</h4>
                    {ACCESSORY_CATALOG.filter(a => a.category === category).map(acc => (
                      <button
                        key={acc.type}
                        onClick={() => {
                          onSelectAccessoryType(acc.type);
                          onSetDrawMode('accessory');
                          setShowAccessoryDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center gap-2 ${selectedAccessoryType === acc.type
                          ? 'bg-orange-100 text-orange-800 font-medium'
                          : 'hover:bg-gray-50 text-gray-700'
                          }`}
                      >
                        <span className="text-lg">{acc.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{acc.name}</div>
                          <div className="text-[10px] text-gray-500 truncate">{acc.description}</div>
                        </div>
                        {selectedAccessoryType === acc.type && (
                          <span className="text-orange-500 text-xs">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Delete tool */}
        <button
          onClick={() => onSetDrawMode('delete')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all
            ${drawMode === 'delete'
              ? 'bg-red-600 text-white shadow-md shadow-red-500/25 scale-[1.03] ring-2 ring-red-400/30'
              : 'bg-gray-50/80 text-gray-700 hover:bg-gray-100 hover:shadow-sm'
            }`}
          title="Klik node/pipa untuk menghapus"
        >
          <span className="text-base">🗑️</span>
          <span className="hidden xl:inline">Hapus</span>
          <span className="hidden lg:inline xl:hidden">Hapus</span>
        </button>

        {/* Hide junctions toggle */}
        <button
          onClick={onToggleHideJunctions}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all
            ${hideJunctions
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
              : 'bg-gray-50/80 text-gray-700 hover:bg-gray-100 hover:shadow-sm'
            }`}
          title={hideJunctions ? 'Tampilkan junction' : 'Sembunyikan junction'}
        >
          <span className="text-base">{hideJunctions ? '👁️‍🗨️' : '👁️'}</span>
          <span className="hidden xl:inline">{hideJunctions ? 'Tampilkan' : 'Sembunyikan'}</span>
        </button>
      </div>

      {/* Undo / Redo / Zoom / Shortcuts */}
      <div className="flex items-center gap-1 border-r border-gray-200/70 pr-3 mr-2">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-sm font-medium bg-gray-50/80 text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          title="Undo (Ctrl+Z)"
        >
          <span className="text-base">↩️</span>
          <span className="hidden xl:inline">Undo</span>
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-sm font-medium bg-gray-50/80 text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          title="Redo (Ctrl+Y)"
        >
          <span className="text-base">↪️</span>
          <span className="hidden xl:inline">Redo</span>
        </button>
        <button
          onClick={onZoomToFit}
          className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-sm font-medium bg-gray-50/80 text-gray-700 hover:bg-gray-100 hover:shadow-sm transition-all"
          title="Zoom ke semua node"
        >
          <span className="text-base">🗺️</span>
          <span className="hidden xl:inline">Zoom Fit</span>
        </button>
        <button
          onClick={onShowShortcuts}
          className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-sm font-medium bg-gray-50/80 text-gray-700 hover:bg-gray-100 hover:shadow-sm transition-all"
          title="Keyboard Shortcuts"
        >
          <span className="text-base">⌨️</span>
        </button>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onRunAnalysis}
          disabled={isAnalyzing}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-all shadow-md shadow-green-600/20 hover:shadow-green-600/30"
        >
          <span>▶️</span>
          <span className="hidden md:inline">{isAnalyzing ? 'Menganalisis...' : 'Analisis Hidrolik'}</span>
        </button>

        <button
          onClick={onPrintResults}
          className="flex items-center gap-1.5 px-3 py-2 bg-amber-100 text-amber-700 rounded-xl text-sm font-medium hover:bg-amber-200 transition-all"
          title="Cetak hasil analisis hidrolik"
        >
          <span>🖨️</span>
          <span className="hidden md:inline">Cetak</span>
        </button>

        <div className="border-l border-gray-200/70 pl-1.5 ml-1 flex items-center gap-1">
          <button
            onClick={onSaveProject}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-100 text-blue-700 rounded-xl text-sm font-medium hover:bg-blue-200 transition-all"
            title="Simpan proyek (JSON dengan nama proyek)"
          >
            <span>💾</span>
            <span className="hidden md:inline">Save</span>
          </button>

          <button
            onClick={onExport}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-100 text-indigo-700 rounded-xl text-sm font-medium hover:bg-indigo-200 transition-all"
            title="Export jaringan ke file JSON"
          >
            <span>📤</span>
            <span className="hidden md:inline">Export</span>
          </button>

          <button
            onClick={onExportINP}
            className="flex items-center gap-1.5 px-3 py-2 bg-teal-100 text-teal-700 rounded-xl text-sm font-medium hover:bg-teal-200 transition-all"
            title="Export ke format EPANET (.inp)"
          >
            <span>🔬</span>
            <span className="hidden md:inline">EPANET</span>
          </button>

          <button
            onClick={onImport}
            className="flex items-center gap-1.5 px-3 py-2 bg-purple-100 text-purple-700 rounded-xl text-sm font-medium hover:bg-purple-200 transition-all"
            title="Import dari file JSON atau EPANET (.inp)"
          >
            <span>📂</span>
            <span className="hidden md:inline">Import</span>
          </button>

          <button
            onClick={onClearAll}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-100 text-red-700 rounded-xl text-sm font-medium hover:bg-red-200 transition-all"
            title="Hapus semua node dan pipa"
          >
            <span>🧹</span>
            <span className="hidden md:inline">Hapus Semua</span>
          </button>
        </div>
      </div>
    </div>
  );
}
