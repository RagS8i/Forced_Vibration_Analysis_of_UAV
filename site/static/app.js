/* ME312 propeller vibration surrogate — frontend */
const SVGNS = "http://www.w3.org/2000/svg";
const RAW = ["RPM","FreestreamVelocity","Blades","Diameter","Tilt","Chord1","Chord2","Chord3","Chord4","Chord5","Twist1","Twist2","Twist3","Twist4","Twist5","SweepAngle","AirfoilThickness"];
const DEFAULTS = {RPM:1210.24,FreestreamVelocity:22.02,Blades:4,Diameter:0.43,Tilt:15.71,Chord1:0.26,Chord2:0.12,Chord3:0.40,Chord4:0.12,Chord5:0.34,Twist1:24.89,Twist2:36.46,Twist3:36.81,Twist4:32.65,Twist5:4.06,SweepAngle:57.93,AirfoilThickness:0.0864};

let LAST = null;          // last /api/predict response
let MATERIALS = {};
let findingsLoaded = false;
let sweepChartInstance = null;

Chart.defaults.color = "#93a4bd";
Chart.defaults.borderColor = "#1e293b";
Chart.defaults.font.family = "system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
Chart.defaults.animation = false;
Chart.defaults.plugins.legend.labels.color = "#cbd5e1";

/* ---------------- form ---------------- */
const form = document.getElementById("form");
RAW.forEach(f=>{
  const d=document.createElement("div"); d.className="field";
  const l=document.createElement("label"); l.textContent=f;
  const i=document.createElement("input"); i.type="number"; i.step="any"; i.id="in_"+f; i.value=DEFAULTS[f];
  d.append(l,i); form.appendChild(d);
});

/* geometry controls */
const GEOM_FIELDS = ["Diameter","Blades","SweepAngle","Chord1","Chord2","Chord3","Chord4","Chord5","Twist1","Twist2","Twist3","Twist4","Twist5"];
const gc = document.getElementById("geomControls");
GEOM_FIELDS.forEach(f=>{
  const d=document.createElement("div"); d.className="field";
  const l=document.createElement("label"); l.textContent=f.replace(/(\d)/," $1");
  const i=document.createElement("input"); i.type="number"; i.step="any"; i.id="gc_"+f; i.value=DEFAULTS[f];
  d.append(l,i); gc.appendChild(d);
});
const updateBtn=document.createElement("button"); updateBtn.textContent="Update geometry"; updateBtn.onclick=()=>{
  GEOM_FIELDS.forEach(f=>{
    const v=parseFloat(document.getElementById("gc_"+f).value);
    document.getElementById("in_"+f).value=v;
  });
  predict();
};
gc.appendChild(updateBtn);

/* tabs */
document.querySelectorAll("nav .tab").forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll("nav .tab").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-"+btn.dataset.tab).classList.add("active");
    if(btn.dataset.tab==="geom" && LAST) renderGeometry(LAST);
    if(btn.dataset.tab==="findings" && !findingsLoaded){ findingsLoaded=true; loadFindings(); }
    if(btn.dataset.tab==="viz" && LAST) generateSweep();
  };
});
document.getElementById("sweepBtn").onclick = () => generateSweep();

/* ---------------- materials + main actions ---------------- */
async function loadMaterials(){
  const r=await fetch("/api/materials"); MATERIALS=await r.json();
  const sel=document.getElementById("material");
  Object.keys(MATERIALS).forEach(k=>{
    const o=document.createElement("option"); o.value=k;
    o.textContent=k+" — "+MATERIALS[k].label; sel.appendChild(o);
  });
  sel.value="GF_Nylon";
  sel.addEventListener("change",()=>{
    const mat=MATERIALS[sel.value];
    if(mat) document.getElementById("zeta").value=mat.ZETA;
  });
}
loadMaterials().then(()=>predict());

document.getElementById("predictBtn").onclick=predict;
document.getElementById("sampleBtn").onclick=loadSample;

async function loadSample(){
  const r=await fetch("/api/sample"); const d=await r.json();
  RAW.forEach(f=>{ if(d[f]!=null) document.getElementById("in_"+f).value=d[f]; });
  if(d["AirfoilThickness"]!=null) document.getElementById("in_AirfoilThickness").value=d["AirfoilThickness"];
  await predict();
}

