import { List, ActionPanel, Action, showHUD, showToast, Toast, Color, Icon, useNavigation } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { parseInput, reconstructInput, ReminderPriority } from "./utils/parse-input";
import { addReminder } from "./utils/add-reminder";
import { getReminderLists } from "./utils/get-reminder-lists";
import { getTagHistory, saveTagsToHistory, removeTagFromHistory } from "./utils/tag-history";
import { getPrefixHistory, savePrefixToHistory, removePrefixFromHistory } from "./utils/prefix-history";

const PRIORITY_OPTIONS: { value: string; title: string }[] = [
  { value: "0", title: "None" },
  { value: "9", title: "!  Low" },
  { value: "5", title: "!!  Medium" },
  { value: "1", title: "!!!  High" },
];

function formatDate(date: Date | null, hasTime: boolean): string {
  if (!date) return "—";
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  if (!hasTime) return `${y}-${mo}-${d}`;
  return `${y}-${mo}-${d} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function AddReminderView() {
  const [text, setText] = useState("");
  const { pop } = useNavigation();
  const { data: lists = [] } = useCachedPromise(getReminderLists);
  const { data: tagHistory = [], revalidate: revalidateTagHistory } = useCachedPromise(getTagHistory);
  const { data: prefixHistory = [], revalidate: revalidatePrefixHistory } = useCachedPromise(getPrefixHistory);

  const parsed = parseInput(text);

  // ── List autocomplete ──────────────────────────────────────────────────────
  // Detect the LAST /xxx token anywhere in the text so "/" can be typed anywhere.
  // Greedy .* ensures we match the rightmost occurrence.
  const lastListTokenMatch = text.match(/.*(\/\S*)/);
  const lastListToken = lastListTokenMatch ? lastListTokenMatch[1] : null;
  const listQuery = lastListToken ? lastListToken.slice(1).toLowerCase() : null;

  const listSuggestions =
    lastListToken !== null
      ? lists.filter((l) => l.toLowerCase().startsWith(listQuery ?? "") && l.toLowerCase() !== (listQuery ?? ""))
      : [];

  function completeList(listName: string) {
    if (!lastListToken) return;
    const idx = text.lastIndexOf(lastListToken);
    const without = (text.slice(0, idx) + text.slice(idx + lastListToken.length)).replace(/\s+/g, " ").trim();
    const reparsed = parseInput(without);
    setText(reconstructInput({ ...reparsed, list: listName }) + " ");
  }

  // ── Date autocomplete ──────────────────────────────────────────────────────
  const DATE_NAMED = ["today", "tomorrow"];

  // Detect the LAST @xxx token anywhere in the text.
  const lastDateTokenMatch = text.match(/.*(@\S*)/);
  const lastDateToken = lastDateTokenMatch ? lastDateTokenMatch[1] : null;
  const dateQuery = lastDateToken ? lastDateToken.slice(1).toLowerCase() : null;

  const dateSuggestions =
    lastDateToken !== null ? DATE_NAMED.filter((d) => d.startsWith(dateQuery ?? "") && d !== dateQuery) : [];

  function completeDate(suggestion: string) {
    if (!lastDateToken) return;
    const idx = text.lastIndexOf(lastDateToken);
    const without = (text.slice(0, idx) + text.slice(idx + lastDateToken.length)).replace(/\s+/g, " ").trim();
    const reparsed = parseInput(without);
    const now = new Date();
    const dueDate =
      suggestion === "tomorrow"
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
        : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    setText(reconstructInput({ ...reparsed, dueDate, dueDateHasTime: false }) + " ");
  }

  // ── Tag autocomplete ───────────────────────────────────────────────────────
  // Detect the LAST #xxx token anywhere in the text.
  const lastTagTokenMatch = text.match(/.*(#\S*)/);
  const lastTagToken = lastTagTokenMatch ? lastTagTokenMatch[1] : null;
  const tagQuery = lastTagToken ? lastTagToken.slice(1).toLowerCase() : null;

  const tagSuggestions =
    lastTagToken !== null
      ? tagHistory.filter((t) => t.toLowerCase().startsWith(tagQuery ?? "") && t.toLowerCase() !== (tagQuery ?? ""))
      : [];

  function completeTag(tagName: string) {
    if (!lastTagToken) return;
    const idx = text.lastIndexOf(lastTagToken);
    const intermediate = (text.slice(0, idx) + `#${tagName} ` + text.slice(idx + lastTagToken.length))
      .replace(/\s+/g, " ")
      .trimStart();
    const reparsed = parseInput(intermediate);
    setText(reconstructInput(reparsed) + " ");
  }

  function applyChange(patch: Partial<typeof parsed>) {
    setText(reconstructInput({ ...parsed, ...patch }));
  }

  // The prefix string is everything except the non-tag title text: "!!! /dev @today #raycast #extension"
  const prefixStr = reconstructInput({ ...parsed, title: parsed.tags.map((t) => `#${t}`).join(" ") }).trim();

  // Show history when the input is empty or the text exactly matches a saved prefix (browsing mode).
  const showHistory =
    prefixHistory.length > 0 && (text.trim() === "" || prefixHistory.some((p) => text.trimEnd() === p));

  async function handleAdd() {
    if (!parsed.title.trim()) {
      await showToast({ style: Toast.Style.Failure, title: "Task title cannot be empty" });
      return;
    }
    await addReminder(parsed);
    if (parsed.tags.length > 0) await saveTagsToHistory(parsed.tags);
    if (prefixStr) await savePrefixToHistory(prefixStr);
    await showHUD(`Added: ${parsed.title}`);
    pop();
  }

  // Shared "Add" action — always accessible via ⌘↩ from any item.
  const addAction = (
    <Action
      title="Add to Reminders"
      icon={Icon.Plus}
      shortcut={{ modifiers: ["cmd"], key: "return" }}
      onAction={handleAdd}
    />
  );

  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  return (
    <List
      searchText={text}
      onSearchTextChange={setText}
      filtering={false}
      searchBarPlaceholder="!! @tomorrow /List Task title"
    >
      {/* ── Prefix history (shown when input is empty or matches a saved prefix) ── */}
      {showHistory && (
        <List.Section title="Recent Prefixes  ·  ↩ to fill  ·  ⌘⇧⌫ to remove">
          {prefixHistory.map((prefix) => (
            <List.Item
              key={prefix}
              title={`${prefix} `}
              icon={Icon.Clock}
              actions={
                <ActionPanel>
                  <Action title="Use Prefix" onAction={() => setText(prefix + " ")} />
                  <Action
                    title="Remove from History"
                    icon={Icon.Trash}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "delete" }}
                    onAction={async () => {
                      await removePrefixFromHistory(prefix);
                      revalidatePrefixHistory();
                    }}
                  />
                  {addAction}
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {/* ── List autocomplete (↩ to select, replaces /xxx with /ListName) ── */}
      {listSuggestions.length > 0 && (
        <List.Section title="Complete List Name  ·  ↩ to select">
          {listSuggestions.map((l) => (
            <List.Item
              key={l}
              title={`/${l}`}
              icon={{ source: Icon.CircleFilled, tintColor: Color.Orange }}
              actions={
                <ActionPanel>
                  <Action title={`Use /${l}`} onAction={() => completeList(l)} />
                  {addAction}
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {/* ── Date autocomplete (↩ to select, replaces @xxx with @today / @tomorrow) ── */}
      {dateSuggestions.length > 0 && (
        <List.Section title="Complete Date  ·  ↩ to select">
          {dateSuggestions.map((d) => (
            <List.Item
              key={d}
              title={`@${d}`}
              icon={{ source: Icon.Calendar, tintColor: Color.Blue }}
              actions={
                <ActionPanel>
                  <Action title={`Use @${d}`} onAction={() => completeDate(d)} />
                  {addAction}
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {/* ── Tag autocomplete (↩ to select, ⌘⌫ to remove from history) ── */}
      {tagSuggestions.length > 0 && (
        <List.Section title="Complete Tag  ·  ↩ to select  ·  ⌘⇧⌫ to remove">
          {tagSuggestions.map((t) => (
            <List.Item
              key={t}
              title={`#${t}`}
              icon={{ source: Icon.Hashtag, tintColor: Color.Green }}
              actions={
                <ActionPanel>
                  <Action title={`Use #${t}`} onAction={() => completeTag(t)} />
                  <Action
                    title="Remove from History"
                    icon={Icon.Trash}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "delete" }}
                    onAction={async () => {
                      await removeTagFromHistory(t);
                      revalidateTagHistory();
                    }}
                  />
                  {addAction}
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {/* ── Parsed reminder preview (each field is editable via action panel) ── */}
      <List.Section title="Reminder Preview">
        {/* Title */}
        <List.Item
          title={parsed.title || "(enter task title above)"}
          subtitle="Title"
          icon={Icon.Text}
          actions={<ActionPanel>{addAction}</ActionPanel>}
        />

        {/* Priority */}
        <List.Item
          title={PRIORITY_OPTIONS.find((p) => p.value === String(parsed.priority))?.title ?? "None"}
          subtitle="Priority"
          icon={{ source: Icon.Flag, tintColor: parsed.priority ? Color.Red : Color.SecondaryText }}
          actions={
            <ActionPanel>
              <ActionPanel.Section title="Set Priority">
                {PRIORITY_OPTIONS.map(({ value, title }) => (
                  <Action
                    key={value}
                    title={title}
                    onAction={() => applyChange({ priority: Number(value) as ReminderPriority })}
                  />
                ))}
              </ActionPanel.Section>
              {addAction}
            </ActionPanel>
          }
        />

        {/* List */}
        <List.Item
          title={parsed.list ?? "Default List"}
          subtitle="List"
          icon={{ source: Icon.Dot, tintColor: parsed.list ? Color.Orange : Color.SecondaryText }}
          actions={
            <ActionPanel>
              <ActionPanel.Section title="Select List">
                <Action title="Default List" onAction={() => applyChange({ list: null })} />
                {lists.map((l) => (
                  <Action
                    key={l}
                    title={l}
                    icon={{ source: Icon.CircleFilled, tintColor: Color.Orange }}
                    onAction={() => applyChange({ list: l })}
                  />
                ))}
              </ActionPanel.Section>
              {addAction}
            </ActionPanel>
          }
        />

        {/* Due Date */}
        <List.Item
          title={formatDate(parsed.dueDate, parsed.dueDateHasTime)}
          subtitle="Due Date"
          icon={Icon.Calendar}
          actions={
            <ActionPanel>
              <ActionPanel.Section title="Quick Dates">
                <Action
                  title="Today"
                  onAction={() =>
                    applyChange({
                      dueDate: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
                      dueDateHasTime: false,
                    })
                  }
                />
                <Action title="Tomorrow" onAction={() => applyChange({ dueDate: tomorrow, dueDateHasTime: false })} />
                <Action title="Clear" onAction={() => applyChange({ dueDate: null, dueDateHasTime: false })} />
              </ActionPanel.Section>
              {addAction}
            </ActionPanel>
          }
        />
        {/* Tags */}
        {parsed.tags.length > 0 && (
          <List.Item
            title={parsed.tags.map((t) => `#${t}`).join("  ")}
            subtitle="Tags (display only)"
            icon={{ source: Icon.Hashtag, tintColor: Color.Green }}
            actions={<ActionPanel>{addAction}</ActionPanel>}
          />
        )}
      </List.Section>
    </List>
  );
}
