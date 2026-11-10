const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setTimeout(r,0));
function app(){
 const dom=new JSDOM(fs.readFileSync(__dirname+'/../index.html','utf8'),{url:'https://minutes.dudgeon.io',runScripts:'outside-only'}),w=dom.window;
 w.structuredClone=structuredClone;w.confirm=()=>true;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 for(const name of ['meeting-desk','workspace','calendar','questboard'])vm.runInContext(fs.readFileSync(__dirname+'/../assets/js/'+name+'.js','utf8'),dom.getInternalVMContext());
 const data=w.meetingDesk.snapshot();data.meetings[0].items[0].records=[{id:'action-1',type:'Action',text:'Check UPS',owner:'Eve',due:'2026-11-20',done:false}];w.meetingDesk.replace(data);
 w.document.querySelector('[data-tab="actions"]').click();return w;
}
test('Minutes links explicitly, keeps retry identity, shows real XP and does not complete the action',async()=>{
 const w=app();try{
 let calls=[],fail=true;
 w.meetingCloud={active:true,save(){},questDestinations:async()=>[{kind:'department',id:'dept',label:'No project · IT'}],questCreate:async args=>{calls.push(args);if(fail)throw Error('Network unavailable');return args.p_request;},questStatus:async id=>({id,org_id:'org',title:'Check UPS',status:'in_review',xp_reward:15,awarded:0})};
 w.document.querySelector('[data-quest-action]').click();await tick();
 const form=w.document.getElementById('questboard-create');assert(form);form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
 assert.match(w.document.querySelector('#questboard-dialog [role="status"]').textContent,/Network/);
 fail=false;form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();await tick();
 assert.equal(calls.length,2);assert.equal(calls[0].p_request,calls[1].p_request);assert.equal(calls[0].p_department,'dept');assert.equal(calls[0].p_assignee,null);assert.match(calls[0].p_description,/Eve/);
 const record=w.meetingDesk.snapshot().meetings[0].items[0].records[0];assert.equal(record.questTask,calls[0].p_request);assert.equal(record.done,false);
 assert.match(w.document.getElementById('questboard-content').textContent,/0 XP awarded/);
 const snapshot=w.meetingDesk.snapshot();w.meetingDesk.replace(snapshot);assert.equal(w.meetingDesk.snapshot().meetings[0].items[0].records[0].questTask,record.questTask);
 w.eval('globalThis.imported=validateBackup(window.meetingDesk.snapshot())');assert.equal(w.imported[0].items[0].records[0].questTask,undefined);
 }finally{w.close();}
});
test('Guest linking is rejected and account replacement discards late task details',async()=>{
 const w=app();try{
 w.document.querySelector('[data-quest-action]').click();assert.match(w.document.getElementById('notice').textContent,/Sign in/);
 let resolve;w.meetingCloud={active:true,save(){},questDestinations:()=>new Promise(r=>resolve=r)};
 w.document.querySelector('[data-quest-action]').click();const snapshot=w.meetingDesk.snapshot();w.meetingDesk.replace(snapshot);resolve([{kind:'department',id:'old',label:'Old account'}]);await tick();
 assert.equal(w.document.getElementById('questboard-dialog').open,false);assert(!w.document.querySelector('#questboard-create'));
 }finally{w.close();}
});
