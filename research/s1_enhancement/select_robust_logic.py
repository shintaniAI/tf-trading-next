
#!/usr/bin/env python3
import urllib.request,json,time,datetime,math,statistics,os,csv
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
START=int(datetime.datetime(2010,1,1).timestamp()); END=int(time.time())+86400
OUT='/home/yugo/.hermes/skills/tf-trading/repo/research/s1_enhancement'

def fetch(sym):
    url=f'https://query1.finance.yahoo.com/v8/finance/chart/{sym}?period1={START}&period2={END}&interval=1d'
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':UA}),timeout=60) as r: j=json.load(r)
    res=j['chart']['result'][0]; ts=res['timestamp']; q=res['indicators']['quote'][0]
    bars=[]
    for i,t in enumerate(ts):
        o=q['open'][i]; c=q['close'][i]; h=q['high'][i]; l=q['low'][i]
        if o is None or c is None: continue
        bars.append({'date':datetime.datetime.utcfromtimestamp(t).strftime('%Y-%m-%d'),'open':float(o),'close':float(c),'high':float(h or o),'low':float(l or c)})
    return sorted(bars,key=lambda x:x['date'])

def maxdd(pnls):
    run=peak=0; m=0
    for p in pnls:
        run+=p; peak=max(peak,run); m=min(m,run-peak)
    return m

def metrics(rows, start=None, end=None):
    xs=[r for r in rows if (start is None or r['date']>=start) and (end is None or r['date']<=end)]
    pnls=[r['pnl_yen'] for r in xs]
    wins=sum(p>0 for p in pnls); losses=sum(p<0 for p in pnls); gain=sum(p for p in pnls if p>0); loss=sum(p for p in pnls if p<0)
    total=sum(pnls); dd=maxdd(pnls) if pnls else 0
    return {'trades':len(xs),'total':round(total),'avg':round(total/len(xs),1) if xs else 0,'win':round(wins/(wins+losses)*100,1) if wins+losses else 0,'dd':round(dd),'pf':round(gain/abs(loss),2) if loss<0 else None,'mar':round(total/abs(dd),2) if dd<0 else None}

def by_year(rows):
    d={}
    for r in rows:
        y=r['date'][:4]
        d.setdefault(y,[]).append(r)
    out=[]
    for y in sorted(d):
        m=metrics(d[y]); out.append({'year':y,**m})
    return out

def rolling(rows,horizon):
    pnls=[r['pnl_yen'] for r in rows]
    n=len(pnls)-horizon+1
    if n<=0: return None
    dd=[]; total=[]; positive=0
    for s in range(n):
        seg=pnls[s:s+horizon]
        total.append(sum(seg)); dd.append(abs(maxdd(seg)))
        if sum(seg)>0: positive+=1
    dd_s=sorted(dd); tot_s=sorted(total)
    def pct(arr,p): return arr[min(len(arr)-1, max(0, math.ceil(len(arr)*p/100)-1))]
    return {'n':n,'profit_pct':round(positive/n*100,1),'dd50':round(pct(dd_s,50)),'dd75':round(pct(dd_s,75)),'dd90':round(pct(dd_s,90)),'dd95':round(pct(dd_s,95)),'dd100':round(max(dd_s)),'worst_total':round(min(tot_s)),'median_total':round(pct(tot_s,50))}

def rolling_survival(rows,cap,horizon):
    pnls=[r['pnl_yen'] for r in rows]; n=len(pnls)-horizon+1
    if n<=0: return None
    sv=prof=both=0
    for s in range(n):
        eq=cap; mn=cap
        for p in pnls[s:s+horizon]: eq+=p; mn=min(mn,eq)
        a=mn>0; b=eq>cap
        sv+=a; prof+=b; both+=a and b
    return {'cap':cap,'horizon':horizon,'survive':round(sv/n*100,1),'profit':round(prof/n*100,1),'both':round(both/n*100,1)}

n225=fetch('%5EN225'); dji=fetch('%5EDJI')
prevny=[]; j=0; last=None
for b in n225:
    while j<len(dji) and dji[j]['date']<b['date']:
        last=dji[j]; j+=1
    prevny.append(last)
