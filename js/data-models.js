/* ═══════════════════════════════════════════════
   DATA-MODELS.JS
   Depends on: config.js (BRANCHES, HVE_ID)
               supabase.js (_sbUpsertBranch, _sbUpsertCalendar,
                 _sbUpsertAllowances, _sbUpsertOvertime, _sbUpsertCompleted)
   Provides: STATE, DOM helpers, validation, branch load/save,
             localStorage cache, storage public API, pure data utilities
   ═══════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════ */
const branchData={
  piping:{people:[],queues:{},vacations:{},nid:1,npid:1},
  civil:{people:[],queues:{},vacations:{},nid:1,npid:1},
  ie:{people:[],queues:{},vacations:{},nid:1,npid:1},
};
let calendarPeople=[], calendarVacations={}, calNid=1, calNpid=1;
let vacHoursAllowance={}, overtimeData={};
let people, queues, vacations, nid, npid;
let days=[], todayDi=-1, drag=null, focusPid=null, editTarget=null;
let activeBranch='piping', viewYear=new Date().getFullYear();
let masterFilter='all', masterViewYear=new Date().getFullYear(), masterFocusJob=null;
let completedJobs=new Set(), _confirmCallback=null;
let currentUser=null, currentRole=null;
let vacViewYear=new Date().getFullYear();

/* ═══════════════════════════════════════════════
   DOM HELPERS
   ═══════════════════════════════════════════════ */
const $=id=>document.getElementById(id);
const $cls=(el,cls,on)=>$(el).classList.toggle(cls,on!==undefined?on:undefined);

/* ═══════════════════════════════════════════════
   SECURITY — INPUT SANITIZATION & VALIDATION
   All user-provided strings must pass through sanitize() before
   being inserted into innerHTML. validateName/Hours/Hpw/Date are
   called at every input boundary (add/edit forms).
   ═══════════════════════════════════════════════ */
