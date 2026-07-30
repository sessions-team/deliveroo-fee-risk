// Prototype: enumerate 2026 Deliveroo weeks (read straight from G:) and confirm
// extraction of the per-order CHARGED commission rate (col 6).
const fs = require('fs');
const path = require('path');
const { discoverWeeks } = require('C:\\Users\\Trist\\Documents\\Claude\\projects\\Platform-weekly-dashboard\\scripts\\weeks.js');

// RFC4180 parser (same approach as the dashboard's lib.js)
function parseCSV(text){
  const rows=[]; let row=[],f='',i=0,q=false;
  while(i<text.length){const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){f+='"';i+=2;continue;} q=false;i++;continue;} f+=c;i++;continue;}
    if(c==='"'){q=true;i++;continue;}
    if(c===','){row.push(f);f='';i++;continue;}
    if(c==='\r'){i++;continue;}
    if(c==='\n'){row.push(f);rows.push(row);row=[];f='';i++;continue;}
    f+=c;i++;}
  if(f.length||row.length){row.push(f);rows.push(row);}
  return rows;
}
// parse "24.62% + 0.00" -> {pct:24.62, plus:0.00}
function parseRate(s){
  if(!s) return null;
  const m=String(s).match(/(-?\d+(?:\.\d+)?)\s*%\s*(?:\+\s*(-?\d+(?:\.\d+)?))?/);
  if(!m) return null;
  return { pct: parseFloat(m[1]), plus: m[2]!=null?parseFloat(m[2]):0 };
}

const weeks = discoverWeeks('26').filter(w => w.week_end >= '2026-01-04');
console.log('=== 2026 weeks (week_end >= 2026-01-04) ===');
let totalCsv=0, totalEmpty=0;
for(const w of weeks){
  totalCsv += w.deliveroo.length; totalEmpty += w.deliveroo_empty.length;
  console.log(`${w.week_start} -> ${w.week_end}  [${w.label}]  accounts:${w.deliveroo.length}  empty:${w.deliveroo_empty.length}  (${w.deliveroo.map(d=>d.account).join(', ')})`);
}
console.log(`\nWEEKS: ${weeks.length}   STATEMENT CSVs: ${totalCsv}   empty-account-slots: ${totalEmpty}`);

// Inspect one Q2 week + one Q1 week: sample charged rates and activity breakdown
for(const target of ['2026-01-04','2026-05-03']){
  const w = weeks.find(x=>x.week_end===target); if(!w) continue;
  const acct = w.deliveroo[0]; if(!acct) continue;
  const rows = parseCSV(fs.readFileSync(acct.path,'utf8'));
  console.log(`\n=== SAMPLE week_end ${target}, account "${acct.account}" (${rows.length} rows) ===`);
  console.log('header:', rows[1].join(' | '));
  const act={}; const rateSamples=[];
  for(let r=2;r<rows.length;r++){
    const c=rows[r]; if(c.length<11) continue;
    act[c[3]]=(act[c[3]]||0)+1;
    if((c[3]==='Delivery'||c[3]==='Pickup') && rateSamples.length<6){
      const pr=parseRate(c[6]);
      rateSamples.push({val:c[4], rate:c[6], parsed:pr, comm:c[7], implied: pr?(parseFloat(c[4])*pr.pct/100).toFixed(2):null});
    }
  }
  console.log('activity counts:', JSON.stringify(act));
  console.log('rate samples (val, rate, parsedPct, commission£, implied=val*pct):');
  for(const s of rateSamples) console.log(`   £${s.val}  "${s.rate}" -> ${s.parsed?s.parsed.pct+'%':'?'}  comm=${s.comm}  implied=${s.implied}`);
}
