import { runAppleScript } from "@raycast/utils";
import { ParsedInput } from "./parse-input";

// Uses the EventKit ObjC bridge so we can set NSDateComponents without a time component.
// When hour/minute are omitted from NSDateComponents, Reminders treats the reminder as
// "date-only" (no time shown, no red overdue warning until end of day).
//
// The regular JXA Application("Reminders") API only accepts a full Date object,
// which always includes a time — even midnight (00:00) is treated as a timed reminder.
const JXA_SCRIPT = `
ObjC.import('EventKit');

function run(argv) {
  var title        = argv[0];
  var priority     = parseInt(argv[1]);
  var dueDateMs    = argv[2];  // ms timestamp for date+time, or ""
  var dueDateParts = argv[3];  // "YYYY,M(0-based),D" for date-only, or ""
  var listName     = argv[4];  // list name, or ""

  var EK_ENTITY_REMINDER = 1;

  var store = $.EKEventStore.new;  // no-arg ObjC methods are property access in JXA, not function calls
  var reminder = $.EKReminder.reminderWithEventStore(store);

  reminder.title = $(title);
  reminder.priority = priority;

  if (dueDateParts) {
    // Date-only: NSDateComponents without hour/minute → Reminders shows date with no time,
    // no red overdue warning until the day ends.
    var p = dueDateParts.split(',');
    var comps = $.NSDateComponents.new;
    comps.year  = parseInt(p[0]);
    comps.month = parseInt(p[1]) + 1; // JS getMonth() is 0-based; NSDateComponents is 1-based
    comps.day   = parseInt(p[2]);
    reminder.dueDateComponents = comps;
  } else if (dueDateMs) {
    // Date + time: include hour and minute.
    var d = new Date(parseInt(dueDateMs));
    var comps = $.NSDateComponents.new;
    comps.year   = d.getFullYear();
    comps.month  = d.getMonth() + 1;
    comps.day    = d.getDate();
    comps.hour   = d.getHours();
    comps.minute = d.getMinutes();
    reminder.dueDateComponents = comps;
  }

  // Find target list (EventKit calendar).
  var targetCalendar = store.defaultCalendarForNewReminders;
  if (listName) {
    var calendars = store.calendarsForEntityType(EK_ENTITY_REMINDER);
    for (var i = 0; i < calendars.count; i++) {
      var cal = calendars.objectAtIndex(i);
      if (ObjC.unwrap(cal.title) === listName) {
        targetCalendar = cal;
        break;
      }
    }
  }
  reminder.calendar = targetCalendar;

  // NOTE: Apple has never exposed tags in the Reminders/EventKit scripting APIs.
  store.saveReminderCommitError(reminder, true, null);
}
`;

export async function addReminder({
  title,
  priority,
  dueDate,
  dueDateHasTime,
  list,
}: Omit<ParsedInput, "tags">): Promise<void> {
  const dueDateMs = dueDate && dueDateHasTime ? String(dueDate.getTime()) : "";
  const dueDateParts =
    dueDate && !dueDateHasTime ? `${dueDate.getFullYear()},${dueDate.getMonth()},${dueDate.getDate()}` : "";

  await runAppleScript(JXA_SCRIPT, [title, String(priority), dueDateMs, dueDateParts, list ?? ""], {
    language: "JavaScript",
  });
}
