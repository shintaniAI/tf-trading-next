
#!/usr/bin/env python3
# Tiered gap sizing scan: gap bands with different piece caps
import urllib.request,json,time,datetime,math,os,itertools
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
START=int(datetime.datetime(2010,1,1).timestamp()); END=int(time.time())+86400
OUT='/home/yugo/.hermes/skills/tf-trading/repo/research/s1_enhancement'
def fetch(sym):
    url=f'https://query1.finance.yahoo.com/v8/finance/chart/{sym}?period1={START}&period2={END}&interval=1d'
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':UA}),timeout=60) as r: j=json.load(r)
    res=j['chart']['result'][0]; ts=res['timestamp']; q=res['indicators']['quote'][0]
    bars=[]
    for i,t in enumerate(ts):
        o=q['open'][i]; c=q['close'][i]
        if o is None or c is None: continue
        bars.append({'date':datetime.datetime.utcfromtimestamp(t).strftime('%Y-%m-%d'),'open':float(o),'close':float(c)})
    return sorted(bars,key=lambda x:x['date'])
def maxdd(pnls):
    run=peak=0; m=0
    for p in pnls:
        run+=p; peak=max(peak,run); m=min(m,run-peak)
    return m
def metrics(rows,start=None,end=None):
    xs=[r for r in rows if (not start or r['date']>=start) and (not end or r['date']<=end)]
    pnls=[r['pnl_yen'] for r in xs]
    wins=sum(p>0 for p in pnls); losses=sum(p<0 for p in pnls); gain=sum(p for p in pnls if p>0); loss=sum(p for p in pnls if p<0); dd=maxdd(pnls) if pnls else 0; total=sum(pnls)
    return {'trades':len(xs),'total':round(total),'win':round(wins/(wins+losses)*100,1) if wins+losses else 0,'dd':round(dd),'pf':round(gain/abs(loss),2) if loss<0 else None,'mar':round(total/abs(dd),2) if dd<0 else None}
def by_year(rows):
    ys={}
    for r in rows: ys.setdefault(r['date'][:4],[]).append(r)
    return {y:metrics(v) for y,v in sorted(ys.items())}
n225=fetch('%5EN225'); dji=fetch('%5EDJI')
prevny=[]; j=0; last=None
for b in n225:
    while j<len(dji) and dji[j]['date']<b['date']:
        last=dji[j]; j+=1
    prevny.append(last)
base=[]
for i,b in enumerate(n225):
    if i==0 or b['date']<'2011-01-01': continue
    prev=n225[i-1]; gap=b['open']-prev['close']
    if gap==0: continue
    ysign=1 if gap>0 else -1
    ny=prevny[i]; nydiff=(ny['close']-ny['open']) if ny else 0
    nysign=1 if nydiff>0 else (-1 if nydiff<0 else 0)
    s1pieces=2 if (ysign+nysign)!=0 else 1
    base.append({'date':b['date'],'gap':abs(gap),'ysign':ysign,'range':b['close']-b['open'],'s1pieces':s1pieces})

def make_policy(policy, slip=0):
    rows=[]
    for r in base:
        pieces=policy(r)
        if pieces<=0: continue
        pnl_pt=r['ysign']*pieces*r['range'] - slip*pieces
        rows.append({'date':r['date'],'pnl_yen':pnl_pt*10,'pieces':pieces,'gap':r['gap']})
    return rows
policies={
'baseline_s1': lambda r:r['s1pieces'],
'gap100_s1': lambda r:r['s1pieces'] if r['gap']>=100 else 0,
'gap200_s1': lambda r:r['s1pieces'] if r['gap']>=200 else 0,
'gap300_s1': lambda r:r['s1pieces'] if r['gap']>=300 else 0,
'gap400_s1': lambda r:r['s1pieces'] if r['gap']>=400 else 0,
'gap300_fixed1': lambda r:1 if r['gap']>=300 else 0,
'gap400_fixed1': lambda r:1 if r['gap']>=400 else 0,
# tiered: weaker band fixed1, strong band S1 2x allowed
'tier100fixed_300s1': lambda r:(r['s1pieces'] if r['gap']>=300 else (1 if r['gap']>=100 else 0)),
'tier200fixed_400s1': lambda r:(r['s1pieces'] if r['gap']>=400 else (1 if r['gap']>=200 else 0)),
'tier300fixed_500s1': lambda r:(r['s1pieces'] if r['gap']>=500 else (1 if r['gap']>=300 else 0)),
# graduated more conservative: 100-299 fixed1, >=300 fixed1 too (same as gap100 fixed1)
'gap100_fixed1': lambda r:1 if r['gap']>=100 else 0,
'gap200_fixed1': lambda r:1 if r['gap']>=200 else 0,
}
results=[]
for name,fn in policies.items():
    obj={'name':name}
    for slip in [0,10,20,30,50]:
        rows=make_policy(fn,slip)
        obj[f'slip{slip}_full']=metrics(rows)
        obj[f'slip{slip}_test']=metrics(rows,start='2021-01-01')
    rows=make_policy(fn,0)
    yr=by_year(rows)
    obj['yearly']=yr
    obj['neg_years']=sum(1 for y,m in yr.items() if m['total']<0)
    results.append(obj)
# rank by practical: test total high, dd low, slippage robust, neg years low
rank=sorted(results,key=lambda x: ((x['slip20_test']['mar'] or 0), x['slip20_test']['total'], -x['neg_years']), reverse=True)
open(os.path.join(OUT,'tiered_gap_policy_scan.json'),'w',encoding='utf-8').write(json.dumps({'generated_at':datetime.datetime.now().isoformat(),'results':results,'rank':rank},ensure_ascii=False,indent=2))
md=[]
md.append('# 段階式ギャップ枚数ロジック比較')
md.append('|rank|policy|15年利益|15年DD|15年勝率|2021-26利益|2021-26DD|2021-26勝率|20pt後test利益|20pt後testDD|20pt後勝率|負け年数|')
md.append('|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
for i,r in enumerate(rank,1):
    f=r['slip0_full']; t=r['slip0_test']; s=r['slip20_test']
    md.append(f"|{i}|{r['name']}|{f['total']:,}|{f['dd']:,}|{f['win']}%|{t['total']:,}|{t['dd']:,}|{t['win']}%|{s['total']:,}|{s['dd']:,}|{s['win']}%|{r['neg_years']}|")
open(os.path.join(OUT,'tiered_gap_policy_scan.md'),'w',encoding='utf-8').write('\n'.join(md)+'\n')
print('\n'.join(md))
