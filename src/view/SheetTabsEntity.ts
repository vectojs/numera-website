import { Entity, type A11yAttributes, type IRenderer } from "@vectojs/core";
import { Workbook } from "@vectojs/sheets-core";

const TAB_WIDTH = 120;
const ADD_WIDTH = 36;

/** One canvas tab strip: it reads the pure workbook order and emits intentions. */
export class SheetTabsEntity extends Entity {
  constructor(
    private readonly workbook: Workbook,
    private readonly events: { onSelect(id: string): void; onAdd(): void },
  ) {
    super();
    this.interactive = true;
    this.on("pointerdown", (event: { localX?: number }) => {
      if (event.localX === undefined) return;
      const index = Math.floor(event.localX / TAB_WIDTH);
      const sheet = this.workbook.sheets[index];
      if (sheet) this.events.onSelect(sheet.id);
      else if (
        event.localX <
        this.workbook.sheets.length * TAB_WIDTH + ADD_WIDTH
      )
        this.events.onAdd();
    });
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
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
    return {
      role: "toolbar",
      label: `Workbook sheets, active ${this.workbook.activeSheet.name}`,
    };
  }

  render(renderer: IRenderer): void {
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 0);
    renderer.fill("#f8fafc");
    for (const [index, sheet] of this.workbook.sheets.entries()) {
      const x = index * TAB_WIDTH;
      const active = sheet.id === this.workbook.activeSheetId;
      renderer.beginPath();
      renderer.roundRect(x + 4, 4, TAB_WIDTH - 8, this.height - 4, 6);
      renderer.fill(active ? "#ffffff" : "#e2e8f0");
      if (active) {
        renderer.beginPath();
        renderer.moveTo(x + 4, this.height - 2);
        renderer.lineTo(x + TAB_WIDTH - 4, this.height - 2);
        renderer.stroke("#1a73e8", 2);
      }
      renderer.fillText(
        sheet.name,
        x + 12,
        21,
        "600 12px Inter, sans-serif",
        active ? "#1a73e8" : "#475569",
      );
    }
    const addX = this.workbook.sheets.length * TAB_WIDTH;
    renderer.fillText(
      "+",
      addX + 12,
      22,
      "600 20px Inter, sans-serif",
      "#475569",
    );
  }
}
