
#!/usr/bin/env python3
import urllib.request, json, time, datetime, math, itertools, statistics, os
from collections import defaultdict
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
START=int(datetime.datetime(2010,1,1).timestamp())
END=int(time.time())+86400

def fetch(sym):
    url=f'https://query1.finance.yahoo.com/v8/finance/chart/{sym}?period1={START}&period2={END}&interval=1d'
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':UA}),timeout=60) as r:
        j=json.load(r)
    res=j['chart']['result'][0]; ts=res['timestamp']; q=res['indicators']['quote'][0]
    bars=[]
    for i,t in enumerate(ts):
        o=q['open'][i]; c=q['close'][i]; h=q['high'][i]; l=q['low'][i]
        if o is None or c is None: continue
        bars.append({'date':datetime.datetime.utcfromtimestamp(t).strftime('%Y-%m-%d'),'open':float(o),'high':float(h or o),'low':float(l or c),'close':float(c)})
    return sorted(bars,key=lambda x:x['date'])

def sma(vals,n):
    out=[]; s=0
    for i,v in enumerate(vals):
        s += v
        if i>=n: s -= vals[i-n]
        out.append(s/n if i>=n-1 else None)
    return out

def stdev(vals,n):
    out=[]
    for i in range(len(vals)):
        if i<n-1: out.append(None)
        else:
            xs=vals[i-n+1:i+1]
            out.append(statistics.pstdev(xs))
    return out

def percentile_rank(hist, x):
    hist=[v for v in hist if v is not None]
    if not hist: return None
    return sum(1 for v in hist if v<=x)/len(hist)

def maxdd(pnls):
    run=peak=0; m=0
    for p in pnls:
        run += p; peak=max(peak,run); m=min(m,run-peak)
    return m

def metrics(rows, start=None, end=None, cap=100000):
    xs=[r for r in rows if (start is None or r['date']>=start) and (end is None or r['date']<=end)]
    pnls=[r['pnl_yen'] for r in xs]
    total=sum(pnls); dd=maxdd(pnls); wins=sum(1 for p in pnls if p>0); losses=sum(1 for p in pnls if p<0)
    eq=cap; mn=cap
    for p in pnls:
        eq += p; mn=min(mn,eq)
    return {'trades':len(xs),'total_yen':round(total),'avg_yen':round(total/len(xs),1) if xs else 0,'winrate':round(wins/(wins+losses)*100,1) if wins+losses else 0,'maxdd_yen':round(dd),'pf':round(sum(p for p in pnls if p>0)/abs(sum(p for p in pnls if p<0)),3) if sum(p for p in pnls if p<0)<0 else None,'survive_10万':mn>0,'min_equity_10万':round(mn),'mar':round(total/abs(dd),2) if dd else None}

def rolling_survival(rows, cap, horizon=252):
    pnls=[r['pnl_yen'] for r in rows]
    n=max(0,len(pnls)-horizon+1)
    if n==0: return None
    sv=prof=both=0
    for s in range(n):
        eq=cap; mn=cap
        for p in pnls[s:s+horizon]:
            eq+=p; mn=min(mn,eq)
        a=mn>0; b=eq>cap
        sv+=a; prof+=b; both+=a and b
    return {'n':n,'survive_pct':round(sv/n*100,1),'profit_pct':round(prof/n*100,1),'both_pct':round(both/n*100,1)}

n225=fetch('%5EN225'); dji=fetch('%5EDJI')
dji_map={b['date']:b for b in dji}
# previous NY bar helper
prevny=[]; j=0; last=None
for b in n225:
    while j<len(dji) and dji[j]['date']<b['date']:
        last=dji[j]; j+=1
    prevny.append(last)
