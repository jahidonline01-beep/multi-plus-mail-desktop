const { app, BrowserWindow, BrowserView, ipcMain, session, shell, clipboard, Menu } = require("electron");
const path = require("path");
const fs = require("fs");

app.setName("Multiplus Mail");
// V19_BACKUP_COMPAT_USERDATA: force every build to use the same backup/session folder.
try{
  app.setPath("userData", path.join(app.getPath("appData"), "Multiplus Mail"));
}catch(e){}

const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MOBILE_UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";
const ALT_DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0";

let mainWindow = null;
let currentView = null;
let currentId = null;
const pendingSafeLoginViews = new Set();
const outlookManualModes = new Set();

let viewBounds = { x: 330, y: 112, width: 800, height: 600 };
const views = new Map();
const engines = new Map();
const preparedFreshProfiles = new Set();

function freshMarkerFile(){
  return path.join(app.getPath("userData"), "fresh_outlook_prepared.json");
}
function readFreshMarkers(){
  try{
    const p = freshMarkerFile();
    if(!fs.existsSync(p)) return {};
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    return data && typeof data === "object" ? data : {};
  }catch(e){ return {}; }
}
function writeFreshMarkers(data){
  try{
    fs.writeFileSync(freshMarkerFile(), JSON.stringify(data || {}, null, 2));
  }catch(e){}
}
const partitionsById = new Map();

