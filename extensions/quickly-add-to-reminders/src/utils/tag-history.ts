import { LocalStorage } from "@raycast/api";

const STORAGE_KEY = "tag-history";
const MAX_TAGS = 50;

export async function getTagHistory(): Promise<string[]> {
  const raw = await LocalStorage.getItem<string>(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

/** Prepend new tags, deduplicate, keep latest 50. */
export async function saveTagsToHistory(newTags: string[]): Promise<void> {
  if (newTags.length === 0) return;
  const existing = await getTagHistory();
  const merged = [...newTags, ...existing.filter((t) => !newTags.includes(t))].slice(0, MAX_TAGS);
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
}

export async function removeTagFromHistory(tag: string): Promise<void> {
  const existing = await getTagHistory();
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(existing.filter((t) => t !== tag)));
}
