import { describe, expect, it } from "bun:test";
import {
  fillHandleRect,
  headerResizeTargetAt,
  SheetGridEntity,
  selectionPixelRect,
  visibleCellCount,
} from "../src/view/SheetGridEntity";
import { SheetModel } from "@vectojs/numera-core";
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

  it("derives resize edges and a fill handle from viewport numbers", () => {
    const view = new SheetViewport({
      rows: 20,
      cols: 10,
      rowHeight: 24,
      colWidth: 100,
    });
    view.resize(440, 220);

    expect(headerResizeTargetAt(view, 20, 52)).toEqual({
      axis: "row",
      index: 0,
      size: 24,
    });
    expect(headerResizeTargetAt(view, 140, 12)).toEqual({
      axis: "column",
      index: 0,
      size: 100,
    });
    expect(fillHandleRect(view)).toEqual({
      x: 136,
      y: 48,
      width: 8,
      height: 8,
    });
  });
});

describe("SheetGridEntity pointer selection", () => {
  it("maps a captured pointer drag into body-cell callbacks", () => {
    const view = new SheetViewport({
      rows: 20,
      cols: 10,
      rowHeight: 24,
      colWidth: 100,
    });
    view.resize(440, 220);
    const events: string[] = [];
    const grid = new SheetGridEntity(new SheetModel(20, 10), view, {
      onCellPointerDown: (cell, extend) =>
        events.push(`down:${cell.row}:${cell.col}:${extend}`),
      onCellPointerMove: (cell) => events.push(`move:${cell.row}:${cell.col}`),
      onCellPointerUp: () => events.push("up"),
    });

    grid.emit("pointerdown", { localX: 40, localY: 28 });
    grid.emit("pointermove", { localX: 240, localY: 76 });
    grid.emit("pointerup", {});

    expect(events).toEqual(["down:0:0:false", "move:2:2", "up"]);
  });

  it("routes header resize and fill-handle drags as numeric intents", () => {
    const view = new SheetViewport({
      rows: 20,
      cols: 10,
      rowHeight: 24,
      colWidth: 100,
    });
    view.resize(440, 220);
    const events: string[] = [];
    const grid = new SheetGridEntity(new SheetModel(20, 10), view, {
      onAxisResize: (axis, index, size) =>
        events.push(`resize:${axis}:${index}:${size}`),
      onFill: (target) =>
        events.push(`fill:${target.r1}:${target.c1}:${target.r2}:${target.c2}`),
    });

    grid.emit("pointerdown", { localX: 20, localY: 52 });
    grid.emit("pointermove", { localX: 20, localY: 68 });
    grid.emit("pointerup", {});
    grid.emit("pointerdown", { localX: 140, localY: 52 });
    grid.emit("pointermove", { localX: 140, localY: 92 });
    grid.emit("pointerup", {});

    expect(events).toEqual(["resize:row:0:40", "fill:0:0:2:0"]);
  });
});
