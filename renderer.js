const iconSvg={
gmail:`<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="#4285F4" d="M10 18h9v30h-9z"/><path fill="#34A853" d="M45 18h9v30h-9z"/><path fill="#EA4335" d="M10 18l22 17 22-17v10L32 45 10 28z"/><path fill="#FBBC04" d="M45 18l9-6v36h-9z"/><path fill="#34A853" d="M10 48h9V28l-9-7z"/></svg>`,
outlook:`<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="16" width="30" height="32" rx="3" fill="#0A5EA8"/><rect x="26" y="12" width="30" height="40" rx="4" fill="#0078D4"/><path fill="#50C8FF" d="M28 20h24v9H28zM28 32h24v9H28z"/><rect x="6" y="22" width="28" height="26" rx="3" fill="#0F6CBD"/><text x="20" y="41" font-size="22" text-anchor="middle" font-family="Arial" font-weight="700" fill="#fff">O</text></svg>`,
yahoo:`<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="8" width="48" height="48" rx="12" fill="#2b0d58"/><text x="32" y="42" font-size="29" text-anchor="middle" font-family="Arial" font-weight="900" fill="#a855f7">y!</text></svg>`,
exchange:`<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="8" width="48" height="48" rx="12" fill="#2b1620"/><path fill="#ff6a00" d="M18 19l18-8 14 7v29l-14 6-18-8z"/><path fill="#e43d18" d="M26 22l10-5v30l-10-4z"/><path fill="#ff8a00" d="M36 17l10 4v23l-10 3z"/></svg>`,
other:`<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="14" width="48" height="36" rx="5" fill="#0b1430" stroke="#fff" stroke-width="4"/><path d="M10 18l22 17 22-17" fill="none" stroke="#21f3d0" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 48l17-14M54 48L37 34" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`,
app:`<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#ff4f62"/><stop offset=".45" stop-color="#ff4fd8"/><stop offset=".75" stop-color="#19a7ff"/><stop offset="1" stop-color="#21f3d0"/></linearGradient></defs><rect x="6" y="6" width="52" height="52" rx="14" fill="url(#g)"/><rect x="13" y="18" width="38" height="28" rx="5" fill="#fff"/><path fill="#ff4f62" d="M13 18l19 15 19-15v8L32 42 13 26z"/><path fill="#21f3d0" d="M13 46l13-10 6 5 6-5 13 10z"/></svg>`
};
const providers={
  gmail:{label:"Google",name:"Gmail",url:"https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fmyaccount.google.com%2F&hl=en",icon:"gmail"},
  outlook:{label:"Outlook",name:"Outlook",url:"https://outlook.live.com/mail/0/",icon:"outlook"},
  yahoo:{label:"Yahoo",name:"Yahoo",url:"https://login.yahoo.com/",icon:"yahoo"},
  exchange:{label:"Exchange",name:"Exchange",url:"https://login.microsoftonline.com/",icon:"exchange"},
  other:{label:"Other Mail",name:"Other Mail",url:"https://accounts.google.com/ServiceLogin?service=mail",icon:"other"}
};
let containers=JSON.parse(localStorage.getItem("containers")||"[]");
let openTabs=JSON.parse(localStorage.getItem("openTabs")||"[]");
let active=null,selectMode=false,selected=new Set(),smsNumber="",smsText="",menuTarget=null,renameTarget=null;
const loadedTabs=new Set(JSON.parse(localStorage.getItem("loadedTabs")||"[]"));
const $=id=>document.getElementById(id);
let saveTimer=null;
function saveSoon(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{localStorage.setItem("containers",JSON.stringify(containers));localStorage.setItem("openTabs",JSON.stringify(openTabs));localStorage.setItem("loadedTabs",JSON.stringify([...loadedTabs]));},80)}
function saveNow(){localStorage.setItem("containers",JSON.stringify(containers));localStorage.setItem("openTabs",JSON.stringify(openTabs));localStorage.setItem("loadedTabs",JSON.stringify([...loadedTabs]))}
function esc(s){return String(s||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function providerIcon(kind){return iconSvg[kind]||iconSvg.other}
function makePartition(provider,id){
  const rand = Math.random().toString(36).slice(2,10);
  return `persist:mpm_${provider}_${Date.now()}_${rand}`;
}
function providerName(c){return c.customName||c.name||providers[c.provider]?.name||providers[c.provider]?.label||"Mail"}
function migrateData(){let changed=false;/* GMAIL_MYACCOUNT_FIXED_V34 */containers.forEach(c=>{if(c.provider==="gmail" && c.url!=="https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fmyaccount.google.com%2F&hl=en"){c.url="https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fmyaccount.google.com%2F&hl=en";changed=true;}});/* OUTLOOK_DIRECT_V25 */containers.forEach(c=>{if(c.provider==="outlook" && c.url!=="https://outlook.live.com/mail/0/"){c.url="https://outlook.live.com/mail/0/";changed=true;}});/* OUTLOOK_DIRECT_V23 */containers.forEach(c=>{if(c.provider==="outlook" && c.url!=="https://outlook.live.com/mail/0/"){c.url="https://outlook.live.com/mail/0/";changed=true;}});/* OUTLOOK_DIRECT_V22 */containers.forEach(c=>{if(c.provider==="outlook" && c.url!=="https://outlook.live.com/mail/0/"){c.url="https://outlook.live.com/mail/0/";changed=true;}});/* OUTLOOK_DIRECT_V11 */containers.forEach(c=>{if(c.provider==="outlook" && c.url!=="https://outlook.live.com/mail/0/"){c.url="https://outlook.live.com/mail/0/";changed=true;}});containers.forEach(c=>{if(!c.customName){const label=providers[c.provider]?.label||"Mail";if(new RegExp(`^${label}\\s+\\d+$`,"i").test(c.name||"")||/^Gmail\s+\d+$/i.test(c.name||""))c.customName=providers[c.provider]?.name||label;else c.customName=c.name||providers[c.provider]?.name||label;changed=true}});if(changed)saveSoon()}
function serialNumberOf(c){
  const i=containers.findIndex(x=>x.id===c.id);
  return i<0?1:(containers.length-i);
}
function serialOf(c){return `${providers[c.provider]?.label||"Mail"} ${serialNumberOf(c)}`}
function updateDeleteBar(){const bar=$("deleteBar");if(!bar)return;if(selectMode){bar.classList.remove("hidden");$("deleteCount").textContent=`${selected.size} selected`}else bar.classList.add("hidden")}
function render(){migrateData();const q=$("searchBox").value.toLowerCase(),box=$("cards"),frag=document.createDocumentFragment();box.innerHTML="";for(const c of containers){if(!(serialOf(c).toLowerCase().includes(q)||(providerName(c)).toLowerCase().includes(q)||c.provider.toLowerCase().includes(q)))continue;const kind=providers[c.provider]?.icon||"other";const card=document.createElement("div");card.className="card"+(selected.has(c.id)?" selected":"");card.draggable=true;card.dataset.id=c.id;card.innerHTML=`<div class="mail-icon">${providerIcon(kind)}</div><div class="serial-title">${esc(serialOf(c))}</div><div class="custom-name">${esc(providerName(c))}</div>`;card.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();hideCardMenu();if(selectMode){selected.has(c.id)?selected.delete(c.id):selected.add(c.id);updateDeleteBar();render();return}openContainer(c.id)});card.addEventListener("dblclick",e=>{e.preventDefault();e.stopPropagation();openRenameModal(c.id)});card.addEventListener("contextmenu",e=>{e.preventDefault();e.stopPropagation();showCardMenu(e.clientX,e.clientY,c.id)});card.addEventListener("dragstart",e=>e.dataTransfer.setData("text/plain",c.id));card.addEventListener("dragover",e=>e.preventDefault());card.addEventListener("drop",e=>{e.preventDefault();e.stopPropagation();reorder(e.dataTransfer.getData("text/plain"),c.id)});frag.appendChild(card)}box.appendChild(frag);updateDeleteBar();renderTabs()}
function showCardMenu(x,y,id){menuTarget=id;const m=$("cardMenu"),sidebar=$("sidebar").getBoundingClientRect(),menuW=150,menuH=150;const safeX=Math.max(sidebar.left+8,Math.min(x,sidebar.right-menuW-8));const safeY=Math.max(sidebar.top+8,Math.min(y,window.innerHeight-menuH-8));m.style.left=safeX+"px";m.style.top=safeY+"px";m.classList.remove("hidden")}
function hideCardMenu(){const m=$("cardMenu");if(m)m.classList.add("hidden");menuTarget=null}
document.addEventListener("click",e=>{if(!$("cardMenu")?.contains(e.target))hideCardMenu()});
function renderTabs(){const row=$("tabRow");if(!row)return;row.innerHTML="";openTabs=openTabs.filter(id=>containers.some(c=>c.id===id));const frag=document.createDocumentFragment();for(const id of openTabs){const c=containers.find(x=>x.id===id);if(!c)continue;const tab=document.createElement("div");tab.className="tab"+(active&&active.id===id?" active":"");tab.innerHTML=`<span>${esc(serialOf(c))} <small>${esc(providerName(c))}</small></span><button title="Close">×</button>`;tab.onclick=e=>{if(e.target.tagName==="BUTTON"){e.stopPropagation();closeTab(id)}else openContainer(id,true)};frag.appendChild(tab)}row.appendChild(frag);saveSoon()}

