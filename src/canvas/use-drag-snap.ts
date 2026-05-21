// Scale-aware grid-snap drag for the <Canvas> primitive.
//
// Owns the in-flight drag gesture (which item, where it started) and the
// pointer math that moves it: cursor delta is divided by the current viewport
// scale (so a 10px screen move at scale 0.5 becomes a 20px canvas move, and at
// scale 2.0 a 5px canvas move), then snapped to the `gridSnap` lattice.
//
//   nx = round((startPos.x + dx / scale) / gridSnap) * gridSnap
//
// Does NOT own `layout` — it reads the current placement to seed the gesture
// and emits the moved layout through `onLayoutChange`. The parent stays the
// source of truth.
//
// Extracted verbatim (behavior-preserving) from shell home.tsx's canvas block.

import { useCallback, useEffect, useRef } from 'react';
import type { ItemId, Placement } from './types.js';

export interface DragState {
  id: ItemId;
  startMouse: { x: number; y: number };
  startPos: { x: number; y: number };
}

export interface UseDragSnapArgs {
  /** Controlled layout (id → placement). Read at gesture start; never mutated. */
  layout: Record<ItemId, Placement>;
  /** Snap lattice in canvas units. Home passes 12, studio passes 24. */
  gridSnap: number;
  /** Current viewport scale — drag delta is divided by this. */
  scale: number;
  /** Emits the moved layout so the parent can persist / re-render. */
  onLayoutChange?: (layout: Record<ItemId, Placement>) => void;
  /** Stage element whose `.is-dragging` class suppresses the pan transition. */
  stageRef: React.RefObject<HTMLDivElement | null>;
}

export interface UseDragSnap {
  dragState: React.MutableRefObject<DragState | null>;
  /** Begin dragging `id` from a mousedown at screen (clientX, clientY). */
  beginDrag: (id: ItemId, clientX: number, clientY: number) => void;
  /** Is an item drag in flight? */
  isDragging: () => boolean;
}

export function useDragSnap(args: UseDragSnapArgs): UseDragSnap {
  const { layout, gridSnap, scale, onLayoutChange, stageRef } = args;
  const dragState = useRef<DragState | null>(null);

  // Keep the freshest layout/scale/snap reachable from the global listener
  // without re-subscribing it on every render.
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const gridSnapRef = useRef(gridSnap);
  gridSnapRef.current = gridSnap;
  const onLayoutChangeRef = useRef(onLayoutChange);
  onLayoutChangeRef.current = onLayoutChange;

  const beginDrag = useCallback(
    (id: ItemId, clientX: number, clientY: number) => {
      const w = layoutRef.current[id];
      if (!w) return;
      dragState.current = {
        id,
        startMouse: { x: clientX, y: clientY },
        startPos: { x: w.x, y: w.y },
      };
      stageRef.current?.classList.add('is-dragging');
    },
    [stageRef]
  );

  const isDragging = useCallback(() => dragState.current != null, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragState.current) return;
      const s = scaleRef.current || 1;
      const snap = gridSnapRef.current;
      const dx = e.clientX - dragState.current.startMouse.x;
      const dy = e.clientY - dragState.current.startMouse.y;
      const nx = Math.round((dragState.current.startPos.x + dx / s) / snap) * snap;
      const ny = Math.round((dragState.current.startPos.y + dy / s) / snap) * snap;
      const id = dragState.current.id;
      const cur = layoutRef.current;
      const prev = cur[id];
      if (!prev || (prev.x === nx && prev.y === ny)) return;
      onLayoutChangeRef.current?.({ ...cur, [id]: { ...prev, x: nx, y: ny } });
    };
    const onUp = () => {
      if (dragState.current) {
        dragState.current = null;
        stageRef.current?.classList.remove('is-dragging');
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [stageRef]);

  return { dragState, beginDrag, isDragging };
}
