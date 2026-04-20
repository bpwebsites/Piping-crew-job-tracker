/* ═══════════════════════════════════════════════
   AUTH.JS
   Depends on: config.js (_devAllowed, AUTH_MODE)
               supabase.js (_sb, auditLog)
               index.html globals: currentUser, currentRole, toast,
                 sanitize, showConfirm, updateSelects, renderPeopleList, render
   ═══════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════
   SESSION TIMEOUT
   Auto sign-out after 30 min of inactivity.
   Warning toast at 25 min. Timer resets on any user interaction.
   ═══════════════════════════════════════════════ */
let _sessionTimer=null,_warnTimer=null;
const SESSION_IDLE_MS=30*60*1000,SESSION_WARN_MS=25*60*1000;
function resetSessionTimer(){
  clearTimeout(_sessionTimer);clearTimeout(_warnTimer);
  if(currentRole!=='lead')return;
  _warnTimer=setTimeout(()=>toast('Session expiring in 5 minutes due to inactivity.','err'),SESSION_WARN_MS);
  _sessionTimer=setTimeout(()=>{toast('Session expired. Signing out.','err');setTimeout(()=>signOut(),1500)},SESSION_IDLE_MS);
}
['click','keypress','scroll','mousemove'].forEach(ev=>
  document.addEventListener(ev,()=>{if(currentUser)resetSessionTimer()},{passive:true}));

/* ═══════════════════════════════════════════════
   RATE LIMITING (login attempts, in-memory only)
   Max 5 attempts per 15 minutes per action type.
   Tracks attempt timestamps in memory — never persisted.
   ═══════════════════════════════════════════════ */
const _authAttempts={login:[],signup:[]};
const _RATE={max:5,windowMs:15*60*1000};
function checkRateLimit(type){
  const now=Date.now();
  _authAttempts[type]=_authAttempts[type].filter(t=>now-t<_RATE.windowMs);
  if(_authAttempts[type].length>=_RATE.max){
    const wait=Math.ceil((_RATE.windowMs-(now-_authAttempts[type][0]))/60000);
    return{blocked:true,msg:'Too many attempts. Try again in '+wait+' minute'+(wait!==1?'s':'')+'.'}
  }
  _authAttempts[type].push(now);
  return{blocked:false};
}
function resetRateLimit(type){_authAttempts[type]=[]}

/* ═══════════════════════════════════════════════
   LEAD ACCESS MODAL
   ═══════════════════════════════════════════════ */
function openLeadAccessModal(){
  if(currentRole==='lead'){toast('Already in lead mode.','ok');return}
  $('leadAccessModal').classList.remove('hidden');
  $('leadCodeInput').value='';
  $('leadCodeErr').textContent='';
  if(_devAllowed)$('devPanel').style.display='';
  setTimeout(()=>$('leadCodeInput').focus(),50);
}
function closeLeadAccessModal(){$('leadAccessModal').classList.add('hidden')}

async function submitLeadCode(){
  const rl=checkRateLimit('login');
  if(rl.blocked){$('leadCodeErr').textContent=rl.msg;return}
  const code=$('leadCodeInput').value.trim();
  if(!code){$('leadCodeErr').textContent='Enter an access code.';return}
  if(!_sb){$('leadCodeErr').textContent='Connection unavailable.';return}
  $('leadCodeErr').textContent='Checking\u2026';
  try{
    const{data,error}=await _sb.from('app_settings').select('value').eq('key','lead_code').single();
    if(error||!data){$('leadCodeErr').textContent='Unable to verify code.';return}
    if(code!==data.value){$('leadCodeErr').textContent='Incorrect access code.';return}
    resetRateLimit('login');
    localStorage.setItem('crewtrack_lead_code',code);
    closeLeadAccessModal();
    activateLeadMode();
  }catch(e){$('leadCodeErr').textContent='Connection error. Try again.'}
}

/* ═══════════════════════════════════════════════
   ROLE ACTIVATION
   ═══════════════════════════════════════════════ */
function activateLeadMode(){
  currentUser={id:'lead-local',user_metadata:{full_name:'Lead',role:'lead'}};
  currentRole='lead';
  $('userNameLabel').textContent='Lead';
  $('leadAccessBtn').style.display='none';
  $('userInfo').classList.remove('hidden');$('userInfo').style.display='flex';
  $('branchTabsEl').classList.remove('hidden');
  $('mainEl').classList.remove('hidden');$('mainEl').style.display='block';
  resetSessionTimer();
  applyRole('lead');
  loadPendingUsers();startPendingPoll();
}

function activateDesignerMode(){
  currentUser={id:'designer-anon',user_metadata:{full_name:'',role:'designer'}};
  currentRole='designer';
  $('leadAccessBtn').style.display='';
  $('userInfo').classList.add('hidden');
  $('branchTabsEl').classList.remove('hidden');
  $('mainEl').classList.remove('hidden');$('mainEl').style.display='block';
  applyRole('designer');
}

async function signOut(){
  clearTimeout(_sessionTimer);clearTimeout(_warnTimer);
  stopPendingPoll();
  localStorage.removeItem('crewtrack_lead_code');
  currentUser=null;currentRole=null;
  $('userInfo').classList.add('hidden');
  activateDesignerMode();
  toast('Signed out. Viewing as Designer.','ok');
}

