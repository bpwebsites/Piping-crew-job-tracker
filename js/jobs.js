/* ═══════════════════════════════════════════════
   JOBS.JS
   Depends on: config.js (BRANCHES, LIMITS, HVE_ID)
               data-models.js (state vars, sanitize, validate*, daysFor,
                 hpwToDaily, normJob, lastName, loadBranch, saveBranch,
                 saveData, saveCalendarData)
               supabase.js (auditLog)
   Provides: people ops, job CRUD, vacation split/merge,
             vacation calendar actions, vacation hours tracking
   Globals called at runtime (defined in inline script):
     toast, render, renderVacCalendar, buildDays, getTDi,
     fromIso, dateToDi, fmtShort, addDays
   ═══════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════
   PEOPLE
   ═══════════════════════════════════════════════ */
function addPerson(){
  const name=validateName($('pN').value,'person name',LIMITS.PERSON_NAME);
  if(!name)return;
  const type=$('pType').value;
  const id=npid++;
  people.push({id,name,type,floatingHolidays:type==='direct'?3:0});queues[id]=[];vacations[id]=[];
  auditLog('person_added',{branch:activeBranch,name,type});
  $('pN').value='';refreshAll();
}
function removePerson(pid){
  if(pid===0){toast('HVE cannot be removed.','err');return}
  const p=people.find(x=>x.id===pid);
  showConfirm('Remove '+(p?'"'+p.name+'"':'this person')+'? All their jobs and vacations will be deleted.',()=>{
    auditLog('person_removed',{branch:activeBranch,name:p?.name,pid});
    people=people.filter(x=>x.id!==pid);delete queues[pid];delete vacations[pid];
    if(focusPid===pid)focusPid=null;refreshAll();
  });
}
function focusPerson(pid){focusPid=(focusPid===pid)?null:pid;refreshAll()}
function cycleFocus(){
  const crew=people.filter(p=>p.id!==0);if(!crew.length)return;
  if(focusPid===null||focusPid===0)focusPid=crew[0].id;
  else{const i=crew.findIndex(p=>p.id===focusPid);focusPid=i>=crew.length-1?null:crew[i+1].id}
  refreshAll();
}
function refreshAll(){updateSelects();updateVacSelect();renderPeopleList();render()}
function updateSelects(){
  const sel=$('jP'),prev=sel.value;
  sel.innerHTML='<option value="">-- select --</option>';
  people.forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;sel.appendChild(o)});
  sel.value=prev;
}
function renderPeopleList(){
  const el=$('peopleList'),crew=people.filter(p=>p.id!==0);
  if(!crew.length){el.innerHTML='<p style="font-size:12px;color:var(--text-muted)">No crew members yet.</p>';return}
  el.innerHTML='<table style="width:100%;border-collapse:collapse"><thead><tr style="background:var(--bg)">'
    +'<th style="padding:6px 10px;font-size:11px;font-weight:600;color:var(--text-muted);text-align:left;text-transform:uppercase;letter-spacing:.05em">Name</th>'
    +'<th style="padding:6px 10px;font-size:11px;color:var(--text-muted);text-align:left">Type</th>'
    +'<th style="padding:6px 10px;font-size:11px;color:var(--text-muted);text-align:left">Jobs</th>'
    +'<th style="padding:6px 10px;font-size:11px;color:var(--text-muted);text-align:left">Total hrs</th>'
    +'<th></th></tr></thead><tbody>'
    +crew.map(p=>{
      const c=getColor(p.id),q=queues[p.id]||[],isDirect=(p.type||'direct')==='direct';
      return'<tr style="border-bottom:.5px solid rgba(0,0,0,.07)">'
        +'<td style="padding:7px 10px"><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:'+c.bg+';border:1px solid '+c.bdr+';vertical-align:middle;margin-right:8px"></span><span style="font-size:13px;font-weight:600">'+sanitize(p.name)+'</span></td>'
        +'<td style="padding:7px 10px;font-size:12px"><span class="'+(isDirect?'badge-direct':'badge-contractor')+'">'+(isDirect?'Direct':'Contractor')+'</span></td>'
        +'<td style="padding:7px 10px;font-size:12px;color:var(--text-muted)">'+q.length+' job'+(q.length!==1?'s':'')+'</td>'
        +'<td style="padding:7px 10px;font-size:12px;color:var(--text-muted)">'+q.reduce((s,j)=>s+j.hours,0).toLocaleString()+' hrs</td>'
        +'<td style="padding:7px 10px;text-align:right"><button onclick="removePerson('+p.id+')" class="btn-warn">Remove</button></td></tr>';
    }).join('')+'</tbody></table>';
}

