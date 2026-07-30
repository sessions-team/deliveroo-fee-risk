// Minimal static file server for previewing the HTML dashboard. Serves 05_reports/.
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..','05_reports');
const PORT=8137;
const TYPES={'.html':'text/html','.json':'application/json','.csv':'text/csv'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]);
  if(p==='/'||p==='') p='/Deliveroo_Q2_Rate_Tracker.html';
  const f=path.join(ROOT,p);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)){ res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200,{'content-type':TYPES[path.extname(f)]||'application/octet-stream'});
  fs.createReadStream(f).pipe(res);
}).listen(PORT,()=>console.log('serving '+ROOT+' on http://localhost:'+PORT));