function applyRole(role){
  const isLead=role==='lead';
  $('addJobCard').style.display=isLead?'':'none';
  $('manageCrewCard').style.display=isLead?'':'none';
  $('manageCalPeopleCard').style.display=isLead?'':'none';
  $('setVacHoursCard').style.display='';
  $('setVacHoursTitle').textContent=isLead?'Manage Vacation Hours':'Total Vacation Hours';
  document.body.classList.toggle('readonly',!isLead);
  if(isLead){updateSelects();renderPeopleList();render()}
  else{updateSelects();render()}
}

function getCurrentUserRole(){return currentRole}

// devBypass is only available when ?dev=true is in the URL
window.devBypass=function(role){
  if(!_devAllowed){toast('Dev bypass requires ?dev=true in the URL.','err');return}
  role=role||'lead';
  currentUser={id:'dev-'+role,user_metadata:{full_name:'Test '+role.charAt(0).toUpperCase()+role.slice(1),role}};
  currentRole=role;
  closeLeadAccessModal();
  if(role==='lead')activateLeadMode();else activateDesignerMode();
};

/* ═══════════════════════════════════════════════
   USER APPROVAL MANAGEMENT (Lead-only)
   Reads pending signups from user_approvals table.
   Approve assigns a role; reject bars access.
   Badge in header shows live pending count.
   ═══════════════════════════════════════════════ */
let _pendingUsers=[];
let _pendingPollInterval=null;

async function loadPendingUsers(){
  if(!_sb||currentRole!=='lead')return;
  try{
    const{data}=await _sb.from('user_approvals')
      .select('id,user_id,email,full_name,created_at')
      .eq('status','pending')
      .order('created_at',{ascending:true});
    _pendingUsers=data||[];
    const badge=$('approvalBadge');
    if(badge){
      if(_pendingUsers.length>0){badge.classList.remove('hidden');$('approvalCount').textContent=_pendingUsers.length}
      else{badge.classList.add('hidden')}
    }
  }catch(e){}
}

function startPendingPoll(){
  clearInterval(_pendingPollInterval);
  _pendingPollInterval=setInterval(()=>{if(currentRole==='lead')loadPendingUsers();else stopPendingPoll()},30000);
}

function stopPendingPoll(){
  clearInterval(_pendingPollInterval);_pendingPollInterval=null;
}

function openApprovalModal(){
  renderApprovalList();
  $('approvalModal').classList.remove('hidden');
}

function renderApprovalList(){
  const el=$('approvalList');if(!el)return;
  const bc=$('approvalBadgeCount');if(bc)bc.textContent=_pendingUsers.length?_pendingUsers.length+' pending':'';
  if(!_pendingUsers.length){
    el.innerHTML='<p style="font-size:13px;color:var(--text-muted);text-align:center;padding:1.5rem 0">No pending approvals. ✓</p>';
    return;
  }
  el.innerHTML=_pendingUsers.map(u=>{
    const joined=new Date(u.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    return'<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:.5px solid var(--border);gap:10px">'
      +'<div style="min-width:0;flex:1">'
      +'<div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+sanitize(u.full_name||u.email)+'</div>'
      +'<div style="font-size:11px;color:var(--text-muted)">'+sanitize(u.email)+' &middot; Joined '+sanitize(joined)+'</div>'
      +'</div>'
      +'<div style="display:flex;gap:6px;align-items:center;flex-shrink:0">'
      +'<select id="role_'+sanitize(u.id)+'" style="font-family:var(--font);font-size:12px;height:30px;padding:0 6px;border:1px solid rgba(0,0,0,.15);border-radius:6px;background:var(--bg)">'
      +'<option value="designer">Designer</option>'
      +'<option value="lead">Lead</option>'
      +'</select>'
      +'<button onclick="approveUser(\''+sanitize(u.user_id)+'\',\''+sanitize(u.id)+'\')" class="btn" style="height:30px;padding:0 12px;font-size:12px">Approve</button>'
      +'<button onclick="rejectUser(\''+sanitize(u.user_id)+'\',\''+sanitize(u.id)+'\')" class="btn-warn" style="height:30px">Reject</button>'
      +'</div></div>';
  }).join('');
}

async function approveUser(userId,approvalId){
  if(!_sb)return;
  const sel=$('role_'+approvalId);
  const role=sel?sel.value:'designer';
  try{
    const{error}=await _sb.from('user_approvals')
      .update({role,status:'approved',approved_by:currentUser.id,updated_at:new Date().toISOString()})
      .eq('id',approvalId);
    if(error){toast('Approval failed: '+error.message,'err');return}
    auditLog('user_approved',{approvalId,userId,role});
    _pendingUsers=_pendingUsers.filter(u=>u.id!==approvalId);
    toast('User approved as '+role+'.','ok');
    renderApprovalList();loadPendingUsers();
  }catch(e){toast('Approval failed.','err')}
}

async function rejectUser(userId,approvalId){
  showConfirm('Reject this user? They will not be able to access the app.',async()=>{
    try{
      await _sb.from('user_approvals')
        .update({status:'rejected',updated_at:new Date().toISOString()})
        .eq('id',approvalId);
      auditLog('user_rejected',{approvalId,userId});
      _pendingUsers=_pendingUsers.filter(u=>u.id!==approvalId);
      toast('User rejected.','ok');
      renderApprovalList();loadPendingUsers();
    }catch(e){toast('Rejection failed.','err')}
  });
}