/* ═══════════════════════════════════════════════
   VACATION SPLITS
   ═══════════════════════════════════════════════ */
function deleteVacation(vid,pid){
  const vac=(vacations[pid]||[]).find(v=>v.id===vid);
  showConfirm('Delete vacation "'+(vac?vac.name:'this vacation')+'"?',()=>{
    vacations[pid]=(vacations[pid]||[]).filter(v=>v.id!==vid);
    auditLog('vacation_deleted',{branch:activeBranch,vacId:vid,pid,name:vac?.name});
    mergeAllSplits(pid);applySplits(pid);saveData();render();toast('Vacation removed. Jobs restored.','ok');
  });
}
function mergeAllSplits(pid){
  new Set((queues[pid]||[]).filter(j=>j.groupId).map(j=>j.groupId)).forEach(gid=>mergeSplitGroup(gid,pid));
}
function mergeSplitGroup(gid,pid){
  const pieces=(queues[pid]||[]).filter(j=>j.groupId===gid).sort((a,b)=>(a.di||0)-(b.di||0));
  if(!pieces.length)return;
  queues[pid]=(queues[pid]||[]).filter(j=>j.groupId!==gid);
  const p0=pieces[0];
  queues[pid].push({id:p0.id,name:p0.name,hours:p0._origHours||pieces.reduce((s,j)=>s+j.hours,0),hrsPerWeek:p0.hrsPerWeek,ifaDate:p0.ifaDate,di:p0.di||0,pid,pending:p0.pending});
  queues[pid].sort((a,b)=>(a.di||0)-(b.di||0));
}
function applySplits(pid){
  const vacs=vacations[pid]||[];
  // merge stale splits
  new Set((queues[pid]||[]).filter(j=>j.groupId).map(j=>j.groupId)).forEach(gid=>{
    const ps=(queues[pid]||[]).filter(j=>j.groupId===gid).sort((a,b)=>(a.di||0)-(b.di||0));
    if(!ps.length)return;
    const hpw=ps[0].hrsPerWeek,jS=ps[0].di||0,jE=(ps[ps.length-1].di||0)+daysFor(ps[ps.length-1].hours,hpw)-1;
    if(!vacs.some(v=>{const vS=dateToDi(fromIso(v.startIso)),vE=dateToDi(fromIso(v.endIso));return vS>=0&&vE>=0&&jS<=vE&&jE>=vS}))mergeSplitGroup(gid,pid);
  });
  // split unsplit jobs overlapping vacations
  vacs.forEach(v=>{
    const vS=dateToDi(fromIso(v.startIso)),vE=dateToDi(fromIso(v.endIso));
    if(vS<0||vE<0)return;
    let changed=true;
    while(changed){
      changed=false;
      for(const j of[...(queues[pid]||[])]){
        if(j.groupId)continue;
        const jdi=j.di||0,jEnd=jdi+daysFor(j.hours,j.hrsPerWeek)-1;
        if(jdi<=vE&&jEnd>=vS){
          const gid='job-'+j.id,origH=j.hours,hpw=j.hrsPerWeek,dailyH=hpwToDaily(hpw);
          queues[pid]=(queues[pid]||[]).filter(x=>x.id!==j.id);
          const bD=Math.max(0,vS-jdi),bH=bD>0?Math.round(bD*dailyH):0,aH=origH-bH;
          if(bD>0&&bH>0)queues[pid].push({id:j.id,name:j.name,hours:bH,hrsPerWeek:hpw,ifaDate:j.ifaDate,di:jdi,groupId:gid,_origHours:origH,pid,pending:j.pending});
          if(aH>0)queues[pid].push({id:nid++,name:j.name,hours:aH,hrsPerWeek:hpw,ifaDate:j.ifaDate,di:vE+1,groupId:gid,_origHours:origH,pid,pending:j.pending});
          queues[pid].sort((a,b)=>(a.di||0)-(b.di||0));
          changed=true;break;
        }
      }
    }
  });
}

