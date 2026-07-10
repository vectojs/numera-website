import { Workbook, type WorkbookSnapshot } from "@vectojs/sheets-core";

export const WORKBOOK_STORAGE_KEY = "vectojs-sheets:workbook:v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function restoreWorkbook(
  storage: StorageLike,
  fallback: () => Workbook,
): Workbook {
  const raw = storage.getItem(WORKBOOK_STORAGE_KEY);
  if (!raw) return fallback();
  try {
    return Workbook.fromSnapshot(JSON.parse(raw) as WorkbookSnapshot);
  } catch {
    return fallback();
  }
}

export function persistWorkbook(
  storage: StorageLike,
  workbook: Workbook,
): void {
  storage.setItem(WORKBOOK_STORAGE_KEY, JSON.stringify(workbook.toSnapshot()));
}
