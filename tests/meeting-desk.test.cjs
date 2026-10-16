// Run with: node --test tests/meeting-desk.test.cjs (requires jsdom).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { JSDOM } = require("jsdom");
const path = require("node:path");
const root = path.join(__dirname, "..");
const storageKey = "dudgeon.meetingdesk.v1";

function openApp(saved) {
  const dom = new JSDOM(readFileSync(path.join(root, "index.html"), "utf8"), {
    url: "https://minutes.dudgeon.io/",
    runScripts: "outside-only",
  });
  const { window } = dom;
  window.confirm = () => true;
  if (saved) window.localStorage.setItem(storageKey, JSON.stringify(saved));
  window.eval(readFileSync(path.join(root, "assets/js/meeting-desk.js"), "utf8"));
  return window;
}
function click(window, selector) {
  window.document.querySelector(selector).click();
}
function input(window, selector, value) {
  const control = window.document.querySelector(selector);
  control.value = value;
  control.dispatchEvent(new window.Event("input", { bubbles: true }));
}
function saved(window) {
  return JSON.parse(window.localStorage.getItem(storageKey));
}

test("editing, agenda reorder, outcomes, minutes and reload retain data", () => {
  const window = openApp();
  input(window, '[data-key="notes"]', "Discussion stays with this topic.");
  input(window, '[data-key="prep"]', "PREPARATION SHOULD NOT APPEAR");
  click(window, '[data-add="Action"]');
  input(window, '[data-rkey="text"]', "Schedule follow-up");
  input(window, '[data-rkey="owner"]', "Jesse");
  input(window, '[data-rkey="due"]', "2026-10-20");
  click(window, '[data-move="1"]');
  assert.equal(saved(window).meetings[0].items[1].notes, "Discussion stays with this topic.");
  click(window, '[data-tab="minutes"]');
  const minutes = window.document.getElementById("minutesbody").textContent;
  assert.ok(minutes.includes("Jesse"));
  assert.ok(!minutes.includes("PREPARATION SHOULD NOT APPEAR"));
  const backup = saved(window);
  const reopened = openApp(backup);
  assert.deepEqual(saved(reopened), backup);
  window.close();
  reopened.close();
});

test("setup, duplicate, deletion, and user content remain usable and escaped", () => {
  const window = openApp();
  click(window, '[data-tab="setup"]');
  input(window, '[data-key="title"]', "<img src=x onerror=alert(1)>");
  assert.equal(window.document.querySelector("#meetingheading img"), null);
  const originalId = saved(window).meetings[0].id;
  click(window, "#duplicate");
  assert.equal(saved(window).meetings.length, 2);
  assert.notEqual(saved(window).meetings[0].id, originalId);
  click(window, "#deletemeeting");
  assert.equal(saved(window).meetings.length, 1);
  click(window, '[data-tab="workspace"]');
  click(window, "#addtopic");
  assert.equal(saved(window).meetings[0].items.length, 4);
  click(window, "#deletetopic");
  assert.equal(saved(window).meetings[0].items.length, 3);
  window.close();
});

test("invalid saved data is not overwritten and other tabs pause writes", () => {
  const invalid = { version: 999, meetings: [] };
  const window = openApp(invalid);
  assert.deepEqual(saved(window), invalid);
  assert.ok(window.document.getElementById("notice").textContent.includes("could not be loaded"));
  window.close();
  const second = openApp();
  const before = saved(second);
  second.dispatchEvent(new second.StorageEvent("storage", { key: storageKey }));
  input(second, '[data-key="notes"]', "Not persisted over other tab");
  assert.deepEqual(saved(second), before);
  second.close();
});

test("version 1 imports add meetings and assign fresh IDs", async () => {
  const window = openApp();
  const backup = saved(window);
  const upload = window.document.getElementById("file");
  Object.defineProperty(upload, "files", {
    value: [{ size: 100, text: async () => JSON.stringify(backup) }],
  });
  await upload.onchange({ target: upload });
  const imported = saved(window);
  assert.equal(imported.meetings.length, 2);
  assert.notEqual(imported.meetings[0].id, backup.meetings[0].id);
  assert.notEqual(imported.meetings[0].items[0].id, backup.meetings[0].items[0].id);
  window.close();
});

test("attendance can be edited, saved, printed in minutes, imported and removed", async () => {
  const window = openApp();
  click(window, '[data-tab="attendance"]');
  click(window, "#add-attendee");
  input(window, '[data-attendance-key="name"]', "Jesse Dudgeon");
  input(window, '[data-attendance-key="role"]', "Network Manager");
  input(window, '[data-attendance-key="status"]', "Present");
  input(window, '[data-attendance-key="notes"]', "Joined at 9:05");
  assert.ok(window.document.getElementById("attendance-summary").textContent.includes("1 present"));
  const backup = saved(window);
  const reopened = openApp(backup);
  assert.deepEqual(saved(reopened), backup);
  click(reopened, '[data-tab="minutes"]');
  const minutes = reopened.document.getElementById("minutesbody").textContent;
  assert.ok(minutes.includes("PRESENT (1)"));
  assert.ok(minutes.includes("Jesse Dudgeon — Network Manager | Joined at 9:05"));
  const upload = reopened.document.getElementById("file");
  Object.defineProperty(upload, "files", {
    value: [{ size: 100, text: async () => JSON.stringify(backup) }],
  });
  await upload.onchange({ target: upload });
  assert.equal(saved(reopened).meetings[0].attendance[0].name, "Jesse Dudgeon");
  assert.notEqual(
    saved(reopened).meetings[0].attendance[0].id,
    backup.meetings[0].attendance[0].id,
  );
  click(reopened, '[data-tab="attendance"]');
  click(reopened, "[data-remove-attendee]");
  assert.equal(saved(reopened).meetings[0].attendance.length, 0);
  window.close();
  reopened.close();
});

test("legacy attendee lists migrate once without assuming presence or losing names", () => {
  const seed = openApp();
  const legacy = saved(seed);
  seed.close();
  delete legacy.meetings[0].attendance;
  legacy.meetings[0].attendees = "Jesse\nNatalie";
  const window = openApp(legacy);
  assert.deepEqual(
    saved(window).meetings[0].attendance.map((person) => person.name),
    ["Jesse", "Natalie"],
  );
  assert.ok(
    saved(window).meetings[0].attendance.every((person) => person.status === "Not recorded"),
  );
  click(window, '[data-tab="attendance"]');
  click(window, "[data-remove-attendee]");
  click(window, "[data-remove-attendee]");
  const reopened = openApp(saved(window));
  assert.equal(saved(reopened).meetings[0].attendance.length, 0);
  window.close();
  reopened.close();
});
