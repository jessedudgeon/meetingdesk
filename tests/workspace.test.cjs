const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { JSDOM } = require("jsdom");
const path = require("node:path");
const root = path.join(__dirname, "..");
function app(backup) {
  const dom = new JSDOM(readFileSync(path.join(root, "index.html"), "utf8"), {
    url: "https://minutes.dudgeon.io/",
    runScripts: "outside-only",
  });
  const w = dom.window;
  w.structuredClone = structuredClone;
  w.confirm = () => true;
  w.prompt = () => "Reusable template";
  w.print = () => {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  if (backup) w.localStorage.setItem("dudgeon.meetingdesk.v1", JSON.stringify(backup));
  for (const name of ["meeting-desk.js", "workspace.js"])
    require("node:vm").runInContext(
      readFileSync(path.join(root, "assets/js", name), "utf8"),
      dom.getInternalVMContext(),
    );
  return w;
}
const click = (w, s) => w.document.querySelector(s).click();
function input(w, s, value) {
  let e = w.document.querySelector(s);
  e.value = value;
  e.dispatchEvent(new w.Event("input", { bubbles: true }));
}
const data = (w) => w.meetingDesk.snapshot();
function submit(w) {
  w.document
    .getElementById("new-meeting-form")
    .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
}
test("dashboard navigation, dialog cancellation, and new meeting preserve old notes", () => {
  const w = app();
  assert.equal(w.document.getElementById("meeting-shell").hidden, true);
  click(w, "[data-open-workspace]");
  input(w, '[data-key="notes"]', "Keep this discussion");
  click(w, "#newmeeting");
  click(w, "#cancel-new");
  assert.equal(data(w).meetings.length, 1);
  click(w, "#newmeeting");
  input(w, "#new-title", "New agenda");
  submit(w);
  assert.equal(data(w).meetings.length, 2);
  assert.equal(data(w).meetings[1].items[0].notes, "Keep this discussion");
  assert.equal(w.document.getElementById("meetingheading").textContent, "New agenda");
  w.close();
});
test("template editor saves directly, reorders topics, preserves roster and starts clean meetings", () => {
  const w = app();
  click(w, '.app-nav [data-tab="templates"]');
  click(w, "[data-add-starter]");
  click(w, "[data-edit-template]");
  input(w, '[data-key="title"]', "My weekly meeting");
  click(w, '[data-tab="workspace"]');
  input(w, '[data-key="prep"]', "Recurring prep");
  click(w, '[data-move="1"]');
  click(w, '[data-tab="attendance"]');
  click(w, "#add-attendee");
  input(w, '[data-attendance-key="name"]', "Jesse");
  click(w, '.app-nav [data-tab="templates"]');
  assert.equal(data(w).templates[0].title, "My weekly meeting");
  assert.equal(data(w).meetings[0].title, "Team meeting");
  click(w, "[data-start-template]");
  assert.match(w.document.getElementById("template-preview").textContent, /Project|Wins/);
  submit(w);
  const m = data(w).meetings[0];
  assert.equal(m.title, "My weekly meeting");
  assert.equal(m.items[1].prep, "Recurring prep");
  assert.equal(m.attendance[0].name, "Jesse");
  assert.equal(m.attendance[0].status, "Not recorded");
  assert.equal(m.items[1].notes, "");
  assert.notEqual(m.id, data(w).templates[0].id);
  w.close();
});
test("cross-meeting action filters, completion and source links change the original record", () => {
  const w = app();
  click(w, "[data-open-workspace]");
  click(w, '[data-add="Action"]');
  input(w, '[data-rkey="text"]', "Upgrade switch");
  input(w, '[data-rkey="owner"]', "Jesse");
  input(w, '[data-rkey="due"]', "2020-01-01");
  click(w, '.app-nav [data-tab="actions"]');
  input(w, "#action-status", "overdue");
  assert.match(w.document.getElementById("action-results").textContent, /Upgrade switch/);
  click(w, "[data-complete-action]");
  assert.equal(data(w).meetings[0].items[0].records[0].done, true);
  assert.match(w.document.getElementById("action-results").textContent, /No matching/);
  input(w, "#action-status", "done");
  click(w, "[data-jump-action]");
  assert.equal(w.document.querySelector('[data-rkey="text"]').value, "Upgrade switch");
  w.close();
});
test("compact attendance, archived search, mobile selector and print preserve content", () => {
  const w = app();
  click(w, "[data-open-workspace]");
  input(w, '[data-key="notes"]', "Searchable discussion");
  input(w, '[data-key="prep"]', "PRIVATE PREP");
  click(w, '[data-tab="attendance"]');
  click(w, "#add-attendee");
  input(w, '[data-attendance-key="name"]', "Jesse");
  click(w, "#mark-present");
  assert.equal(data(w).meetings[0].attendance[0].status, "Present");
  click(w, '[data-tab="setup"]');
  click(w, "#archive-meeting");
  click(w, '.app-nav [data-tab="history"]');
  input(w, "#meeting-filter", "archived");
  input(w, "#meeting-search", "Searchable");
  assert.equal(w.document.querySelectorAll("[data-open-workspace]").length, 1);
  click(w, "[data-open-minutes]");
  click(w, "#print");
  assert.match(w.document.getElementById("printout").textContent, /Searchable discussion/);
  assert.ok(!w.document.getElementById("printout").textContent.includes("PRIVATE PREP"));
  const selector = w.document.getElementById("mobile-topic");
  selector.value = data(w).meetings[0].items[1].id;
  selector.dispatchEvent(new w.Event("change"));
  assert.equal(w.document.querySelector('[data-key="title"]').value, "Project updates");
  w.close();
});
test("account replacement refreshes dashboard and clears template context", () => {
  const w = app();
  const old = data(w);
  click(w, '.app-nav [data-tab="templates"]');
  click(w, "[data-new-template]");
  w.meetingDesk.replace(old);
  assert.equal(w.document.getElementById("meeting-shell").hidden, true);
  click(w, "[data-open-workspace]");
  assert.equal(w.document.getElementById("template-banner").hidden, true);
  w.close();
});
test("follow-up starts fresh, keeps original commitments and excludes preparation from minutes", () => {
  const w = app();
  const source = data(w).meetings[0];
  source.archived = true;
  source.items[0].notes = "Old discussion";
  source.items[0].prep = "Private preparation";
  source.items[0].status = "Complete";
  source.attendance = [{ id: "person-one", name: "Jesse", role: "IT", status: "Present", notes: "Old attendance" }];
  source.items[0].records = [
    { id: "open-action", type: "Action", text: "<b>Review budget</b>", owner: "Jesse", due: "2026-11-12", done: false },
    { id: "done-action", type: "Action", text: "Already finished", done: true },
    { id: "decision-one", type: "Decision", text: "Old decision" }
  ];
  w.meetingDesk.replace({ version: 1, meetings: [source], templates: [] });
  const original = data(w).meetings[0];
  click(w, ' .app-nav [data-tab="history"]');
  click(w, "[data-open-workspace]");
  click(w, '[data-tab="setup"]');
  click(w, "#follow-up");
  assert.equal(w.document.getElementById("new-title").value, original.title);
  click(w, "#review-open-actions");
  input(w, "#new-date", "2026-11-16");
  submit(w);
  const next = data(w).meetings[0];
  assert.deepEqual(data(w).meetings[1], { ...original, series: original.title });
  assert.equal(next.series, original.title);
  assert.notEqual(next.id, original.id);
  assert.equal(next.date, "2026-11-16");
  assert.equal(next.archived, false);
  assert.equal(next.attendance[0].status, "Not recorded");
  assert.equal(next.attendance[0].notes, "");
  assert.notEqual(next.attendance[0].id, original.attendance[0].id);
  assert.equal(next.items[1].prep, "Private preparation");
  assert.equal(next.items[1].notes, "");
  assert.equal(next.items[1].status, "Upcoming");
  assert.ok(next.items.every(i => i.records.length === 0));
  assert.match(next.items[0].prep, /Review budget/);
  assert.match(next.items[0].prep, /Jesse; due 2026-11-12/);
  assert.doesNotMatch(next.items[0].prep, /Already finished|Old decision/);
  assert.equal(w.document.querySelector("#content b"), null);
  click(w, '[data-tab="minutes"]');
  click(w, "#print");
  assert.doesNotMatch(w.document.getElementById("printout").textContent, /Review budget|Private preparation|Old discussion/);
  click(w, '.app-nav [data-tab="actions"]');
  assert.equal(w.document.querySelectorAll("[data-complete-action]").length, 1);
  w.close();
});
test("follow-up cancellation, optional reminders, and account changes do not leak dialog state", () => {
  const w = app();
  click(w, "[data-open-workspace]");
  click(w, '[data-tab="setup"]');
  click(w, "#follow-up");
  click(w, "#cancel-new");
  assert.equal(data(w).meetings.length, 1);
  click(w, "#follow-up");
  submit(w);
  assert.equal(data(w).meetings[0].items.length, data(w).meetings[1].items.length);
  click(w, "#newmeeting");
  assert.equal(w.document.getElementById("new-template").disabled, false);
  assert.equal(w.document.getElementById("follow-up-options").hidden, true);
  click(w, "#cancel-new");
  click(w, '[data-tab="setup"]');
  click(w, "#follow-up");
  w.meetingDesk.replace({ version: 1, meetings: [], templates: [] });
  assert.equal(w.document.getElementById("new-meeting-dialog").open, false);
  w.close();
});

function actionWorkspace() {
  const w = app();
  const meeting = data(w).meetings[0];
  meeting.items[0].records = [
    { id: "edit-open", type: "Action", text: "Review budget", owner: "Jesse", due: "2026-11-12", done: false },
    { id: "edit-done", type: "Action", text: "Finished", owner: "Jesse", due: "", done: true }
  ];
  w.meetingDesk.replace({ version: 1, meetings: [meeting], templates: [] });
  click(w, '.app-nav [data-tab="actions"]');
  return w;
}
test("action editor saves the original record, preserves filters, and supports cancel", () => {
  const w = actionWorkspace();
  input(w, "#action-owner", "Jesse");
  click(w, "[data-edit-action]");
  input(w, "#action-edit-text", "Should not save");
  click(w, "#action-edit-cancel");
  assert.equal(data(w).meetings[0].items[0].records[0].text, "Review budget");
  click(w, "[data-edit-action]");
  input(w, "#action-edit-text", "Revised budget");
  input(w, "#action-edit-owner", "Dana");
  input(w, "#action-edit-due", "2026-12-01");
  w.document.getElementById("action-edit-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
  const record = data(w).meetings[0].items[0].records[0];
  assert.equal(record.id, "edit-open");
  assert.equal(record.text, "Revised budget");
  assert.equal(record.owner, "Dana");
  assert.equal(record.due, "2026-12-01");
  assert.equal(w.document.getElementById("action-owner").value, "Jesse");
  assert.match(w.document.getElementById("action-results").textContent, /No matching actions/);
  input(w, "#action-owner", "Dana");
  assert.equal(w.document.querySelectorAll("[data-edit-action]").length, 1);
  assert.equal(JSON.parse(w.localStorage.getItem("dudgeon.meetingdesk.v1")).meetings[0].items[0].records[0].owner, "Dana");
  click(w, "[data-edit-action]");
  click(w, "#action-edit-done");
  w.document.getElementById("action-edit-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
  assert.equal(data(w).meetings[0].items[0].records[0].done, true);
  assert.equal(w.document.getElementById("export-actions").disabled, true);
  w.close();
});
test("action editing rejects blank descriptions and stale account dialogs", () => {
  const w = actionWorkspace();
  click(w, "[data-edit-action]");
  input(w, "#action-edit-text", "   ");
  w.document.getElementById("action-edit-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
  assert.equal(data(w).meetings[0].items[0].records[0].text, "Review budget");
  w.meetingDesk.replace({ version: 1, meetings: [], templates: [] });
  assert.equal(w.document.getElementById("action-edit-dialog").open, false);
  w.document.getElementById("action-edit-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
  assert.equal(data(w).meetings[0].items.length, 0);
  w.close();
});
test("CSV exports only matching actions, quotes values, and neutralizes spreadsheet formulas", () => {
  const w = actionWorkspace();
  const backup = data(w);
  backup.meetings[0].items[0].records[0].text = '=HYPERLINK("bad")\nNext, line';
  backup.meetings[0].items[0].prep = "PRIVATE PREP";
  backup.meetings[0].items[0].notes = "PRIVATE NOTES";
  w.meetingDesk.replace(backup);
  click(w, '.app-nav [data-tab="actions"]');
  input(w, "#action-search", "Jesse");
  w.eval('downloadFile = (text, name, type) => { window.exportedActions = { text, name, type }; };');
  click(w, "#export-actions");
  const csv = w.exportedActions.text;
  assert.match(csv, /"Action","Owner","Due date"/);
  assert.match(csv, /"'=HYPERLINK\(""bad""\)/);
  assert.match(csv, /Next, line/);
  assert.doesNotMatch(csv, /Finished|PRIVATE PREP|PRIVATE NOTES/);
  input(w, "#action-search", "no matches");
  assert.equal(w.document.getElementById("export-actions").disabled, true);
  w.close();
});


test("series review selects the latest earlier minutes, supports history, and leaves current notes intact", () => {
  const w = app();
  const source = data(w).meetings[0];
  const meeting = (id, date, series, notes, time = "09:00") => ({
    ...structuredClone(source), id, date, time, title: id, series,
    items: [{ ...source.items[0], id: id + "-topic", notes, prep: "PRIVATE PREPARATION", records: [] }]
  });
  const current = meeting("current", "2026-11-09", "IT Team", "Current draft");
  const prior = meeting("prior", "2026-11-02", "it team", "<b>Last discussion</b>");
  prior.archived = true;
  w.meetingDesk.replace({ version: 1, templates: [], meetings: [
    current, prior, meeting("older", "2026-10-26", "IT Team", "Older discussion"),
    meeting("future", "2026-11-16", "IT Team", "Future discussion"),
    meeting("other", "2026-11-08", "Other series", "Other discussion")
  ] });
  click(w, '.app-nav [data-tab="history"]');
  click(w, '[data-open-workspace="current"]');
  const select = w.document.getElementById("previous-minutes-select");
  assert.equal(select.value, "prior");
  assert.equal(select.options.length, 2);
  assert.match(w.document.getElementById("previous-minutes-text").textContent, /Last discussion/);
  assert.doesNotMatch(w.document.getElementById("previous-minutes-text").textContent, /PRIVATE PREPARATION/);
  assert.equal(w.document.querySelector("#previous-minutes-text b"), null);
  select.value = "older";
  select.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert.match(w.document.getElementById("previous-minutes-text").textContent, /Older discussion/);
  input(w, '[data-key="notes"]', "Current revised draft");
  assert.equal(data(w).meetings[0].items[0].notes, "Current revised draft");
  assert.equal(data(w).meetings[1].items[0].notes, "<b>Last discussion</b>");
  click(w, '[data-tab="minutes"]');
  assert.doesNotMatch(w.document.getElementById("minutesbody").textContent, /Last discussion|Older discussion/);
  assert.match(w.document.getElementById("minutesbody").textContent, /Current revised draft/);
  const saved = data(w);
  const reloaded = app(saved);
  click(reloaded, '.app-nav [data-tab="history"]');
  click(reloaded, '[data-open-workspace="current"]');
  assert.equal(reloaded.document.getElementById("previous-minutes-select").value, "prior");
  w.meetingDesk.replace({ version: 1, meetings: [], templates: [] });
  assert.equal(w.document.getElementById("previous-minutes-panel").textContent, "");
  reloaded.close();
  w.close();
});
test("existing meetings can join a series and same-day review respects start times", () => {
  const w = app();
  const source = data(w).meetings[0];
  const earlier = structuredClone(source);
  earlier.id = "earlier";
  earlier.time = "08:00";
  earlier.series = "Weekly team";
  earlier.items[0].notes = "Morning minutes";
  source.time = "10:00";
  w.meetingDesk.replace({ version: 1, meetings: [source, earlier], templates: [] });
  click(w, '.app-nav [data-tab="history"]');
  click(w, '[data-open-workspace="' + source.id + '"]');
  click(w, '[data-tab="setup"]');
  input(w, '[data-key="series"]', "Weekly team");
  assert.match(w.document.getElementById("previous-minutes-text").textContent, /Morning minutes/);
  input(w, '[data-key="time"]', "07:00");
  assert.equal(w.document.getElementById("previous-minutes-select"), null);
  assert.match(w.document.getElementById("previous-minutes-panel").textContent, /No earlier/);
  input(w, '[data-key="series"]', "");
  assert.match(w.document.getElementById("previous-minutes-panel").textContent, /Add a series/);
  w.close();
});

test("series hub groups names, includes archived commitments, and opens source minutes", () => {
  const w = app();
  const source = data(w).meetings[0];
  const make = (id, series, archived, done) => ({
    ...structuredClone(source), id, title: id, date: "2020-01-01", series, archived,
    items: [{ ...source.items[0], id: id + "-topic", notes: id + " minutes", records: [
      { id: id + "-action", type: "Action", text: id + " action", owner: "Jesse", due: "2020-01-02", done }
    ] }]
  });
  w.meetingDesk.replace({ version: 1, templates: [], meetings: [
    make("archived", "IT <team>", true, false),
    make("recent", "it <TEAM>", false, true),
    make("other", "Finance", false, false),
    make("standalone", "", false, false)
  ] });
  click(w, '.app-nav [data-tab="series"]');
  assert.equal(w.document.querySelectorAll("[data-open-series]").length, 2);
  click(w, '[data-open-series="it <team>"]');
  const results = w.document.getElementById("series-results");
  assert.match(results.textContent, /2 meetings · 1 open actions · 1 overdue/);
  assert.equal(results.querySelectorAll("[data-open-workspace]").length, 2);
  assert.equal(results.querySelectorAll("[data-jump-action]").length, 1);
  assert.equal(results.querySelector("team"), null);
  click(w, '[data-open-minutes="archived"]');
  assert.match(w.document.getElementById("minutesbody").textContent, /archived minutes/);
  click(w, '.app-nav [data-tab="series"]');
  assert.equal(w.document.getElementById("series-picker").value, "it <team>");
  click(w, '[data-jump-action="archived-action"]');
  assert.equal(w.document.querySelector('[data-rkey="text"]').value, "archived action");
  w.meetingDesk.replace({ version: 1, meetings: [], templates: [] });
  click(w, '.app-nav [data-tab="series"]');
  assert.match(w.document.getElementById("series-results").textContent, /Start a meeting series/);
  assert.equal(w.document.getElementById("series-picker").value, "");
  w.close();
});
test("series follow-up selects latest dated past agenda and keeps the chosen series", () => {
  const w = app();
  const source = data(w).meetings[0];
  const make = (id, date) => ({ ...structuredClone(source), id, title: id, date, series: "Weekly",
    items: [{ ...source.items[0], id: id + "-topic", title: id + " agenda" }] });
  w.meetingDesk.replace({ version: 1, templates: [], meetings: [
    make("older", "2020-01-01"), make("latest", "2020-02-01"), make("future", "2099-01-01")
  ] });
  click(w, '.app-nav [data-tab="series"]');
  click(w, '[data-open-series]');
  click(w, '[data-series-follow-up]');
  assert.equal(w.document.getElementById("new-title").value, "latest");
  submit(w);
  assert.equal(data(w).meetings[0].series, "Weekly");
  assert.equal(data(w).meetings[0].items[0].title, "latest agenda");
  w.close();
});
