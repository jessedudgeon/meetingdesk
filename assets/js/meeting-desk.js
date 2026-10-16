// Meeting Desk: data, rendering, and event handlers. No build step required.
"use strict";

const getElement = (id) => document.getElementById(id);
const STORAGE_KEY = "dudgeon.meetingdesk.v1";
const createId = () => crypto.randomUUID();
const escapeHtml = (text) =>
  String(text ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
const getToday = () => {
  let d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const createAgendaItem = (title = "New agenda item") => ({
  id: createId(),
  title,
  presenter: "",
  purpose: "Discuss",
  minutes: 10,
  status: "Upcoming",
  prep: "",
  notes: "",
  records: [],
});
const createMeeting = () => ({
  id: createId(),
  title: "Untitled meeting",
  date: getToday(),
  time: "09:00",
  location: "",
  attendees: "",
  items: [],
});
let state = {
  meetings: [],
  selected: null,
};
let selectedAgendaItemId = null;
let activeTab = "workspace";
let draggedAgendaItemId = null;
let canSave = true;
function showNotice(text) {
  getElement("notice").textContent = text;
  getElement("notice").style.display = "block";
}
// Validate version 1 backups. Keep stored IDs on reload; create fresh IDs for imports and copies.
function validateBackup(backup, preserveIds = false) {
  if (
    !backup ||
    backup.version !== 1 ||
    !Array.isArray(backup.meetings) ||
    backup.meetings.length > 500
  ) {
    throw Error("Unsupported backup. Choose a Meeting Desk version 1 backup.");
  }
  const usedIds = new Set();
  const restoreId = (value) => {
    if (
      preserveIds &&
      typeof value === "string" &&
      /^[a-zA-Z0-9-]{1,100}$/.test(value) &&
      !usedIds.has(value)
    ) {
      usedIds.add(value);
      return value;
    }
    const fresh = createId();
    usedIds.add(fresh);
    return fresh;
  };
  let readText = (v) => (typeof v === "string" ? v.slice(0, 200000) : "");
  return backup.meetings.map((meeting) => {
    if (!meeting || !Array.isArray(meeting.items) || meeting.items.length > 1000) {
      throw Error("Invalid meeting data.");
    }
    return {
      ...createMeeting(),
      id: restoreId(meeting.id),
      title: readText(meeting.title) || "Untitled meeting",
      date: readText(meeting.date),
      time: readText(meeting.time),
      location: readText(meeting.location),
      attendees: readText(meeting.attendees),
      items: meeting.items.map((agendaItem) => {
        if (!agendaItem || !Array.isArray(agendaItem.records) || agendaItem.records.length > 5000) {
          throw Error("Invalid agenda data.");
        }
        return {
          ...createAgendaItem(),
          id: restoreId(agendaItem.id),
          title: readText(agendaItem.title) || "Untitled item",
          presenter: readText(agendaItem.presenter),
          purpose: ["Discuss", "Decide", "Inform"].includes(agendaItem.purpose)
            ? agendaItem.purpose
            : "Discuss",
          minutes: Math.min(999, Math.max(0, Number(agendaItem.minutes) || 0)),
          status: ["Upcoming", "In progress", "Complete"].includes(agendaItem.status)
            ? agendaItem.status
            : "Upcoming",
          prep: readText(agendaItem.prep),
          notes: readText(agendaItem.notes),
          records: agendaItem.records.map((record) => {
            if (!record || !["Action", "Decision", "Motion"].includes(record.type)) {
              throw Error("Invalid record.");
            }
            return {
              id: restoreId(record.id),
              type: record.type,
              text: readText(record.text),
              owner: readText(record.owner),
              due: readText(record.due),
              done: record.done === true,
              outcome: ["Pending", "Carried", "Not carried", "Withdrawn"].includes(record.outcome)
                ? record.outcome
                : "Pending",
            };
          }),
        };
      }),
    };
  });
}
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    state.meetings = validateBackup(parsed, true);
    state.selected = state.meetings[0]?.id;
  }
} catch (event) {
  canSave = false;
  showNotice(
    "Saved data could not be loaded. Existing storage has been left untouched. Export your work before closing this page.",
  );
}
if (!state.meetings.length) {
  let meeting = createMeeting();
  meeting.title = "Team meeting";
  meeting.items = [
    createAgendaItem("Welcome & priorities"),
    createAgendaItem("Project updates"),
    createAgendaItem("Next steps"),
  ];
  state.meetings = [meeting];
  state.selected = meeting.id;
}
const getCurrentMeeting = () => state.meetings.find((meeting) => meeting.id === state.selected);
// Keep the original storage key so existing meetings survive this refactor.
const getCurrentAgendaItem = () =>
  getCurrentMeeting().items.find((agendaItem) => agendaItem.id === selectedAgendaItemId);
