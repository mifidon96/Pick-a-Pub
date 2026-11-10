// A failed load: what happened, and a way to try again.
export default function ErrorNotice({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-4">
      <div className="flex items-start gap-2.5">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="mt-px shrink-0 text-red-700">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6M12 16.5v.5" />
        </svg>
        <div>
          <p className="font-bold">{title}</p>
          <p className="mt-1 text-sm text-red-800">{message}</p>
        </div>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-pitch font-bold text-on-pitch hover:bg-pitch-dark">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <path d="M20 12a8 8 0 1 1-2.3-5.7" />
            <path d="M20 4v5h-5" />
          </svg>
          Try again
        </button>
      )}
    </div>
  );
}
