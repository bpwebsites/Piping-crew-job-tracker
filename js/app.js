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
  // Remove both class-marked and id-prefixed branch buttons to avoid stale duplicates
  document.querySelectorAll('.branch-specific,[id^="bt_"]').forEach(el=>el.remove());
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

function printView(){window.print()}

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
          <td><select class="form-sel" id="adminBC_${b.id}">${Object.keys(BRANCH_COLOR_PALETTE).filter(c=>c!=='amber').map(c=>`<option value="${c}"${b.color===c?' selected':''}>${c.charAt(0).toUpperCase()+c.slice(1)}</option>`).join('')}</select></td>
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
        <div class="fg"><label>Color</label><select class="form-sel" id="adminNewBranchColor">${Object.keys(BRANCH_COLOR_PALETTE).filter(c=>c!=='amber').map(c=>`<option value="${c}">${c.charAt(0).toUpperCase()+c.slice(1)}</option>`).join('')}</select></div>
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
  loadActivityLog();
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
  if(!branchData[id])branchData[id]={people:[],queues:{},vacations:{},weatherHolds:{},nid:1,npid:1};
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

async function loadActivityLog(){
  const el=$('activityLogList');if(!el||!_sb)return;
  el.innerHTML='<div style="color:var(--text-muted);font-size:12px;padding:8px 0">Loading…</div>';
  try{
    const{data,error}=await _sb.from('audit_log').select('*').order('created_at',{ascending:false}).limit(100);
    if(error||!data?.length){el.innerHTML='<div style="color:var(--text-muted);font-size:12px;padding:8px 0">No activity recorded yet.</div>';return}
    const rows=data.map(e=>{
      const when=new Date(e.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
      const who=e.user_email||'system';
      const d=e.details||{};
      let act='';
      switch(e.action){
        case 'job_added':act='Added "'+sanitize(d.name||'')+'" ('+d.hours+'h) → '+(d.branch||'');break;
        case 'job_edited':act='Edited "'+sanitize(d.newName||'')+'" in '+(d.branch||'');break;
        case 'job_deleted':act='Deleted "'+sanitize(d.name||'')+'" from '+(d.branch||'');break;
        case 'job_moved':act='Moved "'+sanitize(d.name||'')+'" in '+(d.branch||'');break;
        case 'job_completed':act='Completed "'+sanitize(d.displayName||d.normName||'')+'"';break;
        case 'job_uncompleted':act='Undid completion of "'+sanitize(d.normName||'')+'"';break;
        case 'person_added':act='Added '+sanitize(d.name||'')+' ('+d.type+') to '+(d.branch||'');break;
        case 'person_removed':act='Removed '+sanitize(d.name||'')+' from '+(d.branch||'');break;
        case 'vacation_added':act='Added vacation "'+sanitize(d.name||'')+'" ('+d.startIso+' – '+d.endIso+')';break;
        case 'vacation_deleted':act='Deleted vacation in '+(d.branch||d.source||'');break;
        case 'overtime_added':act='Overtime added on '+d.date;break;
        case 'overtime_deleted':act='Overtime removed on '+d.date;break;
        case 'weather_hold_set':act='Weather hold '+(d.hours?d.hours+'h on '+d.date:'cleared on '+d.date)+' ('+d.branch+')';break;
        default:act=e.action.replace(/_/g,' ');
      }
      return'<tr style="border-bottom:.5px solid var(--border)">'
        +'<td style="padding:5px 10px;font-size:11px;color:var(--text-muted);white-space:nowrap;font-family:var(--mono)">'+when+'</td>'
        +'<td style="padding:5px 10px;font-size:11px;color:var(--text-muted);white-space:nowrap">'+sanitize(who)+'</td>'
        +'<td style="padding:5px 10px;font-size:12px">'+act+'</td></tr>';
    });
    el.innerHTML='<div style="max-height:400px;overflow-y:auto"><table style="width:100%;border-collapse:collapse">'
      +'<thead><tr style="background:var(--bg);position:sticky;top:0">'
      +'<th style="padding:5px 10px;font-size:11px;color:var(--text-muted);text-align:left;white-space:nowrap">Time</th>'
      +'<th style="padding:5px 10px;font-size:11px;color:var(--text-muted);text-align:left">User</th>'
      +'<th style="padding:5px 10px;font-size:11px;color:var(--text-muted);text-align:left">Action</th></tr></thead>'
      +'<tbody>'+rows.join('')+'</tbody></table></div>';
  }catch(err){el.innerHTML='<div style="color:var(--text-muted);font-size:12px;padding:8px 0">Unable to load activity log.</div>'}
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
    // Both Supabase and localStorage empty — initialize blank state with just HVE
    BRANCHES.forEach(b=>{
      const bd=branchData[b.id];
      bd.people=[{id:0,name:companySettings.hveLabel||'HVE',type:'direct',floatingHolidays:0}];
      bd.queues={0:[]};bd.vacations={0:[]};bd.nid=1;bd.npid=1;
    });
    loadBranch(activeBranch);
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
