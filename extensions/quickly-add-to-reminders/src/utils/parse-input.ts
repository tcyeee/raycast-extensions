// Reminders AppleScript priority values: 0=none, 1=high, 5=medium, 9=low
export type ReminderPriority = 0 | 1 | 5 | 9;

export interface ParsedInput {
  title: string;
  priority: ReminderPriority;
  dueDate: Date | null;
  dueDateHasTime: boolean; // false → date-only (@today/@tomorrow/@YYYY-MM-DD); true → explicit time
  list: string | null;
  tags: string[];
}

const PRIORITY_MAP: Record<string, ReminderPriority> = {
  "!!!": 1,
  "!!": 5,
  "!": 9,
};

// Matches: @today @tomorrow @10:00 @2026-03-16 @2026-03-16 15:33 or bare @
const DATE_PREFIX_RE = /^@(today|tomorrow|\d{1,2}:\d{2}|\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2})?)?(?:\s+|$)/;
const PRIORITY_PREFIX_RE = /^(!{1,3})(?:\s+|$)/;
const LIST_PREFIX_RE = /^\/(\S+)(?:\s+|$)/;
const TAG_RE = /#(\S+)/g;

interface ParsedDate {
  date: Date;
  hasTime: boolean;
}

function parseDueDateStr(dateStr: string): ParsedDate {
  const now = new Date();

  if (!dateStr || dateStr === "today") {
    return { date: new Date(now.getFullYear(), now.getMonth(), now.getDate()), hasTime: false };
  }

  if (dateStr === "tomorrow") {
    return { date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), hasTime: false };
  }

  // @10:00 — today at specific time
  const timeOnly = dateStr.match(/^(\d{1,2}):(\d{2})$/);
  if (timeOnly) {
    return {
      date: new Date(now.getFullYear(), now.getMonth(), now.getDate(), +timeOnly[1], +timeOnly[2]),
      hasTime: true,
    };
  }

  // @2026-03-16 15:33
  const dateTime = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (dateTime) {
    return {
      date: new Date(+dateTime[1], +dateTime[2] - 1, +dateTime[3], +dateTime[4], +dateTime[5]),
      hasTime: true,
    };
  }

  // @2026-03-16
  const dateOnly = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return { date: new Date(+dateOnly[1], +dateOnly[2] - 1, +dateOnly[3]), hasTime: false };
  }

  return { date: new Date(now.getFullYear(), now.getMonth(), now.getDate()), hasTime: false };
}

const PRIORITY_PREFIX: Record<number, string> = { 1: "!!!", 5: "!!", 9: "!" };

/** Reconstruct a raw prefix string from a ParsedInput (reverse of parseInput).
 *  Canonical prefix order: ! → / → @ → title (tags stay embedded in title). */
export function reconstructInput({ title, priority, dueDate, dueDateHasTime, list }: ParsedInput): string {
  const parts: string[] = [];

  if (priority && PRIORITY_PREFIX[priority]) parts.push(PRIORITY_PREFIX[priority]);
  if (list) parts.push(`/${list}`);

  if (dueDate) {
    if (dueDateHasTime) {
      const y = dueDate.getFullYear();
      const mo = String(dueDate.getMonth() + 1).padStart(2, "0");
      const d = String(dueDate.getDate()).padStart(2, "0");
      const h = String(dueDate.getHours()).padStart(2, "0");
      const mi = String(dueDate.getMinutes()).padStart(2, "0");
      parts.push(`@${y}-${mo}-${d} ${h}:${mi}`);
    } else {
      const now = new Date();
      const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const tomorrowMs = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
      if (dueDate.getTime() === todayMs) {
        parts.push("@today");
      } else if (dueDate.getTime() === tomorrowMs) {
        parts.push("@tomorrow");
      } else {
        const y = dueDate.getFullYear();
        const mo = String(dueDate.getMonth() + 1).padStart(2, "0");
        const d = String(dueDate.getDate()).padStart(2, "0");
        parts.push(`@${y}-${mo}-${d}`);
      }
    }
  }

  if (title) parts.push(title);

  return parts.join(" ");
}

export function parseInput(raw: string): ParsedInput {
  let rest = raw.trim();
  let priority: ReminderPriority = 0;
  let dueDate: Date | null = null;
  let dueDateHasTime = false;
  let list: string | null = null;

  let m: RegExpMatchArray | null;

  // Priority must appear at the very start of the input.
  if ((m = rest.match(PRIORITY_PREFIX_RE))) {
    priority = PRIORITY_MAP[m[1]] ?? 0;
    rest = rest.slice(m[0].length).trimStart();
  }

  // Remaining prefixes (@, /) can appear in any order.
  let changed = true;
  while (changed) {
    changed = false;

    if ((m = rest.match(DATE_PREFIX_RE))) {
      const parsed = parseDueDateStr((m[1] ?? "today").trim());
      dueDate = parsed.date;
      dueDateHasTime = parsed.hasTime;
      rest = rest.slice(m[0].length).trimStart();
      changed = true;
    } else if ((m = rest.match(LIST_PREFIX_RE))) {
      list = m[1];
      rest = rest.slice(m[0].length).trimStart();
      changed = true;
    }
  }

  // Tags are kept in the title; extract them here only for history/autocomplete purposes.
  const tags = [...rest.matchAll(TAG_RE)].map((match) => match[1]);

  return { title: rest, priority, dueDate, dueDateHasTime, list, tags };
}
