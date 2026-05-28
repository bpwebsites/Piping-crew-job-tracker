/* ═══════════════════════════════════════════════
   APP.JS
   Depends on: config.js, supabase.js, auth.js, data-models.js, jobs.js, gantt.js
   Provides: setBranch, toast, auto-save wrapper, seed data, init
   ═══════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════
   BRANCH SWITCHING — UI routing
   Data layer (loadBranch, saveBranch) is in data-models.js
   ═══════════════════════════════════════════════ */
function setBranch(bid){
  if(bid==='admin'&&!isAdminMode){openAdminModal();return}
  const isBranch=!!branchData[bid];
  if(isBranch)saveBranch(activeBranch);
  activeBranch=bid;
  if(isBranch)loadBranch(bid);
  focusPid=null;viewYear=new Date().getFullYear();
  // Dynamic idMap — static tabs + all current branches
  const idMap={master:'btMaster',timeoff:'btTimeOff',admin:'btAdmin'};
  BRANCHES.forEach(b=>{idMap[b.id]='bt_'+b.id});
  Object.keys(idMap).forEach(k=>{const el=$(idMap[k]);if(!el)return;el.className='branch-tab'+(k==='admin'?' admin-tab':'')+(k===bid?' active':'')});
  $('branchView').classList.toggle('hidden',!isBranch);
  $('masterView').classList.toggle('hidden',bid!=='master');
  $('timeOffView').classList.toggle('hidden',bid!=='timeoff');
  const adminV=$('adminView');if(adminV)adminV.classList.toggle('hidden',bid!=='admin');
  const outer=document.querySelector('.gantt-outer');if(outer)outer._scrolled=false;
  if(bid==='master'){renderMaster();renderMasterTimeline()}
  else if(bid==='timeoff')renderVacCalendar();
  else if(bid==='admin')renderAdmin();
  else refreshAll();
}

function initBranchTabs(){
  document.querySelectorAll('.branch-specific').forEach(el=>el.remove());
  const masterBtn=$('btMaster');if(!masterBtn)return;
  let ref=masterBtn;
  BRANCHES.forEach(b=>{
    const btn=document.createElement('button');
    btn.className='branch-tab branch-specific'+(activeBranch===b.id?' active':'');
    btn.id='bt_'+b.id;
    btn.setAttribute('data-tooltip',b.label);
    btn.textContent=b.label.substring(0,2).toUpperCase();
    btn.onclick=()=>setBranch(b.id);
    ref.insertAdjacentElement('afterend',btn);
    ref=btn;
  });
}

/* ═══════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════ */
function toast(msg,type){const t=$('toast');t.textContent=msg;t.className=type||'ok';t.style.display='block';clearTimeout(t._t);t._t=setTimeout(()=>t.style.display='none',2800)}

/* auto-save wrapper */
const _rA=refreshAll,_rnd=render;
refreshAll=function(){_rA();saveData()};render=function(){_rnd();saveData()};

/* ═══════════════════════════════════════════════
   COMPANY SETTINGS — apply to DOM
   Called after loadCompanySettings() and after any admin save.
   ═══════════════════════════════════════════════ */
