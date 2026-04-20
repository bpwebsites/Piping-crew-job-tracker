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
   ═══════════════════════════════════════════════ */
const BRANCHES=[{id:'piping',label:'Piping'},{id:'civil',label:'Civil'},{id:'ie',label:'I&E'}];
const BRANCH_COLORS={
  piping:{bg:'#dbeafe',txt:'#1d4ed8',bdr:'#93c5fd'},
  civil:{bg:'#dcfce7',txt:'#15803d',bdr:'#86efac'},
  ie:{bg:'#fef9c3',txt:'#a16207',bdr:'#fde047'},
};

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
