// For launched-in-Q2 menus that DON'T match the New Q2 rate card, suggest the existing
// (Q1/Q2 update file) menu they are probably the same site as — even when the statement
// drops the host (e.g. "SoBe Burger - Farnborough" == "SoBe Burger @ Rushmoor Grill - Farnborough").
// Signals: brand+location match (ignoring host) and/or fuzzy similarity, corroborated by
// whether the candidate's AGREED adjustment equals the rate the menu is actually charged.
const fs=require('fs'), path=require('path');
const { discoverWeeks } = require('C:\\Users\\Trist\\Documents\\Claude\\projects\\Platform-weekly-dashboard\\scripts\\weeks.js');
const OUT=path.join(__dirname,'..','04_analysis');

const BANDS=[[12,32.59],[14,31.59],[16,30.00],[18,28.78],[20,27.82],[22,27.04],[24,26.40],[26,25.86],[Infinity,25.62]];
const headlineFor=v=>{for(const[m,r]of BANDS)if(v<m)return r;return 25.62;};
function parseCSV(t){const rows=[];let row=[],f='',i=0,q=false;while(i<t.length){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i+=2;continue;}q=false;i++;continue;}f+=c;i++;continue;}if(c==='"'){q=true;i++;continue;}if(c===','){row.push(f);f='';i++;continue;}if(c==='\r'){i++;continue;}if(c==='\n'){row.push(f);rows.push(row);row=[];f='';i++;continue;}f+=c;i++;}if(f.length||row.length){row.push(f);rows.push(row);}return rows;}
const num=v=>{if(v==null||v==='')return 0;const n=parseFloat(String(v).replace(/[, £]/g,''));return isNaN(n)?0:n;};
const parseRate=s=>{const m=String(s||'').match(/(-?\d+(?:\.\d+)?)\s*%/);return m?parseFloat(m[1]):null;};
const canon=s=>String(s||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'');
function lev(a,b){const m=a.length,n=b.length;if(!m)return n;if(!n)return m;const d=Array.from({length:n+1},(_,j)=>j);for(let i=1;i<=m;i++){let p=d[0];d[0]=i;for(let j=1;j<=n;j++){const t=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,p+(a[i-1]===b[j-1]?0:1));p=t;}}return d[n];}
const sim=(a,b)=>{const L=Math.max(a.length,b.length);return L?1-lev(a,b)/L:1;};
const r2=n=>Math.round(n*100)/100;
const mode=a=>{const m=new Map();for(const x of a){const k=x.toFixed(2);m.set(k,(m.get(k)||0)+1);}let b=null,bn=-1;for(const[k,n]of m)if(n>bn){bn=n;b=parseFloat(k);}return b;};
// split "Brand @ Host - Location" -> brand & location (host ignored)
function parts(name){const s=String(name).trim();let head=s,loc='';const d=s.lastIndexOf(' - ');if(d>=0){loc=s.slice(d+3);head=s.slice(0,d);}const at=head.indexOf(' @ ');const brand=at>=0?head.slice(0,at):head;return {brand:canon(brand),loc:canon(loc),canon:canon(s)};}
const CARD=-1.50, TOL=0.05;

// --- existing menus from the Q2 update file ---
const rows=parseCSV(fs.readFileSync(path.join(OUT,'Q2_existing-sites_BY-SITE.csv'),'utf8'));
const h=rows[0].map(x=>x.replace(/^﻿/,'')); const iS=h.indexOf('Site'), iA=h.indexOf('NetAdjustment');
const existing=[]; const agreedCanon=new Set(); const brandloc=new Map();
for(let r=1;r<rows.length;r++){ if(rows[r].length<=iA) continue; const name=rows[r][iS]; const adj=parseFloat(rows[r][iA]); const p=parts(name);
  const e={name,adj,canon:p.canon,brand:p.brand,loc:p.loc}; existing.push(e); agreedCanon.add(p.canon);
  if(p.brand&&p.loc){const k=p.brand+'|'+p.loc; if(!brandloc.has(k))brandloc.set(k,[]); brandloc.get(k).push(e);} }

// --- scan rolling-4 weeks for launched menus (not in file) that DON'T match the card ---
const weeks=discoverWeeks('26').filter(w=>w.week_end>='2026-01-04');
const rolling4=weeks.slice(-4).map(w=>w.week_end);
const cell=new Map();
for(const wkEnd of rolling4){ const w=weeks.find(x=>x.week_end===wkEnd);
  for(const {account,path:p} of w.deliveroo){ const rs=parseCSV(fs.readFileSync(p,'utf8'));
    for(let r=2;r<rs.length;r++){const c=rs[r];if(c.length<11)continue;if(c[3]!=='Delivery')continue;
      if(/hawkins/i.test(c[0]))continue;
      const val=num(c[4]),pct=parseRate(c[6]),comm=Math.abs(num(c[7]));if(pct==null||val<=0)continue;
      const k=account+'||'+c[0];let o=cell.get(k);if(!o){o={account,site:c[0],gmv:0,comm:0,adjs:[]};cell.set(k,o);}
      o.gmv+=val;o.comm+=comm;o.adjs.push(r2(pct-headlineFor(val)));}}}