cl=[b['close'] for b in n225]; op=[b['open'] for b in n225]
ma5=sma(cl,5); ma20=sma(cl,20); ma60=sma(cl,60); ma200=sma(cl,200)
# realized volatility of close-close returns in pt and gap size percentile
rets=[None]+[cl[i]-cl[i-1] for i in range(1,len(cl))]
vol5=stdev([r or 0 for r in rets],5); vol20=stdev([r or 0 for r in rets],20)
rows=[]
prev_pnls=[]
for i,b in enumerate(n225):
    if i==0 or b['date']<'2011-01-01': continue
    prev=n225[i-1]; ny=prevny[i]
    yube=b['open']-prev['close']
    if yube==0: continue
    ysign=1 if yube>0 else -1
    nydiff=(ny['close']-ny['open']) if ny else 0
    nysign=1 if nydiff>0 else (-1 if nydiff<0 else 0)
    pieces=1 if (ysign+nysign)==0 else 2
    rng=b['close']-b['open']
    pnl=ysign*pieces*rng*10
    # features known at open: previous data + today's open gap + yesterday close
    gap_abs=abs(yube)
    hist_gaps=[abs(n225[k]['open']-n225[k-1]['close']) for k in range(max(1,i-252), i)]
    gap_pr=percentile_rank(hist_gaps,gap_abs)
    prev_ret=prev['close']-n225[i-2]['close'] if i>=2 else 0
    trend20=prev['close']-(ma20[i-1] or prev['close'])
    trend60=prev['close']-(ma60[i-1] or prev['close'])
    trend200=prev['close']-(ma200[i-1] or prev['close'])
    z_gap=yube/(vol20[i-1] or 1)
    dow=datetime.datetime.strptime(b['date'],'%Y-%m-%d').weekday()
    rows.append({'date':b['date'],'pnl_yen':pnl,'pnl_pt':pnl/10,'base_pieces':pieces,'yube':yube,'yube_sign':ysign,'nydiff':nydiff,'ny_sign':nysign,'range':rng,'dow':dow,'gap_abs':gap_abs,'gap_pr':gap_pr,'z_gap':z_gap,'prev_ret':prev_ret,'trend20':trend20,'trend60':trend60,'trend200':trend200,'above20':prev['close']>(ma20[i-1] or prev['close']),'above60':prev['close']>(ma60[i-1] or prev['close']),'above200':prev['close']>(ma200[i-1] or prev['close']),'vol20':vol20[i-1], 'vol5':vol5[i-1]})

# candidate policies: keep S1 direction, change trade/skip and pieces scaling based on features.
def apply_policy(name, fn):
    out=[]
    for idx,r in enumerate(rows):
        mult=fn(r, idx)
        if mult==0: continue
        rr=dict(r); rr['pnl_yen']=r['pnl_yen']*mult; rr['policy_mult']=mult; out.append(rr)
    return name,out

policies=[]
# baseline
policies.append(apply_policy('baseline_S1', lambda r,i:1))
# gap filters
for th in [0.1,0.2,0.3,0.5,0.7,0.8,0.9]:
    policies.append(apply_policy(f'trade_gap_pr_ge_{th}', lambda r,i,th=th: 1 if (r['gap_pr'] is not None and r['gap_pr']>=th) else 0))
    policies.append(apply_policy(f'skip_gap_pr_ge_{th}', lambda r,i,th=th: 0 if (r['gap_pr'] is not None and r['gap_pr']>=th) else 1))
for abs_th in [50,100,150,200,300,500,800,1000]:
    policies.append(apply_policy(f'trade_abs_gap_ge_{abs_th}', lambda r,i,th=abs_th: 1 if r['gap_abs']>=th else 0))
    policies.append(apply_policy(f'skip_abs_gap_ge_{abs_th}', lambda r,i,th=abs_th: 0 if r['gap_abs']>=th else 1))
# NY agreement/disagreement only
policies.append(apply_policy('only_yube_ny_same_2x_days', lambda r,i:1 if r['base_pieces']==2 else 0))
policies.append(apply_policy('only_yube_ny_opposite_1x_days', lambda r,i:1 if r['base_pieces']==1 else 0))
policies.append(apply_policy('same_day_1x_not_2x', lambda r,i:0.5 if r['base_pieces']==2 else 1))
policies.append(apply_policy('opposite_day_double', lambda r,i:2 if r['base_pieces']==1 else 1))
# trend filters
for ma in [20,60,200]:
    policies.append(apply_policy(f'long_only_above_ma{ma}_short_only_below', lambda r,i,ma=ma: 1 if ((r['yube_sign']>0 and r[f'above{ma}']) or (r['yube_sign']<0 and not r[f'above{ma}'])) else 0))
    policies.append(apply_policy(f'avoid_long_above_ma{ma}_short_below', lambda r,i,ma=ma: 0 if ((r['yube_sign']>0 and r[f'above{ma}']) or (r['yube_sign']<0 and not r[f'above{ma}'])) else 1))