/* ═══════════════════════════════════════════════
   JOBS
   ═══════════════════════════════════════════════ */
function addJob(){
  const name=validateName($('jN').value,'job name',LIMITS.JOB_NAME);
  if(!name)return;
  const hrs=validateHours($('jH').value,'Man hours');
  if(hrs===null)return;
  const hpw=validateHpw($('jHpw').value);
  if(hpw===null)return;
  const ifa=validateDate($('jIfa').value||'');
  if(ifa===null)return;
  if($('jP').value===''){toast('Select a crew member.','err');return}
  const pid=Number($('jP').value),pending=$('jPending').checked;
  days=buildDays();todayDi=getTDi(days);
  let sw=minDi();const q=queues[pid]||[];
  if(q.length){const last=q[q.length-1];sw=Math.max(sw,(last.di||0)+daysFor(last.hours,last.hrsPerWeek))}
  if(!queues[pid])queues[pid]=[];
  queues[pid].push({id:nid++,name,hours:hrs,hrsPerWeek:hpw,ifaDate:ifa,di:sw,pid,pending});
  queues[pid].sort((a,b)=>(a.di||0)-(b.di||0));
  applySplits(pid);
  ['jN','jH','jIfa'].forEach(id=>$(id).value='');$('jPending').checked=false;
  auditLog('job_added',{branch:activeBranch,name,hours:hrs,hrsPerWeek:hpw,pid});
  saveData();render();
}
function deleteJobGroup(jid,pid){
  const job=(queues[pid]||[]).find(j=>j.id===jid);
  showConfirm('Delete job "'+(job?job.name:'this job')+'"?',()=>{
    if(job?.groupId)queues[pid]=(queues[pid]||[]).filter(j=>j.groupId!==job.groupId);
    else queues[pid]=(queues[pid]||[]).filter(j=>j.id!==jid);
    auditLog('job_deleted',{branch:activeBranch,name:job?.name,pid});
    saveData();render();
  });
}

