// Views share the original model, validators, and account save pipeline.
"use strict";
let editingTemplate = false;
let followUpId = null;
let editingActionId = null;
const originalView = renderCurrentView,
  originalAgenda = renderAgenda;
const originalReplace = window.meetingDesk.replace;
const globalViews = ["dashboard", "history", "actions", "templates"];
const allActions = () =>
  state.meetings.flatMap((m) =>
    m.items.flatMap((t) => t.records.filter((r) => r.type === "Action").map((r) => ({ m, t, r }))),
  );
const openCount = (m) =>
  m.items.flatMap((t) => t.records).filter((r) => r.type === "Action" && !r.done).length;
const empty = (title, text) => `<div class="empty-state"><h3>${title}</h3><p>${text}</p></div>`;
const heading = (
  label,
  title,
  text,
  button = '<button class="btn btn-primary" data-new-meeting>+ New meeting</button>',
) =>
  `<div class="page-heading"><div><div class="eyebrow">${label}</div><h1>${title}</h1><p>${text}</p></div>${button}</div>`;
const statusLabel = (m) =>
  m.archived
    ? "Archived"
    : m.date > getToday()
      ? "Upcoming"
      : m.date === getToday()
        ? "Today"
        : "Past";
function leaveTemplate() {
  editingTemplate = false;
  if (!state.meetings.some((m) => m.id === state.selected)) state.selected = state.meetings[0].id;
}
renderAgenda = function () {
  originalAgenda();
  getElement("mobile-topic").innerHTML = getCurrentMeeting()
    .items.map(
      (t, i) =>
        `<option value="${t.id}" ${t.id === selectedAgendaItemId ? "selected" : ""}>${i + 1}. ${escapeHtml(t.title)}</option>`,
    )
    .join("");
};
renderCurrentView = function () {
  const global = globalViews.includes(activeTab);
  getElement("overview-content").hidden = !global;
  getElement("meeting-shell").hidden = global;
  getElement("view-label").textContent =
    { dashboard: "Overview", history: "Meetings", actions: "Action items", templates: "Templates" }[
      activeTab
    ] || (editingTemplate ? "Template editor" : "Meeting workspace");
  document.querySelectorAll(".app-nav button").forEach((b) => {
    const selected =
      b.dataset.tab === activeTab ||
      (!global && b.dataset.tab === (editingTemplate ? "templates" : "history"));
    b.classList.toggle("active", selected);
    if (selected) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  if (global) {
    leaveTemplate();
    if (activeTab === "dashboard") return dashboard();
    if (activeTab === "history") return meetingLibrary();
    if (activeTab === "actions") return actionLibrary();
    return templateLibrary();
  }
  originalView();
  renderPreviousMinutes();
  getElement("template-banner").hidden = editingTemplate === false;
  getElement("meetingpick").hidden = editingTemplate;
  getElement("newmeeting").hidden = editingTemplate;
  document.querySelector('[data-tab="minutes"]').hidden = editingTemplate;
  for (const id of ["follow-up", "duplicate", "deletemeeting", "archive-meeting", "save-template"])
    if (getElement(id)) getElement(id).hidden = editingTemplate;
  getElement("agenda-panel").classList.toggle("secondary-agenda", activeTab !== "workspace");
};
window.meetingDesk.replace = (backup) => {
  followUpId = null;
  editingActionId = null;
  getElement("previous-minutes-panel").replaceChildren();
  getElement("action-edit-dialog").close();
  getElement("new-meeting-dialog").close();
  editingTemplate = false;
  originalReplace(backup);
  activeTab = "dashboard";
  renderCurrentView();
};
function earlierSeriesMeetings(meeting) {
  const series = (meeting.series || "").trim().toLocaleLowerCase();
  if (!series || !meeting.date) return [];
  const stamp = (m) => `${m.date}T${m.time || "00:00"}`;
  return state.meetings.filter((m) => m.id !== meeting.id
    && (m.series || "").trim().toLocaleLowerCase() === series
    && m.date && stamp(m) < stamp(meeting))
    .sort((a, b) => stamp(b).localeCompare(stamp(a)) || a.id.localeCompare(b.id));
}
function renderPreviousMinutes() {
  const panel = getElement("previous-minutes-panel");
  if (editingTemplate) { panel.replaceChildren(); return; }
  const meeting = getCurrentMeeting();
  const sameMeeting = panel.dataset.meeting === meeting.id;
  const wasOpen = sameMeeting && panel.querySelector("details")?.open;
  const previousSelection = sameMeeting ? getElement("previous-minutes-select")?.value : null;
  panel.dataset.meeting = meeting.id;
  const earlier = earlierSeriesMeetings(meeting);
  const selected = earlier.find((m) => m.id === previousSelection) || earlier[0];
  panel.innerHTML = `<details class="border rounded-3 p-3" ${wasOpen ? "open" : ""}>
    <summary class="fw-semibold">Previous minutes${selected ? " · " + escapeHtml(selected.date) : ""}</summary>
    ${selected ? `<p class="small text-body-secondary mt-2">Review earlier minutes from ${escapeHtml(meeting.series)}. Current notes stay below. Preparation notes are excluded.</p>
      <label class="form-label w-100">Earlier meeting
        <select id="previous-minutes-select" class="form-select">${earlier.map((m) => `<option value="${m.id}" ${m.id === selected.id ? "selected" : ""}>${escapeHtml(m.date)} ${escapeHtml(m.time)} · ${escapeHtml(m.title)}${m.archived ? " (archived)" : ""}</option>`).join("")}</select>
      </label>
      <pre id="previous-minutes-text" class="minutes" style="max-height: 24rem; overflow: auto" tabindex="0" aria-label="Previous meeting minutes"></pre>`
      : `<p class="small mt-2 mb-0">${meeting.series ? "No earlier dated meetings in this series yet. Check the dates and times in Meeting details." : "Add a series name in Meeting details to connect existing meetings, or use Schedule follow-up."}</p>`}
    </details>`;
  if (selected) getElement("previous-minutes-text").textContent = buildMinutesText(selected);
}
document.addEventListener("change", (event) => {
  if (event.target.id !== "previous-minutes-select") return;
  const meeting = earlierSeriesMeetings(getCurrentMeeting()).find((m) => m.id === event.target.value);
  if (meeting) {
    getElement("previous-minutes-text").textContent = buildMinutesText(meeting);
    getElement("previous-minutes-panel").querySelector("summary").textContent = "Previous minutes · " + meeting.date;
  }
});
function table(meetings) {
  return meetings.length
    ? `<div class="table-responsive"><table class="table align-middle desk-table"><thead><tr><th>Meeting</th><th>Date</th><th>Status</th><th>Open actions</th><th><span class="visually-hidden">Review</span></th></tr></thead><tbody>${meetings.map((m) => `<tr><td><button class="table-title" data-open-workspace="${m.id}">${escapeHtml(m.title || "Untitled meeting")}</button><small>${escapeHtml(m.location || "Location not set")}</small></td><td>${escapeHtml(m.date || "No date")}</td><td><span class="status-pill">${statusLabel(m)}</span></td><td>${openCount(m)}</td><td><button class="btn btn-sm btn-outline-secondary" data-open-minutes="${m.id}">Minutes</button></td></tr>`).join("")}</tbody></table></div>`
    : empty("Nothing here yet", "Create a meeting or try another filter.");
}
function dashboard() {
  const upcoming = state.meetings
    .filter((m) => !m.archived && m.date >= getToday())
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const recent = state.meetings
    .filter((m) => m.date < getToday())
    .sort((a, b) => b.date.localeCompare(a.date));
  const actions = allActions().filter((a) => !a.r.done),
    overdue = actions.filter((a) => a.r.due && a.r.due < getToday());
  getElement("overview-content").innerHTML =
    heading(
      "YOUR MEETING WORKSPACE",
      "Good meetings. Clear next steps.",
      "Prepare the agenda, capture the conversation, and keep commitments moving.",
    ) +
    `<div class="metric-grid"><button class="metric" data-tab="history"><span>On the calendar</span><strong>${upcoming.length}</strong><small>Today and upcoming</small></button><button class="metric" data-tab="actions"><span>Open action items</span><strong>${actions.length}</strong><small>Across all meetings</small></button><button class="metric" data-show-overdue><span>Needs attention</span><strong class="${overdue.length ? "text-danger" : ""}">${overdue.length}</strong><small>Past the due date</small></button></div>
  <div class="dashboard-grid"><section class="surface"><div class="section-title"><h2>Coming up</h2><button data-tab="history" class="btn btn-sm btn-link">All meetings →</button></div>${table(upcoming.slice(0, 5))}</section><section class="surface"><div class="section-title"><h2>Next steps</h2><button data-tab="actions" class="btn btn-sm btn-link">View all →</button></div>${
    actions.length
      ? actions
          .sort((a, b) => (a.r.due || "9999").localeCompare(b.r.due || "9999"))
          .slice(0, 5)
          .map(
            (a) =>
              `<div class="action-preview"><button class="table-title" data-jump-action="${a.r.id}">${escapeHtml(a.r.text || "Untitled action")}</button><small>${escapeHtml(a.r.owner || "Unassigned")} · ${escapeHtml(a.r.due || "No due date")}</small><small>${escapeHtml(a.m.title)}</small></div>`,
          )
          .join("")
      : empty("All caught up", "Actions captured in meetings appear here.")
  }</section></div><section class="surface mt-4"><div class="section-title"><h2>Recent meeting notes</h2><button data-tab="templates" class="btn btn-sm btn-link">Browse templates →</button></div>${table(recent.slice(0, 5))}</section>`;
}
function meetingLibrary() {
  getElement("overview-content").innerHTML =
    heading(
      "MEETING LIBRARY",
      "Every conversation, in one place.",
      "Find an agenda, revisit a decision, or pick up where you left off.",
    ) +
    `<section class="surface"><div class="filter-row"><label>Search meetings<input id="meeting-search" class="form-control" type="search" placeholder="Title, notes, date, or action…"></label><label>Status<select id="meeting-filter" class="form-select"><option value="all">All meetings</option><option value="active">Active</option><option value="upcoming">Today & upcoming</option><option value="past">Past</option><option value="archived">Archived</option></select></label></div><div id="meeting-results"></div></section>`;
  filterMeetings();
}
function filterMeetings() {
  const q = getElement("meeting-search").value.toLowerCase(),
    f = getElement("meeting-filter").value;
  getElement("meeting-results").innerHTML = table(
    state.meetings
      .filter((m) => JSON.stringify(m).toLowerCase().includes(q))
      .filter(
        (m) =>
          f === "all" ||
          (f === "archived"
            ? m.archived
            : f === "active"
              ? !m.archived
              : f === "upcoming"
                ? !m.archived && m.date >= getToday()
                : m.date < getToday()),
      )
      .sort((a, b) => b.date.localeCompare(a.date)),
  );
}
function actionLibrary() {
  const owners = [
    ...new Set(
      allActions()
        .map((a) => a.r.owner)
        .filter(Boolean),
    ),
  ].sort();
  getElement("overview-content").innerHTML =
    heading(
      "FOLLOW THROUGH",
      "Turn decisions into progress.",
      "Track commitments across every meeting, including archived meetings.",
      '<button id="export-actions" class="btn btn-outline-primary">Export filtered CSV</button>',
    ) +
    `<section class="surface"><div class="filter-row"><label>Search<input id="action-search" class="form-control" type="search" placeholder="Action, meeting, topic, or owner…"></label><label>Owner<select id="action-owner" class="form-select"><option value="">Everyone</option><option value="__unassigned">Unassigned</option>${owners.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("")}</select></label><label>Status<select id="action-status" class="form-select"><option value="open">Open</option><option value="all">All</option><option value="done">Completed</option><option value="overdue">Overdue</option></select></label><label>Due by<input id="action-due" class="form-control" type="date"></label></div><div id="action-results"></div></section>`;
  filterActions();
}
function filteredActions() {
  const q = getElement("action-search").value.toLowerCase(),
    owner = getElement("action-owner").value,
    status = getElement("action-status").value,
    due = getElement("action-due").value;
  return allActions()
    .filter((a) => `${a.r.text} ${a.m.title} ${a.t.title} ${a.r.owner}`.toLowerCase().includes(q))
    .filter((a) => !owner || (owner === "__unassigned" ? !a.r.owner : a.r.owner === owner))
    .filter(
      (a) =>
        status === "all" ||
        (status === "done"
          ? a.r.done
          : status === "overdue"
            ? !a.r.done && a.r.due && a.r.due < getToday()
            : !a.r.done),
    )
    .filter((a) => !due || (a.r.due && a.r.due <= due))
    .sort((a, b) => (a.r.due || "9999").localeCompare(b.r.due || "9999"));
}
function filterActions() {
  const actions = filteredActions();
  getElement("export-actions").disabled = actions.length === 0;
  getElement("action-results").innerHTML = `<p class="small text-body-secondary" role="status">${actions.length} matching action${actions.length === 1 ? "" : "s"}</p>` + (actions.length
    ? `<div class="table-responsive"><table class="table align-middle desk-table"><thead><tr><th>Done</th><th>Action / source</th><th>Owner</th><th>Due</th><th>Edit</th></tr></thead><tbody>${actions.map((a) => `<tr><td><input type="checkbox" class="form-check-input" data-complete-action="${a.r.id}" aria-label="Complete ${escapeHtml(a.r.text)}" ${a.r.done ? "checked" : ""}></td><td><strong>${escapeHtml(a.r.text || "Untitled action")}</strong><button class="source-link" data-jump-action="${a.r.id}">${escapeHtml(a.m.title)} / ${escapeHtml(a.t.title)}</button></td><td>${escapeHtml(a.r.owner || "Unassigned")}</td><td class="${!a.r.done && a.r.due && a.r.due < getToday() ? "text-danger" : ""}">${escapeHtml(a.r.due || "Not set")}</td><td><button class="btn btn-sm btn-outline-secondary" data-edit-action="${a.r.id}" aria-label="Edit ${escapeHtml(a.r.text)}">Edit</button></td></tr>`).join("")}</tbody></table></div>`
    : empty("No matching actions", "Change the filters or add an action from a meeting topic."));
}
function openActionEditor(id) {
  if (document.querySelector("main").inert) return;
  const action = allActions().find((a) => a.r.id === id);
  if (!action) return;
  editingActionId = id;
  getElement("action-edit-source").textContent = `${action.m.title} / ${action.t.title}`;
  getElement("action-edit-text").value = action.r.text;
  getElement("action-edit-owner").value = action.r.owner;
  getElement("action-edit-due").value = action.r.due;
  getElement("action-edit-done").checked = action.r.done;
  getElement("action-owner-suggestions").innerHTML = [...new Set(allActions().map((a) => a.r.owner).filter(Boolean))]
    .sort().map((owner) => `<option value="${escapeHtml(owner)}"></option>`).join("");
  getElement("action-edit-dialog").showModal();
}
getElement("action-edit-cancel").onclick = () => getElement("action-edit-dialog").close();
getElement("action-edit-dialog").addEventListener("close", () => { editingActionId = null; });
getElement("action-edit-form").onsubmit = (event) => {
  event.preventDefault();
  if (document.querySelector("main").inert) return;
  const action = allActions().find((a) => a.r.id === editingActionId);
  const text = getElement("action-edit-text").value.trim();
  if (!action || !text) {
    showNotice(action ? "Enter an action description." : "This action is no longer available.");
    return;
  }
  Object.assign(action.r, {
    text,
    owner: getElement("action-edit-owner").value.trim(),
    due: getElement("action-edit-due").value,
    done: getElement("action-edit-done").checked,
  });
  saveMeetings();
  getElement("action-edit-dialog").close();
  // Preserve the user's filters, including an owner that now has no matches.
  const owner = action.r.owner;
  if (owner && ![...getElement("action-owner").options].some((option) => option.value === owner)) {
    getElement("action-owner").add(new Option(owner, owner));
  }
  filterActions();
};
function exportFilteredActions() {
  const actions = filteredActions();
  if (!actions.length) return;
  const cell = (value) => {
    let text = String(value ?? "");
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const rows = [["Action", "Owner", "Due date", "Status", "Meeting", "Meeting date", "Topic"],
    ...actions.map((a) => [a.r.text, a.r.owner, a.r.due, a.r.done ? "Completed" : "Open", a.m.title, a.m.date, a.t.title])];
  downloadFile("\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n"),
    `meeting-actions-${getToday()}.csv`, "text/csv;charset=utf-8");
}
function templateLibrary() {
  getElement("overview-content").innerHTML =
    heading(
      "A HEAD START",
      "A familiar agenda. A fresh conversation.",
      "Build reusable agendas and rosters for the meetings you run regularly.",
      '<button class="btn btn-primary" data-new-template>+ New template</button>',
    ) +
    `<div class="template-grid">${state.templates
      .map(
        (t) =>
          `<article class="surface template-card"><div class="eyebrow">${t.items.length} TOPICS · ${t.items.reduce((n, i) => n + Number(i.minutes), 0)} MINUTES</div><h2>${escapeHtml(t.title)}</h2><ol>${t.items
            .slice(0, 4)
            .map((i) => `<li>${escapeHtml(i.title)}</li>`)
            .join(
              "",
            )}</ol><p class="small text-body-secondary">${t.attendance.length} people on roster${t.items.length > 4 ? ` · +${t.items.length - 4} more topics` : ""}</p><div class="d-flex flex-wrap gap-2 mt-auto"><button class="btn btn-primary" data-start-template="${t.id}">Use template</button><button class="btn btn-outline-secondary" data-edit-template="${t.id}">Edit</button><button class="btn btn-outline-danger" data-remove-template="${t.id}">Delete</button></div></article>`,
      )
      .join(
        "",
      )}<article class="surface template-card starter"><div class="eyebrow">READY TO USE</div><h2>Weekly IT standup</h2><p>Wins, service issues, project progress, blockers, and clear owners for next steps.</p><button class="btn btn-outline-primary mt-auto" data-add-starter>Add starter template</button></article></div>`;
}
renderAttendance = function () {
  const m = getCurrentMeeting();
  getElement("content").innerHTML =
    `<section><div class="section-title"><div><h2>${editingTemplate ? "Template roster" : "Attendance"}</h2><p class="small text-body-secondary">${editingTemplate ? "These people will be added to each new meeting." : "Mark attendance quickly and add notes only where needed."}</p></div><div class="d-flex gap-2">${editingTemplate ? "" : '<button id="mark-present" class="btn btn-outline-secondary">Mark all present</button>'}<button id="add-attendee" class="btn btn-primary">+ Add person</button></div></div><p id="attendance-summary" class="small text-body-secondary" role="status"></p><div class="table-responsive"><table class="table align-middle attendance-table"><thead><tr><th>Name</th><th>Role / department</th><th>Status</th><th>Notes</th><th></th></tr></thead><tbody>${m.attendance.map((p, i) => `<tr data-attendee="${p.id}"><td><input class="form-control" aria-label="Person ${i + 1} name" data-attendance-key="name" value="${escapeHtml(p.name)}"></td><td><input class="form-control" aria-label="Person ${i + 1} role" data-attendance-key="role" value="${escapeHtml(p.role)}"></td><td><select class="form-select" aria-label="Person ${i + 1} status" data-attendance-key="status">${ATTENDANCE_STATUSES.map((s) => `<option ${s === p.status ? "selected" : ""}>${s}</option>`).join("")}</select></td><td><input class="form-control" aria-label="Person ${i + 1} notes" data-attendance-key="notes" value="${escapeHtml(p.notes)}"></td><td><button class="btn btn-sm btn-outline-danger" data-remove-attendee="${p.id}" aria-label="Remove person ${i + 1}">×</button></td></tr>`).join("")}</tbody></table></div>${m.attendance.length ? "" : empty("Who’s joining?", "Add people to start your roster.")}</section>`;
  renderAttendanceSummary();
};
function openNewMeeting(id = "", sourceId = null) {
  followUpId = sourceId;
  getElement("new-template").disabled = Boolean(sourceId);
  getElement("follow-up-options").hidden = !sourceId;
  getElement("review-open-actions").checked = false;
  getElement("new-template").innerHTML =
    '<option value="">Blank meeting</option>' +
    state.templates.map((t) => `<option value="${t.id}">${escapeHtml(t.title)}</option>`).join("");
  if (sourceId) {
    const source = state.meetings.find((m) => m.id === sourceId);
    getElement("new-template").innerHTML = `<option value="">Follow-up: ${escapeHtml(source?.title || "Meeting")}</option>`;
  }
  getElement("new-template").value = id;
  getElement("new-date").value = getToday();
  previewTemplate();
  getElement("new-meeting-dialog").showModal();
}
function previewTemplate() {
  const t = followUpId ? state.meetings.find((m) => m.id === followUpId) : state.templates.find((t) => t.id === getElement("new-template").value);
  getElement("new-title").value = t?.title || "Team meeting";
  getElement("template-preview").innerHTML = t
    ? `<strong>Agenda preview</strong><ol>${t.items.map((i) => `<li>${escapeHtml(i.title)} <small>· ${i.minutes} min</small></li>`).join("")}</ol><small>${t.attendance.length} people. Notes and attendance start fresh.</small>`
    : "Start with an empty agenda and add the topics you need.";
}
getElement("new-template").onchange = previewTemplate;
getElement("cancel-new").onclick = () => getElement("new-meeting-dialog").close();
getElement("new-meeting-form").onsubmit = (event) => {
  event.preventDefault();
  const t = followUpId ? state.meetings.find((m) => m.id === followUpId) : state.templates.find((t) => t.id === getElement("new-template").value);
  if (followUpId && !t) {
    showNotice("The source meeting is no longer available. Close this dialog and try again.");
    return;
  }
  if (state.meetings.length >= 500) {
    showNotice("The workspace supports 500 meetings. Export a backup before removing old meetings.");
    return;
  }
  const m = t ? resetForNextMeeting(t) : createMeeting();
  if (followUpId && getElement("review-open-actions").checked) {
    const reminders = t.items.flatMap((item) => item.records
      .filter((r) => r.type === "Action" && !r.done)
      .map((r) => `• ${r.text || "Untitled action"} — ${r.owner || "Unassigned"}; due ${r.due || "not set"} (Topic: ${item.title})`));
    if (reminders.length) {
      if (m.items.length >= 1000 || reminders.join("\n").length > 190000) {
        showNotice("This meeting is too large for an action review topic. Uncheck reminders to continue.");
        return;
      }
      const review = createAgendaItem("Review previous action items");
      review.prep = `Open actions from "${t.title}" (${t.date || "undated"}), captured when this meeting was created. Update the originals in Action items.

${reminders.join("\n")}`.slice(0, 200000);
      m.items.unshift(review);
    }
  }
  if (t) {
    // Follow-ups and meetings created from one template belong to its series.
    if (!t.series?.trim()) {
      const base = (t.title || "Meeting series").trim().slice(0, 180);
      const used = new Set(state.meetings.concat(state.templates).map(m => (m.series || "").trim().toLowerCase()));
      let name = base, suffix = 2;
      while (used.has(name.toLowerCase())) name = `${base} (${suffix++})`;
      t.series = name;
    }
    t.series = t.series.trim().slice(0, 200);
    m.series = t.series;
  }
  m.title = getElement("new-title").value.trim() || "Untitled meeting";
  m.date = getElement("new-date").value;
  state.meetings.unshift(m);
  state.selected = m.id;
  editingTemplate = false;
  selectedAgendaItemId = null;
  activeTab = "workspace";
  saveMeetings();
  renderCurrentView();
  getElement("new-meeting-dialog").close();
};
getElement("mobile-topic").onchange = (e) => {
  selectedAgendaItemId = e.target.value;
  activeTab = "workspace";
  renderCurrentView();
};
document.addEventListener("input", (e) => {
  if (e.target.dataset.scope === "meeting" && ["series", "date", "time"].includes(e.target.dataset.key)) renderPreviousMinutes();
  if (["meeting-search", "meeting-filter"].includes(e.target.id)) filterMeetings();
  if (["action-search", "action-owner", "action-status", "action-due"].includes(e.target.id))
    filterActions();
});
document.addEventListener("change", (e) => {
  if (e.target.dataset.completeAction) {
    const a = allActions().find((a) => a.r.id === e.target.dataset.completeAction);
    if (a) {
      a.r.done = e.target.checked;
      saveMeetings();
      filterActions();
    }
  }
});
// Capture new controls before the original meeting click handler.
document.addEventListener(
  "click",
  (event) => {
    const b = event.target.closest("button");
    if (!b) return;
    const d = b.dataset;
    const stop = () => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    if (d.editAction) {
      stop();
      openActionEditor(d.editAction);
      return;
    }
    if (b.id === "export-actions") {
      stop();
      exportFilteredActions();
      return;
    }
    if (b.id === "follow-up") {
      stop();
      if (!editingTemplate) openNewMeeting("", state.selected);
      return;
    }
    if (b.id === "newmeeting" || "newMeeting" in d || d.startTemplate) {
      stop();
      openNewMeeting(d.startTemplate || "");
      return;
    }
    if (d.openWorkspace || d.openMinutes) {
      stop();
      leaveTemplate();
      state.selected = d.openWorkspace || d.openMinutes;
      selectedAgendaItemId = null;
      activeTab = d.openMinutes ? "minutes" : "workspace";
      renderCurrentView();
      return;
    }
    if (d.jumpAction) {
      stop();
      const a = allActions().find((a) => a.r.id === d.jumpAction);
      if (!a) return;
      leaveTemplate();
      state.selected = a.m.id;
      selectedAgendaItemId = a.t.id;
      activeTab = "workspace";
      renderCurrentView();
      return;
    }
    if ("showOverdue" in d) {
      stop();
      activeTab = "actions";
      renderCurrentView();
      getElement("action-status").value = "overdue";
      filterActions();
      return;
    }
    if (d.editTemplate || "newTemplate" in d) {
      stop();
      let t = state.templates.find((t) => t.id === d.editTemplate);
      if (!t) {
        t = createMeeting();
        t.title = "New template";
        state.templates.push(t);
        saveMeetings();
      }
      editingTemplate = true;
      state.selected = t.id;
      selectedAgendaItemId = null;
      activeTab = "setup";
      renderCurrentView();
      return;
    }
    if (d.removeTemplate) {
      stop();
      if (confirm("Delete this template? Existing meetings will be kept.")) {
        state.templates = state.templates.filter((t) => t.id !== d.removeTemplate);
        saveMeetings();
        renderCurrentView();
      }
      return;
    }
    if ("addStarter" in d) {
      stop();
      const t = createMeeting();
      t.title = "Weekly IT standup";
      t.items = [
        "Wins and completed work",
        "Service issues and outages",
        "Project and security updates",
        "Blockers and support needed",
        "Owners, outcomes, and next steps",
      ].map((title) => createAgendaItem(title));
      state.templates.push(t);
      saveMeetings();
      renderCurrentView();
      return;
    }
    if (b.id === "mark-present") {
      stop();
      getCurrentMeeting().attendance.forEach((p) => (p.status = "Present"));
      saveMeetings();
      renderAttendance();
      return;
    }
  },
  true,
);
activeTab = "dashboard";
renderCurrentView();

// Structured print output keeps preparation private and makes minutes easier to scan.
function printMeetingMinutes() {
  const m = getCurrentMeeting();
  getElement("printout").innerHTML =
    `<h1 class="print-heading">${escapeHtml(m.title)}</h1><p>${escapeHtml([m.date, m.time, m.location].filter(Boolean).join(" · "))}</p><h2>Attendance</h2><div class="print-notes">${escapeHtml(buildAttendanceText(m))}</div>${m.items.map((t, i) => `<section class="print-topic"><h2>${i + 1}. ${escapeHtml(t.title)}</h2><p>${escapeHtml(t.status)} · ${t.minutes} minutes${t.presenter ? " · " + escapeHtml(t.presenter) : ""}</p><div class="print-notes">${escapeHtml(t.notes || "No discussion notes recorded.")}</div>${t.records.length ? `<ul>${t.records.map((r) => `<li><strong>${escapeHtml(r.type)}:</strong> ${escapeHtml(r.text)}${r.type === "Action" ? ` — ${escapeHtml(r.owner || "Unassigned")} · Due ${escapeHtml(r.due || "not set")} · ${r.done ? "Complete" : "Open"}` : r.type === "Motion" ? ` — ${escapeHtml(r.owner || "Not recorded")} · ${escapeHtml(r.outcome)}` : ""}</li>`).join("")}</ul>` : ""}</section>`).join("")}`;
  window.print();
}
document.addEventListener(
  "click",
  (event) => {
    if (event.target.closest("#print")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      printMeetingMinutes();
    }
  },
  true,
);
