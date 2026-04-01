import { useState } from 'react';

interface PumpDialogProps {
    isOpen: boolean;
    startNodeLabel: string;
    endNodeLabel: string;
    onConfirm: (designFlow: number, designHead: number, speed: number) => void;
    onCancel: () => void;
}

export function PumpDialog({
    isOpen,
    startNodeLabel,
    endNodeLabel,
    onConfirm,
    onCancel,
}: PumpDialogProps) {
    const [designFlow, setDesignFlow] = useState(5); // L/s default
    const [designHead, setDesignHead] = useState(30); // m default
    const [speed, setSpeed] = useState(1.0); // 100% default

    if (!isOpen) return null;

    // Preview pump curve (3-point: shutoff, design, maxflow)
    const shutoffHead = 1.33 * designHead;
    const maxFlow = 2.0 * designFlow;

    // Generate preview points for the curve chart
    const curvePoints: { q: number; h: number }[] = [];
    if (designFlow > 0 && designHead > 0) {
        const B = 1.852;
        const A = (shutoffHead - designHead) / Math.pow(designFlow, B);
        for (let i = 0; i <= 20; i++) {
            const q = (maxFlow * i) / 20;
            const h = Math.max(0, shutoffHead - A * Math.pow(q, B));
            curvePoints.push({ q, h });
        }
    }

    // SVG chart dimensions
    const chartW = 260;
    const chartH = 120;
    const padL = 35;
    const padB = 20;
    const padT = 10;
    const padR = 10;
    const plotW = chartW - padL - padR;
    const plotH = chartH - padT - padB;

    const maxQ = maxFlow > 0 ? maxFlow * 1.1 : 10;
    const maxH = shutoffHead > 0 ? shutoffHead * 1.15 : 40;

    const toX = (q: number) => padL + (q / maxQ) * plotW;
    const toY = (h: number) => padT + plotH - (h / maxH) * plotH;

    const pathD = curvePoints
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.q).toFixed(1)},${toY(p.h).toFixed(1)}`)
        .join(' ');

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[3000]">
            <div className="bg-white rounded-2xl shadow-2xl w-[420px] overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-3">
                    <h3 className="text-white font-bold text-base">⚡ Tambah Pompa</h3>
                    <p className="text-amber-100 text-xs mt-0.5">
                        {startNodeLabel} → {endNodeLabel} (EPANET-style pump link)
                    </p>
                </div>

                <div className="p-5 space-y-4">
                    {/* Design Flow */}
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                            Design Flow (Debit Desain)
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                step="0.1"
                                min="0.01"
                                value={designFlow}
                                onChange={(e) => setDesignFlow(parseFloat(e.target.value) || 0)}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                            />
                            <span className="text-xs text-gray-500 font-medium w-8">L/s</span>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">Debit air pada titik operasi desain</p>
                    </div>

                    {/* Design Head */}
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                            Design Head (Head Desain)
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                step="0.5"
                                min="0.1"
                                value={designHead}
                                onChange={(e) => setDesignHead(parseFloat(e.target.value) || 0)}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                            />
                            <span className="text-xs text-gray-500 font-medium w-8">m</span>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">Head yang ditambahkan pompa pada titik desain</p>
                    </div>

                    {/* Speed */}
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                            Kecepatan Relatif
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="range"
                                min="0.1"
                                max="1.5"
                                step="0.05"
                                value={speed}
                                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                                className="flex-1 accent-amber-500"
                            />
                            <span className="text-sm font-bold text-amber-700 w-14 text-right">
                                {(speed * 100).toFixed(0)}%
                            </span>
                        </div>
                    </div>

                    {/* Pump Curve Preview */}
                    <div className="bg-gray-50 p-3 rounded-lg">
                        <label className="block text-xs font-bold text-gray-600 mb-2">📈 Kurva Pompa (H-Q)</label>
                        <svg width={chartW} height={chartH} className="mx-auto">
                            {/* Grid lines */}
                            <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="#e5e7eb" strokeWidth={1} />
                            <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="#e5e7eb" strokeWidth={1} />

                            {/* Y axis ticks */}
                            {[0, 0.25, 0.5, 0.75, 1].map(frac => {
                                const y = padT + plotH * (1 - frac);
                                const val = (maxH * frac).toFixed(0);
                                return (
                                    <g key={frac}>
                                        <line x1={padL - 3} y1={y} x2={padL + plotW} y2={y} stroke="#f3f4f6" strokeWidth={0.5} />
                                        <text x={padL - 5} y={y + 3} textAnchor="end" fontSize={8} fill="#9ca3af">{val}</text>
                                    </g>
                                );
                            })}

                            {/* X axis ticks */}
                            {[0, 0.25, 0.5, 0.75, 1].map(frac => {
                                const x = padL + plotW * frac;
                                const val = (maxQ * frac).toFixed(1);
                                return (
                                    <g key={frac}>
                                        <line x1={x} y1={padT} x2={x} y2={padT + plotH + 3} stroke="#f3f4f6" strokeWidth={0.5} />
                                        <text x={x} y={chartH - 2} textAnchor="middle" fontSize={8} fill="#9ca3af">{val}</text>
                                    </g>
                                );
                            })}

                            {/* Curve */}
                            {pathD && (
                                <path d={pathD} fill="none" stroke="#f59e0b" strokeWidth={2.5} strokeLinecap="round" />
                            )}

                            {/* Design point */}
                            <circle cx={toX(designFlow)} cy={toY(designHead)} r={4} fill="#ef4444" stroke="#fff" strokeWidth={1.5} />
                            <text x={toX(designFlow) + 6} y={toY(designHead) - 4} fontSize={8} fill="#ef4444" fontWeight="bold">
                                Desain
                            </text>

                            {/* Axis labels */}
                            <text x={padL + plotW / 2} y={chartH + 1} textAnchor="middle" fontSize={9} fill="#6b7280">Q (L/s)</text>
                            <text x={4} y={padT + plotH / 2} textAnchor="middle" fontSize={9} fill="#6b7280"
                                transform={`rotate(-90, 4, ${padT + plotH / 2})`}>H (m)</text>
                        </svg>

                        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[10px]">
                            <div className="bg-white p-1.5 rounded">
                                <div className="text-gray-500">Shutoff Head</div>
                                <div className="font-bold text-amber-700">{shutoffHead.toFixed(1)} m</div>
                            </div>
                            <div className="bg-white p-1.5 rounded">
                                <div className="text-gray-500">Design Point</div>
                                <div className="font-bold text-red-600">{designFlow} L/s @ {designHead} m</div>
                            </div>
                            <div className="bg-white p-1.5 rounded">
                                <div className="text-gray-500">Max Flow</div>
                                <div className="font-bold text-amber-700">{maxFlow.toFixed(1)} L/s</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-3 bg-gray-50 flex justify-end gap-2 border-t border-gray-200">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-200 transition-all"
                    >
                        Batal
                    </button>
                    <button
                        onClick={() => onConfirm(designFlow, designHead, speed)}
                        disabled={designFlow <= 0 || designHead <= 0}
                        className="px-5 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-all shadow-sm"
                    >
                        ⚡ Buat Pompa
                    </button>
                </div>
            </div>
        </div>
    );
}