/* Edit modal */
function openEdit(jid,pid){
  const job=(queues[pid]||[]).find(j=>j.id===jid);if(!job)return;
  editTarget={jid,pid,groupId:job.groupId||null,origName:job.name};
  let name=job.name,hrs=job.hours,hpw=job.hrsPerWeek,ifa=job.ifaDate||'',pending=!!job.pending;
  if(job.groupId){
    const ps=(queues[pid]||[]).filter(j=>j.groupId===job.groupId).sort((a,b)=>(a.di||0)-(b.di||0));
    name=ps[0].name;hrs=ps[0]._origHours||ps.reduce((s,j)=>s+j.hours,0);hpw=ps[0].hrsPerWeek;ifa=ps[0].ifaDate||'';pending=!!ps[0].pending;
    editTarget.origName=name;
  }
  $('eN').value=name;$('eH').value=hrs;$('eHpw').value=Number(hpw)||40;$('eIfa').value=ifa;$('eShiftNote').textContent='';
  editTarget._pending=pending;setEditStatus(pending);$('editModal').classList.remove('hidden');
}
function setEditStatus(isPending){
  editTarget._pending=isPending;
  const cBtn=$('eStatusConfirmed'),pBtn=$('eStatusPending');
  if(!isPending){
    cBtn.style.cssText='flex:1;padding:8px;border-radius:var(--r);font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);background:#dcfce7;border:2px solid #86efac;color:#15803d';
    pBtn.style.cssText='flex:1;padding:8px;border-radius:var(--r);font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);background:var(--bg);border:2px solid var(--border);color:var(--text-muted)';
  } else {
    pBtn.style.cssText='flex:1;padding:8px;border-radius:var(--r);font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);background:#f3f4f6;border:2px solid #9ca3af;color:#6b7280';
    cBtn.style.cssText='flex:1;padding:8px;border-radius:var(--r);font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);background:var(--bg);border:2px solid var(--border);color:var(--text-muted)';
  }
}
function saveEdit(){
  if(!editTarget)return;
  const{jid,pid,groupId}=editTarget;
  const newName=validateName($('eN').value,'job name',LIMITS.JOB_NAME);
  if(!newName)return;
  const newHrs=validateHours($('eH').value,'Man hours');
  if(newHrs===null)return;
  const newHpw=validateHpw($('eHpw').value);
  if(newHpw===null)return;
  const newIfa=validateDate($('eIfa').value||'');
  if(newIfa===null)return;
  const newPending=!!editTarget._pending;
  if(groupId){(queues[pid]||[]).filter(j=>j.groupId===groupId).forEach(j=>{j.pending=newPending});mergeSplitGroup(groupId,pid)}
  const q=queues[pid]||[];
  let idx=q.findIndex(j=>j.id===jid);
  if(idx<0)idx=q.findIndex(j=>j.name===editTarget.origName);
  if(idx<0&&q.length)idx=0;
  if(idx>=0){const j=q[idx];j.name=newName;j.hours=newHrs;j.hrsPerWeek=newHpw;j.ifaDate=newIfa;j.pending=newPending}
  if(groupId)applySplits(pid);
  closeModal('editModal');editTarget=null;
  auditLog('job_edited',{branch:activeBranch,jid,pid,newName,newHrs,newHpw});
  saveData();render();toast('Job updated.','ok');
}

/* Confirm modal */
function showConfirm(msg,cb){_confirmCallback=cb;$('confirmMsg').textContent=msg;$('confirmModal').classList.remove('hidden')}
function confirmYes(){closeModal('confirmModal');if(_confirmCallback){_confirmCallback();_confirmCallback=null}}
function closeModal(id){$(id).classList.add('hidden')}

/* ═══════════════════════════════════════════════
   VACATION CALENDAR
   ═══════════════════════════════════════════════ */
function setVacViewYear(y){vacViewYear=y;const o=$('vacGanttOuter');if(o)o._scrolled=false;renderVacCalendar()}

/* Populate person selects for vacation & overtime */
function collectPeopleOpts(){
  const opts=[];
  BRANCHES.forEach(br=>{
    const bd=branchData[br.id],lbl={piping:'Piping',civil:'Civil',ie:'I&E'}[br.id];
    bd.people.filter(p=>p.id!==0).forEach(p=>opts.push({val:br.id+':'+p.id,label:p.name+' ('+lbl+')',name:p.name}));
  });
  calendarPeople.forEach(p=>opts.push({val:'cal:'+p.id,label:p.name,name:p.name}));
  return opts.sort((a,b)=>lastName(a.name).localeCompare(lastName(b.name)));
}
function populateSelect(sel,opts){
  const prev=sel.value;
  sel.innerHTML='<option value="">-- select --</option>';
  opts.forEach(op=>{const o=document.createElement('option');o.value=op.val;o.textContent=op.label;sel.appendChild(o)});
  sel.value=prev;
}
function updateVacSelect(){const sel=$('vacCalP');if(sel)populateSelect(sel,collectPeopleOpts())}
function updateOtSelect(){const sel=$('otCalP');if(sel)populateSelect(sel,collectPeopleOpts())}

