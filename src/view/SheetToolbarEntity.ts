import { Entity, type A11yAttributes, type IRenderer } from "@vectojs/core";

export type SheetToolbarAction =
  | "export-json"
  | "export-csv"
  | "import-xlsx"
  | "export-xlsx"
  | "insert-row"
  | "delete-row"
  | "insert-column"
  | "delete-column"
  | "sort-ascending"
  | "sort-descending";

interface ToolbarCommand {
  id: SheetToolbarAction;
  text: string;
  label: string;
  width: number;
}

const COMMANDS: readonly ToolbarCommand[] = [
  {
    id: "export-json",
    text: "JSON",
    label: "Export workbook as JSON",
    width: 48,
  },
  {
    id: "export-csv",
    text: "CSV",
    label: "Export selection as CSV",
    width: 44,
  },
  { id: "insert-row", text: "+R", label: "Insert rows", width: 44 },
  { id: "delete-row", text: "−R", label: "Delete rows", width: 44 },
  { id: "insert-column", text: "+C", label: "Insert columns", width: 44 },
  { id: "delete-column", text: "−C", label: "Delete columns", width: 44 },
  {
    id: "sort-ascending",
    text: "A↑",
    label: "Sort selection ascending",
    width: 44,
  },
  {
    id: "sort-descending",
    text: "A↓",
    label: "Sort selection descending",
    width: 44,
  },
  {
    id: "import-xlsx",
    text: "Import",
    label: "Import XLSX workbook",
    width: 64,
  },
  {
    id: "export-xlsx",
    text: "XLSX",
    label: "Export XLSX workbook",
    width: 58,
  },
] as const;

const BUTTON_HEIGHT = 44;
const BUTTON_GAP = 4;
const EDGE_PADDING = 8;
const STATUS_HEIGHT = 16;

class ToolbarButtonEntity extends Entity {
  private hovered = false;
  private pressed = false;
  private focused = false;

  constructor(
    readonly command: ToolbarCommand,
    onAction: (action: SheetToolbarAction) => void,
  ) {
    super();
    this.width = command.width;
    this.height = BUTTON_HEIGHT;
    this.interactive = true;
    this.on("click", () => onAction(command.id));
    this.on("hover", () => this.setVisualState("hovered", true));
    this.on("pointerleave", () => {
      this.setVisualState("hovered", false);
      this.setVisualState("pressed", false);
    });
    this.on("pointerdown", () => this.setVisualState("pressed", true));
    this.on("pointerup", () => this.setVisualState("pressed", false));
    this.on("focus", () => this.setVisualState("focused", true));
    this.on("blur", () => this.setVisualState("focused", false));
  }

  getA11yAttributes(): A11yAttributes {
    return { tag: "button", role: "button", label: this.command.label };
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

  render(renderer: IRenderer): void {
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 6);
    renderer.fill(
      this.pressed ? "#dbeafe" : this.hovered ? "#eff6ff" : "#ffffff",
    );
    if (this.focused) renderer.stroke("#1a73e8", 2);
    renderer.fillText(
      this.command.text,
      Math.max(8, (this.width - this.command.text.length * 7) / 2),
      27,
      "600 12px Inter, sans-serif",
      "#334155",
    );
  }

  private setVisualState(
    key: "hovered" | "pressed" | "focused",
    value: boolean,
  ): void {
    if (this[key] === value) return;
    this[key] = value;
    this.scene?.markDirty();
  }
}

class ToolbarStatusEntity extends Entity {
  constructor(private text: string) {
    super();
    this.height = STATUS_HEIGHT;
    this.interactive = true;
  }

  setText(text: string): void {
    this.text = text;
  }

  getA11yAttributes(): A11yAttributes {
    return { role: "status", label: this.text };
  }

  isPointInside(): boolean {
    return false;
  }

  render(renderer: IRenderer): void {
    const maximumCharacters = Math.max(1, Math.floor(this.width / 6.5));
    const text =
      this.text.length > maximumCharacters
        ? `${this.text.slice(0, Math.max(0, maximumCharacters - 1))}…`
        : this.text;
    renderer.fillText(
      text,
      0,
      12,
      "500 11px Inter, sans-serif",
      this.text.startsWith("Import failed") ? "#b91c1c" : "#475569",
    );
  }
}

/** Canvas-native command bar whose actions remain VMT-addressable at every width. */
export class SheetToolbarEntity extends Entity {
  private readonly buttons: ToolbarButtonEntity[];
  private statusEntity: ToolbarStatusEntity | null = null;

  constructor(onAction: (action: SheetToolbarAction) => void) {
    super();
    this.interactive = true;
    this.buttons = COMMANDS.map(
      (command) => new ToolbarButtonEntity(command, onAction),
    );
    for (const button of this.buttons) this.add(button);
  }

  /** Reflow commands within the available logical width. */
  resize(width: number): void {
    this.width = width;
    let x = EDGE_PADDING;
    let y = EDGE_PADDING;
    const rightEdge = Math.max(EDGE_PADDING, width - EDGE_PADDING);
    for (const button of this.buttons) {
      if (x > EDGE_PADDING && x + button.width > rightEdge) {
        x = EDGE_PADDING;
        y += BUTTON_HEIGHT + BUTTON_GAP;
      }
      button.setPosition(x, y);
      x += button.width + BUTTON_GAP;
    }
    const statusY = y + BUTTON_HEIGHT + BUTTON_GAP;
    this.height = statusY + STATUS_HEIGHT + EDGE_PADDING;
    if (this.statusEntity) {
      this.statusEntity.setPosition(EDGE_PADDING, statusY);
      this.statusEntity.width = Math.max(0, width - EDGE_PADDING * 2);
    }
  }

  setStatus(status: string): void {
    if (!status) {
      if (this.statusEntity) this.remove(this.statusEntity);
      this.statusEntity = null;
      this.scene?.markDirty();
      return;
    }
    if (!this.statusEntity) {
      this.statusEntity = new ToolbarStatusEntity(status);
      this.add(this.statusEntity);
    } else this.statusEntity.setText(status);
    this.resize(this.width);
    this.scene?.markDirty();
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
      label: "Spreadsheet structure and export toolbar with data sorting",
    };
  }

  render(renderer: IRenderer): void {
    renderer.beginPath();
    renderer.roundRect(0, 0, this.width, this.height, 0);
    renderer.fill("#f8fafc");
  }
}