function collect(){
  const payload={};
  RAW.forEach(f=> payload[f]=parseFloat(document.getElementById("in_"+f).value));
  payload.material=document.getElementById("material").value;
  payload.zeta=parseFloat(document.getElementById("zeta").value);
  payload.eps=parseFloat(document.getElementById("eps").value);
  return payload;
}

async function predict(){
  const payload=collect();
  const btn=document.getElementById("predictBtn");
  btn.disabled=true; btn.textContent="Running…";
  try{
    const r=await fetch("/api/predict",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    if(!r.ok){ document.getElementById("results").textContent="Error: "+(await r.text()); return; }
    const d=await r.json();
    LAST=d;
    renderResults(d);
    renderGeometry(d, true);
  }finally{ btn.disabled=false; btn.textContent="Predict"; }
}

/* ---------------- interactive RPM sweep ---------------- */
async function generateSweep(){
  const btn=document.getElementById("sweepBtn");
  btn.disabled=true; btn.textContent="Computing…";
  try{
    const r=await fetch("/api/sweep",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(collect())});
    if(!r.ok){ console.error(await r.text()); return; }
    const d=await r.json();
    const safeAmp=d.amp.map(v=>Math.max(v,1e-9));
    const idxNear=v=>d.rpm.reduce((best,cur,i)=>Math.abs(cur-v)<Math.abs(d.rpm[best]-v)?i:best,0);
    const designIdx=idxNear(d.design_rpm), resIdx=idxNear(d.resonance_rpm);
    const markerPlugin={
      id:"markers",
      afterDraw(chart){
        const {ctx,chartArea}=chart; const x=chart.scales.x;
        const draw=(i,color,label,align)=>{
          if(i<0) return;
          const px=x.getPixelForValue(i);
          ctx.save(); ctx.beginPath(); ctx.setLineDash([6,5]);
          ctx.moveTo(px,chartArea.top); ctx.lineTo(px,chartArea.bottom);
          ctx.strokeStyle=color; ctx.lineWidth=1.5; ctx.stroke(); ctx.restore();
          ctx.save(); ctx.fillStyle=color; ctx.font="11px system-ui";
          ctx.textAlign=align; ctx.fillText(label,px+(align==="right"?-4:4),chartArea.top+14); ctx.restore();
        };
        draw(resIdx,"#ef4444","r = 1 resonance","left");
        draw(designIdx,"#f59e0b","design point","right");
      }
    };
    if(sweepChartInstance) sweepChartInstance.destroy();
    sweepChartInstance=new Chart(document.getElementById("sweepChart"),{
      type:"line",
      plugins:[markerPlugin],
      data:{
        labels:d.rpm.map(v=>v.toFixed(0)),
        datasets:[
          {label:"amplitude (mm)",data:safeAmp,borderColor:"#38bdf8",backgroundColor:"rgba(56,189,248,.12)",fill:true,pointRadius:0,borderWidth:2,yAxisID:"y"},
          {label:"|CT̂|",data:d.ct.map(v=>Math.abs(v)),borderColor:"#a78bfa",pointRadius:0,borderWidth:1.5,yAxisID:"y1"}
        ]
      },
      options:{
        interaction:{mode:"index",intersect:false},
        plugins:{
          legend:{labels:{color:"#cbd5e1"}},
          annotation:false,
          tooltip:{callbacks:{title:items=>`${items[0].label} RPM`}}
        },
        scales:{
          x:{title:{display:true,text:"RPM",color:"#93a4bd"},ticks:{color:"#93a4bd",maxTicksLimit:12},grid:{display:false}},
          y:{type:"logarithmic",position:"left",title:{display:true,text:"amplitude (mm, log)",color:"#38bdf8"},ticks:{color:"#93a4bd"},grid:{color:"#1e293b"}},
          y1:{position:"right",title:{display:true,text:"|CT̂|",color:"#a78bfa"},ticks:{color:"#93a4bd"},grid:{display:false}}
        }
      }
    });
  }finally{ btn.disabled=false; btn.textContent="Generate sweep from Run-Model inputs"; }
}

