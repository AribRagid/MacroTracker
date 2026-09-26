'use strict';
const KEY='macro-tracker-v1';
const $=id=>document.getElementById(id);
const fmt=n=>new Intl.NumberFormat(undefined,{maximumFractionDigits:1}).format(n);
const dateKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function trackingDay(d=new Date()){const x=new Date(d);if(x.getHours()<3)x.setDate(x.getDate()-1);return dateKey(x)}
function dayDate(key){const [y,m,d]=key.split('-').map(Number);return new Date(y,m-1,d,12)}
function moveDay(key,delta){const d=dayDate(key);d.setDate(d.getDate()+delta);return dateKey(d)}
function validDay(key){return typeof key==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(key)&&dateKey(dayDate(key))===key}
function validAmount(n){return typeof n==='number'&&Number.isFinite(n)&&n>=.1&&n<=100000&&Math.abs(n*10-Math.round(n*10))<.00001}
function validate(data){
 if(!data||data.version!==1||!Array.isArray(data.entries)||data.entries.length>100000||!data.goals||!['light','dark'].includes(data.theme))throw Error('This is not a valid Macro backup.');
 for(const type of ['calories','protein'])if(data.goals[type]!==null&&!validAmount(data.goals[type]))throw Error('Invalid goals in backup.');
 const ids=new Set();const entries=data.entries.map(e=>{if(!e||typeof e.id!=='string'||e.id.length>100||ids.has(e.id)||!['calories','protein'].includes(e.type)||!validAmount(e.amount)||!validDay(e.day)||typeof e.at!=='string'||!Number.isFinite(Date.parse(e.at)))throw Error('Invalid or duplicate entries in backup.');ids.add(e.id);return {id:e.id,type:e.type,amount:e.amount,day:e.day,at:e.at}});
 return {version:1,theme:data.theme,goals:{calories:data.goals.calories,protein:data.goals.protein},entries};
}
let state={version:1,theme:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light',goals:{calories:null,protein:null},entries:[]};
let loadError=false;try{const raw=localStorage.getItem(KEY);if(raw)state=validate(JSON.parse(raw))}catch(e){loadError=true}
let today=trackingDay(),selected=today,weekStart=startOfWeek(today),page='today',logPage=0,pendingConfirm=null,toastTimer;
function startOfWeek(key){const d=dayDate(key);return moveDay(key,-((d.getDay()+6)%7))}
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500)}
function commit(next){try{localStorage.setItem(KEY,JSON.stringify(next));state=next;render();return true}catch(e){toast('Could not save. Download a backup and check browser storage.');return false}}
function totals(day){return state.entries.filter(e=>e.day===day).reduce((s,e)=>(s[e.type]+=e.amount,s),{calories:0,protein:0})}
function showPage(next){page=next;logPage=0;for(const p of ['today','history','settings'])$(p).hidden=p!==next;$('history-nav').classList.toggle('active',next==='history');$('settings-nav').classList.toggle('active',next==='settings');if(next==='history'){selected=trackingDay();weekStart=startOfWeek(selected)}render();window.scrollTo(0,0)}
function render(){
 document.body.classList.toggle('light',state.theme==='light');document.querySelector('meta[name="theme-color"]').content=state.theme==='light'?'#f6f8f2':'#121512';
 $('light-mode').setAttribute('aria-pressed',state.theme==='light');$('dark-mode').setAttribute('aria-pressed',state.theme==='dark');
 const sums=totals(today);const count=state.entries.filter(e=>e.day===today).length;$('entry-count').textContent=`${count} ${count===1?'entry':'entries'}`;
 $('today-totals').innerHTML=['calories','protein'].map(type=>{const n=sums[type],goal=state.goals[type],diff=goal===null?null:Math.round((goal-n)*10)/10;const remaining=diff===null?'Set a daily goal in Settings':diff>0?`<strong>${fmt(diff)} ${type==='calories'?'kcal':'g'}</strong> to your goal`:diff===0?'Daily goal reached':`<strong>${fmt(-diff)} ${type==='calories'?'kcal':'g'}</strong> over your goal`;return `<div class="${type}"><div class="remaining">${remaining}</div><div class="total">${fmt(n)} <small>${type==='calories'?'kcal':'g'}</small></div><div class="track"><span style="width:${goal?Math.min(100,n/goal*100):0}%"></span></div><div class="total-label">${type==='calories'?'Calories':'Protein'}${goal?' / '+fmt(goal):''}</div></div>`}).join('');
 if(document.activeElement!==$('calorie-goal'))$('calorie-goal').value=state.goals.calories??'';if(document.activeElement!==$('protein-goal'))$('protein-goal').value=state.goals.protein??'';
 renderHistory();
}
function renderHistory(){
 const pageSize=2;
 const end=moveDay(weekStart,6);const a=dayDate(weekStart),b=dayDate(end);$('month-label').textContent=a.getMonth()===b.getMonth()?a.toLocaleDateString(undefined,{month:'long',year:'numeric'}):`${a.toLocaleDateString(undefined,{month:'short'})} – ${b.toLocaleDateString(undefined,{month:'short',year:'numeric'})}`;
 $('next-week').disabled=end>=today;$('week').replaceChildren();
 for(let i=0;i<7;i++){const day=moveDay(weekStart,i),d=dayDate(day),btn=document.createElement('button');btn.className='day'+(day===selected?' selected':'')+(state.entries.some(e=>e.day===day)?' has-log':'');btn.innerHTML=`<span>${d.toLocaleDateString(undefined,{weekday:'short'}).slice(0,2)}</span>${d.getDate()}`;btn.disabled=day>today;btn.setAttribute('aria-label',d.toLocaleDateString(undefined,{dateStyle:'full'}));btn.setAttribute('aria-pressed',day===selected);btn.onclick=()=>{selected=day;logPage=0;renderHistory()};$('week').append(btn)}
 $('selected-label').textContent=selected===today?'Today':dayDate(selected).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
 const entries=state.entries.filter(e=>e.day===selected).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));$('logs').replaceChildren();
 if(!entries.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='Nothing logged yet.\nAdd an entry whenever you’re ready.';$('logs').append(empty)}
 const pages=Math.max(1,Math.ceil(entries.length/pageSize));logPage=Math.min(logPage,pages-1);$('log-pagination').hidden=pages===1;$('prev-logs').disabled=logPage===0;$('next-logs').disabled=logPage===pages-1;$('log-page-count').textContent=`${logPage+1} / ${pages}`;
 for(const e of entries.slice(logPage*pageSize,(logPage+1)*pageSize)){const row=document.createElement('div');row.className='log';const time=new Date(e.at);const late=dateKey(time)!==e.day;row.innerHTML=`<span class="metric-mark ${e.type==='calories'?'calorie':'protein'}-mark">${e.type==='calories'?'↗':'◈'}</span><div class="log-info"><strong>${fmt(e.amount)} ${e.type==='calories'?'kcal':'g protein'}</strong><small>${time.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}${late?' · '+time.toLocaleDateString(undefined,{month:'short',day:'numeric'}):''}</small></div><button class="delete" aria-label="Remove ${fmt(e.amount)} ${e.type} entry"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7"/></svg></button>`;row.querySelector('button').onclick=()=>confirmAction('Remove this entry?',`Remove ${fmt(e.amount)} ${e.type==='calories'?'kcal':'g protein'}? This will also update the totals for this day.`,'Remove',()=>{if(commit({...state,entries:state.entries.filter(x=>x.id!==e.id)}))toast('Entry removed')});$('logs').append(row)}
 const sum=totals(selected);$('history-totals').innerHTML=`<div><span>Calorie total</span><strong>${fmt(sum.calories)} kcal</strong></div><div><span>Protein total</span><strong>${fmt(sum.protein)} g</strong></div>`;
}
function addEntry(type,amount,day=trackingDay(),at=new Date().toISOString()){
 if(!['calories','protein'].includes(type)||!validAmount(amount)||!validDay(day)||day>trackingDay()||!Number.isFinite(Date.parse(at)))throw Error('Enter an amount from 0.1 to 100,000, with at most one decimal place.');
 const e={id:crypto.randomUUID(),type,amount,day,at};if(!commit({...state,entries:[...state.entries,e]}))throw Error('Entry could not be saved.');return e;
}
function confirmAction(title,message,label,action){$('confirm-title').textContent=title;$('confirm-message').textContent=message;$('confirm-ok').textContent=label;pendingConfirm=action;$('confirm-dialog').showModal()}
$('confirm-cancel').onclick=()=>{$('confirm-dialog').close();pendingConfirm=null};$('confirm-ok').onclick=()=>{const fn=pendingConfirm;pendingConfirm=null;$('confirm-dialog').close();fn?.()};$('confirm-dialog').addEventListener('cancel',()=>pendingConfirm=null);
$('home-nav').onclick=()=>showPage('today');$('history-nav').onclick=()=>showPage('history');$('settings-nav').onclick=()=>showPage('settings');
for(const type of ['calories','protein'])$(`${type}-form`).onsubmit=e=>{e.preventDefault();try{refreshDay();addEntry(type,Number($(`${type}-input`).value));$(`${type}-input`).value='';$(`${type}-input`).blur();toast(type==='calories'?'Calories added':'Protein added')}catch(err){toast(err.message)}};
$('goals-form').onsubmit=e=>{e.preventDefault();const goals={calories:Number($('calorie-goal').value),protein:Number($('protein-goal').value)};if(!Object.values(goals).every(validAmount))return toast('Enter valid daily goals.');if(commit({...state,goals})){document.activeElement.blur();toast('Daily goals saved')}};
for(const theme of ['light','dark'])$(`${theme}-mode`).onclick=()=>commit({...state,theme});
$('prev-logs').onclick=()=>{logPage=Math.max(0,logPage-1);renderHistory()};$('next-logs').onclick=()=>{logPage++;renderHistory()};
function shiftWeek(delta){logPage=0;const next=moveDay(weekStart,delta*7);if(next>today)return;weekStart=next;selected=next===startOfWeek(today)?today:moveDay(selected,delta*7);renderHistory()}
$('prev-week').onclick=()=>shiftWeek(-1);$('next-week').onclick=()=>shiftWeek(1);$('jump-today').onclick=()=>{logPage=0;selected=today;weekStart=startOfWeek(today);renderHistory()};
let touchX,touchY;$('week').addEventListener('touchstart',e=>{touchX=e.changedTouches[0].clientX;touchY=e.changedTouches[0].clientY},{passive:true});$('week').addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-touchX,dy=e.changedTouches[0].clientY-touchY;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy))shiftWeek(dx<0?1:-1)},{passive:true});
let entryDay;
$('add-history').onclick=()=>{entryDay=selected;$('past-date').textContent=dayDate(entryDay).toLocaleDateString(undefined,{dateStyle:'full'});$('past-value').value='';const now=new Date();$('past-time').value=entryDay===trackingDay()?`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`:'12:00';$('entry-dialog').showModal()};
document.querySelectorAll('[data-close]').forEach(btn=>btn.onclick=()=>$(btn.dataset.close).close());
$('past-form').onsubmit=e=>{e.preventDefault();try{const [h,m]=$('past-time').value.split(':').map(Number);if(!Number.isInteger(h)||!Number.isInteger(m))throw Error('Choose a time.');const at=dayDate(entryDay);if(h<3)at.setDate(at.getDate()+1);at.setHours(h,m,0,0);if(at.getTime()>Date.now())throw Error('Choose a time that has already passed.');addEntry($('past-type').value,Number($('past-value').value),entryDay,at.toISOString());$('entry-dialog').close();toast('Entry added')}catch(err){toast(err.message)}};
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`macro-backup-${dateKey(new Date())}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('Backup ready to download')};
$('import').onclick=()=>$('import-file').click();$('import-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>25000000)throw Error('This file is too large. Choose a Macro JSON backup.');const next=validate(JSON.parse(await file.text()));confirmAction('Import this backup?',`Replace your current ${state.entries.length} entries with ${next.entries.length} backed-up entries? Your goals and appearance will also be restored. Download your current data first if you want to keep it.`,'Import',()=>{if(commit(next))toast('Backup imported')})}catch(err){toast(err instanceof SyntaxError?'Could not read this file. Choose a Macro JSON backup.':err.message)}finally{e.target.value=''}};
function refreshDay(){const next=trackingDay();if(next!==today){const old=today;today=next;if(selected===old){selected=next;weekStart=startOfWeek(next)}render()}}
setInterval(refreshDay,15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshDay()});window.addEventListener('focus',refreshDay);window.addEventListener('storage',e=>{if(e.key===KEY&&e.newValue){try{state=validate(JSON.parse(e.newValue));render()}catch{toast('Could not read data from another tab.')}}});
render();if(loadError)toast('Saved data could not be read. Import a backup to restore it.');
if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'read_daily_totals',title:'Read daily totals',description:'Read calorie and protein totals for a tracking day. Each day begins at 3 a.m. local time.',inputSchema:{type:'object',properties:{day:{type:'string',description:'Tracking date in YYYY-MM-DD format; defaults to today.'}},additionalProperties:false},annotations:{readOnlyHint:true},execute(input){const day=input?.day??trackingDay();if(!validDay(day))throw Error('Invalid day');return {day,...totals(day),goals:state.goals}}})).catch(()=>{})}catch{}}