function sanitize(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
const LIMITS={JOB_NAME:100,PERSON_NAME:60,VAC_NAME:60,HOURS_MAX:9999,HPW_MAX:168,DATE_RANGE_YEARS:5};
function validateName(val,field,max){
  const s=String(val||'').trim();
  if(!s){toast('Please enter a '+field+'.','err');return null}
  if(s.length>max){toast(field+' must be '+max+' characters or fewer.','err');return null}
  return s;
}
function validateHours(val,label){
  const n=Number(val);
  if(isNaN(n)||n<1){toast((label||'Man hours')+' must be at least 1.','err');return null}
  if(n>LIMITS.HOURS_MAX){toast((label||'Man hours')+' cannot exceed '+LIMITS.HOURS_MAX+'.','err');return null}
  return Math.round(n);
}
function validateHpw(val){
  const n=Number(val)||40;
  if(isNaN(n)||n<1){toast('Hours/week must be at least 1.','err');return null}
  if(n>LIMITS.HPW_MAX){toast('Hours/week cannot exceed '+LIMITS.HPW_MAX+'.','err');return null}
  return Math.max(1,Math.round(n));
}
function validateDate(s){
  if(!s)return '';
  const d=new Date(s+'T00:00:00');
  if(isNaN(d.getTime())){toast('Invalid date.','err');return null}
  const now=new Date(),y=LIMITS.DATE_RANGE_YEARS;
  const minD=new Date(now.getFullYear()-y,now.getMonth(),now.getDate());
  const maxD=new Date(now.getFullYear()+y,now.getMonth(),now.getDate());
  if(d<minD||d>maxD){toast('Date must be within '+y+' years of today.','err');return null}
  return s;
}

/* ═══════════════════════════════════════════════
   PURE DATA UTILITIES
   ═══════════════════════════════════════════════ */
function normJob(s){return s.trim().toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim()}
function lastName(n){const p=n.trim().split(/\s+/);return p[p.length-1].toLowerCase()}
function hpwToDaily(hpw){return(Number(String(hpw).split('-').pop())||40)/5}
function daysFor(hrs,hpw){return Math.max(1,Math.ceil(hrs/hpwToDaily(hpw)))}

/* ═══════════════════════════════════════════════
   BRANCH SWITCHING — data layer only
   UI routing (setBranch) stays in the main script
   ═══════════════════════════════════════════════ */
function loadBranch(bid){const bd=branchData[bid];if(!bd)return;people=bd.people;queues=bd.queues;vacations=bd.vacations;nid=bd.nid;npid=bd.npid}
function saveBranch(bid){if(!branchData[bid])return;branchData[bid].nid=nid;branchData[bid].npid=npid}

/* ═══════════════════════════════════════════════
   STORAGE
   localStorage primary cache + Supabase async writes.
   Reads try Supabase; on failure fall back to localStorage cache.
   The local cache keeps the app usable when offline or during
   brief network outages, and syncs automatically when reconnected.
   ═══════════════════════════════════════════════ */

/* ── localStorage cache helpers ── */
function _lsSaveBranches(){
  try{saveBranch(activeBranch);const s=localStorage;
    BRANCHES.forEach(b=>{const bd=branchData[b.id];
      s.setItem('ct_'+b.id+'_p',JSON.stringify(bd.people));
      s.setItem('ct_'+b.id+'_q',JSON.stringify(bd.queues));
      s.setItem('ct_'+b.id+'_v',JSON.stringify(bd.vacations));
      s.setItem('ct_'+b.id+'_nid',String(bd.nid));
      s.setItem('ct_'+b.id+'_npid',String(bd.npid))});
  }catch(e){}
}
function _lsLoadBranches(){
  try{let any=false;const s=localStorage;
    BRANCHES.forEach(b=>{
      const sp=s.getItem('ct_'+b.id+'_p'),sq=s.getItem('ct_'+b.id+'_q');if(!sp||!sq)return;any=true;
      const qr=JSON.parse(sq),q2={};Object.keys(qr).forEach(k=>q2[Number(k)]=qr[k]);
      const vr=JSON.parse(s.getItem('ct_'+b.id+'_v')||'{}'),v2={};Object.keys(vr).forEach(k=>v2[Number(k)]=vr[k]);
      branchData[b.id]={people:JSON.parse(sp),queues:q2,vacations:v2,
        nid:Number(s.getItem('ct_'+b.id+'_nid')||1),npid:Number(s.getItem('ct_'+b.id+'_npid')||1)};
    });
    if(any){loadBranch(activeBranch);return true}
  }catch(e){}
  return false;
}
function _lsSaveCalendar(){
  try{const s=localStorage;
    s.setItem('ct_cal_people',JSON.stringify(calendarPeople));
    s.setItem('ct_cal_vacs',JSON.stringify(calendarVacations));
    s.setItem('ct_cal_nid',String(calNid));s.setItem('ct_cal_npid',String(calNpid));
    s.setItem('ct_vac_hours',JSON.stringify(vacHoursAllowance));
    s.setItem('ct_overtime',JSON.stringify(overtimeData));
  }catch(e){}
}
function _lsLoadCalendar(){
  try{const s=localStorage;
    const sp=s.getItem('ct_cal_people');if(sp)calendarPeople=JSON.parse(sp);
    const sv=s.getItem('ct_cal_vacs');
    if(sv){const vr=JSON.parse(sv);calendarVacations={};Object.keys(vr).forEach(k=>calendarVacations[Number(k)]=vr[k])}
    calNid=Number(s.getItem('ct_cal_nid')||1);calNpid=Number(s.getItem('ct_cal_npid')||1);
    const vh=s.getItem('ct_vac_hours');if(vh)vacHoursAllowance=JSON.parse(vh);
    const ot=s.getItem('ct_overtime');if(ot)overtimeData=JSON.parse(ot);
  }catch(e){}
}

/* ── Public API ── */
function saveData(){
  saveBranch(activeBranch);
  _lsSaveBranches();
  // async Supabase writes; don't block the UI
  BRANCHES.forEach(b=>_sbUpsertBranch(b.id));
}
function saveCalendarData(){
  _lsSaveCalendar();
  _sbUpsertCalendar();
  _sbUpsertAllowances();
  _sbUpsertOvertime();
}
function saveCompletedJobs(){
  try{localStorage.setItem('ct_completed',JSON.stringify([...completedJobs]))}catch(e){}
  _sbUpsertCompleted();
}

/* Synchronous wrapper used during initial seed check */
function loadData(){return _lsLoadBranches()}
function loadCalendarData(){_lsLoadCalendar()}
function loadCompletedJobs(){try{const s=localStorage.getItem('ct_completed');if(s)completedJobs=new Set(JSON.parse(s))}catch(e){}}
