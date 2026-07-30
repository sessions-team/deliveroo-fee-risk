// Reconcile statement menu names against the Q2 update file, tolerant of slight name
// differences (spacing, punctuation, &/and, case). Produces a review list.
//
// Tiers:
//   EXACT      - identical after light normalise (current behaviour)
//   CANONICAL  - identical after stripping ALL spaces/punctuation (&->and) — safe auto-match
//                (this is what catches "Wing Drop" vs "WingDrop")
//   FUZZY n    - Levenshtein similarity >= 0.90 on the canonical key — needs human review
//   NONE       - genuinely not in the file (real new site)
const fs=require('fs'), path=require('path');
const OUT=path.join(__dirname,'..','04_analysis');

function parseCSV(t){const rows=[];let row=[],f='',i=0,q=false;while(i<t.length){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i+=2;continue;}q=false;i++;continue;}f+=c;i++;continue;}if(c==='"'){q=true;i++;continue;}if(c===','){row.push(f);f='';i++;continue;}if(c==='\r'){i++;continue;}if(c==='\n'){row.push(f);rows.push(row);row=[];f='';i++;continue;}f+=c;i++;}if(f.length||row.length){row.push(f);rows.push(row);}return rows;}
const light = s => String(s||'').trim().replace(/\s+/g,' ').toLowerCase();              // current join key
const canon = s => String(s||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,''); // strip spaces+punct
function lev(a,b){const m=a.length,n=b.length;if(!m)return n;if(!n)return m;const d=Array.from({length:n+1},(_,j)=>j);
  for(let i=1;i<=m;i++){let prev=d[0];d[0]=i;for(let j=1;j<=n;j++){const t=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=t;}}return d[n];}
const sim=(a,b)=>{const L=Math.max(a.length,b.length);return L?1-lev(a,b)/L:1;};

// --- load Q2 update file names ---
const rows=parseCSV(fs.readFileSync(path.join(OUT,'Q2_existing-sites_BY-SITE.csv'),'utf8'));
const h=rows[0].map(x=>x.replace(/^﻿/,'')); const iS=h.indexOf('Site'), iA=h.indexOf('NetAdjustment');
const csvNames=[]; const lightSet=new Set(), canonMap=new Map();
for(let r=1;r<rows.length;r++){ if(rows[r].length<=iA) continue; const name=rows[r][iS], adj=rows[r][iA];
  csvNames.push({name,adj,canon:canon(name)}); lightSet.add(light(name));
  const ck=canon(name); if(!canonMap.has(ck)) canonMap.set(ck,{name,adj}); }

// --- statement menus currently treated as "launched in Q2" (not exact-matched) ---
const data=JSON.parse(fs.readFileSync(path.join(OUT,'q2_dashboard_data.json'),'utf8'));
const launched=data.launched.map(m=>({account:m.a, menu:m.m}));

let nCanon=0,nFuzzy=0,nNone=0; const review=[];
for(const m of launched){
  const ck=canon(m.menu);
  if(canonMap.has(ck)){ const hit=canonMap.get(ck); nCanon++;
    review.push({account:m.account,menu:m.menu,matchType:'CANONICAL',matchedCsvName:hit.name,agreedAdj:hit.adj,score:'1.00'}); continue; }
  // fuzzy: best similarity among canon keys of similar length
  let best=null,bestS=0;
  for(const c of csvNames){ if(Math.abs(c.canon.length-ck.length)>4) continue; const s=sim(ck,c.canon); if(s>bestS){bestS=s;best=c;} }
  if(best && bestS>=0.90){ nFuzzy++;
    review.push({account:m.account,menu:m.menu,matchType:'FUZZY',matchedCsvName:best.name,agreedAdj:best.adj,score:bestS.toFixed(2)}); }
  else { nNone++; review.push({account:m.account,menu:m.menu,matchType:'NONE (likely genuine new site)',matchedCsvName:'',agreedAdj:'',score:bestS.toFixed(2)}); }
}
review.sort((a,b)=>{const o={CANONICAL:0,FUZZY:1};const ao=o[a.matchType]??2,bo=o[b.matchType]??2;return ao-bo|| (b.score-a.score);});

const outCols=['account','menu','matchType','matchedCsvName','agreedAdj','score'];
const esc=v=>{const s=String(v==null?'':v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
fs.writeFileSync(path.join(OUT,'q2_name_match_review.csv'),[outCols.join(',')].concat(review.map(r=>outCols.map(c=>esc(r[c])).join(','))).join('\n'));

console.log('Launched-in-Q2 menus examined:',launched.length);
console.log('  CANONICAL match (spacing/punctuation diff — safe to auto-fold):',nCanon);
console.log('  FUZZY match >=0.90 (needs review):',nFuzzy);
console.log('  NONE (likely genuine new site):',nNone);
console.log('\nWing Drop check:', csvNames.some(c=>/wing ?drop @ herbies pizza - high wycombe/i.test(c.name))?'present in Q2 file':'not found',
  '| canon("WingDrop @ Herbies Pizza - High Wycombe") =', canon('WingDrop @ Herbies Pizza - High Wycombe'));
console.log('\nSample CANONICAL matches (statement name  ==>  Q2-file name  [adj]):');
review.filter(r=>r.matchType==='CANONICAL').slice(0,15).forEach(r=>console.log('  "'+r.menu+'"  ==>  "'+r.matchedCsvName+'"  ['+r.agreedAdj+']'));
console.log('\nSample FUZZY candidates (review):');
review.filter(r=>r.matchType==='FUZZY').slice(0,12).forEach(r=>console.log('  '+r.score+'  "'+r.menu+'"  ~  "'+r.matchedCsvName+'"  ['+r.agreedAdj+']'));
console.log('\nReview list -> 04_analysis/q2_name_match_review.csv');
