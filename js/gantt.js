/* ═══════════════════════════════════════════════
   GANTT.JS
   Depends on: config.js (CW, PH, PG, PP, PAL, VAC_COLOR, PENDING_COLOR,
                 BRANCHES, BRANCH_COLORS)
               data-models.js (state vars, sanitize, daysFor, hpwToDaily,
                 normJob, lastName, saveData, saveCompletedJobs)
               jobs.js (applySplits, mergeSplitGroup, refreshAll,
                 renderPeopleList, showConfirm, openEdit, deleteJobGroup,
                 deleteVacation, deleteVacFromCalendar, deleteOvertime,
                 getVacHoursUsed, renderVacHoursTracker, renderCalendarPeopleList,
                 updateVacSelect, updateOtSelect, updateVacTypeVisibility,
                 setVacViewYear)
               supabase.js (auditLog)
   Provides: date helpers, gantt builders, all render functions, drag-and-drop
   ═══════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════
   DATE HELPERS
   ═══════════════════════════════════════════════ */
function today0(){const d=new Date();d.setHours(0,0,0,0);return d}
function addDays(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r}
function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function fromIso(s){const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)}
function fmtShort(d){return d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}
function isWorkday(d){const w=d.getDay();return w>=1&&w<=5}
function buildDays(){
  const y=today0().getFullYear(),ds=[];let c=new Date(y-1,0,1);c.setHours(0,0,0,0);
  const end=new Date(y+2,11,31);
  while(c<=end){if(isWorkday(c))ds.push(new Date(c));c=addDays(c,1)}
  return ds;
}
function getTDi(ds){
  const td=iso(today0());let i=ds.findIndex(d=>iso(d)===td);
  if(i>=0)return i;
  for(let n=1;n<=7;n++){const nx=addDays(today0(),n);if(isWorkday(nx)){i=ds.findIndex(d=>iso(d)===iso(nx));if(i>=0)return i}}
  return 0;
}
function minDi(){return Math.max(0,todayDi)}
function dateToDi(d){let r=new Date(d);r.setHours(0,0,0,0);while(!isWorkday(r))r=addDays(r,1);return days.findIndex(x=>iso(x)===iso(r))}
function getColor(pid){return PAL[Math.max(0,people.findIndex(p=>p.id===pid))%PAL.length]}
function getColorForBranch(pid,bd){return PAL[Math.max(0,bd.people.findIndex(p=>p.id===pid))%PAL.length]}

/* collect available years from queues/vacations */
function collectYears(qMap,vMap){
  const y=today0().getFullYear(),yrs=new Set([-1,0,1,2].map(n=>y+n));
  Object.values(qMap).forEach(q=>(q||[]).forEach(j=>{
    const d=days[j.di||0];if(d)yrs.add(d.getFullYear());
    const de=days[Math.min((j.di||0)+daysFor(j.hours,j.hrsPerWeek)-1,days.length-1)];if(de)yrs.add(de.getFullYear());
  }));
  if(vMap)Object.values(vMap).forEach(vs=>(vs||[]).forEach(v=>{yrs.add(fromIso(v.startIso).getFullYear());yrs.add(fromIso(v.endIso).getFullYear())}));
  return[...yrs].sort();
}

/* ═══════════════════════════════════════════════
   SHARED GANTT BUILDERS (extracted from 3× duplication)
   ═══════════════════════════════════════════════ */
function computeMonthSpans(yearDays){
  const ms=[];
  yearDays.forEach((d,li)=>{const lbl=d.toLocaleDateString('en-US',{month:'short'});ms.length&&ms[ms.length-1].lbl===lbl?ms[ms.length-1].n++:ms.push({lbl,n:1,s:li})});
  return ms;
}
function computeWeekSpans(yearDays){
  const wk=[];
  yearDays.forEach((d,li)=>{d.getDay()===1||li===0?wk.push({s:li,n:1,mon:d}):wk.length&&wk[wk.length-1].n++});
  return wk;
}
function buildGanttHeader(yearDays,lTDi,cw,label){
  const ms=computeMonthSpans(yearDays),wk=computeWeekSpans(yearDays);
  const DL=['M','T','W','T','F'];
  let h='<div class="g-head"><div class="name-hd"><div class="name-hd-inner">'+label+'</div></div><div class="head-cols">';
  h+='<div class="months-row">'+ms.map(m=>'<div class="month-cell'+(lTDi>=m.s&&lTDi<m.s+m.n?' cur':'')+'" style="width:'+(m.n*cw)+'px;min-width:'+(m.n*cw)+'px">'+m.lbl+'</div>').join('')+'</div>';
  h+='<div class="weeks-row">'+wk.map(w=>{const fri=yearDays[Math.min(w.s+w.n-1,yearDays.length-1)];return'<div class="week-lbl'+(lTDi>=w.s&&lTDi<w.s+w.n?' cur':'')+'" style="width:'+(w.n*cw)+'px;min-width:'+(w.n*cw)+'px">'+w.mon.getDate()+'-'+fri.getDate()+'</div>'}).join('')+'</div>';
  h+='<div class="days-row">'+yearDays.map((d,li)=>'<div class="day-cell'+(li===lTDi?' cur':'')+(d.getDay()===5?' fri-end':'')+'" style="width:'+cw+'px;min-width:'+cw+'px">'+DL[d.getDay()-1]+'</div>').join('')+'</div>';
  return h+'</div></div></div>';
}

