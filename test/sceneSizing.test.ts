import { describe, expect, it } from "bun:test";
import { measureSceneContainer } from "../src/view/sceneSizing";

describe("measureSceneContainer", () => {
  it("uses the layout container rather than the canvas backing-store defaults", () => {
    expect(
      measureSceneContainer({ clientWidth: 1280, clientHeight: 720 }),
    ).toEqual({ width: 1280, height: 720 });
  });

  it("does not return negative dimensions", () => {
    expect(measureSceneContainer({ clientWidth: -1, clientHeight: 0 })).toEqual(
      { width: 0, height: 0 },
    );
  });
});