const suggestions=[];
for(const o of cell.values()){
  if(agreedCanon.has(canon(o.site))) continue;           // already matches the file
  if(o.adjs.length<3) continue;
  const charged=mode(o.adjs);
  if(Math.abs(charged-CARD)<=TOL) continue;              // matches the New Q2 rate card -> likely genuine new site
  const p=parts(o.site);
  const cands=new Map();
  const add=(e,basis,score)=>{const cur=cands.get(e.name);if(!cur||score>cur.score)cands.set(e.name,{e,basis,score});};
  // 1) brand + location (host ignored)
  if(p.brand&&p.loc&&brandloc.has(p.brand+'|'+p.loc)) for(const e of brandloc.get(p.brand+'|'+p.loc)) add(e,'brand+location',0.95);
  // 2) fuzzy on full canonical name
  for(const e of existing){ if(Math.abs(e.canon.length-p.canon.length)>14) continue; const s=sim(p.canon,e.canon); if(s>=0.80) add(e,'fuzzy '+s.toFixed(2),s); }
  for(const {e,basis,score} of cands.values()){
    const adjMatch=Math.abs(e.adj-charged)<=TOL;
    let confidence;
    if(basis==='brand+location'&&adjMatch) confidence='HIGH — brand+location & rate matches';
    else if(score>=0.92&&adjMatch) confidence='HIGH — near-name & rate matches';
    else if(basis==='brand+location') confidence='LIKELY — brand+location (rate differs)';
    else if(adjMatch&&score>=0.85) confidence='LIKELY — near-name & rate matches';
    else if(score>=0.88) confidence='POSSIBLE — near-name';
    else confidence='REVIEW — weak';
    suggestions.push({account:o.account, launched_menu:o.site, charged_adj:charged, gmv_4wk:r2(o.gmv),
      suggested_existing_menu:e.name, suggested_agreed_adj:e.adj, rate_matches:(adjMatch?'YES':'no'),
      basis, confidence, _rank:(confidence.startsWith('HIGH')?0:confidence.startsWith('LIKELY')?1:confidence.startsWith('POSSIBLE')?2:3)});
  }
}
// best suggestion per launched menu first, then sort
suggestions.sort((a,b)=> a.launched_menu<b.launched_menu?-1:a.launched_menu>b.launched_menu?1:(a._rank-b._rank||b.suggested_agreed_adj-a.suggested_agreed_adj));
// keep top 2 candidates per launched menu
const seen={}; const kept=[];
for(const s of suggestions){ seen[s.launched_menu]=(seen[s.launched_menu]||0); if(seen[s.launched_menu]<2){kept.push(s);seen[s.launched_menu]++;} }
kept.sort((a,b)=> a._rank-b._rank || b.gmv_4wk-a.gmv_4wk);

const cols=['confidence','account','launched_menu','charged_adj','gmv_4wk','suggested_existing_menu','suggested_agreed_adj','rate_matches','basis'];
const esc=v=>{const s=String(v==null?'':v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
fs.writeFileSync(path.join(OUT,'q2_name_suggestions.csv'),[cols.join(',')].concat(kept.map(r=>cols.map(c=>esc(r[c])).join(','))).join('\n'));

const launchedMismatch=new Set(kept.map(s=>s.launched_menu));
const noCand=[...cell.values()].filter(o=>!agreedCanon.has(canon(o.site))&&o.adjs.length>=3&&Math.abs(mode(o.adjs)-CARD)>TOL).length;
console.log('Rolling-4 weeks:',rolling4.join(', '));
console.log('Mismatched launched menus (not on card):',noCand);
console.log('  ...with at least one suggested existing match:',launchedMismatch.size);
console.log('  HIGH confidence:',kept.filter(s=>s.confidence.startsWith('HIGH')).length,
            '| LIKELY:',kept.filter(s=>s.confidence.startsWith('LIKELY')).length,
            '| POSSIBLE:',kept.filter(s=>s.confidence.startsWith('POSSIBLE')).length,
            '| weak:',kept.filter(s=>s.confidence.startsWith('REVIEW')).length);
console.log('\nTop suggestions:');
kept.slice(0,20).forEach(s=>console.log('  ['+s.confidence+']\n      statement: "'+s.launched_menu+'"  (charged '+s.charged_adj+', GMV £'+s.gmv_4wk+')\n      existing : "'+s.suggested_existing_menu+'"  (agreed '+s.suggested_agreed_adj+', rate matches: '+s.rate_matches+')'));
console.log('\nFull list -> 04_analysis/q2_name_suggestions.csv');
