// <Canvas> — the reusable free-form pan/zoom/grid-snap surface extracted from
// the shell home page. Composes usePanZoom + useDragSnap and renders the
// stage + items; the consumer supplies item content via `renderItem` and owns
// `layout` / `editMode` / `selectedId` (all controlled props).
//
// Item DOM: Canvas does NOT wrap items in an extra positioned div. It clones
// the element `renderItem` returns and injects `data-id`, the canvas-space
// left/top/width geometry, and the `is-selected` class onto it. So the
// consumer's own card element stays the positioned box — DOM shape matches the
// pre-extraction home exactly. The cloned element must carry its base class
// (e.g. `home-widget` / `home-greeting`) and `position: absolute` (the bundled
// canvas.css supplies the latter for the home classes).
//
// CSS: canvas.css is imported as a side effect here, so any bundler following
// the import graph (Vite in a pkg, the shell's build) inlines it. Its
// var(--*) tokens resolve against the host document — inside a Vite/iframe pkg
// the consumer must import @ikenga/tokens at entry (Round 8 / G21).

import {
  cloneElement,
  forwardRef,
  isValidElement,
  useImperativeHandle,
  type CSSProperties,
  type ReactElement,
} from 'react';
import './canvas.css';
import type { CanvasHandle, CanvasProps, ItemId, ItemRenderState } from './types.js';
import { usePanZoom } from './use-pan-zoom.js';
import { useDragSnap } from './use-drag-snap.js';

// Hit-test class roots Canvas owns. Anything matching these inside the canvas
// counts as a draggable item; the bar/palette are excluded from gestures.
const ITEM_SELECTOR = '.home-widget, .home-greeting, [data-canvas-item]';
const BAR_SELECTOR = '.ikenga-canvas-bar';
const PALETTE_SELECTOR = '.home-palette';

function CanvasInner<T>(props: CanvasProps<T>, ref: React.Ref<CanvasHandle>) {
  const {
    items,
    itemId,
    itemKind,
    layout,
    viewport,
    editMode,
    selectedId = null,
    gridSnap = 12,
    renderItem,
    onLayoutChange,
    onViewportChange,
    onEditModeChange,
    onSelectionChange,
    autoFitOnResize = true,
    className,
  } = props;

  const { pan, autoFit, canvasRef, stageRef, spaceDown, beginPan, isPanning } = usePanZoom({
    layout,
    editMode,
    autoFitOnResize,
    onViewportChange,
    onEditModeChange,
    onSelectionChange,
  });

  const { beginDrag } = useDragSnap({
    layout,
    gridSnap,
    scale: viewport.scale,
    onLayoutChange,
    stageRef,
  });

  useImperativeHandle(ref, () => ({ autoFit }), [autoFit]);

  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.closest(BAR_SELECTOR) || target.closest(PALETTE_SELECTOR)) return;
    const middle = e.button === 1;
    const itemEl = target.closest(ITEM_SELECTOR) as HTMLElement | null;

    if (editMode && itemEl && !middle && !spaceDown.current) {
      const id = itemEl.getAttribute('data-id') as ItemId | null;
      if (!id) return;
      onSelectionChange?.(id);
      beginDrag(id, e.clientX, e.clientY);
      e.preventDefault();
      return;
    }
    if (middle || spaceDown.current || (!editMode && !itemEl)) {
      beginPan(e.clientX, e.clientY);
      e.preventDefault();
    }
    if (editMode && !itemEl) onSelectionChange?.(null);
  }

  function onDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    if (t.closest(ITEM_SELECTOR) || t.closest(BAR_SELECTOR) || t.closest(PALETTE_SELECTOR)) return;
    autoFit(true);
  }

  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${pan.scale})`;

  return (
    <div
      ref={canvasRef}
      className={className ? `ikenga-canvas ${className}` : 'ikenga-canvas'}
      data-mode-edit={editMode ? 'true' : 'false'}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
    >
      <div className="ikenga-canvas-grain" />

      <div ref={stageRef} className="ikenga-canvas-stage" style={{ transform }}>
        {items.map((item) => {
          const id = itemId(item);
          const placement = layout[id];
          if (!placement) return null;
          const isSelected = selectedId === id;
          const state: ItemRenderState = {
            id,
            kind: itemKind(item),
            placement,
            isSelected,
            isEditMode: editMode,
          };
          const node = renderItem(item, state);
          if (!isValidElement(node)) return node;
          const el = node as ReactElement<{ style?: CSSProperties; className?: string }>;
          // Inject geometry under the consumer's own style so renderItem can
          // still override (e.g. minHeight vs height for the naked greeting).
          const injected: CSSProperties = {
            left: placement.x,
            top: placement.y,
            width: placement.w,
            ...el.props.style,
          };
          // Append the selection class without clobbering the consumer's.
          const baseClass = el.props.className ?? '';
          const className = isSelected ? `${baseClass} is-selected`.trim() : baseClass;
          return cloneElement(el, {
            key: id,
            'data-id': id,
            style: injected,
            className,
          } as Partial<typeof el.props> & { key: string; 'data-id': string });
        })}
      </div>

      {props.children}
    </div>
  );
}

// forwardRef can't preserve the <T> generic through its typing, so we cast the
// wrapped component back to a generic-aware signature. Callers get full
// inference on CanvasProps<T>.
export const Canvas = forwardRef(CanvasInner) as <T>(
  props: CanvasProps<T> & { ref?: React.Ref<CanvasHandle> }
) => ReactElement;
