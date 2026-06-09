interface Props {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  alertOnly?: boolean   // single OK button, no cancel
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  destructive = false,
  alertOnly = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40"
      onClick={alertOnly ? onConfirm : onCancel}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        {title && <p className="text-gray-900 dark:text-gray-100 font-semibold text-base">{title}</p>}
        <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{message}</p>
        <div className="flex gap-3">
          {!alertOnly && (
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 active:bg-gray-300 dark:active:bg-gray-600 transition-colors"
            >
              {cancelLabel}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-xl text-white text-sm font-medium transition-colors ${
              destructive
                ? 'bg-red-500 hover:bg-red-600 active:bg-red-700'
                : 'bg-brand-500 hover:bg-brand-600 active:bg-brand-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
