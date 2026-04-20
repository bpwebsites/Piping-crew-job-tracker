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
  const isBranch=!!branchData[bid];
  if(isBranch)saveBranch(activeBranch);
  activeBranch=bid;
  if(isBranch)loadBranch(bid);
  focusPid=null;viewYear=new Date().getFullYear();
  const idMap={piping:'btPiping',civil:'btCivil',ie:'btIe',master:'btMaster',timeoff:'btTimeOff'};
  Object.keys(idMap).forEach(k=>{const el=$(idMap[k]);if(el)el.className='branch-tab'+(k===bid?' active':'')});
  $('branchView').classList.toggle('hidden',bid!=='piping'&&bid!=='civil'&&bid!=='ie');
  $('masterView').classList.toggle('hidden',bid!=='master');
  $('timeOffView').classList.toggle('hidden',bid!=='timeoff');
  const outer=document.querySelector('.gantt-outer');if(outer)outer._scrolled=false;
  if(bid==='master'){renderMaster();renderMasterTimeline()}
  else if(bid==='timeoff')renderVacCalendar();
  else refreshAll();
}

/* ═══════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════ */
function toast(msg,type){const t=$('toast');t.textContent=msg;t.className=type||'ok';t.style.display='block';clearTimeout(t._t);t._t=setTimeout(()=>t.style.display='none',2800)}

/* auto-save wrapper */
const _rA=refreshAll,_rnd=render;
refreshAll=function(){_rA();saveData()};render=function(){_rnd();saveData()};

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
        const{data}=await _sb.from('app_settings').select('value').eq('key','lead_code').single();
        if(data&&savedCode===data.value){activateLeadMode();return}
        localStorage.removeItem('crewtrack_lead_code');// code changed — revoke
      }catch(e){}// Supabase unreachable — stay in designer
    }
  }catch(e){}
})();
