# AGENTS.md

Guidance for AI agents (Codex, Copilot, etc.) working in this repository.

## Project overview

Raycast extension with two commands that add tasks to Apple Reminders:

1. **`quickly-add-todo`** (no-view) — inline command-line style; user supplies a prefixed string as a Raycast argument.
2. **`add-reminder-view`** (view) — List-based form with a search bar as the text input and a live-parsed preview below; supports autocomplete for list names and dates.

## Source map

| File | Role |
|------|------|
| `src/quickly-add-todo.ts` | Command 1 entry point — reads `LaunchProps.arguments.text`, calls `parseInput` → `addReminder` |
| `src/add-reminder-view.tsx` | Command 2 — `<List>` view with controlled `searchText`; autocomplete + parsed preview |
| `src/parse-input.ts` | Pure parsing — `parseInput()`, `reconstructInput()`, `ParsedInput` interface |
| `src/add-reminder.ts` | Reminders integration — EventKit ObjC bridge via `runAppleScript` |
| `src/get-reminder-lists.ts` | Fetches Reminders list names via JXA for dropdown/autocomplete |
| `src/tag-history.ts` | `LocalStorage` helpers — `getTagHistory`, `saveTagsToHistory`, `removeTagFromHistory` |

## Extending the parser

Only touch `parse-input.ts`:

1. Add the field to `ParsedInput`.
2. Define a regex constant (`/^PREFIX_PATTERN(?:\s+|$)/`).
3. Add an `else if` branch in the `while (changed)` loop in `parseInput`.
4. Handle the new field in `reconstructInput`.

Note: `#tag` is intentionally **not** in the parser loop — tags stay in `title` as plain text and are extracted after the loop via `/#(\S+)/g` for history/autocomplete purposes only.

## Extending the Reminders integration

Only touch `add-reminder.ts`. The EventKit ObjC script receives data through `argv[]` — never interpolate user values into the script string. Add new `argv` positions and update the JXA function body and the TypeScript `runAppleScript` call together.

## Critical API notes

- `runAppleScript` comes from `@raycast/utils`, **not** `@raycast/api`.
- The script uses `language: "JavaScript"` (JXA) with `ObjC.import('EventKit')`.
- **ObjC no-arg methods are property access, not function calls**: `$.EKEventStore.new` ✓ / `$.EKEventStore.new()` ✗. Calling them as functions causes `TypeError: Object is not a function`.
- **Date-only reminders**: pass year/month/day via `dueDateParts` (`"YYYY,M(0-based),D"`); the JXA script sets `NSDateComponents` without `hour`/`minute` so Reminders treats it as all-day (no red overdue warning). Do not pass a timestamp for date-only — even midnight triggers the overdue warning.
- **Tags cannot be set** via any Apple scripting or EventKit API. `#tag` tokens are kept in the reminder title as plain text (e.g. `#app #web Buy milk`). `ParsedInput.tags` is populated by a post-loop scan of the title and is used only for autocomplete history — it is never passed to `add-reminder.ts`.

## Autocomplete logic (add-reminder-view.tsx)

All three autocomplete types use greedy regex to find the **last** token of that type anywhere in `text`:

```
list  /.*(\/\S*)/   → lastListToken
date  /.*(@\S*)/    → lastDateToken
tag   /.*(#\S*)/    → lastTagToken
```

**List and date**: on selection the token is spliced out and the completed prefix is prepended to the front; an existing prefix of the same type at the front is replaced. `/` or `@` can be typed anywhere — the result always ends up at the front.

**Tag**: on selection the token is replaced **in-place** with the completed tag + a space. The tag is not moved to the front because multiple tags are allowed and order within the title matters. Tag suggestions come from `tag-history.ts` (LocalStorage, max 50, latest-first). Each suggestion has a `⌘⇧⌫` action to remove it from history.

## Do not

- Interpolate user input into JXA/ObjC script strings.
- Call ObjC no-arg methods with `()` (causes runtime crash).
- Try to set tags via Apple scripting APIs — it does not work. Tags live in the title only.
- Add React `<Form>` components to the view command — it uses `<List>` intentionally for search-bar-based autocomplete.
