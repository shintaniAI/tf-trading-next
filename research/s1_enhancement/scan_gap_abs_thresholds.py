
#!/usr/bin/env python3
import urllib.request, json, time, datetime, math, statistics, csv, os
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
START=int(datetime.datetime(2010,1,1).timestamp())
END=int(time.time())+86400
OUT='/home/yugo/.hermes/skills/tf-trading/repo/research/s1_enhancement'

def fetch(sym):
    url=f'https://query1.finance.yahoo.com/v8/finance/chart/{sym}?period1={START}&period2={END}&interval=1d'
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':UA}),timeout=60) as r:
        j=json.load(r)
    res=j['chart']['result'][0]
    ts=res['timestamp']; q=res['indicators']['quote'][0]
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
    wins=sum(1 for p in pnls if p>0); losses=sum(1 for p in pnls if p<0)
    gain=sum(p for p in pnls if p>0); loss=sum(p for p in pnls if p<0)
    dd=maxdd(pnls) if pnls else 0
    total=sum(pnls)
    return {
        'trades':len(xs),'total_yen':round(total),'avg_yen':round(total/len(xs),1) if xs else 0,
        'winrate':round(wins/(wins+losses)*100,1) if wins+losses else 0,
        'maxdd_yen':round(dd),'pf':round(gain/abs(loss),3) if loss<0 else None,
        'mar':round(total/abs(dd),2) if dd<0 else None
    }

def rolling(rows, cap=100000, horizon=252):
    pnls=[r['pnl_yen'] for r in rows]
    n=len(pnls)-horizon+1
    if n<=0: return {'survive_pct':None,'profit_pct':None,'both_pct':None}
    sv=pr=both=0
    for s in range(n):
        eq=cap; mn=cap
        for p in pnls[s:s+horizon]:
            eq+=p; mn=min(mn,eq)
        a=mn>0; b=eq>cap
        sv+=a; pr+=b; both+=a and b
    return {'survive_pct':round(sv/n*100,1),'profit_pct':round(pr/n*100,1),'both_pct':round(both/n*100,1)}

n225=fetch('%5EN225'); dji=fetch('%5EDJI')
# prev ny
prevny=[]; j=0; last=None
for b in n225:
    while j<len(dji) and dji[j]['date']<b['date']:
        last=dji[j]; j+=1
    prevny.append(last)
base=[]
for i,b in enumerate(n225):
    if i==0 or b['date']<'2011-01-01': continue
    prev=n225[i-1]
    yube=b['open']-prev['close']
    if yube==0: continue
    ysign=1 if yube>0 else -1
    ny=prevny[i]
    nydiff=(ny['close']-ny['open']) if ny else 0
    nysign=1 if nydiff>0 else (-1 if nydiff<0 else 0)
    pieces=1 if (ysign+nysign)==0 else 2
    # theoretical pnl at open -> close
    pnl_pt=ysign*pieces*(b['close']-b['open'])
    base.append({'date':b['date'],'gap':abs(yube),'yube':yube,'ysign':ysign,'pieces':pieces,'pnl_pt_raw':pnl_pt})

thresholds=list(range(0,2001,10))
slips=[0,5,10,20,30,50]
all_rows=[]
for slip in slips:
    for th in thresholds:
        rows=[]
        for r in base:
            if r['gap'] < th: continue
            # unfavorable slippage per actual contract. If pieces=2, cost is slip*pieces pt.
            pnl_pt=r['pnl_pt_raw'] - slip*r['pieces']
            rows.append({'date':r['date'],'pnl_yen':pnl_pt*10,'gap':r['gap']})
        if len(rows)<30: continue
        full=metrics(rows)
        train=metrics(rows,end='2020-12-31')
        test=metrics(rows,start='2021-01-01')
        post20=metrics(rows,start='2020-01-01')
        roll1=rolling(rows,100000,252)
        all_rows.append({'threshold':th,'slip_pt':slip,
                         **{f'full_{k}':v for k,v in full.items()},
                         **{f'train_{k}':v for k,v in train.items()},
                         **{f'test_{k}':v for k,v in test.items()},
                         **{f'post2020_{k}':v for k,v in post20.items()},
                         **{f'roll1y_{k}':v for k,v in roll1.items()}})
# write csv/json
csv_path=os.path.join(OUT,'gap_abs_threshold_full_scan.csv')
with open(csv_path,'w',newline='',encoding='utf-8') as f:
    w=csv.DictWriter(f, fieldnames=list(all_rows[0].keys()))
    w.writeheader(); w.writerows(all_rows)
with open(os.path.join(OUT,'gap_abs_threshold_full_scan.json'),'w',encoding='utf-8') as f:
    json.dump({'generated_at':datetime.datetime.now().isoformat(),'period':[base[0]['date'],base[-1]['date']],'rows':all_rows},f,ensure_ascii=False,indent=2)