/* ---------------- result panel ---------------- */
function fnum(v, n=4){ return (v==null||!isFinite(v)) ? "—" : Number(v).toFixed(n); }
function renderResults(d){
  const rows=[
    ["Physics prior CT_BET", fnum(d.CT_BET,4)],
    ["Learned CT̂ (ensemble)", fnum(d.CT_hat,4)],
    ["90% conformal CT interval", `[${fnum(d.CT_interval[0],3)}, ${fnum(d.CT_interval[1],3)}]`],
    ["First flap frequency f_n", fnum(d.fn_Hz,3)+" Hz"],
    ["Tip stiffness k_tip", fnum(d.k_tip,1)+" N/m"],
    ["Frequency ratio r = f_1P / f_n", fnum(d.r_ratio,4)],
    ["Magnification factor", fnum(d.magnification,3)],
    ["Predicted amplitude", fnum(d.amplitude_mm,4)+" mm"],
    ["90% amplitude interval", `[${fnum(d.amplitude_interval_mm[0],4)}, ${fnum(d.amplitude_interval_mm[1],4)}] mm`],
  ];
  document.getElementById("results").innerHTML=
    rows.map(([k,v])=>`<div class="metric"><span>${k}</span><b>${v}</b></div>`).join("");
  const dom=d.domain;
  document.getElementById("domain").innerHTML=`<b>Domain check</b><br>
    Mahalanobis d² = ${fnum(dom.mahalanobis_d2,2)} (threshold ${dom.mahalanobis_threshold}) <span class="${dom.mahalanobis_flag?'flag':'ok'}">${dom.mahalanobis_flag?'FLAGGED':'within domain'}</span><br>
    5-NN distance = ${fnum(dom.knn_distance,3)} (threshold ${fnum(dom.knn_threshold,3)}) <span class="${dom.knn_flag?'flag':'ok'}">${dom.knn_flag?'FLAGGED':'within domain'}</span>`;
}

/* ---------------- geometry rendering ---------------- */
function el(name, attrs={}, text){
  const e=document.createElementNS(SVGNS,name);
  for(const [k,v] of Object.entries(attrs)) e.setAttribute(k,v);
  if(text!=null) e.textContent=text;
  return e;
}
function clearSvg(svg){ while(svg.firstChild) svg.removeChild(svg.firstChild); }

function bladePoints(g, cx, cy, Rpx, baseDeg, sweep){
  const n=g.station_r.length;
  const pts=[];
  const chordScale = Rpx / g.R;   // metres -> pixels
  for(let i=0;i<n;i++){
    const rf=g.station_r[i];
    const d=rf*Rpx;
    const t=(rf-0.2)/0.8;
    const ang=(baseDeg + sweep*0.42*t)*Math.PI/180;
    const ux=Math.cos(ang), uy=Math.sin(ang);
    const tx=-uy, ty=ux;
    const half=g.chord[i]*chordScale/2;
    pts.push({le:[cx+ux*d+tx*half, cy+uy*d+ty*half], te:[cx+ux*d-tx*half, cy+uy*d-ty*half], d, half, ang});
  }
  return pts;
}

function renderGeometry(d, miniOnly=false){
  const g=d.geometry; if(!g) return;
  if(!miniOnly){ syncGeomControls(d.inputs); drawTopView(g); drawChordChart(g); drawTwistChart(g); drawStationTable(g); }
  drawMiniBlade(g);
}

function syncGeomControls(inputs){
  GEOM_FIELDS.forEach(f=>{
    if(inputs[f]!=null) document.getElementById("gc_"+f).value=inputs[f];
  });
}

function drawMiniBlade(g){
  const svg=document.getElementById("bladeSvg"); clearSvg(svg);
  const W=760,H=300, cx=80, cy=H/2-18, Rpx=590;
  const pts=bladePoints(g, cx, cy, Rpx, 0, 0);
  const path=[]; pts.forEach(p=>path.push(p.le)); pts.slice().reverse().forEach(p=>path.push(p.te));
  // background baseline
  svg.appendChild(el("line",{x1:cx,y1:cy,x2:cx+Rpx,y2:cy,stroke:"#1e293b","stroke-dasharray":"4 6"}));
  svg.appendChild(el("polygon",{points:path.map(p=>p.join(",")).join(" "),fill:"#2563eb", "fill-opacity":"0.32",stroke:"#60a5fa","stroke-width":"2"}));
  svg.appendChild(el("circle",{cx,cy,r:13,fill:"#1e293b",stroke:"#94a3b8","stroke-width":"2"}));
  svg.appendChild(el("text",{x:cx,y:cy+4,fill:"#cbd5e1","font-size":"9","text-anchor":"middle"},"hub"));
  svg.appendChild(el("text",{x:(cx+cx+Rpx)/2,y:H-16,fill:"#64748b","font-size":"12","text-anchor":"middle"},"r/R 0.2 → 1.0 · chord planform from the five chord stations"));
}

