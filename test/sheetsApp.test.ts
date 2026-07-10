import { describe, expect, it } from "bun:test";
import { SheetModel } from "../src/model/SheetModel";
import { SheetController, SheetsApp } from "../src/view/SheetsApp";
import { SheetViewport } from "../src/view/SheetViewport";

function createController(): {
  model: SheetModel;
  controller: SheetController;
} {
  const model = new SheetModel(20, 10);
  const viewport = new SheetViewport({
    rows: model.rows,
    cols: model.cols,
    rowHeight: 24,
    colWidth: 100,
  });
  viewport.resize(340, 148);
  return { model, controller: new SheetController(model, viewport) };
}

describe("SheetController", () => {
  it("commits an edit to the active cell and recalculates its formula", () => {
    const { model, controller } = createController();
    controller.select({ row: 0, col: 0 });

    controller.beginEdit();
    controller.commitEdit("=1+2");

    expect(controller.editing).toBeNull();
    expect(model.getRaw(0, 0)).toBe("=1+2");
    expect(model.getDisplay(0, 0)).toBe("3");

    controller.undo();
    expect(model.getRaw(0, 0)).toBe("");
    controller.redo();
    expect(model.getDisplay(0, 0)).toBe("3");
  });

  it("cancels an edit without replacing the stored raw value", () => {
    const { model, controller } = createController();
    model.setCell(0, 0, "original");
    controller.beginEdit();
    controller.cancelEdit();

    expect(controller.editing).toBeNull();
    expect(model.getRaw(0, 0)).toBe("original");
  });

  it("moves selection and scrolls it into view", () => {
    const { controller } = createController();

    controller.moveSelection(12, 8);

    expect(controller.viewport.selected).toEqual({ row: 12, col: 8 });
    expect(controller.viewport.visibleRange()).toEqual({
      rowStart: 8,
      rowEnd: 12,
      colStart: 6,
      colEnd: 8,
    });
  });

  it("copies a selection and pastes it as one undoable transaction", () => {
    const { model, controller } = createController();
    model.setCell(0, 0, "1");
    model.setCell(0, 1, "=A1+1");
    controller.select({ row: 0, col: 0 });
    controller.extendSelection({ row: 0, col: 1 });

    expect(controller.copySelection()).toBe("1\t=A1+1");
    controller.select({ row: 2, col: 0 });
    controller.paste("3\t=A3+1");
    expect(model.getDisplay(2, 1)).toBe("4");

    controller.undo();
    expect(model.getRaw(2, 0)).toBe("");
    expect(model.getRaw(2, 1)).toBe("");
  });
});

describe("SheetsApp", () => {
  it("reflects the initially selected cell in the formula bar", () => {
    const model = new SheetModel();
    model.setCell(0, 0, "Month");
    const scene = {
      add: () => scene,
      markDirty: () => undefined,
      remove: () => scene,
      resize: () => undefined,
    };

    const app = new SheetsApp(scene as never, model);

    expect(app.formulaBar.value).toBe("Month");
  });
});
