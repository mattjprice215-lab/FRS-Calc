import React, { useState, useMemo, useCallback } from "react";
import {
  AreaChart, Area,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

const fmt  = (n) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n||0);
const fmtK = (n) => { if(!n||isNaN(n)||n<0) return "$0"; if(n>=1e9) return `$${(n/1e9).toFixed(2)}B`; if(n>=1e6) return `$${(n/1e6).toFixed(2)}M`; if(n>=1e3) return `$${(n/1e3).toFixed(0)}K`; return fmt(n); };
const pct  = (n,d=1) => `${(+n||0).toFixed(d)}%`;
const cl   = (v,mn,mx) => Math.min(Math.max(+v||0,mn),mx);
const CY   = new Date().getFullYear();
let _uid=0; const uid=()=>`i${++_uid}`;

const N="#002677",B="#0047BB",S="#EEF2FA",BD="#D1D9ED",MU="#6B7A99",TX="#0D1B3E";
const GR="#059669",AM="#D97706",RD="#DC2626",PT="#1D4ED8",RT="#059669",TXC="#D97706";
const PS="#7C3AED",SSC="#0F766E";
const WMC={retirement:"#1D4ED8",nonretire:"#059669",income:"#7C3AED",insurance:"#0F766E"};
const ATYPES={"401k":{label:"401k / 403b",hasMatch:true,color:B},rira:{label:"Roth IRA",hasMatch:false,color:RT},tira:{label:"Trad. IRA",hasMatch:false,color:"#6366f1"},brok:{label:"Brokerage",hasMatch:false,color:AM}};

function mkAcct(type,pid){return{id:uid(),pid,type,label:ATYPES[type].label,taxType:type==="brok"?"taxable":type==="rira"?"roth":"pretax",balance:0,empPreTaxPct:4,empPreTaxDollar:400,empPreTaxMode:"pct",empRothPct:2,empRothDollar:100,empRothMode:"pct",erPct:50,erCap:6,erTax:"pretax",mode:"dollar",contribDollar:300,contribPct:5,growth:7};}
function mkPerson(n){const p={id:uid(),name:n===1?"You":`Person ${n}`,age:35,retireAge:65,lifeExp:90,salary:n===1?85000:72000,accounts:[]};p.accounts=[mkAcct("401k",p.id)];return p;}

function acctStreams(a,salary){
  if(a.type==="401k"){const ms=salary/12,ep=a.empPreTaxMode==="pct"?ms*(a.empPreTaxPct/100):(a.empPreTaxDollar||0),er=a.empRothMode==="pct"?ms*(a.empRothPct/100):(a.empRothDollar||0),tot=ep+er,cap=ms*((a.erCap||0)/100),match=Math.min(tot,cap)*((a.erPct||0)/100),ept=a.erTax==="pretax";return{pt:ep+(ept?match:0),rt:er+(ept?0:match),tx:0,total:tot+match};}
  const mc=a.mode==="pct"?(salary/12)*(a.contribPct/100):(a.contribDollar||0);
  return{pt:a.taxType==="pretax"?mc:0,rt:a.taxType==="roth"?mc:0,tx:a.taxType==="taxable"?mc:0,total:mc};
}
function projectYears(bal,dep,rate,yrs){const r=rate/100/12;let b=Math.max(0,bal||0);const out=[Math.round(b)];for(let y=1;y<=yrs;y++){for(let m=0;m<12;m++)b=b*(1+r)+dep;out.push(Math.round(Math.max(0,b)));}return out;}
function projectDrawdown(bal,wPct,gPct,yrs){const r=gPct/100/12;let b=Math.max(0,bal||0);const out=[Math.round(b)];for(let y=1;y<=yrs;y++){const mw=b*(wPct/100)/12;for(let m=0;m<12;m++)b=Math.max(0,b*(1+r)-mw);out.push(Math.round(b));}return out;}
function reqMonthlySave(target,bal,rate,yrs){if(yrs<=0)return 0;const r=rate/100/12,n=yrs*12,fv=bal*Math.pow(1+r,n),gap=target-fv;if(gap<=0)return 0;return gap*r/(Math.pow(1+r,n)-1);}

function NI({value,onChange,prefix,suffix,min=0,max,step=1,style}){
  const[local,setLocal]=useState(String(value));
  const[focused,setFocused]=useState(false);
  React.useEffect(()=>{if(!focused)setLocal(String(value));},[value,focused]);
  const commit=()=>{setFocused(false);const n=parseFloat(local);if(!isNaN(n)){const c=max!==undefined?cl(n,min,max):Math.max(n,min);onChange(c);setLocal(String(c));}else setLocal(String(value));};
  return(<div className="ni" style={style}>{prefix&&<span className="ni-a">{prefix}</span>}<input type="number" inputMode="decimal" value={focused?local:value} min={min} max={max} step={step} onFocus={()=>{setFocused(true);setLocal(String(value));}} onChange={e=>setLocal(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==="Enter")e.target.blur();}}/>{suffix&&<span className="ni-b">{suffix}</span>}</div>);
}
function SlN({value,onChange,min,max,step,prefix,suffix,color}){
  const c=color||B,p=cl((value-min)/(max-min)*100,0,100).toFixed(1);
  return(<div style={{display:"flex",flexDirection:"column",gap:5}}><NI value={value} onChange={v=>onChange(cl(v,min,max))} prefix={prefix} suffix={suffix} min={min} max={max} step={step}/><input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(cl(+e.target.value,min,max))} style={{"--p":`${p}%`,"--c":c}}/></div>);
}
function Seg({opts,val,onChange,sm}){return(<div className="seg">{opts.map(o=>(<button key={o.v} className={"sb"+(val===o.v?" on":"")} style={{...(val===o.v&&o.c?{background:o.c,borderColor:o.c}:{}),fontSize:sm?".65rem":".72rem"}} onClick={()=>onChange(o.v)}>{o.l}</button>))}</div>);}
function Toggle({on,onChange}){return(<label style={{position:"relative",display:"inline-block",width:44,height:24,flexShrink:0,cursor:"pointer"}}><input type="checkbox" checked={on} onChange={e=>onChange(e.target.checked)} style={{opacity:0,width:0,height:0,position:"absolute"}}/><span style={{position:"absolute",inset:0,borderRadius:12,background:on?B:BD,transition:"background .2s",border:`1px solid ${on?B:BD}`}}><span style={{position:"absolute",width:18,height:18,borderRadius:"50%",background:"#fff",top:2,left:on?22:2,transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/></span></label>);}

// ── Collapsible Card ──────────────────────────────────────────────────────────
function Card({title,summary,children,accent,right,collapsible=false,defaultOpen=true}){
  const[open,setOpen]=useState(defaultOpen);
  return(
    <div style={{background:"#fff",border:`1px solid ${BD}`,borderRadius:12,marginBottom:"1rem",overflow:"hidden",boxShadow:"0 1px 4px rgba(0,38,119,.06)"}}>
      {title&&(
        <div style={{padding:".9rem 1.2rem",borderBottom:open?`1px solid ${BD}`:"none",background:S,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap",cursor:collapsible?"pointer":"default"}}
          onClick={collapsible?()=>setOpen(o=>!o):undefined}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:".88rem",color:N,display:"flex",alignItems:"center",gap:7,fontFamily:"'Lato',sans-serif"}}>
              {accent&&<span style={{width:3,height:14,background:accent,borderRadius:2,display:"inline-block",flexShrink:0}}/>}
              {title}
            </div>
            {collapsible&&!open&&summary&&(
              <div style={{fontSize:".7rem",color:MU,marginTop:4,display:"flex",flexWrap:"wrap",gap:"1rem",fontFamily:"'Lato',sans-serif"}}>{summary}</div>
            )}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {(!collapsible||open)&&right}
            {collapsible&&<span style={{color:MU,fontSize:".85rem",transition:"transform .2s",display:"inline-block",transform:open?"rotate(180deg)":"rotate(0deg)",flexShrink:0}}>▾</span>}
          </div>
        </div>
      )}
      {open&&<div style={{padding:"1rem 1.2rem"}}>{children}</div>}
    </div>
  );
}

function SummaryItem({label,value,color}){
  return(
    <span style={{display:"inline-flex",flexDirection:"column"}}>
      <span style={{fontSize:".6rem",color:MU,textTransform:"uppercase",letterSpacing:".04em",fontFamily:"'Lato',sans-serif"}}>{label}</span>
      <span style={{fontFamily:"'Courier New',monospace",fontWeight:700,color:color||TX,fontSize:".78rem"}}>{value}</span>
    </span>
  );
}

function ChartTip({active,payload,label,isAge}){
  if(!active||!payload?.length)return null;
  const hd=isAge?`Age ${label}`:`${CY+Number(label)}`;
  const items=payload.filter(p=>(p.value||0)>=50);
  const total=items.reduce((s,p)=>s+(p.value||0),0);
  return(
    <div style={{background:"#fff",border:`1px solid ${BD}`,borderRadius:8,padding:"10px 14px",minWidth:180,fontSize:12,boxShadow:"0 4px 20px rgba(0,38,119,.12)"}}>
      <div style={{fontWeight:700,fontSize:13,color:N,marginBottom:6,fontFamily:"'Lato',sans-serif"}}>{hd}</div>
      {items.map(p=>(<div key={p.dataKey} style={{display:"flex",alignItems:"center",gap:6,padding:"2px 0"}}><span style={{width:8,height:8,borderRadius:2,background:p.fill||p.color,flexShrink:0,display:"inline-block"}}/><span style={{color:MU,flex:1,fontSize:11,fontFamily:"'Lato',sans-serif"}}>{p.name}</span><span style={{fontFamily:"'Courier New',monospace",fontWeight:600,color:TX}}>{fmtK(p.value)}</span></div>))}
      {items.length>1&&<div style={{borderTop:`1px solid ${BD}`,marginTop:5,paddingTop:5,fontFamily:"'Courier New',monospace",fontWeight:700,color:N}}>Total: {fmtK(total)}</div>}
    </div>
  );
}

function GapMeter({have,need,label}){
  const filled=cl(need>0?(have/need)*100:100,0,100),over=have>need,color=over?GR:filled>66?AM:RD;
  return(
    <div style={{marginBottom:".85rem"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:4}}>
        <span style={{fontSize:".7rem",color:MU,fontWeight:600,textTransform:"uppercase",letterSpacing:".04em",fontFamily:"'Lato',sans-serif"}}>{label}</span>
        <span style={{fontSize:".7rem",fontFamily:"'Courier New',monospace",fontWeight:700,color}}>{over?"✓ ":""}{pct(filled,0)} funded</span>
      </div>
      <div style={{height:8,background:BD,borderRadius:4,position:"relative"}}>
        <div style={{height:"100%",width:`${filled}%`,background:color,borderRadius:4,transition:"width .5s"}}>
          {filled>0&&filled<=98&&<span style={{position:"absolute",right:-1,top:-4,width:16,height:16,borderRadius:"50%",background:color,border:"2px solid #fff",boxShadow:"0 1px 4px rgba(0,0,0,.15)"}}/>}
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:".67rem",color:MU,marginTop:3,fontFamily:"'Lato',sans-serif"}}><span>Have: {fmtK(have)}</span><span>Need: {fmtK(need)}</span></div>
    </div>
  );
}