function drawTopView(g){
  const svg=document.getElementById("topView"); clearSvg(svg);
  const W=900,H=560,cx=W/2,cy=H/2+5,Rpx=225;
  const defs=el("defs");
  const grad=el("linearGradient",{id:"bladeGrad",x1:"0",y1:"0",x2:"1",y2:"1"});
  grad.append(el("stop",{offset:"0%","stop-color":"#1d4ed8","stop-opacity":"0.55"}));
  grad.append(el("stop",{offset:"100%","stop-color":"#38bdf8","stop-opacity":"0.25"}));
  defs.appendChild(grad); svg.appendChild(defs);

  svg.appendChild(el("line",{x1:20,y1:cy,x2:W-20,y2:cy,stroke:"#1e293b","stroke-dasharray":"4 6"}));
  svg.appendChild(el("line",{x1:cx,y1:20,x2:cx,y2:H-20,stroke:"#1e293b","stroke-dasharray":"4 6"}));
  svg.appendChild(el("circle",{cx,cy,r:Rpx,fill:"none",stroke:"#24344f","stroke-dasharray":"6 8"}));
  svg.appendChild(el("text",{x:cx+Rpx+6,y:cy+4,fill:"#64748b","font-size":"12"},"R = "+(g.R*1000).toFixed(0)+" mm"));

  const B=Math.max(2,Math.round(g.blades||4));
  for(let b=0;b<B;b++){
    const base=b*360/B;
    const pts=bladePoints(g,cx,cy,Rpx,base,g.sweep);
    const poly=[...pts.map(p=>p.le), ...pts.slice().reverse().map(p=>p.te)];
    svg.appendChild(el("polygon",{points:poly.map(p=>p.join(",")).join(" "),fill:"url(#bladeGrad)",stroke:"#60a5fa","stroke-width":"1.7"}));
    // radial centreline
    const tip=pts[pts.length-1];
    svg.appendChild(el("line",{x1:cx,y1:cy,x2:cx+Math.cos(tip.ang)*tip.d,y2:cy+Math.sin(tip.ang)*tip.d,stroke:"#93c5fd","stroke-width":"0.7","stroke-opacity":"0.5"}));
  }
  svg.appendChild(el("circle",{cx,cy,r:24,fill:"#1e293b",stroke:"#94a3b8","stroke-width":"2"}));
  svg.appendChild(el("circle",{cx,cy,r:6,fill:"#60a5fa"}));
  svg.appendChild(el("text",{x:24,y:30,fill:"#93a4bd","font-size":"13"},`${B} blades · Ø ${(g.R*2*1000).toFixed(0)} mm · sweep ${g.sweep.toFixed(1)}°`));
  svg.appendChild(el("text",{x:24,y:48,fill:"#64748b","font-size":"11"},"Top view — planform only (twist shown separately)."));
  svg.appendChild(el("text",{x:24,y:H-16,fill:"#64748b","font-size":"11"},"Sweep is applied progressively from root to tip."));
}

function axes(svg, box, xlab, ylab){
  const {x0,y0,x1,y1}=box;
  svg.appendChild(el("line",{x1:x0,y1:y1,x2:x1,y2:y1,stroke:"#475569"}));
  svg.appendChild(el("line",{x1:x0,y1:y0,x2:x0,y2:y1,stroke:"#475569"}));
  for(let i=0;i<=4;i++){
    const xx=x0+(x1-x0)*i/4;
    svg.appendChild(el("line",{x1:xx,y1:y1,x2:xx,y2:y1+5,stroke:"#475569"}));
    svg.appendChild(el("text",{x:xx,y:y1+19,fill:"#7f8ea9","font-size":"11","text-anchor":"middle"},(0.2+0.2*i).toFixed(1)));
  }
  svg.appendChild(el("text",{x:(x0+x1)/2,y:y1+38,fill:"#93a4bd","font-size":"12","text-anchor":"middle"},xlab));
  svg.appendChild(el("text",{x:14,y:(y0+y1)/2,fill:"#93a4bd","font-size":"12","text-anchor":"middle",transform:`rotate(-90 14 ${(y0+y1)/2})`},ylab));
}

