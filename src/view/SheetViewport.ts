import { normalizeRect, type Rect } from "@vectojs/numera-core";
import { AxisGeometry, type AxisMetricSource } from "./AxisGeometry";

export interface CellPosition {
  row: number;
  col: number;
}

export interface VisibleRange {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
}

export interface SheetViewportOptions {
  rows: number;
  cols: number;
  rowHeight: number;
  colWidth: number;
  rowMetrics?: AxisMetricSource;
  columnMetrics?: AxisMetricSource;
  rowHeaderWidth?: number;
  columnHeaderHeight?: number;
}

/**
 * Pure viewport state and geometry for a sparse sheet. It deliberately owns no
 * entities: rendering code consumes the visible range while interaction code
 * uses the same coordinate conversion, keeping selection and pixels aligned.
 */
export class SheetViewport {
  rows: number;
  cols: number;
  readonly rowHeight: number;
  readonly colWidth: number;
  readonly rowHeaderWidth: number;
  readonly columnHeaderHeight: number;

  width = 0;
  height = 0;
  scrollX = 0;
  scrollY = 0;
  selected: CellPosition = { row: 0, col: 0 };
  private anchor: CellPosition = { row: 0, col: 0 };
  private rowMetrics: AxisMetricSource;
  private columnMetrics: AxisMetricSource;
  private rowGeometry: AxisGeometry;
  private columnGeometry: AxisGeometry;

  constructor(options: SheetViewportOptions) {
    this.rows = options.rows;
    this.cols = options.cols;
    this.rowHeight = options.rowHeight;
    this.colWidth = options.colWidth;
    this.rowHeaderWidth = options.rowHeaderWidth ?? 40;
    this.columnHeaderHeight = options.columnHeaderHeight ?? 28;
    this.rowMetrics =
      options.rowMetrics ?? uniformAxis(options.rows, options.rowHeight);
    this.columnMetrics =
      options.columnMetrics ?? uniformAxis(options.cols, options.colWidth);
    this.rowGeometry = new AxisGeometry(this.rowMetrics);
    this.columnGeometry = new AxisGeometry(this.columnMetrics);
  }

  resize(width: number, height: number): void {
    this.width = Math.max(0, width);
    this.height = Math.max(0, height);
    this.scrollTo(this.scrollX, this.scrollY);
  }

  /**
   * Synchronize the viewport after a document-level structural operation.
   * Clamping both the selected endpoint and anchor keeps the visual selection
   * valid without duplicating sparse-document transformation rules in the UI.
   */
  setBounds(rows: number, cols: number): void {
    this.rows = Math.max(1, Math.floor(rows));
    this.cols = Math.max(1, Math.floor(cols));
    if (this.rowMetrics.axisLength !== this.rows) {
      this.rowMetrics = uniformAxis(this.rows, this.rowHeight);
      this.rowGeometry = new AxisGeometry(this.rowMetrics);
    }
    if (this.columnMetrics.axisLength !== this.cols) {
      this.columnMetrics = uniformAxis(this.cols, this.colWidth);
      this.columnGeometry = new AxisGeometry(this.columnMetrics);
    }
    this.selected = this.clampPosition(this.selected);
    this.anchor = this.clampPosition(this.anchor);
    this.scrollTo(this.scrollX, this.scrollY);
  }

  /** Rebuild sparse geometry after Core swaps metric snapshots or sheet bounds. */
  setMetrics(
    rowMetrics: AxisMetricSource,
    columnMetrics: AxisMetricSource,
  ): void {
    this.rowMetrics = rowMetrics;
    this.columnMetrics = columnMetrics;
    this.rowGeometry = new AxisGeometry(rowMetrics);
    this.columnGeometry = new AxisGeometry(columnMetrics);
    this.setBounds(rowMetrics.axisLength, columnMetrics.axisLength);
  }

  rowSizeAt(row: number): number {
    return this.rowGeometry.sizeAt(row);
  }

  columnSizeAt(column: number): number {
    return this.columnGeometry.sizeAt(column);
  }

  scrollBy(deltaX: number, deltaY: number): void {
    this.scrollTo(this.scrollX + deltaX, this.scrollY + deltaY);
  }

  scrollTo(x: number, y: number): void {
    this.scrollX = clamp(x, 0, this.maxScrollX());
    this.scrollY = clamp(y, 0, this.maxScrollY());
  }

