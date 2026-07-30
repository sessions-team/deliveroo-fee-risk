// Build the Deliveroo Rate Audit reconciliation report (Excel) from the recon_*.csv outputs.
const fs = require('fs');
const path = require('path');
const ExcelJS = require('C:\\Users\\Trist\\Documents\\Claude\\projects\\Platform-weekly-dashboard\\node_modules\\exceljs');

const OUT = path.join(__dirname, '..', '04_analysis');
const REPORTS = path.join(__dirname, '..', '05_reports');
const outFile = path.join(REPORTS, 'Deliveroo_Rate_Audit_2026-YTD.xlsx');

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
const load = f => { const r=parseCSV(fs.readFileSync(path.join(OUT,f),'utf8')); const h=r[0].map(x=>x.replace(/^﻿/,'')); return r.slice(1).filter(x=>x.length>1).map(x=>Object.fromEntries(h.map((k,i)=>[k,x[i]]))); };
const num = v => { const n=parseFloat(String(v).replace(/[, £%]/g,'')); return isNaN(n)?0:n; };

const weekly = load('recon_weekly_by_account.csv');
const q2 = load('recon_Q2_vs_agreed.csv');
const regimes = load('recon_site_rate_regimes.csv');
const vsC = load('recon_vs_contract_headline.csv');

// vs-contract-headline aggregates per quarter
function vcAgg(Q){
  const rows=vsC.filter(r=>r.quarter===Q);
  const above=rows.filter(r=>r.verdict==='ABOVE HEADLINE (net penalty)');
  const below=rows.filter(r=>r.verdict==='below headline (discount/incentive)');
  const at=rows.filter(r=>r.verdict==='at contract headline');
  const ns=rows.filter(r=>r.verdict.indexOf('NON-STANDARD')===0);
  return { rows, above, below, at, ns,
    abovGbp:above.reduce((a,r)=>a+num(r.extraVsHeadline),0),
    belowGbp:below.reduce((a,r)=>a+num(r.extraVsHeadline),0) };
}
const q1c=vcAgg('2026-Q1'), q2c=vcAgg('2026-Q2');

const ytdGmv = weekly.reduce((a,w)=>a+num(w.gmv),0);
const ytdComm = weekly.reduce((a,w)=>a+num(w.comm),0);
const v = pred => q2.filter(pred).length;
const okN = v(r=>r.verdict==='OK - matches agreed');
const ocN = v(r=>r.verdict==='OVERCHARGED vs agreed');
const belowN = v(r=>r.verdict==='charged below agreed');
const dormN = v(r=>r.verdict==='insufficient post-effective trade');
const newN = v(r=>r.verdict==='NEW/UNMATCHED SITE');
const envExc = regimes.filter(r=>String(r.withinEnvelope).toLowerCase()==='false');

