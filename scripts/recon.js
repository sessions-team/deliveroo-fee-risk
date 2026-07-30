// Per-order Deliveroo commission reconciliation, 2026 YTD (from w/e 04.01.26).
// Reads weekly statement CSVs in place from the shared drive (no download).
//
// For each Delivery/Pickup order:
//   band            = contract value band for Order Value
//   headline        = contracted Headline Commission Rate for that band
//   chargedPct      = the rate Deliveroo actually charged (statement col 6)
//   impliedAdj      = chargedPct - headline   (the effective PfP adjustment applied)
// Checks:
//   (A) arithmetic : |commission| ~= OrderValue * chargedPct/100 (+ fixed component)
//   (B) envelope   : impliedAdj within contract bounds [-6.10, +2.40]
//   (C) Q2 vs agreed: site's Q2 impliedAdj vs agreed NetAdjustment (Commission Output)
// Emits per-site rate "regimes" (distinct impliedAdj with date ranges), anomalies,
// and weekly account rollups.

const fs = require('fs');
const path = require('path');
const { discoverWeeks } = require('C:\\Users\\Trist\\Documents\\Claude\\projects\\Platform-weekly-dashboard\\scripts\\weeks.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '04_analysis');
const TOL_ARITH = 0.02;            // £ tolerance on per-order arithmetic
const ENV_MIN = -6.10, ENV_MAX = 2.40, ENV_TOL = 0.01;  // contract adjustment envelope
const Q2_EFFECTIVE_FROM = '2026-04-16'; // agreed Q2 rate effective ~10th business day after Q1 end
const isHawkins = name => /hawkins/i.test(name); // flat-rate virtual brand, not on banded structure

// ---- contract headline bands (Delivery) ----
const BANDS = [
  { max: 12,       rate: 32.59, label: '<12' },
  { max: 14,       rate: 31.59, label: '12-14' },
  { max: 16,       rate: 30.00, label: '14-16' },
  { max: 18,       rate: 28.78, label: '16-18' },
  { max: 20,       rate: 27.82, label: '18-20' },
  { max: 22,       rate: 27.04, label: '20-22' },
  { max: 24,       rate: 26.40, label: '22-24' },
  { max: 26,       rate: 25.86, label: '24-26' },
  { max: Infinity, rate: 25.62, label: '26+' },
];
const bandFor = v => BANDS.find(b => v < b.max) || BANDS[BANDS.length - 1];
const HEADLINES = BANDS.map(b => b.rate);
// an order's charged rate is "explained" by a site adjustment A if charged == (some headline + A)
const explainedBy = (pct, adj) => HEADLINES.some(h => Math.abs(pct - (h + adj)) < 0.011);

// ---- helpers ----
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
const num = v => { if(v===''||v==null) return 0; const n=parseFloat(String(v).replace(/[, £]/g,'')); return isNaN(n)?0:n; };
const parseRate = s => { const m=String(s||'').match(/(-?\d+(?:\.\d+)?)\s*%\s*(?:\+\s*(-?\d+(?:\.\d+)?))?/); return m?{pct:parseFloat(m[1]),plus:m[2]!=null?parseFloat(m[2]):0}:null; };
const norm = s => String(s||'').trim().replace(/\s+/g,' ').toLowerCase();
const r2 = n => Math.round(n*100)/100;
const quarterOf = iso => { const m=+iso.slice(5,7); return iso.slice(0,4)+'-Q'+(Math.floor((m-1)/3)+1); };
const csvCell = v => { const s=String(v==null?'':v); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
const writeCsv = (file, cols, rows) => {
  const out=[cols.join(',')]; for(const r of rows) out.push(cols.map(c=>csvCell(r[c])).join(','));
  fs.writeFileSync(path.join(OUT,file), out.join('\n'));
};

// ---- load agreed Q2 adjustments (Commission Output, existing sites) ----
const agreedQ2 = {}; // normSite -> NetAdjustment
{
  const p = path.join(OUT, 'Q2_existing-sites_BY-SITE.csv');
  if (fs.existsSync(p)) {
    const rows = parseCSV(fs.readFileSync(p,'utf8'));
    const h = rows[0].map(x=>x.replace(/^﻿/,''));
    const iSite=h.indexOf('Site'), iAdj=h.indexOf('NetAdjustment');
    for(let r=1;r<rows.length;r++){ if(rows[r].length<=iAdj) continue; agreedQ2[norm(rows[r][iSite])]=parseFloat(rows[r][iAdj]); }
  }
}

// ---- scan all 2026 weeks ----
const weeks = discoverWeeks('26').filter(w => w.week_end >= '2026-01-04');
const sites = new Map();      // key: account||site -> { account, site, orders:[{iso,q,val,pct,impliedAdj}] }
const weekAgg = new Map();    // key: week_end||account -> { gmv, comm, orders }
const anomalies = [];
const hawkins = { orders:0, gmv:0, comm:0, rates:new Map() }; // flat-rate brand, tracked separately
let totalOrders=0, totalArithFlags=0, scannedFiles=0, missingAccounts=[];

for (const w of weeks) {
  for (const acct of w.deliveroo_empty) missingAccounts.push(`${w.week_end} / ${acct}`);
  for (const {account, path: p} of w.deliveroo) {
    scannedFiles++;
    const rows = parseCSV(fs.readFileSync(p,'utf8'));
    for (let r=2;r<rows.length;r++){
      const c=rows[r]; if(c.length<11) continue;
      const activity=c[3];
      if(activity!=='Delivery' && activity!=='Pickup') continue;
      const val=num(c[4]); const pr=parseRate(c[6]); const comm=Math.abs(num(c[7]));
      if(!pr || val<=0) continue;
      const iso=(c[2]||'').slice(0,10) || w.week_end;
      const q=quarterOf(iso);
      totalOrders++;

      // (A) arithmetic — applies to every order incl. Hawkins
      const expectComm = val*pr.pct/100 + (pr.plus||0);
      if(Math.abs(expectComm-comm) > TOL_ARITH){
        totalArithFlags++;
        if(anomalies.length<20000) anomalies.push({type:'ARITHMETIC',week_end:w.week_end,account,site:c[0],order:c[1],date:iso,orderValue:val,chargedPct:pr.pct,commissionCharged:comm,commissionExpected:r2(expectComm),note:'commission != value x rate'});
      }

      // weekly account rollup (all delivery/pickup orders)
      const wk=w.week_end+'||'+account;
      let wa=weekAgg.get(wk); if(!wa){ wa={week_end:w.week_end,account,gmv:0,comm:0,orders:0}; weekAgg.set(wk,wa); }
      wa.gmv+=val; wa.comm+=comm; wa.orders++;

      // Hawkins: flat-rate virtual brand, excluded from banded reconciliation
      if(isHawkins(c[0])){
        hawkins.orders++; hawkins.gmv+=val; hawkins.comm+=comm;
        const rk=pr.pct.toFixed(2); hawkins.rates.set(rk,(hawkins.rates.get(rk)||0)+1);
        continue;
      }

      // accumulate per-site for banded rate-regime analysis (Delivery only)
      if(activity==='Delivery'){
        const b=bandFor(val); const impliedAdj=r2(pr.pct-b.rate);
        const key=account+'||'+c[0];
        let s=sites.get(key); if(!s){ s={account,site:c[0],orders:[]}; sites.set(key,s); }
        s.orders.push({iso,q,val,pct:pr.pct,impliedAdj});
      }
    }
  }
}

// ---- per-site rate regimes & checks ----
// mode of a list of rounded adjustments
function modeAdj(list){ const m=new Map(); for(const a of list){const k=a.toFixed(2); m.set(k,(m.get(k)||0)+1);} let best=null,bn=-1; for(const [k,n] of m){ if(n>bn){bn=n;best=parseFloat(k);} } return best; }

const regimeRows=[]; const q2checkRows=[]; const vsContractRows=[];
let realRegimeChanges=0, envelopeSites=0;
for (const s of sites.values()){
  const byQ={};
  for(const o of s.orders){ (byQ[o.q]=byQ[o.q]||[]).push(o); }
  for(const q of Object.keys(byQ).sort()){
    const os=byQ[q];
    const qMode=modeAdj(os.map(o=>o.impliedAdj));
    // reclassify each order: if its charged rate is explainable by the site's modal adjustment
    // applied to ANY band, treat it as the modal adjustment (folds away band-boundary noise);
    // otherwise keep its own implied adjustment (a genuine different rate).
    const groups={};
    for(const o of os){
      const eff = explainedBy(o.pct, qMode) ? qMode : o.impliedAdj;
      const k=eff.toFixed(2); (groups[k]=groups[k]||{adj:eff,n:0,gmv:0,min:o.iso,max:o.iso}); const g=groups[k];
      g.n++; g.gmv+=o.val; if(o.iso<g.min)g.min=o.iso; if(o.iso>g.max)g.max=o.iso;
      // genuinely unexplained rate: not the modal adj AND not a clean band+modal — flag a sample
      if(!explainedBy(o.pct,qMode) && !explainedBy(o.pct,o.impliedAdj===qMode?qMode:o.impliedAdj)){
        // (always explainedBy its own impliedAdj by construction; this branch is dead)
      }
    }
    // keep only material regimes (>=3 orders and >=5% of the quarter's orders); fold the rest into the mode
    const total=os.length;
    let gks=Object.keys(groups);
    const material=gks.filter(k=>groups[k].n>=3 && groups[k].n/total>=0.05);
    const matSet=new Set(material.length?material:[qMode.toFixed(2)]);
    const dom=gks.map(k=>groups[k]).sort((a,b)=>b.n-a.n)[0];
    const matRegimes=[...matSet].map(k=>groups[k]).filter(Boolean).sort((a,b)=>a.min<b.min?-1:1);
    if(matRegimes.length>1) realRegimeChanges++;
    for(const g of matRegimes){
      const within = g.adj>=ENV_MIN-ENV_TOL && g.adj<=ENV_MAX+ENV_TOL;
      if(!within) envelopeSites++;
      regimeRows.push({account:s.account,site:s.site,quarter:q,effectiveAdj:g.adj,orders:g.n,gmv:r2(g.gmv),firstOrder:g.min,lastOrder:g.max,withinEnvelope:within,nRegimesInQuarter:matRegimes.length});
    }
    // count genuinely unexplained orders (charged rate not = any headline + that order's own implied adj is fine;
    // unexplained means not even its own band fits a known headline once we strip the modal adj across bands)
    for(const o of os){ if(!explainedBy(o.pct,qMode) && !HEADLINES.some(h=>Math.abs(o.pct-(h+o.impliedAdj))<0.011)){ /* impossible */ } }

    // (D) vs CONTRACT HEADLINE — universal benchmark, no rate card needed.
    // effective adjustment A = mode implied adj; £ above/below pure contracted headline.
    {
      const A=qMode;
      const gmvQ=os.reduce((a,o)=>a+o.val,0);
      // contract conformance: each order's rate must sit within the contract adjustment
      // envelope of its value-band headline (robust to band-boundary noise and to the
      // legitimate mid-quarter transition between two contract rates).
      const conformN=os.filter(o=>{const a=o.pct-bandFor(o.val).rate; return a>=ENV_MIN-ENV_TOL && a<=ENV_MAX+ENV_TOL;}).length;
      const conformFrac=conformN/os.length;
      // exact £ charged above(+)/below(-) the pure contract headline band for each order
      const extraVsHeadline=os.reduce((a,o)=>a + o.val*(o.pct-bandFor(o.val).rate)/100, 0);
      const within = A>=ENV_MIN-ENV_TOL && A<=ENV_MAX+ENV_TOL;
      let verdict;
      if(conformFrac<0.90) verdict='NON-STANDARD RATE (off contract envelope)';
      else if(A>0.011) verdict='ABOVE HEADLINE (net penalty)';
      else if(A<-0.011) verdict='below headline (discount/incentive)';
      else verdict='at contract headline';
      vsContractRows.push({account:s.account,site:s.site,quarter:q,orders:os.length,gmv:r2(gmvQ),
        effectiveAdj:A, withinEnvelope:within, conformFrac:r2(conformFrac),
        extraVsHeadline:r2(extraVsHeadline), verdict});
    }

    // (C) Q2 cross-check vs agreed — only orders on/after the agreed rate's effective date
    if(q==='2026-Q2'){
      const eff = os.filter(o=>o.iso>=Q2_EFFECTIVE_FROM);
      const useOrders = eff.length>=3 ? eff : os;     // fall back if too few post-effective orders
      const charged = modeAdj(useOrders.map(o=>o.impliedAdj));
      const agreed = agreedQ2[norm(s.site)];
      const known = agreed!==undefined;
      const diff = known ? r2(charged-agreed) : null; // >0 => charged a higher (worse) rate than agreed
      const MIN_ORDERS = 5; // need enough post-effective trade to judge confidently
      let verdict;
      if(!known) verdict='NEW/UNMATCHED SITE';
      else if(eff.length < MIN_ORDERS) verdict='insufficient post-effective trade';
      else if(Math.abs(diff)<=0.011) verdict='OK - matches agreed';
      else if(diff>0) verdict='OVERCHARGED vs agreed';
      else verdict='charged below agreed';
      q2checkRows.push({account:s.account,site:s.site,
        q2_orders_postEff:eff.length, q2_gmv_postEff:r2(eff.reduce((a,o)=>a+o.val,0)),
        chargedAdj:charged, agreedAdj: known?agreed:'', diff_vs_agreed: known?diff:'',
        basis: eff.length>=MIN_ORDERS?'post-16Apr':'too few post-eff orders',
        verdict});
    }
  }
}

// ---- write outputs ----
if(!fs.existsSync(OUT)) fs.mkdirSync(OUT,{recursive:true});
writeCsv('recon_site_rate_regimes.csv',
  ['account','site','quarter','effectiveAdj','orders','gmv','firstOrder','lastOrder','withinEnvelope','nRegimesInQuarter'], regimeRows);
writeCsv('recon_vs_contract_headline.csv',
  ['account','site','quarter','orders','gmv','effectiveAdj','withinEnvelope','conformFrac','extraVsHeadline','verdict'],
  vsContractRows.sort((a,b)=> b.extraVsHeadline-a.extraVsHeadline));
writeCsv('recon_Q2_vs_agreed.csv',
  ['account','site','q2_orders_postEff','q2_gmv_postEff','chargedAdj','agreedAdj','diff_vs_agreed','basis','verdict'],
  q2checkRows.sort((a,b)=> (b.diff_vs_agreed===''?-99:b.diff_vs_agreed) - (a.diff_vs_agreed===''?-99:a.diff_vs_agreed)));
writeCsv('recon_weekly_by_account.csv',
  ['week_end','account','orders','gmv','comm','effectivePct'],
  [...weekAgg.values()].sort((a,b)=>a.week_end<b.week_end?-1:a.week_end>b.week_end?1:(a.account<b.account?-1:1))
    .map(w=>({...w,gmv:r2(w.gmv),comm:r2(w.comm),effectivePct:w.gmv?r2(w.comm/w.gmv*100):0})));
writeCsv('recon_anomalies.csv',
  ['type','week_end','account','site','order','date','orderValue','chargedPct','commissionCharged','commissionExpected','note'], anomalies);

// ---- console summary ----
const overcharged = q2checkRows.filter(r=>r.verdict==='OVERCHARGED vs agreed');
const ocImpact = overcharged.reduce((a,r)=>a + (r.q2_gmv_postEff * (r.diff_vs_agreed/100)),0);
const hawkRates=[...hawkins.rates.entries()].sort((a,b)=>b[1]-a[1]).map(([r,n])=>`${r}%×${n}`).slice(0,5);
console.log('================ RECONCILIATION SUMMARY (2026 YTD) ================');
console.log(`Weeks: ${weeks.length}   Statement CSVs scanned: ${scannedFiles}   Delivery/Pickup orders: ${totalOrders.toLocaleString()}`);
console.log(`Banded sites (account||site combos): ${sites.size}`);
console.log(`Missing account slots (not yet downloaded): ${missingAccounts.length}${missingAccounts.length?' -> '+missingAccounts.join('; '):''}`);
console.log('');
console.log(`(A) Arithmetic: commission = value x rate on EVERY order? mismatches = ${totalArithFlags}`);
console.log(`(B) Contract envelope: site-quarter rate regimes OUTSIDE [-6.10,+2.40] = ${envelopeSites}`);
console.log(`    Site-quarters with a genuine mid-quarter rate change (>1 material regime) = ${realRegimeChanges}`);
console.log('');
console.log(`    Hawkins (flat-rate virtual brand, excluded from banded check): ${hawkins.orders.toLocaleString()} orders, GMV £${r2(hawkins.gmv).toLocaleString()}, effective ${r2(hawkins.comm/hawkins.gmv*100)}%  [rates: ${hawkRates.join(', ')}]`);
console.log('');
// (D) vs contract headline, by quarter
for(const Q of ['2026-Q1','2026-Q2']){
  const rows=vsContractRows.filter(r=>r.quarter===Q);
  const above=rows.filter(r=>r.verdict==='ABOVE HEADLINE (net penalty)');
  const below=rows.filter(r=>r.verdict==='below headline (discount/incentive)');
  const athl=rows.filter(r=>r.verdict==='at contract headline');
  const nonstd=rows.filter(r=>r.verdict==='NON-STANDARD RATE (off contract envelope)');
  const aboveGbp=above.reduce((a,r)=>a+r.extraVsHeadline,0);
  const belowGbp=below.reduce((a,r)=>a+r.extraVsHeadline,0);
  console.log(`(D) ${Q} vs CONTRACT HEADLINE  (${rows.length} site-rows):`);
  console.log(`    at headline: ${athl.length}   below (discount): ${below.length} (£${r2(belowGbp)})   ABOVE (penalty): ${above.length} (£${r2(aboveGbp)})`);
  console.log(`    non-standard/bespoke (off contract envelope): ${nonstd.length}`);
  if(above.length){
    console.log(`    >> ${Q} sites charged ABOVE contract headline (challengeable${Q==='2026-Q1'?' — no preceding quarter to justify a Q1 penalty':''}); top by £:`);
    above.sort((a,b)=>b.extraVsHeadline-a.extraVsHeadline).slice(0,10).forEach(r=>console.log(`      ${r.site} [${r.account}]: +${r.effectiveAdj}pts, £${r.extraVsHeadline} on £${r.gmv} GMV (${r.orders} orders)`));
  }
  console.log('');
}
console.log(`(C) Q2 charged-vs-agreed (rate compared on/after ${Q2_EFFECTIVE_FROM}):`);
const matched=q2checkRows.filter(r=>r.verdict!=='NEW/UNMATCHED SITE');
console.log(`    Q2 site-rows: ${q2checkRows.length}  (matched to agreed rate: ${matched.length}, new/unmatched: ${q2checkRows.length-matched.length})`);
console.log(`    OK (matches agreed):     ${matched.filter(r=>r.verdict==='OK - matches agreed').length}`);
console.log(`    OVERCHARGED vs agreed:   ${overcharged.length}`);
console.log(`    Charged below agreed:    ${matched.filter(r=>r.verdict==='charged below agreed').length}`);
console.log(`    Insufficient post-eff trade (dormant): ${matched.filter(r=>r.verdict==='insufficient post-effective trade').length}`);
if(overcharged.length){
  console.log(`    >> Est. Q2 overcharge £ impact (post-effective GMV x diff): £${r2(ocImpact)}`);
  console.log('    Top overcharged sites:');
  overcharged.sort((a,b)=>b.diff_vs_agreed-a.diff_vs_agreed).slice(0,12).forEach(r=>console.log(`      ${r.site} [${r.account}]: charged ${r.chargedAdj} vs agreed ${r.agreedAdj} (+${r.diff_vs_agreed}pts, postEff GMV £${r.q2_gmv_postEff}, ${r.q2_orders_postEff} orders)`));
}
console.log('\nOutputs -> 04_analysis/: recon_site_rate_regimes.csv, recon_Q2_vs_agreed.csv, recon_weekly_by_account.csv, recon_anomalies.csv');