function saveMeetings() {
  if (!canSave) {
    getElement("save").textContent = "Not saved · export a backup";
    return;
  }
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        meetings: state.meetings,
      }),
    );
    getElement("save").textContent = "Saved in this browser";
  } catch (event) {
    getElement("save").textContent = "Save failed · export a backup";
    showNotice(
      "Browser storage is unavailable or full. Export a backup now to preserve your work.",
    );
  }
}
// Refresh meeting metadata without interrupting the active text field.
function renderMeetingSummary() {
  let meeting = getCurrentMeeting();
  getElement("meetingheading").textContent = meeting.title || "Untitled meeting";
  getElement("meetingmeta").textContent = [meeting.date, meeting.time, meeting.location]
    .filter(Boolean)
    .join(" · ");
  getElement("meetingpick").innerHTML = state.meetings
    .map(
      (x) => `<option value="${x.id}" ${x.id === meeting.id ? "selected" : ""}>
  ${escapeHtml(x.title || "Untitled meeting")}
</option>`,
    )
    .join("");
  getElement("count").textContent = meeting.items.length + " items";
  getElement("stats").textContent =
    `${meeting.items.filter((agendaItem) => agendaItem.status === "Complete").length} of ${meeting.items.length} complete · ${meeting.items.reduce((a, agendaItem) => a + Number(agendaItem.minutes), 0)} min planned`;
}
// Render agenda navigation and accessible arrow-button reorder controls.
function renderAgenda() {
  let meeting = getCurrentMeeting();
  getElement("agenda").innerHTML = meeting.items.length
    ? meeting.items
        .map(
          (
            agendaItem,
            i,
          ) => `<div class="topic ${agendaItem.id === selectedAgendaItemId ? "active" : ""}" data-id="${agendaItem.id}">
  <span class="grip" draggable="true" title="Drag to reorder" aria-hidden="true">⠿</span>
  <button
    class="btn topicmain"
    data-select="${agendaItem.id}"
    ${agendaItem.id === selectedAgendaItemId ? 'aria-current="true"' : ""}
  >
    <strong>${i + 1}. ${escapeHtml(agendaItem.title || "Untitled item")}</strong>
    <small>${escapeHtml(agendaItem.status)} · ${agendaItem.minutes} min</small>
  </button>
  <div class="move">
    <button
      data-move="-1"
      data-id="${agendaItem.id}"
      aria-label="Move item ${i + 1} up"
      ${i === 0 ? "disabled" : ""}
      class="btn btn-outline-secondary"
    >
      ↑
    </button>
    <button
      data-move="1"
      data-id="${agendaItem.id}"
      aria-label="Move item ${i + 1} down"
      ${i === meeting.items.length - 1 ? "disabled" : ""}
      class="btn btn-outline-secondary"
    >
      ↓
    </button>
  </div>
</div>`,
        )
        .join("")
    : `<div class="empty text-center text-body-secondary border rounded-3 p-4">
  Add your first topic to get started.
</div>`;
  renderMeetingSummary();
}
const renderInput = (
  label,
  key,
  value,
  type = "text",
  scope = "topic",
) => `<label class="form-label w-100">
  ${label}
  <input
    type="${type}"
    data-scope="${scope}"
    data-key="${key}"
    value="${escapeHtml(value)}"
    ${type === "number" ? 'min="0" max="999"' : ""}
    class="form-control"
  />
</label>`;
const renderTextarea = (label, key, value, cls = "") => `<label class="form-label w-100">
  ${label}
  <textarea
    class="form-control ${cls}"
    data-scope="topic"
    data-key="${key}"
    placeholder="${key === "notes" ? "Capture the discussion here…" : "Context, talking points, and resource links…"}"
  >${escapeHtml(value)}</textarea>
</label>`;
const renderSelect = (label, key, value, options) => `<label class="form-label w-100">
  ${label}
  <select data-scope="topic" data-key="${key}" class="form-select">
    ${options.map((o) => `<option ${o === value ? "selected" : ""}>${o}</option>`).join("")}
  </select>
</label>`;
// Render the selected workspace, setup form, or minutes view.
function renderCurrentView() {
  let meeting = getCurrentMeeting();
  if (!meeting.items.some((t) => t.id === selectedAgendaItemId)) {
    selectedAgendaItemId = meeting.items[0]?.id;
  }
  renderAgenda();
  document
    .querySelectorAll("[data-tab]")
    .forEach((button) => button.classList.toggle("active", button.dataset.tab === activeTab));
  if (activeTab === "setup") {
    return renderMeetingSetup();
  }
  if (activeTab === "minutes") {
    return renderMinutesView();
  }
  return renderAgendaWorkspace();
}
// Edit meeting details and manage meeting copies.
function renderMeetingSetup() {
  const meeting = getCurrentMeeting();
  getElement("content").innerHTML = `<section>
  <h2>Meeting details</h2>
  <p style="margin-bottom: 20px">Set the context before the conversation.</p>
  ${renderInput("Meeting title", "title", meeting.title, "text", "meeting")}
  <div class="row g-3">${renderInput("Date", "date", meeting.date, "date", "meeting")}${renderInput("Time", "time", meeting.time, "time", "meeting")}</div>
  ${renderInput("Location / meeting link", "location", meeting.location, "text", "meeting")}
  <label class="form-label w-100">
    Attendees
    <textarea
      data-scope="meeting"
      data-key="attendees"
      placeholder="Names, one per line"
      class="form-control"
    >${escapeHtml(meeting.attendees)}</textarea>
  </label>
  <div class="d-flex justify-content-between gap-2 mt-4">
    <button id="duplicate" class="btn btn-outline-secondary">Duplicate meeting</button>
    <button id="deletemeeting" class="btn btn-outline-danger">Delete meeting</button>
  </div>
</section>`;
  return;
}
// Review and export the meeting proceedings.
function renderMinutesView() {
  getElement("content").innerHTML =
    `<div class="sectionhead d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
  <h2>Meeting minutes</h2>
  <div class="toolbar d-flex flex-wrap align-items-center gap-2">
    <button id="downloadminutes" class="btn btn-outline-secondary">Download text</button>
    <button id="print" class="btn btn-primary">Print / PDF</button>
  </div>
</div>
<p class="small text-body-secondary">Preparation notes are excluded from these minutes.</p>
<pre id="minutesbody" class="minutes"></pre>`;
  getElement("minutesbody").textContent = buildMinutesText();
  return;
}
// Edit the selected agenda item without mixing meeting-level fields.
function renderAgendaWorkspace() {
  const meeting = getCurrentMeeting();
  const agendaItem = getCurrentAgendaItem();
  if (!agendaItem) {
    getElement("content").innerHTML =
      `<div class="empty text-center text-body-secondary border rounded-3 p-4">
  <h2>Your agenda starts here</h2>
  <p>Add an agenda item to capture notes, decisions, and next steps.</p>
</div>`;
    return;
  }
  getElement("content").innerHTML = `<section>
  <div class="sectionhead d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
    <div class="eyebrow">
      Agenda item ${meeting.items.indexOf(agendaItem) + 1} / ${meeting.items.length}
    </div>
    <button id="deletetopic" class="btn btn-outline-danger">Remove item</button>
  </div>
  ${renderInput("Topic", "title", agendaItem.title)}
  <div class="row g-3">
    ${renderInput("Presenter", "presenter", agendaItem.presenter)}${renderInput("Time allocation (minutes)", "minutes", agendaItem.minutes, "number")}${renderSelect("Status", "status", agendaItem.status, ["Upcoming", "In progress", "Complete"])}
  </div>
  <details>
    <summary style="cursor: pointer; color: var(--desk-green); margin: 14px 0">
      Preparation & context · excluded from minutes
    </summary>
    ${renderSelect("Purpose", "purpose", agendaItem.purpose, ["Discuss", "Decide", "Inform"])}${renderTextarea("Preparation / resources", "prep", agendaItem.prep)}
  </details>
</section>
<section>${renderTextarea("Discussion notes", "notes", agendaItem.notes, "discussion-notes")}</section>
<section>
  <div class="sectionhead d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
    <h3>Outcomes & follow-up</h3>
    <div class="toolbar d-flex flex-wrap align-items-center gap-2">
      <button data-add="Action" class="btn btn-outline-secondary">+ Action</button>
      <button data-add="Decision" class="btn btn-outline-secondary">+ Decision</button>
      <button data-add="Motion" class="btn btn-outline-secondary">+ Motion</button>
    </div>
  </div>
  <div id="records"></div>
</section>`;
  renderOutcomeRecords();
}
// Render actions, decisions, and motions for the current agenda item.
function renderOutcomeRecords() {
  const agendaItem = getCurrentAgendaItem();
  getElement("records").innerHTML = agendaItem.records.length
    ? agendaItem.records
        .map(
          (record) => `<div class="record border rounded-3 p-3 mt-3" data-record="${record.id}">
  <div class="recordtop d-flex flex-wrap align-items-center gap-2">
    <span class="badge rounded-pill text-bg-light">${record.type}</span>
    ${
      record.type === "Action"
        ? `<input
  type="checkbox"
  data-rkey="done"
  aria-label="Action completed"
  ${record.done ? "checked" : ""}
  class="form-check-input"
/>`
        : ""
    }
    <input
      type="text"
      data-rkey="text"
      aria-label="${record.type} description"
      placeholder="${record.type === "Action" ? "What needs to happen?" : record.type === "Motion" ? "Record the motion…" : "What was decided?"}"
      value="${escapeHtml(record.text)}"
      class="form-control"
    />
    <button
      data-remove="${record.id}"
      aria-label="Delete ${record.type.toLowerCase()}"
      class="btn btn-outline-secondary"
    >
      ×
    </button>
  </div>
  ${
    record.type === "Action"
      ? `<div class="row g-3">
  <label class="form-label w-100">
    Owner
    <input
      data-rkey="owner"
      value="${escapeHtml(record.owner)}"
      placeholder="Assign a name"
      class="form-control"
    />
  </label>
  <label class="form-label w-100">
    Due date
    <input
      type="date"
      data-rkey="due"
      value="${escapeHtml(record.due)}"
      class="form-control"
    />
  </label>
</div>`
      : record.type === "Motion"
        ? `<div class="row g-3">
  <label class="form-label w-100">
    Moved by
    <input data-rkey="owner" value="${escapeHtml(record.owner)}" class="form-control" />
  </label>
  <label class="form-label w-100">
    Outcome
    <select data-rkey="outcome" class="form-select">
      ${["Pending", "Carried", "Not carried", "Withdrawn"].map((text) => `<option ${record.outcome === text ? "selected" : ""}>${text}</option>`).join("")}
    </select>
  </label>
</div>`
        : ""
  }
</div>`,
        )
        .join("")
    : `<div class="empty text-center text-body-secondary border rounded-3 p-4">
  Turn the conversation into clear decisions and next steps.
</div>`;
}
// Produce minutes in agenda order. Preparation is intentionally excluded.
function buildMinutesText() {
  let meeting = getCurrentMeeting();
  let lines = [
    meeting.title || "Untitled meeting",
    [meeting.date, meeting.time, meeting.location].filter(Boolean).join(" · "),
    "",
    "ATTENDEES",
    meeting.attendees || "Not recorded",
    "",
  ];
  meeting.items.forEach((agendaItem, i) => {
    lines.push(
      `${i + 1}. ${agendaItem.title || "Untitled item"}`,
      `${agendaItem.status} · ${agendaItem.minutes} minutes${agendaItem.presenter ? " · Presenter: " + agendaItem.presenter : ""}`,
      "",
      agendaItem.notes || "No discussion notes recorded.",
    );
    agendaItem.records.forEach((record) =>
      lines.push(
        `${record.type.toUpperCase()}: ${record.text || "(No description)"}${record.type === "Action" ? ` | ${record.done ? "Complete" : "Open"} | Owner: ${record.owner || "Unassigned"} | Due: ${record.due || "Not set"}` : record.type === "Motion" ? ` | Moved by: ${record.owner || "Not recorded"} | ${record.outcome}` : ""}`,
      ),
    );
    lines.push("", "────────────────────────", "");
  });
  return lines.join("\n");
}
function downloadFile(text, name, type) {
  let a = document.createElement("a"),
    url = URL.createObjectURL(
      new Blob([text], {
        type,
      }),
    );
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// Move the complete item object so its notes and records stay attached.
function moveAgendaItem(id, targetIndex) {
  let agendaItems = getCurrentMeeting().items,
    sourceIndex = agendaItems.findIndex((agendaItem) => agendaItem.id === id);
  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= agendaItems.length) {
    return;
  }
  agendaItems.splice(targetIndex, 0, agendaItems.splice(sourceIndex, 1)[0]);
  saveMeetings();
  renderCurrentView();
}
getElement("content").addEventListener("input", (event) => {
  let control = event.target;
  if (control.dataset.scope) {
    let targetRecord =
      control.dataset.scope === "meeting" ? getCurrentMeeting() : getCurrentAgendaItem();
    targetRecord[control.dataset.key] =
      control.type === "number"
        ? Math.min(999, Math.max(0, Number(control.value) || 0))
        : control.value;
    saveMeetings();
    renderAgenda();
  }
  if (control.dataset.rkey) {
    let record = getCurrentAgendaItem().records.find(
      (r) => r.id === control.closest("[data-record]").dataset.record,
    );
    record[control.dataset.rkey] = control.type === "checkbox" ? control.checked : control.value;
    saveMeetings();
  }
});
document.addEventListener("click", (event) => {
  let button = event.target.closest("button");
  if (!button) {
    return;
  }
  if (button.dataset.tab) {
    activeTab = button.dataset.tab;
    renderCurrentView();
  }
  if (button.dataset.select) {
    selectedAgendaItemId = button.dataset.select;
    activeTab = "workspace";
    renderCurrentView();
  }
  if (button.dataset.move) {
    let i = getCurrentMeeting().items.findIndex(
      (agendaItem) => agendaItem.id === button.dataset.id,
    );
    moveAgendaItem(button.dataset.id, i + Number(button.dataset.move));
  }
  if (button.dataset.add) {
    getCurrentAgendaItem().records.push({
      id: createId(),
      type: button.dataset.add,
      text: "",
      owner: "",
      due: "",
      done: false,
      outcome: "Pending",
    });
    saveMeetings();
    renderOutcomeRecords();
    getElement("records").lastElementChild.querySelector('[data-rkey="text"]').focus();
  }
  if (button.dataset.remove && confirm("Delete this record?")) {
    getCurrentAgendaItem().records = getCurrentAgendaItem().records.filter(
      (record) => record.id !== button.dataset.remove,
    );
    saveMeetings();
    renderOutcomeRecords();
  }
  switch (button.id) {
    case "addtopic": {
      const agendaItem = createAgendaItem();
      getCurrentMeeting().items.push(agendaItem);
      selectedAgendaItemId = agendaItem.id;
      activeTab = "workspace";
      saveMeetings();
      renderCurrentView();
      getElement("content").querySelector('[data-key="title"]').select();
      break;
    }
    case "newmeeting": {
      let meeting = createMeeting();
      state.meetings.unshift(meeting);
      state.selected = meeting.id;
      activeTab = "setup";
      saveMeetings();
      renderCurrentView();
      getElement("content").querySelector('[data-key="title"]').select();
      break;
    }
    case "deletetopic":
      if (confirm("Delete this agenda item and all of its notes and outcomes?")) {
        getCurrentMeeting().items = getCurrentMeeting().items.filter(
          (agendaItem) => agendaItem.id !== selectedAgendaItemId,
        );
        saveMeetings();
        renderCurrentView();
      }
      break;
    case "deletemeeting":
      if (confirm("Delete this meeting and all its contents? Export a backup first if needed.")) {
        state.meetings = state.meetings.filter((meeting) => meeting.id !== state.selected);
        if (!state.meetings.length) {
          state.meetings = [createMeeting()];
        }
        state.selected = state.meetings[0].id;
        saveMeetings();
        renderCurrentView();
      }
      break;
    case "duplicate": {
      let meeting = validateBackup({
        version: 1,
        meetings: [getCurrentMeeting()],
      })[0];
      meeting.title += " (copy)";
      state.meetings.unshift(meeting);
      state.selected = meeting.id;
      saveMeetings();
      renderCurrentView();
      break;
    }
    case "export":
      downloadFile(
        JSON.stringify(
          {
            version: 1,
            exportedAt: new Date().toISOString(),
            meetings: state.meetings,
          },
          null,
          2,
        ),
        "meeting-desk-backup-" + getToday() + ".json",
        "application/json",
      );
      break;
    case "import":
      getElement("file").click();
      break;
    case "print":
      getElement("printout").textContent = buildMinutesText();
      window.print();
      break;
    case "downloadminutes":
      downloadFile(
        buildMinutesText(),
        "meeting-minutes-" + getCurrentMeeting().date + ".txt",
        "text/plain",
      );
      break;
    case "closehelp":
      getElement("helpdialog").close();
      break;
    case "help":
      getElement("helpdialog").showModal();
      break;
  }
});
getElement("meetingpick").onchange = (event) => {
  state.selected = event.target.value;
  selectedAgendaItemId = null;
  renderCurrentView();
};
getElement("file").onchange = async (event) => {
  const backupFile = event.target.files[0];
  if (!backupFile) {
    return;
  }
  try {
    if (backupFile.size > 10 * 1024 * 1024) {
      throw Error("Backup must be smaller than 10 MB.");
    }
    const imported = validateBackup(JSON.parse(await backupFile.text()));
    if (!imported.length) {
      throw Error("This backup contains no meetings.");
    }
    state.meetings.unshift(...imported);
    state.selected = imported[0].id;
    saveMeetings();
    renderCurrentView();
  } catch (err) {
    alert("Import failed: " + err.message);
  } finally {
    event.target.value = "";
  }
};
getElement("agenda").addEventListener("dragstart", (event) => {
  if (!event.target.classList.contains("grip")) {
    return;
  }
  draggedAgendaItemId = event.target.closest("[data-id]").dataset.id;
  event.dataTransfer.setData("text/plain", draggedAgendaItemId);
  event.dataTransfer.effectAllowed = "move";
});
getElement("agenda").addEventListener("dragover", (event) => {
  if (!draggedAgendaItemId) {
    return;
  }
  const row = event.target.closest(".topic");
  if (row) {
    event.preventDefault();
    document.querySelectorAll(".topic.over").forEach((x) => x.classList.remove("over"));
    row.classList.add("over");
    event.dataTransfer.dropEffect = "move";
  }
});
getElement("agenda").addEventListener("drop", (event) => {
  event.preventDefault();
  const row = event.target.closest(".topic");
  if (row && draggedAgendaItemId) {
    moveAgendaItem(
      draggedAgendaItemId,
      getCurrentMeeting().items.findIndex((agendaItem) => agendaItem.id === row.dataset.id),
    );
  }
  draggedAgendaItemId = null;
});
getElement("agenda").addEventListener("dragend", () => {
  draggedAgendaItemId = null;
  document.querySelectorAll(".topic.over").forEach((x) => x.classList.remove("over"));
});
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) {
    canSave = false;
    showNotice(
      "Meeting data changed in another tab. To avoid overwriting it, saving here is paused. Export any unsaved work, then reload this page.",
    );
    getElement("save").textContent = "Saving paused · another tab changed data";
  }
});
renderCurrentView();
saveMeetings();
