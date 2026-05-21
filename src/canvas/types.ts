import type { ReactNode } from 'react';

export type ItemId = string & { readonly __brand: 'ItemId' };

export interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface ItemRenderState {
  id: ItemId;
  kind: string;
  placement: Placement;
  isSelected: boolean;
  isEditMode: boolean;
}

export interface CanvasProps<T> {
  items: T[];
  itemId: (item: T) => ItemId;
  itemKind: (item: T) => string;
  layout: Record<ItemId, Placement>; // controlled
  viewport: Viewport; // controlled
  editMode: boolean; // controlled
  gridSnap?: number; // default 12 (home), 24 for studio
  renderItem: (item: T, state: ItemRenderState) => ReactNode;
  onLayoutChange?: (layout: Record<ItemId, Placement>) => void;
  onViewportChange?: (viewport: Viewport) => void;
  onEditModeChange?: (editMode: boolean) => void;
  onSelectionChange?: (selectedId: ItemId | null) => void;
  autoFitOnResize?: boolean; // default true
  className?: string;
}

export interface CanvasHandle {
  autoFit(animate?: boolean): void;
}