base=[]
for i,b in enumerate(n225):
    if i==0 or b['date']<'2011-01-01': continue
    prev=n225[i-1]; yube=b['open']-prev['close']
    if yube==0: continue
    ysign=1 if yube>0 else -1
    ny=prevny[i]; nydiff=(ny['close']-ny['open']) if ny else 0
    nysign=1 if nydiff>0 else (-1 if nydiff<0 else 0)
    same=(ysign+nysign)!=0
    pieces_s1=2 if same else 1
    raw_range=b['close']-b['open']
    base.append({'date':b['date'],'gap':abs(yube),'ysign':ysign,'ny_same':same,'pieces_s1':pieces_s1,'range':raw_range})

def make(th, piece_mode='s1', slip=0):
    rows=[]
    for r in base:
        if r['gap']<th: continue
        if piece_mode=='s1': pieces=r['pieces_s1']
        elif piece_mode=='fixed1': pieces=1
        elif piece_mode=='same1': pieces=1 if r['ny_same'] else 1 # same as fixed1; kept explicit
        elif piece_mode=='same2_oppo0':
            if not r['ny_same']: continue
            pieces=2
        elif piece_mode=='same1_oppo0':
            if not r['ny_same']: continue
            pieces=1
        elif piece_mode=='same1_oppo2': pieces=1 if r['ny_same'] else 2
        else: pieces=r['pieces_s1']
        pnl_pt=r['ysign']*pieces*r['range'] - slip*pieces
        rows.append({'date':r['date'],'pnl_yen':pnl_pt*10,'gap':r['gap'],'pieces':pieces})
    return rows

# grid thresholds * piece modes * slippage; rank robust by train+test positive, test MAR, full MAR, enough trades.
thresholds=list(range(0,1001,10))
piece_modes=['s1','fixed1','same2_oppo0','same1_oppo0','same1_oppo2']
slips=[0,10,20]
records=[]
for slip in slips:
  for pm in piece_modes:
    for th in thresholds:
      rows=make(th,pm,slip)
      if len(rows)<30: continue
      full=metrics(rows); train=metrics(rows,end='2020-12-31'); test=metrics(rows,start='2021-01-01')
      yrs=by_year(rows); pos_years=sum(1 for y in yrs if y['total']>0); neg_years=sum(1 for y in yrs if y['total']<0)
      rec={'threshold':th,'piece_mode':pm,'slip':slip,'pos_years':pos_years,'neg_years':neg_years,
           **{f'full_{k}':v for k,v in full.items()}, **{f'train_{k}':v for k,v in train.items()}, **{f'test_{k}':v for k,v in test.items()}}
      records.append(rec)

# robust candidates slip=0, test/train positive, no too few trades, not too overfit: test and train MAR positive, >=150 full, >=50 test
cands=[r for r in records if r['slip']==0 and r['full_trades']>=120 and r['test_trades']>=50 and r['train_total']>0 and r['test_total']>0 and r['neg_years']<=5]
# Score: maximize test MAR+full MAR+win but penalize low total/trades? Generate top by risk-adjusted and practical balance.
def score(r):
    return (r['test_mar'] or 0)*1.5 + (r['full_mar'] or 0)*1.0 + r['test_win']/10 + min(r['test_total']/100000,15)*0.7 - max(0,150-r['test_trades'])*0.03
ranked=sorted(cands,key=score,reverse=True)[:30]
# practical candidates choose thresholds 250-450 mode s1, fixed1
practical=[]
for th in [100,200,250,300,350,380,400,450,500]:
  for pm in ['s1','fixed1']:
    for slip in [0,10,20]:
      r=next((x for x in records if x['threshold']==th and x['piece_mode']==pm and x['slip']==slip),None)
      if r: practical.append(r)
# detailed for finalists
final_specs=[('baseline_s1',0,'s1'),('safe_400_s1',400,'s1'),('balanced_300_s1',300,'s1'),('safe_400_fixed1',400,'fixed1'),('balanced_300_fixed1',300,'fixed1'),('aggressive_100_s1',100,'s1')]
finals=[]
for name,th,pm in final_specs:
    rows=make(th,pm,0)
    obj={'name':name,'threshold':th,'piece_mode':pm,'full':metrics(rows),'train':metrics(rows,end='2020-12-31'),'test':metrics(rows,start='2021-01-01'),'yearly':by_year(rows),'roll1':rolling(rows,252),'roll3':rolling(rows,756),'survival':[]}
    for cap in [30000,50000,100000,150000,300000]:
      for h in [252,756,1260]:
        s=rolling_survival(rows,cap,h)
        if s: obj['survival'].append(s)
    # slippage sensitivity
    obj['slippage']={}
    for slip in [0,5,10,20,30,50]:
        obj['slippage'][str(slip)]=metrics(make(th,pm,slip),start='2021-01-01')
    finals.append(obj)
