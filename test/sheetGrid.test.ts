import { describe, expect, it } from "bun:test";
import {
  selectionPixelRect,
  visibleCellCount,
} from "../src/view/SheetGridEntity";
import { SheetViewport } from "../src/view/SheetViewport";

describe("visibleCellCount", () => {
  it("bounds canvas work to the current viewport instead of the whole sheet", () => {
    const view = new SheetViewport({
      rows: 10_000,
      cols: 100,
      rowHeight: 24,
      colWidth: 112,
    });
    view.resize(1280, 720);

    expect(visibleCellCount(view)).toBeLessThan(1_000);
    expect(visibleCellCount(view)).toBeGreaterThan(0);
  });
});

describe("selectionPixelRect", () => {
  it("derives the complete visible range outline from viewport state", () => {
    const view = new SheetViewport({
      rows: 20,
      cols: 10,
      rowHeight: 24,
      colWidth: 100,
    });
    view.resize(440, 220);
    view.select({ row: 1, col: 1 });
    view.extendSelection({ row: 3, col: 3 });

    expect(selectionPixelRect(view)).toEqual({
      x: 140,
      y: 52,
      width: 300,
      height: 72,
    });
  });
});
