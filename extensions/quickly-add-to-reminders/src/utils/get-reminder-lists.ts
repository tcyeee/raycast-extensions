import { runAppleScript } from "@raycast/utils";

export async function getReminderLists(): Promise<string[]> {
  const result = await runAppleScript(
    `function run() {
      var app = Application("Reminders");
      return app.lists().map(function(l) { return l.name(); }).join("\\n");
    }`,
    [],
    { language: "JavaScript" },
  );
  return result ? result.split("\n").filter(Boolean) : [];
}
