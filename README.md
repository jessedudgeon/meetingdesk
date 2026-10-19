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

The original localStorage key, `dudgeon.meetingdesk.v1`, and version 1 JSON backup compatibility are preserved. Backups now also include templates and archived status. Existing saved meetings load automatically on the same website origin. Saved IDs are preserved on reload; importing or duplicating meetings assigns fresh IDs to avoid collisions.

Without login, data stays in the current browser. Configure Supabase below to enable private accounts and cloud saving. Account data is kept in memory in the browser and persisted to Supabase; it is not written to the guest browser workspace. Export backups before clearing browser storage or changing domains. Import adds meetings rather than replacing them. If another tab changes saved data, this tab pauses saving to avoid overwriting that work; export any local work before reloading.

## Editing

Use two-space indentation and descriptive function names. The JavaScript is organized into data helpers, validation and storage, view renderers, minutes/download helpers, and event handlers. Escape user-controlled text before placing it in HTML templates. Keep preparation content out of generated minutes.

`.prettierrc.json` defines formatting for future edits. Prettier is optional and is not a runtime dependency.

## Validation

With Node.js 22.13 or newer, run `npm ci`, `npm test`, and `npm run check`. The development-only tests use jsdom to exercise form events, reorder behavior, saved-data reload, backup imports, and minutes generation. They do not replace visual browser testing.

## Attendance

The Attendance tab tracks each person's name, role or department, status, and attendance notes. Statuses are Not recorded, Present, Absent, Excused, and Tentative. Totals update as you mark attendance. Minutes group the roster by status and include attendance notes.

Existing free-text attendee lists migrate to roster entries, one per line, with a Not recorded status. New backups retain the roster using the existing version 1 format. Importing or duplicating a meeting copies its attendance as well; review statuses when reusing a meeting for a new date.

## Connect accounts and cloud storage (one-time setup)

1. Create a project at https://supabase.com/dashboard. Use a project approved for the meeting information you plan to store.
2. In its SQL Editor, run [`supabase/setup.sql`](supabase/setup.sql). This creates a private workspace per authenticated user, enables row-level security, and installs a revision-checked save function.
3. Under Authentication, enable the Email provider. Set Site URL to `https://minutes.dudgeon.io` and include that URL in allowed redirect URLs. Keep email confirmation enabled. For reliable production account-confirmation email delivery, configure your own SMTP provider in Supabase. You can instead create your own confirmed user through the dashboard for initial testing and disable public signups if desired.
4. From the project's Connect/API settings, copy the project URL and **publishable key** (a legacy `anon` key also works). Put them into [`assets/js/cloud-config.js`](assets/js/cloud-config.js). These are public browser configuration, not server secrets. Never use the `service_role` or secret key.
5. Deploy the changed files through GitHub Pages. Choose **Log in / account**, create and confirm your account, then log in.
6. Use **Copy browser meetings to account** to migrate existing notes explicitly. The browser originals remain untouched. This copies the current browser workspace, so do it on the device with your old notes; repeated sessions can create duplicates. You can also export and import backups.
7. Confirm the save status says **Saved to your account**. Log in on a second device and verify meetings and templates load.

Each account owns its own workspace. This release does not share meetings between users or implement simultaneous collaboration. Account content is only loaded after authentication; the database policies enforce ownership even if someone bypasses the interface. Passwords are handled by Supabase Auth, never by application storage.

Cloud edits autosave after a short pause. Failed saves stay in memory; keep the page open and use Account → Retry saving or export a backup. A stale device cannot silently overwrite a newer saved workspace: it pauses on a revision conflict. Export its changes, reload, then import the backup to recover those edits as separate meetings. Cloud data is fetched at login/reload, not continuously in the background. The workspace uses one JSON document per user, with up to 500 meetings and 500 templates supported by backup validation; this is designed for personal meeting records, not an organization-wide document archive.

## Templates and history

Use **Templates** to add the weekly IT standup starter or save the current meeting as a template. Templates preserve agenda order, presenters, preparation, duration, location, time, and the roster. Starting a meeting resets its date, discussion notes, outcomes, item progress, and attendance statuses/notes. Use Edit on a template card to change its title, agenda, preparation, timing, and roster directly. Changes autosave without creating a meeting.

**Meetings** lists all saved meetings newest first and searches their text, dates, and action items. Archive/restore is available under Meeting setup; archived meetings remain searchable and editable. Creating a new meeting never replaces an old meeting. Backups include templates as well as notes.

## Cloud verification before production use

Automated tests cover the local workspace and mocked cloud save/failure/conflict flows. A live Supabase project is required to verify confirmation email, login on two devices, SQL policies, and deployment settings. Test with two accounts: each must only see its own workspace. A request for the other user's row must return no rows, and writes to another user ID must fail. Verify conflicting device edits are rejected. No live project credentials are included in this repository.

## Enable Google sign-in

The account dialog supports **Continue with Google** through Supabase OAuth. Email/password remains available. No Google client secret belongs in this repository.

1. Open Google Cloud Console and select or create a project. Configure Google Auth Platform branding and audience for Meeting Desk. If the app is in Testing, add your Google account as a test user.
2. Create an OAuth client of type **Web application**. Set the authorized JavaScript origin to `https://minutes.dudgeon.io` and the authorized redirect URI to `https://efehgfntchczottrmosm.supabase.co/auth/v1/callback`.
3. In Supabase → Authentication → Sign In / Providers → Google, enable Google and enter the Google client ID and client secret. Save them in Supabase only.
4. In Supabase → Authentication → URL Configuration, set Site URL and add an allowed redirect URL of `https://minutes.dudgeon.io/`.
5. On the website choose Continue with Google. Complete Google's account selection and verify you return signed in, then save a meeting and reload to verify persistence.

The Supabase SDK processes the OAuth return and loads the same private workspace mechanism used by email login. Provider setup and a real Google login are required for end-to-end verification.

Reference: https://supabase.com/docs/guides/auth/social-login/auth-google

## Workspace layout

The app opens on Overview, with upcoming meetings, recent notes, open actions, and overdue counts. The sidebar links to Meetings, Action items, and Templates. The account button shows the signed-in name or email; save status stays in the top bar.

New meeting opens a dialog with a blank/template choice, agenda preview, title, and date. Meeting details, attendance, and printable minutes remain inside each meeting. Attendance uses a compact table and supports Mark all present. Small screens replace the agenda list with a topic selector; desktop retains drag handles and reorder arrows.

Action items collects actions from every meeting, including archived meetings. Filter by owner, completion, overdue state, due date, or text. Checking an action updates the original meeting record; its source link opens that topic. Archiving a meeting does not hide unfinished commitments.

Templates can be created or edited directly. Starting from a template creates fresh IDs, a new date, empty discussion/outcomes, and unrecorded attendance. Existing meetings remain independent. Print / PDF produces structured minutes with attendance and outcomes; preparation remains excluded.

`assets/js/workspace.js` contains the dashboard and navigation views, using the existing data and storage pipeline. No database migration is required. Tests cover the new flows alongside legacy backups and cloud-save behavior.
