// Q2 rate tracker. Three views, Q2 only:
//   1) Rolling 4 weeks: menus charged a different effective adjustment than the Q2 update file.
//   2) Count of menus by effective-rate bucket (0.5%), per week.
//   3) GMV by effective-rate bucket (0.5%), per week.
// Effective rate of a menu in a week = commission(ex-VAT) / GMV over its Delivery orders.
const fs = require('fs');
const path = require('path');
const { discoverWeeks } = require('C:\\Users\\Trist\\Documents\\Claude\\projects\\Platform-weekly-dashboard\\scripts\\weeks.js');
const ExcelJS = require('C:\\Users\\Trist\\Documents\\Claude\\projects\\Platform-weekly-dashboard\\node_modules\\exceljs');

const OUT = path.join(__dirname, '..', '04_analysis');
const REPORTS = path.join(__dirname, '..', '05_reports');
const Q2_START = '2026-04-01';
const ADJ_TOL = 0.05; // pts tolerance for "matches the Q2 update file"

const BANDS=[[12,32.59],[14,31.59],[16,30.00],[18,28.78],[20,27.82],[22,27.04],[24,26.40],[26,25.86],[Infinity,25.62]];
const headlineFor=v=>{for(const[m,r]of BANDS)if(v<m)return r;return 25.62;};

function parseCSV(t){const rows=[];let row=[],f='',i=0,q=false;while(i<t.length){const c=t[i];
 if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i+=2;continue;}q=false;i++;continue;}f+=c;i++;continue;}
 if(c==='"'){q=true;i++;continue;}if(c===','){row.push(f);f='';i++;continue;}
 if(c==='\r'){i++;continue;}if(c==='\n'){row.push(f);rows.push(row);row=[];f='';i++;continue;}f+=c;i++;}
 if(f.length||row.length){row.push(f);rows.push(row);}return rows;}
const num=v=>{if(v===''||v==null)return 0;const n=parseFloat(String(v).replace(/[, £]/g,''));return isNaN(n)?0:n;};
const parseRate=s=>{const m=String(s||'').match(/(-?\d+(?:\.\d+)?)\s*%/);return m?parseFloat(m[1]):null;};
const norm=s=>String(s||'').trim().replace(/\s+/g,' ').toLowerCase();
// canonical join key: tolerant of spacing/punctuation/&-and differences between the
// update file and the weekly statements (e.g. "Wing Drop" vs "WingDrop", "@" vs "-").
const canon=s=>String(s||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'');
function lev(a,b){const m=a.length,n=b.length;if(!m)return n;if(!n)return m;const d=Array.from({length:n+1},(_,j)=>j);
  for(let i=1;i<=m;i++){let p=d[0];d[0]=i;for(let j=1;j<=n;j++){const t=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,p+(a[i-1]===b[j-1]?0:1));p=t;}}return d[n];}
