# Meeting Desk

A browser-based meeting workspace for https://minutes.dudgeon.io/.

## Files

- `index.html` — page structure, navigation, and help dialog.
- `assets/css/meeting-desk.css` — brand colors, agenda styling, and print rules.
- `assets/js/meeting-desk.js` — meeting data, backup validation, view rendering, and event handlers.
- `meeting-tracker.html` — redirects old bookmarks to the home page.
- `CNAME` — GitHub Pages custom domain; keep this file when deploying.

Bootstrap 5.3.8 CSS supplies the responsive grid, cards, buttons, forms, navigation, and utilities. It loads from jsDelivr with an integrity check. No Bootstrap JavaScript is needed: the application controls its own views and uses a native dialog.

## Run and deploy

There is no build step. Serve the repository root with any static web server. For local development:

```sh
python3 -m http.server 8000
```

Visit http://localhost:8000. GitHub Pages should publish the root of the `main` branch. Keep `index.html` and `assets/` together. An internet connection is needed to load Bootstrap CSS.

## Features

Create multiple meetings, reorder agenda topics using drag handles or arrow buttons, and keep separate preparation and discussion notes for each topic. Track decisions, motions, and actions with owners, due dates, and completion status. Review minutes, download them as text, or print to PDF. Preparation notes are excluded from minutes.

## Saved data and backups

The original localStorage key, `dudgeon.meetingdesk.v1`, and version 1 JSON backup format are unchanged. Existing saved meetings load automatically on the same website origin. Saved IDs are preserved on reload; importing or duplicating meetings assigns fresh IDs to avoid collisions.

Data stays in the current browser. This application does not provide accounts, a server database, or synchronization. Export backups before clearing browser storage or changing domains. Import adds meetings rather than replacing them. If another tab changes saved data, this tab pauses saving to avoid overwriting that work; export any local work before reloading.

## Editing

Use two-space indentation and descriptive function names. The JavaScript is organized into data helpers, validation and storage, view renderers, minutes/download helpers, and event handlers. Escape user-controlled text before placing it in HTML templates. Keep preparation content out of generated minutes.

`.prettierrc.json` defines formatting for future edits. Prettier is optional and is not a runtime dependency.

## Validation

With Node.js 22.13 or newer, run `npm ci`, `npm test`, and `npm run check`. The development-only tests use jsdom to exercise form events, reorder behavior, saved-data reload, backup imports, and minutes generation. They do not replace visual browser testing.

## Attendance

The Attendance tab tracks each person's name, role or department, status, and attendance notes. Statuses are Not recorded, Present, Absent, Excused, and Tentative. Totals update as you mark attendance. Minutes group the roster by status and include attendance notes.

Existing free-text attendee lists migrate to roster entries, one per line, with a Not recorded status. New backups retain the roster using the existing version 1 format. Importing or duplicating a meeting copies its attendance as well; review statuses when reusing a meeting for a new date.
