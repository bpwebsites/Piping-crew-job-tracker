/* ═══════════════════════════════════════════════
   GANTT LAYOUT CONSTANTS
   ═══════════════════════════════════════════════ */
const CW=20, PH=46, PG=6, PP=8, HRS_PER_DAY=10;

/* ═══════════════════════════════════════════════
   HVE SPECIAL CREW MEMBER
   id=0 is permanent in every branch; not deletable
   ═══════════════════════════════════════════════ */
const HVE_ID=0;

/* ═══════════════════════════════════════════════
   COLOR PALETTE (8 rotating crew member colors)
   ═══════════════════════════════════════════════ */
const PAL=[
  {bg:'#b5d4f4',txt:'#0c447c',bdr:'#85b7eb'},{bg:'#9fe1cb',txt:'#085041',bdr:'#5dcaa5'},
  {bg:'#f5c4b3',txt:'#712b13',bdr:'#f0997b'},{bg:'#fac775',txt:'#633806',bdr:'#ef9f27'},
  {bg:'#c0dd97',txt:'#27500a',bdr:'#97c459'},{bg:'#cecbf6',txt:'#3c3489',bdr:'#afa9ec'},
  {bg:'#f4c0d1',txt:'#72243e',bdr:'#ed93b1'},{bg:'#d3d1c7',txt:'#444441',bdr:'#b4b2a9'},
];
const VAC_COLOR={bg:'#d4e8d4',txt:'#2d5a2d',bdr:'#6aaf6a'};
const PENDING_COLOR={bg:'#e5e7eb',txt:'#6b7280',bdr:'#9ca3af'};

/* ═══════════════════════════════════════════════
   BRANCHES
   BRANCHES is mutable — admin panel can add/remove.
   Each entry: {id, label, color} where color is a
   key into BRANCH_COLOR_PALETTE.
   BRANCH_COLORS is rebuilt via rebuildBranchColors()
   whenever branches change.
   ═══════════════════════════════════════════════ */
const BRANCHES=[
  {id:'piping',label:'Piping',color:'blue'},
  {id:'civil',label:'Civil',color:'green'},
  {id:'ie',label:'I&E',color:'amber'},
];
const BRANCH_COLOR_PALETTE={
  blue:  {bg:'#dbeafe',txt:'#1d4ed8',bdr:'#93c5fd'},
  green: {bg:'#dcfce7',txt:'#15803d',bdr:'#86efac'},
  amber: {bg:'#fef9c3',txt:'#a16207',bdr:'#fde047'},
  red:   {bg:'#fee2e2',txt:'#991b1b',bdr:'#fca5a5'},
  purple:{bg:'#f3e8ff',txt:'#7e22ce',bdr:'#d8b4fe'},
  teal:  {bg:'#ccfbf1',txt:'#0f766e',bdr:'#5eead4'},
  orange:{bg:'#ffedd5',txt:'#9a3412',bdr:'#fdba74'},
  slate: {bg:'#f1f5f9',txt:'#475569',bdr:'#cbd5e1'},
};
const BRANCH_COLORS={
  piping:{bg:'#dbeafe',txt:'#1d4ed8',bdr:'#93c5fd'},
  civil: {bg:'#dcfce7',txt:'#15803d',bdr:'#86efac'},
  ie:    {bg:'#fef9c3',txt:'#a16207',bdr:'#fde047'},
};
function getBranchColor(bid){
  const b=BRANCHES.find(br=>br.id===bid);
  return BRANCH_COLOR_PALETTE[b?.color||'blue']||BRANCH_COLOR_PALETTE.blue;
}
function rebuildBranchColors(){
  Object.keys(BRANCH_COLORS).forEach(k=>delete BRANCH_COLORS[k]);
  BRANCHES.forEach(b=>{BRANCH_COLORS[b.id]=getBranchColor(b.id)});
}

/* ═══════════════════════════════════════════════
   SUPABASE CONFIG
   SECURITY NOTE — what is safe vs. not safe in frontend code:
     SAFE to expose: anon key (public, scoped to RLS policies; anyone can read it)
     NEVER expose:   service_role key (bypasses all RLS — server-side only)
   The anon key below is intentionally public. It grants only what
   Row Level Security policies explicitly allow for authenticated/anon users.
   ═══════════════════════════════════════════════ */
const SUPABASE_URL='https://nwhnjhzdeokplpmyrmjf.supabase.co';
// PUBLIC anon key — safe for frontend. See security note above.
const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53aG5qaHpkZW9rcGxwbXlybWpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0ODkwMTAsImV4cCI6MjA5MDA2NTAxMH0.QJtCpk5MrdXMUtqZwIHNzyeMLVFLn4I1vH298zCpOSY';

/* ═══════════════════════════════════════════════
   AUTH MODE
   Controls which identity source is used:
     'supabase' — Supabase email/password login (default for web)
     'external' — identity injected via window.CREWTRACK_USER
                  (for Power Apps, Capacitor mobile wrapper, etc.)
                  Expected shape: {name, email, role}
     'bypass'   — no auth, full lead access
                  Only available when URL contains ?dev=true
   ═══════════════════════════════════════════════ */
const _devAllowed=new URLSearchParams(window.location.search).has('dev');
const AUTH_MODE=(()=>{
  if(window.CREWTRACK_AUTH_MODE)return window.CREWTRACK_AUTH_MODE;
  if(window.CREWTRACK_USER)return'external';
  return'local';
})();

/* ═══════════════════════════════════════════════
   ADMIN MODE
   Only available when URL contains ?admin=true.
   Uses a separate code from the lead code — stored
   in app_settings.admin_code (Brady's eyes only).
   ═══════════════════════════════════════════════ */
const _adminAllowed=new URLSearchParams(window.location.search).has('admin');
let isAdminMode=false;
let _adminCodeMissing=false;

/* ═══════════════════════════════════════════════
   COMPANY SETTINGS
   Loaded from app_settings on init. Defaults below
   are used when no saved settings exist yet.
   ═══════════════════════════════════════════════ */
let companySettings={
  companyName:'',
  typeLabels:{direct:'Direct',contractor:'Contractor'},
  floatingHolidays:3,
  floatingHolidaysEnabled:true,
  floatingHolidaysLabel:'Floating Holiday',
  workWeek:'mon-fri',
  hveEnabled:true,
  hveLabel:'HVE',
  defaultVacHours:80,
};