function WMCard({label,sub,value,type}){const bdr=WMC[type]||WMC.nonretire;return(<div style={{border:`1.5px solid ${bdr}`,borderRadius:6,padding:"5px 8px",background:"#fff",minWidth:88,maxWidth:128,boxShadow:"0 1px 4px rgba(0,0,0,.06)",textAlign:"center"}}><div style={{fontSize:".57rem",fontWeight:700,color:bdr,lineHeight:1.2,marginBottom:2,textTransform:"uppercase",letterSpacing:".03em",fontFamily:"'Lato',sans-serif"}}>{label}</div>{sub&&<div style={{fontSize:".54rem",color:MU,marginBottom:2,lineHeight:1.2,fontFamily:"'Lato',sans-serif"}}>{sub}</div>}<div style={{fontFamily:"'Courier New',monospace",fontWeight:700,fontSize:".78rem",color:bdr}}>{fmtK(Math.abs(value||0))}</div></div>);}
function PersonIcon({name,color}){return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}><svg width={40} height={54} viewBox="0 0 40 52" fill="none"><circle cx="20" cy="12" r="9" fill={color} opacity=".9"/><path d="M4 44c0-8.837 7.163-16 16-16s16 7.163 16 16" fill={color} opacity=".9"/></svg><div style={{fontSize:".65rem",fontWeight:700,color:TX,textAlign:"center",lineHeight:1.2,fontFamily:"'Lato',sans-serif"}}>{name}</div></div>);}

function WealthMap({persons,allA,baseTotal,basePT,baseRT,baseTX,pension,pensionMo,ss,ssMo,totalNetAnnual}){
  const totalBal=allA.reduce((s,a)=>s+(a.balance||0),0),pColors=[N,WMC.income,"#DB2777"];
  return(
    <div style={{background:"#F8FAFF",border:`1px solid ${BD}`,borderRadius:10,padding:"1rem",overflowX:"auto"}}>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:".75rem",justifyContent:"center"}}>
        {[["Retirement",WMC.retirement],["Non-Retirement",WMC.nonretire],["Income",WMC.income],["Pension/SS",WMC.insurance]].map(([l,c])=>(<div key={l} style={{display:"flex",alignItems:"center",gap:3,fontSize:".6rem",color:MU,fontFamily:"'Lato',sans-serif"}}><span style={{width:8,height:8,border:`2px solid ${c}`,borderRadius:2,display:"inline-block",background:c+"22"}}/>{l}</div>))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:"1rem",alignItems:"center",minWidth:320}}>
        <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end"}}>
          {persons.filter((_,i)=>i===0).map(p=>(<React.Fragment key={p.id}><WMCard label={p.name} sub="Salary" value={p.salary} type="income"/>{p.accounts.map(a=>(<WMCard key={a.id} label={a.label} sub={a.taxType==="roth"?"Roth":a.taxType==="taxable"?"Taxable":"Pre-Tax"} value={a.balance||0} type={["401k","tira"].includes(a.type)||a.type==="rira"?"retirement":"nonretire"}/>))}</React.Fragment>))}
          <div style={{fontSize:".68rem",color:WMC.income,fontWeight:700,fontFamily:"'Courier New',monospace",paddingTop:3,borderTop:`1px solid ${BD}`,width:"100%",textAlign:"right"}}>{fmt(persons[0]?.salary||0)}/yr</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,minWidth:110}}>
          <div style={{fontSize:".58rem",color:MU,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",fontFamily:"'Lato',sans-serif"}}>Household</div>
          <div style={{display:"flex",gap:12}}>{persons.map((p,i)=><PersonIcon key={p.id} name={p.name} color={pColors[i%3]}/>)}</div>
          <div style={{background:N,color:"#fff",borderRadius:7,padding:"6px 10px",textAlign:"center",width:"100%"}}><div style={{fontSize:".55rem",fontWeight:600,textTransform:"uppercase",opacity:.7,fontFamily:"'Lato',sans-serif"}}>Portfolio Now</div><div style={{fontFamily:"'Courier New',monospace",fontWeight:700,fontSize:".9rem",marginTop:1}}>{fmtK(totalBal)}</div></div>
          <div style={{background:GR,color:"#fff",borderRadius:7,padding:"6px 10px",textAlign:"center",width:"100%"}}><div style={{fontSize:".55rem",fontWeight:600,textTransform:"uppercase",opacity:.8,fontFamily:"'Lato',sans-serif"}}>At Retirement</div><div style={{fontFamily:"'Courier New',monospace",fontWeight:700,fontSize:".9rem",marginTop:1}}>{fmtK(baseTotal)}</div><div style={{fontSize:".58rem",opacity:.85,fontFamily:"'Lato',sans-serif"}}>{fmt(totalNetAnnual/12)}/mo</div></div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-start"}}>
          {persons.length>1?(persons.filter((_,i)=>i>0).map(p=>(<React.Fragment key={p.id}><WMCard label={p.name} sub="Salary" value={p.salary} type="income"/>{p.accounts.map(a=>(<WMCard key={a.id} label={a.label} sub={a.taxType==="roth"?"Roth":a.taxType==="taxable"?"Taxable":"Pre-Tax"} value={a.balance||0} type={["401k","tira"].includes(a.type)||a.type==="rira"?"retirement":"nonretire"}/>))}<div style={{fontSize:".68rem",color:WMC.income,fontWeight:700,fontFamily:"'Courier New',monospace",paddingTop:3,borderTop:`1px solid ${BD}`,width:"100%"}}>{fmt(p.salary)}/yr</div></React.Fragment>))):(
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {pension.on&&<WMCard label="Pension" sub={`${pension.cola}% COLA`} value={pensionMo*12} type="insurance"/>}
              {ss.on&&<WMCard label="Social Security" sub={`Age ${ss.startAge}`} value={ssMo*12} type="insurance"/>}
              {!pension.on&&!ss.on&&<div style={{fontSize:".68rem",color:MU,fontStyle:"italic",padding:"6px 4px",fontFamily:"'Lato',sans-serif"}}>Enable pension<br/>or SS to show</div>}
            </div>
          )}
        </div>
      </div>
      <div style={{borderTop:`1px solid ${BD}`,marginTop:".85rem",paddingTop:".7rem",display:"flex",justifyContent:"center",gap:"1rem",flexWrap:"wrap"}}>
        {[{l:"Income/yr",v:fmt(persons.reduce((s,p)=>s+p.salary,0)),c:WMC.income},{l:"Pre-Tax",v:fmtK(basePT),c:WMC.retirement},{l:"Roth",v:fmtK(baseRT),c:GR},{l:"Taxable",v:fmtK(baseTX),c:AM},{l:"Total Now",v:fmtK(totalBal),c:N}].map(s=>(<div key={s.l} style={{textAlign:"center"}}><div style={{fontSize:".58rem",color:MU,textTransform:"uppercase",letterSpacing:".04em",fontFamily:"'Lato',sans-serif"}}>{s.l}</div><div style={{fontFamily:"'Courier New',monospace",fontWeight:700,color:s.c,fontSize:".82rem",marginTop:1}}>{s.v}</div></div>))}
      </div>
    </div>
  );
}

function WIHead(){return(<div style={{display:"grid",gridTemplateColumns:"1.8fr 1.2fr 1.2fr .9fr",gap:".3rem",padding:".45rem .7rem",background:N,borderRadius:7,marginBottom:".3rem"}}>{["Scenario","Portfolio","Monthly","vs. Today"].map(h=>(<span key={h} style={{fontSize:".6rem",fontWeight:700,color:"rgba(255,255,255,.85)",textTransform:"uppercase",letterSpacing:".04em",fontFamily:"'Lato',sans-serif"}}>{h}</span>))}</div>);}
function WIRow({label,portfolio,income,isBase,baseIncome,mode,goalMonthly}){
  const dInc=income-baseIncome,meetsGoal=mode==="backward"&&goalMonthly>0&&income/12>=goalMonthly;
  return(<div style={{display:"grid",gridTemplateColumns:"1.8fr 1.2fr 1.2fr .9fr",gap:".3rem",padding:".48rem .7rem",borderRadius:7,marginBottom:".25rem",background:isBase?"#EFF6FF":meetsGoal?"#F0FDF4":"#fff",border:`1px solid ${isBase?B+"55":meetsGoal?GR+"44":BD}`}}><span style={{fontWeight:isBase?700:500,color:isBase?B:TX,fontSize:".74rem",fontFamily:"'Lato',sans-serif",wordBreak:"break-word"}}>{label}{meetsGoal&&<span style={{marginLeft:4,fontSize:".6rem",color:GR,fontWeight:700}}> ✓</span>}</span><span style={{fontFamily:"'Courier New',monospace",fontSize:".74rem",color:TX}}>{fmtK(portfolio)}</span><span style={{fontFamily:"'Courier New',monospace",fontSize:".74rem",color:meetsGoal?GR:TX}}>{fmt(income/12)}</span><span style={{fontSize:".7rem",fontWeight:700,color:isBase?MU:dInc>0?GR:RD,fontFamily:"'Courier New',monospace"}}>{isBase?"—":(dInc>0?"+":"")+fmt(dInc/12)}</span></div>);
}

