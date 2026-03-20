# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start development mode with hot reload
npm run build      # Build for production
npm run lint       # Run ESLint
npm run fix-lint   # Run ESLint with auto-fix
npm run publish    # Publish to Raycast Store
```

## Architecture

Two Raycast commands share a common parsing and Reminders integration layer.

### Source files

```
src/
├── quickly-add-todo.ts     # Command 1 (no-view): receives LaunchProps argument, parse → add
├── add-reminder-view.tsx   # Command 2 (view): List-based form with live prefix parsing
├── parse-input.ts          # Pure prefix parser — parseInput() + reconstructInput()
├── add-reminder.ts         # EventKit ObjC bridge via runAppleScript (language: "JavaScript")
├── get-reminder-lists.ts   # JXA helper — returns list names from Reminders for autocomplete
└── tag-history.ts          # LocalStorage helper — getTagHistory / saveTagsToHistory / removeTagFromHistory
```

### Prefix syntax

| Prefix | Effect | Reminders value |
|--------|--------|-----------------|
| `!` / `!!` / `!!!` | Priority low / medium / high | EKReminder priority 9 / 5 / 1 |
| `@[date/time]` | Due date (bare `@` = today) | `dueDateComponents` |
| `/[list]` | Target list (falls back to default) | `EKCalendar` |
| `#[tag]` | Kept in title as-is (Apple scripting cannot set tags) | reminder title |

Supported `@` formats: `@today`, `@tomorrow`, `@10:00`, `@2026-03-16`, `@2026-03-16 15:33`.

### parse-input.ts

`parseInput(raw)` runs a `while` loop consuming one prefix token per iteration via **three** regexes (`!`, `@`, `/`). `#tag` tokens are **not** consumed — they remain in the title. After the loop, tags are extracted from the title via a separate `/#(\S+)/g` scan and returned in `tags[]` for history/autocomplete purposes only. Returns `ParsedInput: { title, priority, dueDate, dueDateHasTime, list, tags }`.

`reconstructInput(parsed)` rebuilds the raw prefix string from a `ParsedInput`. Tags are already embedded in `title`, so they are not added separately. Used by `add-reminder-view.tsx` to sync field changes back to the search bar text.

`dueDateHasTime: false` for `@today` / `@tomorrow` / `@YYYY-MM-DD` (date-only); `true` for formats that include a time.

### add-reminder.ts

Uses `runAppleScript` from `@raycast/utils` with `language: "JavaScript"` and the **EventKit ObjC bridge** (`ObjC.import('EventKit')`).

- **Date-only reminders** (`dueDateHasTime: false`): sets `NSDateComponents` without `hour`/`minute` → Reminders shows the date with no time and no overdue warning.
- **Timed reminders** (`dueDateHasTime: true`): sets `NSDateComponents` with `hour` and `minute`.
- All user values travel via `argv[]` — never interpolated into the script string.
- ObjC no-argument methods use property access syntax (`$.EKEventStore.new`, not `.new()`).

### add-reminder-view.tsx

List-based view (`<List searchText={text} filtering={false}>`). `text` is the single source of truth; everything is derived from `parseInput(text)`.

**Autocomplete**: detects the **last** `/\S*`, `@\S*`, or `#\S*` token anywhere in `text` via greedy regex (`/.*(\/\S*)/`, `/.*(@\S*)/`, `/.*(#\S*)/`).
- List and date: token is removed from its position and the completed prefix is prepended to the front; an existing prefix of the same type at the front is replaced.
- Tag: token is replaced **in-place** (no front-placement) with the completed tag followed by a space. Multiple tags are allowed so there is no "replace existing" step.

**Tag history** (`tag-history.ts`): on every successful submit, `tags[]` from `ParsedInput` are saved to `LocalStorage` (latest-first, max 50). In the tag autocomplete section each suggestion has a `⌘⇧⌫` action to remove it from history.

**Field interaction**: each parsed-preview row has an `ActionPanel` whose actions call `applyChange(patch)` → `reconstructInput` → `setText`.

## Key constraints

- `runAppleScript` must be imported from `@raycast/utils`, not `@raycast/api`.
- ObjC bridge: no-argument methods are **property access** (no `()`): `$.EKEventStore.new`, `$.NSDateComponents.new`.
- Tags cannot be set via any Apple scripting API. `#tag` tokens are kept in the reminder title as plain text instead.
- `no-view` command: feedback via `showHUD` / `showToast` only; no React rendering.
- macOS only at runtime despite `platforms` listing Windows in `package.json`.