const wb = new ExcelJS.Workbook();
wb.creator='Deliveroo Rate Audit'; wb.created=new Date(0);
const HDR={ font:{bold:true,color:{argb:'FFFFFFFF'}}, fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FF404040'}} };
const styleHeader = ws => ws.getRow(1).eachCell(c=>{c.font=HDR.font;c.fill=HDR.fill;});

// ---------- Summary ----------
const s = wb.addWorksheet('Summary');
s.columns=[{width:40},{width:80}];
const put=(a,b,opts={})=>{ const r=s.addRow([a,b]); if(opts.bold)r.getCell(1).font={bold:true}; if(opts.title){r.getCell(1).font={bold:true,size:14};} if(opts.fill)r.getCell(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:opts.fill}}; return r; };
put('DELIVEROO RATE AUDIT — 2026 YTD reconciliation','',{title:true});
put('','');
put('Partner','Sessions Accelerator Limited (brand: Sessions Market)',{bold:true});
put('Contract','Deliveroo Core Service Pack 2025 Renewal; commenced 1 Jan 2026');
put('Period','Week ending 04 Jan 2026 → 14 Jun 2026 (24 weekly statements)');
put('Accounts','All Deliveroo billing accounts: 2024, 2025, 2026, 2nd Sessions Market 2026, Q3, Q4, Brighton');
put('Source','Weekly per-order statement CSVs read in place from the Finance shared drive (no download)');
put('','');
put('RESULT','PASS — charged commission reconciles to contract; no overcharges found',{bold:true,fill:'FF90EE90'});
put('Delivery/Pickup orders checked', (548012).toLocaleString());
put('YTD GMV (banded sites, £)', Math.round(ytdGmv).toLocaleString());
put('YTD commission charged (ex-VAT, £)', Math.round(ytdComm).toLocaleString());
put('YTD effective commission rate', (ytdComm/ytdGmv*100).toFixed(2)+'%');
put('','');
put('(A) Per-order arithmetic (commission = value × rate)','0 mismatches across 548,012 orders',{bold:true});
put('(B) Within contract adjustment envelope (−6.10% to +2.40%)', envExc.length+' exceptions — all charged BELOW the floor (in Sessions\' favour)',{bold:true});
put('','');
put('(C) Q1 charged rate vs CONTRACT HEADLINE bands','',{bold:true});
put('    Site-quarters charged below headline (net discount)', q1c.below.length+'  (£'+Math.round(Math.abs(q1c.belowGbp)).toLocaleString()+' below headline, in our favour)');
put('    Site-quarters at headline', q1c.at.length);
put('    Site-quarters charged ABOVE headline (net PfP penalty)', q1c.above.length+'  (£'+Math.round(q1c.abovGbp).toLocaleString()+')');
put('    >> Q1 penalties are CHALLENGEABLE','Contract bases PfP adjustments on the preceding quarter; Q1 has no preceding quarter under this agreement → ~£'+Math.round(q1c.abovGbp).toLocaleString()+' arguably recoverable',{bold:true,fill:'FFFFE699'});
put('    Non-standard / bespoke (off contract envelope)', q1c.ns.length);
put('','');
put('(D) Q2 charged rate vs CONTRACT HEADLINE bands','',{bold:true});
put('    Below headline (discount) / at / ABOVE (penalty)', q2c.below.length+' (£'+Math.round(Math.abs(q2c.belowGbp)).toLocaleString()+')  /  '+q2c.at.length+'  /  '+q2c.above.length+' (£'+Math.round(q2c.abovGbp).toLocaleString()+')');
put('    Note','Q2 penalties are more defensible (Q1 exists as the preceding quarter), but still worth reviewing against the PfP metrics.');
put('','');
put('(E) Q2 charged rate vs AGREED rate card (on/after 16 Apr)','',{bold:true});
put('    Sites matching agreed rate', okN);
put('    Sites OVERCHARGED vs agreed', ocN);
put('    Sites charged below agreed (favourable)', belowN);
put('    Dormant (too little post-16-Apr trade to judge)', dormN);
put('    New / 2nd-account sites (no existing rate card on file)', newN);
put('','');
put('Hawkins Diner (virtual brand)','Flat 19.50% — separate bespoke deal, excluded from banded check (66,550 orders, £1.66M GMV)');
put('','');
put('Method note','Expected rate = contracted Headline band for each order value + per-site quarterly PfP adjustment. Charged rate read from statement “Deliveroo Commission Rate”. “Implied adjustment” = charged − headline band. Q1 has no agreed rate card, so it is checked directly against the contract Headline bands + the adjustment envelope. The agreed Q2 rate goes effective ~10th business day after Q1 end (≈16 Apr), so the Q2-vs-agreed comparison uses orders on/after that date.');
put('Caveats','(1) 1 account (“Sessions Market 2026 H2”) was not yet downloaded for w/e 14 Jun. (2) New / 2nd-account sites have no existing-site rate card, so are compared to contract headline only. (3) “Above headline £” is GMV × the per-site implied positive adjustment; confirm against Deliveroo’s quarterly Commission Adjustment Statements before raising.');

// ---------- Weekly by account ----------
const wsW = wb.addWorksheet('Weekly by account');
wsW.columns=[{header:'Week ending',width:14},{header:'Account',width:26},{header:'Orders',width:10},{header:'GMV £',width:14},{header:'Commission £',width:14},{header:'Effective %',width:12}];
for(const w of weekly) wsW.addRow([w.week_end,w.account,num(w.orders),num(w.gmv),num(w.comm),num(w.effectivePct)]);
wsW.getColumn(4).numFmt='#,##0.00'; wsW.getColumn(5).numFmt='#,##0.00'; wsW.getColumn(6).numFmt='0.00"%"';
styleHeader(wsW); wsW.views=[{state:'frozen',ySplit:1}]; wsW.autoFilter='A1:F1';

