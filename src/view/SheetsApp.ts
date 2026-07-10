import { Scene } from "@vectojs/core";
import { Input } from "@vectojs/ui";
import { SheetHistory } from "../model/SheetHistory";
import { copyRange, pasteText } from "../model/SheetClipboard";
import { SheetModel } from "../model/SheetModel";
import { SheetGridEntity } from "./SheetGridEntity";
import { type CellPosition, SheetViewport } from "./SheetViewport";

const TOOLBAR_HEIGHT = 48;

/** Pure interaction state shared by canvas input and the native editor. */
export class SheetController {
  editing: CellPosition | null = null;
  draft = "";
  readonly history: SheetHistory;

  constructor(
    readonly model: SheetModel,
    readonly viewport: SheetViewport,
  ) {
    this.history = new SheetHistory(model);
  }

  select(cell: CellPosition): void {
    this.viewport.select(cell);
    this.viewport.ensureVisible(this.viewport.selected);
  }

  extendSelection(cell: CellPosition): void {
    this.viewport.extendSelection(cell);
    this.viewport.ensureVisible(this.viewport.selected);
  }

  moveSelection(rowDelta: number, colDelta: number, extend = false): void {
    this.viewport.moveSelection(rowDelta, colDelta, extend);
    this.viewport.ensureVisible(this.viewport.selected);
  }

  scroll(deltaX: number, deltaY: number): void {
    this.viewport.scrollBy(deltaX, deltaY);
  }

  beginEdit(initialValue?: string): string {
    this.editing = { ...this.viewport.selected };
    this.draft =
      initialValue ?? this.model.getRaw(this.editing.row, this.editing.col);
    return this.draft;
  }

  setDraft(value: string): void {
    this.draft = value;
  }

  commitEdit(value = this.draft): void {
    if (!this.editing) return;
    this.history.apply([
      { row: this.editing.row, col: this.editing.col, raw: value },
    ]);
    this.editing = null;
    this.draft = "";
  }

  cancelEdit(): void {
    this.editing = null;
    this.draft = "";
  }

  writeSelected(raw: string): void {
    const { row, col } = this.viewport.selected;
    this.history.apply([{ row, col, raw }]);
  }

  undo(): void {
    this.history.undo();
  }

  redo(): void {
    this.history.redo();
  }

  copySelection(): string {
    return copyRange(this.model, this.viewport.selectionRange());
  }

  paste(text: string): void {
    this.history.apply(pasteText(text, this.viewport.selected, this.model));
  }
}

/** Canvas shell, formula bar and short-lived native cell editor. */
export class SheetsApp {
  readonly viewport: SheetViewport;
  readonly controller: SheetController;
  readonly grid: SheetGridEntity;
  readonly formulaBar: Input;

  private editor: Input | null = null;
  private lastPointer: { cell: CellPosition; at: number } | null = null;
  private readonly keyboardListener: (event: KeyboardEvent) => void;
  private readonly copyListener: (event: ClipboardEvent) => void;
  private readonly pasteListener: (event: ClipboardEvent) => void;

  constructor(
    readonly scene: Scene,
    readonly model: SheetModel,
  ) {
    this.viewport = new SheetViewport({
      rows: model.rows,
      cols: model.cols,
      rowHeight: 24,
      colWidth: 112,
    });
    this.controller = new SheetController(model, this.viewport);
    this.grid = new SheetGridEntity(model, this.viewport, {
      onCellPointer: (cell, extend) => this.handleCellPointer(cell, extend),
      onScroll: (x, y) => {
        this.controller.scroll(x, y);
        this.scene.markDirty();
      },
    });
    this.formulaBar = new Input({
      width: 320,
      height: 32,
      placeholder: "Formula bar",
      bg: "#ffffff",
      border: "#cbd5e1",
      color: "#0f172a",
      onChange: (value) => this.controller.setDraft(value),
    });
    this.formulaBar.on(
      "keydown",
      (event: { key?: string; preventDefault(): void }) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        this.commitFormulaBar();
      },
    );
    this.formulaBar.on("blur", () => this.commitFormulaBar());