function addCalendarPerson(){
  const name=validateName($('vacCalNewName').value,'person name',LIMITS.PERSON_NAME);
  if(!name)return;
  const type=$('calPType').value;
  calendarPeople.push({id:calNpid++,name,type,floatingHolidays:type==='direct'?3:0});
  calendarVacations[calendarPeople[calendarPeople.length-1].id]=[];
  $('vacCalNewName').value='';saveCalendarData();updateVacSelect();renderCalendarPeopleList();renderVacCalendar();
}
function removeCalendarPerson(pid){
  const p=calendarPeople.find(x=>x.id===pid);
  showConfirm('Remove '+(p?'"'+p.name+'"':'this person')+'? Their vacations will be deleted.',()=>{
    calendarPeople=calendarPeople.filter(x=>x.id!==pid);delete calendarVacations[pid];
    saveCalendarData();updateVacSelect();renderCalendarPeopleList();renderVacCalendar();
  });
}
function renderCalendarPeopleList(){
  const el=$('calendarPeopleList');if(!el)return;
  if(!calendarPeople.length){el.innerHTML='<p style="font-size:12px;color:var(--text-muted)">No extra people added yet. Branch crew members are included automatically.</p>';return}
  el.innerHTML=calendarPeople.map(p=>{
    const vCount=(calendarVacations[p.id]||[]).length;
    return'<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:.5px solid var(--border)">'
      +'<div><span style="font-size:13px;font-weight:600">'+sanitize(p.name)+'</span>'
      +'<span style="font-size:11px;color:var(--text-muted);margin-left:8px">'+vCount+' vacation'+(vCount!==1?'s':'')+'</span></div>'
      +'<button onclick="removeCalendarPerson('+p.id+')" class="btn-warn">Remove</button></div>';
  }).join('');
}

function addOvertime(){
  const raw=$('otCalP').value,d=$('otCalD').value;
  if(!raw){toast('Select a person.','err');return}
  if(!d){toast('Select a date.','err');return}
  if(!overtimeData[raw])overtimeData[raw]=[];
  if(overtimeData[raw].includes(d)){toast('Overtime already logged for this date.','err');return}
  overtimeData[raw].push(d);overtimeData[raw].sort();
  auditLog('overtime_added',{key:raw,date:d});
  $('otCalD').value='';saveCalendarData();renderVacCalendar();toast('Overtime added.','ok');
}
function deleteOvertime(key,dateStr){
  if(!overtimeData[key])return;
  showConfirm('Remove overtime for '+dateStr+'?',()=>{
    auditLog('overtime_deleted',{key,date:dateStr});
    overtimeData[key]=overtimeData[key].filter(d=>d!==dateStr);saveCalendarData();renderVacCalendar();toast('Overtime removed.','ok');
  });
}

function syncFloatingDate(){
  const isFloating=$('vacCalType').value==='floating',endEl=$('vacCalE');
  if(isFloating){const s=$('vacCalS').value;if(s)endEl.value=s;endEl.disabled=true;endEl.style.opacity='.5'}
  else{endEl.disabled=false;endEl.style.opacity='1'}
}

/* Resolve person type/floating info from source:pid */
function resolvePersonInfo(source,pid){
  if(source==='cal'){
    const cp=calendarPeople.find(x=>x.id===pid);
    if(!cp)return null;
    const isDirect=(cp.type||'direct')==='direct';
    return{isDirect,maxFh:cp.floatingHolidays||(isDirect?3:0),usedFh:(calendarVacations[pid]||[]).filter(v=>v.isFloatingHoliday).length,name:cp.name,type:cp.type||'direct'};
  }
  const bd=branchData[source];if(!bd)return null;
  const p=bd.people.find(x=>x.id===pid);if(!p)return null;
  const isDirect=(p.type||'direct')==='direct';
  return{isDirect,maxFh:p.floatingHolidays||(isDirect?3:0),usedFh:(bd.vacations[pid]||[]).filter(v=>v.isFloatingHoliday).length,name:p.name,type:p.type||'direct'};
}

