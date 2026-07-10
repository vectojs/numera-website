import { expect, test } from "bun:test";
import { Workbook } from "@vectojs/numera-core";
import {
  persistWorkbook,
  restoreWorkbook,
  WORKBOOK_STORAGE_KEY,
} from "../src/view/workbookPersistence";

test("restores a versioned workbook snapshot and falls back from corrupt storage", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  const original = new Workbook({ name: "Budget" });
  original.activeSheet.model.setCell(1, 2, "=4+5");
  persistWorkbook(storage, original);

  expect(
    restoreWorkbook(storage, () => new Workbook()).activeSheet.model.getDisplay(
      1,
      2,
    ),
  ).toBe("9");
  values.set(WORKBOOK_STORAGE_KEY, "not json");
  expect(
    restoreWorkbook(storage, () => new Workbook({ name: "Fallback" }))
      .activeSheet.name,
  ).toBe("Fallback");
});
