// Explicit action-to-task linking. Meeting completion never awards XP or approves a task.
(() => {
  let current = null, sequence = 0;
  const dialog = document.createElement('dialog');
  dialog.id = 'questboard-dialog';
  dialog.setAttribute('aria-labelledby', 'questboard-title');
  document.body.append(dialog);
  const find = id => allActions().find(a => a.r.id === id);
  const validId = id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const message = text => { const node = dialog.querySelector('[role="status"]'); if(node) node.textContent = text; };
  function close() { sequence++; current = null; dialog.close(); }
  const replace = window.meetingDesk.replace;
  window.meetingDesk.replace = backup => { close(); replace(backup); };
  async function open(id) {
    const action = find(id);
    if (!action || document.querySelector('main').inert) return;
    if (!window.meetingCloud?.active) { showNotice('Sign in to Minutes with your QuestBoard account to link an action.'); return; }
    current = action;
    const request = ++sequence;
    dialog.innerHTML = `<h2 id="questboard-title">QuestBoard task & experience</h2><p>${escapeHtml(action.r.text || 'Untitled action')}</p><div id="questboard-content"></div><p role="status">Loading…</p><button type="button" data-qb-close class="btn btn-outline-secondary">Close</button>`;
    dialog.showModal();
    try {
      if (validId(action.r.questTask)) {
        const task = await window.meetingCloud.questStatus(action.r.questTask);
        if (request !== sequence) return;
        if (!task) throw Error('This task is unavailable to your current account.');
        dialog.querySelector('#questboard-content').innerHTML = `<p><strong>${escapeHtml(task.title)}</strong></p><p>Status: ${escapeHtml(task.status.replace(/_/g,' '))}</p><p>${task.awarded} XP awarded · ${task.xp_reward} XP planned on approval</p><a class="btn btn-primary" href="https://projects.dudgeon.io/?task=${encodeURIComponent(task.id)}&org=${encodeURIComponent(task.org_id)}" target="_blank" rel="noopener">Open task in QuestBoard</a><p class="small mt-3">Task status and XP come from QuestBoard. The Minutes checkbox remains your meeting follow-up record.</p>`;
        message('Current task status loaded. Close and reopen to refresh.');
      } else {
        const destinations = await window.meetingCloud.questDestinations();
        if (request !== sequence) return;
        if (!destinations.length) throw Error('No destinations available. A QuestBoard department manager or project lead can create tasks.');
        dialog.querySelector('#questboard-content').innerHTML = `<form id="questboard-create"><label class="form-label w-100">Task title<input name="title" class="form-control" required maxlength="160" value="${escapeHtml(action.r.text.slice(0,160))}"></label><label class="form-label w-100">Project (optional)<select name="destination" class="form-select">${destinations.map(d=>`<option value="${escapeHtml(d.kind+':'+d.id)}">${escapeHtml(d.label)}</option>`).join('')}</select></label><p class="small">No project uses the department’s shared quick-task queue. The action text, meeting title, topic, owner name and due date will be copied to QuestBoard and visible to the destination’s members.</p><label class="form-label w-100">XP on approval<select name="xp" class="form-select"><option value="15">15 · Small</option><option value="30">30 · Standard</option><option value="60">60 · Complex</option><option value="100">100 · Major</option></select></label><p class="small">Starts unassigned. Choose the account responsible in QuestBoard; a typed owner name is kept as context. XP is awarded once after review and approval.</p><button class="btn btn-primary" type="submit">Create linked task</button></form>`;
        message('Creating a task does not mark the action complete.');
      }
    } catch (error) { if(request===sequence) message(error.message || 'QuestBoard is unavailable. Close and retry.'); }
  }
  document.addEventListener('click', event => {
    const button=event.target.closest('[data-quest-action]');
    if(button) open(button.dataset.questAction);
    if(event.target.closest('[data-qb-close]')) close();
  });
  dialog.addEventListener('cancel', () => { sequence++; current=null; });
  dialog.addEventListener('submit', async event => {
    if(event.target.id!=='questboard-create')return;
    event.preventDefault();
    const form=event.target, action=current, request=sequence;
    if(!action||!form.reportValidity()||form.querySelector('button').disabled)return;
    form.querySelector('button').disabled=true;
    try {
      const fd=new FormData(form), [kind,id]=fd.get('destination').split(':');
      // Persist a retry identity before the network request; reloads use the same task ID.
      if(!validId(action.r.questRequest))action.r.questRequest=createId();
      saveMeetings();
      const taskId=await window.meetingCloud.questCreate({p_request:action.r.questRequest,p_project:kind==='project'?id:null,p_department:kind==='department'?id:null,p_title:fd.get('title').trim(),p_description:`From Minutes: ${action.m.title}\nTopic: ${action.t.title}\nOwner noted in meeting: ${action.r.owner || 'Unassigned'}\n\n${action.r.text}`.slice(0,2500),p_due_date:action.r.due||null,p_assignee:null,p_xp_reward:Number(fd.get('xp'))});
      if(request!==sequence)return;
      action.r.questTask=taskId;saveMeetings();renderCurrentView();
      close();open(action.r.id);
    } catch(error) { if(request===sequence){ message(error.message || 'Task creation failed. Retry safely.');form.querySelector('button').disabled=false;} }
  });
})();