function updateManualIndicator(data={}){
  const btn=$("manualModeBtn");
  if(!btn) return;
  const isOutlook=!!(active && (active.provider==="outlook" || active.provider==="exchange"));
  if(data && typeof data.outlookManualMode==="boolean") outlookManualMode=data.outlookManualMode;
  if(data && typeof data.outlookInbox==="boolean") outlookInboxReady=data.outlookInbox;

  const show=isOutlook && (outlookInboxReady || outlookManualMode);
  btn.classList.toggle("hidden", !show);
  btn.classList.toggle("manual-on", !!outlookManualMode);
  btn.classList.toggle("manual-off", !outlookManualMode);
  btn.title = outlookManualMode
    ? "Manual mode active. Double-click to return normal inbox mode."
    : "Microsoft account manual mode off. Double-click to open settings.";
}
async function toggleManualMode(){
  if(!active || !(active.provider==="outlook" || active.provider==="exchange")) return;
  const next=!outlookManualMode;
  const res=await window.mpm.outlookManualMode(active,next);
  if(res && res.ok){
    outlookManualMode=!!res.manualMode;
    if(outlookManualMode) outlookInboxReady=true;
    updateManualIndicator({outlookManualMode:outlookManualMode,outlookInbox:outlookInboxReady});
  }else if(res && res.error){ alert(res.error); }
}
function ensureSearchReady(){
  const s=$("searchBox"), w=document.querySelector(".search-wrap");
  if(!s) return;
  s.disabled=false;
  s.readOnly=false;
  s.tabIndex=0;
  s.style.pointerEvents="auto";
  if(w) w.style.pointerEvents="auto";
}