  moveSelection(rowDelta: number, colDelta: number, extend = false): void {
    const target = {
      row: clamp(this.selected.row + rowDelta, 0, this.rows - 1),
      col: clamp(this.selected.col + colDelta, 0, this.cols - 1),
    };
    if (extend) this.extendSelection(target);
    else this.select(target);
  }

  select(position: CellPosition): void {
    const target = this.clampPosition(position);
    this.selected = target;
    this.anchor = target;
  }

  extendSelection(position: CellPosition): void {
    this.selected = this.clampPosition(position);
  }

  selectionRange(): Rect {
    return normalizeRect(this.anchor, this.selected);
  }

  /** Adjust the scroll offset just enough to place a cell inside the body. */
  ensureVisible(position: CellPosition): void {
    const cell = {
      row: clamp(position.row, 0, this.rows - 1),
      col: clamp(position.col, 0, this.cols - 1),
    };
    const left = this.columnGeometry.offsetOf(cell.col);
    const right = left + this.columnGeometry.sizeAt(cell.col);
    const top = this.rowGeometry.offsetOf(cell.row);
    const bottom = top + this.rowGeometry.sizeAt(cell.row);
    let nextX = this.scrollX;
    let nextY = this.scrollY;
    if (left < nextX) nextX = left;
    else if (right > nextX + this.bodyWidth()) nextX = right - this.bodyWidth();
    if (top < nextY) nextY = top;
    else if (bottom > nextY + this.bodyHeight())
      nextY = bottom - this.bodyHeight();
    this.scrollTo(nextX, nextY);
  }

  visibleRange(): VisibleRange {
    const bodyWidth = this.bodyWidth();
    const bodyHeight = this.bodyHeight();
    if (bodyWidth <= 0 || bodyHeight <= 0) {
      return { rowStart: 0, rowEnd: -1, colStart: 0, colEnd: -1 };
    }
    return {
      rowStart: this.rowGeometry.indexAt(this.scrollY),
      rowEnd: this.rowGeometry.indexAt(this.scrollY + bodyHeight - 1),
      colStart: this.columnGeometry.indexAt(this.scrollX),
      colEnd: this.columnGeometry.indexAt(this.scrollX + bodyWidth - 1),
    };
  }

  /** Number of complete rows exposed by the current canvas body. */
  pageRows(): number {
    const range = this.visibleRange();
    return Math.max(1, range.rowEnd - range.rowStart + 1);
  }

  cellAt(localX: number, localY: number): CellPosition | null {
    if (localX < this.rowHeaderWidth || localY < this.columnHeaderHeight)
      return null;
    if (localX >= this.width || localY >= this.height) return null;
    const col = this.columnGeometry.indexAt(
      localX - this.rowHeaderWidth + this.scrollX,
    );
    const row = this.rowGeometry.indexAt(
      localY - this.columnHeaderHeight + this.scrollY,
    );
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols
      ? { row, col }
      : null;
  }

  cellRect(position: CellPosition): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    return {
      x:
        this.rowHeaderWidth +
        this.columnGeometry.offsetOf(position.col) -
        this.scrollX,
      y:
        this.columnHeaderHeight +
        this.rowGeometry.offsetOf(position.row) -
        this.scrollY,
      width: this.columnGeometry.sizeAt(position.col),
      height: this.rowGeometry.sizeAt(position.row),
    };
  }

  private bodyWidth(): number {
    return Math.max(0, this.width - this.rowHeaderWidth);
  }

  private bodyHeight(): number {
    return Math.max(0, this.height - this.columnHeaderHeight);
  }

  private maxScrollX(): number {
    return Math.max(0, this.columnGeometry.totalSize - this.bodyWidth());
  }

  private maxScrollY(): number {
    return Math.max(0, this.rowGeometry.totalSize - this.bodyHeight());
  }

  private clampPosition(position: CellPosition): CellPosition {
    return {
      row: clamp(position.row, 0, this.rows - 1),
      col: clamp(position.col, 0, this.cols - 1),
    };
  }
}

function uniformAxis(length: number, size: number): AxisMetricSource {
  return {
    axisLength: length,
    default: size,
    get: () => size,
    entries: () => [],
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