    this.scene.add(this.grid);
    this.scene.add(this.formulaBar);
    this.syncFormulaBar();
    this.keyboardListener = (event) => this.handleKeyboard(event);
    this.copyListener = (event) => this.handleCopy(event);
    this.pasteListener = (event) => this.handlePaste(event);
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.keyboardListener);
      window.addEventListener("copy", this.copyListener);
      window.addEventListener("paste", this.pasteListener);
    }
  }

  resize(width: number, height: number): void {
    this.scene.resize(width, height);
    this.grid.setPosition(0, TOOLBAR_HEIGHT);
    this.grid.resize(width, Math.max(0, height - TOOLBAR_HEIGHT));
    this.formulaBar.setPosition(64, 8);
    this.formulaBar.width = Math.max(120, width - 76);
    this.scene.markDirty();
  }

  destroy(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.keyboardListener);
      window.removeEventListener("copy", this.copyListener);
      window.removeEventListener("paste", this.pasteListener);
    }
    this.removeEditor(false);
  }

  private handleCellPointer(cell: CellPosition, extend: boolean): void {
    const now = performance.now();
    const isDoublePointer =
      this.lastPointer !== null &&
      this.lastPointer.cell.row === cell.row &&
      this.lastPointer.cell.col === cell.col &&
      now - this.lastPointer.at < 350;
    this.lastPointer = { cell, at: now };
    if (extend) this.controller.extendSelection(cell);
    else this.controller.select(cell);
    if (isDoublePointer) this.beginEdit();
    else this.syncFormulaBar();
    this.scene.markDirty();
  }

  private handleKeyboard(event: KeyboardEvent): void {
    if (isNativeTextTarget(event.target)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) this.controller.redo();
      else this.controller.undo();
      this.syncFormulaBar();
      this.scene.markDirty();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      this.controller.redo();
      this.syncFormulaBar();
      this.scene.markDirty();
      return;
    }
    const movement: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      Tab: [0, event.shiftKey ? -1 : 1],
      Enter: [1, 0],
    };
    if (event.key === "F2") {
      event.preventDefault();
      this.beginEdit();
      return;
    }
    if (event.key === "Enter" && !this.controller.editing) {
      event.preventDefault();
      this.beginEdit();
      return;
    }
    const delta = movement[event.key];
    if (delta) {
      event.preventDefault();
      this.controller.moveSelection(delta[0], delta[1], event.shiftKey);
      this.syncFormulaBar();
      this.scene.markDirty();
      return;
    }
    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      this.beginEdit(event.key);
    }
  }

  private handleCopy(event: ClipboardEvent): void {
    if (isNativeTextTarget(document.activeElement)) return;
    event.preventDefault();
    event.clipboardData?.setData("text/plain", this.controller.copySelection());
  }

  private handlePaste(event: ClipboardEvent): void {
    if (isNativeTextTarget(document.activeElement)) return;
    const text = event.clipboardData?.getData("text/plain");
    if (text === undefined) return;
    event.preventDefault();
    this.controller.paste(text);
    this.syncFormulaBar();
    this.scene.markDirty();
  }

  private beginEdit(initialValue?: string): void {
    if (this.editor) return;
    const value = this.controller.beginEdit(initialValue);
    const rect = this.viewport.cellRect(this.viewport.selected);
    const editor = new Input({
      width: rect.width,
      height: rect.height,
      value,
      placeholder: "Cell editor",
      bg: "#ffffff",
      border: "#1a73e8",
      color: "#0f172a",
      radius: 0,
      padding: 6,
      onChange: (next) => this.controller.setDraft(next),
    });
    editor.setPosition(rect.x, TOOLBAR_HEIGHT + rect.y);
    editor.on("keydown", (event: { key?: string; preventDefault(): void }) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.removeEditor(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.removeEditor(false);
      }
    });
    editor.on("blur", () => this.removeEditor(true));
    this.editor = editor;
    this.scene.add(editor);
    this.scene.markDirty();
    requestAnimationFrame(() => this.scene.getA11yElement(editor.id)?.focus());
  }

  private removeEditor(commit: boolean): void {
    if (!this.editor) return;
    const editor = this.editor;
    this.editor = null;
    if (commit) this.controller.commitEdit(editor.value);
    else this.controller.cancelEdit();
    this.scene.remove(editor);
    this.syncFormulaBar();
    this.scene.markDirty();
  }

  private commitFormulaBar(): void {
    if (this.editor) return;
    this.controller.select(this.viewport.selected);
    this.controller.writeSelected(this.formulaBar.value);
    this.syncFormulaBar();
    this.scene.markDirty();
  }

  private syncFormulaBar(): void {
    const { row, col } = this.viewport.selected;
    this.formulaBar.value = this.model.getRaw(row, col);
  }
}

function isNativeTextTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
  );
}