function bounds(){if(!active)return;const side=$("sidebar").getBoundingClientRect(),top=$("topbar").getBoundingClientRect(),tabs=$("tabRow")?$("tabRow").getBoundingClientRect():{bottom:top.bottom};const helperHidden=$("helper").classList.contains("hidden"),helperHeight=helperHidden?0:$("helper").getBoundingClientRect().height;const y=Math.round(tabs.bottom+helperHeight),x=Math.round(side.width);window.mpm.setBounds({x,y,width:Math.max(300,window.innerWidth-x),height:Math.max(220,window.innerHeight-y)})}
function newContainer(provider){const p=providers[provider],id=`${provider}_${Date.now()}`;containers.unshift({id,provider,name:p.name||p.label,customName:p.name||p.label,url:p.url,partition:makePartition(provider,id),createdAt:Date.now(),freshProfile:true});saveNow();render();openContainer(id)}
async function openContainer(id,fromTab=false){const c=containers.find(x=>x.id===id);if(!c)return;const alreadyLoaded=loadedTabs.has(id);if(!openTabs.includes(id))openTabs.push(id);active=c;outlookManualMode=false;outlookInboxReady=false;updateManualIndicator({outlookManualMode:false,outlookInbox:false});$("home").classList.add("hidden");$("browserPanel").classList.remove("hidden");$("title").textContent=`${serialOf(c)} • ${providerName(c)}`;$("helper").classList.add("hidden");if(alreadyLoaded||fromTab)$("status").classList.add("hidden");else{$("status").classList.remove("hidden");$("status").textContent="Loading login page..."}saveSoon();renderTabs();bounds();const ok=await window.mpm.openContainer(c);if(!ok)alert("Container open failed");setTimeout(bounds,120)}
async function closeTab(id){openTabs=openTabs.filter(x=>x!==id);if(active&&active.id===id){active=null;await window.mpm.hideView();if(openTabs.length)openContainer(openTabs[openTabs.length-1],true);else home()}saveSoon();renderTabs()}
function home(){active=null;if($("extBtn"))$("extBtn").classList.add("hidden");window.mpm.hideView();$("browserPanel").classList.add("hidden");$("home").classList.remove("hidden");renderTabs()}
function openRenameModal(id){const c=containers.find(x=>x.id===id);if(!c)return;renameTarget=id;$("renameInput").value=providerName(c);$("renameModal").classList.remove("hidden");setTimeout(()=>$("renameInput").focus(),50)}
function saveRename(){if(!renameTarget)return;const c=containers.find(x=>x.id===renameTarget);if(!c)return;const n=$("renameInput").value.trim();if(!n)return;c.customName=n;c.name=n;$("renameModal").classList.add("hidden");renameTarget=null;saveNow();render();if(active&&active.id===c.id){$("title").textContent=`${serialOf(c)} • ${providerName(c)}`;active.customName=c.customName}}
async function del(id){if(!confirm("Delete this container?"))return;containers=containers.filter(c=>c.id!==id);selected.delete(id);openTabs=openTabs.filter(x=>x!==id);loadedTabs.delete(id);await window.mpm.clearContainer(id);if(active&&active.id===id)home();saveNow();render()}
function duplicate(id){const c=containers.find(x=>x.id===id);if(!c)return;const nid=`${c.provider}_${Date.now()}`;containers.unshift({...c,id:nid,customName:providerName(c),name:providerName(c),partition:`persist:${nid}`,createdAt:Date.now()});saveNow();render()}
function moveFirst(id){const i=containers.findIndex(c=>c.id===id);if(i<=0)return;const[it]=containers.splice(i,1);containers.unshift(it);saveNow();render()}
function moveLast(id){const i=containers.findIndex(c=>c.id===id);if(i<0||i===containers.length-1)return;const[it]=containers.splice(i,1);containers.push(it);saveNow();render()}
function reorder(f,t){const a=containers.findIndex(c=>c.id===f),b=containers.findIndex(c=>c.id===t);if(a<0||b<0||a===b)return;const[it]=containers.splice(a,1);containers.splice(b,0,it);saveNow();render()}
async function deleteSelected(){if(!selected.size){alert("Select containers first.");return}if(!confirm(`Delete ${selected.size} selected container(s)?`))return;const ids=[...selected];for(const id of ids){containers=containers.filter(c=>c.id!==id);openTabs=openTabs.filter(x=>x!==id);loadedTabs.delete(id);await window.mpm.clearContainer(id)}selected.clear();selectMode=false;if(active&&ids.includes(active.id))home();saveNow();render()}
function showSms(){$("smsNumber").value=smsNumber||"Not captured";$("smsText").value=smsText||"Not captured";$("smsModal").classList.remove("hidden")}
function check(){window.mpm.browserRefresh();setTimeout(()=>window.mpm.browserRefresh(),1800);setTimeout(()=>window.mpm.browserRefresh(),4200)}
function toggleMenuModal(){const m=$("menuModal");m.classList.toggle("hidden");}

