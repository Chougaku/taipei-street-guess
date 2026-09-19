import { create } from 'zustand';

interface ToastItem {
  id: number;
  text: string;
}

const useToasts = create<{ items: ToastItem[] }>(() => ({ items: [] }));
let nextId = 1;

export function toast(text: string, ms = 3000) {
  const id = nextId++;
  useToasts.setState((s) => ({ items: [...s.items, { id, text }] }));
  setTimeout(() => useToasts.setState((s) => ({ items: s.items.filter((i) => i.id !== id) })), ms);
}

export function Toaster() {
  const items = useToasts((s) => s.items);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(var(--sat),1rem)] z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {items.map((i) => (
        <div key={i.id} className="animate-fade-up rounded-xl bg-panel-2 px-4 py-2.5 text-sm font-semibold shadow-2xl ring-1 ring-line">
          {i.text}
        </div>
      ))}
    </div>
  );
}