function hashCodeForContainer(id){
  let h = 0;
  const s = String(id || "");
  for(let i=0;i<s.length;i++){ h = ((h<<5)-h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

function uaForContainer(container){
  const id = container && container.id ? container.id : "";
  const list = [
    DESKTOP_UA,
    ALT_DESKTOP_UA,
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0"
  ];
  return list[hashCodeForContainer(id) % list.length];
}

function normalizedPartition(container){
  if(container && container.partition && String(container.partition).startsWith("persist:")) return container.partition;
  return `persist:mpm_${(container && container.provider) || "mail"}_${(container && container.id) || Date.now()}`;
}

async function prepareFreshProfileOnce(container){
  // V25_NEW_OUTLOOK_ONLY_FRESH_CLEAR:
  // Clean storage only once for a NEW Outlook/Exchange container before first login.
  // Never auto-clear existing logged-in containers.
  if(!container || !container.id) return;
  if(preparedFreshProfiles.has(container.id)) return;
  preparedFreshProfiles.add(container.id);

  const isOutlook = container.provider === "outlook" || container.provider === "exchange";
  if(!isOutlook || !container.freshProfile) return;

  const markers = readFreshMarkers();
  if(markers[container.id]) return;

  const partition = normalizedPartition(container);
  const ses = session.fromPartition(partition);
  try{
    await ses.clearCache();
    await ses.clearStorageData({
      storages:["cookies","localstorage","indexdb","serviceworkers","cachestorage","websql"]
    });
  }catch(e){}

  markers[container.id] = { preparedAt: Date.now(), provider: container.provider, partition };
  writeFreshMarkers(markers);
}

function engineState(id){
  if(!engines.has(id)){
    engines.set(id, {
      stage: 0,
      ua: DESKTOP_UA,
      lastUrl: "",
      blockedCount: 0,
      provider: "gmail",
      originalUrl: "",
      mobileTried: false,
      edgeTried: false,
      systemFallbackTried: false
    });
  }
  return engines.get(id);
}

function isSms(url){
  if(!url) return false;
  const l = String(url).toLowerCase();
  return l.startsWith("sms:") || l.startsWith("smsto:") || l.startsWith("intent:");
}

function parseSms(url){
  let number="", body="";
  try{
    if(url.startsWith("sms:") || url.startsWith("smsto:")){
      const cleaned = url.replace(/^smsto?:/i,"");
      const [num, query=""] = cleaned.split("?");
      number = num.replace(/^\/\//,"");
      const params = new URLSearchParams(query);
      body = params.get("body") || params.get("sms_body") || "";
    }else{
      const dec = decodeURIComponent(url);
      const m = dec.match(/(?:sms|smsto):([^;?]+)/i);
      if(m) number = m[1] || "";
      const b = dec.match(/sms_body=([^;]+)/i) || dec.match(/body=([^;]+)/i);
      if(b) body = decodeURIComponent(b[1]);
    }
  }catch(e){}
  return { number, body, raw:url };
}

function providerUrl(provider){
  if(provider === "gmail") return "https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fmyaccount.google.com%2F&hl=en";
  if(provider === "outlook") return "https://outlook.live.com/mail/0/";
  if(provider === "yahoo") return "https://login.yahoo.com/";
  if(provider === "exchange") return "https://login.microsoftonline.com/";
  return "https://accounts.google.com/ServiceLogin?service=mail";
}

function mobileUrl(provider){
  if(provider === "gmail") return "https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fmyaccount.google.com%2F&hl=en";
  if(provider === "outlook") return "https://outlook.live.com/mail/0/";
  if(provider === "yahoo") return "https://login.yahoo.com/";
  if(provider === "exchange") return "https://login.microsoftonline.com/";
  return providerUrl(provider);
}

function setupSession(partition, ua){
  const ses = session.fromPartition(partition);
  ses.setPermissionRequestHandler((_wc,_permission,callback)=>callback(true));
  ses.webRequest.onBeforeSendHeaders((details, callback)=>{
    details.requestHeaders["User-Agent"] = ua || DESKTOP_UA;
    // V25_NORMAL_LANGUAGE_HEADERS
    details.requestHeaders["Accept-Language"] = details.requestHeaders["Accept-Language"] || "en-US,en;q=0.9";

    details.requestHeaders["Accept-Language"] = "en-US,en;q=0.9";
    callback({requestHeaders: details.requestHeaders});
  });
  return ses;
}

function attachMenu(wc){
  wc.on("context-menu",(event, params)=>{
    const hasUsefulTarget = params.isEditable || !!params.linkURL || !!params.selectionText;
    if(!hasUsefulTarget){
      event.preventDefault();
      return;
    }
    event.preventDefault();
    const t = [];
    if(params.linkURL){
      t.push(
        {label:"Open Link Here",click:()=>wc.loadURL(params.linkURL,{userAgent:DESKTOP_UA})},
        {label:"Copy Link",click:()=>clipboard.writeText(params.linkURL)},
        {type:"separator"}
      );
    }
    if(params.isEditable){
      t.push(
        {label:"Undo",role:"undo"},
        {label:"Redo",role:"redo"},
        {type:"separator"},
        {label:"Cut",role:"cut"},
        {label:"Copy",role:"copy"},
        {label:"Paste",role:"paste"},
        {label:"Select All",role:"selectAll"}
      );
    }else{
      t.push(
        {label:"Copy",role:"copy",enabled:!!params.selectionText},
        {label:"Select All",role:"selectAll"}
      );
    }
    Menu.buildFromTemplate(t).popup();
  });
}


function isOutlookDashboard(url){
  if(!url) return false;
  try{
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    const href = String(url).toLowerCase();
    if(h.includes("account.microsoft.com")) return true;
    if(h.includes("myaccount.microsoft.com")) return true;
    if(h.includes("office.com") && !href.includes("outlook")) return true;
    if(h.includes("microsoft365.com") && !href.includes("outlook")) return true;
    return false;
  }catch(e){ return false; }
}

function isMicrosoftLoginFlow(url){
  const s = String(url || "").toLowerCase();
  return (
    s.includes("login.live.com") ||
    s.includes("login.microsoftonline.com") ||
    s.includes("account.live.com") ||
    s.includes("privacynotice.account.microsoft.com") ||
    s.includes("signup.live.com") ||
    s.includes("outlook.live.com/owa") ||
    s.includes("outlook.live.com/mail/0/options")
  );
}
function isMicrosoftPasswordOrChallengeText(text){
  const t = String(text || "").toLowerCase();
  return (
    t.includes("enter your password") ||
    t.includes("other ways to sign in") ||
    t.includes("forgot your password") ||
    t.includes("too many times with an incorrect account or password") ||
    t.includes("help us protect your account") ||
    t.includes("verify your identity") ||
    t.includes("security code") ||
    t.includes("captcha") ||
    t.includes("challenge")
  );
}
function isOutlookLoginOrMail(url){
  const s = String(url || "").toLowerCase();
  return s.includes("login.live.com") || s.includes("login.microsoftonline.com") || s.includes("outlook.live.com/mail");
}

function isOutlookProvider(container){
  return !!(container && (container.provider === "outlook" || container.provider === "exchange"));
}
function isOutlookInboxUrl(url){
  const s = String(url || "").toLowerCase();
  return s.includes("outlook.live.com/mail");
}
function isOutlookManualMode(container){
  return !!(container && container.id && outlookManualModes.has(container.id));
}
function sendOutlookUiState(container, type="ready", text=""){
  try{
    if(!mainWindow || !container) return;
    const url = currentView && currentView.webContents && !currentView.webContents.isDestroyed() ? currentView.webContents.getURL() : "";
    const isOutlook = isOutlookProvider(container);
    mainWindow.webContents.send("view-status",{
      type,
      text,
      url,
      containerId: container.id,
      provider: container.provider,
      outlookInbox: isOutlook && isOutlookInboxUrl(url),
      outlookManualMode: isOutlook && isOutlookManualMode(container)
    });
  }catch(e){}
}

async function outlookInboxGuard(container){
  try{
    if(!container || container.provider !== "outlook" || !currentView || currentId !== container.id) return;
    if(isOutlookManualMode(container)) return;
    const url = currentView.webContents.getURL();
    if(isOutlookDashboard(url)){
      mainWindow.webContents.send("view-status",{type:"loading",text:"Opening Outlook Mail inbox..."});
      await currentView.webContents.loadURL("https://outlook.live.com/mail/0/",{userAgent: engineState(container.id).ua || DESKTOP_UA});
    }
  }catch(e){}
}

function createView(container, ua){
  const partition = normalizedPartition(container);
  if(container && container.id) partitionsById.set(container.id, partition);
  setupSession(partition, ua);
  const view = new BrowserView({
    webPreferences:{
      partition,
      nodeIntegration:false,
      contextIsolation:true,
      sandbox:true,
      javascript:true,
      webSecurity:true,
      spellcheck:false
    }
  });

  view.webContents.setUserAgent(ua || DESKTOP_UA);
  attachMenu(view.webContents);

  view.webContents.setWindowOpenHandler(({url})=>{
    if(isSms(url)){
      mainWindow.webContents.send("sms-captured", parseSms(url));
      return {action:"deny"};
    }
    if(url){
      view.webContents.loadURL(url,{userAgent: engineState(container.id).ua || DESKTOP_UA});
      return {action:"deny"};
    }
    return {action:"deny"};
  });

  view.webContents.on("will-navigate",(event,url)=>{
    if(isSms(url)){
      event.preventDefault();
      mainWindow.webContents.send("sms-captured", parseSms(url));
    }
  });

  view.webContents.on("did-start-loading",()=>mainWindow.webContents.send("view-status",{type:"loading",text:"Loading login page..."}));
  view.webContents.on("did-stop-loading",()=>{focusCurrentView();sendOutlookUiState(container,"ready","");});
  view.webContents.on("did-fail-load",(_e,code,desc,url)=>mainWindow.webContents.send("view-status",{type:"error",text:`Load failed: ${desc || code}`,url}));

  view.webContents.on("did-finish-load",()=>{focusCurrentView();
    setTimeout(async ()=>{
      try{
        const u = view.webContents.getURL() || "";
        if(isInAppOutlookSafeLogin(container) && u.toLowerCase().includes("outlook.live.com/mail")){
          // V27_IN_APP_LOGIN_COMPLETE: login saved in same container; switch back to normal app layout.
          container.freshProfile = false;
          outlookManualModes.delete(container.id);
          pendingSafeLoginViews.delete(container.id);
          applyBoundsForContainer(container);
          mainWindow.webContents.send("view-status",{type:"ready",text:"Outlook login saved."});
        }
      }catch(e){}
      await outlookInboxGuard(container);
      sendOutlookUiState(container,"ready","");
    }, 250);
    setTimeout(()=>checkAndAutoSwitch(container), 350);
  });

  return view;
}



async function readPageText(view){
  try{
    return await view.webContents.executeJavaScript(`
      (document.body && document.body.innerText ? document.body.innerText : "") + "\\nURL:" + location.href + "\\nTITLE:" + document.title
    `, true);
  }catch(e){
    return "";
  }
}

function isCaptchaOrChallengePage(text){
  const t = String(text || "").toLowerCase();
  return (
    t.includes("captcha") ||
    t.includes("verify you are human") ||
    t.includes("verify that you're not a robot") ||
    t.includes("prove you're not a robot") ||
    t.includes("security code") ||
    t.includes("help us protect your account") ||
    t.includes("add security info") ||
    t.includes("verification") ||
    t.includes("challenge")
  );
}

function looksBlocked(text){
  const t = String(text || "").toLowerCase();
  return (
    t.includes("couldn't sign you in") ||
    t.includes("couldn’t sign you in") ||
    t.includes("this browser or app may not be secure") ||
    t.includes("browser or app may not be secure") ||
    t.includes("disallowed_useragent") ||
    t.includes("try using a different browser") ||
    t.includes("secure browser")
  );
}

async function rebuildView(container, ua, targetUrl, statusText){
  if(!mainWindow) return false;
  if(currentView){
    try{ mainWindow.removeBrowserView(currentView); }catch(e){}
  }
  const old = views.get(container.id);
  try{ if(old && !old.webContents.isDestroyed()) old.webContents.close(); }catch(e){}
  views.delete(container.id);

  mainWindow.webContents.send("view-status",{type:"loading",text:statusText || "Switching secure login engine..."});

  const view = createView(container, ua);
  views.set(container.id, view);
  currentView = view;
  currentId = container.id;
  mainWindow.setBrowserView(view);
  applyBounds();

  await view.webContents.loadURL(targetUrl || providerUrl(container.provider), { userAgent: ua });
  return true;
}

async function checkAndAutoSwitch(container){
  if(!currentView || currentId !== container.id) return;
  const state = engineState(container.id);
  const text = await readPageText(currentView);

  if(isCaptchaOrChallengePage(text)) return;
  if((container.provider === "outlook" || container.provider === "exchange") && (isMicrosoftLoginFlow(urlNow) || isMicrosoftPasswordOrChallengeText(text))){/* V25_OUTLOOK_ABSOLUTE_NO_SWITCH */return;}
  if((container.provider === "outlook" || container.provider === "exchange") && (isMicrosoftLoginFlow(urlNow) || isMicrosoftPasswordOrChallengeText(text))){
/* V25_MICROSOFT_LOGIN_NO_SWITCH */return;
  }
  if(!looksBlocked(text)) return;

  // OUTLOOK_NO_AUTO_SWITCH_V12: for Microsoft/Outlook login pages, do not auto-reload or switch engines.
  // Let the official Microsoft sign-in flow finish normally, then only dashboard pages are redirected to inbox.
  const urlNow = currentView && currentView.webContents ? currentView.webContents.getURL() : "";
  if((container.provider === "outlook" || container.provider === "exchange") && (isOutlookLoginOrMail(urlNow) || isMicrosoftLoginFlow(urlNow) || isMicrosoftPasswordOrChallengeText(text))){
    // V22_MICROSOFT_LOGIN_STABLE: never auto-reload/switch on Microsoft password, challenge, captcha, or risk pages.
    return;
  }

  state.blockedCount += 1;

  if(container.provider === "gmail" && !state.mobileTried){
    state.mobileTried = true;
    state.ua = MOBILE_UA;
    await rebuildView(container, MOBILE_UA, mobileUrl(container.provider), "Google blocked desktop engine. Switching mobile simulation...");
    return;
  }

  if(!state.edgeTried){
    state.edgeTried = true;
    state.ua = ALT_DESKTOP_UA;
    await rebuildView(container, ALT_DESKTOP_UA, providerUrl(container.provider), "Switching alternate official browser engine...");
    return;
  }

  // Final safe fallback: do not bypass Google. Show clear state and optionally open system auth URL automatically.
  if(container.provider === "gmail" && !state.systemFallbackTried){
    state.systemFallbackTried = true;
    mainWindow.webContents.send("view-status",{
      type:"error",
      text:"Google blocked embedded login. Opening official secure login page for this container..."
    });
    // app-owned fallback: open official page externally only after all embedded engines fail
    setTimeout(()=>shell.openExternal(providerUrl("gmail")), 1200);
    return;
  }

  mainWindow.webContents.send("view-status",{
    type:"error",
    text:"Embedded login blocked by provider security. Try Outlook/Yahoo or use provider official sign-in once."
  });
}

function focusCurrentView(){
  try{
    if(currentView && currentView.webContents && !currentView.webContents.isDestroyed()){
      currentView.webContents.focus();
    }
  }catch(e){}
}
function applyBounds(){
  // V27_APPLY_ACTIVE_CONTAINER_BOUNDS
  if(currentId){
    try{
      const stContainer = { id: currentId, provider: (engineState(currentId).provider || ""), freshProfile: false };
      if(currentView && engineState(currentId).provider && false){ applyBoundsForContainer(stContainer); return; }
    }catch(e){}
  }
  if(!currentView) return;
  const safe = {
    x: Math.max(0, Math.round(viewBounds.x || 0)),
    y: Math.max(0, Math.round(viewBounds.y || 0)),
    width: Math.max(320, Math.round(viewBounds.width || 800)),
    height: Math.max(240, Math.round(viewBounds.height || 600))
  };
  currentView.setBounds(safe);
  currentView.setAutoResize({width:true,height:true});
  focusCurrentView();
}







function isInAppOutlookSafeLogin(container){
  return !!(container && (container.provider === "outlook" || container.provider === "exchange") && container.freshProfile);
}
function shouldStartSafeLoginLayout(container){
  return isInAppOutlookSafeLogin(container) && !pendingSafeLoginViews.has(container.id);
}
function shouldKeepPendingSafeLogin(container){
  return isInAppOutlookSafeLogin(container) && pendingSafeLoginViews.has(container.id);
}
function boundsForSafeLogin(){
  return viewBounds;
}
function applyBoundsForContainer(container){
  if(!currentView) return;
  const safeLogin = shouldStartSafeLoginLayout(container);
  const b = safeLogin ? boundsForSafeLogin() : viewBounds;
  const safe = {
    x: Math.max(0, Math.round(b.x || 0)),
    y: Math.max(0, Math.round(b.y || 0)),
    width: Math.max(320, Math.round(b.width || 800)),
    height: Math.max(240, Math.round(b.height || 600))
  };
  currentView.setBounds(safe);
  currentView.setAutoResize({width:true,height:true});
  focusCurrentView();
}

function startUrlForContainer(container){
  const p = (container && container.provider) || "";
  const isOutlook = p === "outlook" || p === "exchange";
  if(isOutlook && container && container.freshProfile){
    // V26_CLEAN_WINDOW_LOGIN_URL
    return "https://login.live.com/login.srf?wa=wsignin1.0&wreply=https%3A%2F%2Foutlook.live.com%2Fmail%2F0%2F&id=292841&lc=1033";
  }
  if(isOutlook) return "https://outlook.live.com/mail/0/";
  return (container && container.url) || providerUrl(p);
}

async function openContainer(container){
  try{
    if(!mainWindow || !container || !container.id) return false;

    if(currentView){
      try{ mainWindow.removeBrowserView(currentView); }catch(e){}
    }

    currentId = container.id;
    partitionsById.set(container.id, normalizedPartition(container));
    const state = engineState(container.id);
    state.provider = container.provider || "gmail";
    state.originalUrl = container.url || providerUrl(state.provider);
    if(!state.ua || state.ua === DESKTOP_UA) state.ua = uaForContainer(container);
    await prepareFreshProfileOnce(container);

    let view = views.get(container.id);
    if(!view || view.webContents.isDestroyed()){
      view = createView(container, state.ua);
      views.set(container.id, view);
    }

    currentView = view;
    mainWindow.setBrowserView(view);

    const isFirstSafeLoginOpen = isInAppOutlookSafeLogin(container) && !pendingSafeLoginViews.has(container.id);
    // V28_PENDING_LOGIN_NO_SHAKE: first open uses full safe-login layout; later pending clicks keep normal layout and do not reload.
    applyBoundsForContainer(container);
    if(isFirstSafeLoginOpen) pendingSafeLoginViews.add(container.id);

    const current = view.webContents.getURL();
    const target = startUrlForContainer(container);
    const pendingSafeReopen = isInAppOutlookSafeLogin(container) && pendingSafeLoginViews.has(container.id) && current && current !== "about:blank";
    if(!pendingSafeReopen && (!current || current === "about:blank")){
      await view.webContents.loadURL(target,{userAgent:state.ua});
    }

    view.webContents.focus();
    return true;
  }catch(e){
    if(mainWindow) mainWindow.webContents.send("view-status",{type:"error",text:String(e && e.message ? e.message : e)});
    return false;
  }
}

function hideView(){
  if(mainWindow && currentView){
    try{ mainWindow.removeBrowserView(currentView); }catch(e){}
  }
  currentView = null;
  currentId = null;
}

async function clearContainer(id){
  if(views.has(id)){
    const v = views.get(id);
    if(currentId === id) hideView();
    try{ v.webContents.close(); }catch(e){}
    views.delete(id);
  }
  engines.delete(id);
  const part = partitionsById.get(id) || `persist:${id}`;
  const ses = session.fromPartition(part);
  await ses.clearCache();
  await ses.clearStorageData();
  return true;
}

async function clearAll(){
  for(const [id,v] of views.entries()){
    try{ if(!v.webContents.isDestroyed()) v.webContents.close(); }catch(e){}
  }
  views.clear();
  engines.clear();
  hideView();
  const all = session.getAllSessions ? session.getAllSessions() : [];
  for(const ses of all){
    try{ await ses.clearCache(); await ses.clearStorageData(); }catch(e){}
  }
  return true;
}



function createMain(){
  mainWindow = new BrowserWindow({
    width:1180,
    height:780,
    minWidth:920,
    minHeight:640,
    title:"Multiplus Mail",
    icon:path.join(__dirname,"app_icon.png"),
    backgroundColor:"#070918",
    webPreferences:{
      preload:path.join(__dirname,"preload.js"),
      contextIsolation:true,
      nodeIntegration:false,
      sandbox:false
    }
  });
  mainWindow.removeMenu();
  attachMenu(mainWindow.webContents);
  mainWindow.loadFile("index.html");
  mainWindow.on("resize", applyBounds);
  mainWindow.on("maximize", applyBounds);
  mainWindow.on("restore", applyBounds);
}

app.whenReady().then(()=>{
  setupSession("persist:main", DESKTOP_UA);
  createMain();
  app.on("activate",()=>{if(BrowserWindow.getAllWindows().length===0)createMain();});
});

ipcMain.handle("open-container",(_e,c)=>openContainer(c));
ipcMain.handle("hide-view",()=>{hideView();return true;});
ipcMain.handle("set-bounds",(_e,b)=>{viewBounds=b;applyBounds();return true;});
ipcMain.handle("browser-back",()=>{if(currentView && currentView.webContents.canGoBack())currentView.webContents.goBack();return true;});
ipcMain.handle("browser-refresh",()=>{if(currentView)currentView.webContents.reload();return true;});
ipcMain.handle("clear-container",(_e,id)=>clearContainer(id));
ipcMain.handle("clear-all",()=>clearAll());
ipcMain.handle("open-external",(_e,url)=>shell.openExternal(url));
ipcMain.handle("copy-text",(_e,text)=>{clipboard.writeText(text||"");return true;});



ipcMain.handle("outlook-manual-mode", async (_e, container, enabled)=>{
  try{
    if(!container || !container.id || !isOutlookProvider(container)) return {ok:false,error:"Outlook only"};
    const view = views.get(container.id) || currentView;
    if(!view || view.webContents.isDestroyed()) return {ok:false,error:"Container is not open"};
    currentView = view;
    currentId = container.id;
    const st = engineState(container.id);
    if(enabled){
      outlookManualModes.add(container.id);
      await view.webContents.loadURL("https://account.microsoft.com/", {userAgent: st.ua || DESKTOP_UA});
    }else{
      outlookManualModes.delete(container.id);
      await view.webContents.loadURL("https://outlook.live.com/mail/0/", {userAgent: st.ua || DESKTOP_UA});
    }
    sendOutlookUiState(container,"ready","");
    return {ok:true,manualMode:outlookManualModes.has(container.id)};
  }catch(e){
    return {ok:false,error:String(e && e.message ? e.message : e)};
  }
});


app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();});
