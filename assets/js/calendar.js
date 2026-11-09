// Dates are local calendar dates, never parsed as UTC timestamps.
"use strict";
let calendarState;
function resetCalendar() {
  calendarState = { month: getToday().slice(0, 7), day: getToday(), series: "", type: "all", archived: false };
}
resetCalendar();
function validCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(year, month, 0).getDate();
}
function calendarEvents() {
  const matches = (m) => !calendarState.series || seriesKey(m.series) === calendarState.series;
  const events = [];
  for (const m of state.meetings) {
    if (!matches(m)) continue;
    if (calendarState.type !== "actions" && (!m.archived || calendarState.archived) && validCalendarDate(m.date)) {
      events.push({ date: m.date, time: m.time || "", kind: "Meeting", title: m.title || "Untitled meeting", meeting: m });
    }
    if (calendarState.type !== "meetings") {
      for (const t of m.items) for (const r of t.records) {
        if (r.type === "Action" && !r.done && validCalendarDate(r.due)) {
          events.push({ date: r.due, time: "", kind: "Action due", title: r.text || "Untitled action", meeting: m, action: r });
        }
      }
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.title.localeCompare(b.title));
}
function calendarView() {
  const groups = seriesGroups();
  if (!groups.some(g => g.key === calendarState.series)) calendarState.series = "";
  getElement("overview-content").innerHTML = heading("CALENDAR", "Make time for what’s next.",
    "Meeting dates and unfinished action deadlines. Choose a day to see details.",
    '<button id="calendar-new" class="btn btn-primary">New meeting on selected day</button>') +
    `<section class="surface"><div class="filter-row">
      <label>Month<input id="calendar-month" class="form-control" type="month" min="1000-01" max="9999-12" value="${calendarState.month}"></label>
      <label>Series<select id="calendar-series" class="form-select"><option value="">All series</option>${groups.map(g => `<option value="${escapeHtml(g.key)}" ${g.key === calendarState.series ? "selected" : ""}>${escapeHtml(g.name)}</option>`).join("")}</select></label>
      <label>Show<select id="calendar-type" class="form-select">${[["all","Meetings and actions"],["meetings","Meetings"],["actions","Action deadlines"]].map(([v, label]) => `<option value="${v}" ${calendarState.type === v ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      <label><input id="calendar-archived" type="checkbox" ${calendarState.archived ? "checked" : ""}> Include archived meetings</label>
    </div><div class="d-flex flex-wrap gap-2 align-items-center my-3">
      <button id="calendar-prev" class="btn btn-outline-secondary" aria-label="Previous month">←</button>
      <button id="calendar-today" class="btn btn-outline-secondary">Today</button>
      <button id="calendar-next" class="btn btn-outline-secondary" aria-label="Next month">→</button>
      <h2 id="calendar-month-title" class="h4 m-0"></h2></div>
      <p class="small text-body-secondary">Open actions from archived meetings remain visible. Undated items are available in Meetings and Action items.</p>
      <div id="calendar-grid" class="month-grid"></div>
      <section id="calendar-day-details" class="mt-4" aria-live="polite"></section>
    </section>`;
  renderCalendarDays();
}
function renderCalendarDays() {
  const [year, month] = calendarState.month.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const length = new Date(year, month, 0).getDate();
  const events = calendarEvents();
  getElement("calendar-month-title").textContent = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  getElement("calendar-prev").disabled = calendarState.month === "1000-01";
  getElement("calendar-next").disabled = calendarState.month === "9999-12";
  let html = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => `<div class="weekday" aria-hidden="true">${d}</div>`).join("");
  html += '<div class="month-blank" aria-hidden="true"></div>'.repeat(first.getDay());
  for (let day = 1; day <= length; day++) {
    const date = `${calendarState.month}-${String(day).padStart(2, "0")}`;
    const items = events.filter(e => e.date === date);
    const meetings = items.filter(e => e.kind === "Meeting").length;
    const actions = items.length - meetings;
    html += `<button class="month-day ${date === getToday() ? "is-today" : ""}" data-calendar-day="${date}"
      aria-pressed="${date === calendarState.day}" aria-label="${date}: ${meetings} meetings, ${actions} action deadlines"${date === getToday() ? ' aria-current="date"' : ""}>
      <strong>${day}</strong><span class="day-count">${meetings ? `M: ${meetings}` : ""}</span><span class="day-count">${actions ? `A: ${actions}` : ""}</span></button>`;
  }
  getElement("calendar-grid").innerHTML = html;
  const items = events.filter(e => e.date === calendarState.day);
  getElement("calendar-day-details").innerHTML = `<h3>${calendarState.day}</h3><p class="small">M = meetings · A = action deadlines</p>` +
    (items.length ? `<ul class="list-unstyled">${items.map(e => `<li class="border rounded p-3 mb-2"><span class="status-pill">${e.kind}</span>
      <button class="table-title d-block mt-2" ${e.action ? `data-jump-action="${e.action.id}"` : `data-open-workspace="${e.meeting.id}"`}>${escapeHtml(e.title)}</button>
      <small>${e.action ? `Owner: ${escapeHtml(e.action.owner || "Unassigned")} · ${escapeHtml(e.meeting.title)}` : escapeHtml([e.time || "Time not set", e.meeting.location].filter(Boolean).join(" · "))}${e.meeting.archived ? " · Archived meeting" : ""}</small></li>`).join("")}</ul>`
      : empty("Nothing scheduled", "No matching meetings or action deadlines on this day."));
}
document.addEventListener("change", (event) => {
  const target = event.target;
  if (!target.id.startsWith("calendar-")) return;
  if (target.id === "calendar-month") {
    if (!validCalendarDate(target.value + "-01")) { target.value = calendarState.month; return; }
    calendarState.month = target.value;
    calendarState.day = target.value + "-01";
  } else if (target.id === "calendar-series") calendarState.series = target.value;
  else if (target.id === "calendar-type") calendarState.type = target.value;
  else if (target.id === "calendar-archived") calendarState.archived = target.checked;
  else return;
  renderCalendarDays();
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.calendarDay) {
    calendarState.day = button.dataset.calendarDay;
    renderCalendarDays();
    getElement("calendar-grid").querySelector(`[data-calendar-day="${calendarState.day}"]`).focus();
  } else if (["calendar-prev", "calendar-next"].includes(button.id)) {
    const [year, month] = calendarState.month.split("-").map(Number);
    const next = new Date(year, month - 1 + (button.id === "calendar-prev" ? -1 : 1), 1);
    if (next.getFullYear() < 1000 || next.getFullYear() > 9999) return;
    calendarState.month = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    calendarState.day = calendarState.month + "-01";
    calendarView();
    getElement(button.id).focus();
  } else if (button.id === "calendar-today") {
    calendarState.month = getToday().slice(0, 7);
    calendarState.day = getToday();
    calendarView();
    getElement("calendar-today").focus();
  } else if (button.id === "calendar-new") {
    openNewMeeting();
    getElement("new-date").value = calendarState.day;
  }
});
