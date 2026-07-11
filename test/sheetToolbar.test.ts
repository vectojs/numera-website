import { describe, expect, it } from "bun:test";
import type { Entity } from "@vectojs/core";
import {
  SheetToolbarEntity,
  type SheetToolbarAction,
} from "../src/view/SheetToolbarEntity";

function projectedChildren(toolbar: SheetToolbarEntity): Entity[] {
  return toolbar.children.filter((child) => child.getA11yAttributes() !== null);
}

describe("SheetToolbarEntity", () => {
  it("projects every command as a keyboard-operable button", () => {
    const actions: SheetToolbarAction[] = [];
    const toolbar = new SheetToolbarEntity((action) => actions.push(action));

    toolbar.resize(375);

    const buttons = projectedChildren(toolbar).filter(
      (child) => child.getA11yAttributes()?.role === "button",
    );
    expect(buttons).toHaveLength(10);
    expect(buttons.map((button) => button.getA11yAttributes()?.label)).toEqual([
      "Export workbook as JSON",
      "Export selection as CSV",
      "Insert rows",
      "Delete rows",
      "Insert columns",
      "Delete columns",
      "Sort selection ascending",
      "Sort selection descending",
      "Import XLSX workbook",
      "Export XLSX workbook",
    ]);
    for (const button of buttons) {
      expect(button.getA11yAttributes()?.tag).toBe("button");
      expect(button.width).toBeGreaterThanOrEqual(44);
      expect(button.height).toBeGreaterThanOrEqual(44);
      expect(button.x + button.width).toBeLessThanOrEqual(toolbar.width - 8);
      expect(button.y + button.height).toBeLessThanOrEqual(toolbar.height);
    }

    buttons[6].emit("click", {});
    expect(actions).toEqual(["sort-ascending"]);
  });

  it("keeps a stable toolbar name and exposes feedback through status semantics", () => {
    const toolbar = new SheetToolbarEntity(() => undefined);
    toolbar.resize(600);
    const initialName = toolbar.getA11yAttributes().label;

    toolbar.setStatus("Sorted 2 rows ascending by A.");

    expect(toolbar.getA11yAttributes().label).toBe(initialName);
    const status = projectedChildren(toolbar).find(
      (child) => child.getA11yAttributes()?.role === "status",
    );
    expect(status?.getA11yAttributes()?.label).toBe(
      "Sorted 2 rows ascending by A.",
    );
  });
});