function applyCompanySettings(){
  const s=companySettings;
  // Rebuild branch colors and dynamic tab buttons
  rebuildBranchColors();
  initBranchTabs();
  // Ensure activeBranch is still valid after branch changes
  if(!BRANCHES.find(b=>b.id===activeBranch)&&BRANCHES.length){
    activeBranch=BRANCHES[0].id;
    loadBranch(activeBranch);
  }
  // People type dropdown options
  ['pType','calPType'].forEach(selId=>{
    const sel=$(selId);if(!sel)return;
    Array.from(sel.options).forEach(o=>{
      if(o.value==='direct')o.textContent=s.typeLabels.direct||'Direct';
      else if(o.value==='contractor')o.textContent=s.typeLabels.contractor||'Contractor';
    });
  });
  // HVE stat card
  const hveCard=$('statHVE');
  if(hveCard)hveCard.style.display=s.hveEnabled?'':'none';
  const hveLbl=$('statHVElbl');
  if(hveLbl)hveLbl.textContent=(s.hveLabel||'HVE')+' Man Hours';
  const statsGrid=document.querySelector('.stats');
  if(statsGrid)statsGrid.style.gridTemplateColumns=s.hveEnabled?'1fr 1fr 1fr':'1fr 1fr';
  // Company name — browser tab + sidebar
  const name=s.companyName||'';
  document.title=name?name+' — CrewTimeline':'CrewTimeline';
  const sbName=$('sbCompanyName');
  if(sbName){sbName.textContent=name;sbName.style.display=name?'':'none'}
}

/* ═══════════════════════════════════════════════
   ADMIN PANEL — render & save functions
   ═══════════════════════════════════════════════ */
function renderAdmin(){
  const s=companySettings;
  const banner=$('adminFirstSetupBanner');
  if(banner)banner.style.display=_adminCodeMissing?'':'none';
  // Branch table with color picker + delete
  $('adminBranchSection').innerHTML=`
    <table class="admin-tbl">
      <colgroup><col style="width:70px"><col><col style="width:120px"><col style="width:140px"></colgroup>
      <thead><tr><th>ID</th><th>Display name</th><th>Color</th><th></th></tr></thead>
      <tbody>${BRANCHES.map(b=>{const bc=getBranchColor(b.id);return`
        <tr>
          <td><span class="admin-branch-pill" style="background:${bc.bg};color:${bc.txt};border:1px solid ${bc.bdr}">${b.id.toUpperCase()}</span></td>
          <td><input class="admin-inp" id="adminBL_${b.id}" value="${sanitize(b.label)}" maxlength="30" onkeydown="if(event.key==='Enter')adminSaveBranch('${b.id}')"/></td>
          <td><select class="form-sel" id="adminBC_${b.id}">${Object.keys(BRANCH_COLOR_PALETTE).map(c=>`<option value="${c}"${b.color===c?' selected':''}>${c.charAt(0).toUpperCase()+c.slice(1)}</option>`).join('')}</select></td>
          <td style="display:flex;gap:6px;align-items:center">
            <button class="btn-ghost admin-save-btn" onclick="adminSaveBranch('${b.id}')">Save</button>
            ${BRANCHES.length>1?`<button class="btn-warn" onclick="adminDeleteBranch('${b.id}')">Delete</button>`:''}
          </td>
        </tr>`}).join('')}
      </tbody>
    </table>
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
      <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.04em">Add branch</div>
      <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
        <div class="fg" style="flex:1;min-width:120px"><label>Name</label><input class="admin-inp" id="adminNewBranchName" placeholder="e.g. Electrical" maxlength="30" onkeydown="if(event.key==='Enter')adminAddBranch()"/></div>
        <div class="fg"><label>Color</label><select class="form-sel" id="adminNewBranchColor">${Object.keys(BRANCH_COLOR_PALETTE).map(c=>`<option value="${c}">${c.charAt(0).toUpperCase()+c.slice(1)}</option>`).join('')}</select></div>
        <button class="btn" style="margin-bottom:0" onclick="adminAddBranch()">+ Add</button>
      </div>
    </div>`;
  // Company name
  const cn=$('adminCompanyName');if(cn)cn.value=s.companyName||'';
  // People types
  $('adminTypeDirect').value=s.typeLabels.direct||'Direct';
  $('adminTypeContractor').value=s.typeLabels.contractor||'Contractor';
  // Calendar
  $('adminWorkWeek').value=s.workWeek;
  const floatEn=$('adminFloatEnabled');if(floatEn)floatEn.value=s.floatingHolidaysEnabled?'yes':'no';
  const floatLbl=$('adminFloatLabel');if(floatLbl)floatLbl.value=s.floatingHolidaysLabel||'Floating Holiday';
  $('adminFloatingCount').value=s.floatingHolidays;
  const dvh=$('adminDefaultVacHours');if(dvh)dvh.value=s.defaultVacHours||80;
  const floatExtra=$('adminFloatExtra');if(floatExtra)floatExtra.style.display=s.floatingHolidaysEnabled?'':'none';
  // HVE
  $('adminHveEnabled').value=s.hveEnabled?'yes':'no';
  $('adminHveLabel').value=s.hveLabel||'HVE';
  $('adminHveGroupLabel').textContent=s.hveLabel||'HVE';
}

