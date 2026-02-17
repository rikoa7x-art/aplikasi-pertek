import type { DrawMode } from '../types';

interface StatusBarProps {
  drawMode: DrawMode;
  nodeCount: number;
  pipeCount: number;
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
  pump: '⚡ Mode: Pompa — Klik pada peta untuk menempatkan pompa',
  delete: '🗑️ Mode: Hapus — Klik node atau pipa untuk menghapus',
  accessory: '🔧 Mode: Aksesoris — Klik pada garis pipa untuk menambah Valve/Tee/Fitting',
};

export function StatusBar({ drawMode, nodeCount, pipeCount, mousePosition, statusMessage, accessoryCount }: StatusBarProps) {
  return (
    <div className="bg-gray-800 text-gray-300 px-4 py-1.5 flex items-center justify-between text-xs">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <span className="font-medium text-blue-300 truncate">{modeLabels[drawMode]}</span>
        {statusMessage && (
          <span className="text-yellow-300 font-medium flex-shrink-0">{statusMessage}</span>
        )}
      </div>
      <div className="flex items-center gap-4 flex-shrink-0">
        <span>Node: <b className="text-white">{nodeCount}</b></span>
        <span>Pipa: <b className="text-white">{pipeCount}</b></span>
        {accessoryCount > 0 && (
          <span>Aksesoris: <b className="text-orange-300">{accessoryCount}</b></span>
        )}
        {mousePosition && (
          <span>
            {mousePosition.lat.toFixed(6)}, {mousePosition.lng.toFixed(6)}
          </span>
        )}
      </div>
    </div>
  );
}
