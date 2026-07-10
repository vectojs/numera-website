import { Entity, type A11yAttributes, type IRenderer } from "@vectojs/core";
import { colName, SheetModel, type Rect } from "@vectojs/sheets-core";
import { measureText } from "@vectojs/ui";
import { type CellPosition, SheetViewport } from "./SheetViewport";

export interface SheetGridEvents {
  onCellPointerDown?: (cell: CellPosition, extend: boolean) => void;
  onCellPointerMove?: (cell: CellPosition) => void;
  onCellPointerUp?: () => void;
  onScroll?: (deltaX: number, deltaY: number) => void;
  onAxisResize?: (axis: "row" | "column", index: number, size: number) => void;
  onFill?: (target: Rect) => void;
  onGestureChange?: () => void;
}

export interface AxisResizeTarget {
  axis: "row" | "column";
  index: number;
  size: number;
}

const FILL_HANDLE_SIZE = 8;
const MIN_ROW_SIZE = 12;
const MIN_COLUMN_SIZE = 32;

/** Number of cells that the current grid frame will inspect and render. */
export function visibleCellCount(viewport: SheetViewport): number {
  const range = viewport.visibleRange();
  if (range.rowEnd < range.rowStart || range.colEnd < range.colStart) return 0;
  return (
    (range.rowEnd - range.rowStart + 1) * (range.colEnd - range.colStart + 1)
  );
}

/** Canvas rectangle for the normalized selected range. */
export function selectionPixelRect(viewport: SheetViewport): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return rangePixelRect(viewport, viewport.selectionRange());
}

function rangePixelRect(
  viewport: SheetViewport,
  range: Rect,
): { x: number; y: number; width: number; height: number } {
  const topLeft = viewport.cellRect({ row: range.r1, col: range.c1 });
  const bottomRight = viewport.cellRect({ row: range.r2, col: range.c2 });
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x + bottomRight.width - topLeft.x,
    height: bottomRight.y + bottomRight.height - topLeft.y,
  };
}

export function fillHandleRect(viewport: SheetViewport): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const selection = selectionPixelRect(viewport);
  return {
    x: selection.x + selection.width - FILL_HANDLE_SIZE / 2,
    y: selection.y + selection.height - FILL_HANDLE_SIZE / 2,
    width: FILL_HANDLE_SIZE,
    height: FILL_HANDLE_SIZE,
  };
}

/** Resolve header-edge hit zones from the same variable geometry used to draw them. */
export function headerResizeTargetAt(
  viewport: SheetViewport,
  localX: number,
  localY: number,
  tolerance = 5,
): AxisResizeTarget | null {
  if (
    localX >= 0 &&
    localX < viewport.rowHeaderWidth &&
    localY >= viewport.columnHeaderHeight
  ) {
    const cell = viewport.cellAt(viewport.rowHeaderWidth, localY);
    if (!cell) return null;
    const rect = viewport.cellRect(cell);
    if (Math.abs(localY - rect.y) <= tolerance && cell.row > 0)
      return {
        axis: "row",
        index: cell.row - 1,
        size: viewport.rowSizeAt(cell.row - 1),
      };
    if (Math.abs(localY - (rect.y + rect.height)) <= tolerance)
      return { axis: "row", index: cell.row, size: rect.height };
  }
  if (
    localY >= 0 &&
    localY < viewport.columnHeaderHeight &&
    localX >= viewport.rowHeaderWidth
  ) {
    const cell = viewport.cellAt(localX, viewport.columnHeaderHeight);
    if (!cell) return null;
    const rect = viewport.cellRect(cell);
    if (Math.abs(localX - rect.x) <= tolerance && cell.col > 0)
      return {
        axis: "column",
        index: cell.col - 1,
        size: viewport.columnSizeAt(cell.col - 1),
      };
    if (Math.abs(localX - (rect.x + rect.width)) <= tolerance)
      return { axis: "column", index: cell.col, size: rect.width };
  }
  return null;
}