const sim=(a,b)=>{const L=Math.max(a.length,b.length);return L?1-lev(a,b)/L:1;};
const r2=n=>Math.round(n*100)/100;
const mode=list=>{const m=new Map();for(const a of list){const k=a.toFixed(2);m.set(k,(m.get(k)||0)+1);}let b=null,bn=-1;for(const[k,n]of m)if(n>bn){bn=n;b=parseFloat(k);}return b;};
const csvCell=v=>{const s=String(v==null?'':v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
const writeCsv=(file,cols,rows)=>{const out=[cols.join(',')];for(const r of rows)out.push(cols.map(c=>csvCell(r[c])).join(','));fs.writeFileSync(path.join(OUT,file),out.join('\n'));};

// agreed Q2 adjustment per site (from the validated Q2 update / Commission Output)
const agreed={};
{ const rows=parseCSV(fs.readFileSync(path.join(OUT,'Q2_existing-sites_BY-SITE.csv'),'utf8'));
  const h=rows[0].map(x=>x.replace(/^﻿/,'')); const iS=h.indexOf('Site'),iA=h.indexOf('NetAdjustment');
  for(let r=1;r<rows.length;r++){if(rows[r].length<=iA)continue;agreed[canon(rows[r][iS])]=parseFloat(rows[r][iA]);} }

// manual aliases: statement menu name -> update-file menu name, for cases the canonical key
// can't catch (e.g. the statement drops the host: "SoBe Burger - Farnborough" ==
// "SoBe Burger @ Rushmoor Grill - Farnborough"). Reviewed/curated in reference/menu_aliases.csv.
const aliasMap={};
{ const ap=path.join(__dirname,'..','reference','menu_aliases.csv');
  if(fs.existsSync(ap)){ const rows=parseCSV(fs.readFileSync(ap,'utf8'));
    const h=rows[0].map(x=>x.replace(/^﻿/,'').trim()); const iSt=h.indexOf('statement_name'),iUp=h.indexOf('update_file_name');
    for(let r=1;r<rows.length;r++){ if(rows[r].length<=iUp||!rows[r][iSt])continue; aliasMap[canon(rows[r][iSt])]=canon(rows[r][iUp]); } } }
// resolve a statement site name to the key used in `agreed` (alias first, else canonical)
const matchKey = s => aliasMap[canon(s)] || canon(s);

// scan Q2 weeks
const allWeeks=discoverWeeks('26').filter(w=>w.week_end>='2026-01-04');
const q2weeks=allWeeks.filter(w=>w.week_end>=Q2_START);
const rolling4=allWeeks.slice(-4).map(w=>w.week_end);

// per (week_end, account||site): {gmv, comm, adjs:[]}
const cell=new Map();
for(const w of q2weeks){
  for(const {account,path:p} of w.deliveroo){
    const rows=parseCSV(fs.readFileSync(p,'utf8'));
    for(let r=2;r<rows.length;r++){const c=rows[r];if(c.length<11)continue;
      if(c[3]!=='Delivery')continue;
      const val=num(c[4]),pct=parseRate(c[6]),comm=Math.abs(num(c[7]));
      if(pct==null||val<=0)continue;
      const k=w.week_end+'|'+account+'|'+c[0];
      let o=cell.get(k); if(!o){o={week:w.week_end,account,site:c[0],gmv:0,comm:0,adjs:[]};cell.set(k,o);}
      o.gmv+=val;o.comm+=comm;o.adjs.push(r2(pct-headlineFor(val)));
    }
  }
}

// ---- View 1: rolling-4-week exceptions vs Q2 update file ----
const exceptions=[];
for(const o of cell.values()){
  if(!rolling4.includes(o.week)) continue;
  if(o.adjs.length<3) continue;                 // skip negligible-volume menus
  const ag=agreed[matchKey(o.site)]; if(ag===undefined) continue;  // only menus in the Q2 update file
  const charged=mode(o.adjs);
  const diff=r2(charged-ag);
  if(Math.abs(diff)>ADJ_TOL){
    exceptions.push({week_end:o.week,account:o.account,menu:o.site,
      agreed_adj:ag, charged_adj:charged, diff_pts:diff,
      week_gmv:r2(o.gmv), impact_gbp:r2(o.gmv*diff/100),
      effective_pct:r2(o.comm/o.gmv*100),
      direction: diff>0?'charged MORE than Q2 file':'charged less than Q2 file'});
  }
}
exceptions.sort((a,b)=> a.week_end<b.week_end?1:a.week_end>b.week_end?-1:(b.impact_gbp-a.impact_gbp));
writeCsv('q2_rolling4_rate_exceptions.csv',
  ['week_end','account','menu','agreed_adj','charged_adj','diff_pts','effective_pct','week_gmv','impact_gbp','direction'],exceptions);

// ---- Menus trading in the rolling-4 window but NOT in the Q2 update file (can't be verified) ----
const agArr=Object.keys(agreed);
const uncov=new Map(); // account||site -> aggregate over rolling-4
for(const o of cell.values()){
  if(!rolling4.includes(o.week)) continue;
  if(agreed[matchKey(o.site)]!==undefined) continue;        // covered -> handled above
  const k=o.account+'||'+o.site;
  let u=uncov.get(k); if(!u){u={account:o.account,menu:o.site,orders:0,gmv:0,comm:0,adjs:[]};uncov.set(k,u);}
  u.orders+=o.adjs.length; u.gmv+=o.gmv; u.comm+=o.comm; u.adjs.push(...o.adjs);
}
const uncovered=[...uncov.values()].filter(u=>u.orders>=3).map(u=>{
  const n=canon(u.menu);
  return {account:u.account,menu:u.menu,orders_4wk:u.orders,gmv_4wk:r2(u.gmv),
    effective_pct:r2(u.comm/u.gmv*100), charged_adj:mode(u.adjs),
    note: agArr.some(k=>k.includes(n)||n.includes(k))?'possible name variant of an existing site — check':'not in Q2 file (likely new site → New Q2 rate card)'};
}).sort((a,b)=>b.gmv_4wk-a.gmv_4wk);
writeCsv('q2_rolling4_menus_not_in_file.csv',
  ['account','menu','orders_4wk','gmv_4wk','effective_pct','charged_adj','note'],uncovered);

// ---- Per-menu × per-week rate check (covered menus): rate each week + tick if it matched the Q2 file ----
const coveredMenus=new Map();
for(const o of cell.values()){
  if(!rolling4.includes(o.week)) continue;
  const ag=agreed[matchKey(o.site)]; if(ag===undefined) continue;   // only menus the Q2 file covers
  const k=o.account+'||'+o.site;
  let m=coveredMenus.get(k); if(!m){m={account:o.account,menu:o.site,agreed:ag,gmv4:0,wk:{}};coveredMenus.set(k,m);}
  const adj=mode(o.adjs);
  m.gmv4+=o.gmv;
  m.wk[o.week]={eff:r2(o.comm/o.gmv*100), adj, matched:Math.abs(adj-ag)<=ADJ_TOL, orders:o.adjs.length, g:o.gmv};
}
const menuRows=[...coveredMenus.values()].sort((a,b)=>b.gmv4-a.gmv4).map(m=>{
  const weeks=rolling4.map(wk=>m.wk[wk]||null);
  const traded=weeks.filter(Boolean);
  return {...m, weeks, allMatched: traded.length>0 && traded.every(w=>w.matched)};
});
writeCsv('q2_rolling4_rate_check_by_menu.csv',
  ['account','menu','Q2_file_adj', ...rolling4.flatMap(wk=>[wk+'_eff_pct',wk+'_agreed']), 'all_weeks_agree'],
  menuRows.map(m=>{ const row={account:m.account,menu:m.menu,Q2_file_adj:m.agreed,all_weeks_agree:m.allMatched?'YES':'NO'};
    rolling4.forEach((wk,i)=>{const w=m.weeks[i]; row[wk+'_eff_pct']=w?w.eff:''; row[wk+'_agreed']=w?(w.matched?'Y':'N'):'';}); return row; }));

// ---- Views 2 & 3: distribution by effective rate bucket (0.5%), per week ----
const bucketOf=eff=>Math.round(eff/0.5)*0.5;
const weeksSorted=q2weeks.map(w=>w.week_end);
const countMap=new Map(), gmvMap=new Map(), bucketSet=new Set();
for(const o of cell.values()){
  const eff=o.comm/o.gmv*100; const b=bucketOf(eff); bucketSet.add(b);
  const ck=b+'|'+o.week; countMap.set(ck,(countMap.get(ck)||0)+1);
  gmvMap.set(ck,(gmvMap.get(ck)||0)+o.gmv);
}
const buckets=[...bucketSet].sort((a,b)=>a-b);
const distCount=buckets.map(b=>{const row={rate:b.toFixed(1)+'%'};let tot=0;for(const wk of weeksSorted){const n=countMap.get(b+'|'+wk)||0;row[wk]=n;tot+=n;}row.Total=tot;return row;});
const distGmv=buckets.map(b=>{const row={rate:b.toFixed(1)+'%'};let tot=0;for(const wk of weeksSorted){const g=r2(gmvMap.get(b+'|'+wk)||0);row[wk]=g;tot+=g;}row.Total=r2(tot);return row;});
writeCsv('q2_menu_count_by_rate_by_week.csv',['rate',...weeksSorted,'Total'],distCount);
writeCsv('q2_gmv_by_rate_by_week.csv',['rate',...weeksSorted,'Total'],distGmv);

// ---- coverage diagnostic for rolling-4 ----
let r4total=0,r4matched=0,r4unmatched=0,r4lowvol=0; const unmatchedMenus=new Set();
for(const o of cell.values()){ if(!rolling4.includes(o.week)) continue; r4total++;
  if(o.adjs.length<3){r4lowvol++;continue;}
  if(agreed[matchKey(o.site)]===undefined){r4unmatched++;unmatchedMenus.add(o.account+'||'+o.site);} else r4matched++; }
console.log('ROLLING-4 COVERAGE: menu-weeks',r4total,'| matched to Q2 file',r4matched,'| not in file (new/other acct)',r4unmatched,'('+unmatchedMenus.size+' distinct menus) | <3 orders',r4lowvol);

// ---- console summary ----
console.log('Q2 weeks:',weeksSorted.length,' rolling-4:',rolling4.join(', '));
console.log('Menu-weeks:',cell.size,'  rate buckets:',buckets.length,'(',buckets[0].toFixed(1)+'%','to',buckets[buckets.length-1].toFixed(1)+'%)');
console.log('Rolling-4 rate EXCEPTIONS vs Q2 file (matched menus):',exceptions.length);
const overEx=exceptions.filter(e=>e.diff_pts>0);
console.log('  charged MORE than Q2 file:',overEx.length,' total wk-impact £',r2(overEx.reduce((a,e)=>a+e.impact_gbp,0)));
console.log('  charged LESS than Q2 file:',exceptions.length-overEx.length);
console.log('\nLatest week ('+rolling4[3]+') menu-count by rate bucket:');
for(const row of distCount){const n=row[rolling4[3]];if(n)console.log('   '+row.rate.padStart(6)+' : '+n+' menus');}

// ---- Excel ----
const wb=new ExcelJS.Workbook(); wb.creator='Deliveroo Q2 Rate Tracker'; wb.created=new Date(0);
const HDR={font:{bold:true,color:{argb:'FFFFFFFF'}},fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FF404040'}}};
const styleHeader=ws=>ws.getRow(1).eachCell(c=>{c.font=HDR.font;c.fill=HDR.fill;});
const wkLabel=wk=>wk.slice(8,10)+'/'+wk.slice(5,7);

// Tab 1: per-menu × per-week rate check vs Q2 file
const GREEN={type:'pattern',pattern:'solid',fgColor:{argb:'FFC6EFCE'}};
const RED={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFC7CE'}};
const s1=wb.addWorksheet('Rate check by menu (4 wks)');
const wkCols=rolling4.map(wk=>wkLabel(wk));
const okCount=menuRows.filter(m=>m.allMatched).length, badCount=menuRows.length-okCount;
s1.addRow([`Each menu's effective commission rate by week, with a tick where it matched the Q2 update file. ${okCount}/${menuRows.length} menus agree on every traded week${badCount?`; ${badCount} need review`:''}.`]).getCell(1).font={bold:true};
s1.addRow(['Rate = weekly commission ÷ GMV (varies a little with order-size mix). Green/✓ = that week\'s contracted rate matched the Q2 file; red/✗ = differs.']);
s1.addRow([]);
const head=['Account','Menu','Q2-file adj (pts)',...wkCols,'All weeks agree?'];
const hr=s1.addRow(head); hr.eachCell(c=>{c.font=HDR.font;c.fill=HDR.fill;});
const firstDataRow=s1.rowCount+1;
for(const m of menuRows){
  const cells=[m.account,m.menu,m.agreed];
  for(const w of m.weeks) cells.push(w? w.eff/100 : null);
  cells.push(m.allMatched?'✓':'✗');
  const row=s1.addRow(cells);
  m.weeks.forEach((w,i)=>{ const cell=row.getCell(4+i); if(w){ cell.fill=w.matched?GREEN:RED; } });
  const st=row.getCell(4+wkCols.length); st.alignment={horizontal:'center'}; st.font={bold:true,color:{argb:m.allMatched?'FF107C10':'FFC00000'}};
}
s1.getColumn(1).width=24; s1.getColumn(2).width=50; s1.getColumn(3).width=15;
for(let i=0;i<wkCols.length;i++){ s1.getColumn(4+i).width=10; s1.getColumn(4+i).numFmt='0.0%'; }
s1.getColumn(4+wkCols.length).width=15;
s1.views=[{state:'frozen',xSplit:2,ySplit:firstDataRow-1}]; s1.autoFilter={from:{row:firstDataRow-1,column:1},to:{row:firstDataRow-1,column:head.length}};

// Tab 1b: menus trading but not covered by the Q2 file
const s1b=wb.addWorksheet('Menus not in Q2 file');
s1b.addRow(['Menus trading in the last 4 weeks that are NOT in the Q2 update file — rate cannot be verified against it.']).getCell(1).font={bold:true};
s1b.addRow(['Mostly new sites launched after the file was generated (08 Apr); these should be on the New Q2 rate card. Sorted by 4-week GMV.']);
s1b.addRow([]);
const hr2=s1b.addRow(['Account','Menu','Orders (4wk)','GMV £ (4wk)','Eff. rate charged','Charged adj (pts)','Note']);
hr2.eachCell(c=>{c.font=HDR.font;c.fill=HDR.fill;});
for(const u of uncovered) s1b.addRow([u.account,u.menu,u.orders_4wk,u.gmv_4wk,u.effective_pct/100,u.charged_adj,u.note]);
s1b.getColumn(2).width=50; s1b.getColumn(1).width=24; s1b.getColumn(4).width=14; s1b.getColumn(4).numFmt='#,##0.00'; s1b.getColumn(5).numFmt='0.00%'; s1b.getColumn(7).width=46;

// Tab 2: menu count by rate by week
const s2=wb.addWorksheet('Menus by rate by week');
s2.columns=[{header:'Effective rate',width:13},...weeksSorted.map(wk=>({header:wkLabel(wk),width:9})),{header:'Total',width:9}];
for(const row of distCount) s2.addRow(['' +row.rate,...weeksSorted.map(wk=>row[wk]),row.Total]);
styleHeader(s2); s2.views=[{state:'frozen',xSplit:1,ySplit:1}];
s2.addRow([]); s2.addRow(['Each menu counted once per week in the bucket of its effective commission rate (commission ÷ GMV, to nearest 0.5%).']);

// Tab 3: GMV by rate by week
const s3=wb.addWorksheet('GMV by rate by week');
s3.columns=[{header:'Effective rate',width:13},...weeksSorted.map(wk=>({header:wkLabel(wk),width:13})),{header:'Total',width:14}];
for(const row of distGmv){ const r=s3.addRow(['' +row.rate,...weeksSorted.map(wk=>row[wk]),row.Total]); }
for(let c=2;c<=weeksSorted.length+2;c++) s3.getColumn(c).numFmt='#,##0';
styleHeader(s3); s3.views=[{state:'frozen',xSplit:1,ySplit:1}];
s3.addRow([]); s3.addRow(['GMV (£) of orders, grouped by each menu\'s weekly effective commission rate (to nearest 0.5%).']);

// ---- Menus launched in Q2: check vs New Q2 rate card (headline − 1.50%), same 4-week structure ----
const NEW_CARD_ADJ = -1.50;                 // New Q2 rate card "w/ Ops adjustment" = contract headline − 1.50%
const isHawk = s => /hawkins/i.test(s);
const launchedMap=new Map();
for(const o of cell.values()){
  if(!rolling4.includes(o.week)) continue;
  if(agreed[matchKey(o.site)]!==undefined) continue;   // already in the existing-site Q2 file
  if(isHawk(o.site)) continue;                      // Hawkins = separate flat-rate brand, not on the card
  const k=o.account+'||'+o.site;
  let m=launchedMap.get(k); if(!m){m={account:o.account,menu:o.site,gmv4:0,wk:{}};launchedMap.set(k,m);}
  const adj=mode(o.adjs); m.gmv4+=o.gmv;
  m.wk[o.week]={eff:r2(o.comm/o.gmv*100), adj, matched:Math.abs(adj-NEW_CARD_ADJ)<=ADJ_TOL, orders:o.adjs.length, g:o.gmv};
}
const agArr2=Object.keys(agreed);
const launchedRows=[...launchedMap.values()]
  .filter(m=>Object.values(m.wk).reduce((a,w)=>a+w.orders,0)>=3)
  .sort((a,b)=>b.gmv4-a.gmv4)
  .map(m=>{ const weeks=rolling4.map(wk=>m.wk[wk]||null); const traded=weeks.filter(Boolean); const n=canon(m.menu);
    return {...m, weeks, allMatched:traded.length>0&&traded.every(w=>w.matched),
      variant: agArr2.some(k=>sim(n,k)>=0.90)}; });
writeCsv('q2_launched_rate_check.csv',
  ['account','menu','card_adj', ...rolling4.flatMap(wk=>[wk+'_eff_pct',wk+'_matches_card']), 'variant','all_weeks_match_card'],
  launchedRows.map(m=>{ const row={account:m.account,menu:m.menu,card_adj:NEW_CARD_ADJ,variant:m.variant?'possible variant':'',all_weeks_match_card:m.allMatched?'YES':'NO'};
    rolling4.forEach((wk,i)=>{const w=m.weeks[i]; row[wk+'_eff_pct']=w?w.eff:''; row[wk+'_matches_card']=w?(w.matched?'Y':'N'):'';}); return row; }));

// ---- JSON payload for the HTML dashboard ----
const htmlData={
  generated: rolling4[rolling4.length-1],
  rolling: rolling4.map(wkLabel),
  q2weeks: weeksSorted.map(wkLabel),
  cardAdj: NEW_CARD_ADJ,
  kpis:{ menusChecked:menuRows.length, allAgree:menuRows.filter(m=>m.allMatched).length,
         launched:launchedRows.length, launchedOk:launchedRows.filter(m=>m.allMatched).length,
         q2weeks:weeksSorted.length },
  rateCheck: menuRows.map(m=>({a:m.account,m:m.menu,adj:m.agreed,ok:m.allMatched,
        w:m.weeks.map(w=>w?{e:w.eff, exp:r2(w.eff+(m.agreed-w.adj)), ok:w.matched, o:w.orders, v:r2(w.g*(w.adj-m.agreed)/100)}:null)})),
  launched: launchedRows.map(m=>({a:m.account,m:m.menu,ok:m.allMatched,variant:m.variant,
        w:m.weeks.map(w=>w?{e:w.eff, exp:r2(w.eff+(NEW_CARD_ADJ-w.adj)), ok:w.matched, o:w.orders, v:r2(w.g*(w.adj-NEW_CARD_ADJ)/100)}:null)})),
  countByRate:{ rows: distCount.map(r=>({rate:r.rate, vals:weeksSorted.map(wk=>r[wk]), total:r.Total})) },
  gmvByRate:{ rows: distGmv.map(r=>({rate:r.rate, vals:weeksSorted.map(wk=>r2(r[wk])), total:r.Total})) },
};
fs.writeFileSync(path.join(OUT,'q2_dashboard_data.json'), JSON.stringify(htmlData));

fs.mkdirSync(REPORTS,{recursive:true});
(async()=>{
  const base=path.join(REPORTS,'Deliveroo_Q2_Rate_Tracker');
  for(const f of [base+'.xlsx', base+'_v2.xlsx', base+'_v3.xlsx']){
    try{ await wb.xlsx.writeFile(f); console.log('\nSaved: '+f); return; }
    catch(e){ if(e.code==='EBUSY'){ console.log('  (locked, trying another name): '+path.basename(f)); continue; } throw e; }
  }
  console.log('\nAll target files were locked — close the open report in Excel and re-run.');
})();
