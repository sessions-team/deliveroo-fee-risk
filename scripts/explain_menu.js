// Explain the rate calc for one menu across the rolling-4 weeks. Usage: node explain_menu.js "<substring>"
const fs=require('fs'),path=require('path');
const { discoverWeeks } = require('C:\\Users\\Trist\\Documents\\Claude\\projects\\Platform-weekly-dashboard\\scripts\\weeks.js');
const NEEDLE=(process.argv[2]||'herbies pizza').toLowerCase();

const BANDS=[[12,32.59],[14,31.59],[16,30.00],[18,28.78],[20,27.82],[22,27.04],[24,26.40],[26,25.86],[Infinity,25.62]];
const headlineFor=v=>{for(const[m,r]of BANDS)if(v<m)return r;return 25.62;};
const bandLabel=v=>{const i=BANDS.findIndex(([m])=>v<m);const lo=i===0?0:BANDS[i-1][0];const hi=BANDS[i][0];return hi===Infinity?'£'+lo+'+':'£'+lo+'–'+hi;};
function parseCSV(t){const rows=[];let row=[],f='',i=0,q=false;while(i<t.length){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i+=2;continue;}q=false;i++;continue;}f+=c;i++;continue;}if(c==='"'){q=true;i++;continue;}if(c===','){row.push(f);f='';i++;continue;}if(c==='\r'){i++;continue;}if(c==='\n'){row.push(f);rows.push(row);row=[];f='';i++;continue;}f+=c;i++;}if(f.length||row.length){row.push(f);rows.push(row);}return rows;}
const num=v=>{if(v==null||v==='')return 0;const n=parseFloat(String(v).replace(/[, £]/g,''));return isNaN(n)?0:n;};
const parseRate=s=>{const m=String(s||'').match(/(-?\d+(?:\.\d+)?)\s*%/);return m?parseFloat(m[1]):null;};
const r2=n=>Math.round(n*100)/100;
const mode=a=>{const m=new Map();for(const x of a){const k=x.toFixed(2);m.set(k,(m.get(k)||0)+1);}let b=null,bn=-1;for(const[k,n]of m)if(n>bn){bn=n;b=parseFloat(k);}return b;};

const NEW_CARD_ADJ=-1.50;
const weeks=discoverWeeks('26').filter(w=>w.week_end>='2026-01-04');
const rolling4=weeks.slice(-4).map(w=>w.week_end);
console.log('Rolling-4 weeks:',rolling4.join(', '),'\nMatching menus containing:',JSON.stringify(NEEDLE),'\n');

for(const wkEnd of rolling4){
  const w=weeks.find(x=>x.week_end===wkEnd);
  const byMenu={};
  for(const {account,path:p} of w.deliveroo){
    const rows=parseCSV(fs.readFileSync(p,'utf8'));
    for(let r=2;r<rows.length;r++){const c=rows[r];if(c.length<11)continue;
      if(c[3]!=='Delivery')continue;
      if(!c[0].toLowerCase().includes(NEEDLE))continue;
      const val=num(c[4]),pct=parseRate(c[6]),comm=Math.abs(num(c[7]));
      if(pct==null||val<=0)continue;
      (byMenu[account+' || '+c[0]]=byMenu[account+' || '+c[0]]||[]).push({val,pct,comm});
    }
  }
  for(const key of Object.keys(byMenu)){
    const os=byMenu[key];
    const adjs=os.map(o=>r2(o.pct-headlineFor(o.val)));
    const mAdj=mode(adjs);
    const gmv=os.reduce((a,o)=>a+o.val,0), tot=os.reduce((a,o)=>a+o.comm,0);
    const eff=tot/gmv*100;
    console.log('=== '+wkEnd+'  '+key+'  ('+os.length+' delivery orders) ===');
    console.log('  sample orders (value -> band headline / charged rate / implied adj):');
    os.slice(0,8).forEach(o=>console.log('    £'+o.val.toFixed(2).padStart(6)+'  band '+bandLabel(o.val).padEnd(8)+' headline '+headlineFor(o.val).toFixed(2)+'%  charged '+o.pct.toFixed(2)+'%  adj '+r2(o.pct-headlineFor(o.val)).toFixed(2)));
    const distinct=[...new Set(adjs.map(a=>a.toFixed(2)))].sort();
    console.log('  distinct implied adjustments this week: '+distinct.join(', '));
    console.log('  MODE charged adjustment: '+mAdj.toFixed(2)+' pts   |   New Q2 rate card adj: '+NEW_CARD_ADJ.toFixed(2)+' pts   |   diff: '+r2(mAdj-NEW_CARD_ADJ).toFixed(2)+' pts');
    console.log('  GMV £'+r2(gmv)+'  commission £'+r2(tot)+'  actual effective rate '+r2(eff)+'%   should-be (card) '+r2(eff+(NEW_CARD_ADJ-mAdj))+'%');
    console.log('  £ impact this week (over/under vs card) = GMV × (charged−card)/100 = '+r2(gmv*(mAdj-NEW_CARD_ADJ)/100)+'\n');
  }
}