# previous day reversal/momentum
policies.append(apply_policy('only_after_prev_up', lambda r,i:1 if r['prev_ret']>0 else 0))
policies.append(apply_policy('only_after_prev_down', lambda r,i:1 if r['prev_ret']<0 else 0))
policies.append(apply_policy('skip_after_prev_big_abs_500', lambda r,i:0 if abs(r['prev_ret'])>=500 else 1))
# day of week skip/only
for d,name in enumerate(['Mon','Tue','Wed','Thu','Fri']):
    policies.append(apply_policy(f'skip_{name}', lambda r,i,d=d:0 if r['dow']==d else 1))
    policies.append(apply_policy(f'only_{name}', lambda r,i,d=d:1 if r['dow']==d else 0))
# loss streak throttle using previous policy pnl (baseline decisions): after 1/2 losses skip or half
policies.append(apply_policy('skip_after_1_loss', lambda r,i: 0 if i>=1 and rows[i-1]['pnl_yen']<0 else 1))
policies.append(apply_policy('skip_after_2_losses', lambda r,i: 0 if i>=2 and rows[i-1]['pnl_yen']<0 and rows[i-2]['pnl_yen']<0 else 1))
policies.append(apply_policy('half_after_1_loss', lambda r,i: 0.5 if i>=1 and rows[i-1]['pnl_yen']<0 else 1))
# combined simple robust candidates
for gap_th in [0.1,0.2,0.3,0.8,0.9]:
  for ma in [20,60,200]:
    policies.append(apply_policy(f'gap_ge_{gap_th}_and_trend_ma{ma}', lambda r,i,gap_th=gap_th,ma=ma: 1 if (r['gap_pr'] is not None and r['gap_pr']>=gap_th and ((r['yube_sign']>0 and r[f'above{ma}']) or (r['yube_sign']<0 and not r[f'above{ma}']))) else 0))
# evaluate train/test and full
results=[]
for name,out in policies:
    if len(out)<30: continue
    full=metrics(out)
    train=metrics(out,end='2020-12-31')
    test=metrics(out,start='2021-01-01')
    post20=metrics(out,start='2020-01-01')
    surv_1=rolling_survival(out,100000,252)
    surv_3=rolling_survival(out,100000,756)
    results.append({'name':name,'full':full,'train_2011_2020':train,'test_2021_2026':test,'post2020':post20,'survival_10万_1y':surv_1,'survival_10万_3y':surv_3})
# rank by test MAR then full MAR and trades enough
ranked=sorted(results,key=lambda x: ((x['test_2021_2026']['mar'] or -999), x['test_2021_2026']['total_yen'], -(abs(x['test_2021_2026']['maxdd_yen']))), reverse=True)
base=next(x for x in results if x['name']=='baseline_S1')
summary={'generated_at':datetime.datetime.now().isoformat(),'data_period':[rows[0]['date'],rows[-1]['date']],'baseline':base,'top_by_test_mar':ranked[:30]}
os.makedirs('/home/yugo/.hermes/skills/tf-trading/repo/research/s1_enhancement', exist_ok=True)
with open('/home/yugo/.hermes/skills/tf-trading/repo/research/s1_enhancement/initial_policy_scan.json','w',encoding='utf-8') as f:
    json.dump(summary,f,ensure_ascii=False,indent=2)
# markdown quick report
md=[]
md.append('# S1 enhancement initial policy scan')
md.append(f"generated: {summary['generated_at']}")
md.append(f"data: {rows[0]['date']} to {rows[-1]['date']}, trades={len(rows)}")
md.append('## Baseline')
for k,v in base.items():
    if k!='name': md.append(f'- {k}: `{v}`')
md.append('## Top candidates by 2021-2026 MAR')
md.append('|rank|policy|test trades|test total|test DD|test MAR|test win|full total|full DD|full MAR|')
md.append('|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|')
for idx,r in enumerate(ranked[:20],1):
    t=r['test_2021_2026']; f=r['full']
    md.append(f"|{idx}|{r['name']}|{t['trades']}|{t['total_yen']:,}|{t['maxdd_yen']:,}|{t['mar']}|{t['winrate']}%|{f['total_yen']:,}|{f['maxdd_yen']:,}|{f['mar']}|")
with open('/home/yugo/.hermes/skills/tf-trading/repo/research/s1_enhancement/initial_policy_scan.md','w',encoding='utf-8') as f:
    f.write('\n'.join(md)+'\n')
print('\n'.join(md[:35]))
