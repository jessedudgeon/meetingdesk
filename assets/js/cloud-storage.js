// Supabase handles authentication; database row policies isolate each account.
const element = (id) => document.getElementById(id);
if (document.readyState === "loading") {
  await new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
}
const desk = window.meetingDesk;
const config = window.MEETING_DESK_CLOUD;
const status = (message) => { element("account-status").textContent = message; };
let client, user, revision = 0, pending = null, saving = false, timer, blocked = false;
let guest = desk.snapshot();
let generation = 0;
const cloud = window.meetingCloud = { active: false, save(data) {
  pending = structuredClone(data);
  element("save").textContent = blocked ? "Saving paused · export a backup" : "Unsaved account changes…";
  clearTimeout(timer);
  if (!blocked) timer = setTimeout(flush, 700);
} };
function lockWorkspace(locked) {
  document.querySelector("main").inert = locked;
  element("import").disabled = locked;
}
async function flush() {
  if (!pending || saving || blocked || !user) return;
  saving = true;
  const payload = pending;
  pending = null;
  const currentGeneration = generation;
  element("save").textContent = "Saving to your account…";
  try {
    const { data, error } = await client.rpc("save_meeting_workspace", {
      expected_revision: revision, workspace_payload: payload,
    });
    if (error) throw error;
    if (currentGeneration !== generation) return;
    revision = data;
    element("save").textContent = pending ? "Unsaved account changes…" : "Saved to your account";
  } catch (error) {
    if (currentGeneration !== generation) return;
    pending = pending || payload;
    blocked = error.code === "40001";
    element("save").textContent = "Not saved to account · export a backup";
    desk.notice(blocked
      ? "Another device changed this account. Export your current work, then reload to load the latest version. Import your backup to recover your edits as separate meetings."
      : "Cloud save failed. Your edits are still on this page. Keep it open, export a backup, or use Account → Retry saving. " + error.message);
  } finally {
    saving = false;
  }
  if (pending && !blocked && element("save").textContent === "Unsaved account changes…") await flush();
}
async function loadAccount(nextUser) {
  if (user?.id === nextUser?.id) return;
  generation++;
  clearTimeout(timer);
  if (!nextUser) {
    user = null; cloud.active = false; pending = null; blocked = false;
    desk.replace(guest); lockWorkspace(false);
    element("account").textContent = "Log in / account";
    element("save").textContent = "Browser workspace";
    element("login-form").hidden = false;
    element("signed-in").hidden = true;
    status("Logged out. Your browser workspace is separate from your account.");
    return;
  }
  if (!cloud.active) guest = desk.snapshot();
  user = nextUser; cloud.active = true; blocked = true;
  lockWorkspace(true);
  element("account").textContent = "Account";
  element("login-form").hidden = true;
  element("signed-in").hidden = false;
  status("Loading your meetings…");
  try {
    const { data, error } = await client.from("meeting_workspaces").select("payload,revision").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    const payload = data?.payload || { version: 1, meetings: [], templates: [] };
    desk.validate(payload);
    desk.replace(payload);
    revision = data?.revision || 0; pending = null; blocked = false;
    lockWorkspace(false);
    element("save").textContent = "Account loaded";
    status(`Signed in as ${user.email}. Meetings and templates are private to this account.`);
  } catch (error) {
    status("Account could not load. Reload to retry or log out. " + error.message);
    element("save").textContent = "Account unavailable · editing paused";
  }
}
element("account").onclick = () => element("account-dialog").showModal();
element("close-account").onclick = () => element("account-dialog").close();
async function authenticate(signup) {
  if (!client || !element("login-form").reportValidity()) return;
  const credentials = { email: element("account-email").value.trim(), password: element("account-password").value };
  status(signup ? "Creating account…" : "Signing in…");
  try {
    const { data, error } = signup ? await client.auth.signUp(credentials) : await client.auth.signInWithPassword(credentials);
    if (error) throw error;
    element("account-password").value = "";
    if (data.session) await loadAccount(data.session.user);
    else status("Check your email to confirm your account, then log in here.");
  } catch (error) { status(error.message); }
}
element("login-form").onsubmit = event => { event.preventDefault(); authenticate(false); };
element("signup").onclick = () => authenticate(true);
element("retry-save").onclick = () => {
  if (blocked) { status("Reload to load the account before saving. Export any unsaved work first."); return; }
  flush();
};
element("signout").onclick = async () => {
  await flush();
  if (pending || saving) { status("Changes are not saved. Retry saving or export a backup before leaving. Log out after saving succeeds."); return; }
  const { error } = await client.auth.signOut();
  if (error) status(error.message);
  else await loadAccount(null);
};
element("copy-browser").onclick = () => {
  if (blocked) return;
  if (!confirm("Copy this browser's meetings and templates into your account? This can be done once per browser session.")) return;
  const account = desk.snapshot();
  // Reuse the import validator's fresh IDs, so copies never overwrite account records.
  const copied = JSON.parse(JSON.stringify(guest));
  function freshIds(value) {
    if (!value || typeof value !== "object") return;
    if ("id" in value) value.id = crypto.randomUUID();
    Object.values(value).forEach(freshIds);
  }
  freshIds(copied);
  account.meetings.push(...copied.meetings); account.templates.push(...copied.templates);
  try { desk.replace(account); cloud.save(account); element("copy-browser").disabled = true; }
  catch (error) { status(error.message); }
};
window.addEventListener("beforeunload", event => {
  if (pending || saving) { event.preventDefault(); event.returnValue = ""; }
});
window.addEventListener("online", () => { if (!blocked) flush(); });
if (!config?.url || !config?.publishableKey) {
  status("Account storage is not configured yet. The site owner needs to connect Supabase using the setup steps in README. Browser meetings, templates, and history work now.");
  element("login-form").hidden = true;
} else {
  lockWorkspace(true);
  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.102.0/+esm");
    client = createClient(config.url, config.publishableKey);
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (data.session) await loadAccount(data.session.user);
    else { lockWorkspace(false); status("Log in or create an account to save meetings across devices."); }
    client.auth.onAuthStateChange((event, session) => {
      // Leave the auth callback before making database calls.
      setTimeout(() => {
        if (event === "SIGNED_OUT" && (pending || saving)) {
          blocked = true; lockWorkspace(true);
          desk.notice("Your session ended with unsaved changes. Export a backup before reloading.");
          return;
        }
        loadAccount(session?.user || null);
      }, 0);
    });
  } catch (error) {
    lockWorkspace(false); status("Cloud connection unavailable. Browser workspace is still available. " + error.message);
  }
}