async function refreshExtensionsList(){
  const box = $("extensionList");
  if(!box) return;
  const data = await window.mpm.listExtensions();
  const list = data.saved || [];
  if(!list.length){
    box.innerHTML = `<div class="empty-ext">No unpacked extension loaded yet.</div>`;
    return;
  }
  box.innerHTML = list.map(x=>`<div class="ext-row"><div><b>${esc(x.name||"Extension")}</b><span>${esc(x.path||"")}</span></div><button data-path="${esc(x.path||"")}">Remove</button></div>`).join("");
  box.querySelectorAll("button[data-path]").forEach(btn=>{
    btn.onclick=async()=>{await window.mpm.removeExtension(btn.dataset.path);refreshExtensionsList();}
  });
}
function openExtensionModal(){
  $("extensionModal").classList.remove("hidden");
  refreshExtensionsList();
}
function closeExtensionModal(){
  $("extensionModal").classList.add("hidden");
}


function toggleExtensionModal(){
  const m = $("extensionModal");
  if(!m) return;
  m.classList.toggle("hidden");
  if(!m.classList.contains("hidden")) refreshExtensionsList();
}
function ensureExtHandlers(){
  const settings = $("extensionSettingsBtn");
  if(settings) settings.onclick=()=>{ if($("menuModal")) $("menuModal").classList.add("hidden"); toggleExtensionModal(); };
  const ext = $("extBtn");
  if(ext){ ext.onclick=toggleExtensionModal; ext.ondblclick=toggleExtensionModal; }
  const close = $("closeExtensionModal");
  if(close) close.onclick=()=>{ $("extensionModal").classList.add("hidden"); };
  const modal = $("extensionModal");
  if(modal) modal.addEventListener("dblclick",(e)=>{ if(e.target===modal) modal.classList.add("hidden"); });
  const load = $("loadExtensionBtn");
  if(load) load.onclick=async()=>{
    try{
      const res = await window.mpm.loadUnpackedExtension();
      if(res && res.ok){
        alert("Extension loaded: " + (res.name || "Extension") + "\\nLoaded profiles: " + ((res.loaded||[]).length));
      }else if(res && res.error){
        alert(res.error);
      }
      refreshExtensionsList();
    }catch(err){ alert("Extension upload failed: " + err.message); }
  };
  const store = $("chromeStoreBtn");
  if(store) store.onclick=()=>window.mpm.openChromeStore();
}

