"""Bounded read-only public-site load check. No authentication or mutations."""
import concurrent.futures, csv, datetime, json, math, pathlib, ssl, threading, time, urllib.request, urllib.error
TARGETS = [
 ('landing','https://evalcueai.com/'),('pricing','https://evalcueai.com/plans'),
 ('terms','https://evalcueai.com/terms'),('practice','https://practice.evalcueai.com/practice'),
 ('hire','https://hiring.evalcueai.com/hire'),('liveness','https://api.evalcueai.com/health/liveness'),
 ('readiness','https://api.evalcueai.com/health/readiness'),('catalog','https://api.evalcueai.com/api/billing/catalog')]
OUTPUT=pathlib.Path(__file__).resolve().parents[1]/'docs/load-testing'
OUTPUT.mkdir(exist_ok=True)
rows=[]; lock=threading.Lock(); stop=threading.Event(); counter=0
started=datetime.datetime.now(datetime.timezone.utc).isoformat()
def worker(stage, deadline):
 global counter
 while time.monotonic()<deadline and not stop.is_set():
  with lock:
   if counter>=180:return
   index=counter;counter+=1
  name,url=TARGETS[index%len(TARGETS)]; start=time.monotonic(); status=0; size=0; error=''; valid=False; cache=''; final=url
  try:
   req=urllib.request.Request(url,headers={'User-Agent':'EvalcueAI-Authorized-Public-LoadCheck/1.0'})
   with urllib.request.urlopen(req,timeout=10,context=ssl.create_default_context()) as response:
    status=response.status; body=response.read(2_000_000);size=len(body);final=response.url;cache=response.headers.get('cache-status','')
    valid=status==200 and (b'<html' in body.lower() if name not in ['liveness','readiness','catalog'] else isinstance(json.loads(body),dict))
    if name=='catalog' and valid:valid='prices' in json.loads(body)
  except urllib.error.HTTPError as e:status=e.code;error=str(e)
  except Exception as e:error=type(e).__name__+': '+str(e)
  row=dict(stage=stage,target=name,url=url,status=status,latency_ms=round((time.monotonic()-start)*1000,2),bytes=size,valid=valid,error=error,cache=cache,final_url=final)
  with lock:
   rows.append(row)
   recent=rows[-20:]
   if len(recent)==20 and sum(not r['valid'] for r in recent)>=4:stop.set()
  time.sleep(.75)
for concurrency in [1,3,5]:
 if stop.is_set():break
 start=time.monotonic();deadline=start+12
 with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as pool:
  list(pool.map(lambda _:worker(concurrency,deadline),range(concurrency)))
 print(json.dumps({'stage':concurrency,'elapsed_s':round(time.monotonic()-start,2),'requests':sum(r['stage']==concurrency for r in rows),'stopped':stop.is_set()}),flush=True)
def stats(items):
 values=sorted(r['latency_ms'] for r in items)
 return {'requests':len(items),'failures':sum(not r['valid'] for r in items),'p50_ms':values[math.ceil(len(values)*.5)-1],'p95_ms':values[math.ceil(len(values)*.95)-1],'max_ms':max(values)} if items else {}
summary={'started_utc':started,'finished_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'method':{'concurrency':[1,3,5],'stage_duration_seconds':12,'worker_pause_seconds':.75,'request_cap':180,'timeout_seconds':10,'stop_threshold':'4 invalid responses in last 20'},'stopped_early':stop.is_set(),'overall':stats(rows),'targets':{name:stats([r for r in rows if r['target']==name]) for name,_ in TARGETS},'stages':{str(c):stats([r for r in rows if r['stage']==c]) for c in [1,3,5]}}
(OUTPUT/'public-load-results.json').write_text(json.dumps(summary,indent=2)+'\n')
with (OUTPUT/'public-load-requests.csv').open('w') as f:
 writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
print(json.dumps(summary['overall']),flush=True)