/* Build 7-day calendar header (for vacation view) */
function buildCalendarHeader(calDays,todayIdx,vcw){
  const ms=[],DL=['S','M','T','W','T','F','S'];
  calDays.forEach((d,li)=>{const lbl=d.toLocaleDateString('en-US',{month:'short'});ms.length&&ms[ms.length-1].lbl===lbl?ms[ms.length-1].n++:ms.push({lbl,n:1,s:li})});
  const wk=[];
  calDays.forEach((d,li)=>{d.getDay()===1||li===0?wk.push({s:li,n:1,mon:d}):wk.length&&wk[wk.length-1].n++});
  let h='<div class="g-head"><div class="name-hd"><div class="name-hd-inner">Person</div></div><div class="head-cols">';
  h+='<div class="months-row">'+ms.map(m=>'<div class="month-cell'+(todayIdx>=m.s&&todayIdx<m.s+m.n?' cur':'')+'" style="width:'+(m.n*vcw)+'px;min-width:'+(m.n*vcw)+'px">'+m.lbl+'</div>').join('')+'</div>';
  h+='<div class="weeks-row">'+wk.map(w=>{const last=calDays[Math.min(w.s+w.n-1,calDays.length-1)];return'<div class="week-lbl'+(todayIdx>=w.s&&todayIdx<w.s+w.n?' cur':'')+'" style="width:'+(w.n*vcw)+'px;min-width:'+(w.n*vcw)+'px">'+w.mon.getDate()+'-'+last.getDate()+'</div>'}).join('')+'</div>';
  h+='<div class="days-row">'+calDays.map((d,li)=>{
    const dow=d.getDay(),isWknd=dow===0||dow===6,isSun=dow===0;
    return'<div class="day-cell'+(li===todayIdx?' cur':'')+(isSun?' fri-end':'')+'" style="width:'+vcw+'px;min-width:'+vcw+'px;'+(isWknd?'background:#d8d5ce;color:#999;':'')+'">'+DL[dow]+'</div>';
  }).join('')+'</div>';
  return h+'</div></div></div>';
}

/* Assign jobs to tracks (shared across 3 renderers) */
function assignTracks(visQ){
  const tracks=[],jt={},grpT={};
  [...visQ].sort((a,b)=>(a.di||0)-(b.di||0)).forEach(j=>{
    const jdi=j.di||0,jE=jdi+daysFor(j.hours,j.hrsPerWeek)-1;
    if(j.groupId&&grpT[j.groupId]!==undefined){const t=grpT[j.groupId];if(tracks[t]===undefined||jE>tracks[t])tracks[t]=jE;jt[j.id]=t;return}
    let placed=false;
    for(let t=0;t<tracks.length;t++){if(jdi>tracks[t]){tracks[t]=jE;jt[j.id]=t;placed=true;if(j.groupId)grpT[j.groupId]=t;break}}
    if(!placed){tracks.push(jE);jt[j.id]=tracks.length-1;if(j.groupId)grpT[j.groupId]=tracks.length-1}
  });
  return{tracks,jt,grpT,nt:Math.max(1,tracks.length)};
}

/* Render grid cells for a lane */
function buildGridCells(yearDays,pid,lTDi,yOff,rh,cw,interactive){
  let h='';
  yearDays.forEach((d,li)=>{
    const isT=li===lTDi,isPast=li+yOff<todayDi,isFri=d.getDay()===5;
    h+='<div class="g-div'+(isT?' cur':'')+(isPast?' past':'')+(isFri?' fri':'')+'"'
      +(interactive?' id="dv-'+pid+'-'+(li+yOff)+'"':'')
      +' style="width:'+cw+'px;height:'+rh+'px">'
      +'</div>';
  });
  return h;
}

/* Render week separator lines */
function buildWeekSeps(yearDays,cw){
  let h='';
  yearDays.forEach((d,li)=>{if(li>0&&d.getDay()===1)h+='<div class="g-week-sep" style="left:'+(li*cw)+'px"></div>'});
  return h;
}

