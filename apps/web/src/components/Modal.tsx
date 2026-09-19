import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from './icons.tsx';

export function Modal({ open, onClose, title, children }: { open: boolean; onClose(): void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card max-h-[90dvh] w-full max-w-md animate-fade-up overflow-y-auto rounded-b-none p-5 safe-bottom sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black">{title}</h2>
          <button className="btn-ghost -mr-2 p-2" onClick={onClose} aria-label="close">
            <IconClose />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