/**
 * A single canvas entity for the sheet surface. It renders only the rows and
 * columns intersecting the viewport; the 10,000 by 100 document never becomes
 * a matching entity tree or a DOM cell grid.
 */
export class SheetGridEntity extends Entity {
  private pointerDragging = false;
  private resizeDrag:
    (AxisResizeTarget & { startCoordinate: number; nextSize: number }) | null =
    null;
  private fillDrag: { target: Rect } | null = null;

  constructor(
    readonly model: SheetModel,
    readonly viewport: SheetViewport,
    private readonly events: SheetGridEvents = {},
  ) {
    super();
    this.interactive = true;
    this.on(
      "pointerdown",
      (event: { localX?: number; localY?: number; shiftKey?: boolean }) => {
        if (event.localX === undefined || event.localY === undefined) return;
        const resize = headerResizeTargetAt(
          this.viewport,
          event.localX,
          event.localY,
        );
        if (resize) {
          this.resizeDrag = {
            ...resize,
            startCoordinate:
              resize.axis === "row" ? event.localY : event.localX,
            nextSize: resize.size,
          };
          this.events.onGestureChange?.();
          return;
        }
        if (
          pointInRect(event.localX, event.localY, fillHandleRect(this.viewport))
        ) {
          this.fillDrag = { target: this.viewport.selectionRange() };
          this.events.onGestureChange?.();
          return;
        }
        const cell = this.viewport.cellAt(event.localX, event.localY);
        if (!cell) return;
        this.pointerDragging = true;
        this.events.onCellPointerDown?.(cell, event.shiftKey ?? false);
      },
    );
    this.on("pointermove", (event: { localX?: number; localY?: number }) => {
      if (event.localX === undefined || event.localY === undefined) return;
      if (this.resizeDrag) {
        const coordinate =
          this.resizeDrag.axis === "row" ? event.localY : event.localX;
        const minimum =
          this.resizeDrag.axis === "row" ? MIN_ROW_SIZE : MIN_COLUMN_SIZE;
        this.resizeDrag.nextSize = Math.max(
          minimum,
          Math.round(
            this.resizeDrag.size + coordinate - this.resizeDrag.startCoordinate,
          ),
        );
        this.events.onGestureChange?.();
        return;
      }
      if (this.fillDrag) {
        const cell = this.viewport.cellAt(event.localX, event.localY);
        if (cell) this.fillDrag.target = fillTargetRange(this.viewport, cell);
        this.events.onGestureChange?.();
        return;
      }
      if (
        !this.pointerDragging ||
        event.localX === undefined ||
        event.localY === undefined
      )
        return;
      const cell = this.viewport.cellAt(event.localX, event.localY);
      if (cell) this.events.onCellPointerMove?.(cell);
    });
    this.on("pointerup", () => {
      if (this.resizeDrag) {
        const drag = this.resizeDrag;
        this.resizeDrag = null;
        this.events.onAxisResize?.(drag.axis, drag.index, drag.nextSize);
        this.events.onGestureChange?.();
        return;
      }
      if (this.fillDrag) {
        const drag = this.fillDrag;
        this.fillDrag = null;
        this.events.onFill?.(drag.target);
        this.events.onGestureChange?.();
        return;
      }
      if (!this.pointerDragging) return;
      this.pointerDragging = false;
      this.events.onCellPointerUp?.();
    });
    this.on("pointerleave", () => {
      // Pointer capture on the projected grid keeps normal drags alive after
      // leaving its bounds. This reset covers synthetic/non-captured events.
      if (!this.pointerDragging) return;
      this.pointerDragging = false;
      this.events.onCellPointerUp?.();
    });
    this.on(
      "wheel",
      (event: { deltaX?: number; deltaY?: number; preventDefault(): void }) => {
        event.preventDefault();
        this.events.onScroll?.(event.deltaX ?? 0, event.deltaY ?? 0);
      },
    );
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.viewport.resize(width, height);
  }