function lineChart(svgId, xs, ys, ylab, color, fmt){
  const svg=document.getElementById(svgId); clearSvg(svg);
  const W=640,H=340, box={x0:70,y0:30,x1:W-30,y1:H-60};
  const lo=Math.min(...ys), hi=Math.max(...ys);
  const pad=(hi-lo)*0.18 || Math.abs(hi)*0.2 || 1;
  const ymin=lo-pad, ymax=hi+pad;
  const X=v=>box.x0+(v-0.2)/0.8*(box.x1-box.x0);
  const Y=v=>box.y1-(v-ymin)/(ymax-ymin)*(box.y1-box.y0);
  // horizontal grid
  for(let i=0;i<=4;i++){
    const yy=box.y0+(box.y1-box.y0)*i/4;
    svg.appendChild(el("line",{x1:box.x0,y1:yy,x2:box.x1,y2:yy,stroke:"#1e293b"}));
    const val=ymax-(ymax-ymin)*i/4;
    svg.appendChild(el("text",{x:box.x0-8,y:yy+4,fill:"#7f8ea9","font-size":"10","text-anchor":"end"},fmt(val)));
  }
  axes(svg,box,"r / R (0.2 = root, 1.0 = tip)",ylab);
  // area
  const area=[`${X(xs[0])},${box.y1}`,...xs.map((x,i)=>`${X(x)},${Y(ys[i])}`),`${X(xs[xs.length-1])},${box.y1}`].join(" ");
  svg.appendChild(el("polygon",{points:area,fill:color,"fill-opacity":"0.12"}));
  // line
  svg.appendChild(el("polyline",{points:xs.map((x,i)=>`${X(x)},${Y(ys[i])}`).join(" "),fill:"none",stroke:color,"stroke-width":"2.5","stroke-linejoin":"round"}));
  // points
  xs.forEach((x,i)=>{
    svg.appendChild(el("circle",{cx:X(x),cy:Y(ys[i]),r:4,fill:"#0b1120",stroke:color,"stroke-width":"2"}));
    const labelY = ys[i]>=ys.reduce((a,b)=>a+b,0)/ys.length ? Y(ys[i])-10 : Y(ys[i])+18;
    svg.appendChild(el("text",{x:X(x),y:labelY,fill:"#cbd5e1","font-size":"10","text-anchor":"middle"},fmt(ys[i])));
  });
}
function drawChordChart(g){ lineChart("chordChart", g.station_r, g.chord, "chord (m)", "#38bdf8", v=>v.toFixed(3)); }
function drawTwistChart(g){ lineChart("twistChart", g.station_r, g.twist, "twist (deg)", "#a78bfa", v=>v.toFixed(1)); }