function updateVacTypeVisibility(){
  const raw=$('vacCalP').value,wrap=$('vacTypeWrap');if(!wrap)return;
  if(!raw){wrap.style.display='none';return}
  const[source,idStr]=raw.split(':');
  const info=resolvePersonInfo(source,Number(idStr));
  if(!info||!info.isDirect){wrap.style.display='none';$('vacCalType').value='vacation';syncFloatingDate();return}
  wrap.style.display='';
  const remaining=info.maxFh-info.usedFh,sel=$('vacCalType');
  sel.options[1].textContent='Floating Holiday ('+remaining+' left)';
  if(remaining<=0){sel.options[1].disabled=true;sel.value='vacation'}else sel.options[1].disabled=false;
  syncFloatingDate();
}

function setVacHpdAllDay(){
  const btn=$('vacHpdAllDay'),inp=$('vacHpdCustom');
  if(!btn||!inp)return;
  btn.setAttribute('data-hpd-active','1');
  btn.style.background='var(--blue)';btn.style.color='#fff';btn.style.border='none';
  inp.value='';inp.style.opacity='.4';
}
function vacHpdCustomFocus(){
  const btn=$('vacHpdAllDay'),inp=$('vacHpdCustom');
  if(!btn||!inp)return;
  btn.removeAttribute('data-hpd-active');
  btn.style.background='transparent';btn.style.color='var(--blue)';btn.style.border='1.5px solid var(--blue)';
  inp.style.opacity='1';
}
function vacHpdCustomInput(){
  if($('vacHpdCustom')&&$('vacHpdCustom').value)vacHpdCustomFocus();
}
function getVacHpd(){
  const btn=$('vacHpdAllDay');
  if(!btn||btn.getAttribute('data-hpd-active'))return null;
  const v=parseFloat($('vacHpdCustom').value);
  return(v&&v>0)?Math.min(10,Math.max(0.5,v)):null;
}
function addVacFromCalendar(){
  const raw=$('vacCalP').value;
  const rawName=$('vacCalN').value.trim()||'Vacation';
  if(rawName.length>LIMITS.VAC_NAME){toast('Vacation name must be '+LIMITS.VAC_NAME+' characters or fewer.','err');return}
  const name=rawName;
  const s=$('vacCalS').value,e=$('vacCalE').value,vacType=$('vacCalType').value;
  if(!raw){toast('Select a person.','err');return}
  if(!s||!e){toast('Select start and end dates.','err');return}
  if(validateDate(s)===null||validateDate(e)===null)return;
  if(s>e){toast('End must be after start.','err');return}
  const[source,idStr]=raw.split(':'),pid=Number(idStr),isFloating=vacType==='floating';
  if(isFloating){
    $('vacCalE').value=s;
    const info=resolvePersonInfo(source,pid);
    if(info&&info.maxFh-info.usedFh<=0){toast(info.name+' has used all '+info.maxFh+' floating holidays.','err');return}
  }
  const vacName=isFloating?(name==='Vacation'?'Floating Holiday':name):name;
  const hpd=getVacHpd();
  const vacObj=(id,pid)=>({id,pid,name:vacName,startIso:s,endIso:isFloating?s:e,isFloatingHoliday:isFloating,...(hpd!=null?{hoursPerDay:hpd}:{})});
  if(source==='cal'){
    if(!calendarVacations[pid])calendarVacations[pid]=[];
    calendarVacations[pid].push(vacObj(calNid++,pid));
    saveCalendarData();
  } else {
    const bd=branchData[source];if(!bd){toast('Invalid branch.','err');return}
    if(!bd.vacations[pid])bd.vacations[pid]=[];
    bd.vacations[pid].push(vacObj(bd.nid++,pid));
    days=buildDays();todayDi=getTDi(days);
    const curIsReal=!!branchData[activeBranch];
    if(curIsReal)saveBranch(activeBranch);
    loadBranch(source);applySplits(pid);saveBranch(source);
    if(curIsReal)loadBranch(activeBranch);saveData();
  }
  ['vacCalN','vacCalS','vacCalE'].forEach(id=>{const el=$(id);el.value='';el.disabled=false;el.style.opacity='1'});
  $('vacCalType').value='vacation';syncFloatingDate();setVacHpdAllDay();
  auditLog('vacation_added',{source,pid,name:vacName,startIso:s,endIso:e,isFloating});
  renderVacCalendar();
  toast(isFloating?'Floating holiday added.':'Vacation added.','ok');
}
function deleteVacFromCalendar(source,pid,vid){
  let vacName='this vacation';
  if(source==='cal'){const v=(calendarVacations[pid]||[]).find(v=>v.id===vid);if(v)vacName=v.name}
  else{const bd=branchData[source];if(bd){const v=(bd.vacations[pid]||[]).find(v=>v.id===vid);if(v)vacName=v.name}}
  showConfirm('Delete vacation "'+vacName+'"?',()=>{
    if(source==='cal'){calendarVacations[pid]=(calendarVacations[pid]||[]).filter(v=>v.id!==vid);saveCalendarData()}
    else{
      const bd=branchData[source];if(!bd)return;
      bd.vacations[pid]=(bd.vacations[pid]||[]).filter(v=>v.id!==vid);
      saveBranch(activeBranch);loadBranch(source);mergeAllSplits(pid);applySplits(pid);saveBranch(source);loadBranch(activeBranch);saveData();
    }
    auditLog('vacation_deleted',{source,pid,vacId:vid,name:vacName});
    renderVacCalendar();toast('Vacation removed.','ok');
  });
}

