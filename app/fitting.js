// Automatisch erzeugt von werkzeuge/fitting/app_fitting_bauen.py aus fitting_c.html – dort ändern.
// Schiffs-Fitting (Vorschau-Stand): Daten werden erst geladen, wenn „Fitting“ geöffnet wird.
(function () {
'use strict';
const appStore = () => { try { return eval('S'); } catch (e) { return null; } };
const fit = document.getElementById('fit');
if (!fit) return;
let impl = null, laden = null;
function lade() { return laden || (laden = fetch('data/fitting/fitting.json').then(r => r.json()).then(d => { impl = start(d); })); }
function start(D) {

/* Fitting C – Logik. Braucht: D (Daten), FIT (Rückgabe). Rechnet alles aus fit2-Daten; Bilder vom PC-Bildrechner. */
const I=D.items, IMGB='data/modelle/', RB='data/fitting/r2/';
const fmt=(v,d=0)=>v==null||isNaN(v)?'–':Number(v).toLocaleString('de-DE',{maximumFractionDigits:d,minimumFractionDigits:d});
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const KOMP=['PowerPlant','Cooler','Shield','QuantumDrive','Radar'];
const TNAME={WeaponGun:'Waffe',Turret:'Halterung',TurretBase:'Turret',MissileLauncher:'Raketen-Rack',BombLauncher:'Bomben-Rack',Missile:'Rakete',Bomb:'Bombe',PowerPlant:'Generator',Cooler:'Kühler',Shield:'Schild',QuantumDrive:'Quantum',Radar:'Radar',WeaponMining:'Mining-Kopf',WeaponDefensive:'Gegenmaßnahmen'};
const KUEHL_JE_PIP=1.7;   // geschätzt (Vergleich Erkul Meteor: 27 Kühlung bei 16 Pips)
let cur=Object.keys(D.ships)[0], showMk=true;try{const z=localStorage.getItem('plFitSchiff');if(z&&D.ships[z])cur=z}catch(e){}
const ST={},SLOT={};   // SLOT: gewählter Entwurf (1–4) je Schiff, wie die Slots bei Erkul
const sk_=()=>cur+(SLOT[cur]?'#'+SLOT[cur]:'');
const S_=()=>ST[sk_()]||(ST[sk_()]=neu(cur));
function neu(sid){const sh=D.ships[sid];return{sel:{},q:{},mis:{},pips:null,cur:null,paint:(sh.paints.find(p=>p.std)||sh.paints[0]).id,blade:(sh.blades.find(b=>b.std)||sh.blades[0]||{}).id,mod:['Mining_Modules_Passive_Rieger_MK3','Mining_Modules_Active_Surge'],modOn:[0,0],gad:'Mining_Gadget_SHIN_Sabir',fleet:null}}
const pk=sid=>{const p=S_().paint;return(p==='-'?'std':p).toLowerCase()};
// ---------- Baum der Steckplätze (dynamisch: anderes Teil → andere Unter-Plätze) ----------
const REL=new Set(['WeaponGun','Turret','TurretBase','MissileLauncher','BombLauncher','Missile','Bomb','PowerPlant','Cooler','Shield','QuantumDrive','Radar','WeaponMining','UtilityTurret','ToolArm','MiningModifier','WeaponDefensive','FlightController']);
function kand(n,eltern){const ty=new Set((n.types||[]).map(t=>t[0]));const lo=n.min||0,hi=n.max||0;const tags=(cur+' '+((I[eltern]||{}).tags||'')+' '+(D.ships[cur].tags||'')).toLowerCase();
 return Object.keys(I).filter(k=>{const it=I[k];if(!ty.has(it.t)||!((it.s||0)>=lo&&(it.s||0)<=hi))return false;const rq=(it.req||'').replace('$','').toLowerCase();if(rq&&!tags.includes(rq))return false;return true}).sort((a,b)=>I[a].n.localeCompare(I[b].n))}
function clsOf(n){const S=S_();return n.path in S.sel?S.sel[n.path]:n.item}
function kids(n){const S=S_(),c=clsOf(n);if(!c)return[];
 if(c===n.item&&n.kids)return n.kids.map(k=>Object.assign({},k,{path:n.path+'/'+k.port.toLowerCase(),eltern:c}));
 const it=I[c];if(!it||!it.ports)return[];
 return it.ports.filter(p=>REL.has(p.types[0][0])).map(p=>{const k={port:p.name,path:n.path+'/'+p.name.toLowerCase(),min:p.min,max:p.max,types:p.types,edit:!/uneditable/.test(p.flags||''),eltern:c,item:null,gen:1};
  const ty=p.types[0][0];if(ty==='Missile'||ty==='Bomb'){k.item=S.mis[n.path]&&I[S.mis[n.path]]&&I[S.mis[n.path]].s>=p.min&&I[S.mis[n.path]].s<=p.max?S.mis[n.path]:(kand(k,c)[0]||null)}
  return k})}
function wurzel(){return D.ships[cur].tree.map(n=>Object.assign({},n,{path:n.port.toLowerCase(),eltern:cur}))}
function alle(){const out=[];const w=ns=>ns.forEach(n=>{out.push(n);w(kids(n))});w(wurzel());return out}
// ---------- Kästchen (oberste Ebene, Turrets kompakt, Gleiches gebündelt) ----------
function guns(n){const out=[];const w=x=>{const c=clsOf(x);if(c&&I[c]&&I[c].t==='WeaponGun')out.push(x);kids(x).forEach(w)};w(n);return out}
function racks(n){const out=[];const w=x=>{const c=clsOf(x);if(c&&I[c]&&/Launcher$/.test(I[c].t))out.push(x);else kids(x).forEach(w)};w(n);return out}
function boxes(){const out=[];
 for(const n of wurzel()){const c=clsOf(n),it=I[c]||{},t=it.t||n.typ;
  if(!t||t==='FlightController'||t==='Container')continue;
  if(KOMP.includes(t)){out.push({kind:'comp',n,t});continue}
  if(t==='WeaponDefensive'){const g=out.find(b=>b.kind==='cm');g?g.ns.push(n):out.push({kind:'cm',n,ns:[n]});continue}
  if(t==='MissileLauncher'||t==='BombLauncher'){const same=out.find(b=>b.kind==='rack'&&!n.edit&&!b.n.edit&&clsOf(b.n)===c);same?same.ns.push(n):out.push({kind:'rack',n,ns:[n]});continue}
  if(t==='WeaponGun'){out.push({kind:'gun',n,g:n});continue}
  if(t==='ToolArm'||t==='UtilityTurret'){const m=alle().find(x=>x.path.startsWith(n.path+'/')&&I[clsOf(x)]&&I[clsOf(x)].t==='WeaponMining');if(m)out.push({kind:'mining',n:m});continue}
  if(t==='Turret'||t==='TurretBase'){const gs=guns(n),rs=racks(n);if(!gs.length&&!rs.length)continue;
   const k=kids(n);if(gs.length===1&&k.length===1&&gs[0].path===k[0].path&&!rs.length){out.push({kind:'gun',n,g:gs[0]});continue}
   if(/PDC/i.test(it.st||'')||/PDC/i.test(c||'')){const g=out.find(b=>b.kind==='pdc');g?g.ns.push(n):out.push({kind:'pdc',n,ns:[n]});continue}
   out.push({kind:'turret',n,gs,rs});continue}}
 return out}
// ---------- Werte ----------
function qf(it,prop,Q){if(Q==null||!it||!it.q||!it.q[prop])return 1;let f=1;for(const segs of it.q[prop]){const s=segs.find(x=>Q>=x[0]&&Q<=x[1])||segs[segs.length-1];const t=s[1]>s[0]?(Q-s[0])/(s[1]-s[0]):0;f*=s[2]+(s[3]-s[2])*t}return f}
function V(path,c){const it=I[c]||{},v=Object.assign({},it.v||{}),Q=S_().q[path];const wd=qf(it,'Weapon_Damage',Q);
 if(v.alpha!=null)v.alpha*=wd;if(v.dps!=null)v.dps*=wd;if(v.cool!=null)v.cool*=qf(it,'ItemResource_CoolantGeneration',Q);if(v.shp!=null)v.shp*=qf(it,'Shield_MaxHealth',Q);
 if(v.qspd!=null)v.qspd*=qf(it,'Quantum_Speed',Q);if(v.qfuel!=null)v.qfuel*=qf(it,'Quantum_FuelRequirement',Q);if(v.aimmax!=null)v.aimmax*=qf(it,'Radar_MaxAimAssistDistance',Q);if(v.aimmin!=null)v.aimmin*=qf(it,'Radar_MinAimAssistDistance',Q);
 if(v.frac!=null){v.frac*=wd;v.ext=(v.ext||0)*wd}return v}
// Strom-Verbraucher (wie Power-Menü im Spiel)
function verbr(){const sh=D.ships[cur],out=[],A=alle();
 out.push({id:'wpn',n:'Waffen',max:(sh.pools.WeaponGun||{}).size||4,min:0});
 if(sh.flug&&sh.flug.pw)out.push({id:'thr',n:'Antrieb',max:sh.flug.pw,min:Math.ceil(sh.flug.pw*(sh.flug.pmin||0))});
 for(const n of A){const c=clsOf(n),it=I[c];if(!it||!it.pw||!['Cooler','Shield','QuantumDrive','Radar','WeaponMining'].includes(it.t))continue;
  const mx=Math.max(1,Math.round(it.pw));out.push({id:n.path,n:{Cooler:'Kühl',Shield:'Schild',QuantumDrive:'QT',Radar:'Radar',WeaponMining:'Mining'}[it.t],max:mx,min:Math.max(1,Math.ceil(mx*(it.pmin||0)-1e-6)),rg:it.rg,path:n.path,t:it.t})}
 if(sh.life&&sh.life.pw)out.push({id:'ls',n:'Leben',max:sh.life.pw,min:sh.life.pw});return out}
function ppPips(n){const c=clsOf(n),it=I[c]||{};return Math.floor((it.v&&it.v.pg||it.pg||0)*qf(it,'ItemResource_PowerGeneration',S_().q[n.path])+1e-6)}   // gecraftet: Qualität ändert die Leistung (abgerundet, geschätzt)
function gen(){return alle().filter(n=>(I[clsOf(n)]||{}).t==='PowerPlant').reduce((a,n)=>a+ppPips(n),0)}
function stufe(c,n){if(n<c.min||n<=0)return 0;if(!c.rg||!c.rg.length)return 1;let f=0;for(const[a,m]of c.rg)if(n>=a)f=m;return f||1}
function pipsDef(){const C=verbr(),g=gen(),P={};let frei=g;for(const c of C){P[c.id]=frei>=c.min?c.min:0;frei-=P[c.id]}
 let go=1;while(frei>0&&go){go=0;for(const c of C){if(frei<=0)break;if(P[c.id]<c.max){if(P[c.id]===0&&c.min>1){if(frei>=c.min){P[c.id]=c.min;frei-=c.min;go=1}}else{P[c.id]++;frei--;go=1}}}}return P}
function pips(){const S=S_(),C=verbr();if(!S.pips)S.pips=pipsDef();for(const c of C)if(S.pips[c.id]==null)S.pips[c.id]=0;return S.pips}
function wirk(){const C=verbr(),P=pips(),w={};for(const c of C)w[c.id]=stufe(c,P[c.id]);const wp=C.find(c=>c.id==='wpn');w._wpn=(P.wpn||0)/((wp||{}).max||4);const t=C.find(c=>c.id==='thr');w._thr=t?(P.thr||0)/t.max:1;return w}
const thrF=x=>0.9+0.1*x;
function blade(){const sh=D.ships[cur];return sh.blades.find(b=>b.id===S_().blade)||sh.blades[0]||{f:{}}}
function stdBlade(){const sh=D.ships[cur];return sh.blades.find(b=>b.std)||sh.blades[0]||{f:{}}}
function werte(){const sh=D.ships[cur],A=alle(),w=wirk(),P=pips(),C=verbr(),g=gen(),used=C.reduce((a,c)=>a+(P[c.id]||0),0);const r={};
 const typ=t=>A.filter(n=>(I[clsOf(n)]||{}).t===t);
 const gs=typ('WeaponGun').map(n=>({n,v:V(n.path,clsOf(n))}));
 const wz=Object.fromEntries(wurzel().map(n=>[n.path,n]));r.src={pilot:[0,0],turm:[0,0],remote:[0,0]};   // Pilot = feste Waffen + Gimbal-Halterungen; Türme = bemannt/Ball; Remote = Fernsteuer-Türme (Namen aus den Spieldaten)
 gs.forEach(x=>{const rn=wz[x.n.path.split('/')[0]],it=I[clsOf(rn||{})]||{},nm=it.n||'',k=!rn||/Gimbal|VariPuck|Fixed|Mount/i.test(nm)&&!/Turret/i.test(nm)?'pilot':/Remote/i.test(nm)?'remote':it.t==='TurretBase'||/Turret/i.test(nm)?'turm':'pilot';r.src[k][0]+=x.v.alpha||0;r.src[k][1]+=x.v.dps||0});r.alpha=gs.reduce((a,x)=>a+(x.v.alpha||0),0);r.dps=gs.reduce((a,x)=>a+(x.v.dps||0),0);
 r.mis=A.filter(n=>['Missile','Bomb'].includes((I[clsOf(n)]||{}).t)).reduce((a,n)=>a+(I[clsOf(n)].v.alpha||0),0);r.nmis=A.filter(n=>['Missile','Bomb'].includes((I[clsOf(n)]||{}).t)).length;
 const sd=typ('Shield');r.shp=sd.reduce((a,n)=>a+(w[n.path]?V(n.path,clsOf(n)).shp:0),0);r.sreg=sd.reduce((a,n)=>a+V(n.path,clsOf(n)).sreg*(w[n.path]||0),0);
 const s0=sd[0]?I[clsOf(sd[0])].v:{};r.sres=s0.res||[];r.sabs=s0.abs||[];r.sdelay=[s0.dmgd,s0.down];
 r.cool=typ('Cooler').reduce((a,n)=>a+(V(n.path,clsOf(n)).cool||0)*(w[n.path]||0),0);r.coolMax=typ('Cooler').reduce((a,n)=>a+(V(n.path,clsOf(n)).cool||0),0);
 r.coolNeed=C.filter(c=>c.t!=='Cooler').reduce((a,c)=>a+(P[c.id]||0),0)*KUEHL_JE_PIP;
 r.gen=g;r.used=used;
 const ar=sh.armor||{};r.armor=ar;r.hull=(sh.rumpf||[]).reduce((a,x)=>a+x[1],0);
 // Signaturen: Komponenten × Auslastung × Panzerungs-Faktor (vereinfacht)
 r.em=A.reduce((a,n)=>{const it=I[clsOf(n)];if(!it||!it.em)return a;const c=C.find(x=>x.path===n.path);const f=c?(P[c.id]||0)/c.max:(it.t==='PowerPlant'?used/Math.max(1,g):1);return a+it.em*f},0)*(ar.em||1);
 r.ir=typ('Cooler').reduce((a,n)=>{const it=I[clsOf(n)];const c=C.find(x=>x.path===n.path);return a+(it.ir||0)*(c?(P[c.id]||0)/c.max:1)},0)*(ar.ir||1);
 r.cs=Math.max(...(sh.cs||[0]))*(ar.cs||1);
 const rd=typ('Radar')[0];if(rd){const v=V(rd.path,clsOf(rd)),f=w[rd.path]||0;r.radar={n:I[clsOf(rd)].n,s:I[clsOf(rd)].s,sens:(v.sens||[]).map(x=>x*f),aim:[v.aimmin*f,v.aimmax*f],on:f>0}}
 const qd=typ('QuantumDrive')[0];if(qd){const v=V(qd.path,clsOf(qd));r.qt=Object.assign({n:I[clsOf(qd)].n,s:I[clsOf(qd)].s,on:!!w[qd.path]},v);r.qt.reich=sh.qtank&&v.qfuel?sh.qtank/(v.qfuel/1000):null}
 const b=blade().f,b0=stdBlade().f,tf=thrF(w._thr);r.fl={scm:b.scm,bf:b.bf,max:b.max,p:b.pitch*tf,y:b.yaw*tf,r:b.roll*tf};r.fl0={scm:b0.scm,bf:b0.bf,max:b0.max,p:b0.pitch*tf,y:b0.yaw*tf,r:b0.roll*tf};
 return r}
const delta=(a,b,d=0)=>{const x=(a||0)-(b||0);return Math.abs(x)<1e-9?'':`<span class="f-d ${x>0?'f-good':'f-bad'}">${x>0?'+':''}${fmt(x,d)}</span>`};
// ---------- Text der Kästchen ----------
function sz(c){return I[c]&&I[c].s!=null?'S'+I[c].s:''}
function munition(path,c){const it=I[c]||{},v=it.v||{},w=wirk();if(v.ammo)return fmt(v.ammo)+' Schuss';
 if(v.energy){const e=v.energy;return fmt(e.load)+' Schuss · +'+fmt(e.regen*w._wpn,1)+'/s'}return''}
function gunTxt(g){const c=clsOf(g);if(!c)return['– leer –',''];const v=V(g.path,c);return[`${sz(c)} ${I[c].n}`,`α ${fmt(v.alpha,1)} · DPS ${fmt(v.dps)}${munition(g.path,c)?' · '+munition(g.path,c):''}`]}
function rackTxt(n){const c=clsOf(n);if(!c)return['– leer –',''];const ks=kids(n).filter(k=>['Missile','Bomb'].some(t=>(k.types[0]||[])[0]===t));const m=ks.length?clsOf(ks[0]):null,mv=m?I[m].v:{};
 return[`${sz(c)} ${I[c].n}`,m?`${ks.length}× ${sz(m)} ${I[m].n} · ${fmt(mv.alpha)} · ${mv.sig||''} · Lock ${fmt(mv.lock,1)} s · ${fmt(mv.rmin/1000,1)}–${fmt(mv.rmax/1000,1)} km`:'leer']}
function compTxt(n){const c=clsOf(n),it=I[c]||{},v=V(n.path,c);const t={PowerPlant:`${fmt(ppPips(n))} Pips`,Cooler:`${fmt(v.cool)} Kühlung · ${fmt(it.pw)} Pips`,Shield:`${fmt(v.shp)} HP · ${fmt(v.sreg)}/s`,
 QuantumDrive:`${fmt(v.qspd,3)} Gm/s · ${fmt(v.qspool,1)} s`,Radar:`Zielhilfe ${fmt(v.aimmin)}–${fmt(v.aimmax)} m`}[it.t]||'';return[`${sz(c)} ${it.n||'– leer –'}`,t]}
function boxTxt(b){if(b.kind==='gun'){const[t,s]=gunTxt(b.g);return{i:b.n===b.g?TNAME.WeaponGun:I[clsOf(b.n)]?I[clsOf(b.n)].n:'',t,s}}
 if(b.kind==='rack'){const[t,s]=rackTxt(b.n);return{i:(b.ns.length>1?b.ns.length+'× ':'')+TNAME[I[clsOf(b.n)]?.t||'MissileLauncher'],t,s}}
 if(b.kind==='comp'){const[t,s]=compTxt(b.n);return{i:TNAME[b.t],t,s}}
 if(b.kind==='mining'){const c=clsOf(b.n),v=V(b.n.path,c);return{i:'Mining-Kopf'+(b.n.edit===false&&c!==b.n.item?' · ⚠ Bug':''),t:`${sz(c)} ${I[c].n}`,s:`Laser ${fmt(v.frac)} · Extr. ${fmt(v.ext)}`}}
 if(b.kind==='cm'){return{i:'Gegenmaßnahmen',t:b.ns.map(n=>I[clsOf(n)]?I[clsOf(n)].n.replace(/^.* - /,''):'').filter((x,i,a)=>a.indexOf(x)===i).join(' / '),s:b.ns.map(n=>fmt((I[clsOf(n)]||{v:{}}).v.ammo)).join(' + ')+' Ladungen'}}
 if(b.kind==='pdc'){const gs=b.ns.flatMap(guns);const dps=gs.reduce((a,g)=>a+(V(g.path,clsOf(g)).dps||0),0);return{i:b.ns.length+'× PDC (automatisch)',t:I[clsOf(b.n)].n,s:`DPS ${fmt(dps)} gesamt`}}
 if(b.kind==='turret'){const gs=b.gs;const names=[...new Set(gs.map(g=>clsOf(g)).filter(Boolean))];const dps=gs.reduce((a,g)=>a+(clsOf(g)?V(g.path,clsOf(g)).dps||0:0),0);
  return{i:'Turret · '+(I[clsOf(b.n)]||{}).n,t:gs.length?`${gs.length}× ${names.length===1?sz(names[0])+' '+I[names[0]].n:'gemischt'}`:`${b.rs.length}× Rack`,s:gs.length?`DPS ${fmt(dps)} gesamt · antippen = Ausrüstung`:rackTxt(b.rs[0])[1]}}
 return{i:'',t:'',s:''}}
// ---------- Ansicht je Design ----------
function modus(){const t=document.body.dataset.t||'',R=RI(),f=t==='wc5m'||t==='scholo',cl=R.clip.includes(f?(R.paints?.[0]||'std'):pk(cur));// solange der Clip noch fehlt: Standbilder
 if(/^wc4/.test(t))return cl?['clip',0]:['drei',0];if(t==='wc5m'||t==='scholo')return cl?['clip',1]:['drei',1];if(t==='wc3v')return['drei',1];return['drei',0]}
const ANS={comp:{PowerPlant:'topl',Cooler:'topl',Shield:'topl',QuantumDrive:'sidel',Radar:'sidel'},cm:'sidel'};
// Hauptansicht: WC III zeigt Einsitzer direkt von vorne (wie das WC-III-Loadout), alle anderen Designs schräg
function hauptV(){const t=document.body.dataset.t||'';const R=RI();return t==='wc3v'&&R.views&&R.views.vorne&&(R.base||[]).some(x=>x.endsWith('__vorne'))?'vorne':'persp'}   // Rückfall schräg, bis das Vorne-Bild gerechnet ist (wechselt dann von selbst)
// Verteilung der Teile auf die drei Ansichten (Auftrag 47): Teile im Rumpf (Generator/Kühler/Schild) → Draufsicht, Quantum/Radar/Gegenmaßnahmen → Seite,
// Waffen/Racks/Türme: außen (seitlich der Mittellinie) → Hauptansicht, in der Mittellinie → Seite. Danach ausgleichen (höchstens ⅓ + 1 je Ansicht).
function verteilung(BX){
 const R=RI(),H=hauptV(),V=R.views,res=new Map();
 if(!Object.keys((V.topl||{}).ports||{}).length&&!Object.keys((V[H]||{}).ports||{}).length){BX.forEach((b,i)=>res.set(punkt(b),[H,'topl','sidel'][i%3]));return res}   // noch keine Punkte: gleichmäßig reihum
 const pos=(b,v)=>{const V_=V[v];if(!V_)return null;const k=punkt(b),pp=V_.ports[k]||V_.ports[k.split('/')[0]];return pp?[pp[0]/V_.w,pp[1]/V_.h]:null};
 const lat=b=>{const t=pos(b,'topl');return t?Math.abs(t[1]-.5):0};
 BX.forEach(b=>res.set(punkt(b),b.kind==='cm'?'sidel':b.kind==='comp'?(ANS.comp[b.t]==='sidel'?'sidel':'topl'):(lat(b)>.05?H:'sidel')));
 const cap=Math.ceil(BX.length/3)+1,vs=[H,'topl','sidel'].filter(v=>V[v]);
 for(let n=0;n<BX.length;n++){
  const cnt={};vs.forEach(v=>cnt[v]=BX.filter(b=>res.get(punkt(b))===v).length);
  const hi=vs.reduce((a,v)=>cnt[v]>cnt[a]?v:a),lo=vs.reduce((a,v)=>cnt[v]<cnt[a]?v:a);
  if(cnt[hi]<=cap||cnt[hi]-cnt[lo]<2)break;
  const cand=BX.filter(b=>res.get(punkt(b))===hi&&b.kind!=='comp'&&b.kind!=='cm'&&pos(b,lo));if(!cand.length)break;
  const dest=BX.filter(b=>res.get(punkt(b))===lo).map(b=>pos(b,lo)).filter(Boolean);
  const dist=b=>{const p=pos(b,lo);return dest.length?Math.min(...dest.map(q=>Math.hypot(q[0]-p[0],(q[1]-p[1])*.6))):1};
  cand.sort((a,b)=>dist(b)-dist(a));res.set(punkt(cand[0]),lo)}
 return res}
// Ansicht „vorne“: die Bilder haben viel leeren Rand links/rechts → seitlich auf die Schiffsbreite zuschneiden (Bild größer, Punkte/Overlays werden mitgerechnet)
function zuschnitt(v){const V_=RI().views[v];if(v!=='vorne'||!V_)return[0,1];const xs=Object.values(V_.ports).map(q=>q[0]/V_.w),d=Math.min(.5,Math.max(...xs.map(x=>Math.abs(x-.5)))+.09);return d>=.46?[0,1]:[.5-d,2*d]}
let ORD=[];   // Kästchen in der Reihenfolge, wie sie auf dem Bildschirm stehen (für die Pfeil-Knöpfe)
function punkt(b){return b.kind==='gun'?b.g.path:b.kind==='turret'?b.n.path:b.kind==='pdc'||b.kind==='cm'||b.kind==='rack'?b.ns[0].path:b.n.path}
const VDEF={persp:[800,500],topl:[800,500],sidel:[800,300]};
// Bilddaten eines Schiffs, auch wenn noch nichts gerendert ist (Platzhalter-Ansichten ohne Punkte: ports leer)
function RIof(id){const R=Object.assign({},(D.ships[id]||{}).R||{});R.base=R.base||[];R.clip=R.clip||[];R.ov=R.ov||{};R.ovpos=R.ovpos||{};R.paints=R.paints||[];
 R.views=Object.assign({},R.views||{});R.leer=!R.base.length;
 for(const v in VDEF)if(!R.views[v])R.views[v]={w:VDEF[v][0],h:VDEF[v][1],ports:{},ph:1};
 return R}
const RI=()=>RIof(cur);
// Platzhalter: Rahmen + Schiffsumriss + Text; hält das Seitenverhältnis des Bildplatzes
function platzSVG(v){const o={topl:'<path d="M50 6 L58 30 L92 52 L92 60 L60 56 L56 90 L64 96 L36 96 L44 90 L40 56 L8 60 L8 52 L42 30 Z"/>',sidel:'<path d="M6 55 L30 42 L62 40 L84 46 L96 54 L84 62 L40 64 L14 62 Z"/>'}[v]||'<path d="M50 8 L60 38 L94 62 L94 72 L58 66 L54 90 L62 94 L38 94 L46 90 L42 66 L6 72 L6 62 L40 38 Z"/>';
 return`<svg class="f-phs" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 2">${o}</g></svg>`}
function platz(v,txt,punkte){const V_=RI().views[v]||{w:4,h:3};return`<div class="f-platz" style="aspect-ratio:${V_.w}/${V_.h}">${platzSVG(v)}<span class="f-vdu">${txt||'Bild folgt'}${punkte?'<br><small>Punkte folgen</small>':''}</span></div>`}
// Bild, das beim Ladefehler selbst durch den Platzhalter ersetzt wird
function platzTausch(im){const d=document.createElement('div');d.innerHTML=platz(im.dataset.pv||'persp','Bild fehlt');im.replaceWith(d.firstChild)}
const ovKey=(pf,ck)=>(pf+'__'+ck).toLowerCase().replace(/[^a-z0-9]+/g,'_');
function bildPaint(){const[m,f]=modus(),R=RI(),p=pk(cur);if(f)return R.paints?.[0]||'std';return(m==='clip'?R.clip:R.base.map(x=>x.split('__')[0])).includes(p)?p:(R.paints?.[0]||'std')}
// ---------- Aufbau ----------
function render(){
 const S=S_(),sh=D.ships[cur],BX=boxes();if(!S.cur||!BX.some(b=>punkt(b)===S.cur))S.cur=punkt(BX.find(b=>b.kind==='gun')||BX[0]);
 const b=BX.find(x=>punkt(x)===S.cur),r=werte(),[m,filt]=modus();
 fit.innerHTML=`<div class="lo" id="LO">
 <div class="lo-top"><span class="lo-tab">loadout selection</span>
  <button class="f-btn f-shipbtn" id="SHIP" type="button" title="Schiff wählen: Hersteller › Rolle › Schiff">${esc(D.ships[cur].name)} ▾</button>
  <span class="f-dim" style="font-size:12px">${S.fleet?'Mein Schiff: <b class="f-hi">'+esc(S.fleet.name||sh.name)+'</b> · ':''}Werte + Bilder: Data.p4k · 4.10.2 · <span title="Werte aus den Spieldaten, teils vereinfacht oder geschätzt. Hauptzweck: einen Crafting-Plan zusammenstellen.">⚠ Werte ohne Gewähr – Hauptzweck: Crafting-Plan</span></span>
  <span class="f-slots">${[0,1,2,3].map(i=>`<button type="button" class="f-btn ${i===(SLOT[cur]||0)?'f-on':''}" data-slot="${i}" title="Entwurf ${i+1}: eigene Ausrüstung, bleibt beim Schiffswechsel erhalten">${i+1}</button>`).join('')}</span>
  <div class="sp"><button class="f-btn" id="TEILEN" title="Ausrüstung als Code weitergeben oder einen Code laden">Teilen / Laden</button><button class="f-btn" id="SAVE">${S.fleet?'Speichern':'Als mein Schiff speichern'}</button><button class="f-btn" id="RESET">Standard</button></div></div>
 <div class="lo-main"><div class="lo-pan lo-l" id="DET"></div>
  <div class="lo-pan lo-r" id="LOR">${kopf(r)}
   <div class="f-stage" id="STG"><div class="f-bcol" id="BL"></div><div class="f-art" id="ART"></div><div class="f-bcol" id="BR"></div></div>
   <svg class="lol" id="LOL"></svg></div></div>
 <div class="f-lo-keys"><div class="f-grp"><span>Teil</span><button data-it="-1">◀</button><button data-it="1">▶</button></div>
  <div class="f-grp"><span>Steckplatz</span><button data-hp="-1">◀</button><button data-hp="1">▶</button></div>
  <button class="f-go f-btn" id="GO">übernehmen</button></div>
 <div class="lo-under">${energie(r)}${paintPan(filt)}${bladePan()}${kuehlRadar(r)}${craftPan()}${gridPan()}</div></div>`;
 detail(b);buehne(BX);bind(BX,b);requestAnimationFrame(linien)}
function kopf(r){const sh=D.ships[cur],f=r.fl,f0=r.fl0,ar=r.armor,q=r.qt||{};const pc=x=>x==null?'–':(x<1?'−':'+')+fmt(Math.abs(1-x)*100)+' %';
 const res=i=>r.sres[i]?fmt(r.sres[i][1]*100)+' %':'–';
 const row=(a,b)=>`<div class="f-r"><span>${a}</span><span>${b}</span></div>`;
 return`<div class="f-hd"><span class="f-nm">${esc(sh.name)}</span><span class="f-vdu">${esc(sh.rolle||'')} · ${sh.crew||1} Crew · ${fmt(sh.size?.x)}×${fmt(sh.size?.y)}×${fmt(sh.size?.z)} m</span></div>
 <div class="f-tiles">
  <div class="f-tile"><h5>Flug · ${esc(blade().n||'')}</h5>${row('SCM / Boost',`${fmt(f.scm)}${delta(f.scm,f0.scm)} / ${fmt(f.bf)}${delta(f.bf,f0.bf)}`)}${row('Max (NAV)',fmt(f.max)+delta(f.max,f0.max)+' m/s')}
   ${row('Pitch / Yaw / Roll',`${fmt(f.p)}${delta(f.p,f0.p)} / ${fmt(f.y)}${delta(f.y,f0.y)} / ${fmt(f.r)}${delta(f.r,f0.r)}`)}</div>
  <div class="f-tile"><h5>Schaden</h5>${row('Pilot-Waffen α / DPS',`${fmt(r.src.pilot[0],1)} / ${fmt(r.src.pilot[1])}`)}${r.src.turm[1]?row('Türme (bemannt) α / DPS',`${fmt(r.src.turm[0],1)} / ${fmt(r.src.turm[1])}`):''}${r.src.remote[1]?row('Remote-Türme α / DPS',`${fmt(r.src.remote[0],1)} / ${fmt(r.src.remote[1])}`):''}${row('Gesamt α / DPS',`${fmt(r.alpha,1)} / ${fmt(r.dps)}`)}${row('Raketen / Bomben',r.nmis?`${r.nmis}× · ${fmt(r.mis)}`:'–')}</div>
  <div class="f-tile"><h5>Schilde</h5>${row('HP · Regeneration',`${fmt(r.shp)} · ${fmt(r.sreg)}/s`)}${row('Resistenz ph/en/dist',`${res(0)} / ${res(1)} / ${res(2)}`)}${row('Pause Treffer / leer',`${fmt(r.sdelay[0],1)} / ${fmt(r.sdelay[1],1)} s`)}</div>
  <div class="f-tile"><h5>Rumpf & Panzerung</h5>${row('Rumpf HP',fmt(r.hull))}${row('Panzerung HP',fmt(ar.hp))}${row('Schaden ph / en',`${pc(ar.phys)} / ${pc(ar.en)}`)}
   ${row('Ablenkung ph / en',`${fmt((ar.defl||{}).DamagePhysical)} / ${fmt((ar.defl||{}).DamageEnergy)}`)}</div>
  <div class="f-tile"><h5>Quantum ${q.n?'· '+esc(sz2(q.s)+' '+q.n):''}</h5>${row('Tempo · Anlauf',`${fmt(q.qspd,3)} Gm/s · ${fmt(q.qspool,1)} s`)}${row('Beschl. Stufe 1 / 2',`${fmt(q.a1,1)} / ${fmt(q.a2,1)} Mm/s²`)}
   ${row('Reichweite',(q.reich?'~'+fmt(q.reich)+' Gm':'–')+' · '+fmt(sh.qtank,2)+' SCU')}</div>
  <div class="f-tile"><h5>Signatur & Radar</h5>${row('EM · IR · CS',`${fmt(r.em/1000,1)}k · ${fmt(r.ir/1000,1)}k · ${fmt(r.cs/1000,1)}k`)}
   ${r.radar?row(esc(sz2(r.radar.s)+' '+r.radar.n),r.radar.on?`Zielhilfe ${fmt(r.radar.aim[0])}–${fmt(r.radar.aim[1])} m`:'<span class="f-bad">aus</span>')+row('Empfindl. IR/EM/CS',r.radar.sens.slice(0,3).map(x=>fmt(x*100)+'%').join(' / ')):''}</div>
 </div>`}
const sz2=s=>s!=null?'S'+s:'';
function detail(b){const el=fit.querySelector('#DET');if(!b){el.innerHTML='';return}const S=S_();
 const zeile=(path,node,label)=>{const ks=kand(node,node.eltern);const c=clsOf(node);return`<label class="f-sm">${esc(label)} · S${node.min}${node.max!==node.min?'–'+node.max:''}</label><select data-sel="${esc(path)}" ${node.edit===false?'disabled':''}>${node.edit===false?'':'<option value="">– leer –</option>'}${ks.map(k=>`<option value="${k}" ${k===c?'selected':''}>${esc(sz(k)+' '+I[k].n)}${I[k].mk?' · '+esc(I[k].mk):''}${node.bug&&k!==node.item?' · ⚠ nur per Bug':''}</option>`).join('')}</select>${node.edit===false?'':`<button type="button" class="f-btn f-cmp" data-cmp="${esc(path)}" title="Alle passenden Teile als sortierbare Tabelle">⇅ Vergleich</button>`}${node.bug&&c&&c!==node.item?'<div class="f-vdu f-bad" style="margin-top:4px">⚠ Dieser Kopf passt im Spiel nur über einen Bug – kann jederzeit verschwinden.</div>':''}`};
 let h='',bild=null;
 if(b.kind==='gun'){const g=b.g,c=clsOf(g),v=c?V(g.path,c):{},it=I[c]||{};bild=c;
  h+=`<div class="f-vdu">${esc(b.n.label||TNAME.WeaponGun)}</div><div class="f-nm">${esc(it.n||'– leer –')}</div><div class="f-vdu f-dim">${esc(it.mk||'')}${it.g?' · Klasse '+it.g:''}</div>`;
  h+=pic(c)+(c?`<div class="f-vdu">Alpha: <b>${fmt(v.alpha,1)}</b> (${Object.entries(v.dmg||{}).map(([k,x])=>({phys:'phys',energy:'energ',dist:'dist'})[k]+' '+fmt(x,1)).join(', ')})<br>DPS: <b>${fmt(v.dps)}</b> · Kadenz <b>${fmt(v.rpm)}/min</b><br>
   Munition: <b>${munition(g.path,c)||'–'}</b>${v.energy?'<br><span class="f-dim">Energie: Nachladen hängt von den Waffen-Pips ab (geschätzt)</span>':''}<br>Geschoss: <b>${fmt(v.spd)} m/s</b> · Reichweite <b>${fmt(v.rng)} m</b><br>Strom ${fmt(it.pw,2)} · EM ${fmt(it.em)}</div>${bp(c)}${qual(g.path,c)}`:'');
  if(b.n!==g)h+=zeile(b.n.path,b.n,'Halterung');h+=zeile(g.path,g,'Waffe')}
 if(b.kind==='rack'){const n=b.n,c=clsOf(n),ks=kids(n).filter(k=>['Missile','Bomb'].includes((k.types[0]||[])[0]));const m=ks[0]?clsOf(ks[0]):null,mv=m?I[m].v:{};bild=m||c;
  h+=`<div class="f-vdu">${b.ns.length>1?b.ns.length+'× ':''}${esc(n.label||TNAME[(I[c]||{}).t]||'Rack')}</div><div class="f-nm">${esc((I[c]||{}).n||'– leer –')}</div>`+pic(bild);
  if(m)h+=`<div class="f-vdu">${ks.length}× <b>${esc(sz(m)+' '+I[m].n)}</b><br>Schaden: <b>${fmt(mv.alpha)}</b> je Stück (${fmt(mv.alpha*ks.length*b.ns.length)} gesamt)<br>Aufschaltung: <b>${mv.sig}</b> · Lock <b>${fmt(mv.lock,1)} s</b> · Kegel <b>${fmt(mv.angle)}°</b><br>
   Lock-Reichweite: <b>${fmt(mv.rmin)}–${fmt(mv.rmax)} m</b><br>Tempo: <b>${fmt(mv.spd)} m/s</b> · Flugweite ${fmt(mv.flug/1000,1)} km</div>${bp(m)}`;
  h+=zeile(n.path,n,'Rack');if(ks.length){const mk={min:ks[0].min,max:ks[0].max,types:ks[0].types,eltern:c,edit:true};h+=`<label class="f-sm">Raketen (alle Plätze) · S${ks[0].max}</label><select data-mis="${esc(n.path)}">${kand(mk,c).map(k=>`<option value="${k}" ${k===m?'selected':''}>${esc(sz(k)+' '+I[k].n+' · '+fmt(I[k].v.alpha)+' · '+(I[k].v.sig||''))}</option>`).join('')}</select>`}}
 if(b.kind==='comp'){const n=b.n,c=clsOf(n),it=I[c]||{},v=V(n.path,c);bild=c;
  h+=`<div class="f-vdu">${esc(n.label||TNAME[b.t])}</div><div class="f-nm">${esc(it.n||'– leer –')}</div><div class="f-vdu f-dim">${esc(it.mk||'')}${it.g?' · Klasse '+it.g:''}${it.cl?' · '+esc(it.cl):''}</div>`+pic(c);
  const T={PowerPlant:`Leistung: <b>${fmt(ppPips(n))} Pips</b>${ppPips(n)!==Math.floor(it.pg||0)?` <span class="f-good">(Std. ${fmt(it.pg)})</span>`:""}`,Cooler:`Kühlung: <b>${fmt(v.cool)}</b> · Strom ${fmt(it.pw)} Pips<br>IR ${fmt(it.ir)} · EM ${fmt(it.em)}`,
   Shield:`Schild: <b>${fmt(v.shp)} HP</b> · Regen <b>${fmt(v.sreg)}/s</b><br>Pause Treffer/Zusammenbruch: ${fmt(v.dmgd,1)} / ${fmt(v.down,1)} s<br>Widerstand phys ${fmt((v.res?.[0]?.[1]||0)*100)} % · dist ${fmt((v.res?.[2]?.[1]||0)*100)} %`,
   QuantumDrive:`Tempo: <b>${fmt(v.qspd,3)} Gm/s</b> · Anlauf ${fmt(v.qspool,1)} s · Abkühlen ${fmt(v.qcd,1)} s<br>Beschleunigung ${fmt(v.a1,1)} / ${fmt(v.a2,1)} Mm/s²<br>Verbrauch ${fmt(v.qfuel,2)} (je Gm)`,
   Radar:`Zielhilfe: <b>${fmt(v.aimmin)}–${fmt(v.aimmax)} m</b><br>Empfindlichkeit IR/EM/CS/RS: ${(v.sens||[]).map(x=>fmt(x*100)+'%').join(' / ')}`}[b.t]||'';
  h+=`<div class="f-vdu">${T}<br>Strom ${fmt(it.pw)} Pips${it.pmin?' (mind. '+Math.ceil(it.pw*it.pmin-1e-6)+')':''}</div>${bp(c)}${qual(n.path,c)}`+zeile(n.path,n,TNAME[b.t])}
 if(b.kind==='mining'){const n=b.n,c=clsOf(n),it=I[c]||{},v=V(n.path,c);bild=c;
  h+=`<div class="f-vdu">Mining-Kopf</div><div class="f-nm">${esc(it.n)}</div>`+pic(c)+`<div class="f-vdu">Laser <b>${fmt(v.frac)}</b> · Extraktion <b>${fmt(v.ext)}</b> · ${fmt(v.rng)} m</div>${bp(c)}${qual(n.path,c)}`+zeile(n.path,Object.assign({},n,{edit:true,bug:n.edit===false}),'Mining-Kopf');
  const opt=Object.keys(I).filter(k=>I[k].t==='MiningModifier').sort((a,b)=>I[a].n.localeCompare(I[b].n));
  h+=Array.from({length:(it.v||{}).slots||0},(_,i)=>`<label class="f-sm">Modul ${i+1}</label><select data-mod="${i}"><option value="">– leer –</option>${opt.map(k=>`<option value="${k}" ${S.mod[i]===k?'selected':''}>${esc(I[k].n)} (${I[k].v.act})</option>`).join('')}</select>`).join('')+
  `<label class="f-sm">Gadget</label><select data-gad="1"><option value="">– keins –</option>${Object.keys(I).filter(k=>I[k].t==='Gadget').map(k=>`<option value="${k}" ${S.gad===k?'selected':''}>${esc(I[k].n)}</option>`).join('')}</select>`}
 if(b.kind==='turret'||b.kind==='pdc'){const ns=b.kind==='pdc'?b.ns:[b.n],gs=ns.flatMap(guns),rs=ns.flatMap(racks);bild=clsOf(b.n);
  h+=`<div class="f-vdu">${b.kind==='pdc'?ns.length+'× PDC (fest, automatisch)':'Turret'}</div><div class="f-nm">${esc((I[clsOf(b.n)]||{}).n)}</div>`+pic(bild)+
   `<div class="f-vdu">${gs.length} Waffen · DPS <b>${fmt(gs.reduce((a,g)=>a+(clsOf(g)?V(g.path,clsOf(g)).dps||0:0),0))}</b>${rs.length?'<br>'+rs.length+' Rack(s)':''}</div>`+
   (b.kind==='turret'?`<button class="f-btn" id="TOPEN" style="margin-top:8px;width:100%">Ausrüstung des Turrets öffnen</button>`:'<div class="f-vdu f-dim" style="margin-top:6px">PDCs schießen selbst auf Raketen – nicht tauschbar.</div>')}
 if(b.kind==='cm'){h+=`<div class="f-vdu">Gegenmaßnahmen</div>`+b.ns.map(n=>`<div class="f-vdu">${esc((I[clsOf(n)]||{}).n||n.port)}: <b>${fmt((I[clsOf(n)]||{v:{}}).v.ammo)}</b></div>`).join('')+'<div class="f-vdu f-dim">fest eingebaut</div>'}
 el.innerHTML=h}
function pic(c){const p=c&&((D.timg||{})[c]||((D.img||{})[c]&&IMGB+D.img[c]));return`<div class="f-pic">${p?`<img src="${p}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'f-ph',title:'Bild folgt',textContent:'⬡'}))">`:'<span class="f-ph" title="Bild folgt">⬡</span>'}</div>`}
function hatBp(c){const it=I[c]||{};const as=typeof appStore==='function'?appStore():null;return as&&as.owned&&it.bp?!!as.owned[it.bp]:!!it.own}
function bp(c){const it=I[c]||{};return`<div class="f-vdu" style="margin-top:5px">${!it.bp?'<span class="f-dim">nicht craftbar</span>':hatBp(c)?'<span class="f-good">✓ Blueprint vorhanden</span>':!it.pools?'<span class="f-warn">BP nicht erspielbar</span>':'<span class="f-bad">✗ Blueprint fehlt</span>'}</div>`}
function qual(path,c){const it=I[c]||{};if(!it.bp)return'';const Q=S_().q[path];return`<div class="f-q"><label><input type="checkbox" data-qc="${esc(path)}" ${Q!=null?'checked':''}> gecraftet</label><input type="range" data-qr="${esc(path)}" min="0" max="1000" value="${Q??0}" ${Q==null?'disabled':''}><b>${Q==null?'Std.':'Q'+Q}</b></div>`}
function buehne(BX){const A=fit.querySelector('#ART'),BL=fit.querySelector('#BL'),BR=fit.querySelector('#BR'),R=RI(),[m]=modus(),sk=cur.toLowerCase(),S=S_(),p=bildPaint();
 const box=(b,i)=>{const t=boxTxt(b);const grp=b.kind==='turret'||b.kind==='pdc'||(b.ns&&b.ns.length>1);return`<div class="f-slot ${punkt(b)===S.cur?'f-on':''} ${grp?'f-grp':''}" data-slot="${esc(punkt(b))}"><i>${i+1} · ${esc(t.i)}</i><b>${esc(t.t)}</b><small>${esc(t.s)}</small></div>`};
 const STG=fit.querySelector('#STG');STG.className='f-stage';ORD=BX;
 if(m==='clip'){const has=R.clip.length;A.className='f-art f-artc';A.innerHTML=has?`<img src="${RB+sk}/clip2_${p}.webp" alt="">`:platz('persp','Clip folgt');
  const half=Math.ceil(BX.length/2);BL.innerHTML=BX.slice(0,half).map((b,i)=>box(b,i)).join('');BR.innerHTML=BX.slice(half).map((b,i)=>box(b,i+half)).join('');return}
 const H=hauptV(),AV=verteilung(BX);STG.className='f-stage f-stage3';BL.innerHTML='';BR.innerHTML='';
 const vw=v=>{const c=zuschnitt(v),V_=R.views[v],ar=V_&&c[1]<1?`aspect-ratio:${c[1]*V_.w}/${V_.h};overflow:hidden;`:'';return`<div class="f-v f-v${v==='vorne'?'p':v[0]}" data-v="${v}" style="${ar}">${R.base.includes(p+'__'+v)?`<img class="f-b" data-pv="${v}" src="${RB+sk}/${p}__${v}.webp" alt="" style="${c[1]<1?`width:${100/c[1]}%;max-width:none;margin-left:${-c[0]/c[1]*100}%`:''}">`:platz(v,'Bild folgt',!Object.keys((V_||{}).ports||{}).length)}</div>`}
 A.className='f-art f-art3';A.innerHTML=`<div class="f-bcol f-bl" id="BL3"></div>${vw(H)}<div class="f-bcol f-bm" id="BM3"></div>${vw('topl')}${vw('sidel')}<div class="f-bcol f-br" id="BR3"></div>`;
 // eingeblendete Waffen / Racks (aktuelle Auswahl)
 const ovs=[];for(const pf in R.ov){const n=alle().find(x=>x.path===pf);if(!n)continue;const c=clsOf(n);if(!c)continue;let ck=c;
  if(/Launcher$/.test((I[c]||{}).t||'')){const k=kids(n).find(x=>['Missile','Bomb'].includes((x.types[0]||[])[0]));if(!k||!clsOf(k))continue;ck=c+'+'+clsOf(k)}
  for(const v of[hauptV(),'topl','sidel']){const key=ovKey(pf,ck)+'__'+v,pos=R.ovpos[key];if(pos)ovs.push([v,key,pos])}}
 for(const[v,key,pos]of ovs){const V_=R.views[v],cont=A.querySelector(`[data-v="${v}"]`);if(!cont||!V_)continue;const im=document.createElement('img');im.className='f-o';im.alt='';im.addEventListener('error',()=>{im.remove();requestAnimationFrame(linien)});im.src=`${RB+sk}/ov/${key}.webp`;
  const zc=zuschnitt(v);im.style.left=(pos[0]/V_.w-zc[0])/zc[1]*100+'%';im.style.top=pos[1]/V_.h*100+'%';im.style.width=pos[2]/V_.w/zc[1]*100+'%';cont.appendChild(im)}
 // Punkte + Kästchen: Hauptansicht links/rechts der Schiffsmitte getrennt (BL/BM), Draufsicht + Seite rechts (BR); je Spalte von oben nach unten
 const L=[],M=[],Rr=[],pts={};
 const med=a=>{a=a.slice().sort((x,y)=>x-y);return a.length?a[a.length>>1]:.5};
 const VH=R.views[H],cx=VH?med(Object.values(VH.ports).map(q=>q[0]/VH.w)):.5;
 BX.forEach((b,i)=>{const v=AV.get(punkt(b)),V_=R.views[v];const pp=V_&&(V_.ports[punkt(b)]||V_.ports[punkt(b).split('/')[0]]);const x=pp?pp[0]/V_.w:.5,y=pp?pp[1]/V_.h:.5;
  const o={b,i,x,y,o:v==='sidel'?1:0};(v===H?(x<cx?L:M):Rr).push(o);if(pp&&showMk){const zc=zuschnitt(v);(pts[v]=pts[v]||[]).push({b,i,x:(x-zc[0])/zc[1],y})}});
 const srt=a=>a.sort((p,q)=>p.o-q.o||p.y-q.y||p.x-q.x);srt(L);srt(M);srt(Rr);
 const num=new Map();ORD=[];[...L,...M,...Rr].forEach((o,n)=>{num.set(punkt(o.b),n+1);ORD.push(o.b)});
 for(const v in pts){const cont=A.querySelector(`[data-v="${v}"]`);if(!cont)continue;const W_=cont.clientWidth||400,H_=cont.clientHeight||300,arr=pts[v];
  for(let it=0;it<40;it++){let moved=0;for(let a=0;a<arr.length;a++)for(let c=a+1;c<arr.length;c++){const dx=(arr[c].x-arr[a].x)*W_,dy=(arr[c].y-arr[a].y)*H_,d=Math.hypot(dx,dy);if(d<20){const k=(20-d)/2/(d||1),ux=d?dx:1,uy=d?dy:0;arr[a].x-=ux*k/W_;arr[a].y-=uy*k/H_;arr[c].x+=ux*k/W_;arr[c].y+=uy*k/H_;moved=1}}if(!moved)break}
  for(const q of arr){const mk=document.createElement('div');mk.className='f-mk'+(punkt(q.b)===S.cur?' f-on':'');mk.textContent=num.get(punkt(q.b));mk.dataset.slot=punkt(q.b);mk.style.left=q.x*100+'%';mk.style.top=q.y*100+'%';
   mk.onclick=()=>{S.cur=punkt(q.b);render()};cont.appendChild(mk)}}
 const col=(id,a)=>{A.querySelector(id).innerHTML=a.map(o=>box(o.b,num.get(punkt(o.b))-1)).join('')};col('#BL3',L);col('#BM3',M);col('#BR3',Rr)}
function linien(){const R=fit.querySelector('#LOR'),svg=fit.querySelector('#LOL');if(!R||!svg)return;if(fit.classList.contains('schmal')||modus()[0]==='clip'){svg.innerHTML='';return}const rb=R.getBoundingClientRect();let h='';
 fit.querySelectorAll('#ART .f-mk').forEach(m=>{const b=fit.querySelector(`.f-bcol .f-slot[data-slot="${CSS.escape(m.dataset.slot)}"]`);if(!b)return;const mb=m.getBoundingClientRect(),bb=b.getBoundingClientRect();
  const links=bb.right<mb.left;const x1=(links?bb.right:bb.left)-rb.left,y1=bb.top+bb.height/2-rb.top,xm=x1+(links?1:-1)*(10+([...b.parentNode.children].indexOf(b)%3)*5),x2=mb.left+mb.width/2-rb.left,y2=mb.top+mb.height/2-rb.top,on=m.classList.contains('f-on');
  h+=`<polyline points="${x1},${y1} ${xm},${y1} ${x2},${y2}" style="fill:none;stroke:${on?'var(--lo-sel)':'var(--lo-hi)'};stroke-opacity:${on?1:.5};stroke-width:${on?2.5:1.5}"/>`});svg.innerHTML=h}
function energie(r){const C=verbr(),P=pips();return`<div class="lo-pan"><h4>Energie · ${r.gen-r.used} / ${r.gen} Pips frei</h4><div class="f-pips">${C.map(c=>{const n=P[c.id]||0;return`<div class="f-c"><div class="f-s">${Array.from({length:c.max},(_,i)=>`<i data-c="${esc(c.id)}" data-n="${i+1}" class="${i<n?'f-u':''} ${i<c.min?'f-m':''}"></i>`).join('')}</div><div class="f-l">${esc(c.n)}<br>${n}/${c.max}</div></div>`}).join('')}</div>
 <div class="f-arr" style="margin-top:8px"><button id="PDEF" class="f-btn">Vorschlag</button><button id="P0" class="f-btn">0</button></div><div class="f-vdu f-dim">Gelber Rand = Mindest-Pips · Pips/Stufen aus den Spieldaten</div></div>`}
function paintPan(filt){const sh=D.ships[cur],S=S_();return`<div class="lo-pan"><h4>Paint · ${sh.paints.length}</h4><div class="f-plist">${sh.paints.map(p=>`<div data-p="${esc(p.id)}" class="${p.id===S.paint?'f-on':''}"><span class="f-sw">${(p.c||[]).map(c=>`<i style="background:${c}"></i>`).join('')}</span>${esc(p.n)}</div>`).join('')}</div>
 ${filt?'<div class="f-vdu f-dim" style="margin-top:6px">In diesem Design ohne Texturen – Farben siehe Punkte.</div>':''}</div>`}
function bladePan(){const sh=D.ships[cur],S=S_(),b0=stdBlade().f;return`<div class="lo-pan"><h4>Flight Blade</h4><table class="f-t"><tr><th>Blade</th><th>SCM</th><th>Max</th><th>P/Y/R</th></tr>${sh.blades.map(b=>`<tr data-b="${esc(b.id)}" style="cursor:pointer;${b.id===S.blade?'outline:1px solid var(--lo-sel)':''}"><td>${esc(b.n)}</td><td>${fmt(b.f.scm)}${delta(b.f.scm,b0.scm)}</td><td>${fmt(b.f.max)}${delta(b.f.max,b0.max)}</td><td>${fmt(b.f.pitch)}/${fmt(b.f.yaw)}/${fmt(b.f.roll)}</td></tr>`).join('')}</table>${sh.blades.length<2?'<div class="f-vdu f-dim">nur Standard-Blade</div>':''}</div>`}
function kuehlRadar(r){const k=r.coolNeed,g=r.cool;return`<div class="lo-pan"><h4>Kühlung & Radar</h4><div class="f-vdu">Kühlung: <b class="${g<k?'f-bad':'f-good'}">${fmt(g)}</b> erzeugt (max ${fmt(r.coolMax)}) · Bedarf ~<b>${fmt(k)}</b> <span class="f-dim">(geschätzt, aus verteilten Pips)</span></div>
 ${alle().filter(n=>(I[clsOf(n)]||{}).t==='Cooler').map(n=>`<div class="f-vdu f-dim">${esc(sz(clsOf(n))+' '+I[clsOf(n)].n)}: ${fmt(V(n.path,clsOf(n)).cool*(wirk()[n.path]||0))} / ${fmt(V(n.path,clsOf(n)).cool)}</div>`).join('')}
 ${r.radar?`<div class="f-vdu" style="margin-top:6px">Radar ${esc(sz2(r.radar.s)+' '+r.radar.n)}: ${r.radar.on?`Zielhilfe <b>${fmt(r.radar.aim[0])}–${fmt(r.radar.aim[1])} m</b> · IR/EM/CS ${r.radar.sens.slice(0,3).map(x=>fmt(x*100)+'%').join('/')}`:'<b class="f-bad">aus</b>'}</div>`:''}
 <div class="f-vdu" style="margin-top:6px">Eigene Signatur: EM <b>${fmt(r.em)}</b> · IR <b>${fmt(r.ir)}</b> · Querschnitt CS <b>${fmt(r.cs)}</b> <span class="f-dim">(Panzerung eingerechnet, vereinfacht)</span></div></div>`}
function craftPan(){const A=alle(),ids=[...new Set(A.map(clsOf).filter(Boolean))];let own=0,miss=[],nc=0;for(const c of ids){const it=I[c];if(!it.bp)nc++;else if(hatBp(c))own++;else miss.push(it.n)}
 return`<div class="lo-pan"><h4>Crafting</h4><div class="f-vdu">Blueprints: <b class="f-good">${own} vorhanden</b> · <b class="f-bad">${miss.length} fehlen</b> · ${nc} nicht craftbar</div><div class="f-vdu f-dim" style="margin-top:4px">${miss.slice(0,8).map(esc).join(', ')}${miss.length>8?' …':''}</div><button class="f-btn" id="PLAN" style="margin-top:8px;width:100%">Als Crafting-Plan anlegen</button></div>`}
// Alle craftbaren Teile der Ausstattung als Crafting-Plan (Menge je Blueprint, Ziel-Q = eingestellte Qualität, sonst 500)
function alsPlan(){const as=typeof appStore==='function'?appStore():null;if(!as||!as.plans){toast('Nur im Programm möglich');return}
 const S=S_(),m={};for(const n of alle()){const c=clsOf(n),it=I[c];if(!it||!it.bp)continue;const q=S.q[n.path]!=null?S.q[n.path]:500;const k=it.bp+'|'+q;(m[k]=m[k]||{bp:it.bp,qty:0,minQ:q}).qty++}
 const items=Object.values(m).map(x=>({id:Math.random().toString(36).slice(2,13),bp:x.bp,qty:x.qty,minQ:x.minQ,built:0,pick:{}}));if(!items.length){toast('Keine craftbaren Teile in dieser Ausstattung');return}
 const name='Fitting '+(S.fleet&&S.fleet.name||D.ships[cur].name);as.plans.push({id:Math.random().toString(36).slice(2,13),name,items});if(typeof save==='function')save();toast('Crafting-Plan „'+name+'“ angelegt ('+items.length+' Blueprints)')}
function gridPan(){const g=D.ships[cur].grids||[];if(!g.length)return'';return`<div class="lo-pan" style="grid-column:1/-1"><h4>Cargo-Grid · ${g.reduce((a,x)=>a+x.x*x.y*x.z,0)} SCU</h4><div class="f-e2grids">${g.map((x,i)=>`<div class="f-e2gcard"><div class="f-vdu">${esc((x.port||'Grid '+(i+1)).replace(/^hardpoint_/i,''))} · ${x.x}×${x.y}×${x.z}
 <select data-door="${i}">${['vorne','rechts','hinten','links'].map((l,di)=>`<option value="${di}" ${((S_().doors||{})[i]??0)===di?'selected':''}>Tür ${l}</option>`).join('')}</select></div><canvas data-cv="${i}"></canvas></div>`).join('')}</div></div>`}
// ---------- Schiffsauswahl: Hersteller › Rolle › Schiff (Hersteller = erstes Wort des Namens, Rolle = Gruppe aus dem Feld „rolle“) ----------
function herst(id){const m=(D.ships[id].name||'').match(/^(\S+)/);return m?m[1]:'Sonstige'}
function rolleGr(id){const r=D.ships[id].rolle||'';return/Mining/i.test(r)?'Mining':/Freight|Cargo/i.test(r)?'Fracht':/Explor/i.test(r)?'Erkundung':/Corvette|Frigate|Carrier|Gunship/i.test(r)?'Großkampfschiffe':/Snub/i.test(r)?'Snub-Jäger':/Stealth/i.test(r)?'Stealth':'Jäger'}
function groesse(id){const z=D.ships[id].size||{},l=Math.max(z.x||0,z.y||0);return l<25?'Klein (bis 25 m)':l<60?'Mittel (25–60 m)':'Groß (ab 60 m)'}
function thumb(id){const b=RIof(id).base;const t=b.find(x=>/default__persp$/.test(x))||b.find(x=>/__persp$/.test(x));return t?RB+id.toLowerCase()+'/'+t+'.webp':''}
// Hangar-Auswahl: Karten mit Schiffsbild, Filter-Knöpfe (Hersteller / Rolle / Größe, mehrere wählbar), Suche, Sortierung – gemerkt im Browser
function schiffWahl(){
 const ids=Object.keys(D.ships),pop=document.createElement('div');pop.className='lo-pop';
 let F={m:[],r:[],g:[],q:'',o:'name'};try{Object.assign(F,JSON.parse(localStorage.getItem('plFitFilter')||'{}'))}catch(e){}
 const GR={m:herst,r:rolleGr,g:groesse},mein=new Set(((typeof appStore==='function'&&appStore()||{}).fleet||[]).map(f=>f.ship));
 const treffer=ex=>ids.filter(i=>['m','r','g'].every(k=>k===ex||!F[k].length||F[k].includes(GR[k](i)))&&(!F.q||(D.ships[i].name+' '+(D.ships[i].rolle||'')+' '+rolleGr(i)).toLowerCase().includes(F.q.toLowerCase())));
 const chips=(k,t)=>{const tr=treffer(k),all={};ids.forEach(i=>all[GR[k](i)]=0);tr.forEach(i=>all[GR[k](i)]++);
  const keys=Object.keys(all).sort((a,b)=>k==='g'?['Klein','Mittel','Groß'].findIndex(x=>a.startsWith(x))-['Klein','Mittel','Groß'].findIndex(x=>b.startsWith(x)):a.localeCompare(b));
  return`<div class="f-fz"><span>${t}</span>${keys.map(c=>`<button type="button" class="f-chip ${F[k].includes(c)?'f-on':''} ${all[c]?'':'f-leer'}" data-f="${k}" data-v="${esc(c)}">${esc(c)} <small>${all[c]}</small></button>`).join('')}</div>`};
 const draw=()=>{const t=treffer().sort((a,b)=>F.o==='gross'?Math.max(D.ships[a].size?.x||0,D.ships[a].size?.y||0)-Math.max(D.ships[b].size?.x||0,D.ships[b].size?.y||0):F.o==='herst'?herst(a).localeCompare(herst(b))||D.ships[a].name.localeCompare(D.ships[b].name):D.ships[a].name.localeCompare(D.ships[b].name));
  const keep=pop.querySelector('.f-box')?pop.querySelector('.f-box').scrollTop:0;
  pop.innerHTML=`<div class="f-box f-hangar"><h3>Hangar · Schiff wählen <small>${t.length} von ${ids.length}</small></h3>
   <div class="f-pkbar"><input id="PKQ" type="search" placeholder="Suchen: Name, Rolle …" value="${esc(F.q)}" autocomplete="off"><select id="PKO"><option value="name" ${F.o==='name'?'selected':''}>A–Z</option><option value="herst" ${F.o==='herst'?'selected':''}>nach Hersteller</option><option value="gross" ${F.o==='gross'?'selected':''}>nach Größe</option></select>
    <button type="button" id="PKR" ${F.m.length+F.r.length+F.g.length||F.q?'':'disabled'}>Filter zurücksetzen</button></div>
   <div class="f-filter">${chips('r','Rolle')}${chips('g','Größe')}${chips('m','Hersteller')}</div>
   <div class="f-regal">${t.map(i=>{const sh=D.ships[i],im=thumb(i);return`<button type="button" class="f-card ${i===cur?'f-on':''}" data-s="${i}"><span class="f-cimg">${im?`<img loading="lazy" src="${im}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('em'),{textContent:'Bild folgt'}))">`:`${platzSVG('persp')}<em>Bild folgt</em>`}</span>
     <b>${esc(sh.name)}</b><small>${esc(rolleGr(i))} · ${esc(sh.rolle||'')}</small><span class="f-ctags"><i>${esc(groesse(i).split(' ')[0])}</i><i>${sh.crew||1} Crew</i>${mein.has(i)?'<i class="f-mein">im Hangar</i>':''}</span></button>`}).join('')||'<div class="f-vdu f-dim">Kein Schiff passt zu den Filtern.</div>'}</div>
   <div class="f-foot"><button type="button" id="PKX">Schließen</button></div></div>`;
  const bx=pop.querySelector('.f-box');bx.scrollTop=keep;
  pop.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{const a=F[b.dataset.f],v=b.dataset.v,n=a.indexOf(v);n<0?a.push(v):a.splice(n,1);spar();draw()});
  pop.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>{cur=b.dataset.s;try{localStorage.setItem('plFitSchiff',cur)}catch(e){}pop.remove();render()});
  pop.querySelector('#PKR').onclick=()=>{F.m=[];F.r=[];F.g=[];F.q='';spar();draw()};
  pop.querySelector('#PKO').onchange=e=>{F.o=e.target.value;spar();draw()};
  pop.querySelector('#PKX').onclick=()=>pop.remove();
  const qi=pop.querySelector('#PKQ');qi.oninput=()=>{F.q=qi.value.trim();spar();draw();const n=pop.querySelector('#PKQ');n.focus();n.setSelectionRange(n.value.length,n.value.length)}};
 const spar=()=>{try{localStorage.setItem('plFitFilter',JSON.stringify(F))}catch(e){}};
 draw();pop.onclick=e=>{if(e.target===pop)pop.remove()};document.body.appendChild(pop)}
// ---------- Teile-Tabelle (wie die Teile-Suche bei Erkul): alle passenden Teile, sortierbar ----------
function teilTabelle(n){const S=S_(),ks=kand(n,n.eltern),c0=clsOf(n),t=((I[ks[0]]||I[c0]||{}).t)||'';
 const COL={WeaponGun:[['DPS',v=>v.dps],['Alpha',v=>v.alpha,1],['Kadenz/min',v=>v.rpm],['Reichw. m',v=>v.rng],['m/s',v=>v.spd]],Shield:[['Schild-HP',v=>v.shp],['Regen/s',v=>v.sreg],['Zusammenbruch s',v=>v.down,1]],Cooler:[['Kühlung',v=>v.cool]],
  QuantumDrive:[['Gm/s',v=>v.qspd,3],['Anlauf s',v=>v.qspool,1],['Verbrauch',v=>v.qfuel,2]],Radar:[['Ziel min m',v=>v.aimmin],['Ziel max m',v=>v.aimmax]],Missile:[['Schaden',v=>v.alpha],['Lock s',v=>v.lock,1],['Kegel °',v=>v.angle],['m/s',v=>v.spd]],PowerPlant:[['Pips',(v,it)=>it.pg]]}[t]||[];
 const rows=ks.map(k=>({k,it:I[k],v:I[k].v||{}}));
 const cols=[['Name',r=>r.it.n],['Größe',r=>r.it.s],['Kl.',r=>r.it.g||''],['Hersteller',r=>r.it.mk||''],...COL.map(([h,f,d])=>[h,r=>f(r.v,r.it),d||0]),['Strom',r=>r.it.pw,2],['Blueprint',r=>!r.it.bp?'–':hatBp(r.k)?'✓':'✗']];
 let sc=COL.length?4:0,dir=COL.length?-1:1;const pop=document.createElement('div');pop.className='lo-pop';
 const draw=()=>{const val=(r,i)=>{const x=cols[i][1](r);return x},srt=rows.slice().sort((a,b)=>{const x=val(a,sc),y=val(b,sc);return(typeof x==='number'&&typeof y==='number'?x-y:String(x??'').localeCompare(String(y??'')))*dir});
  const best=cols.map((c,i)=>i>=4&&c[2]!==undefined&&i<cols.length-1?Math.max(...rows.map(r=>+val(r,i)||0)):null);
  pop.innerHTML=`<div class="f-box f-hangar"><h3>Teile-Vergleich · ${esc(TNAME[t]||t)} · ${rows.length} passend</h3><div class="f-tabw"><table class="f-t f-tt"><tr>${cols.map((c,i)=>`<th data-c="${i}" class="${i===sc?'f-sorted':''}">${esc(c[0])}${i===sc?(dir>0?' ▲':' ▼'):''}</th>`).join('')}</tr>
   ${srt.map(r=>`<tr data-k="${esc(r.k)}" class="${r.k===c0?'f-cur':''}">${cols.map((c,i)=>{const x=c[1](r);const tx=typeof x==='number'?fmt(x,c[2]||0):esc(x);return`<td class="${typeof x==='number'?'f-num':''} ${best[i]&&+x===best[i]?'f-best':''}">${tx}</td>`}).join('')}</tr>`).join('')}</table></div>
   <div style="margin-top:6px;font-size:12px;opacity:.7">Zeile antippen = Teil einbauen · Spaltenkopf = sortieren · grün = bester Wert der Spalte</div><div class="f-foot"><button type="button" id="TTX">Schließen</button></div></div>`;
  pop.querySelectorAll('th').forEach(h=>h.onclick=()=>{const i=+h.dataset.c;if(i===sc)dir=-dir;else{sc=i;dir=i>=4?-1:1}draw()});
  pop.querySelectorAll('tr[data-k]').forEach(r=>r.onclick=()=>{S.sel[n.path]=r.dataset.k;S.q[n.path]=null;S.pips=null;pop.remove();render()});
  pop.querySelector('#TTX').onclick=()=>pop.remove()};
 draw();pop.onclick=e=>{if(e.target===pop)pop.remove()};document.body.appendChild(pop)}
// ---------- Teilen: Ausrüstung als Text-Code (kopieren / einfügen) ----------
function teilen(){const S=S_(),snap={ship:cur,sel:S.sel,q:S.q,mis:S.mis,pips:S.pips,paint:S.paint,blade:S.blade};
 const code='PLFIT1:'+btoa(unescape(encodeURIComponent(JSON.stringify(snap))));const pop=document.createElement('div');pop.className='lo-pop';
 pop.innerHTML=`<div class="f-box"><h3>Ausrüstung teilen / laden</h3><div class="f-vdu">Dein Code (${esc(D.ships[cur].name)}, Entwurf ${(SLOT[cur]||0)+1}):</div><textarea id="TCODE" readonly rows="3" style="width:100%;background:#0009;color:inherit;border:1px solid var(--frame);padding:6px">${code}</textarea>
  <div class="f-foot" style="text-align:left"><button type="button" id="TCOPY">Kopieren</button></div>
  <div class="f-vdu" style="margin-top:10px">Code von jemand anderem einfügen (ersetzt den aktuellen Entwurf):</div><textarea id="TIN" rows="3" placeholder="PLFIT1:…" style="width:100%;background:#0009;color:inherit;border:1px solid var(--frame);padding:6px"></textarea>
  <div id="TMSG" class="f-vdu f-bad"></div><div class="f-foot"><button type="button" id="TLOAD">Laden</button> <button type="button" id="TX">Schließen</button></div></div>`;
 pop.querySelector('#TCOPY').onclick=()=>{const t=pop.querySelector('#TCODE');t.select();try{navigator.clipboard.writeText(code)}catch(e){document.execCommand('copy')}toast('Code kopiert')};
 pop.querySelector('#TLOAD').onclick=()=>{try{let c=pop.querySelector('#TIN').value.trim();if(!c.startsWith('PLFIT1:'))throw 0;const o=JSON.parse(decodeURIComponent(escape(atob(c.slice(7)))));if(!D.ships[o.ship])throw 1;
   cur=o.ship;const sh=D.ships[cur],n=neu(cur);n.sel=o.sel||{};n.q=o.q||{};n.mis=o.mis||{};n.pips=o.pips||null;if(sh.paints.some(x=>x.id===o.paint))n.paint=o.paint;if(sh.blades.some(x=>x.id===o.blade))n.blade=o.blade;ST[sk_()]=n;
   try{localStorage.setItem('plFitSchiff',cur)}catch(e){}pop.remove();render();toast('Ausrüstung geladen')}catch(e){pop.querySelector('#TMSG').textContent=e===1?'Dieses Schiff gibt es hier nicht.':'Das ist kein gültiger Code.'}};
 pop.querySelector('#TX').onclick=()=>pop.remove();pop.onclick=e=>{if(e.target===pop)pop.remove()};document.body.appendChild(pop)}
// ---------- Turret-Fenster ----------
function turretPop(n){const S=S_();const pop=document.createElement('div');pop.className='lo-pop';
 const draw=()=>{const gs=guns(n),rs=racks(n),slots=alle().filter(x=>x.path.startsWith(n.path+'/')&&x.edit!==false&&['WeaponGun','Turret','MissileLauncher','Missile'].includes(((x.types||[])[0]||[])[0]));
  pop.innerHTML=`<div class="f-box"><h3>${esc((I[clsOf(n)]||{}).n)} · Ausrüstung</h3>${slots.map((x,i)=>{const ks=kand(x,x.eltern),c=clsOf(x),ty=((x.types||[])[0]||[])[0],nr=slots.filter((y,j)=>j<=i&&((y.types||[])[0]||[])[0]===ty).length;return`<div class="f-row"><span>${({WeaponGun:'Waffe',MissileLauncher:'Raketen-Rack',Missile:'Rakete',Turret:'Halterung'})[ty]||'Platz'} ${nr} · S${x.min}${x.max!==x.min?'–'+x.max:''}</span><select data-tsel="${esc(x.path)}"><option value="">– leer –</option>${ks.map(k=>`<option value="${k}" ${k===c?'selected':''}>${esc(sz(k)+' '+I[k].n)}${I[k].v.dps?' · DPS '+fmt(I[k].v.dps):''}</option>`).join('')}</select></div>`}).join('')}
  <div class="f-row"><span>Alle Waffen gleich</span><select id="TALL"><option value="">–</option>${gs.length?kand(gs[0],gs[0].eltern).map(k=>`<option value="${k}">${esc(sz(k)+' '+I[k].n)}</option>`).join(''):''}</select></div>
  <div class="f-foot"><button id="TX">Fertig</button></div></div>`;
  pop.querySelectorAll('[data-tsel]').forEach(s=>s.onchange=()=>{S.sel[s.dataset.tsel]=s.value||null;S.pips=null;draw()});
  pop.querySelector('#TALL').onchange=e=>{if(!e.target.value)return;guns(n).forEach(g=>S.sel[g.path]=e.target.value);draw()};
  pop.querySelector('#TX').onclick=()=>{pop.remove();render()}};
 draw();pop.onclick=e=>{if(e.target===pop){pop.remove();render()}};document.body.appendChild(pop)}
// ---------- Bedienung ----------
function bind(BX0,b){const BX=ORD.length===BX0.length?ORD:BX0,S=S_(),q=x=>fit.querySelectorAll(x),idx=BX.indexOf(b);
 fit.querySelector('#SHIP').onclick=schiffWahl;
 q('.f-bcol .f-slot').forEach(x=>x.onclick=()=>{const bb=BX.find(y=>punkt(y)===x.dataset.slot);S.cur=x.dataset.slot;if(bb&&bb.kind==='turret'){render();turretPop(bb.n);return}render()});
 q('[data-sel]').forEach(x=>x.onchange=()=>{S.sel[x.dataset.sel]=x.value||null;S.q[x.dataset.sel]=null;S.pips=null;render()});
 q('[data-mis]').forEach(x=>x.onchange=()=>{const p=x.dataset.mis;S.mis[p]=x.value;Object.keys(S.sel).forEach(k=>{if(k.startsWith(p+'/'))delete S.sel[k]});const n=alle().find(y=>y.path===p);
  kids(n).forEach(k=>{if(['Missile','Bomb'].includes((k.types[0]||[])[0]))S.sel[k.path]=x.value});render()});
 q('[data-qc]').forEach(x=>x.onchange=()=>{S.q[x.dataset.qc]=x.checked?500:null;render()});q('[data-qr]').forEach(x=>x.onchange=()=>{S.q[x.dataset.qr]=+x.value;render()});
 q('[data-mod]').forEach(x=>x.onchange=()=>{S.mod[+x.dataset.mod]=x.value||null;render()});q('[data-gad]').forEach(x=>x.onchange=()=>{S.gad=x.value||null;render()});
 q('[data-it]').forEach(x=>x.onclick=()=>{const sel=fit.querySelector('#DET select[data-sel]:last-of-type')||fit.querySelector('#DET select');if(!sel||sel.disabled)return;const o=[...sel.options].filter(o=>o.value);const i=o.findIndex(o=>o.selected);const nx=o[(i+(+x.dataset.it)+o.length)%o.length];sel.value=nx.value;sel.dispatchEvent(new Event('change'))});
 q('[data-hp]').forEach(x=>x.onclick=()=>{S.cur=punkt(BX[(idx+(+x.dataset.hp)+BX.length)%BX.length]);render()});
 q('.f-pips i').forEach(x=>x.onclick=()=>{const P=pips(),c=x.dataset.c,n=+x.dataset.n;P[c]=P[c]===n?n-1:n;render()});
 fit.querySelector('#PDEF').onclick=()=>{S.pips=pipsDef();render()};fit.querySelector('#P0').onclick=()=>{const P=pips();for(const k in P)P[k]=0;render()};
 q('[data-p]').forEach(x=>x.onclick=()=>{S.paint=x.dataset.p;render()});q('[data-b]').forEach(x=>x.onclick=()=>{S.blade=x.dataset.b;render()});
 const tb=fit.querySelector('#TOPEN');if(tb)tb.onclick=()=>turretPop(b.n);
 q('[data-door]').forEach(x=>x.onchange=()=>{S.doors=S.doors||{};S.doors[x.dataset.door]=+x.value;render()});
 q('canvas[data-cv]').forEach(cv=>{try{drawIso(cv,(D.ships[cur].grids||[])[+cv.dataset.cv],[],{door:(S.doors||{})[cv.dataset.cv]??0})}catch(e){}});
 fit.querySelector('#SAVE').onclick=()=>speichern();fit.querySelector('#TEILEN').onclick=teilen;q('[data-slot]').forEach(x=>x.onclick=()=>{SLOT[cur]=+x.dataset.slot;render()});q('[data-cmp]').forEach(x=>x.onclick=()=>{const n=alle().find(y=>y.path===x.dataset.cmp);if(n)teilTabelle(n)});const pb=fit.querySelector('#PLAN');if(pb)pb.onclick=alsPlan;fit.querySelector('#RESET').onclick=()=>{const f=S.fleet;ST[sk_()]=neu(cur);ST[sk_()].fleet=f;render()};
 fit.querySelector('#GO').onclick=()=>speichern();
 fit.querySelectorAll('#ART img.f-b').forEach(im=>{im.addEventListener('error',()=>{platzTausch(im);requestAnimationFrame(linien)});if(im.complete&&!im.naturalWidth&&im.src)platzTausch(im)})
 fit.querySelectorAll('#ART img').forEach(im=>im.addEventListener('load',()=>requestAnimationFrame(linien)))}
// Meine Schiffe: Fitting am Flotten-Eintrag speichern
function speichern(){const S=S_();const snap=JSON.parse(JSON.stringify({sel:S.sel,q:S.q,mis:S.mis,pips:S.pips,paint:S.paint,blade:S.blade,mod:S.mod,gad:S.gad,doors:S.doors}));
 const AS=appStore();if(!AS||!AS.fleet){toast('Gespeichert (nur Skizze)');return}
 let f=S.fleet&&AS.fleet.find(x=>x.id===S.fleet.id);if(!f){f={id:Math.random().toString(36).slice(2,13),ship:cur,name:'',doors:{}};AS.fleet.push(f)}
 f.fit=snap;f.doors=snap.doors||f.doors;S.fleet={id:f.id,name:f.name};if(typeof save==='function')save();toast('Unter „Meine Schiffe“ gespeichert');render()}
function oeffnen(fid){const AS=appStore();const f=AS.fleet.find(x=>x.id===fid);if(!f||!D.ships[f.ship]){toast('Für dieses Schiff gibt es das Fitting noch nicht (bisher: Gladius, Golem, Polaris)');return false}
 cur=f.ship;SLOT[cur]=0;ST[cur]=Object.assign(neu(cur),f.fit||{},{fleet:{id:f.id,name:f.name}});return true}
function toast(t){const o=document.getElementById('toast');if(o){o.textContent=t;o.classList.add('on');setTimeout(()=>o.classList.remove('on'),2600)}}

new ResizeObserver(() => { const s = fit.clientWidth < 1180; if (s !== fit.classList.contains('schmal')) { fit.classList.toggle('schmal', s); if (fit.classList.contains('on')) render(); } else requestAnimationFrame(linien); }).observe(fit);
new MutationObserver(() => { if (fit.classList.contains('on')) render(); }).observe(document.body, { attributes: true, attributeFilter: ['data-t'] });
const scr = document.getElementById('scr'); if (scr) scr.addEventListener('scroll', () => requestAnimationFrame(linien), { passive: true });
return { render, oeffnen };
}
window.FIT = {
  show() {
    if (impl) { fit.classList.toggle('schmal', fit.clientWidth < 1180); impl.render(); return; }
    fit.innerHTML = '<div class="empty">Fitting lädt …</div>';
    lade().then(() => { if (typeof current !== 'undefined' && current === 'fit') window.FIT.show(); }).catch(e => { fit.innerHTML = '<div class="empty">Fitting-Daten fehlen: ' + e + '</div>'; });
  },
  open(fid) { lade().then(() => { if (impl.oeffnen(fid)) switchTab('fit'); }); }
};
// „Meine Schiffe“: je Schiff ein Knopf „Fitting“, Cargo-Grid-Einstellung steht jetzt im Fitting
const shipsAlt = window.renderShips;
if (typeof shipsAlt === 'function') window.renderShips = function () {
  shipsAlt.apply(this, arguments);
  document.querySelectorAll('#ships [data-fa="ren"]').forEach(b => {
    const x = document.createElement('button'); x.className = 'k sm pri'; x.textContent = 'Fitting'; x.onclick = () => window.FIT.open(b.dataset.f);
    b.parentNode.insertBefore(x, b);
  });
  document.querySelectorAll('#ships .e2grids').forEach(g => {
    const n = g.querySelectorAll('.e2gcard').length; if (!n) return;
    const scu = [...g.querySelectorAll('.e2gh')].reduce((a, h) => { const m = h.textContent.match(/= (\d+) SCU/); return a + (m ? +m[1] : 0); }, 0);
    const d = document.createElement('div'); d.className = 'hint'; d.textContent = 'Cargo-Grid: ' + n + ' Bereich' + (n > 1 ? 'e' : '') + ' · ' + scu + ' SCU – Türseiten und Ansicht im Fitting einstellen';
    g.replaceWith(d);
  });
};
})();