# save
os.makedirs(OUT,exist_ok=True)
with open(os.path.join(OUT,'robust_logic_selection.json'),'w',encoding='utf-8') as f:
    json.dump({'generated_at':datetime.datetime.now().isoformat(),'period':[base[0]['date'],base[-1]['date']],'top_ranked':ranked,'practical':practical,'finals':finals},f,ensure_ascii=False,indent=2)
# markdown report
md=[]
md.append('# S1 強化ロジック選定（15年データ・数値ベース）')
md.append(f"generated: {datetime.datetime.now().isoformat()}")
md.append(f"period: {base[0]['date']}〜{base[-1]['date']} / base trades={len(base)}")
md.append('')
md.append('## 比較したもの')
md.append('- ギャップ絶対額しきい値: 0〜1000円を10円刻み')
md.append('- 枚数ロジック: S1標準（NY同方向2倍）/ 常に1倍 / NY同方向だけ取引')
md.append('- 約定ズレ: 0pt / 10pt / 20pt 不利')
md.append('- 検証: 2011〜2020(train), 2021〜2026(test), 年別, rolling 1年/3年')
md.append('')
md.append('## スコア上位（過剰最適化を軽く弾いた候補）')
md.append('|rank|条件|枚数|full利益|fullDD|full勝率|test利益|testDD|test勝率|test MAR|年負け数|')
md.append('|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|')
for i,r in enumerate(ranked[:15],1):
    md.append(f"|{i}|{r['threshold']}円未満無視|{r['piece_mode']}|{r['full_total']:,}|{r['full_dd']:,}|{r['full_win']}%|{r['test_total']:,}|{r['test_dd']:,}|{r['test_win']}%|{r['test_mar']}|{r['neg_years']}|")
md.append('')
md.append('## 最終候補サマリ')
md.append('|候補|条件|枚数|15年利益|15年DD|15年勝率|2021-26利益|2021-26DD|2021-26勝率|3年rolling利益プラス率|3年rolling最大DD|')
md.append('|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|')
for f in finals:
    r3=f['roll3'] or {}
    profit_pct = r3.get('profit_pct') if r3.get('profit_pct') is not None else '-'
    dd100 = f"{r3.get('dd100'):,}" if r3.get('dd100') is not None else '-'
    md.append(f"|{f['name']}|{f['threshold']}円未満無視|{f['piece_mode']}|{f['full']['total']:,}|{f['full']['dd']:,}|{f['full']['win']}%|{f['test']['total']:,}|{f['test']['dd']:,}|{f['test']['win']}%|{profit_pct}%|{dd100}|")
md.append('')
md.append('## finalist: 2021-2026 スリッページ耐性')
md.append('|候補|0pt利益/DD/勝率|10pt利益/DD/勝率|20pt利益/DD/勝率|30pt利益/DD/勝率|50pt利益/DD/勝率|')
md.append('|---|---:|---:|---:|---:|---:|')
for f in finals:
    cells=[]
    for slip in ['0','10','20','30','50']:
        m=f['slippage'][slip]
        cells.append(f"{m['total']:,}/{m['dd']:,}/{m['win']}%")
    md.append(f"|{f['name']}|"+'|'.join(cells)+'|')
md.append('')
md.append('## 年別（主要候補）')
for f in finals[:4]:
    md.append(f"### {f['name']}")
    md.append('|年|取引|利益|DD|勝率|')
    md.append('|---|---:|---:|---:|---:|')
    for y in f['yearly']:
        md.append(f"|{y['year']}|{y['trades']}|{y['total']:,}|{y['dd']:,}|{y['win']}%|")
    md.append('')
open(os.path.join(OUT,'robust_logic_selection.md'),'w',encoding='utf-8').write('\n'.join(md)+'\n')
print('\n'.join(md[:120]))
print('FILES', os.path.join(OUT,'robust_logic_selection.md'), os.path.join(OUT,'robust_logic_selection.json'))
