import { useState, useEffect } from 'react';
import { PIPE_MATERIALS } from '../utils/calculations';

interface PipeDialogProps {
  isOpen: boolean;
  straightLength: number;
  routeLength: number;
  elevationDiff: number;
  startNodeLabel: string;
  endNodeLabel: string;
  routeSuccess: boolean;
  onConfirm: (diameter: number, material: string, roughness: number) => void;
  onCancel: () => void;
}

export function PipeDialog({
  isOpen,
  straightLength,
  routeLength,
  elevationDiff,
  startNodeLabel,
  endNodeLabel,
  routeSuccess,
  onConfirm,
  onCancel,
}: PipeDialogProps) {
  const [selectedMaterialIdx, setSelectedMaterialIdx] = useState(0);
  const [selectedDiameter, setSelectedDiameter] = useState(PIPE_MATERIALS[0].diameters[2]);

  // Reset when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedMaterialIdx(0);
      setSelectedDiameter(PIPE_MATERIALS[0].diameters[2]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedMaterial = PIPE_MATERIALS[selectedMaterialIdx];
  const routeRatio = straightLength > 0 ? ((routeLength / straightLength) * 100).toFixed(0) : '100';

  return (
    <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
          <h2 className="text-lg font-bold text-white">🔗 Properti Pipa Baru</h2>
          <p className="text-blue-200 text-sm mt-1">{startNodeLabel} → {endNodeLabel}</p>
        </div>

        <div className="p-6 space-y-4">
          {/* Route Info */}
          <div className="bg-blue-50 p-4 rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              {routeSuccess ? (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">
                  🛣️ Jalur Jalan Ditemukan
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full font-medium">
                  📏 Garis Lurus (routing gagal)
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-blue-500 text-xs font-medium">🛣️ Jarak Jalur Jalan</span>
                <p className="font-bold text-blue-800 text-lg">{routeLength.toFixed(1)} m</p>
              </div>
              <div>
                <span className="text-blue-500 text-xs font-medium">📏 Garis Lurus</span>
                <p className="font-bold text-blue-800 text-lg">{straightLength.toFixed(1)} m</p>
              </div>
            </div>

            {routeSuccess && (
              <div className="text-xs text-blue-600">
                Rasio jalur: <b>{routeRatio}%</b> dari garis lurus
                {routeLength > straightLength * 1.5 && (
                  <span className="text-amber-600 ml-1">(jalur cukup berliku)</span>
                )}
              </div>
            )}

            <div className="pt-2 border-t border-blue-200">
              <span className="text-blue-500 text-xs font-medium">📐 Beda Elevasi</span>
              <p className="font-bold text-blue-800 text-lg">{elevationDiff.toFixed(1)} m</p>
            </div>
          </div>

          {/* Material */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Material Pipa</label>
            <div className="grid grid-cols-1 gap-1">
              {PIPE_MATERIALS.map((mat, idx) => (
                <button
                  key={mat.name}
                  onClick={() => {
                    setSelectedMaterialIdx(idx);
                    setSelectedDiameter(mat.diameters[2] || mat.diameters[0]);
                  }}
                  className={`text-left px-3 py-2.5 rounded-lg text-sm transition-all ${
                    selectedMaterialIdx === idx
                      ? 'bg-blue-100 border-2 border-blue-500 text-blue-800 font-medium'
                      : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                  }`}
                >
                  <span className="font-medium">{mat.name}</span>
                  <span className="text-xs text-gray-500 ml-2">(C = {mat.roughness})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Diameter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Diameter Pipa</label>
            <div className="flex flex-wrap gap-1.5">
              {selectedMaterial.diameters.map(d => (
                <button
                  key={d}
                  onClick={() => setSelectedDiameter(d)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    selectedDiameter === d
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {d} mm
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-600">
            <p><b>Ringkasan:</b> {selectedMaterial.name}, ⌀{selectedDiameter}mm, C={selectedMaterial.roughness}</p>
            <p className="text-xs mt-1">Panjang pipa: <b>{routeLength.toFixed(0)}m</b> (mengikuti jalur jalan)</p>
          </div>
        </div>

        <div className="flex gap-2 p-6 pt-0">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-all"
          >
            Batal
          </button>
          <button
            onClick={() => onConfirm(selectedDiameter, selectedMaterial.name, selectedMaterial.roughness)}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all shadow-lg"
          >
            ✅ Buat Pipa
          </button>
        </div>
      </div>
    </div>
  );
}
