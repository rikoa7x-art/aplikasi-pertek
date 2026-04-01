interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
    onCancel: () => void;
}

const variantStyles = {
    danger: {
        header: 'bg-gradient-to-r from-red-500 to-rose-500',
        icon: '🗑️',
        confirmBtn: 'bg-red-600 hover:bg-red-700',
        headerText: 'text-red-100',
    },
    warning: {
        header: 'bg-gradient-to-r from-amber-500 to-orange-500',
        icon: '⚠️',
        confirmBtn: 'bg-amber-600 hover:bg-amber-700',
        headerText: 'text-amber-100',
    },
    info: {
        header: 'bg-gradient-to-r from-blue-500 to-cyan-500',
        icon: 'ℹ️',
        confirmBtn: 'bg-blue-600 hover:bg-blue-700',
        headerText: 'text-blue-100',
    },
};

export function ConfirmDialog({
    isOpen,
    title,
    message,
    confirmLabel = 'Ya, Lanjutkan',
    cancelLabel = 'Batal',
    variant = 'danger',
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    if (!isOpen) return null;

    const styles = variantStyles[variant];

    return (
        <div
            className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4 animate-fadeIn"
            onClick={onCancel}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-scaleIn"
                onClick={(e) => e.stopPropagation()}
            >
                <div className={`${styles.header} px-6 py-4`}>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        {styles.icon} {title}
                    </h2>
                </div>
                <div className="p-6">
                    <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
                </div>
                <div className="flex gap-2 px-6 pb-6">
                    <button
                        onClick={onCancel}
                        className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-all"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`flex-1 px-4 py-2.5 ${styles.confirmBtn} text-white rounded-lg font-medium transition-all shadow-lg`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
