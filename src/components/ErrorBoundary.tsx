import { Component, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('🚨 ErrorBoundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-8">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
                        <div className="bg-gradient-to-r from-red-500 to-orange-500 px-6 py-5">
                            <h1 className="text-white font-bold text-xl flex items-center gap-2">
                                ⚠️ Terjadi Kesalahan
                            </h1>
                            <p className="text-red-100 text-sm mt-1">Aplikasi mengalami error yang tidak terduga</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                <p className="text-sm font-mono text-red-800 break-all">
                                    {this.state.error?.message || 'Unknown error'}
                                </p>
                            </div>
                            <p className="text-sm text-gray-600">
                                Silakan muat ulang halaman untuk melanjutkan. Jika masalah berlanjut,
                                coba hapus data browser (cache/localStorage) dan muat ulang.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => window.location.reload()}
                                    className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all shadow-sm"
                                >
                                    🔄 Muat Ulang Halaman
                                </button>
                                <button
                                    onClick={() => this.setState({ hasError: false, error: null })}
                                    className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-all"
                                >
                                    Coba Lagi
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