/* ═══════════════════════════════════════════════
   VACATION HOURS TRACKER
   ═══════════════════════════════════════════════ */
function getVacHoursUsed(vacs){
  let total=0;
  (vacs||[]).forEach(v=>{
    const hpd=v.hoursPerDay!=null?v.hoursPerDay:10;
    let d=fromIso(v.startIso);const end=fromIso(v.endIso);
    while(d<=end){if(d.getDay()>=1&&d.getDay()<=4)total+=hpd;d=addDays(d,1)}
  });
  return total;
}
function setVacAllowance(key,val){vacHoursAllowance[key]=Math.max(0,Number(val)||0);saveCalendarData();const fk=key;renderVacCalendar();
  document.querySelectorAll('#vacHoursTracker input[type="number"]').forEach(inp=>{if(inp.getAttribute('onchange')&&inp.getAttribute('onchange').indexOf(fk)>=0)inp.focus()});
}
function setFloatingHolidays(source,pid,val){
  const num=Math.max(0,Number(val)||0);
  if(source==='cal'){const p=calendarPeople.find(x=>x.id===pid);if(p)p.floatingHolidays=num;saveCalendarData()}
  else{const bd=branchData[source];if(bd){const p=bd.people.find(x=>x.id===pid);if(p)p.floatingHolidays=num}saveData()}
  renderVacHoursTracker();
}
function renderVacHoursTracker(){
  const el=$('vacHoursTracker');if(!el)return;
  const isLead=currentRole==='lead',rows=[];
  BRANCHES.forEach(br=>{const bd=branchData[br.id];
    bd.people.filter(p=>p.id!==0).forEach(p=>{
      const key=br.id+':'+p.id,vacs=bd.vacations[p.id]||[],type=p.type||'direct',isDirect=type==='direct';
      rows.push({key,name:p.name,used:getVacHoursUsed(vacs),allowance:vacHoursAllowance[key]||0,type,fh:p.floatingHolidays||(isDirect?3:0),fhUsed:vacs.filter(v=>v.isFloatingHoliday).length,source:br.id,pid:p.id});
    })});
  calendarPeople.forEach(p=>{
    const key='cal:'+p.id,vacs=calendarVacations[p.id]||[],type=p.type||'direct',isDirect=type==='direct';
    rows.push({key,name:p.name,used:getVacHoursUsed(vacs),allowance:vacHoursAllowance[key]||0,type,fh:p.floatingHolidays||(isDirect?3:0),fhUsed:vacs.filter(v=>v.isFloatingHoliday).length,source:'cal',pid:p.id});
  });
  rows.sort((a,b)=>lastName(a.name).localeCompare(lastName(b.name)));
  if(!rows.length){el.innerHTML='<p style="font-size:12px;color:var(--text-muted)">No crew members yet.</p>';return}
  const direct=rows.filter(r=>r.type==='direct'),contract=rows.filter(r=>r.type!=='direct');
  function renderRow(r){
    const remaining=r.allowance-r.used,overBudget=r.allowance>0&&remaining<0;
    const pct=r.allowance>0?Math.min(100,Math.round((r.used/r.allowance)*100)):0;
    const barColor=overBudget?'#ef4444':pct>80?'#f59e0b':'#22c55e';
    const esc=r.key.replace(/'/g,"\\'"),isDirect=r.type==='direct';
    return'<tr style="border-bottom:.5px solid var(--border)">'
      +'<td style="padding:7px 10px"><span style="font-size:13px;font-weight:600">'+sanitize(r.name)+'</span></td>'
      +'<td style="padding:7px 10px;text-align:center">'+(isLead?'<input type="number" min="0" value="'+r.allowance+'" onchange="setVacAllowance(\''+esc+'\',this.value)" class="input-sm"/>':'<span class="mono" style="font-size:12px">'+r.allowance+'h</span>')+'</td>'
      +'<td style="padding:7px 10px;text-align:center" class="mono" style="font-size:12px;font-weight:600">'+r.used+'h</td>'
      +'<td style="padding:7px 10px;text-align:center">'+(r.allowance>0?'<div style="display:flex;align-items:center;gap:6px;justify-content:center"><div style="flex:1;max-width:60px;height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden"><div style="width:'+Math.min(100,pct)+'%;height:100%;background:'+barColor+';border-radius:3px"></div></div><span class="mono" style="font-size:12px;font-weight:700;color:'+(overBudget?'#ef4444':'var(--text)')+'">'+remaining+'h</span></div>':'<span style="font-size:11px;color:var(--text-hint)">—</span>')+'</td>'
      +'<td style="padding:7px 10px;text-align:center">'+(isDirect?(isLead?'<div style="display:flex;align-items:center;gap:4px;justify-content:center"><span class="mono" style="font-size:12px;font-weight:600;color:'+(r.fhUsed>=r.fh?'#ef4444':'var(--text)')+'">'+r.fhUsed+'/</span><input type="number" min="0" value="'+r.fh+'" onchange="setFloatingHolidays(\''+r.source+'\','+r.pid+',this.value)" class="input-sm" style="width:40px"/></div>':'<span class="mono" style="font-size:12px;font-weight:600;color:'+(r.fhUsed>=r.fh?'#ef4444':'var(--text)')+'">'+r.fhUsed+'/'+r.fh+'</span>'):'<span style="font-size:11px;color:var(--text-hint)">—</span>')+'</td></tr>';
  }
  let h='<table style="width:100%;border-collapse:collapse"><thead><tr style="background:var(--bg)">'
    +'<th style="padding:6px 10px;font-size:11px;font-weight:600;color:var(--text-muted);text-align:left;text-transform:uppercase;letter-spacing:.05em">Name</th>'
    +'<th style="padding:6px 10px;font-size:11px;color:var(--text-muted);text-align:center">Total Hours</th>'
    +'<th style="padding:6px 10px;font-size:11px;color:var(--text-muted);text-align:center">Used</th>'
    +'<th style="padding:6px 10px;font-size:11px;color:var(--text-muted);text-align:center">Remaining</th>'
    +'<th style="padding:6px 10px;font-size:11px;color:var(--text-muted);text-align:center">Floating Holidays</th></tr></thead><tbody>';
  if(direct.length){h+='<tr><td colspan="5" class="tbl-section" style="color:#1d4ed8;background:#dbeafe">Direct</td></tr>';direct.forEach(r=>h+=renderRow(r))}
  if(contract.length){h+='<tr><td colspan="5" class="tbl-section" style="color:#a16207;background:#fef9c3">Contractor</td></tr>';contract.forEach(r=>h+=renderRow(r))}
  el.innerHTML=h+'</tbody></table>';
}
