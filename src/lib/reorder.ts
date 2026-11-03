import { useRef, useState } from "react";

/** Drag-to-reorder for a list whose rows carry `data-reorder-row`: drag a row by its handle (mouse or touch), or
 *  focus the handle and use the arrow keys. `to` is the index the row lands on, as `reorderOps` expects. */
export function useReorder(count: number, onMove: (from: number, to: number) => void) {
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number; h: number } | null>(null);
  const mids = useRef<number[]>([]), startY = useRef(0);

  /** The row lands where the pointer is: after every other row whose middle it has passed. */
  const target = (from: number, y: number) => mids.current.filter((m, i) => i !== from && m < y).length;

  function handle(index: number, label: string) {
    return {
      "aria-label": `Move ${label}. Drag, or use the arrow keys`,
      onPointerDown(e: React.PointerEvent<HTMLElement>) {
        if (e.button !== 0) return;
        e.preventDefault(); // no text selection or page scroll while dragging
        const list = e.currentTarget.closest("[data-reorder-row]")?.parentElement;
        if (!list) return;
        const rows = Array.from(list.querySelectorAll<HTMLElement>(":scope > [data-reorder-row]"));
        mids.current = rows.map((r) => { const b = r.getBoundingClientRect(); return b.top + b.height / 2; });
        startY.current = e.clientY;
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ from: index, to: index, dy: 0, h: rows[index]?.offsetHeight ?? 60 });
      },
      onPointerMove(e: React.PointerEvent<HTMLElement>) {
        if (!drag) return;
        const dy = e.clientY - startY.current;
        setDrag({ ...drag, dy, to: target(drag.from, e.clientY) });
      },
      onPointerUp() { if (drag) { if (drag.to !== drag.from) onMove(drag.from, drag.to); setDrag(null); } },
      onPointerCancel() { setDrag(null); },
      onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
        if (e.key === "ArrowUp" && index > 0) { e.preventDefault(); onMove(index, index - 1); }
        if (e.key === "ArrowDown" && index < count - 1) { e.preventDefault(); onMove(index, index + 1); }
      },
    };
  }

  /** Where a row sits while another one is dragged: the dragged row follows the pointer, the rows it passes make room. */
  function rowStyle(i: number): React.CSSProperties | undefined {
    if (!drag) return undefined;
    if (i === drag.from) return { transform: `translateY(${drag.dy}px)`, zIndex: 5, position: "relative" };
    const shift = i > drag.from && i <= drag.to ? -drag.h : i < drag.from && i >= drag.to ? drag.h : 0;
    return { transform: `translateY(${shift}px)`, transition: "transform .15s" };
  }

  return { handle, rowStyle, dragging: drag?.from ?? null };
}