async function adminSaveBranch(bid){
  const inp=$('adminBL_'+bid);const sel=$('adminBC_'+bid);
  if(!inp)return;
  const lbl=inp.value.trim();const color=sel?sel.value:'blue';
  if(!lbl){toast('Branch name cannot be empty.','err');return}
  const b=BRANCHES.find(br=>br.id===bid);if(!b)return;
  b.label=lbl;b.color=color;
  const ok=await saveCompanySetting('branches_config',BRANCHES);
  if(ok){toast('Branch "'+lbl+'" saved.','ok');applyCompanySettings();renderAdmin()}
  else toast('Save failed — check connection.','err');
}

async function adminAddBranch(){
  const nameInp=$('adminNewBranchName');const colorSel=$('adminNewBranchColor');
  if(!nameInp)return;
  const name=nameInp.value.trim();
  if(!name){toast('Enter a branch name.','err');return}
  const id=name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').substring(0,20)||'branch'+Date.now();
  if(BRANCHES.find(b=>b.id===id)){toast('A branch with that ID already exists.','err');return}
  const color=colorSel?colorSel.value:'blue';
  BRANCHES.push({id,label:name,color});
  if(!branchData[id])branchData[id]={people:[],queues:{},vacations:{},nid:1,npid:1};
  const ok=await saveCompanySetting('branches_config',BRANCHES);
  if(ok){toast('Branch "'+name+'" added.','ok');nameInp.value='';applyCompanySettings();renderAdmin()}
  else{BRANCHES.pop();toast('Save failed — check connection.','err')}
}

async function adminDeleteBranch(bid){
  if(BRANCHES.length<=1){toast('Cannot delete the last branch.','err');return}
  const b=BRANCHES.find(br=>br.id===bid);if(!b)return;
  if(!confirm('Delete branch "'+b.label+'"? All its jobs and crew will be lost permanently.'))return;
  const idx=BRANCHES.findIndex(br=>br.id===bid);
  BRANCHES.splice(idx,1);
  const ok=await saveCompanySetting('branches_config',BRANCHES);
  if(ok){
    if(activeBranch===bid){activeBranch=BRANCHES[0].id;loadBranch(activeBranch)}
    toast('Branch "'+b.label+'" deleted.','ok');applyCompanySettings();renderAdmin();
  }else{BRANCHES.splice(idx,0,b);toast('Save failed — check connection.','err')}
}

async function adminSaveCompany(){
  const name=($('adminCompanyName').value||'').trim();
  companySettings.companyName=name;
  const ok=await saveCompanySetting('company_name',name);
  if(ok){toast('Company name saved.','ok');applyCompanySettings()}
  else toast('Save failed.','err');
}

async function adminSaveTypes(){
  const d=$('adminTypeDirect').value.trim();
  const c=$('adminTypeContractor').value.trim();
  if(!d||!c){toast('Type labels cannot be empty.','err');return}
  companySettings.typeLabels={direct:d,contractor:c};
  const ok=await saveCompanySetting('type_labels',companySettings.typeLabels);
  if(ok){toast('People type labels saved.','ok');applyCompanySettings()}
  else toast('Save failed.','err');
}

