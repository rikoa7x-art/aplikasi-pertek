import type { DrawMode } from '../types';

interface StatusBarProps {
  drawMode: DrawMode;
  nodeCount: number;
  pipeCount: number;
  pumpCount: number;
  mousePosition: { lat: number; lng: number } | null;
  statusMessage: string;
  accessoryCount: number;
}

const modeLabels: Record<DrawMode, string> = {
  select: '🖱️ Mode: Pilih & Geser — Klik node untuk memilih, drag untuk memindahkan',
  node: '⚬ Mode: Junction — Klik pada peta untuk menempatkan titik distribusi',
  pipe: '🔗 Mode: Pipa — Klik node pertama, lalu klik node kedua untuk membuat pipa',
  reservoir: '💧 Mode: Reservoir — Klik pada peta untuk menempatkan sumber air',
  tank: '🏗️ Mode: Tanki — Klik pada peta untuk menempatkan tanki penyimpanan',
  pump: '⚡ Mode: Pompa — Klik node suction, lalu node discharge untuk menambah pompa',
  delete: '🗑️ Mode: Hapus — Klik node atau pipa untuk menghapus',
  accessory: '🔧 Mode: Aksesoris — Klik pada garis pipa untuk menambah Valve/Tee/Fitting',
};

const modeColors: Record<DrawMode, string> = {
  select: 'text-blue-300',
  node: 'text-blue-300',
  pipe: 'text-cyan-300',
  reservoir: 'text-emerald-300',
  tank: 'text-purple-300',
  pump: 'text-amber-300',
  delete: 'text-red-300',
  accessory: 'text-orange-300',
};

export function StatusBar({ drawMode, nodeCount, pipeCount, pumpCount, mousePosition, statusMessage, accessoryCount }: StatusBarProps) {
  return (
    <div className="bg-gradient-to-r from-gray-800 to-gray-900 text-gray-300 px-4 py-1.5 flex items-center justify-between text-xs">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <span className={`font-medium truncate ${modeColors[drawMode]}`}>{modeLabels[drawMode]}</span>
        {statusMessage && (
          <span className="text-yellow-300 font-medium flex-shrink-0 status-message-enter">{statusMessage}</span>
        )}
      </div>
      <div className="flex items-center gap-4 flex-shrink-0">
        <span>Node: <b className="text-white">{nodeCount}</b></span>
        <span>Pipa: <b className="text-white">{pipeCount}</b></span>
        {pumpCount > 0 && (
          <span>Pompa: <b className="text-amber-300">{pumpCount}</b></span>
        )}
        {accessoryCount > 0 && (
          <span>Aksesoris: <b className="text-orange-300">{accessoryCount}</b></span>
        )}
        {mousePosition && (
          <span className="text-gray-400 font-mono text-[10px]">
            {mousePosition.lat.toFixed(6)}, {mousePosition.lng.toFixed(6)}
          </span>
        )}
      </div>
    </div>
  );
}
