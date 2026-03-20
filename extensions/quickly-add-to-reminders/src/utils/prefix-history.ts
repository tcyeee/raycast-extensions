import { LocalStorage } from "@raycast/api";

const STORAGE_KEY = "prefix-history";
const MAX_ENTRIES = 20;

export async function getPrefixHistory(): Promise<string[]> {
  const raw = await LocalStorage.getItem<string>(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

/** Prepend the new prefix, deduplicate, keep latest 20. */
export async function savePrefixToHistory(prefix: string): Promise<void> {
  if (!prefix.trim()) return;
  const existing = await getPrefixHistory();
  const merged = [prefix, ...existing.filter((p) => p !== prefix)].slice(0, MAX_ENTRIES);
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
}

export async function removePrefixFromHistory(prefix: string): Promise<void> {
  const existing = await getPrefixHistory();
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(existing.filter((p) => p !== prefix)));
}