function initProviderIcons(){document.querySelectorAll(".provider-icon[data-kind]").forEach(el=>{el.innerHTML=providerIcon(el.dataset.kind)})}
$("addBtn").onclick=()=>{$("providerModal").classList.remove("hidden");initProviderIcons()};
$("closeProvider").onclick=()=>$("providerModal").classList.add("hidden");
document.querySelectorAll("[data-provider]").forEach(b=>b.onclick=()=>{$("providerModal").classList.add("hidden");newContainer(b.dataset.provider)});
$("homeBtn").onclick=home;$("backBtn").onclick=()=>window.mpm.browserBack();$("manualModeBtn").ondblclick=toggleManualMode;$("manualModeBtn").onclick=e=>{e.preventDefault();};
$("refreshBtn").onclick=()=>window.mpm.browserRefresh();
$("menuBtn").onclick=toggleMenuModal;$("menuBtn").ondblclick=toggleMenuModal;$("closeMenu").onclick=()=>$("menuModal").classList.add("hidden");$("clearAllBtn").onclick=async()=>{if(confirm("Clear all cache?")){await window.mpm.clearAll();loadedTabs.clear();alert("All cache cleared")}};
$("adminCard").onclick=()=>window.mpm.openExternal("https://t.me/JAHID_1");$("openAdminBtn").onclick=e=>{e.stopPropagation();window.mpm.openExternal("https://t.me/JAHID_1")};
$("selectDeleteBtn").onclick=async()=>{if(selectMode){$("menuModal").classList.add("hidden");await deleteSelected();return}selectMode=true;selected.clear();$("menuModal").classList.add("hidden");updateDeleteBar();render()};
$("confirmDeleteBtn").onclick=deleteSelected;$("cancelDeleteBtn").onclick=()=>{selectMode=false;selected.clear();render()};
$("cardMenu").onclick=e=>{const btn=e.target.closest("button");if(!btn||!menuTarget)return;const act=btn.dataset.act,id=menuTarget;hideCardMenu();if(act==="open")openContainer(id);else if(act==="rename")openRenameModal(id);else if(act==="delete")del(id);else if(act==="clear")window.mpm.clearContainer(id)};
$("saveRenameBtn").onclick=saveRename;$("cancelRenameBtn").onclick=()=>{$("renameModal").classList.add("hidden");renameTarget=null};$("renameInput").addEventListener("keydown",e=>{if(e.key==="Enter")saveRename();if(e.key==="Escape")$("cancelRenameBtn").click()});
$("copyNumberBtn").onclick=()=>window.mpm.copy(smsNumber);$("copyTextBtn").onclick=()=>window.mpm.copy(smsText);$("showSmsBtn").onclick=showSms;$("sentBtn").onclick=check;$("checkBtn").onclick=check;$("copySmsNumber").onclick=()=>window.mpm.copy(smsNumber);$("copySmsText").onclick=()=>window.mpm.copy(smsText);$("manualSent").onclick=()=>{$("smsModal").classList.add("hidden");check()};$("closeSms").onclick=()=>$("smsModal").classList.add("hidden");
$("searchBox").oninput=render;window.onresize=()=>setTimeout(bounds,100);
window.mpm.onSms(d=>{smsNumber=d.number||"";smsText=d.body||"";$("helper").classList.remove("hidden");bounds();showSms()});
window.mpm.onStatus(d=>{if(!d)return;updateManualIndicator(d);if(active&&d.type==="ready"){loadedTabs.add(active.id);saveSoon();$("status").classList.add("hidden")}else if(d.type==="loading"){if(active&&loadedTabs.has(active.id))return;$("status").classList.remove("hidden");$("status").textContent=d.text||"Loading..."}else if(d.type==="error"){$("status").classList.remove("hidden");$("status").textContent=d.text||"Login engine: Blocked or failed"}});

