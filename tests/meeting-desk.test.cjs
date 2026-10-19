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

test("templates reset proceedings and attendance while retaining agenda and roster", () => {
  const window = openApp();
  window.prompt = () => "Weekly network review";
  input(window, '[data-key="notes"]', "Private old discussion");
  input(window, '[data-key="prep"]', "Recurring preparation");
  click(window, '[data-add="Decision"]');
  input(window, '[data-rkey="text"]', "Old decision");
  click(window, '[data-tab="attendance"]');
  click(window, '#add-attendee');
  input(window, '[data-attendance-key="name"]', "Jesse");
  input(window, '[data-attendance-key="status"]', "Present");
  click(window, '[data-tab="templates"]');
  click(window, '#save-template');
  click(window, '[data-use-template]');
  const data = saved(window);
  assert.equal(data.meetings.length, 2);
  assert.equal(data.templates.length, 1);
  assert.equal(data.meetings[0].items[0].prep, "Recurring preparation");
  assert.equal(data.meetings[0].items[0].notes, "");
  assert.equal(data.meetings[0].items[0].records.length, 0);
  assert.equal(data.meetings[0].attendance[0].name, "Jesse");
  assert.equal(data.meetings[0].attendance[0].status, "Not recorded");
  assert.notEqual(data.meetings[0].id, data.templates[0].id);
  assert.equal(data.meetings[1].items[0].notes, "Private old discussion");
  const reopened = openApp(data);
  assert.equal(saved(reopened).templates.length, 1);
  window.close(); reopened.close();
});

test("history searches archived notes and opens the correct minutes", () => {
  const window = openApp();
  input(window, '[data-key="notes"]', "Switch upgrade follow-up");
  click(window, '[data-tab="setup"]'); click(window, '#archive-meeting');
  click(window, '#newmeeting');
  click(window, '[data-tab="history"]');
  input(window, '#history-search', 'Switch upgrade');
  assert.equal(window.document.querySelectorAll('[data-open-meeting]').length, 1);
  assert.match(window.document.getElementById('history-results').textContent, /Archived/);
  click(window, '[data-open-meeting]');
  assert.match(window.document.getElementById('minutesbody').textContent, /Switch upgrade/);
  window.close();
});

async function connectMockCloud(window, mockClient) {
  window.structuredClone = structuredClone;
  window.MEETING_DESK_CLOUD = { url: 'https://example.supabase.co', publishableKey: 'public-test-key' };
  window.mockClient = mockClient;
  let code = readFileSync(path.join(root, 'assets/js/cloud-storage.js'), 'utf8');
  code = code.replace(/const \{ createClient \} = await import\([^;]+;/, 'const createClient = () => window.mockClient;');
  await window.eval(`(async () => { ${code} })()`);
}
function mockCloud(options = {}) {
  const calls = [];
  let listener;
  return {
    calls,
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'account-a', email: 'jesse@example.com' } } } }),
      onAuthStateChange: callback => { listener = callback; },
      signOut: async () => { listener?.('SIGNED_OUT', null); return {}; },
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => options.loadError
      ? { error: { message: 'No database' } }
      : { data: { payload: { version: 1, meetings: [], templates: [] }, revision: 4 } } }) }) }),
    rpc: async (name, args) => { calls.push(args); return options.saveError ? { error: options.saveError } : { data: args.expected_revision + 1 }; },
  };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 20));

test('account saves use revisions and never overwrite guest browser storage; logout restores guest', async () => {
  const window = openApp();
  const guest = saved(window);
  const mock = mockCloud();
  await connectMockCloud(window, mock);
  click(window, '[data-tab="setup"]');
  input(window, '[data-key="title"]', 'Account only');
  click(window, '#retry-save'); await tick();
  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0].expected_revision, 4);
  assert.equal(mock.calls[0].workspace_payload.meetings[0].title, 'Account only');
  assert.deepEqual(saved(window), guest);
  assert.equal(window.document.getElementById('save').textContent, 'Saved to your account');
  click(window, '#signout'); await tick();
  assert.equal(window.document.getElementById('meetingheading').textContent, guest.meetings[0].title);
  assert.deepEqual(saved(window), guest);
  window.close();
});

test('revision conflict preserves edits and prevents another cloud write', async () => {
  const window = openApp(); const mock = mockCloud({ saveError: { code: '40001', message: 'Conflict' } });
  await connectMockCloud(window, mock);
  click(window, '[data-tab="setup"]'); input(window, '[data-key="title"]', 'Unsaved work');
  click(window, '#retry-save'); await tick();
  assert.match(window.document.getElementById('notice').textContent, /Another device/);
  assert.equal(window.meetingDesk.snapshot().meetings[0].title, 'Unsaved work');
  click(window, '#retry-save'); await tick();
  assert.equal(mock.calls.length, 1);
  window.close();
});

test('failed account load blocks editing and cannot save the guest data into the account', async () => {
  const window = openApp(); const mock = mockCloud({ loadError: true });
  await connectMockCloud(window, mock);
  assert.equal(window.document.querySelector('main').inert, true);
  click(window, '#retry-save'); await tick();
  assert.equal(mock.calls.length, 0);
  assert.match(window.document.getElementById('account-status').textContent, /Reload/);
  window.close();
});
