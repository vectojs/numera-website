import { describe, expect, it } from "bun:test";
import { createDemoModel } from "../src/model/demoData";

describe("createDemoModel", () => {
  it("provides a compact formula-driven sheet that demonstrates recalculation", () => {
    const model = createDemoModel();

    expect(model.getDisplay(0, 0)).toBe("Month");
    expect(model.getDisplay(1, 2)).toBe("1540");
    expect(model.getRaw(5, 2)).toBe("=SUM(C2:C5)");
    expect(model.getDisplay(5, 2)).toBe("6160");
  });
});