export default function App(){
  const[mode,setMode]=useState("forward");
  const[persons,setPersons]=useState(()=>[mkPerson(1)]);
  const[wRate,setWRate]=useState(4);
  const[retireGrowth,setRetireGrowth]=useState(5);
  const[taxRate,setTaxRate]=useState(22);
  const[ltcgRate,setLtcgRate]=useState(15);
  const[chartTab,setChartTab]=useState("accum");
  const[chartType,setChartType]=useState("area");
  const[pension,setPension]=useState({on:false,monthly:2000,startAge:65,cola:2});
  const[ss,setSS]=useState({on:false,monthly:1800,startAge:67,cola:2.5});
  const[goalMode,setGoalMode]=useState("estimate");
  const[goalManual,setGoalManual]=useState(80000);
  const[goalHousing,setGoalHousing]=useState(1800);
  const[goalHealth,setGoalHealth]=useState(500);
  const[goalTravel,setGoalTravel]=useState(500);
  const[goalOther,setGoalOther]=useState(300);
  const[goalInflation,setGoalInflation]=useState(2.5);
  const[wiLumpSum,setWiLumpSum]=useState(25000);
  const[wiTab,setWiTab]=useState("monthly");

  const updP=(id,p)=>setPersons(ps=>ps.map(x=>x.id===id?p:x));
  const delP=(id)=>setPersons(ps=>ps.filter(x=>x.id!==id));
  const addP=()=>setPersons(ps=>[...ps,mkPerson(ps.length+1)]);
  const updA=useCallback((pid,aid,a)=>setPersons(ps=>ps.map(p=>p.id!==pid?p:{...p,accounts:p.accounts.map(x=>x.id===aid?a:x)})),[]);
  const delA=useCallback((pid,aid)=>setPersons(ps=>ps.map(p=>p.id!==pid?p:{...p,accounts:p.accounts.filter(x=>x.id!==aid)})),[]);
  const addA=(pid,type)=>{const a=mkAcct(type,pid);setPersons(ps=>ps.map(p=>p.id!==pid?p:{...p,accounts:[...p.accounts,a]}));};

  const allA=useMemo(()=>persons.flatMap(p=>p.accounts.map(a=>({...a,_p:p}))),[persons]);
  const totalSal=persons.reduce((s,p)=>s+p.salary,0);
  const maxRetYrs=Math.max(...persons.map(p=>Math.max(p.retireAge-p.age,1)));
  const maxLifeYrs=Math.max(...persons.map(p=>Math.max(p.lifeExp-p.age,maxRetYrs+2)));
  const p0=persons[0];

  const streams=useMemo(()=>{let pt=0,rt=0,tx=0;allA.forEach(a=>{const s=acctStreams(a,a._p.salary);pt+=s.pt;rt+=s.rt;tx+=s.tx;});return{pt,rt,tx,total:pt+rt+tx};},[allA]);
  const savRate=totalSal>0?(streams.total*12/totalSal)*100:0;

  const accumRows=useMemo(()=>{
    const N=maxRetYrs,rows=Array.from({length:N+1},(_,y)=>({year:y}));
    const ptY=new Array(N+1).fill(0),rtY=new Array(N+1).fill(0),txY=new Array(N+1).fill(0);
    allA.forEach(a=>{const s=acctStreams(a,a._p.salary),g=a.growth||7,tot=Math.max(s.total,0.001),b=a.balance||0;
      const ptA=projectYears(b*(s.pt/tot),s.pt,g,N),rtA=projectYears(b*(s.rt/tot),s.rt,g,N),txA=projectYears(b*(s.tx/tot),s.tx,g,N);
      ptA.forEach((v,y)=>{rows[y][`pt_${a.id}`]=v;ptY[y]+=v;});rtA.forEach((v,y)=>{rows[y][`rt_${a.id}`]=v;rtY[y]+=v;});txA.forEach((v,y)=>{rows[y][`tx_${a.id}`]=v;txY[y]+=v;});
    });
    rows.forEach((r,y)=>{r.PT=ptY[y];r.RT=rtY[y];r.TX=txY[y];r.TOT=ptY[y]+rtY[y]+txY[y];});
    return rows;
  },[allA,maxRetYrs]);

  const last=accumRows[accumRows.length-1]||{};
  const basePT=last.PT||0,baseRT=last.RT||0,baseTX=last.TX||0,baseTotal=last.TOT||0;

  const lifeRows=useMemo(()=>{
    if(!accumRows.length)return[];
    const retY=maxRetYrs,totY=Math.max(maxLifeYrs,retY+2),rows=[];
    for(let y=0;y<=retY;y++){const r=accumRows[y]||{};rows.push({age:p0.age+y,PT:r.PT||0,RT:r.RT||0,TX:r.TX||0,TOT:r.TOT||0});}
    const dY=totY-retY;
    const ptD=projectDrawdown(basePT,wRate*(basePT/Math.max(baseTotal,1)),retireGrowth,dY);
    const rtD=projectDrawdown(baseRT,wRate*(baseRT/Math.max(baseTotal,1)),retireGrowth,dY);
    const txD=projectDrawdown(baseTX,wRate*(baseTX/Math.max(baseTotal,1)),retireGrowth,dY);
    for(let k=1;k<=dY;k++)rows.push({age:p0.age+retY+k,PT:ptD[k]||0,RT:rtD[k]||0,TX:txD[k]||0,TOT:(ptD[k]||0)+(rtD[k]||0)+(txD[k]||0)});
    return rows;
  },[accumRows,p0,wRate,retireGrowth,basePT,baseRT,baseTX,baseTotal,maxRetYrs,maxLifeYrs]);

  const pensionMo=pension.on?pension.monthly*Math.pow(1+pension.cola/100,Math.max(0,pension.startAge-p0.age)):0;
  const ssMo=ss.on?ss.monthly*Math.pow(1+ss.cola/100,Math.max(0,ss.startAge-p0.age)):0;

  const portIncome=useMemo(()=>{const tot=baseTotal;if(!tot)return{pt:0,rt:0,tx:0,net:0};const gPT=tot*(wRate/100)*(basePT/tot),gRT=tot*(wRate/100)*(baseRT/tot),gTX=tot*(wRate/100)*(baseTX/tot),nPT=gPT*(1-taxRate/100),nRT=gRT,nTX=gTX*(1-ltcgRate/100);return{pt:nPT,rt:nRT,tx:nTX,net:nPT+nRT+nTX};},[baseTotal,basePT,baseRT,baseTX,wRate,taxRate,ltcgRate]);
  const totalNetAnnual=portIncome.net+pensionMo*12+ssMo*12;
  const totalNetMonthly=totalNetAnnual/12;

  const goalEstimated=useMemo(()=>{if(goalMode==="manual")return goalManual;return(goalHousing+goalHealth+goalTravel+goalOther)*12*Math.pow(1+goalInflation/100,maxRetYrs);},[goalMode,goalManual,goalHousing,goalHealth,goalTravel,goalOther,goalInflation,maxRetYrs]);
  const blendedTax=(basePT+baseTX>0)?((basePT*taxRate/100+baseTX*ltcgRate/100)/(basePT+baseTX+Math.max(baseRT,1)))*100:taxRate;
  const grossNeeded=Math.max(0,goalEstimated-(pensionMo+ssMo)*12)/(1-blendedTax/100*0.5);
  const reqPortfolio=wRate>0?grossNeeded/(wRate/100):0;
  const gap=reqPortfolio-baseTotal,onTrack=gap<=0;
  const currentBal=allA.reduce((s,a)=>s+(a.balance||0),0);
  const additionalNeeded=Math.max(0,reqMonthlySave(reqPortfolio,currentBal,7,maxRetYrs)-streams.total);

  const scenarioResult=useCallback((extraMonthly,lumpSum,growthAdj,retireAgeOvr)=>{
    const yrs=retireAgeOvr?Math.max(retireAgeOvr-p0.age,1):maxRetYrs,g=7+(growthAdj||0),tot=Math.max(baseTotal,1);
    const ptP=projectYears(basePT+lumpSum*(basePT/tot),streams.pt+extraMonthly*0.6,g,yrs);
    const rtP=projectYears(baseRT+lumpSum*(baseRT/tot),streams.rt+extraMonthly*0.3,g,yrs);
    const txP=projectYears(baseTX+lumpSum*(baseTX/tot),streams.tx+extraMonthly*0.1,g,yrs);
    const port=(ptP[yrs]||0)+(rtP[yrs]||0)+(txP[yrs]||0);
    return{portfolio:port,income:port*(wRate/100)*(1-blendedTax/100*0.5)+(pensionMo+ssMo)*12};
  },[basePT,baseRT,baseTX,baseTotal,streams,maxRetYrs,wRate,blendedTax,pensionMo,ssMo,p0.age]);

  const baseScenario=useMemo(()=>scenarioResult(0,0,0,null),[scenarioResult]);
  const whatIfMonthly=useMemo(()=>[0,100,200,300,500,750,1000,1500,2000].map(x=>{const r=scenarioResult(x,0,0,null);return{extra:x,...r};}),[scenarioResult]);
  const whatIfLumpSum=useMemo(()=>[0,5000,10000,25000,50000,100000,250000].map(x=>{const r=scenarioResult(0,x,0,null);return{lump:x,...r};}),[scenarioResult]);
  const whatIfRetireAge=useMemo(()=>[p0.retireAge-5,p0.retireAge-2,p0.retireAge,p0.retireAge+2,p0.retireAge+5,p0.retireAge+8,p0.retireAge+10].filter(a=>a>p0.age).map(age=>{const r=scenarioResult(0,0,0,age);return{age,...r};}),[scenarioResult,p0.retireAge,p0.age]);
  const whatIfGrowth=useMemo(()=>[-2,-1,0,1,2,3].map(adj=>{const r=scenarioResult(0,0,adj,null);return{adj,rate:7+adj,...r};}),[scenarioResult]);
  const whatIfCombined=useMemo(()=>[{label:"Current Plan",extra:0,lump:0},{label:"+$200/mo",extra:200,lump:0},{label:"Invest $10K",extra:0,lump:10000},{label:"+$200/mo + $10K",extra:200,lump:10000},{label:"+$500/mo",extra:500,lump:0},{label:"Invest $25K",extra:0,lump:25000},{label:"+$500/mo + $25K",extra:500,lump:25000},{label:"+$1K/mo + $50K",extra:1000,lump:50000}].map(c=>{const r=scenarioResult(c.extra,c.lump,0,null);return{...c,...r};}),[scenarioResult]);

  const chartRows=chartTab==="accum"?accumRows:lifeRows;
  const xKey=chartTab==="accum"?"year":"age";
  const xFmt=v=>chartTab==="accum"?`${CY+Number(v)}`:`Age ${v}`;
  const xInt=Math.max(1,Math.floor((chartTab==="accum"?maxRetYrs:maxLifeYrs)/6));
  const wiShared={baseIncome:baseScenario.income,mode,goalMonthly:goalEstimated/12};
  const SERIES=[{k:"PT",name:"Pre-Tax",color:PT},{k:"RT",name:"Roth",color:RT},{k:"TX",name:"Taxable",color:TXC}];

  const css=`
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Lato:wght@300;400;500;600;700&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{background:#EEF2FA;color:${TX};font-family:'Lato',sans-serif;font-size:15px;min-height:100vh;-webkit-text-size-adjust:100%}
    .app{max-width:1380px;margin:0 auto;padding:0 .75rem 4rem}
    .topbar{background:${N};position:sticky;top:0;z-index:200;box-shadow:0 2px 16px rgba(0,38,119,.3)}
    .topbar-inner{max-width:1380px;margin:0 auto;padding:.65rem .75rem;display:flex;align-items:center;gap:.6rem;justify-content:space-between;flex-wrap:wrap}
    .logo-sq{width:32px;height:32px;background:#fff;border-radius:5px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:${N};flex-shrink:0;font-family:'Playfair Display',serif}
    .logo-text{color:#fff;font-weight:700;font-size:.95rem;font-family:'Playfair Display',serif;letter-spacing:.01em}
    .logo-sub{color:rgba(255,255,255,.5);font-size:.63rem;margin-top:1px;font-family:'Lato',sans-serif}
    .mode-toggle{display:flex;background:rgba(255,255,255,.12);border-radius:7px;overflow:hidden;border:1px solid rgba(255,255,255,.2)}
    .mode-btn{background:none;border:none;color:rgba(255,255,255,.65);padding:.4rem .75rem;font-size:.76rem;font-weight:600;cursor:pointer;font-family:'Lato',sans-serif;transition:all .15s;white-space:nowrap;-webkit-tap-highlight-color:transparent}
    .mode-btn.active{background:#fff;color:${N}}
    .layout{display:grid;grid-template-columns:390px 1fr;gap:1.25rem;margin-top:1rem;align-items:start}
    @media(max-width:900px){.layout{grid-template-columns:1fr}}
    .left-col,.right-col{display:flex;flex-direction:column;gap:0}
    .ni{display:flex;align-items:stretch;background:#fff;border:1.5px solid ${BD};border-radius:7px;overflow:hidden;transition:border-color .15s}
    .ni:focus-within{border-color:${B}}
    .ni-a,.ni-b{padding:0 .5rem;background:${S};color:${MU};font-family:'Lato',sans-serif;font-size:.73rem;display:flex;align-items:center;white-space:nowrap;flex-shrink:0}
    .ni-a{border-right:1.5px solid ${BD}}.ni-b{border-left:1.5px solid ${BD}}
    .ni input{background:transparent;border:none;outline:none;color:${TX};font-family:'Courier New',monospace;font-size:.9rem;padding:.5rem .55rem;width:100%;min-width:0;font-weight:700;-moz-appearance:textfield;-webkit-appearance:none}
    .ni input::-webkit-outer-spin-button,.ni input::-webkit-inner-spin-button{-webkit-appearance:none}
    input[type=range]{-webkit-appearance:none;width:100%;height:5px;border-radius:3px;outline:none;cursor:pointer;touch-action:pan-x;background:linear-gradient(to right,var(--c,${B}) 0%,var(--c,${B}) var(--p,50%),${BD} var(--p,50%),${BD} 100%)}
    input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:var(--c,${B});border:3px solid #fff;box-shadow:0 0 0 2px var(--c,${B})44,0 1px 4px rgba(0,0,0,.12)}
    label.fld{display:flex;flex-direction:column;gap:.28rem;font-size:.67rem;color:${MU};font-weight:600;letter-spacing:.04em;text-transform:uppercase;font-family:'Lato',sans-serif}
    .hint{font-size:.64rem;color:${MU};margin-top:.14rem;text-transform:none;letter-spacing:0;font-family:'Lato',sans-serif}
    .seg{display:inline-flex;background:${S};border:1.5px solid ${BD};border-radius:7px;overflow:hidden}
    .sb{background:none;border:none;color:${MU};padding:.28rem .6rem;font-size:.72rem;cursor:pointer;font-family:'Lato',sans-serif;font-weight:500;transition:all .15s;white-space:nowrap;-webkit-tap-highlight-color:transparent}
    .sb.on{background:${N};color:#fff}
    .sb:not(.on):hover{background:#E4EAF6;color:${TX}}
    .btn-ghost{background:transparent;border:1.5px solid ${BD};color:${MU};border-radius:7px;padding:.35rem .7rem;font-size:.74rem;font-weight:500;cursor:pointer;font-family:'Lato',sans-serif;transition:all .15s;-webkit-tap-highlight-color:transparent}
    .btn-ghost:hover{border-color:${B};color:${B}}
    .btn-rm{background:transparent;border:1.5px solid #FECACA;color:${RD};border-radius:6px;padding:.23rem .6rem;font-size:.7rem;cursor:pointer;font-family:'Lato',sans-serif;-webkit-tap-highlight-color:transparent}
    .ac{background:#fff;border:1.5px solid ${BD};border-top:3px solid var(--c,${B});border-radius:10px;padding:.9rem;transition:box-shadow .15s}
    .ac:hover{box-shadow:0 3px 12px rgba(0,38,119,.07)}
    .ac-top{display:flex;align-items:center;gap:.4rem;margin-bottom:.7rem;padding-bottom:.65rem;border-bottom:1px solid ${BD}}
    .ac-name{font-weight:700;font-size:.84rem;color:${N};font-family:'Lato',sans-serif}
    .ac-rm{background:none;border:none;color:${MU};cursor:pointer;font-size:.78rem;opacity:.4;padding:1px 4px;margin-left:auto;-webkit-tap-highlight-color:transparent}
    .acf{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}
    .full{grid-column:1/-1}
    .sb2{background:${S};border:1.5px solid ${BD};border-radius:8px;padding:.65rem}
    .sb2-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem;flex-wrap:wrap;gap:.3rem}
    .stat{background:#fff;border:1.5px solid ${BD};border-radius:9px;padding:.75rem .9rem}
    .sl{font-size:.63rem;color:${MU};text-transform:uppercase;letter-spacing:.05em;font-weight:600;font-family:'Lato',sans-serif}
    .sv{font-family:'Courier New',monospace;font-size:1.1rem;font-weight:700;margin-top:.2rem;color:${TX}}
    .sbar2{height:3px;background:${BD};border-radius:2px;margin-top:.4rem;overflow:hidden}
    .sbar2f{height:100%;border-radius:2px;transition:width .4s}
    .chart-ctrl{display:flex;background:${S};border:1.5px solid ${BD};border-radius:7px;overflow:hidden}
    .chart-btn{background:none;border:none;color:${MU};padding:.35rem .8rem;font-size:.73rem;cursor:pointer;font-family:'Lato',sans-serif;font-weight:500;transition:all .15s;-webkit-tap-highlight-color:transparent}
    .chart-btn.on{background:${N};color:#fff}
    .info{background:${S};border:1px solid ${BD};border-radius:8px;padding:.65rem .9rem;font-size:.73rem;color:${MU};line-height:1.6;font-family:'Lato',sans-serif}
    .warn{background:#FEF2F2;border:1.5px solid #FECACA;border-radius:8px;padding:.65rem .9rem;font-size:.73rem;color:#991B1B;line-height:1.5;font-family:'Lato',sans-serif}
    .success{background:#F0FDF4;border:1.5px solid #BBF7D0;border-radius:8px;padding:.65rem .9rem;font-size:.73rem;color:#14532D;line-height:1.5;font-family:'Lato',sans-serif}
    .grand{background:${N};border-radius:10px;padding:1.1rem 1.25rem;display:grid;grid-template-columns:repeat(3,1fr);gap:.85rem}
    @media(max-width:480px){.grand{grid-template-columns:1fr 1fr}}
    .gl{font-size:.6rem;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:.06em;font-weight:600;font-family:'Lato',sans-serif}
    .gv{font-family:'Courier New',monospace;font-size:1.25rem;font-weight:700;color:#fff;margin-top:.15rem}
    .gs{font-size:.63rem;color:rgba(255,255,255,.45);margin-top:.1rem;font-family:'Lato',sans-serif}
    .ib{border-radius:9px;padding:.9rem;border:1.5px solid}
    .ib-l{font-size:.63rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;font-family:'Lato',sans-serif}
    .ib-g{font-size:.7rem;color:${MU};margin-top:.22rem;font-family:'Lato',sans-serif}
    .ib-n{font-family:'Courier New',monospace;font-size:1.15rem;font-weight:700;margin-top:.1rem}
    .ib-s{font-size:.63rem;color:${MU};margin-top:.12rem;font-family:'Lato',sans-serif}
    .eic{background:#fff;border:1.5px solid ${BD};border-radius:10px;padding:.9rem}
    .eic-hdr{display:flex;align-items:center;gap:.6rem;margin-bottom:.7rem;flex-wrap:wrap}
    .eic-f{display:grid;grid-template-columns:1fr 1fr 1fr;gap:.5rem}
    @media(max-width:480px){.eic-f{grid-template-columns:1fr 1fr}}
    .psec{margin-bottom:1rem}
    .pname{font-weight:700;font-size:.84rem;color:${N};display:flex;align-items:center;gap:.4rem;margin-bottom:.6rem;font-family:'Lato',sans-serif}
    .pdot{width:8px;height:8px;border-radius:50%}
    .pc-name{background:transparent;border:none;border-bottom:2px solid ${BD};color:${N};font-family:'Playfair Display',serif;font-size:1.15rem;font-weight:600;padding:.2rem 0;outline:none;flex:1;transition:border-color .2s;width:100%}
    .pc-name:focus{border-color:${B}}
    .pfields{display:grid;grid-template-columns:1fr 1fr;gap:.55rem;margin-top:.85rem}
    .add-row{display:flex;gap:.35rem;flex-wrap:wrap;margin-top:.6rem;align-items:center}
    .add-lbl{font-size:.63rem;color:${MU};text-transform:uppercase;letter-spacing:.04em;font-weight:600;font-family:'Lato',sans-serif}
    .g2{display:grid;grid-template-columns:1fr 1fr;gap:.65rem}
    .gAuto{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:.75rem}
    @media(max-width:600px){.g2,.gAuto{grid-template-columns:1fr}}
    .wi-tabs{display:grid;grid-template-columns:1fr 1fr;gap:.3rem;padding:.3rem;background:${S};border-radius:9px;border:1px solid ${BD};margin-bottom:.9rem}
    @media(min-width:600px){.wi-tabs{grid-template-columns:repeat(5,1fr)}}
    .wi-tab{padding:.4rem .4rem;border-radius:7px;border:none;font-family:'Lato',sans-serif;font-weight:600;font-size:.69rem;cursor:pointer;transition:all .15s;-webkit-tap-highlight-color:transparent;text-align:center}
    .footer{text-align:center;color:${MU};font-size:.63rem;margin-top:1.25rem;padding:1rem;background:#fff;border:1px solid ${BD};border-radius:10px;line-height:1.8;font-family:'Lato',sans-serif}
    @media(max-width:480px){.topbar-inner{padding:.5rem .75rem}.mode-btn{padding:.35rem .55rem;font-size:.7rem}.logo-sub{display:none}}
  `;

  const stopProp = e => e.stopPropagation();

  return(
    <>
      <style>{css}</style>
      <div className="topbar">
        <div className="topbar-inner">
          <div style={{display:"flex",alignItems:"center",gap:".6rem"}}>
            <div className="logo-sq">R</div>
            <div><div className="logo-text">Retirement Planner</div><div className="logo-sub">Personal planning tool</div></div>
          </div>
          <div className="mode-toggle">
            <button className={"mode-btn"+(mode==="forward"?" active":"")} onClick={()=>setMode("forward")}>📈 What Can I Afford?</button>
            <button className={"mode-btn"+(mode==="backward"?" active":"")} onClick={()=>setMode("backward")}>🎯 What Do I Need?</button>
          </div>
        </div>
      </div>
      <div style={{background:"#EEF2FA",minHeight:"100vh",paddingBottom:"3rem"}}>
      <div className="app">

        {/* Banner */}
        <div style={{background:"#fff",border:`1px solid ${BD}`,borderRadius:10,padding:".75rem 1rem",marginTop:".9rem",marginBottom:"-.1rem",display:"flex",alignItems:"center",gap:".75rem",flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:160}}>
            <div style={{fontWeight:700,fontSize:".95rem",color:N,fontFamily:"'Playfair Display',serif"}}>{mode==="forward"?"What Can I Afford?":"What Do I Need?"}</div>
            <div style={{fontSize:".71rem",color:MU,marginTop:2,fontFamily:"'Lato',sans-serif"}}>{mode==="forward"?"Enter your info — see your retirement picture.":"Start with your goal — see the gap and how to close it."}</div>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <div className="stat" style={{padding:".5rem .8rem",textAlign:"center"}}><div className="sl">Portfolio at Retire</div><div className="sv" style={{color:N,fontSize:"1rem"}}>{fmtK(baseTotal)}</div></div>
            <div className="stat" style={{padding:".5rem .8rem",textAlign:"center",borderColor:onTrack?GR+"55":RD+"55",background:onTrack?"#F0FDF4":"#FEF2F2"}}><div className="sl">{mode==="forward"?"Net Monthly":"Gap"}</div><div className="sv" style={{color:onTrack?GR:RD,fontSize:"1rem"}}>{mode==="forward"?fmt(totalNetMonthly):onTrack?"✓ On Track":"−"+fmtK(Math.abs(gap))}</div></div>
          </div>
        </div>

        <div className="layout">
        <div className="left-col">

          {/* Profile */}
          <Card collapsible defaultOpen={true} title="Your Profile"
            summary={persons.map(p=>(<SummaryItem key={p.id} label={p.name} value={`Age ${p.age} · Retire ${p.retireAge} · ${fmt(p.salary)}/yr`} color={N}/>))}
            right={persons.length<3&&<button className="btn-ghost" style={{fontSize:".7rem",padding:".25rem .6rem"}} onClick={e=>{stopProp(e);addP();}}>+ Add</button>}>
            {persons.map((p,pi)=>(
              <div key={p.id} style={{marginBottom:pi<persons.length-1?"1rem":0}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <input className="pc-name" value={p.name} onChange={e=>updP(p.id,{...p,name:e.target.value})}/>
                  {persons.length>1&&<button className="btn-rm" onClick={()=>delP(p.id)}>✕</button>}
                </div>
                <div className="pfields">
                  <label className="fld">Current Age<NI value={p.age} min={18} max={79} step={1} onChange={v=>updP(p.id,{...p,age:cl(v,18,79)})}/></label>
                  <label className="fld">Retire At<NI value={p.retireAge} min={p.age+1} max={80} step={1} suffix="yrs" onChange={v=>updP(p.id,{...p,retireAge:cl(v,p.age+1,80)})}/></label>
                  <label className="fld">Life Expectancy<NI value={p.lifeExp} min={p.retireAge+1} max={110} step={1} suffix="yrs" onChange={v=>updP(p.id,{...p,lifeExp:cl(v,p.retireAge+1,110)})}/></label>
                  <label className="fld">Annual Salary<NI value={p.salary} min={0} step={1000} prefix="$" onChange={v=>updP(p.id,{...p,salary:v})}/></label>
                </div>
              </div>
            ))}
          </Card>

          {/* Accounts */}
          <Card collapsible defaultOpen={true} title="Investment Accounts"
            summary={[<SummaryItem key="b" label="Total Balance" value={fmtK(currentBal)} color={N}/>,<SummaryItem key="m" label="Monthly Saving" value={fmt(streams.total)+"/mo"} color={B}/>,<SummaryItem key="s" label="Savings Rate" value={pct(savRate)} color={savRate>=15?GR:savRate>=10?AM:RD}/>]}>
            {persons.map((p,pi)=>(
              <div className="psec" key={p.id}>
                {persons.length>1&&<div className="pname"><span className="pdot" style={{background:[B,"#7C3AED","#EC4899"][pi%3]}}/>{p.name}</div>}
                <div style={{display:"flex",flexDirection:"column",gap:".65rem"}}>
                  {p.accounts.map(a=>{
                    const cfg=ATYPES[a.type],s=acctStreams(a,p.salary);
                    const empPT=a.empPreTaxMode==="pct"?(p.salary/12)*(a.empPreTaxPct/100):a.empPreTaxDollar;
                    const empRT=a.empRothMode==="pct"?(p.salary/12)*(a.empRothPct/100):a.empRothDollar;
                    const erAmt=Math.max(0,(s.pt+s.rt)-empPT-empRT);
                    return(
                      <div className="ac" key={a.id} style={{"--c":cfg.color}}>
                        <div className="ac-top">
                          <span style={{width:8,height:8,borderRadius:2,background:cfg.color,flexShrink:0,display:"inline-block"}}/>
                          <span className="ac-name">{a.label}</span>
                          <span style={{fontSize:".68rem",color:MU,marginLeft:"auto",marginRight:6,fontFamily:"'Courier New',monospace"}}>{fmtK(a.balance||0)}</span>
                          <button className="ac-rm" onClick={()=>delA(p.id,a.id)}>✕</button>
                        </div>
                        {a.type==="401k"?(
                          <div className="acf">
                            <label className="fld full">Balance<NI value={a.balance} min={0} step={1000} prefix="$" onChange={v=>updA(p.id,a.id,{...a,balance:v})}/></label>
                            <div className="sb2 full">
                              <div className="sb2-hdr"><span style={{fontSize:".64rem",fontWeight:700,color:N,textTransform:"uppercase",letterSpacing:".04em",fontFamily:"'Lato',sans-serif"}}>Your Contributions</span></div>
                              <div className="g2">
                                <div>
                                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:".3rem",gap:4}}>
                                    <span style={{fontSize:".6rem",fontWeight:700,color:PT,background:PT+"18",padding:"1px 5px",borderRadius:3,textTransform:"uppercase",fontFamily:"'Lato',sans-serif"}}>Pre-Tax</span>
                                    <Seg opts={[{v:"pct",l:"%"},{v:"dollar",l:"$"}]} val={a.empPreTaxMode} onChange={v=>updA(p.id,a.id,{...a,empPreTaxMode:v})} sm/>
                                  </div>
                                  {a.empPreTaxMode==="pct"?<SlN value={a.empPreTaxPct} min={0} max={50} step={.5} suffix="% sal" color={PT} onChange={v=>updA(p.id,a.id,{...a,empPreTaxPct:v})}/>:<SlN value={a.empPreTaxDollar} min={0} max={3000} step={25} prefix="$" suffix="/mo" color={PT} onChange={v=>updA(p.id,a.id,{...a,empPreTaxDollar:v})}/>}
                                  <div className="hint">{fmt(empPT)}/mo</div>
                                </div>
                                <div>
                                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:".3rem",gap:4}}>
                                    <span style={{fontSize:".6rem",fontWeight:700,color:RT,background:RT+"18",padding:"1px 5px",borderRadius:3,textTransform:"uppercase",fontFamily:"'Lato',sans-serif"}}>Roth</span>
                                    <Seg opts={[{v:"pct",l:"%"},{v:"dollar",l:"$"}]} val={a.empRothMode} onChange={v=>updA(p.id,a.id,{...a,empRothMode:v})} sm/>
                                  </div>
                                  {a.empRothMode==="pct"?<SlN value={a.empRothPct} min={0} max={50} step={.5} suffix="% sal" color={RT} onChange={v=>updA(p.id,a.id,{...a,empRothPct:v})}/>:<SlN value={a.empRothDollar} min={0} max={3000} step={25} prefix="$" suffix="/mo" color={RT} onChange={v=>updA(p.id,a.id,{...a,empRothDollar:v})}/>}
                                  <div className="hint">{fmt(empRT)}/mo</div>
                                </div>
                              </div>
                              <div className="hint" style={{marginTop:".35rem",paddingTop:".35rem",borderTop:`1px solid ${BD}`}}>Total employee: <strong>{fmt(empPT+empRT)}/mo</strong></div>
                            </div>
                            <div className="sb2 full">
                              <div className="sb2-hdr">
                                <span style={{fontSize:".64rem",fontWeight:700,color:N,textTransform:"uppercase",letterSpacing:".04em",fontFamily:"'Lato',sans-serif"}}>Employer Match</span>
                                <Seg opts={[{v:"pretax",l:"Pre-Tax"},{v:"roth",l:"Roth"}]} val={a.erTax} onChange={v=>updA(p.id,a.id,{...a,erTax:v})} sm/>
                              </div>
                              <div className="g2">
                                <label className="fld">Match %<NI value={a.erPct} min={0} max={200} step={5} suffix="%" onChange={v=>updA(p.id,a.id,{...a,erPct:v})}/></label>
                                <label className="fld">Up to<NI value={a.erCap} min={0} max={20} step={.5} suffix="% sal" onChange={v=>updA(p.id,a.id,{...a,erCap:v})}/></label>
                              </div>
                              <div className="hint" style={{marginTop:".3rem"}}>{fmt(erAmt)}/mo from employer</div>
                            </div>
                            <label className="fld">Expected Return<NI value={a.growth} min={0} max={20} step={.1} suffix="%/yr" onChange={v=>updA(p.id,a.id,{...a,growth:v})}/></label>
                          </div>
                        ):(
                          <div className="acf">
                            {a.type!=="brok"&&<div className="full"><div style={{fontSize:".64rem",color:MU,textTransform:"uppercase",letterSpacing:".04em",fontWeight:600,marginBottom:".3rem",fontFamily:"'Lato',sans-serif"}}>Tax Treatment</div><Seg opts={[{v:"pretax",l:"Pre-Tax"},{v:"roth",l:"Roth"}]} val={a.taxType} onChange={v=>updA(p.id,a.id,{...a,taxType:v})}/></div>}
                            <label className="fld full">Balance<NI value={a.balance} min={0} step={1000} prefix="$" onChange={v=>updA(p.id,a.id,{...a,balance:v})}/></label>
                            <label className="fld full">
                              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}><span>Contribution</span><Seg opts={[{v:"dollar",l:"$/mo"},{v:"pct",l:"%"}]} val={a.mode} onChange={v=>updA(p.id,a.id,{...a,mode:v})} sm/></div>
                              {a.mode==="dollar"?<SlN value={a.contribDollar} min={0} max={3000} step={25} prefix="$" suffix="/mo" color={cfg.color} onChange={v=>updA(p.id,a.id,{...a,contribDollar:v})}/>:<SlN value={a.contribPct} min={0} max={50} step={.5} suffix="% sal" color={cfg.color} onChange={v=>updA(p.id,a.id,{...a,contribPct:v})}/>}
                            </label>
                            <label className="fld full">Expected Return<NI value={a.growth} min={0} max={20} step={.1} suffix="%/yr" onChange={v=>updA(p.id,a.id,{...a,growth:v})}/></label>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="add-row"><span className="add-lbl">Add:</span>{Object.entries(ATYPES).map(([type,cfg])=>(<button key={type} className="btn-ghost" style={{fontSize:".68rem",padding:".22rem .55rem"}} onClick={()=>addA(p.id,type)}>+ {cfg.label}</button>))}</div>
              </div>
            ))}
          </Card>

          {/* Pension & SS */}
          <Card collapsible defaultOpen={false} title="Pension and Social Security"
            summary={[pension.on&&<SummaryItem key="p" label="Pension" value={fmt(pensionMo)+"/mo"} color={PS}/>,ss.on&&<SummaryItem key="s" label="Social Security" value={fmt(ssMo)+"/mo"} color={SSC}/>,!pension.on&&!ss.on&&<span key="off" style={{fontSize:".7rem",color:MU,fontFamily:"'Lato',sans-serif"}}>Not enabled</span>].filter(Boolean)}>
            <div style={{display:"flex",flexDirection:"column",gap:".75rem"}}>
              <div className="eic">
                <div className="eic-hdr"><Toggle on={pension.on} onChange={v=>setPension(s=>({...s,on:v}))}/><span style={{fontWeight:700,fontSize:".85rem",color:N,fontFamily:"'Lato',sans-serif",marginLeft:4}}>Pension</span>{pension.on&&<span style={{fontSize:".68rem",color:GR,marginLeft:"auto",fontWeight:600,fontFamily:"'Courier New',monospace"}}>{fmt(pensionMo)}/mo</span>}</div>
                {pension.on&&<div className="eic-f"><label className="fld">Monthly<NI value={pension.monthly} min={0} step={50} prefix="$" onChange={v=>setPension(s=>({...s,monthly:v}))}/></label><label className="fld">Start Age<NI value={pension.startAge} min={40} max={80} step={1} onChange={v=>setPension(s=>({...s,startAge:v}))}/></label><label className="fld">COLA<NI value={pension.cola} min={0} max={10} step={.1} suffix="%" onChange={v=>setPension(s=>({...s,cola:v}))}/></label></div>}
              </div>
              <div className="eic">
                <div className="eic-hdr"><Toggle on={ss.on} onChange={v=>setSS(s=>({...s,on:v}))}/><span style={{fontWeight:700,fontSize:".85rem",color:N,fontFamily:"'Lato',sans-serif",marginLeft:4}}>Social Security</span>{ss.on&&<span style={{fontSize:".68rem",color:GR,marginLeft:"auto",fontWeight:600,fontFamily:"'Courier New',monospace"}}>{fmt(ssMo)}/mo</span>}</div>
                {ss.on&&<div className="eic-f"><label className="fld">Est. Monthly<NI value={ss.monthly} min={0} step={50} prefix="$" onChange={v=>setSS(s=>({...s,monthly:v}))}/></label><label className="fld">Start Age<NI value={ss.startAge} min={62} max={70} step={1} onChange={v=>setSS(s=>({...s,startAge:v}))}/></label><label className="fld">COLA<NI value={ss.cola} min={0} max={5} step={.1} suffix="%" onChange={v=>setSS(s=>({...s,cola:v}))}/></label></div>}
              </div>
            </div>
          </Card>

          {/* Tax, Withdrawal & Growth */}
          <Card collapsible defaultOpen={false} title="Tax, Withdrawal and Growth Settings"
            summary={[<SummaryItem key="w" label="Withdrawal" value={pct(wRate)} color={wRate<=4?GR:wRate<=5.5?AM:RD}/>,<SummaryItem key="rg" label="Retire Growth" value={pct(retireGrowth)} color={B}/>,<SummaryItem key="t" label="Tax Rate" value={pct(taxRate)} color={MU}/>]}>
            <div style={{display:"flex",flexDirection:"column",gap:".85rem"}}>
              <div>
                <label className="fld" style={{marginBottom:".35rem"}}>Annual Withdrawal Rate</label>
                <SlN value={wRate} min={1} max={10} step={.1} suffix="%" color={wRate<=4?GR:wRate<=5.5?AM:RD} onChange={setWRate}/>
                <div style={{display:"flex",gap:".35rem",flexWrap:"wrap",marginTop:".45rem"}}>
                  {[{v:3,l:"3%"},{v:4,l:"4% Classic"},{v:5,l:"5%"},{v:7,l:"7%"}].map(r=>{const c=r.v<=4?GR:r.v<=5?AM:RD;return <button key={r.v} onClick={()=>setWRate(r.v)} style={{fontSize:".68rem",padding:".2rem .55rem",borderRadius:5,border:`1.5px solid ${c}55`,background:c+"15",color:c,cursor:"pointer",fontFamily:"'Lato',sans-serif",fontWeight:600}}>{r.l}</button>;})}
                </div>
              </div>
              <div style={{background:S,border:`1px solid ${BD}`,borderRadius:8,padding:".75rem"}}>
                <div style={{fontSize:".7rem",fontWeight:700,color:N,marginBottom:".5rem",fontFamily:"'Lato',sans-serif"}}>📊 Portfolio Growth Rate in Retirement</div>
                <label className="fld" style={{marginBottom:".35rem"}}>Return during drawdown phase</label>
                <SlN value={retireGrowth} min={0} max={10} step={.1} suffix="%/yr" color={B} onChange={setRetireGrowth}/>
                <div className="hint" style={{marginTop:".35rem"}}>A conservative rate assumes a more balanced, lower-risk portfolio in retirement. Typical range: 4–6%. Pre-retirement growth is set per account above.</div>
              </div>
              <div>
                <label className="fld" style={{marginBottom:".35rem"}}>Pre-Tax Withdrawal Tax Rate</label>
                <SlN value={taxRate} min={0} max={50} step={1} suffix="%" color={PT} onChange={setTaxRate}/>
                <div className="hint">Common rates: 12%, 22%, 24%</div>
              </div>
              <div>
                <label className="fld" style={{marginBottom:".35rem"}}>Long-Term Capital Gains Rate</label>
                <SlN value={ltcgRate} min={0} max={25} step={1} suffix="%" color={TXC} onChange={setLtcgRate}/>
                <div className="hint">0% under $47k · 15% most people · 20% high earners · Roth = 0%</div>
              </div>
            </div>
          </Card>

        </div>{/* end left-col */}
        <div className="right-col">

          {/* Wealth Map */}
          <Card collapsible defaultOpen={true} title="Wealth Map" summary={[<SummaryItem key="c" label="Portfolio Now" value={fmtK(currentBal)} color={N}/>,<SummaryItem key="r" label="At Retirement" value={fmtK(baseTotal)} color={GR}/>,<SummaryItem key="i" label="Net Monthly" value={fmt(totalNetMonthly)} color={B}/>]}>
            <WealthMap persons={persons} allA={allA} baseTotal={baseTotal} basePT={basePT} baseRT={baseRT} baseTX={baseTX} pension={pension} pensionMo={pensionMo} ss={ss} ssMo={ssMo} totalNetAnnual={totalNetAnnual}/>
          </Card>

          {/* Goal Income — backward */}
          {mode==="backward"&&(
            <Card collapsible defaultOpen={true} title="Goal Income" summary={[<SummaryItem key="g" label="Monthly Goal" value={fmt(goalEstimated/12)} color={GR}/>]}>
              <div style={{marginBottom:".85rem"}}><Seg opts={[{v:"estimate",l:"Help Me Estimate"},{v:"manual",l:"I Know My Number"}]} val={goalMode} onChange={setGoalMode}/></div>
              {goalMode==="manual"?(
                <div>
                  <label className="fld" style={{marginBottom:".4rem"}}>Target Annual Income (today dollars)</label>
                  <SlN value={goalManual} min={20000} max={500000} step={1000} prefix="$" suffix="/yr" color={GR} onChange={setGoalManual}/>
                  <div style={{display:"flex",gap:".35rem",flexWrap:"wrap",marginTop:".55rem"}}>
                    {[{v:totalSal*.6,l:"60% of salary"},{v:totalSal*.8,l:"80% of salary"},{v:totalSal,l:"100% of salary"}].map(r=>(<button key={r.v} onClick={()=>setGoalManual(Math.round(r.v))} style={{fontSize:".68rem",padding:".2rem .6rem",borderRadius:5,border:`1.5px solid ${B}44`,background:B+"15",color:B,cursor:"pointer",fontFamily:"'Lato',sans-serif",fontWeight:500}}>{r.l}</button>))}
                  </div>
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:".75rem"}}>
                  <div className="info">Enter monthly expenses in retirement — we total and inflate to retirement date.</div>
                  {[{l:"Housing",v:goalHousing,set:setGoalHousing,hint:"Paid off? Enter HOA/taxes/insurance only.",max:10000},{l:"Healthcare",v:goalHealth,set:setGoalHealth,hint:"Medicare + supplemental avg $500–800/mo.",max:5000},{l:"Travel and Fun",v:goalTravel,set:setGoalTravel,hint:"Vacations, hobbies, dining out.",max:5000},{l:"Food and Other",v:goalOther,set:setGoalOther,hint:"Groceries, utilities, subscriptions.",max:5000}].map(f=>(<div key={f.l}><label className="fld" style={{marginBottom:".3rem"}}>{f.l}</label><SlN value={f.v} min={0} max={f.max} step={50} prefix="$" suffix="/mo" color={GR} onChange={f.set}/><div className="hint">{f.hint}</div></div>))}
                  <div style={{background:S,border:`1px solid ${BD}`,borderRadius:8,padding:".65rem .9rem"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}><span style={{fontSize:".73rem",color:MU,fontFamily:"'Lato',sans-serif"}}>Monthly today</span><span style={{fontFamily:"'Courier New',monospace",fontWeight:700,color:TX}}>{fmt(goalHousing+goalHealth+goalTravel+goalOther)}/mo</span></div>
                    <div style={{marginTop:".55rem"}}><label className="fld" style={{marginBottom:".3rem"}}>Inflation Rate ({maxRetYrs} yrs to retire)</label><SlN value={goalInflation} min={0} max={6} step={.1} suffix="%/yr" color={AM} onChange={setGoalInflation}/></div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginTop:".6rem",paddingTop:".6rem",borderTop:`1px solid ${BD}`}}><span style={{fontSize:".73rem",color:MU,fontWeight:600,fontFamily:"'Lato',sans-serif"}}>Estimated at retirement</span><span style={{fontFamily:"'Courier New',monospace",fontWeight:700,color:N,fontSize:".95rem"}}>{fmt(goalEstimated/12)}/mo</span></div>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Gap Analysis — backward */}
          {mode==="backward"&&(
            <Card collapsible defaultOpen={true} title="Gap Analysis" summary={[<SummaryItem key="g" label="Status" value={onTrack?"On Track":"Gap: "+fmtK(Math.abs(gap))} color={onTrack?GR:RD}/>]}>
              <div style={{borderRadius:10,padding:".9rem 1rem",marginBottom:".9rem",background:onTrack?"#F0FDF4":gap>reqPortfolio*.5?"#FEF2F2":"#FFFBEB",border:`1.5px solid ${onTrack?GR+"55":gap>reqPortfolio*.5?RD+"55":AM+"55"}`}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:".6rem"}}>
                  <span style={{fontSize:"1.3rem",lineHeight:1,flexShrink:0}}>{onTrack?"✅":"⚠️"}</span>
                  <div>
                    <div style={{fontWeight:700,fontSize:".88rem",color:onTrack?"#14532D":gap>reqPortfolio*.5?"#7F1D1D":"#78350F",fontFamily:"'Lato',sans-serif"}}>{onTrack?`On track! Surplus of ${fmtK(Math.abs(gap))}.`:`Portfolio gap of ${fmtK(Math.abs(gap))}.`}</div>
                    <div style={{fontSize:".72rem",marginTop:3,color:MU,fontFamily:"'Lato',sans-serif"}}>{onTrack?`${fmtK(baseTotal)} projected > ${fmtK(reqPortfolio)} needed for ${fmt(goalEstimated/12)}/mo.`:`Need ${fmtK(reqPortfolio)} at retirement. Projected: ${fmtK(baseTotal)}.`}</div>
                  </div>
                </div>
              </div>
              <GapMeter have={baseTotal} need={reqPortfolio} label="Portfolio Funded"/>
              <GapMeter have={totalNetAnnual} need={goalEstimated} label="Income Funded"/>
              {!onTrack&&(
                <div style={{marginTop:".85rem"}}>
                  <div style={{fontWeight:700,fontSize:".8rem",color:N,marginBottom:".55rem",fontFamily:"'Lato',sans-serif"}}>To Close the Gap:</div>
                  {[{icon:"💰",label:`Save ${fmt(additionalNeeded)}/mo more`,desc:`Total → ${fmt(streams.total+additionalNeeded)}/mo`},{icon:"📅",label:"Retire a few years later",desc:"More compounding — try the What-If Explorer"},{icon:"🎯",label:`Reduce goal to ${fmt(totalNetAnnual/12)}/mo`,desc:"Match your current trajectory"},{icon:"📊",label:"Lower withdrawal rate",desc:"Extends portfolio longevity"}].map((a,i)=>(
                    <div key={i} style={{display:"flex",gap:".6rem",alignItems:"flex-start",padding:".65rem",background:i%2===0?S:"#fff",borderRadius:8,marginBottom:".35rem",border:`1px solid ${BD}`}}>
                      <span style={{fontSize:"1.1rem",lineHeight:1,flexShrink:0}}>{a.icon}</span>
                      <div><div style={{fontWeight:600,fontSize:".8rem",color:TX,fontFamily:"'Lato',sans-serif"}}>{a.label}</div><div style={{fontSize:".7rem",color:MU,marginTop:2,fontFamily:"'Lato',sans-serif"}}>{a.desc}</div></div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Savings Overview */}
          <Card collapsible defaultOpen={false} title="Savings Overview" summary={[<SummaryItem key="r" label="Portfolio at Retire" value={fmtK(baseTotal)} color={N}/>,<SummaryItem key="s" label="Savings Rate" value={pct(savRate)} color={savRate>=15?GR:savRate>=10?AM:RD}/>]}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:".6rem"}}>
              {[{l:"Gross Income",v:fmt(totalSal),c:N},{l:"Monthly Saving",v:fmt(streams.total)+"/mo",c:B},{l:"Pre-Tax Monthly",v:fmt(streams.pt)+"/mo",c:PT},{l:"Roth Monthly",v:fmt(streams.rt)+"/mo",c:RT},{l:"Savings Rate",v:pct(savRate),c:savRate>=15?GR:savRate>=10?AM:RD,bar:true},{l:"Pre-Tax at Retire",v:fmtK(basePT),c:PT},{l:"Roth at Retire",v:fmtK(baseRT),c:RT},{l:"Taxable at Retire",v:fmtK(baseTX),c:TXC},{l:"Total Portfolio",v:fmtK(baseTotal),c:N}].map(s=>(<div key={s.l} className="stat"><div className="sl">{s.l}</div><div className="sv" style={{color:s.c}}>{s.v}</div>{s.bar&&<div className="sbar2"><div className="sbar2f" style={{width:`${cl(savRate*3,0,100)}%`,background:s.c}}/></div>}</div>))}
            </div>
          </Card>

          {/* Growth Projection */}
          <Card collapsible defaultOpen={true} title="Growth Projection"
            summary={[<SummaryItem key="t" label="Pre-Tax" value={fmtK(basePT)} color={PT}/>,<SummaryItem key="r" label="Roth" value={fmtK(baseRT)} color={RT}/>,<SummaryItem key="x" label="Total" value={fmtK(baseTotal)} color={N}/>]}
            right={
              <div style={{display:"flex",gap:".4rem",flexWrap:"wrap"}} onClick={stopProp}>
                <div className="chart-ctrl">
                  <button className={"chart-btn"+(chartType==="area"?" on":"")} onClick={()=>setChartType("area")}>📈 Area</button>
                  <button className={"chart-btn"+(chartType==="bar" ?" on":"")} onClick={()=>setChartType("bar")}>📊 Bar</button>
                </div>
                <div className="chart-ctrl">
                  <button className={"chart-btn"+(chartTab==="accum"   ?" on":"")} onClick={()=>setChartTab("accum")}>To Retire</button>
                  <button className={"chart-btn"+(chartTab==="lifetime"?" on":"")} onClick={()=>setChartTab("lifetime")}>Lifetime</button>
                </div>
              </div>
            }>
            <div style={{fontSize:".7rem",color:MU,marginBottom:".75rem",lineHeight:1.5,fontFamily:"'Lato',sans-serif"}}>
              {chartTab==="accum"?<>{CY}→{CY+maxRetYrs} · <strong style={{color:PT}}>Pre-Tax {fmtK(basePT)}</strong> · <strong style={{color:RT}}>Roth {fmtK(baseRT)}</strong> · <strong style={{color:TXC}}>Taxable {fmtK(baseTX)}</strong> · <strong style={{color:N}}>Total {fmtK(baseTotal)}</strong></>:<>Accumulation + drawdown at {wRate}% withdrawal, {retireGrowth}% retirement growth</>}
            </div>
            <ResponsiveContainer width="100%" height={280}>
              {chartType==="bar"?(
                <BarChart data={chartRows} margin={{top:4,right:4,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BD}/>
                  <XAxis dataKey={xKey} stroke={BD} tick={{fill:MU,fontSize:10,fontFamily:"'Lato',sans-serif"}} tickFormatter={xFmt} interval={xInt}/>
                  <YAxis stroke={BD} tick={{fill:MU,fontSize:10,fontFamily:"'Lato',sans-serif"}} tickFormatter={fmtK} width={65}/>
                  <Tooltip content={<ChartTip isAge={chartTab==="lifetime"}/>}/>
                  <Legend wrapperStyle={{fontSize:".68rem",paddingTop:".75rem",fontFamily:"'Lato',sans-serif"}}/>
                  {SERIES.map(s=><Bar key={s.k} dataKey={s.k} name={s.name} stackId="s" fill={s.color} fillOpacity={.85}/>)}
                  {chartTab==="accum"&&<ReferenceLine x={maxRetYrs} stroke={AM} strokeDasharray="5 3" label={{value:"Retire",position:"insideTopRight",fill:AM,fontSize:10,fontWeight:600}}/>}
                  {chartTab==="lifetime"&&<ReferenceLine x={p0.retireAge} stroke={AM} strokeDasharray="5 3" label={{value:"Retire",position:"insideTopRight",fill:AM,fontSize:10,fontWeight:600}}/>}
                  {mode==="backward"&&reqPortfolio>0&&chartTab==="accum"&&<ReferenceLine y={reqPortfolio} stroke={GR} strokeDasharray="5 3" label={{value:"Goal",position:"insideTopRight",fill:GR,fontSize:10,fontWeight:700}}/>}
                </BarChart>
              ):(
                <AreaChart data={chartRows} margin={{top:4,right:4,left:0,bottom:0}}>
                  <defs>{SERIES.map(s=>(<linearGradient key={s.k} id={`g${s.k}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={s.color} stopOpacity={.22}/><stop offset="95%" stopColor={s.color} stopOpacity={.02}/></linearGradient>))}</defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={BD}/>
                  <XAxis dataKey={xKey} stroke={BD} tick={{fill:MU,fontSize:10,fontFamily:"'Lato',sans-serif"}} tickFormatter={xFmt} interval={xInt}/>
                  <YAxis stroke={BD} tick={{fill:MU,fontSize:10,fontFamily:"'Lato',sans-serif"}} tickFormatter={fmtK} width={65}/>
                  <Tooltip content={<ChartTip isAge={chartTab==="lifetime"}/>}/>
                  <Legend wrapperStyle={{fontSize:".68rem",paddingTop:".75rem",fontFamily:"'Lato',sans-serif"}}/>
                  {SERIES.map(s=>(<Area key={s.k} type="monotone" dataKey={s.k} name={s.name} stackId="1" stroke={s.color} fill={`url(#g${s.k})`} strokeWidth={2}/>))}
                  {chartTab==="accum"&&<ReferenceLine x={maxRetYrs} stroke={AM} strokeDasharray="5 3" label={{value:"Retire",position:"insideTopRight",fill:AM,fontSize:10,fontWeight:600}}/>}
                  {chartTab==="lifetime"&&<ReferenceLine x={p0.retireAge} stroke={AM} strokeDasharray="5 3" label={{value:"Retire",position:"insideTopRight",fill:AM,fontSize:10,fontWeight:600}}/>}
                  {mode==="backward"&&reqPortfolio>0&&chartTab==="accum"&&<ReferenceLine y={reqPortfolio} stroke={GR} strokeDasharray="5 3" label={{value:"Goal",position:"insideTopRight",fill:GR,fontSize:10,fontWeight:700}}/>}
                </AreaChart>
              )}
            </ResponsiveContainer>
            {chartTab==="lifetime"&&lifeRows.length>0&&lifeRows[lifeRows.length-1].TOT===0&&(
              <div className="warn" style={{marginTop:".75rem"}}>Portfolio depletes before age {p0.lifeExp} at {wRate}% withdrawal and {retireGrowth}% retirement growth. Consider reducing the withdrawal rate or increasing savings.</div>
            )}
          </Card>

          {/* Income Breakdown */}
          <Card collapsible defaultOpen={true} title="Retirement Income Breakdown" summary={[<SummaryItem key="a" label="Annual Net" value={fmt(totalNetAnnual)} color={N}/>,<SummaryItem key="m" label="Monthly Net" value={fmt(totalNetMonthly)} color={GR}/>]}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:".65rem",marginBottom:".9rem"}}>
              {[{l:"Pre-Tax Accounts",g:portIncome.pt/(1-taxRate/100+.001),n:portIncome.pt,sub:`after ${taxRate}% tax`,c:PT,bg:"#EFF6FF"},{l:"Roth Accounts",g:portIncome.rt,n:portIncome.rt,sub:"tax-free",c:RT,bg:"#ECFDF5"},{l:"Taxable Brokerage",g:portIncome.tx/(1-ltcgRate/100+.001),n:portIncome.tx,sub:`after ${ltcgRate}% LTCG`,c:TXC,bg:"#FFFBEB"},...(pension.on?[{l:"Pension",g:pensionMo*12,n:pensionMo*12,sub:`${pension.cola}% COLA`,c:PS,bg:"#F5F3FF"}]:[]),...(ss.on?[{l:"Social Security",g:ssMo*12,n:ssMo*12,sub:`${ss.cola}% COLA`,c:SSC,bg:"#F0FDFA"}]:[])].map(b=>(<div key={b.l} className="ib" style={{background:b.bg,borderColor:b.c+"44"}}><div className="ib-l" style={{color:b.c}}>{b.l}</div><div className="ib-g">Gross: {fmt(b.g)}/yr</div><div className="ib-n" style={{color:b.c}}>{fmt(b.n)}/yr</div><div className="ib-s">{fmt(b.n/12)}/mo · {b.sub}</div></div>))}
            </div>
            <div className="grand"><div><div className="gl">Annual Net</div><div className="gv">{fmt(totalNetAnnual)}</div><div className="gs">after taxes</div></div><div><div className="gl">Monthly Net</div><div className="gv">{fmt(totalNetMonthly)}</div><div className="gs">after taxes</div></div><div><div className="gl">Income Replace</div><div className="gv">{totalSal>0?pct(totalNetAnnual/totalSal*100):"—"}</div><div className="gs">target ≥80%</div></div></div>
          </Card>

          {/* What-If Explorer */}
          <Card collapsible defaultOpen={true} title="What-If Explorer" summary={[<SummaryItem key="b" label="Base Monthly" value={fmt(baseScenario.income/12)} color={B}/>]}>
            <div className="wi-tabs">
              {[{v:"monthly",l:"💰 Save More"},{v:"lumpsum",l:"🏦 Invest Cash"},{v:"retire",l:"📅 Retire Age"},{v:"growth",l:"📈 Returns"},{v:"combined",l:"⚡ Combined"}].map(t=>(<button key={t.v} className="wi-tab" onClick={()=>setWiTab(t.v)} style={{background:wiTab===t.v?N:"transparent",color:wiTab===t.v?"#fff":MU}}>{t.l}</button>))}
            </div>
            {wiTab==="monthly"&&(<div><div className="info" style={{marginBottom:".65rem"}}>Extra monthly savings split 60% pre-tax, 30% Roth, 10% taxable.</div><WIHead/>{whatIfMonthly.map(r=><WIRow key={r.extra} {...wiShared} label={r.extra===0?"Current Plan":`+${fmt(r.extra)}/mo`} portfolio={r.portfolio} income={r.income} isBase={r.extra===0}/>)}</div>)}
            {wiTab==="lumpsum"&&(<div><div className="info" style={{marginBottom:".65rem"}}>Invest a lump sum today — bonus, inheritance, savings, or asset sale proceeds.</div><div style={{display:"flex",gap:".45rem",alignItems:"center",marginBottom:".75rem",flexWrap:"wrap"}}><span style={{fontSize:".7rem",color:MU,fontWeight:600,fontFamily:"'Lato',sans-serif"}}>Custom:</span><NI value={wiLumpSum} min={0} max={2000000} step={1000} prefix="$" onChange={setWiLumpSum} style={{maxWidth:150}}/><span style={{fontSize:".7rem",color:GR,fontWeight:600,fontFamily:"'Courier New',monospace"}}>→ {fmtK(scenarioResult(0,wiLumpSum,0,null).portfolio)} · {fmt(scenarioResult(0,wiLumpSum,0,null).income/12)}/mo</span></div><WIHead/>{whatIfLumpSum.map(r=><WIRow key={r.lump} {...wiShared} label={r.lump===0?"No extra cash":`Invest ${fmtK(r.lump)}`} portfolio={r.portfolio} income={r.income} isBase={r.lump===0}/>)}</div>)}
            {wiTab==="retire"&&(<div><div className="info" style={{marginBottom:".65rem"}}>Working longer lets investments compound more and shortens the drawdown period.</div><WIHead/>{whatIfRetireAge.map(r=><WIRow key={r.age} {...wiShared} label={r.age===p0.retireAge?`Age ${r.age} (Current)`:`Retire at ${r.age}`} portfolio={r.portfolio} income={r.income} isBase={r.age===p0.retireAge}/>)}</div>)}
            {wiTab==="growth"&&(<div><div className="info" style={{marginBottom:".65rem"}}>Base: 7%/yr during accumulation. Conservative (bonds) ~5%. Aggressive (equity) ~9–10%.</div><WIHead/>{whatIfGrowth.map(r=><WIRow key={r.adj} {...wiShared} label={`${r.rate}%/yr${r.adj===0?" (Current)":r.adj<0?" (Conservative)":r.adj<=2?" (Growth)":" (Aggressive)"}`} portfolio={r.portfolio} income={r.income} isBase={r.adj===0}/>)}</div>)}
            {wiTab==="combined"&&(<div><div className="info" style={{marginBottom:".65rem"}}>Extra monthly savings combined with a one-time lump sum investment.</div><WIHead/>{whatIfCombined.map((r,i)=><WIRow key={i} {...wiShared} label={r.label} portfolio={r.portfolio} income={r.income} isBase={i===0}/>)}</div>)}
            {mode==="backward"&&!onTrack&&(<div className="success" style={{marginTop:".85rem"}}>To reach {fmt(goalEstimated/12)}/mo you need approx <strong>{fmt(additionalNeeded)}/mo</strong> more ({pct(additionalNeeded/Math.max(totalSal/12,1)*100)} of monthly salary).</div>)}
          </Card>

          <div className="footer">For personal educational use only. Does not account for inflation, RMDs, state taxes, Medicare premiums, or sequence-of-returns risk.<br/>Pension and Social Security shown in nominal dollars. Not financial advice — consult a qualified financial planner.</div>

        </div>{/* end right-col */}
        </div>{/* end layout */}
      </div>
      </div>
    </>
  );
}