async function adminSaveCalendar(){
  const ww=$('adminWorkWeek').value;
  const floatEn=$('adminFloatEnabled');
  const floatLbl=$('adminFloatLabel');
  const floatEnabled=floatEn?floatEn.value==='yes':true;
  const floatLabel=(floatLbl?floatLbl.value.trim():'')||'Floating Holiday';
  const fh=Number($('adminFloatingCount').value);
  if(isNaN(fh)||fh<0||fh>20){toast('Floating holidays must be 0–20.','err');return}
  const dvh=Number($('adminDefaultVacHours')?.value)||80;
  if(isNaN(dvh)||dvh<0){toast('Default vacation hours must be 0 or more.','err');return}
  companySettings.workWeek=ww;
  companySettings.floatingHolidaysEnabled=floatEnabled;
  companySettings.floatingHolidaysLabel=floatLabel;
  companySettings.floatingHolidays=fh;
  companySettings.defaultVacHours=dvh;
  const results=await Promise.all([
    saveCompanySetting('work_week',ww),
    saveCompanySetting('floating_holidays_enabled',floatEnabled),
    saveCompanySetting('floating_holidays_label',floatLabel),
    saveCompanySetting('floating_holidays',fh),
    saveCompanySetting('default_vac_hours',dvh),
  ]);
  if(results.every(Boolean)){toast('Calendar settings saved.','ok');const fe=$('adminFloatExtra');if(fe)fe.style.display=floatEnabled?'':'none'}
  else toast('Save failed.','err');
}

async function adminSaveHve(){
  const en=$('adminHveEnabled').value==='yes';
  const lbl=$('adminHveLabel').value.trim()||'HVE';
  companySettings.hveEnabled=en;
  companySettings.hveLabel=lbl;
  const ok1=await saveCompanySetting('hve_enabled',en);
  const ok2=await saveCompanySetting('hve_label',lbl);
  if(ok1&&ok2){toast('HVE settings saved.','ok');applyCompanySettings();$('adminHveGroupLabel').textContent=lbl}
  else toast('Save failed.','err');
}

async function adminChangeLeadCode(){
  const code=$('adminNewLeadCode').value.trim();
  if(!code||code.length<4){toast('Code must be at least 4 characters.','err');return}
  const ok=await saveCompanySetting('lead_code',code);
  if(ok){toast('Lead code updated.','ok');$('adminNewLeadCode').value=''}
  else toast('Save failed.','err');
}

async function adminChangeAdminCode(){
  const code=$('adminNewAdminCode').value.trim();
  if(!code||code.length<6){toast('Admin code must be at least 6 characters.','err');return}
  const ok=await saveCompanySetting('admin_code',code);
  if(ok){toast('Admin code set.','ok');$('adminNewAdminCode').value='';_adminCodeMissing=false;if($('adminFirstSetupBanner'))$('adminFirstSetupBanner').style.display='none'}
  else toast('Save failed.','err');
}

/* ═══════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════
   SECURITY MEASURES IMPLEMENTED (summary):
   Phase 1  — sanitize() on all innerHTML; input length limits; numeric/date validation.
   Phase 2  — Rate limiting: 5 attempts/15 min for login+signup (in-memory).
   Phase 3  — Supabase anon key documented as safe; no service_role key present.
   Phase 4  — Pending users see approval screen; 30 min idle timeout (25 min warning);
               dev bypass requires ?dev=true URL param.
   Phase 5  — Supabase DB: branches, calendar_data, completed_jobs, vacation_allowances,
               overtime_data, user_approvals. RLS policies enforce role-based access.
               localStorage used as fallback cache when offline.
   Phase 5B — AUTH_MODE abstraction: 'supabase'|'external'|'bypass'.
               window.CREWTRACK_USER for Power Apps / mobile wrapper injection.
   Phase 6  — auditLog() fire-and-forget on all mutations (job/person/vacation/
               overtime/complete/undo); stored in audit_log table.
   Phase 7  — _headers (CSP, X-Frame-Options, etc.), _redirects (HTTPS).
   ═══════════════════════════════════════════════ */

