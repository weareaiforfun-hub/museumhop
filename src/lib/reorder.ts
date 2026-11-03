import { useEffect, useRef, useState } from "react";

// Auto-scroll starts this many px from the edge (more when the page scrolls: a sticky bar can cover its top), and runs
// up to this many px a frame.
const EDGE = 80, PAGE_EDGE = 130, MAX_SPEED = 18;

/** The nearest ancestor that scrolls (the side panel on a laptop), or null for the page itself (phones). */
function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/** Drag-to-reorder for a list whose rows carry `data-reorder-row`: drag a row by its handle (mouse or touch), or
 *  focus the handle and use the arrow keys. Holding a row near the top or bottom edge scrolls the list, so a stop can
 *  travel past what's on screen. `to` is the index the row lands on, as `reorderOps` expects. */
export function useReorder(count: number, onMove: (from: number, to: number) => void) {
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number; h: number } | null>(null);
  const live = useRef<{ from: number; h: number; startY: number; y: number; mids: number[]; scroller: HTMLElement | null; scroll0: number; page0: number; frame: number } | null>(null);

  /** How far the list has moved since the drag began: its own scroll box plus the page (either may do the scrolling). */
  const scrolled = (d: NonNullable<typeof live.current>) => (d.scroller ? d.scroller.scrollTop - d.scroll0 : 0) + window.scrollY - d.page0;
  /** Recomputes the dragged row's offset and landing spot from the pointer and how far the list has scrolled since. */
  const update = () => {
    const d = live.current;
    if (!d) return;
    const moved = scrolled(d);
    const y = d.y + moved; // the pointer, in the coordinates the rows were measured in
    setDrag({ from: d.from, h: d.h, dy: d.y - d.startY + moved, to: d.mids.filter((m, i) => i !== d.from && m < y).length });
  };
  /** Each frame while dragging: near an edge, scroll towards it, faster the closer the pointer is. */
  const tick = () => {
    const d = live.current;
    if (!d) return;
    const box = d.scroller?.getBoundingClientRect();
    const top = Math.max(box?.top ?? 0, 0), bottom = Math.min(box?.bottom ?? innerHeight, innerHeight), edge = box ? EDGE : PAGE_EDGE;
    const speed = d.y < top + edge ? -Math.ceil(((top + edge - d.y) / edge) * MAX_SPEED) : d.y > bottom - edge ? Math.ceil(((d.y - bottom + edge) / edge) * MAX_SPEED) : 0;
    if (speed) {
      const before = scrolled(d);
      if (d.scroller) d.scroller.scrollTop += speed;
      if (scrolled(d) === before) window.scrollBy(0, speed); // the box can't go further (or isn't what scrolls): move the page
      if (scrolled(d) !== before) update();
    }
    d.frame = requestAnimationFrame(tick);
  };
  const stop = () => { if (live.current) cancelAnimationFrame(live.current.frame); live.current = null; setDrag(null); };
  useEffect(() => () => { if (live.current) cancelAnimationFrame(live.current.frame); }, []);

  function handle(index: number, label: string) {
    return {
      "aria-label": `Move ${label}. Drag, or use the arrow keys`,
      onPointerDown(e: React.PointerEvent<HTMLElement>) {
        if (e.button !== 0) return;
        e.preventDefault(); // no text selection or page scroll while dragging
        const list = e.currentTarget.closest("[data-reorder-row]")?.parentElement;
        if (!list) return;
        const rows = Array.from(list.querySelectorAll<HTMLElement>(":scope > [data-reorder-row]"));
        const scroller = scrollerOf(list);
        e.currentTarget.setPointerCapture(e.pointerId);
        live.current = { from: index, h: rows[index]?.offsetHeight ?? 60, startY: e.clientY, y: e.clientY, scroller, scroll0: scroller?.scrollTop ?? 0, page0: window.scrollY, frame: 0,
          mids: rows.map((r) => { const b = r.getBoundingClientRect(); return b.top + b.height / 2; }) };
        update();
        live.current.frame = requestAnimationFrame(tick);
      },
      onPointerMove(e: React.PointerEvent<HTMLElement>) {
        if (!live.current) return;
        live.current.y = e.clientY;
        update();
      },
      onPointerUp() { if (drag && drag.to !== drag.from) onMove(drag.from, drag.to); stop(); },
      onPointerCancel: stop,
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