# select robust candidates: non-overfit bands, test high MAR, full trades>=200, test trades>=80, positive train/test
cands=[r for r in all_rows if r['slip_pt']==0 and r['full_trades']>=200 and r['test_trades']>=80 and r['train_total_yen']>0 and r['test_total_yen']>0]
rank_test=sorted(cands,key=lambda r:(r['test_mar'] or -999, r['test_total_yen'], -abs(r['test_maxdd_yen'])), reverse=True)[:20]
rank_full=sorted(cands,key=lambda r:(r['full_mar'] or -999, r['full_total_yen'], -abs(r['full_maxdd_yen'])), reverse=True)[:20]
# top robust under slippage: threshold candidates around 300-700 and 80pct equivalent maybe abs; rank by test total with slip 20 and dd <= baseline slip20 dd.
slip_summ=[]
for th in [0,50,100,150,200,250,300,350,400,450,500,600,700,800,900,1000]:
    recs=[r for r in all_rows if r['threshold']==th]
    if recs:
        slip_summ.append(recs)
# thresholds that survive 20pt slippage, test positive, test dd low
cands20=[r for r in all_rows if r['slip_pt']==20 and r['full_trades']>=100 and r['test_trades']>=40 and r['train_total_yen']>0 and r['test_total_yen']>0]
rank20=sorted(cands20,key=lambda r:(r['test_mar'] or -999, r['test_total_yen']), reverse=True)[:20]
# baseline per slip th=0 and th=300/500/600 etc
interesting=[]
for slip in slips:
    for th in [0,50,100,150,200,250,300,400,500,600,700,800,900,1000]:
        rr=next((r for r in all_rows if r['slip_pt']==slip and r['threshold']==th),None)
        if rr: interesting.append(rr)
md=[]
md.append('# ギャップ絶対額しきい値 全探索')
md.append(f"generated: {datetime.datetime.now().isoformat()}")
md.append(f"period: {base[0]['date']} to {base[-1]['date']} / base trades={len(base)}")
md.append('')
md.append('## 前提')
md.append('- threshold は「今日の始値 - 前日終値」の絶対値。日経平均の円差=先物pt相当。')
md.append('- threshold 未満の日は取引しない。threshold=300なら「ギャップ300円未満を無視」。')
md.append('- 損益はマイクロ基本1枚換算。NY同方向日は実建玉2枚を含む。')
md.append('- slip_pt は寄り付きから不利にズレた想定。買いなら高く、売りなら安く約定。')
md.append('')
md.append('## 0ptスリッページ: test(2021-2026) MAR上位')
md.append('|rank|無視ライン|full取引|full利益|fullDD|full勝率|test取引|test利益|testDD|test勝率|test MAR|')
md.append('|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
for i,r in enumerate(rank_test[:15],1):
    md.append(f"|{i}|{r['threshold']}円未満|{r['full_trades']}|{r['full_total_yen']:,}|{r['full_maxdd_yen']:,}|{r['full_winrate']}%|{r['test_trades']}|{r['test_total_yen']:,}|{r['test_maxdd_yen']:,}|{r['test_winrate']}%|{r['test_mar']}|")
md.append('')
md.append('## 20pt不利約定でも強い候補')
md.append('|rank|無視ライン|full取引|full利益|fullDD|test取引|test利益|testDD|test勝率|test MAR|')
md.append('|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
for i,r in enumerate(rank20[:15],1):
    md.append(f"|{i}|{r['threshold']}円未満|{r['full_trades']}|{r['full_total_yen']:,}|{r['full_maxdd_yen']:,}|{r['test_trades']}|{r['test_total_yen']:,}|{r['test_maxdd_yen']:,}|{r['test_winrate']}%|{r['test_mar']}|")
md.append('')
md.append('## 主要しきい値の比較')
md.append('|slip|無視ライン|full取引|full利益|fullDD|full勝率|test取引|test利益|testDD|test勝率|')
md.append('|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
for r in interesting:
    md.append(f"|{r['slip_pt']}pt|{r['threshold']}円未満|{r['full_trades']}|{r['full_total_yen']:,}|{r['full_maxdd_yen']:,}|{r['full_winrate']}%|{r['test_trades']}|{r['test_total_yen']:,}|{r['test_maxdd_yen']:,}|{r['test_winrate']}%|")
open(os.path.join(OUT,'gap_abs_threshold_full_scan.md'),'w',encoding='utf-8').write('\n'.join(md)+'\n')
print('\n'.join(md[:80]))
print('\nfiles:', csv_path, os.path.join(OUT,'gap_abs_threshold_full_scan.md'))