$('hDate').textContent=new Date().toLocaleDateString('en-US',{weekday:'short',month:'long',day:'numeric',year:'numeric'});

// 5 quick taps on the CT logo reveals the hidden admin gear tab
let _logoTaps=0,_logoTapTimer=null;
document.querySelector('.sb-logo')?.addEventListener('click',()=>{
  _logoTaps++;
  clearTimeout(_logoTapTimer);
  if(_logoTaps>=5){
    _logoTaps=0;
    const ab=$('btAdmin');if(!ab)return;
    const visible=ab.style.display!=='none'&&ab.style.display!=='';
    ab.style.display=visible?'none':'';
    if(!visible)toast('Admin panel unlocked.','ok');
  }else{
    _logoTapTimer=setTimeout(()=>{_logoTaps=0},2000);
  }
});
$('editModal').addEventListener('click',e=>{if(e.target===$('editModal'))closeModal('editModal')});
$('confirmModal').addEventListener('click',e=>{if(e.target===$('confirmModal'))closeModal('confirmModal')});
$('approvalModal').addEventListener('click',e=>{if(e.target===$('approvalModal'))closeModal('approvalModal')});
// Show dev panel only when ?dev=true
if(_devAllowed){const dp=$('devPanel');if(dp)dp.style.display=''}

document.addEventListener('DOMContentLoaded',()=>{
  const o=document.querySelector('.gantt-outer');if(!o)return;
  o.addEventListener('dragover',e=>{if(!drag)return;const r=o.getBoundingClientRect(),x=e.clientX-r.left;x<150?startEdgeScroll(o,-1):x>r.width-150?startEdgeScroll(o,1):stopEdgeScroll()});
  o.addEventListener('dragleave',e=>{if(!o.contains(e.relatedTarget))stopEdgeScroll()});
  o.addEventListener('drop',()=>stopEdgeScroll());
});