  isPointInside(sceneX: number, sceneY: number): boolean {
    const local = this.worldToLocal(sceneX, sceneY);
    return (
      local !== null &&
      local.x >= 0 &&
      local.y >= 0 &&
      local.x < this.width &&
      local.y < this.height
    );
  }

  getA11yAttributes(): A11yAttributes {
    const { row, col } = this.viewport.selected;
    return {
      role: "application",
      label: `Spreadsheet grid, active cell ${colName(col)}${row + 1}`,
    };
  }

  render(renderer: IRenderer): void {
    drawRect(renderer, 0, 0, this.width, this.height, "#ffffff");

    const { rowHeaderWidth, columnHeaderHeight } = this.viewport;
    const range = this.viewport.visibleRange();
    const bodyWidth = Math.max(0, this.width - rowHeaderWidth);
    const bodyHeight = Math.max(0, this.height - columnHeaderHeight);

    renderer.save();
    renderer.clip(rowHeaderWidth, columnHeaderHeight, bodyWidth, bodyHeight);
    for (let row = range.rowStart; row <= range.rowEnd; row++) {
      for (let col = range.colStart; col <= range.colEnd; col++) {
        const { x, y, width, height } = this.viewport.cellRect({ row, col });
        const format = this.model.getFormat(row, col);
        if (format.background)
          drawRect(renderer, x, y, width, height, format.background);
        const display = this.model.getDisplay(row, col);
        if (display) {
          const font = `${format.italic ? "italic " : ""}${format.bold ? "700 " : ""}13px Inter, sans-serif`;
          const textWidth = measureText(display, font);
          const textX =
            format.horizontalAlign === "right"
              ? x + width - textWidth - 6
              : format.horizontalAlign === "center"
                ? x + (width - textWidth) / 2
                : x + 6;
          renderer.fillText(
            display,
            textX,
            y + Math.min(16, height - 6),
            font,
            format.foreground ?? "#1f2937",
          );
        }
      }
    }
    drawGridLines(
      renderer,
      range.rowStart,
      range.rowEnd,
      range.colStart,
      range.colEnd,
      this.viewport,
    );
    const selectedRange = selectionPixelRect(this.viewport);
    drawRect(
      renderer,
      selectedRange.x,
      selectedRange.y,
      selectedRange.width,
      selectedRange.height,
      "rgba(26, 115, 232, 0.12)",
    );
    renderer.beginPath();
    renderer.roundRect(
      selectedRange.x,
      selectedRange.y,
      selectedRange.width,
      selectedRange.height,
      0,
    );
    renderer.stroke("#1a73e8", 2);
    if (this.fillDrag) {
      const target = rangePixelRect(this.viewport, this.fillDrag.target);
      drawRect(
        renderer,
        target.x,
        target.y,
        target.width,
        target.height,
        "rgba(26, 115, 232, 0.08)",
      );
      renderer.beginPath();
      renderer.roundRect(target.x, target.y, target.width, target.height, 0);
      renderer.stroke("#1a73e8", 1);
    }
    const handle = fillHandleRect(this.viewport);
    drawRect(
      renderer,
      handle.x,
      handle.y,
      handle.width,
      handle.height,
      "#1a73e8",
    );
    const selected = this.viewport.cellRect(this.viewport.selected);
    renderer.beginPath();
    renderer.roundRect(
      selected.x,
      selected.y,
      selected.width,
      selected.height,
      0,
    );
    renderer.stroke("#1a73e8", 2);
    renderer.restore();

    if (this.resizeDrag) {
      const cell =
        this.resizeDrag.axis === "row"
          ? { row: this.resizeDrag.index, col: range.colStart }
          : { row: range.rowStart, col: this.resizeDrag.index };
      const rect = this.viewport.cellRect(cell);
      renderer.beginPath();
      if (this.resizeDrag.axis === "row") {
        const y = rect.y + this.resizeDrag.nextSize;
        renderer.moveTo(0, y);
        renderer.lineTo(this.width, y);
      } else {
        const x = rect.x + this.resizeDrag.nextSize;
        renderer.moveTo(x, 0);
        renderer.lineTo(x, this.height);
      }
      renderer.stroke("#1a73e8", 2);
    }

    drawRect(renderer, 0, 0, rowHeaderWidth, columnHeaderHeight, "#f8fafc");
    drawRect(
      renderer,
      rowHeaderWidth,
      0,
      bodyWidth,
      columnHeaderHeight,
      "#f8fafc",
    );
    drawRect(
      renderer,
      0,
      columnHeaderHeight,
      rowHeaderWidth,
      bodyHeight,
      "#f8fafc",
    );

    for (let col = range.colStart; col <= range.colEnd; col++) {
      const x = this.viewport.cellRect({ row: range.rowStart, col }).x;
      renderer.fillText(
        colName(col),
        x + 6,
        18,
        "600 12px Inter, sans-serif",
        "#475569",
      );
    }
    for (let row = range.rowStart; row <= range.rowEnd; row++) {
      const y = this.viewport.cellRect({ row, col: range.colStart }).y;
      renderer.fillText(
        String(row + 1),
        6,
        y + 16,
        "600 12px Inter, sans-serif",
        "#475569",
      );
    }

    renderer.beginPath();
    renderer.moveTo(rowHeaderWidth, 0);
    renderer.lineTo(rowHeaderWidth, this.height);
    renderer.moveTo(0, columnHeaderHeight);
    renderer.lineTo(this.width, columnHeaderHeight);
    renderer.stroke("#cbd5e1", 1);
  }
}