if($("extensionSettingsBtn")) $("extensionSettingsBtn").onclick=()=>{ $("menuModal").classList.add("hidden"); openExtensionModal(); };
if($("extBtn")) $("extBtn").onclick=openExtensionModal;
if($("closeExtensionModal")) $("closeExtensionModal").onclick=closeExtensionModal;
if($("loadExtensionBtn")) $("loadExtensionBtn").onclick=async()=>{
  const res = await window.mpm.loadUnpackedExtension();
  if(res && res.ok){ alert("Extension loaded: " + (res.name || "Extension") + "\nLoaded profiles: " + ((res.loaded||[]).length)); }
  else if(res && res.error){ alert(res.error); }
  refreshExtensionsList();
};

ensureExtHandlers();
ensureSearchReady();initProviderIcons();migrateData();render();setTimeout(ensureSearchReady,200);setTimeout(ensureSearchReady,900);

/* V16_FLOATING_EXTENSION_PANEL */
setTimeout(()=>{
  const openFloat = ()=>window.mpm.openExtensionPanel();
  const settings = $("extensionSettingsBtn");
  if(settings) settings.onclick=()=>{ if($("menuModal")) $("menuModal").classList.add("hidden"); openFloat(); };
  const ext = $("extBtn");
  if(ext){ ext.onclick=openFloat; ext.ondblclick=openFloat; }
}, 0);


/* V17_VISIBLE_EXTENSION_WINDOW_FINAL_OVERRIDE */
setTimeout(()=>{
  const openPanel = ()=>window.mpm.openExtensionPanel();
  const settings = $("extensionSettingsBtn");
  if(settings){
    settings.onclick=(e)=>{
      e.preventDefault();
      e.stopPropagation();
      if($("menuModal")) $("menuModal").classList.add("hidden");
      openPanel();
    };
    settings.ondblclick=(e)=>{
      e.preventDefault();
      e.stopPropagation();
      if($("menuModal")) $("menuModal").classList.add("hidden");
      openPanel();
    };
  }
  const ext = $("extBtn");
  if(ext){
    ext.onclick=(e)=>{e.preventDefault();e.stopPropagation();openPanel();};
    ext.ondblclick=(e)=>{e.preventDefault();e.stopPropagation();openPanel();};
  }
}, 250);