(async()=>{
  // Always try Supabase first; localStorage is cache only
  const loaded=await loadDataAsync();

  if(!loaded){
    // Both Supabase and localStorage empty — seed demo data for new user
    const CREW={
      piping:[{n:'James Carter',t:'direct'},{n:'Mike Thompson',t:'direct'},{n:'David Lee',t:'contractor'},{n:'Chris Evans',t:'direct'},{n:'Ryan Scott',t:'contractor'}],
      civil:[{n:'Tom Harris',t:'direct'},{n:'Jake Miller',t:'contractor'},{n:'Brian Moore',t:'direct'},{n:'Kevin Adams',t:'direct'},{n:'Paul Wright',t:'contractor'}],
      ie:[{n:'Steve Clark',t:'direct'},{n:'Tony Davis',t:'contractor'},{n:'Mark Wilson',t:'direct'},{n:'Eric Taylor',t:'direct'},{n:'Gary Martin',t:'contractor'}],
    };
    BRANCHES.forEach(b=>{const bd=branchData[b.id];bd.people.push({id:0,name:'HVE',type:'direct',floatingHolidays:0});bd.queues[0]=[];bd.vacations[0]=[];
      CREW[b.id].forEach(p=>{const id=bd.npid++;bd.people.push({id,name:p.n,type:p.t,floatingHolidays:p.t==='direct'?3:0});bd.queues[id]=[];bd.vacations[id]=[]})});
    loadBranch(activeBranch);
    const today=today0();
    function daysFromToday(n){const d=new Date(today);d.setDate(d.getDate()+n);return d}
    days=buildDays();todayDi=getTDi(days);
    function seedJobs(bid,personIdx,jobList){
      const bd=branchData[bid],p=bd.people[personIdx];if(!p)return;const pid=p.id;let cursor=todayDi;
      jobList.forEach(([name,hrs,hpw,ifaReqOffset,pending])=>{
        bd.queues[pid].push({id:bd.nid++,name,hours:hrs,hrsPerWeek:hpw||40,ifaDate:ifaReqOffset!=null?iso(daysFromToday(ifaReqOffset)):'',di:cursor,pid,pending:!!pending});
        cursor+=daysFor(hrs,hpw||40);
      });
    }
    function seedVac(bid,personIdx,startOffset,endOffset,name){
      const bd=branchData[bid],p=bd.people[personIdx];if(!p)return;const pid=p.id;
      if(!bd.vacations[pid])bd.vacations[pid]=[];
      bd.vacations[pid].push({id:bd.nid++,pid,name:name||'Vacation',startIso:iso(daysFromToday(startOffset)),endIso:iso(daysFromToday(endOffset))});
    }
    function seedHveJobs(bid,jobList){
      const bd=branchData[bid],slots=[todayDi,todayDi,todayDi];
      jobList.forEach(j=>{let ms=0;for(let i=1;i<slots.length;i++)if(slots[i]<slots[ms])ms=i;
        bd.queues[0].push({id:bd.nid++,name:j[0],hours:j[1],hrsPerWeek:j[2],ifaDate:j[3]?iso(daysFromToday(j[3])):'',di:slots[ms],pid:0});slots[ms]+=daysFor(j[1],j[2])});
    }
    seedJobs('piping',1,[['Unit 4 Piping Replacement',480,40,45],['Heat Exchanger Rework',240,40,85,true]]);
    seedJobs('piping',2,[['Cooling Tower Feed Lines',360,40,60],['Pump Station 3 Upgrade',560,40,110,true]]);
    seedJobs('piping',3,[['Flare Header Tie-In',200,40,30],['Tank Farm Manifold',320,40,75]]);
    seedJobs('piping',4,[['Condensate Return Piping',400,40,55],['Boiler Feed Modification',280,40,95,true]]);
    seedJobs('piping',5,[['Control Room Foundation',160,40,20],['Fire & Gas Detector Grid',480,40,80]]);
    seedVac('piping',1,14,18,'PTO');seedVac('piping',2,30,35,'Fishing Trip');seedVac('piping',3,35,42,'Family Vacation');seedVac('piping',4,50,54,'PTO');seedVac('piping',5,20,24,'Hunting Trip');
    seedHveJobs('piping',[['Unit 4 Piping Replacement',120,50,8],['Cooling Tower Feed Lines',100,50,15],['Flare Header Tie-In',60,50,10],['Heat Exchanger Rework',80,50,20],['Pump Station 3 Upgrade',140,50,30],['Tank Farm Manifold',90,50,22],['Condensate Return Piping',110,50,18],['Boiler Feed Modification',70,50,25],['Control Room Foundation',50,50,12],['Fire & Gas Detector Grid',130,50,28]]);
    seedJobs('civil',1,[['Unit 4 Piping Replacement',300,40,35],['Heat Exchanger Rework',200,40,70,true]]);
    seedJobs('civil',2,[['Cooling Tower Feed Lines',280,40,50],['Pump Station 3 Upgrade',400,40,90]]);
    seedJobs('civil',3,[['Flare Header Tie-In',160,40,25],['Tank Farm Manifold',240,40,60,true]]);
    seedJobs('civil',4,[['Condensate Return Piping',340,40,45],['Boiler Feed Modification',200,40,80]]);
    seedJobs('civil',5,[['Control Room Foundation',500,40,95],['Fire & Gas Detector Grid',320,40,65,true]]);
    seedVac('civil',1,25,29,'PTO');seedVac('civil',2,21,25,'PTO');seedVac('civil',3,40,46,'Beach Trip');seedVac('civil',4,50,57,'Vacation');seedVac('civil',5,15,19,'Doctor Appts');
    seedHveJobs('civil',[['Unit 4 Piping Replacement',90,50,6],['Cooling Tower Feed Lines',80,50,12],['Flare Header Tie-In',50,50,8],['Heat Exchanger Rework',60,50,16],['Pump Station 3 Upgrade',100,50,24],['Tank Farm Manifold',70,50,18],['Condensate Return Piping',95,50,14],['Boiler Feed Modification',55,50,20],['Control Room Foundation',130,50,28],['Fire & Gas Detector Grid',85,50,22]]);
    seedJobs('ie',1,[['Unit 4 Piping Replacement',560,40,100],['Heat Exchanger Rework',320,40,55,true]]);
    seedJobs('ie',2,[['Cooling Tower Feed Lines',200,40,30],['Pump Station 3 Upgrade',480,40,85,true]]);
    seedJobs('ie',3,[['Flare Header Tie-In',400,40,75],['Tank Farm Manifold',160,40,20]]);
    seedJobs('ie',4,[['Condensate Return Piping',240,40,40],['Boiler Feed Modification',360,40,70]]);
    seedJobs('ie',5,[['Control Room Foundation',440,40,80],['Fire & Gas Detector Grid',200,40,35,true]]);
    seedVac('ie',1,28,32,'PTO');seedVac('ie',2,18,22,'Camping');seedVac('ie',3,60,67,'Vacation');seedVac('ie',4,40,44,'PTO');seedVac('ie',5,10,14,'Family Event');
    seedHveJobs('ie',[['Cooling Tower Feed Lines',60,50,10],['Tank Farm Manifold',45,50,8],['Fire & Gas Detector Grid',55,50,10],['Unit 4 Piping Replacement',150,50,12],['Flare Header Tie-In',110,50,20],['Heat Exchanger Rework',100,50,22],['Condensate Return Piping',75,50,14],['Pump Station 3 Upgrade',120,50,26],['Boiler Feed Modification',95,50,24],['Control Room Foundation',115,50,26]]);
    BRANCHES.forEach(b=>{loadBranch(b.id);people.forEach(p=>applySplits(p.id));saveBranch(b.id)});loadBranch(activeBranch);
    BRANCHES.forEach(br=>{branchData[br.id].people.filter(p=>p.id!==0).forEach((p,i)=>{vacHoursAllowance[br.id+':'+p.id]=[80,120,80,96,80][i]||80})});
    saveData();saveCalendarData();
  }

  // loadDataAsync() handles calendar/completed/allowances/overtime; these are safe no-ops if already loaded
  loadCompletedJobs();loadCalendarData();
  // Always start in Designer mode immediately — no popup, no blank screen
  activateDesignerMode();
  // Load company settings (branch labels, type labels, HVE config, etc.) and apply to UI
  await loadCompanySettings();
  applyCompanySettings();
  // Check if admin code exists — if not, first-time setup skips the code prompt
  if(_sb){try{const{error}=await _sb.from('app_settings').select('key').eq('key','admin_code').single();if(error)_adminCodeMissing=true}catch(e){}}
  // Show admin tab only when ?admin=true is in the URL
  if(_adminAllowed){const ab=$('btAdmin');if(ab)ab.style.display=''}
  try{
    // External auth mode: Power Apps or mobile wrapper injects identity
    if(AUTH_MODE==='external'&&window.CREWTRACK_USER){
      const u=window.CREWTRACK_USER;
      currentUser={id:'ext-'+u.email,user_metadata:{full_name:u.name||u.email,role:u.role||'designer'}};
      currentRole=currentUser.user_metadata.role;
      if(currentRole==='lead')activateLeadMode();
      return;
    }
    // Silently restore lead session if a valid code is saved
    const savedCode=localStorage.getItem('crewtrack_lead_code');
    if(savedCode&&_sb){
      try{
        const{data}=await _sb.rpc('verify_lead_code',{code:savedCode});
        if(data){activateLeadMode();return}
        localStorage.removeItem('crewtrack_lead_code');
      }catch(e){}
    }
  }catch(e){}
})();
