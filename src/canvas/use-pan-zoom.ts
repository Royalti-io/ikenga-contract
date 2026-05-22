// Pan / zoom / auto-fit for the <Canvas> primitive.
//
// Owns the viewport pan offset + scale, the imperative auto-fit math, the
// pan gesture (Space-drag / middle-mouse / empty-canvas drag), and the
// Space/Escape keyboard affordances + window-resize re-fit. It deliberately
// does NOT own `layout`, `selectedId`, or `editMode` — those stay parent-held
// and are threaded in as values so the auto-fit closure can read them.
//
// Extracted verbatim (behavior-preserving) from shell home.tsx's canvas block.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ItemId, Placement, Viewport } from './types.js';

export interface UsePanZoomArgs {
  /** Controlled layout (id → placement) the auto-fit bounding box reads. */
  layout: Record<ItemId, Placement>;
  /** Controlled edit-mode flag — auto-fit reserves palette width when true. */
  editMode: boolean;
  /** Re-fit on window resize. Default true. */
  autoFitOnResize?: boolean;
  /** Notified whenever the viewport pan/scale changes (controlled mirror). */
  onViewportChange?: (viewport: Viewport) => void;
  /** Escape exits edit mode → parent owns the state flip. */
  onEditModeChange?: (editMode: boolean) => void;
  /** Escape clears selection. */
  onSelectionChange?: (selectedId: ItemId | null) => void;
}

export interface UsePanZoom {
  /** Live viewport (x/y/scale). Mirrors `pan` in the original home code. */
  pan: Viewport;
  setPan: React.Dispatch<React.SetStateAction<Viewport>>;
  /** Imperative re-fit. `animate=false` snaps without the transition. */
  autoFit: (animate?: boolean) => void;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  stageRef: React.RefObject<HTMLDivElement | null>;
  /** True while Space is held — drag/pan branch reads this. */
  spaceDown: React.MutableRefObject<boolean>;
  /** Begin a pan gesture from a mousedown at screen (clientX, clientY). */
  beginPan: (clientX: number, clientY: number) => void;
  /** Is a pan gesture in flight? */
  isPanning: () => boolean;
}

const RESERVED_PALETTE_WIDTH = 320;

export function usePanZoom(args: UsePanZoomArgs): UsePanZoom {
  const {
    layout,
    editMode,
    autoFitOnResize = true,
    onViewportChange,
    onEditModeChange,
    onSelectionChange,
  } = args;

  const [pan, setPan] = useState<Viewport>({ x: 0, y: 0, scale: 1 });

  const canvasRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const spaceDown = useRef(false);
  const panStart = useRef<{ x: number; y: number } | null>(null);
  // Latest pan reachable synchronously (for beginPan's offset seed) without
  // adding `pan` to the gesture callbacks' deps.
  const panRef = useRef(pan);
  panRef.current = pan;

  // Mirror viewport changes to the controlled parent in an effect (never
  // inside a setState updater — that would setState-during-render the parent
  // and trip React's "Cannot update a component while rendering a different
  // component" warning). The ref skips the initial mount so the parent isn't
  // notified of the default {0,0,1} before any real fit.
  const viewportCbRef = useRef(onViewportChange);
  viewportCbRef.current = onViewportChange;
  const mountedViewport = useRef(false);
  useEffect(() => {
    if (!mountedViewport.current) {
      mountedViewport.current = true;
      return;
    }
    viewportCbRef.current?.(pan);
  }, [pan]);

  // Auto-fit: scale the bounding box of all items into the visible area,
  // scaling down only (never up). Reserves the palette gutter in edit mode.
  // Threads `layout` + `editMode` as deps so the closure never goes stale.
  const autoFit = useCallback(
    (animate = true) => {
      const canvas = canvasRef.current;
      const items = Object.values(layout);
      if (!canvas || !items.length) return;
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const w of items) {
        if (w.x < minX) minX = w.x;
        if (w.y < minY) minY = w.y;
        if (w.x + w.w > maxX) maxX = w.x + w.w;
        if (w.y + w.h > maxY) maxY = w.y + w.h;
      }
      const cw = canvas.clientWidth - (editMode ? RESERVED_PALETTE_WIDTH : 0) - 40;
      const ch = canvas.clientHeight - 44 - 32;
      const bw = maxX - minX;
      const bh = maxY - minY;
      const sx = bw > 0 ? cw / bw : 1;
      const sy = bh > 0 ? ch / bh : 1;
      const scale = Math.min(1, sx, sy);
      const offX = Math.round((cw + 40 - bw * scale) / 2 - minX * scale);
      const offY = Math.round((ch + 32 - bh * scale) / 2 - minY * scale + 22);
      setPan({ x: offX, y: offY, scale });
      if (stageRef.current) stageRef.current.classList.toggle('is-dragging', !animate);
    },
    [layout, editMode, setPan]
  );

  // Initial fit + window-resize re-fit. Empty dep array on purpose — autoFit
  // is read through the ref-stable callback, matching the original effect.
  useEffect(() => {
    requestAnimationFrame(() => autoFit(false));
    if (!autoFitOnResize) return;
    const onResize = () => autoFit(true);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fit whenever edit mode toggles (palette gutter changes the fit box).
  useEffect(() => {
    autoFit(true);
  }, [editMode, autoFit]);

  // Keyboard — Escape exits edit, Space arms the pan-grab cursor.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && editMode) {
        onEditModeChange?.(false);
        onSelectionChange?.(null);
      }
      if (
        e.code === 'Space' &&
        !e.repeat &&
        document.activeElement === document.body &&
        canvasRef.current
      ) {
        spaceDown.current = true;
        canvasRef.current.style.cursor = 'grab';
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown.current = false;
        if (canvasRef.current) canvasRef.current.style.cursor = '';
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [editMode, onEditModeChange, onSelectionChange]);

  const beginPan = useCallback((clientX: number, clientY: number) => {
    const p = panRef.current;
    panStart.current = { x: clientX - p.x, y: clientY - p.y };
    stageRef.current?.classList.add('is-dragging');
    if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
  }, []);

  const isPanning = useCallback(() => panStart.current != null, []);

  // Global pan move/up. Drag (item) move/up lives in use-drag-snap so this
  // effect only owns the pan branch + its own cleanup.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (panStart.current) {
        setPan((p) => ({
          ...p,
          x: e.clientX - panStart.current!.x,
          y: e.clientY - panStart.current!.y,
        }));
      }
    };
    const onUp = () => {
      if (panStart.current) {
        panStart.current = null;
        stageRef.current?.classList.remove('is-dragging');
        if (canvasRef.current) canvasRef.current.style.cursor = spaceDown.current ? 'grab' : '';
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [setPan]);

  return {
    pan,
    setPan,
    autoFit,
    canvasRef,
    stageRef,
    spaceDown,
    beginPan,
    isPanning,
  };
}
