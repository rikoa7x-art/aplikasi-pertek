import { useState, useEffect } from 'react';
import { ACCESSORY_CATALOG } from '../types';
import type { AccessoryType } from '../types';

interface AccessoryDialogProps {
  isOpen: boolean;
  selectedType: AccessoryType;
  pipeDiameter: number;
  elevation: number;
  onConfirm: (accessoryType: AccessoryType, label: string, diameter?: number) => void;
  onCancel: () => void;
}

export function AccessoryDialog({
  isOpen,
  selectedType,
  pipeDiameter,
  elevation,
  onConfirm,
  onCancel,
}: AccessoryDialogProps) {
  const [chosenType, setChosenType] = useState<AccessoryType>(selectedType);
  const [customLabel, setCustomLabel] = useState('');
  const [diameter, setDiameter] = useState(pipeDiameter);

  useEffect(() => {
    if (isOpen) {
      setChosenType(selectedType);
      setDiameter(pipeDiameter);
      const info = ACCESSORY_CATALOG.find(a => a.type === selectedType);
      setCustomLabel(info?.name || '');
    }
  }, [isOpen, selectedType, pipeDiameter]);

  if (!isOpen) return null;

  const chosenInfo = ACCESSORY_CATALOG.find(a => a.type === chosenType);

  // Group accessories by category
  const categories = Array.from(new Set(ACCESSORY_CATALOG.map(a => a.category)));

  return (
    <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-4">
          <h2 className="text-lg font-bold text-white">🔧 Tambah Aksesoris Pipa</h2>
          <p className="text-orange-100 text-sm mt-1">Pilih jenis aksesoris — pipa akan dipecah di titik ini</p>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Info */}
          <div className="bg-blue-50 p-3 rounded-lg text-sm space-y-1">
            <p className="text-blue-700">
              📐 Elevasi titik: <b>{elevation.toFixed(1)} mdpl</b>
            </p>
            <p className="text-blue-700">
              🔗 Diameter pipa: <b>{pipeDiameter} mm</b>
            </p>
            <p className="text-blue-500 text-xs mt-2">
              ℹ️ Pipa akan dipecah menjadi 2 segmen di titik ini. Junction baru akan dibuat sebagai titik koneksi.
            </p>
          </div>

          {/* Accessory Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Jenis Aksesoris</label>
            {categories.map(category => (
              <div key={category} className="mb-3">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">{category}</h4>
                <div className="grid grid-cols-2 gap-1.5">
                  {ACCESSORY_CATALOG.filter(a => a.category === category).map(acc => (
                    <button
                      key={acc.type}
                      onClick={() => {
                        setChosenType(acc.type);
                        setCustomLabel(acc.name);
                      }}
                      className={`text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-start gap-2 ${
                        chosenType === acc.type
                          ? 'bg-orange-100 border-2 border-orange-500 text-orange-800 font-medium'
                          : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                      }`}
                    >
                      <span className="text-lg flex-shrink-0">{acc.icon}</span>
                      <div>
                        <div className="font-medium text-sm">{acc.name}</div>
                        <div className="text-xs text-gray-500 leading-tight">{acc.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Custom Label */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Label Aksesoris</label>
            <input
              type="text"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              placeholder="Nama aksesoris..."
            />
          </div>

          {/* Diameter (for reducers) */}
          {chosenType === 'reducer' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Diameter Setelah Reducer (mm)</label>
              <select
                value={diameter}
                onChange={(e) => setDiameter(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
              >
                {[25, 32, 40, 50, 63, 75, 90, 100, 110, 150, 160, 200, 250, 300, 315, 400, 500].map(d => (
                  <option key={d} value={d}>{d} mm{d === pipeDiameter ? ' (sama)' : ''}</option>
                ))}
              </select>
            </div>
          )}

          {/* Summary */}
          <div className="bg-orange-50 p-4 rounded-lg">
            <h4 className="font-bold text-orange-800 text-sm mb-2">Ringkasan</h4>
            <div className="text-sm text-orange-700 space-y-1">
              <p>{chosenInfo?.icon} <b>{customLabel || chosenInfo?.name}</b></p>
              <p className="text-xs text-orange-600">
                → Junction baru akan dibuat di titik ini<br />
                → Pipa dipecah menjadi 2 segmen<br />
                → Anda bisa menghubungkan pipa baru dari junction ini
              </p>
              {(chosenType === 'tee' || chosenType === 'cross') && (
                <p className="text-xs text-green-700 font-medium mt-1">
                  💡 Tip: Setelah Tee/Cross dipasang, gunakan tool Pipa 🔗 untuk menghubungkan pipa cabang baru dari junction ini.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2 p-6 pt-0 border-t border-gray-100">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-all"
          >
            Batal
          </button>
          <button
            onClick={() => onConfirm(chosenType, customLabel || chosenInfo?.name || '', chosenType === 'reducer' ? diameter : undefined)}
            className="flex-1 px-4 py-2.5 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-all shadow-lg"
          >
            {chosenInfo?.icon} Pasang Aksesoris
          </button>
        </div>
      </div>
    </div>
  );
}