function fillTargetRange(viewport: SheetViewport, cell: CellPosition): Rect {
  const source = viewport.selectionRange();
  const rowDistance =
    cell.row < source.r1
      ? source.r1 - cell.row
      : Math.max(0, cell.row - source.r2);
  const columnDistance =
    cell.col < source.c1
      ? source.c1 - cell.col
      : Math.max(0, cell.col - source.c2);
  if (rowDistance >= columnDistance)
    return {
      r1: Math.min(source.r1, cell.row),
      c1: source.c1,
      r2: Math.max(source.r2, cell.row),
      c2: source.c2,
    };
  return {
    r1: source.r1,
    c1: Math.min(source.c1, cell.col),
    r2: source.r2,
    c2: Math.max(source.c2, cell.col),
  };
}

function pointInRect(
  x: number,
  y: number,
  rect: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height
  );
}

function drawRect(
  renderer: IRenderer,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
): void {
  renderer.beginPath();
  renderer.roundRect(x, y, width, height, 0);
  renderer.fill(color);
}

function drawGridLines(
  renderer: IRenderer,
  rowStart: number,
  rowEnd: number,
  colStart: number,
  colEnd: number,
  viewport: SheetViewport,
): void {
  const { rowHeaderWidth, columnHeaderHeight } = viewport;
  renderer.beginPath();
  for (let col = colStart; col <= colEnd; col++) {
    const x = viewport.cellRect({ row: rowStart, col }).x;
    renderer.moveTo(x, columnHeaderHeight);
    renderer.lineTo(x, viewport.height);
  }
  const lastColumn = viewport.cellRect({ row: rowStart, col: colEnd });
  renderer.moveTo(lastColumn.x + lastColumn.width, columnHeaderHeight);
  renderer.lineTo(lastColumn.x + lastColumn.width, viewport.height);
  for (let row = rowStart; row <= rowEnd; row++) {
    const y = viewport.cellRect({ row, col: colStart }).y;
    renderer.moveTo(rowHeaderWidth, y);
    renderer.lineTo(viewport.width, y);
  }
  const lastRow = viewport.cellRect({ row: rowEnd, col: colStart });
  renderer.moveTo(rowHeaderWidth, lastRow.y + lastRow.height);
  renderer.lineTo(viewport.width, lastRow.y + lastRow.height);
  renderer.stroke("#e2e8f0", 1);
}