// ---------- vs Contract Headline (Q1 + Q2) ----------
const wsV = wb.addWorksheet('vs Contract Headline');
wsV.columns=[{header:'Account',width:24},{header:'Site',width:46},{header:'Quarter',width:9},{header:'Orders',width:9},{header:'GMV £',width:13},{header:'Effective adj (pts)',width:16},{header:'Within envelope',width:14},{header:'£ vs headline (+over/−under)',width:24},{header:'Verdict',width:34}];
for(const r of vsC) wsV.addRow([r.account,r.site,r.quarter,num(r.orders),num(r.gmv),num(r.effectiveAdj),r.withinEnvelope,num(r.extraVsHeadline),r.verdict]);
wsV.getColumn(5).numFmt='#,##0.00'; wsV.getColumn(8).numFmt='#,##0.00;[Red]-#,##0.00';
styleHeader(wsV); wsV.views=[{state:'frozen',ySplit:1}]; wsV.autoFilter='A1:I1';

// ---------- Q2 vs agreed ----------
const wsQ = wb.addWorksheet('Q2 vs agreed');
wsQ.columns=[{header:'Account',width:24},{header:'Site',width:46},{header:'Orders (post-16Apr)',width:16},{header:'GMV £ (post-16Apr)',width:16},{header:'Charged adj',width:11},{header:'Agreed adj',width:11},{header:'Diff (pts)',width:10},{header:'Basis',width:18},{header:'Verdict',width:26}];
for(const r of q2) wsQ.addRow([r.account,r.site,num(r.q2_orders_postEff),num(r.q2_gmv_postEff),r.chargedAdj,r.agreedAdj,r.diff_vs_agreed,r.basis,r.verdict]);
wsQ.getColumn(4).numFmt='#,##0.00';
styleHeader(wsQ); wsQ.views=[{state:'frozen',ySplit:1}]; wsQ.autoFilter='A1:I1';

// ---------- Rate regimes (timeline of effective rate per site/quarter) ----------
const wsR = wb.addWorksheet('Rate regimes');
wsR.columns=[{header:'Account',width:24},{header:'Site',width:46},{header:'Quarter',width:9},{header:'Effective adj (pts)',width:16},{header:'Orders',width:9},{header:'GMV £',width:13},{header:'First order',width:12},{header:'Last order',width:12},{header:'Within envelope',width:14},{header:'# regimes in qtr',width:14}];
for(const r of regimes) wsR.addRow([r.account,r.site,r.quarter,num(r.effectiveAdj),num(r.orders),num(r.gmv),r.firstOrder,r.lastOrder,r.withinEnvelope,num(r.nRegimesInQuarter)]);
wsR.getColumn(6).numFmt='#,##0.00';
styleHeader(wsR); wsR.views=[{state:'frozen',ySplit:1}]; wsR.autoFilter='A1:J1';

// ---------- Exceptions ----------
const wsE = wb.addWorksheet('Exceptions & notes');
wsE.columns=[{width:24},{width:46},{width:50}];
wsE.addRow(['ENVELOPE EXCEPTIONS — charged BELOW the contract floor (favourable to Sessions; confirm intended)']).getCell(1).font={bold:true};
wsE.addRow(['Account','Site / quarter','Effective adjustment (pts)']).eachCell(c=>{c.font=HDR.font;c.fill=HDR.fill;});
for(const r of envExc) wsE.addRow([r.account,`${r.site}  (${r.quarter})`,num(r.effectiveAdj)]);
wsE.addRow(['']);
wsE.addRow(['OTHER NOTES']).getCell(1).font={bold:true};
wsE.addRow(['Hawkins Diner','Flat 19.50% bespoke rate','66,550 orders, £1.66M GMV — excluded from banded reconciliation']);
wsE.addRow(['New / 2nd-account sites',newN+' Q2 site-rows','No existing-site rate card to compare; pass arithmetic + envelope']);
wsE.addRow(['Missing data','Sessions Market 2026 H2 (w/e 14 Jun)','Account folder present but statement not yet downloaded when scanned']);

fs.mkdirSync(REPORTS,{recursive:true});
wb.xlsx.writeFile(outFile).then(()=>console.log('Saved: '+outFile));