function drawStationTable(g){
  const rows=g.station_r.map((rf,i)=>`<tr>
    <td>${i+1}</td><td>${rf.toFixed(2)}</td><td>${(rf*g.R*1000).toFixed(1)}</td>
    <td>${(g.chord[i]*1000).toFixed(1)}</td><td>${(g.chord[i]/g.R).toFixed(3)}</td>
    <td>${g.twist[i].toFixed(2)}</td><td>${(g.elem_t[i]*1000).toFixed(2)}</td>
  </tr>`).join("");
  document.getElementById("stationTable").innerHTML=`<table><thead><tr>
    <th>Station</th><th>r/R</th><th>Radius (mm)</th><th>Chord (mm)</th><th>Chord/R</th><th>Twist (°)</th><th>Thickness (mm)</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

/* ---------------- findings ---------------- */
async function loadFindings(){
  const [mR,cvR,tR,matR,sumR] = await Promise.all([
    fetch("/api/metrics"), fetch("/api/cv_results"), fetch("/api/test_predictions"),
    fetch("/api/material_envelope"), fetch("/api/summary")
  ]);
  const metrics=await mR.json(), cv=await cvR.json(), test=await tR.json(), mat=await matR.json(), sum=await sumR.json();

  /* KPIs */
  const lt=metrics.locked_test, ce=metrics.cv_ensemble;
  const kpis=[
    ["CT R² (test)", lt.CT_R2.toFixed(3), "locked 27-row set"],
    ["CT MAE", lt.CT_MAE.toFixed(3), "locked test"],
    ["CT sign accuracy", (lt.sign*100).toFixed(1)+"%", "locked test"],
    ["Amp R² (test)", lt.amp_R2.toFixed(3), "0.928 excl. near-zero"],
    ["Within 2×", (lt.within2x*100).toFixed(1)+"%", "amplitude, locked test"],
    ["Spearman", lt.spearman.toFixed(3), "amplitude ranking"],
    ["Risk AUC", lt.risk_AUC.toFixed(3), "resonance-risk ranking"],
    ["CV Amp R²", ce.amp_R2.toFixed(3), "repeated 5-fold ×3"],
  ];
  document.getElementById("kpis").innerHTML=kpis.map(([l,v,s])=>`<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div><div class="s">${s}</div></div>`).join("");

  /* CV chart + table */
  const cvRows=cv.rows;
  new Chart(document.getElementById("cvChart"),{
    type:"bar",
    data:{
      labels:cvRows.map(r=>r.model),
      datasets:[
        {label:"CT R²",data:cvRows.map(r=>r.CT_R2),backgroundColor:"#3b82f6",borderRadius:4},
        {label:"Amplitude R²",data:cvRows.map(r=>r.amp_R2),backgroundColor:"#8b5cf6",borderRadius:4},
        {label:"Risk AUC",data:cvRows.map(r=>r.risk_AUC),backgroundColor:"#10b981",borderRadius:4},
      ]
    },
    options:{
      responsive:true,
      plugins:{legend:{labels:{color:"#cbd5e1"}}},
      scales:{
        x:{ticks:{color:"#93a4bd",maxRotation:30,minRotation:0},grid:{display:false}},
        y:{min:0.45,max:1.0,ticks:{color:"#93a4bd"},grid:{color:"#1e293b"}}
      }
    }
  });
  const cvCols=["model","CT_R2","CT_MAE","sign","amp_R2","amp_RMSE","within2x","spearman","risk_AUC"];
  document.getElementById("cvTable").innerHTML=buildTable(cvCols,cvRows,{CT_R2:3,CT_MAE:3,sign:3,amp_R2:3,amp_RMSE:3,within2x:3,spearman:3,risk_AUC:3});

  /* test scatter CT */
  const tRows=test.rows;
  const css=(r)=> r<0.8 ? "#f59e0b" : r>1.2 ? "#ef4444" : "#10b981";
  new Chart(document.getElementById("testScatterCT"),{
    type:"scatter",
    data:{
      datasets:[
        {label:"designs",data:tRows.map(r=>({x:r.CT,y:r.CT_hat,r:r.r})),pointRadius:5,pointHoverRadius:7,
          backgroundColor:tRows.map(r=>css(r.r)),borderColor:"#0b1120",borderWidth:1},
        {label:"y = x",type:"line",data:[{x:-2.2,y:-2.2},{x:1,y:1}],borderColor:"#64748b",borderDash:[6,5],pointRadius:0,fill:false}
      ]
    },
    options:{
      plugins:{legend:{labels:{color:"#cbd5e1"}},tooltip:{callbacks:{label:c=>`CT ${c.raw.x.toFixed(2)} → CT̂ ${c.raw.y.toFixed(2)}`}}},
      scales:{
        x:{title:{display:true,text:"CT actual",color:"#93a4bd"},ticks:{color:"#93a4bd"},grid:{color:"#1e293b"}},
        y:{title:{display:true,text:"CT̂ predicted",color:"#93a4bd"},ticks:{color:"#93a4bd"},grid:{color:"#1e293b"}}
      }
    }
  });

  /* test scatter amplitude (log10) */
  const ampPts=tRows.map(r=>({x:Math.log10(Math.max(r.Amplitude_mm,1e-6)),y:Math.log10(Math.max(r.amp_hat,1e-6)),r:r.r}));
  const lo=Math.min(...ampPts.map(p=>p.x))-0.2, hi=Math.max(...ampPts.map(p=>p.x))+0.2;
  new Chart(document.getElementById("testScatterAmp"),{
    type:"scatter",
    data:{
      datasets:[
        {label:"designs",data:ampPts,pointRadius:5,pointHoverRadius:7,
          backgroundColor:ampPts.map(p=>css(p.r)),borderColor:"#0b1120",borderWidth:1},
        {label:"y = x",type:"line",data:[{x:lo,y:lo},{x:hi,y:hi}],borderColor:"#64748b",borderDash:[6,5],pointRadius:0,fill:false}
      ]
    },
    options:{
      plugins:{legend:{labels:{color:"#cbd5e1"}},tooltip:{callbacks:{label:c=>`log₁₀ amp ${c.raw.x.toFixed(2)} → ${c.raw.y.toFixed(2)}`}}},
      scales:{
        x:{title:{display:true,text:"log₁₀ amplitude actual (mm)",color:"#93a4bd"},ticks:{color:"#93a4bd"},grid:{color:"#1e293b"}},
        y:{title:{display:true,text:"log₁₀ amplitude predicted (mm)",color:"#93a4bd"},ticks:{color:"#93a4bd"},grid:{color:"#1e293b"}}
      }
    }
  });

  /* test table */
  const tCols=["id","RPM","Diameter","Tilt","CT","Amplitude_mm","r","CT_hat","amp_hat","log10_amp_err"];
  document.getElementById("testTable").innerHTML=buildTable(tCols,tRows,{RPM:1,Diameter:3,Tilt:2,CT:3,Amplitude_mm:4,r:3,CT_hat:3,amp_hat:4,log10_amp_err:3});

  /* material chart */
  const matRows=mat.rows;
  new Chart(document.getElementById("matChart"),{
    data:{
      labels:matRows.map(r=>r.material),
      datasets:[
        {type:"bar",label:"median amplitude ratio",data:matRows.map(r=>r.median_amp_ratio),backgroundColor:"#3b82f6",borderRadius:4},
        {type:"line",label:"p05",data:matRows.map(r=>r.p05_amp_ratio),borderColor:"#f59e0b",backgroundColor:"#f59e0b",pointRadius:4,borderWidth:2},
        {type:"line",label:"p95",data:matRows.map(r=>r.p95_amp_ratio),borderColor:"#ef4444",backgroundColor:"#ef4444",pointRadius:4,borderWidth:2}
      ]
    },
    options:{
      responsive:true,
      plugins:{legend:{labels:{color:"#cbd5e1"}}},
      scales:{
        x:{ticks:{color:"#93a4bd"},grid:{display:false}},
        y:{type:"logarithmic",ticks:{color:"#93a4bd",callback:v=>Number(v).toFixed(2)},grid:{color:"#1e293b"},title:{display:true,text:"ratio vs GF-Nylon (log scale)",color:"#93a4bd"}}
      }
    }
  });
  const mCols=["material","fn_ratio_vs_GF","k_ratio_vs_GF","median_amp_ratio","p05_amp_ratio","p95_amp_ratio"];
  document.getElementById("matTable").innerHTML=buildTable(mCols,matRows,{fn_ratio_vs_GF:3,k_ratio_vs_GF:3,median_amp_ratio:3,p05_amp_ratio:3,p95_amp_ratio:3});

  /* summary table */
  const sCols=["tier","item","value"];
  document.getElementById("summaryTable").innerHTML=buildTable(sCols,sum.rows,{value:6});
}

function buildTable(cols, rows, decimals={}){
  const head=cols.map(c=>`<th>${c}</th>`).join("");
  const body=rows.map(r=>"<tr>"+cols.map(c=>{
    let v=r[c];
    if(typeof v==="number"){
      const d=decimals[c]!=null?decimals[c]:4;
      v = Number.isInteger(v) ? v : v.toFixed(d);
    }
    return `<td>${v==null?"—":v}</td>`;
  }).join("")+"</tr>").join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/* ---------------- lightbox ---------------- */
const lb=document.getElementById("lightbox");
document.querySelectorAll("#gallery img").forEach(img=>{
  img.parentElement.addEventListener("click",()=>{ lb.querySelector("img").src=img.src; lb.classList.add("show"); });
});
lb.addEventListener("click",()=>lb.classList.remove("show"));
document.addEventListener("keydown",e=>{ if(e.key==="Escape") lb.classList.remove("show"); });