/* Render vacation bars (shared across 3 renderers) */
function buildVacBars(vacs,visQ,jt,yOff,yEnd,rh,cw,interactive){
  let h='';
  vacs.forEach(v=>{
    const vs=dateToDi(fromIso(v.startIso)),ve=dateToDi(fromIso(v.endIso));
    if(vs<0&&ve<0)return;
    const s2=Math.max(vs<0?0:vs,yOff),e2=Math.min(ve<0?days.length-1:ve,yEnd);
    if(s2>e2)return;
    const vacS=vs<0?0:vs,vacE=ve<0?days.length-1:ve;
    const overlapping=new Set();
    visQ.forEach(j=>{const jdi=j.di||0,jEnd=jdi+daysFor(j.hours,j.hrsPerWeek)-1;if(jdi<=vacE&&jEnd>=vacS)overlapping.add(jt[j.id]||0)});
    let vTop,vHeight;
    if(overlapping.size>0){const mn=Math.min(...overlapping),mx=Math.max(...overlapping);vTop=PP+mn*(PH+PG);vHeight=(mx-mn)*(PH+PG)+PH}
    else{vTop=1;vHeight=rh-2}
    h+='<div style="position:absolute;left:'+((s2-yOff)*cw+1)+'px;top:'+vTop+'px;width:'+((e2-s2+1)*cw-2)+'px;height:'+vHeight+'px;background:'+VAC_COLOR.bg+';border:1px solid '+VAC_COLOR.bdr+';border-radius:4px;z-index:1;display:flex;align-items:flex-start;padding:4px 6px;overflow:hidden;'+(interactive?'pointer-events:all':'pointer-events:none')+'">'
      +'<span style="font-size:10px;font-weight:700;color:'+VAC_COLOR.txt+';flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+sanitize(v.name)+(v.hoursPerDay!=null?' ('+v.hoursPerDay+'h)':' (All day)')+'</span>'
      +(interactive?'<button class="pill-btn" onclick="deleteVacation('+v.id+','+v.pid+')" style="flex-shrink:0;margin-left:4px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="'+VAC_COLOR.txt+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>':'')
      +'</div>';
  });
  return h;
}

/* Render a job pill */
function buildPill(j,pid,jt,grpH,cw,yOff,yEnd,pc,interactive){
  const jdi=j.di||0,len=daysFor(j.hours,j.hrsPerWeek);
  const cS=Math.max(jdi,yOff),cE=Math.min(jdi+len-1,yEnd);
  const lx=(cS-yOff)*cw+1,pw=(cE-cS+1)*cw-2;
  const track=jt[j.id]||0,y=PP+track*(PH+PG);
  const isGrp=!!j.groupId,isPend=!!j.pending;
  const dispH=isGrp?(j._origHours||grpH[j.groupId]||j.hours):j.hours;
  const endDay=days[Math.min(jdi+len-1,days.length-1)];
  const ifaEnd=endDay?'IFA Date: '+fmtShort(endDay):'';
  const ifaReq=j.ifaDate?'IFA Req: '+fmtShort(fromIso(j.ifaDate)):'';
  let pctDone=0;
  if(todayDi>=jdi+len)pctDone=100;else if(todayDi>jdi)pctDone=Math.min(100,Math.round(((todayDi-jdi)/len)*100));
  let h='<div class="g-pill"'+(interactive?' data-id="'+j.id+'" data-pid="'+pid+'" draggable="true" ondragstart="pillStart(event)" ondragend="pillEnd(event)"':'')
    +' style="left:'+lx+'px;top:'+y+'px;width:'+pw+'px;height:'+PH+'px;background:'+pc.bg+';border-left:3px solid '+pc.bdr+';border-right:3px solid '+pc.bdr+';border-top:1px solid rgba(0,0,0,.07);border-bottom:1px solid rgba(0,0,0,.07);'+(isGrp?'outline:2px dashed '+pc.bdr+';outline-offset:-2px;':'')+(interactive?'':'cursor:default;')+'">'
    +'<div style="display:flex;flex-direction:column;min-width:0;flex:1;overflow:hidden;gap:1px">'
    +'<span style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:'+pc.txt+'">'+(isPend?'⏳ ':'')+sanitize(j.name)+(isGrp?' (split)':'')+'</span>'
    +'<span style="font-size:10px;opacity:.9;white-space:nowrap;color:'+pc.txt+'">'+dispH+'h · '+(j.hrsPerWeek||40)+'h/wk'+(isPend?' · Pending':'')+'</span>'
    +(ifaReq||ifaEnd?'<span style="font-size:10px;font-weight:600;white-space:nowrap;color:'+pc.txt+'">'+(ifaReq||'')+(ifaReq&&ifaEnd?' · ':'')+ifaEnd+'</span>':'')
    +'</div>'
    +'<div style="display:flex;align-items:center;justify-content:center;flex-shrink:0;margin:0 4px">'
    +'<span style="font-size:13px;font-weight:800;color:'+pc.txt+'">'+pctDone+'%</span></div>';
  if(interactive){
    h+='<div class="pill-actions">'
      +'<button class="pill-btn" onclick="event.stopPropagation();openEdit('+j.id+','+pid+')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="'+pc.txt+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'
      +'<button class="pill-btn" onclick="event.stopPropagation();deleteJobGroup('+j.id+','+pid+')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="'+pc.txt+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button></div>';
  }
  return h+'</div>';
}

/* Branch header row for gantt */
function buildBranchHdrRow(bc,label,yearDays,lTDi,cw){
  let h='<div class="g-row" style="min-height:32px;background:'+bc.bg+';border-bottom:1.5px solid '+bc.bdr+'">'
    +'<div class="name-cell" style="cursor:default;background:'+bc.bg+';border-right:2px solid '+bc.bdr+';padding:6px 12px;justify-content:center">'
    +'<div style="font-size:13px;font-weight:700;color:'+bc.txt+';letter-spacing:.03em">'+label+'</div></div>'
    +'<div class="g-lane" style="height:32px;pointer-events:none">';
  yearDays.forEach((d,li)=>{
    h+='<div class="g-div'+(li===lTDi?' cur':'')+(d.getDay()===5?' fri':'')+'" style="width:'+cw+'px;height:32px;background:'+bc.bg+';opacity:.5"></div>';
  });
  return h+'</div></div>';
}

/* Scroll gantt to today */
function scrollGanttToToday(outer,yr,cw){
  if(!outer||todayDi<0||outer._scrolled)return;
  if(yr===today0().getFullYear()){
    const yOff=days.findIndex(d=>d.getFullYear()===yr);
    outer.scrollLeft=Math.max(0,165+(todayDi-Math.max(0,yOff))*cw-outer.clientWidth/2);
  }
  outer._scrolled=true;
}

/* Year tabs HTML */
function yearTabsHTML(availYrs,activeYr,onclick){
  return availYrs.map(yr=>'<button class="year-tab'+(yr===activeYr?' active':'')+'" onclick="'+onclick+'('+yr+')">'+yr+'</button>').join('');
}

/* ═══════════════════════════════════════════════
   RENDER VACATION CALENDAR
   ═══════════════════════════════════════════════ */
function renderVacCalendar(){
  days=buildDays();todayDi=getTDi(days);
  updateVacSelect();updateOtSelect();updateVacTypeVisibility();renderCalendarPeopleList();renderVacHoursTracker();
  const VCW=20,VPH=36,VPP=6;
  const y0=today0().getFullYear(),yrs=new Set([-1,0,1,2].map(n=>y0+n));
  BRANCHES.forEach(br=>{Object.values(branchData[br.id].vacations).forEach(vs=>(vs||[]).forEach(v=>{yrs.add(fromIso(v.startIso).getFullYear());yrs.add(fromIso(v.endIso).getFullYear())}))});
  Object.values(calendarVacations).forEach(vs=>(vs||[]).forEach(v=>{yrs.add(fromIso(v.startIso).getFullYear());yrs.add(fromIso(v.endIso).getFullYear())}));
  $('vacYearTabs').innerHTML=yearTabsHTML([...yrs].sort(),vacViewYear,'setVacViewYear');

  const calDays=[];let cd=new Date(vacViewYear,0,1);cd.setHours(0,0,0,0);const calEnd=new Date(vacViewYear,11,31);
  while(cd<=calEnd){calDays.push(new Date(cd));cd=addDays(cd,1)}
  const todayStr=iso(today0()),todayIdx=calDays.findIndex(d=>iso(d)===todayStr);
  function calDi(d){const s=iso(d);return calDays.findIndex(x=>iso(x)===s)}

  let svgH='<svg width="0" height="0" style="position:absolute"><defs><pattern id="wkndHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="rgba(0,0,0,.03)"/><line x1="0" y1="0" x2="0" y2="6" stroke="rgba(0,0,0,.10)" stroke-width="1.5"/></pattern></defs></svg>';
  let h=svgH+buildCalendarHeader(calDays,todayIdx,VCW);
  let b='<div class="g-body">'+(todayIdx>=0?'<div class="today-line" style="left:'+(165+todayIdx*VCW+VCW/2)+'px"></div>':'');let anyRows=false;

  function renderVacRow(pName,vacs,source,pid,pType){
    const visVacs=vacs.filter(v=>{const vs=calDi(fromIso(v.startIso)),ve=calDi(fromIso(v.endIso));return vs<calDays.length&&ve>=0});
    if(!visVacs.length)return'';
    const rh=VPP+VPH+VPP,key=source+':'+pid,used=getVacHoursUsed(vacs),total=vacHoursAllowance[key]||0;
    const remaining=total-used,overBudget=total>0&&remaining<0;
    const hrsColor=overBudget?'#ef4444':total>0&&remaining<total*.2?'#f59e0b':'var(--text-muted)';
    const hrsText=total>0?used+'/'+total+'h':used+'h';
    const isDirect=(pType||'direct')==='direct';
    let r='<div class="g-row" style="min-height:'+rh+'px">'
      +'<div class="name-cell" style="cursor:default;padding:4px 10px">'
      +'<div class="nn" style="font-size:12px">'+sanitize(pName)+'<span class="'+(isDirect?'badge-d':'badge-c')+'">'+(isDirect?'D':'C')+'</span></div>'
      +'<div class="ns mono" style="font-size:10px;color:'+hrsColor+';font-weight:600">'+hrsText+'</div></div>';
    r+='<div class="g-lane" style="height:'+rh+'px">';
    const otKey=source+':'+pid,otDates=new Set(overtimeData[otKey]||[]);
    calDays.forEach((d,li)=>{
      const isT=li===todayIdx,isPast=li<todayIdx,dow=d.getDay(),isWknd=dow===0||dow===6,isSun=dow===0,isOT=otDates.has(iso(d));
      r+='<div class="g-div'+(isT?' cur':'')+(isPast?' past':'')+(isSun?' fri':'')+'" style="width:'+VCW+'px;height:'+rh+'px">'
        +(isWknd&&!isOT?'<svg width="'+VCW+'" height="'+rh+'" style="position:absolute;top:0;left:0;pointer-events:none"><rect width="'+VCW+'" height="'+rh+'" fill="url(#wkndHatch)"/></svg>':'')
        +(isOT?'<div style="position:absolute;top:0;left:0;width:'+VCW+'px;height:'+rh+'px;background:rgba(185,28,28,.25);pointer-events:none"></div>'
          +'<button onclick="deleteOvertime(\''+otKey+'\',\''+iso(d)+'\')" style="position:absolute;top:2px;left:50%;transform:translateX(-50%);width:14px;height:14px;background:rgba(185,28,28,.7);color:#fff;border:none;border-radius:50%;font-size:9px;line-height:1;cursor:pointer;z-index:4;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .15s;pointer-events:all" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0">×</button>':'')
        +'</div>';
    });
    calDays.forEach((d,li)=>{if(li>0&&d.getDay()===1)r+='<div class="g-week-sep" style="left:'+(li*VCW)+'px"></div>'});
    visVacs.forEach(v=>{
      const vs=Math.max(0,calDi(fromIso(v.startIso))),ve=Math.min(calDays.length-1,calDi(fromIso(v.endIso)));
      if(vs>ve)return;
      r+='<div style="position:absolute;left:'+(vs*VCW+1)+'px;top:'+VPP+'px;width:'+((ve-vs+1)*VCW-2)+'px;height:'+VPH+'px;background:'+VAC_COLOR.bg+';border:1.5px solid '+VAC_COLOR.bdr+';border-radius:3px;z-index:2;display:flex;align-items:center;padding:0 4px;overflow:hidden">'
        +'<div style="display:flex;flex-direction:column;min-width:0;flex:1;overflow:hidden">'
        +'<span style="font-size:10px;font-weight:700;color:'+VAC_COLOR.txt+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+sanitize(v.name)+(v.hoursPerDay!=null?' ('+v.hoursPerDay+'h)':' (All day)')+'</span>'
        +'<span style="font-size:8px;color:'+VAC_COLOR.txt+';opacity:.8;white-space:nowrap">'+fmtShort(fromIso(v.startIso))+' – '+fmtShort(fromIso(v.endIso))+'</span></div>'
        +'<button onclick="deleteVacFromCalendar(\''+source+'\','+pid+','+v.id+')" style="flex-shrink:0;margin-left:2px;background:none;border:none;cursor:pointer;padding:1px;opacity:.5;display:flex;align-items:center" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.5">'
        +'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="'+VAC_COLOR.txt+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button></div>';
    });
    return r+'</div></div>';
  }

  function calGroupHdr(label,bg,txt,bdr){
    return'<div class="g-row" style="min-height:24px;background:'+bg+';border-bottom:1.5px solid '+bdr+'"><div class="name-cell" style="cursor:default;background:'+bg+';border-right:2px solid '+bdr+';padding:4px 10px;justify-content:center"><div style="font-size:11px;font-weight:700;color:'+txt+';letter-spacing:.03em">'+label+'</div></div>'
      +'<div class="g-lane" style="height:24px;pointer-events:none">'+calDays.map((d,li)=>'<div class="g-div'+(li===todayIdx?' cur':'')+(d.getDay()===0?' fri':'')+'" style="width:'+VCW+'px;height:24px;background:'+bg+';opacity:.5"></div>').join('')+'</div></div>';
  }

  const allVacPeople=[];
  BRANCHES.forEach(br=>{const bd=branchData[br.id];
    bd.people.filter(p=>p.id!==0&&(bd.vacations[p.id]||[]).some(v=>{const vs=calDi(fromIso(v.startIso)),ve=calDi(fromIso(v.endIso));return vs<calDays.length&&ve>=0})).forEach(p=>allVacPeople.push({name:p.name,vacs:bd.vacations[p.id]||[],source:br.id,pid:p.id,type:p.type||'direct'}))});
  calendarPeople.filter(p=>(calendarVacations[p.id]||[]).some(v=>{const vs=calDi(fromIso(v.startIso)),ve=calDi(fromIso(v.endIso));return vs<calDays.length&&ve>=0})).forEach(p=>allVacPeople.push({name:p.name,vacs:calendarVacations[p.id]||[],source:'cal',pid:p.id,type:p.type||'direct'}));
  allVacPeople.sort((a,b)=>lastName(a.name).localeCompare(lastName(b.name)));
  const directP=allVacPeople.filter(p=>p.type==='direct'),contractP=allVacPeople.filter(p=>p.type!=='direct');

  if(directP.length){anyRows=true;b+=calGroupHdr('Direct','#dbeafe','#1d4ed8','#93c5fd');directP.forEach(p=>b+=renderVacRow(p.name,p.vacs,p.source,p.pid,p.type))}
  if(contractP.length){anyRows=true;b+=calGroupHdr('Contractor','#fef9c3','#a16207','#fde047');contractP.forEach(p=>b+=renderVacRow(p.name,p.vacs,p.source,p.pid,p.type))}
  if(!anyRows)b+='<div style="text-align:center;padding:3rem;color:var(--text-muted);font-size:14px">No vacations scheduled for '+vacViewYear+'.</div>';
  $('vacGantt').innerHTML=h+b+'</div>';
  const o=$('vacGanttOuter');
  if(o&&todayIdx>=0&&!o._scrolled){if(vacViewYear===today0().getFullYear())o.scrollLeft=Math.max(0,165+todayIdx*VCW-o.clientWidth/2);o._scrolled=true}
}

/* ═══════════════════════════════════════════════
   MASTER VIEW
   ═══════════════════════════════════════════════ */
function setMasterFilter(f){masterFilter=f;renderMaster()}
function setMasterFocusJob(normName){
  masterFocusJob=normName===null?null:(masterFocusJob===normName?null:normName);
  const o=$('masterGanttOuter');if(o)o._scrolled=false;renderMaster();renderMasterTimeline();
}
function setMasterViewYear(y){masterViewYear=y;const o=$('masterGanttOuter');if(o)o._scrolled=false;renderMasterTimeline()}
function completeJob(normName,e){
  if(e)e.stopPropagation();
  let dispName=normName;
  for(const b of BRANCHES)for(const pid of Object.keys(branchData[b.id].queues)){const j=(branchData[b.id].queues[pid]||[]).find(j=>normJob(j.name)===normName);if(j){dispName=j.name;break}}
  showConfirm('Mark "'+dispName+'" as complete? It will be moved to the completed list.',()=>{
    completedJobs.add(normName);saveCompletedJobs();
    auditLog('job_completed',{normName,displayName:dispName});
    if(masterFocusJob===normName){masterFocusJob=null;renderMasterTimeline()}
    renderMaster();toast('Job marked complete.','ok');
  });
}
function uncompleteJob(normName){
  completedJobs.delete(normName);saveCompletedJobs();
  auditLog('job_uncompleted',{normName});
  renderMaster();
}

function renderMaster(){
  const tempDays=buildDays();
  function fmt(d){return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
  function branchJobDates(bid){
    const map={};
    (branchData[bid].people||[]).filter(p=>p.id!==0).forEach(p=>(branchData[bid].queues[p.id]||[]).forEach(j=>{
      const ed=tempDays[Math.min((j.di||0)+daysFor(j.hours,j.hrsPerWeek)-1,tempDays.length-1)];if(!ed)return;
      const k=normJob(j.name);if(!map[k]||ed>map[k].date)map[k]={date:ed,origName:j.name,ifaDate:j.ifaDate||null};
    }));return map;
  }
  const pipingMap=branchJobDates('piping'),civilMap=branchJobDates('civil'),ieMap=branchJobDates('ie');
  const allNames=new Set([...Object.keys(pipingMap),...Object.keys(civilMap),...Object.keys(ieMap)]);
  if(!allNames.size){$('masterContent').innerHTML='<div style="text-align:center;padding:3rem;color:var(--text-muted);font-size:14px">No jobs found. Add jobs in the Piping, Civil, or I&E tabs.</div>';return}

  const bC=BRANCH_COLORS,rows=[],cutoff=new Date(today0());cutoff.setDate(cutoff.getDate()-30);
  allNames.forEach(name=>{
    const p=pipingMap[name],cv=civilMap[name],ie=ieMap[name];
    const dates=[p,cv,ie].filter(Boolean).map(x=>x.date);if(!dates.length)return;
    const latest=dates.reduce((a,b)=>b>a?b:a);if(latest<cutoff)return;
    rows.push({norm:name,origName:(p||cv||ie).origName,latest,p:p||null,cv:cv||null,ie:ie||null,done:completedJobs.has(name)});
  });
  rows.sort((a,b)=>a.latest-b.latest);
  const activeRows=rows.filter(r=>!r.done),doneRows=rows.filter(r=>r.done);

  function cellHtml(entry,bid,r){
    if(!entry)return'<td><span class="master-none">not assigned</span></td>';
    const bc=bC[bid],isLatest=entry.date.getTime()===r.latest.getTime();
    return'<td><div style="display:inline-block;background:'+bc.bg+';border:1px solid '+bc.bdr+';color:'+bc.txt+';font-size:13px;font-weight:'+(isLatest?800:600)+';padding:4px 10px;border-radius:6px" class="mono">'+fmt(entry.date)+'</div>'
      +(entry.ifaDate?'<div style="font-size:11px;color:var(--text-muted);margin-top:3px">IFA Req: '+fmtShort(fromIso(entry.ifaDate))+'</div>':'')+'</td>';
  }

  let html='<div class="card" style="padding:0;overflow:hidden"><table class="master-table"><thead><tr>'
    +'<th>Job Name</th><th>Latest Finish</th><th style="color:#1d4ed8">Piping</th><th style="color:#15803d">Civil</th><th style="color:#a16207">I&amp;E</th>'
    +(currentRole==='lead'?'<th></th>':'')+'</tr></thead><tbody>';
  activeRows.forEach(r=>{
    const isSel=masterFocusJob===r.norm,esc=r.norm.replace(/'/g,"\\'");
    html+='<tr onclick="setMasterFocusJob(\''+esc+'\')" style="cursor:pointer;'+(isSel?'background:#eef4ff;box-shadow:inset 3px 0 0 var(--blue);':'')+'">'
      +'<td><div class="master-job-name" style="'+(isSel?'color:var(--blue);font-weight:700;':'')+'">'+sanitize(r.origName)+'</div></td>'
      +'<td><div style="display:inline-block;background:#004f9f;border:1px solid #003d7a;color:#fff;font-size:13px;font-weight:700;padding:4px 10px;border-radius:6px" class="mono">'+fmt(r.latest)+'</div></td>'
      +cellHtml(r.p,'piping',r)+cellHtml(r.cv,'civil',r)+cellHtml(r.ie,'ie',r)
      +(currentRole==='lead'?'<td style="text-align:center"><button onclick="completeJob(\''+esc+'\',event)" style="background:#dcfce7;color:#15803d;border:1px solid #86efac;border-radius:5px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font);white-space:nowrap">Completed</button></td>':'')+'</tr>';
  });
  if(!activeRows.length)html+='<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted);font-size:13px">All jobs completed or older than 30 days.</td></tr>';
  html+='</tbody></table></div>';
  if(doneRows.length){
    html+='<div style="margin-top:12px"><div onclick="$(\'completedList\').classList.toggle(\'hidden\')" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;padding:4px 0"><span>&#9660;</span> Completed ('+doneRows.length+')</div>'
      +'<div id="completedList" class="hidden"><div class="card" style="padding:0;overflow:hidden;margin-top:8px;opacity:.7"><table class="master-table"><tbody>';
    doneRows.forEach(r=>{
      const esc=r.norm.replace(/'/g,"\\'");
      html+='<tr style="background:#f9fdf9"><td><div class="master-job-name" style="text-decoration:line-through;color:var(--text-muted)">'+sanitize(r.origName)+'</div></td>'
        +'<td><div style="display:inline-block;background:#86efac;border:1px solid #4ade80;color:#15803d;font-size:13px;font-weight:700;padding:4px 10px;border-radius:6px" class="mono">'+fmt(r.latest)+'</div></td>'
        +cellHtml(r.p,'piping',r)+cellHtml(r.cv,'civil',r)+cellHtml(r.ie,'ie',r)
        +(currentRole==='lead'?'<td style="text-align:center"><button onclick="uncompleteJob(\''+esc+'\')" class="btn-warn" style="white-space:nowrap">Undo</button></td>':'')+'</tr>';
    });
    html+='</tbody></table></div></div></div>';
  }
  $('masterContent').innerHTML=html;
}

/* ═══════════════════════════════════════════════
   MASTER TIMELINE
   ═══════════════════════════════════════════════ */
function renderMasterTimeline(){
  const wrap=$('masterTimelineWrap');
  if(!masterFocusJob){if(wrap)wrap.style.display='none';$('masterGantt').innerHTML='';return}
  if(wrap)wrap.style.display='';
  days=buildDays();todayDi=getTDi(days);

  // focus label
  let dispName=masterFocusJob;
  for(const b of BRANCHES)for(const pid of Object.keys(branchData[b.id].queues)){const j=(branchData[b.id].queues[pid]||[]).find(j=>normJob(j.name)===masterFocusJob);if(j){dispName=j.name;break}}
  $('masterFocusLabel').innerHTML='<span style="display:inline-flex;align-items:center;gap:6px;background:#eef4ff;border:1.5px solid var(--blue);color:var(--blue);font-size:12px;font-weight:700;padding:3px 10px;border-radius:6px">'+sanitize(dispName)+'<span onclick="setMasterFocusJob(null)" style="cursor:pointer;opacity:.6;font-size:14px;line-height:1" title="Clear filter">&times;</span></span>';

  // year tabs
  const y=today0().getFullYear(),yrs=new Set([-1,0,1,2].map(n=>y+n));
  BRANCHES.forEach(br=>{Object.values(branchData[br.id].queues).forEach(q=>(q||[]).forEach(j=>{
    if(normJob(j.name)!==masterFocusJob)return;
    const d=days[j.di||0];if(d)yrs.add(d.getFullYear());
    const de=days[Math.min((j.di||0)+daysFor(j.hours,j.hrsPerWeek)-1,days.length-1)];if(de)yrs.add(de.getFullYear());
  }))});
  $('masterYearTabs').innerHTML=yearTabsHTML([...yrs].sort(),masterViewYear,'setMasterViewYear');

  const yearDays=days.filter(d=>d.getFullYear()===masterViewYear);
  if(!yearDays.length){$('masterGantt').innerHTML='';return}
  const yOff=days.indexOf(yearDays[0]),yEnd=yOff+yearDays.length-1;
  const lTDi=todayDi>=yOff&&todayDi<yOff+yearDays.length?todayDi-yOff:-1;

  let h=buildGanttHeader(yearDays,lTDi,CW,'Crew member');
  let b='<div class="g-body">'+(lTDi>=0?'<div class="today-line" style="left:'+(165+lTDi*CW+CW/2)+'px"></div>':'');

  BRANCHES.forEach(br=>{
    const bd=branchData[br.id],bc=BRANCH_COLORS[br.id];
    const pWithJob=bd.people.filter(p=>(bd.queues[p.id]||[]).some(j=>normJob(j.name)===masterFocusJob));
    if(!pWithJob.length)return;
    b+=buildBranchHdrRow(bc,br.label,yearDays,lTDi,CW);

    pWithJob.forEach(p=>{
      const pid=p.id,c=getColorForBranch(pid,bd),q=bd.queues[pid]||[],vacs=bd.vacations[pid]||[];
      const visQ=q.filter(j=>normJob(j.name)===masterFocusJob&&(j.di||0)+daysFor(j.hours,j.hrsPerWeek)-1>=yOff&&(j.di||0)<=yEnd);
      const grpH={};visQ.forEach(j=>{if(j.groupId)grpH[j.groupId]=(grpH[j.groupId]||0)+j.hours});
      const{jt,nt}=assignTracks(visQ);
      const rh=PP+nt*(PH+PG)-PG+PP,isHVE=pid===0;
      b+='<div class="g-row" style="min-height:'+rh+'px;'+(isHVE?'background:#fffbeb;':'')+'">'
        +'<div class="name-cell" style="cursor:default;'+(isHVE?'background:#fef9c3;':'')+'">'
        +'<div class="nn" style="'+(isHVE?'color:#92400e;':'')+'">'+sanitize(p.name)+'</div>'
        +'<div class="ns" style="font-size:10px;color:'+bc.txt+'">'+sanitize(br.label)+'</div></div>';
      b+='<div class="g-lane" style="height:'+rh+'px;pointer-events:none">';
      b+=buildGridCells(yearDays,pid,lTDi,yOff,rh,CW,false);
      b+=buildWeekSeps(yearDays,CW);
      b+=buildVacBars(vacs,visQ,jt,yOff,yEnd,rh,CW,false);
      visQ.forEach(j=>{const pc=j.pending?PENDING_COLOR:c;b+=buildPill(j,pid,jt,grpH,CW,yOff,yEnd,pc,false)});
      b+='</div></div>';
    });
  });
  $('masterGantt').innerHTML=h+b+'</div>';
  scrollGanttToToday($('masterGanttOuter'),masterViewYear,CW);
}

/* ═══════════════════════════════════════════════
   STATS
   ═══════════════════════════════════════════════ */
function renderStats(){
  const yr=viewYear,yS=new Date(yr,0,1),yE=new Date(yr,11,31);
  function yrStats(q){
    const js=q.filter(j=>{const a=days[j.di||0],b=days[Math.min((j.di||0)+daysFor(j.hours,j.hrsPerWeek)-1,days.length-1)];return a&&b&&a<=yE&&b>=yS});
    return{jobs:js.length,hrs:js.reduce((s,j)=>s+j.hours,0)};
  }
  const hveStats=yrStats(queues[0]||[]),isHVEFocus=focusPid===0,isCrewFocus=focusPid!==null&&focusPid!==0;
  const crew=people.filter(p=>p.id!==0);
  $('statHVE').style.display=isCrewFocus?'none':'';
  $('statHVElbl').textContent=yr+' HVE Man Hours';$('sHVE').textContent=hveStats.hrs.toLocaleString();
  $('sHVEn').textContent=hveStats.jobs+' job'+(hveStats.jobs!==1?'s':'')+' in '+yr;
  $('statHVE').className='stat'+(isHVEFocus?' selected':'');
  $('statTH').style.display=isHVEFocus?'none':'';
  if(isHVEFocus){
    $('sTJ').textContent=hveStats.jobs;$('statTJlbl').textContent=yr+' HVE Jobs';$('sTJn').textContent='in '+yr;$('statTJ').className='stat selected';
  } else if(isCrewFocus){
    const fp=people.find(p=>p.id===focusPid),fs=yrStats(queues[focusPid]||[]);
    $('sTJ').textContent=fs.jobs;$('statTJlbl').textContent=yr+' Jobs';$('sTJn').textContent=(fp?.name||'')+' in '+yr;
    $('sTH').textContent=fs.hrs.toLocaleString();$('statTHlbl').textContent=yr+' Man Hours';$('sTHn').textContent=(fp?.name||'')+' in '+yr;
    $('statTJ').className='stat selected';$('statTH').className='stat selected';
  } else {
    const tot=crew.reduce((s,p)=>{const ps=yrStats(queues[p.id]||[]);return{jobs:s.jobs+ps.jobs,hrs:s.hrs+ps.hrs}},{jobs:0,hrs:0});
    $('sTJ').textContent=tot.jobs;$('statTJlbl').textContent=yr+' Total Jobs';$('sTJn').textContent='crew only · '+yr;
    $('sTH').textContent=tot.hrs.toLocaleString();$('statTHlbl').textContent=yr+' Total Man Hours';$('sTHn').textContent='crew only · '+yr;
    $('statTJ').className='stat';$('statTH').className='stat';
  }
}

/* ═══════════════════════════════════════════════
   MAIN GANTT RENDER
   ═══════════════════════════════════════════════ */
function render(){
  days=buildDays();todayDi=getTDi(days);renderStats();
  $('yearTabs').innerHTML=yearTabsHTML(collectYears(queues,vacations),viewYear,'setViewYear');
  const yearDays=days.filter(d=>d.getFullYear()===viewYear);
  if(!yearDays.length){$('gantt').innerHTML='';return}
  const yOff=days.indexOf(yearDays[0]),yEnd=yOff+yearDays.length-1;
  const lTDi=todayDi>=yOff&&todayDi<yOff+yearDays.length?todayDi-yOff:-1;

  let h=buildGanttHeader(yearDays,lTDi,CW,'Crew member');
  let b='<div class="g-body">'+(lTDi>=0?'<div class="today-line" style="left:'+(165+lTDi*CW+CW/2)+'px"></div>':'');
  if(!people.length)b+='<div style="text-align:center;padding:3rem;color:var(--text-muted)">Add a crew member to get started.</div>';
  else people.forEach(p=>{
    const pid=p.id,c=getColor(pid),q=queues[pid]||[],vacs=vacations[pid]||[];
    const isDim=focusPid!==null&&focusPid!==pid,isFocus=focusPid===pid;
    const visQ=q.filter(j=>{const jdi=j.di||0;return jdi+daysFor(j.hours,j.hrsPerWeek)-1>=yOff&&jdi<=yEnd});
    const grpH={};visQ.forEach(j=>{if(j.groupId)grpH[j.groupId]=(grpH[j.groupId]||0)+j.hours});
    const{jt,nt}=assignTracks(visQ);
    const rh=PP+nt*(PH+PG)-PG+PP;
    const todayJ=q.filter(j=>{const jdi=j.di||0;return jdi<=todayDi&&jdi+daysFor(j.hours,j.hrsPerWeek)-1>=todayDi});
    const nextJ=q.filter(j=>(j.di||0)>=todayDi).sort((a,b)=>(a.di||0)-(b.di||0))[0];
    const sub=todayJ.length?todayJ.map(j=>(Number(j.hrsPerWeek)||40)+'h/wk').join(' · '):(nextJ?(Number(nextJ.hrsPerWeek)||40)+'h/wk':'no jobs');
    const cnt=todayJ.length?todayJ.length+' job'+(todayJ.length!==1?'s':'')+' today':'';
    const isHVE=pid===0;
    b+='<div class="g-row" data-pid="'+pid+'" style="min-height:'+rh+'px;'+(isDim?'opacity:.3;':'')+(isHVE?'background:#fffbeb;':'')+'">'
      +'<div class="name-cell" onclick="focusPerson('+pid+')" style="'+(isHVE?'background:#fef9c3;':isFocus?'background:#eef4ff;':'')+'">'
      +'<div class="nn" style="'+(isHVE?'color:#92400e;':isFocus?'color:'+c.txt+';':'')+'">'+sanitize(p.name)+'</div>'
      +'<div class="ns" style="'+(isHVE?'color:#a16207;':'')+'">'+sanitize(sub)+(cnt?' · '+sanitize(cnt):'')+'</div></div>';
    b+='<div class="g-lane" id="ln'+pid+'" style="height:'+rh+'px" ondragover="laneOver(event,'+pid+')" ondragleave="laneLeave(event,'+pid+')" ondrop="laneDrop(event,'+pid+')">';
    b+=buildGridCells(yearDays,pid,lTDi,yOff,rh,CW,true);
    b+=buildWeekSeps(yearDays,CW);
    b+=buildVacBars(vacs,visQ,jt,yOff,yEnd,rh,CW,true);
    visQ.forEach(j=>{const pc=j.pending?PENDING_COLOR:c;b+=buildPill(j,pid,jt,grpH,CW,yOff,yEnd,pc,true)});
    b+='</div></div>';
  });
  $('gantt').innerHTML=h+b+'</div>';
  scrollGanttToToday(document.querySelector('.gantt-outer'),viewYear,CW);
}
function setViewYear(y){viewYear=y;const o=document.querySelector('.gantt-outer');if(o)o._scrolled=false;render()}

/* ═══════════════════════════════════════════════
   DRAG & DROP
   ═══════════════════════════════════════════════ */
function pillStart(e){
  if(currentRole==='designer'){e.preventDefault();return}
  const el=e.currentTarget,id=Number(el.dataset.id),pid=Number(el.dataset.pid);
  const job=(queues[pid]||[]).find(j=>j.id===id);if(!job)return;
  let dragH=job.hours;
  if(job.groupId){const pcs=(queues[pid]||[]).filter(j=>j.groupId===job.groupId);dragH=job._origHours||pcs.reduce((s,j)=>s+j.hours,0)}
  const rect=el.getBoundingClientRect();
  drag={id,pid,di:job.di||0,hours:dragH,hrsPerWeek:job.hrsPerWeek,ifaDate:job.ifaDate,name:job.name,groupId:job.groupId,pending:!!job.pending,offDi:Math.floor((e.clientX-rect.left)/CW)};
  e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(id));
  const c=getColor(pid),g=$('dg');g.textContent=job.name;g.style.background=c.bg;g.style.color=c.txt;g.style.display='block';
  e.dataTransfer.setDragImage(g,40,12);setTimeout(()=>el.classList.add('dragging'),0);
}
function pillEnd(e){e.currentTarget.classList.remove('dragging');clearHL();drag=null;stopEdgeScroll()}
function getHoverDi(e,pid){
  const lane=$('ln'+pid);if(!lane)return 0;const rect=lane.getBoundingClientRect();
  const yOff=days.findIndex(d=>d.getFullYear()===viewYear),yLen=days.filter(d=>d.getFullYear()===viewYear).length;
  return yOff+Math.max(0,Math.min(Math.floor((e.clientX-rect.left)/CW),yLen-1));
}
function laneOver(e,pid){
  if(!drag)return;e.preventDefault();
  const sw=Math.max(minDi(),getHoverDi(e,pid)-(drag.offDi||0));clearHL();
  for(let i=0;i<daysFor(drag.hours,drag.hrsPerWeek);i++){const el=$('dv-'+pid+'-'+(sw+i));if(el)el.classList.add('do')}
}
function laneLeave(e,pid){const l=$('ln'+pid);if(!l||!e.relatedTarget||!l.contains(e.relatedTarget))clearHL()}
function laneDrop(e,pid){
  e.preventDefault();if(!drag)return;
  const sw=Math.max(minDi(),getHoverDi(e,pid)-(drag.offDi||0));
  if(drag.groupId){
    const pieces=(queues[drag.pid]||[]).filter(j=>j.groupId===drag.groupId).sort((a,b)=>(a.di||0)-(b.di||0));
    const firstId=pieces.length?pieces[0].id:drag.id;
    mergeSplitGroup(drag.groupId,drag.pid);
    queues[drag.pid]=(queues[drag.pid]||[]).filter(j=>j.id!==firstId);
    if(!queues[pid])queues[pid]=[];
    queues[pid].push({id:firstId,name:drag.name,hours:drag.hours,hrsPerWeek:drag.hrsPerWeek,ifaDate:drag.ifaDate,di:sw,pid,pending:drag.pending});
  } else {
    (queues[drag.pid]||[]).forEach(j=>{if(j.id===drag.id){delete j.groupId;delete j._origHours}});
    queues[drag.pid]=(queues[drag.pid]||[]).filter(j=>j.id!==drag.id);
    if(!queues[pid])queues[pid]=[];
    queues[pid].push({id:drag.id,name:drag.name,hours:drag.hours,hrsPerWeek:drag.hrsPerWeek,ifaDate:drag.ifaDate,di:sw,pid,pending:drag.pending});
  }
  queues[pid].sort((a,b)=>(a.di||0)-(b.di||0));applySplits(pid);
  if(drag.pid!==pid)toast('Moved "'+drag.name+'" to '+people.find(p=>p.id===pid)?.name+'.','ok');
  auditLog('job_moved',{branch:activeBranch,name:drag.name,fromPid:drag.pid,toPid:pid,newDi:sw});
  clearHL();drag=null;saveData();render();
}
function clearHL(){document.querySelectorAll('.do').forEach(el=>el.classList.remove('do'))}
var _esT=null;
function stopEdgeScroll(){if(_esT){clearInterval(_esT);_esT=null}}
function startEdgeScroll(o,dir){stopEdgeScroll();_esT=setInterval(()=>{if(!drag){stopEdgeScroll();return}o.scrollLeft+=dir*20},16)}
