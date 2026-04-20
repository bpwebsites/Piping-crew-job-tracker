/* ═══════════════════════════════════════════════
   SUPABASE CLIENT
   Depends on: config.js (SUPABASE_URL, SUPABASE_ANON_KEY)
   ═══════════════════════════════════════════════ */
let _sb=null;
try{_sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY)}catch(e){}

/* ═══════════════════════════════════════════════
   WRITE HELPERS  (fire-and-forget; localStorage cache always written first)
   Each helper reads from global state declared in index.html.
   ═══════════════════════════════════════════════ */
async function _sbUpsertBranch(bid){
  if(!_sb||!currentUser)return;
  const bd=branchData[bid];
  try{await _sb.from('branches').upsert({branch_id:bid,data:bd,updated_at:new Date().toISOString()},{onConflict:'branch_id'})}catch(e){}
}
async function _sbUpsertCalendar(){
  if(!_sb||!currentUser)return;
  try{await _sb.from('calendar_data').upsert({id:1,
    data:{people:calendarPeople,vacations:calendarVacations,nid:calNid,npid:calNpid},
    updated_at:new Date().toISOString()},{onConflict:'id'})}catch(e){}
}
async function _sbUpsertAllowances(){
  if(!_sb||!currentUser)return;
  try{await _sb.from('vacation_allowances').upsert({id:1,allowances:vacHoursAllowance,updated_at:new Date().toISOString()},{onConflict:'id'})}catch(e){}
}
async function _sbUpsertOvertime(){
  if(!_sb||!currentUser)return;
  try{await _sb.from('overtime_data').upsert({id:1,data:overtimeData,updated_at:new Date().toISOString()},{onConflict:'id'})}catch(e){}
}
async function _sbUpsertCompleted(){
  if(!_sb||!currentUser)return;
  try{await _sb.from('completed_jobs').upsert({id:1,jobs:[...completedJobs],updated_at:new Date().toISOString()},{onConflict:'id'})}catch(e){}
}

/* ═══════════════════════════════════════════════
   LOAD  (Supabase primary + localStorage fallback)
   All writes go to Supabase first, then update the local cache.
   Reads try Supabase; on failure fall back to localStorage.
   The local cache keeps the app usable offline and syncs when reconnected.
   ═══════════════════════════════════════════════ */
async function loadDataAsync(){
  if(_sb&&currentUser){
    try{
      const[br,cal,compl,allow,ot]=await Promise.all([
        _sb.from('branches').select('branch_id,data'),
        _sb.from('calendar_data').select('data').eq('id',1).single(),
        _sb.from('completed_jobs').select('jobs').eq('id',1).single(),
        _sb.from('vacation_allowances').select('allowances').eq('id',1).single(),
        _sb.from('overtime_data').select('data').eq('id',1).single(),
      ]);
      let anyBranch=false;
      if(br.data&&br.data.length){
        br.data.forEach(row=>{
          const bd=row.data;if(!bd)return;anyBranch=true;
          const q2={},v2={};
          Object.keys(bd.queues||{}).forEach(k=>q2[Number(k)]=(bd.queues||{})[k]);
          Object.keys(bd.vacations||{}).forEach(k=>v2[Number(k)]=(bd.vacations||{})[k]);
          branchData[row.branch_id]={people:bd.people||[],queues:q2,vacations:v2,nid:bd.nid||1,npid:bd.npid||1};
        });
        if(anyBranch){loadBranch(activeBranch);_lsSaveBranches()}
      }
      if(cal.data?.data){
        const d=cal.data.data;
        calendarPeople=d.people||[];
        const vr=d.vacations||{};calendarVacations={};Object.keys(vr).forEach(k=>calendarVacations[Number(k)]=vr[k]);
        calNid=d.nid||1;calNpid=d.npid||1;
        _lsSaveCalendar();
      }
      if(compl.data?.jobs)completedJobs=new Set(compl.data.jobs);
      if(allow.data?.allowances)vacHoursAllowance=allow.data.allowances;
      if(ot.data?.data)overtimeData=ot.data.data;
      return anyBranch;
    }catch(e){}
  }
  // Supabase unavailable — fall back to localStorage cache
  _lsLoadCalendar();
  const r=_lsLoadBranches();
  try{const s=localStorage.getItem('ct_completed');if(s)completedJobs=new Set(JSON.parse(s))}catch(e){}
  return r;
}

/* ═══════════════════════════════════════════════
   AUDIT TRAIL  (Phase 6)
   Fire-and-forget: writes never block the UI.
   Logged actions: job add/edit/delete/move, person add/remove,
   vacation add/delete, overtime add/delete, job complete/undo,
   user approved/role changed.
   ═══════════════════════════════════════════════ */
function auditLog(action,details){
  if(!_sb||!currentUser)return;
  const entry={
    user_id:currentUser.id,
    user_email:currentUser.email||currentUser.user_metadata?.full_name||'dev',
    action,
    details:details||{}
  };
  // fire-and-forget — no await, no error surfaced to user
  _sb.from('audit_log').insert(entry).then(()=>{}).catch(()=>{});
}
