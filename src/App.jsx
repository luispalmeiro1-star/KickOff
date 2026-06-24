import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase.js";

const MAX_PLAYERS = 15;
const MIN_PLAYERS = 10;
const COST = 3;
const RENT = 22;
const AVATAR_COLORS = ["#16a34a","#2563eb","#7c3aed","#dc2626","#d97706","#0891b2","#be185d","#065f46"];
const TEAM_COLORS = [
  { bg: "rgba(22,163,74,0.15)", border: "#16a34a", text: "#4ade80", name: "EQUIPA A" },
  { bg: "rgba(37,99,235,0.15)", border: "#2563eb", text: "#60a5fa", name: "EQUIPA B" },
  { bg: "rgba(217,119,6,0.15)", border: "#d97706", text: "#fbbf24", name: "EQUIPA C" },
];

function nextWednesday() {
  const now = new Date();
  const diff = (3 - now.getDay() + 7) % 7 || 7;
  const d = new Date(now); d.setDate(now.getDate() + diff);
  return d.toISOString().split("T")[0];
}
function prevWeek(dateStr) {
  const [y,m,d] = dateStr.split("-").map(Number);
  const date = new Date(y,m-1,d); date.setDate(date.getDate()-7);
  return date.toISOString().split("T")[0];
}
function nextWeek(dateStr) {
  const [y,m,d] = dateStr.split("-").map(Number);
  const date = new Date(y,m-1,d); date.setDate(date.getDate()+7);
  return date.toISOString().split("T")[0];
}
function formatDisplayDate(dateStr) {
  if (!dateStr) return "";
  const [y,m,d] = dateStr.split("-").map(Number);
  return new Date(y,m-1,d).toLocaleDateString("pt-PT",{weekday:"long",day:"numeric",month:"long"});
}
function formatShortDate(dateStr) {
  if (!dateStr) return "";
  const [y,m,d] = dateStr.split("-").map(Number);
  return new Date(y,m-1,d).toLocaleDateString("pt-PT",{day:"numeric",month:"short"});
}
function formatTime(ts) {
  if(!ts) return "";
  return new Date(ts).toLocaleTimeString("pt-PT",{hour:"2-digit",minute:"2-digit"});
}
function countdown(dateStr, timeStr) {
  if (!dateStr||!timeStr) return "—";
  const [h,min] = timeStr.split(":").map(Number);
  const [y,mo,d] = dateStr.split("-").map(Number);
  const diff = new Date(y,mo-1,d,h,min) - new Date();
  if (diff<=0) return "A DECORRER ⚽";
  const days=Math.floor(diff/86400000), hours=Math.floor((diff%86400000)/3600000), mins=Math.floor((diff%3600000)/60000);
  if (days>0) return `${days}D ${hours}H`;
  if (hours>0) return `${hours}H ${mins}M`;
  return `${mins} MIN`;
}
function sortedConfirmed(players) {
  const members = players.filter(p=>p.status==="in"&&!p.is_guest).sort((a,b)=>a.confirmed_at-b.confirmed_at);
  const guests  = players.filter(p=>p.status==="in"&& p.is_guest).sort((a,b)=>a.confirmed_at-b.confirmed_at);
  return [...members,...guests];
}
function shuffle(arr) {
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
function makeTeams(confirmed, players=[]) {
  const n = confirmed.length;
  const numTeams = n >= 15 ? 3 : 2;
  const enriched = confirmed.map(p => ({...p, position: players.find(pl=>pl.id===p.id)?.position||"Polivalente"}));
  const grs = shuffle(enriched.filter(p=>p.position==="GR"));
  const pols = shuffle(enriched.filter(p=>p.position!=="GR"));
  const teams = Array.from({length:numTeams},()=>[]);
  grs.slice(0,numTeams).forEach((gr,i)=>teams[i].push(gr));
  const rest = shuffle([...pols,...grs.slice(numTeams)]);
  rest.forEach((p,i)=>teams[i%numTeams].push(p));
  return teams;
}
function getAvatar(player) {
  return player?.avatar_color || AVATAR_COLORS[0];
}

// ── ICONS ────────────────────────────────────────────────────────────────────
// ── TEAM ASSIGNMENT LOGIC ───────────────────────────────────────────────────
function assignTeams(confirmed) {
  const n = confirmed.length;
  if (n === 0) return {};
  const numTeams = n >= 15 ? 3 : 2;
  const teams = Array.from({length: numTeams}, () => []);
  const teamNames = ["A", "B", "C"];

  // Separate GRs and polivalentes
  const grs = shuffle(confirmed.filter(p => p.position === "GR"));
  const pols = shuffle(confirmed.filter(p => p.position !== "GR"));

  // Place one GR per team as anchor
  grs.slice(0, numTeams).forEach((gr, i) => teams[i].push(gr));
  // Extra GRs go into rest pool
  const rest = shuffle([...pols, ...grs.slice(numTeams)]);

  // Distribute rest to keep teams balanced
  rest.forEach(p => {
    // Find team with fewest players
    const minLen = Math.min(...teams.map(t => t.length));
    const candidates = teams.map((t,i) => ({t,i})).filter(({t}) => t.length === minLen);
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    chosen.t.push(p);
  });

  // Build result map: playerId -> teamName or "SUB"
  const result = {};
  teams.forEach((team, ti) => {
    const mainPlayers = team.slice(0, 5);
    const subs = team.slice(5);
    mainPlayers.forEach(p => { result[p.id] = teamNames[ti]; });
    subs.forEach(p => { result[p.id] = "SUB"; });
  });
  return result;
}

const Icon = ({name,size=18}) => {
  const icons = {
    ball:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 6.88 2.75L12 12 5.12 4.75A10 10 0 0 1 12 2z"/><path d="M2.5 8.5l9.5 3.5 9.5-3.5"/><path d="M12 12v10"/></svg>,
    check:   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>,
    x:       <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    plus:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    clock:   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    logout:  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
    shield:  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    trash:   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
    people:  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    key:     <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6"/><path d="M15.5 7.5l3 3L22 7l-3-3"/></svg>,
    eye:     <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
    eyeoff:  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
    guest:   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>,
    pin:     <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
    edit:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    cal:     <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    euro:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 10h12M4 14h12M19.5 9a6.5 6.5 0 1 0 0 6"/></svg>,
    chart:   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>,
    shuffle: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>,
    left:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>,
    right:   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>,
    warn:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    star:    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
    chat:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
    user:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    trophy:  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>,
    sun:     <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
    moon:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
    send:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  };
  return icons[name]||null;
};

// ── AVATAR ───────────────────────────────────────────────────────────────────
function Avatar({player={}, size=32, style={}}) {
  const color = getAvatar(player);
  return (
    <div style={{width:size,height:size,borderRadius:"50%",background:color||"#16a34a",display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.4,fontWeight:800,color:"white",flexShrink:0,...style}}>
      {player?.name?.[0]||"?"}
    </div>
  );
}

// ── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [players, setPlayers]         = useState([]);
  const [gameInfo, setGameInfo]       = useState({location:"Pavilhão Gimnodesportivo de Alcochete",date:nextWednesday(),time:"22:30",app_name:"Hoje Há Bola",cost_per_player:3});
  const [history, setHistory]         = useState([]);
  const [debts, setDebts]             = useState([]);
  const [messages, setMessages]       = useState([]);
  const [mvpVotes, setMvpVotes]       = useState([]);
  const [piggybank, setPiggybank]     = useState(0);
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView]               = useState("login"); // login | player | admin | profile | stats | chat | debts
  const [toast, setToast]             = useState(null);
  const [adminTab, setAdminTab]       = useState("jogo");
  const [loading, setLoading]         = useState(true);
  const [darkMode, setDarkMode]       = useState(() => localStorage.getItem("kickoff_dark")==="1");
  const [viewingDate, setViewingDate] = useState(null);
  const [historyGame, setHistoryGame] = useState(null);
  const isViewingHistory = !!viewingDate;
  const effectiveDate = viewingDate || gameInfo.date;

  const showToast = (msg,type="ok") => {setToast({msg,type});setTimeout(()=>setToast(null),3000);};

  const loadPlayers  = useCallback(async()=>{const{data}=await supabase.from("players").select("*").order("id");if(data)setPlayers(data);},[]);
  const loadGameInfo = useCallback(async()=>{const{data}=await supabase.from("game_info").select("*").eq("id",1).single();if(data)setGameInfo(data);},[]);
  const loadHistory  = useCallback(async()=>{const{data}=await supabase.from("game_history").select("*").order("date",{ascending:false});if(data){setHistory(data);setPiggybank(data.reduce((s,g)=>s+(Number(g.collected)||0)-(g.players_count>0?RENT:0),0));}},[]);
  const loadDebts    = useCallback(async()=>{const{data}=await supabase.from("debts").select("*").order("created_at");if(data)setDebts(data);},[]);
  const loadMessages = useCallback(async()=>{const{data}=await supabase.from("chat_messages").select("*").order("created_at").limit(100);if(data)setMessages(data);},[]);
  const loadMvp      = useCallback(async()=>{const{data}=await supabase.from("mvp_votes").select("*");if(data)setMvpVotes(data);},[]);
  const [attendance, setAttendance] = useState([]);
  const loadAttendance = useCallback(async()=>{const{data}=await supabase.from("game_attendance").select("*").order("game_date",{ascending:false});if(data)setAttendance(data);},[]);

  useEffect(()=>{
    (async()=>{setLoading(true);await Promise.all([loadPlayers(),loadGameInfo(),loadHistory(),loadDebts(),loadMessages(),loadMvp(),loadAttendance()]);setLoading(false);})();
    const subs=[
      supabase.channel("players_ch").on("postgres_changes",{event:"*",schema:"public",table:"players"},loadPlayers).subscribe(),
      supabase.channel("gameinfo_ch").on("postgres_changes",{event:"*",schema:"public",table:"game_info"},loadGameInfo).subscribe(),
      supabase.channel("history_ch").on("postgres_changes",{event:"*",schema:"public",table:"game_history"},loadHistory).subscribe(),
      supabase.channel("debts_ch").on("postgres_changes",{event:"*",schema:"public",table:"debts"},loadDebts).subscribe(),
      supabase.channel("chat_ch").on("postgres_changes",{event:"*",schema:"public",table:"chat_messages"},loadMessages).subscribe(),
      supabase.channel("mvp_ch").on("postgres_changes",{event:"*",schema:"public",table:"mvp_votes"},loadMvp).subscribe(),
    ];
    return()=>subs.forEach(s=>supabase.removeChannel(s));
  },[loadPlayers,loadGameInfo,loadHistory,loadDebts,loadMessages,loadMvp]);

  useEffect(()=>{
    if(!viewingDate){setHistoryGame(null);return;}
    setHistoryGame(history.find(h=>h.date===viewingDate)||null);
  },[viewingDate,history]);

  useEffect(()=>{localStorage.setItem("kickoff_dark",darkMode?"1":"0");},[darkMode]);

  // Restore session once players are loaded
  useEffect(()=>{
    if(loading||currentUser||players.length===0) return;
    try{
      const saved=JSON.parse(localStorage.getItem("hhb_session"));
      if(saved?.playerId){
        const p=players.find(pl=>pl.id===saved.playerId);
        if(p){
          setCurrentUser(p);setView(p.is_admin?"admin":"player");
        }
      }
    }catch(e){}
  },[loading,players]);

  const members   = players.filter(p=>!p.is_guest);
  const guests    = players.filter(p=>p.is_guest);
  const confirmed = sortedConfirmed(players);
  const waiting   = players.filter(p=>p.status==="wait");
  const notYet    = members.filter(p=>p.status==="out");
  const spotsLeft = Math.max(0,MAX_PLAYERS-confirmed.length);
  const cdStr     = countdown(gameInfo.date,gameInfo.time);

  const linkOneSignal = (playerId) => {
    try{
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async function(OneSignal) {
        try{
          if(OneSignal.Notifications.permission !== true){
            await OneSignal.Notifications.requestPermission();
          }
          if(OneSignal.Notifications.permission === true){
            await OneSignal.User.addTag("player_id", String(playerId));
          }
        }catch(err){ console.log("OneSignal error:", err); }
      });
    }catch(e){}
  };

  const handleLogin = async(identifier,password)=>{
    const clean=identifier.trim().toLowerCase();
    const p=players.find(p=>p.username?.toLowerCase()===clean || p.phone?.replace(/\s+/g,"")===identifier.trim().replace(/\s+/g,""));
    if(!p||p.password!==password) return false;
    setCurrentUser(p); setView(p.is_admin?"admin":"player");
    localStorage.setItem("hhb_session", JSON.stringify({playerId:p.id}));
    linkOneSignal(p.id);
    return true;
  };
  const handleLogout = ()=>{setCurrentUser(null);setView("login");setViewingDate(null);};
  const switchAccount = ()=>{localStorage.removeItem("hhb_session");setCurrentUser(null);setView("login");setViewingDate(null);};

  const reassignAllTeams = async(updatedPlayers) => {
    const newConfirmed = updatedPlayers.filter(pl=>pl.status==="in");
    const teamMap = assignTeams(newConfirmed);
    const finalPlayers = updatedPlayers.map(pl=>({...pl, team: teamMap[pl.id]||null}));
    setPlayers(finalPlayers);
    for(const pl of finalPlayers){
      await supabase.from("players").update({team: teamMap[pl.id]||null}).eq("id",pl.id);
    }
    return finalPlayers;
  };

  const togglePresence = async(playerId)=>{
    const p=players.find(pl=>pl.id===playerId); if(!p) return;
    let ns,na;
    if(p.status==="in"||p.status==="wait"){ns="out";na=null;}
    else if(confirmed.length<MAX_PLAYERS){ns="in";na=Date.now();}
    else{ns="wait";na=Date.now();showToast("Jogo cheio! ⏳","warn");}
    await supabase.from("players").update({status:ns,confirmed_at:na,paid:false}).eq("id",playerId);
    const updated = players.map(pl=>pl.id===playerId?{...pl,status:ns,confirmed_at:na,paid:false}:pl);
    const newConfirmedCount = updated.filter(pl=>pl.status==="in").length;

    await reassignAllTeams(updated);
  };
  const addGuest = async(guestName,invitedById)=>{
    if(!guestName.trim()) return;
    const inviter=players.find(p=>p.id===invitedById);
    if(!inviter||confirmed.length>=MAX_PLAYERS){showToast("Jogo cheio!","err");return;}
    const {data:inserted} = await supabase.from("players").insert({name:guestName.trim(),is_admin:false,password:null,paid:false,status:"in",is_guest:true,invited_by:inviter.name,invited_by_id:invitedById,confirmed_at:Date.now()}).select().single();
    if(inserted){
      const updated = [...players, inserted];
      await reassignAllTeams(updated);
    }
    showToast(`${guestName} adicionado! 🎉`);
  };
  const removeGuest    = async(id)=>{
    await supabase.from("players").delete().eq("id",id);
    const updated = players.filter(p=>p.id!==id);
    await reassignAllTeams(updated);
    showToast("Convidado removido");
  };
  const togglePaid     = async(id)=>{const p=players.find(pl=>pl.id===id);setPlayers(prev=>prev.map(pl=>pl.id===id?{...pl,paid:!p.paid}:pl));await supabase.from("players").update({paid:!p.paid}).eq("id",id);showToast("Pagamento atualizado ✓");};
  const removePlayer   = async(id)=>{setPlayers(prev=>prev.filter(p=>p.id!==id));await supabase.from("players").delete().eq("id",id);showToast("Jogador removido");};
  const changePassword = async(id,pw)=>{await supabase.from("players").update({password:pw}).eq("id",id);};
  const addPlayer      = async(name,username,password,phone)=>{
    if(!name.trim()||!username.trim()||!password.trim()) return;
    const color=AVATAR_COLORS[Math.floor(Math.random()*AVATAR_COLORS.length)];
    const cleanUsername=username.trim().toLowerCase().replace(/\s+/g,"");
    if(players.find(p=>p.username?.toLowerCase()===cleanUsername)){showToast("Esse utilizador já existe!","err");return;}
    setPlayers(prev=>[...prev,{id:Date.now(),name:name.trim(),username:cleanUsername,phone:phone?.trim()||null,is_admin:false,password:password.trim(),paid:false,status:"out",is_guest:false,invited_by:null,invited_by_id:null,confirmed_at:null,avatar_color:color,position:"Polivalente",total_games:0,total_paid:0}]);
    await supabase.from("players").insert({name:name.trim(),username:cleanUsername,phone:phone?.trim()||null,is_admin:false,password:password.trim(),paid:false,status:"out",is_guest:false,invited_by:null,invited_by_id:null,confirmed_at:null,avatar_color:color});
    showToast(`${name} adicionado! 🎉`);
  };
  const updateGameInfo = async(patch)=>{setGameInfo(prev=>({...prev,...patch}));await supabase.from("game_info").update(patch).eq("id",1);showToast("Jogo atualizado ✓");};
  const updateProfile  = async(id,newName,newPassword,newColor,newPhone)=>{
    const updates={};
    if(newName?.trim()) updates.name=newName.trim();
    if(newPassword?.trim()) updates.password=newPassword.trim();
    if(newColor) updates.avatar_color=newColor;
    if(newPhone!==undefined) updates.phone=newPhone?.trim()||null;
    if(Object.keys(updates).length===0) return;
    setPlayers(prev=>prev.map(p=>p.id===id?{...p,...updates}:p));
    await supabase.from("players").update(updates).eq("id",id);
    showToast("Perfil atualizado ✓");
  };
  const updatePosition = async(id, pos) => {
    await supabase.from("players").update({position: pos}).eq("id", id);
    const updated = players.map(p=>p.id===id?{...p,position:pos}:p);
    await reassignAllTeams(updated);
    showToast("Posição atualizada ✓");
  };
  const sendPushNotification = async(title, message) => {
    try {
      await supabase.functions.invoke("send-notification", {
        body: { title, message, url: "https://hojehajogo.pt" }
      });
    } catch(e) { console.log("Push notification error:", e); }
  };

  const resetGame = async(winnerTeam)=>{
    const paidCount=confirmed.filter(p=>p.paid).length;
    const gameCost=gameInfo.cost_per_player||COST;
    const collected=paidCount*gameCost;
    const unpaidMembers=confirmed.filter(p=>!p.paid&&!p.is_guest);
    for(const p of unpaidMembers){
      await supabase.from("debts").insert({player_id:p.id,player_name:p.name,amount:gameCost,description:`Jogo de ${gameInfo.date}`});
    }
    // Save attendance
    const confirmedMembers=confirmed.filter(p=>!p.is_guest);
    for(const p of confirmedMembers){
      await supabase.from("game_attendance").insert({game_date:gameInfo.date,player_id:p.id,player_name:p.name});
    }
    // Update stats + streaks
    for(const p of confirmedMembers){
      const pl=players.find(m=>m.id===p.id);
      if(pl){
        const newStreak=(pl.current_streak||0)+1;
        const newBest=Math.max(pl.best_streak||0,newStreak);
        await supabase.from("players").update({
          total_games:(pl.total_games||0)+1,
          total_paid:(pl.total_paid||0)+(p.paid?gameCost:0),
          current_streak:newStreak,
          best_streak:newBest
        }).eq("id",p.id);
      }
    }
    // Reset streak for members who did NOT play
    const didNotPlay=members.filter(m=>!confirmedMembers.find(c=>c.id===m.id));
    for(const p of didNotPlay){
      await supabase.from("players").update({current_streak:0}).eq("id",p.id);
    }
    // get mvp
    const votes=mvpVotes.filter(v=>v.game_date===gameInfo.date);
    let mvpName=null;
    if(votes.length>0){
      const counts={};
      votes.forEach(v=>{counts[v.voted_for_id]=(counts[v.voted_for_id]||0)+1;});
      const topId=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
      const mvpPlayer=players.find(p=>p.id===Number(topId));
      mvpName=mvpPlayer?.name||null;
    }
    if(collected>0||confirmed.length>0){
      await supabase.from("game_history").insert({date:gameInfo.date,players_count:confirmed.length,collected,winner_team:winnerTeam||null,mvp_name:mvpName});
    }
    await supabase.from("players").delete().eq("is_guest",true);
    await supabase.from("players").update({status:"out",paid:false,confirmed_at:null,team:null}).eq("is_guest",false);
    showToast("Jogo fechado ✓");
  };
  const addDebt  = async(playerId,playerName,amount,desc)=>{await supabase.from("debts").insert({player_id:playerId,player_name:playerName,amount,description:desc});showToast("Dívida registada ✓");};
  const payDebt  = async(debtId,amountPaid=null)=>{
    const debt=debts.find(d=>d.id===debtId);
    if(!debt) return;
    const full = amountPaid===null || amountPaid>=Number(debt.amount);
    const paidNow = full ? Number(debt.amount) : Number(amountPaid);
    // Register as income in history (special entry, players_count=0 marks it as a debt payment)
    await supabase.from("game_history").insert({date:gameInfo.date,players_count:0,collected:paidNow,winner_team:null,mvp_name:null});
    if(full){
      await supabase.from("debts").delete().eq("id",debtId);
      showToast("Dívida paga ✓");
    } else {
      const remaining = Number(debt.amount)-Number(amountPaid);
      await supabase.from("debts").update({amount:remaining}).eq("id",debtId);
      showToast(`Pagamento parcial registado — restam ${remaining}€`);
    }
  };
  const clearAllHistory = async()=>{
    await supabase.from("game_history").delete().neq("id",0);
    await supabase.from("debts").delete().neq("id",0);
    showToast("Histórico e dívidas limpos ✓");
  };
  const sendMessage = async(text,playerId,playerName)=>{
    if(!text.trim()) return;
    const tempMsg={id:Date.now(),player_id:playerId,player_name:playerName,message:text.trim(),created_at:new Date().toISOString()};
    setMessages(prev=>[...prev,tempMsg]);
    await supabase.from("chat_messages").insert({player_id:playerId,player_name:playerName,message:text.trim()});
  };
  const voteForMvp = async(voterId,votedForId)=>{
    setMvpVotes(prev=>{
      const filtered=prev.filter(v=>!(v.voter_id===voterId&&v.game_date===gameInfo.date));
      return [...filtered,{id:Date.now(),voter_id:voterId,voted_for_id:votedForId,game_date:gameInfo.date}];
    });
    await supabase.from("mvp_votes").upsert({voter_id:voterId,voted_for_id:votedForId,game_date:gameInfo.date},{onConflict:"voter_id,game_date"});
    showToast("Voto registado ✓");
  };

  const liveUser = currentUser ? players.find(p=>p.id===currentUser.id) : null;
  const effectiveCost = gameInfo.cost_per_player||COST;
  const shared = {gameInfo,cdStr,confirmed,waiting,notYet,guests,spotsLeft,members,players,history,piggybank,debts,messages,mvpVotes,attendance,viewingDate,setViewingDate,historyGame,isViewingHistory,effectiveDate,darkMode,setDarkMode,effectiveCost};

  if(loading) return (
    <div style={{minHeight:"100vh",background:"#166534",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
      <style>{getCss(false)}</style>
      <div style={{fontSize:48}}>⚽</div>
      <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:"white",letterSpacing:2}}>HOJE HÁ BOLA</div>
      <div className="spinner"/>
    </div>
  );

  const dm = darkMode;
  return (
    <div style={{background:dm?"#0a0f0a":"#0d1a0e",minHeight:"100vh"}}>
      <style>{getCss(dm)}</style>
      {toast&&<div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      {view==="login"   && <LoginView   {...shared} onLogin={handleLogin} showToast={showToast}/>}
      {view==="player"  && liveUser && <PlayerView  {...shared} player={liveUser} onToggle={()=>togglePresence(liveUser.id)} onAddGuest={n=>addGuest(n,liveUser.id)} onRemoveGuest={removeGuest} onUpdateProfile={(name,pw,color,phone)=>updateProfile(liveUser.id,name,pw,color,phone)} onVoteMvp={(vid)=>voteForMvp(liveUser.id,vid)} onSendMessage={(t)=>sendMessage(t,liveUser.id,liveUser.name)} onUpdatePosition={(pos)=>updatePosition(liveUser.id,pos)} onLogout={switchAccount} setView={setView}/>}
      {view==="admin"   && liveUser && <AdminView   {...shared} currentUser={liveUser} adminTab={adminTab} setAdminTab={setAdminTab} onTogglePaid={togglePaid} onRemovePlayer={removePlayer} onAddPlayer={addPlayer} onChangePassword={changePassword} onResetGame={resetGame} onTogglePresence={togglePresence} onAddGuest={n=>addGuest(n,liveUser.id)} onRemoveGuest={removeGuest} onUpdateGameInfo={updateGameInfo} onUpdateProfile={(name,pw,color,phone)=>updateProfile(liveUser.id,name,pw,color,phone)} onAddDebt={addDebt} onPayDebt={payDebt} onClearHistory={clearAllHistory} onSendPush={sendPushNotification} onReassignTeams={reassignAllTeams} onSendMessage={(t)=>sendMessage(t,liveUser.id,liveUser.name)} onVoteMvp={(vid)=>voteForMvp(liveUser.id,vid)} onLogout={switchAccount} showToast={showToast} setView={setView}/>}
      {view==="debts"   && liveUser && <DebtsView {...shared} player={liveUser} onBack={()=>setView(liveUser.is_admin?"admin":"player")}/> }
      {view==="stats"   && liveUser && <StatsView   {...shared} player={liveUser} onBack={()=>setView(liveUser.is_admin?"admin":"player")}/>}
      {view==="chat"    && liveUser && <ChatView    {...shared} player={liveUser} onSendMessage={(t)=>sendMessage(t,liveUser.id,liveUser.name)} onBack={()=>setView(liveUser.is_admin?"admin":"player")}/>}
      {view==="profile" && liveUser && <ProfileView {...shared} player={liveUser} onUpdateProfile={(name,pw,color,phone)=>updateProfile(liveUser.id,name,pw,color,phone)} onBack={()=>setView(liveUser.is_admin?"admin":"player")} onLogout={handleLogout} onSwitchAccount={switchAccount}/>}
    </div>
  );
}

// ── DEBT ROW (with partial payment) ──────────────────────────────────────────
function DebtRow({debt, onPayDebt}) {
  const [showPartial, setShowPartial] = useState(false);
  const [amount, setAmount] = useState("");

  return (
    <div style={{background:"#1a1410",borderRadius:8,padding:"8px 10px",marginBottom:5,border:"1px solid #92400e"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:12,color:"#6b7280"}}>{debt.description} · <strong style={{color:"#dc2626"}}>{debt.amount}€</strong></span>
        <div style={{display:"flex",gap:6}}>
          <div style={{background:"rgba(239,68,68,0.15)",borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:800,color:"#f87171"}}>💸 Em dívida</div>
          <button style={{background:"#16a34a",border:"none",borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:800,color:"white",cursor:"pointer"}} onClick={()=>onPayDebt(debt.id)}>✓ Recebido</button>
        </div>
      </div>
      {!showPartial ? (
        <button onClick={()=>setShowPartial(true)} style={{background:"none",border:"none",color:"#fbbf24",fontSize:10,fontWeight:600,cursor:"pointer",marginTop:4,padding:0}}>
          Pagamento parcial?
        </button>
      ) : (
        <div style={{display:"flex",gap:6,marginTop:6}}>
          <input className="text-input" type="number" placeholder="Valor recebido..." value={amount} onChange={e=>setAmount(e.target.value)} style={{fontSize:12,padding:"6px 10px"}}/>
          <button style={{background:"#d97706",border:"none",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:800,color:"white",cursor:"pointer",flexShrink:0}} onClick={()=>{
            if(amount&&Number(amount)>0){onPayDebt(debt.id,Number(amount));setShowPartial(false);setAmount("");}
          }}>OK</button>
        </div>
      )}
    </div>
  );
}

// ── EXPANDABLE RANKING ───────────────────────────────────────────────────────
function ExpandableRanking({ranked=[], mvpCounts={}, totalGames=0, currentPlayer, darkMode}) {
  const [expandedId, setExpandedId] = useState(null);
  const dm = darkMode;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
      {ranked.map((p,i)=>{
        const isOpen = expandedId === p.id;
        const isMe = p.id === currentPlayer?.id;
        const pctBar = ranked[0].total_games>0 ? Math.round(((p.total_games||0)/(ranked[0].total_games||1))*100) : 0;
        const mvps = mvpCounts[p.name]||0;
        const pPct = totalGames>0 ? Math.round(((p.total_games||0)/totalGames)*100) : 0;
        const medal = i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}`;

        return (
          <div key={p.id} style={{background:isMe?"#16241c":"#13201a",border:isMe?"2px solid #16a34a":"1px solid #23362a",borderRadius:12,overflow:"hidden",transition:"all 0.2s"}}>
            {/* Closed row */}
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",cursor:"pointer"}} onClick={()=>setExpandedId(isOpen?null:p.id)}>
              <span style={{fontSize:12,fontWeight:800,color:i===0?"#fbbf24":i===1?"#cbd5e1":i===2?"#d97706":"#6b7d70",width:18,flexShrink:0}}>{medal}</span>
              <Avatar player={p} size={28}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:"white"}}>{p.name}{isMe?" (tu)":""}</div>
                <div style={{fontSize:10,color:"#8ba593",display:"flex",gap:8,marginTop:2}}>
                  <span>⚽ {p.total_games||0}</span>
                  {mvps>0&&<span>⭐ {mvps}</span>}
                  <span>📈 {pPct}%</span>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                {(p.current_streak||0)>1&&<span style={{fontSize:10,color:"#f87171",fontWeight:700}}>🔥{p.current_streak}</span>}
                <span style={{fontSize:11,color:"#8ba593"}}>{isOpen?"▲":"▼"}</span>
              </div>
            </div>

            {/* Progress bar always visible */}
            <div style={{height:3,background:"#1a2218",margin:"0 12px 8px 50px",borderRadius:99,overflow:"hidden"}}>
              <div style={{width:`${pctBar}%`,height:"100%",background:"linear-gradient(90deg,#16a34a,#d4af37)",borderRadius:99}}/>
            </div>

            {/* Expanded content */}
            {isOpen&&(
              <div style={{padding:"0 12px 12px 50px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[
                  {label:"🔥 Série Atual", value:`${p.current_streak||0} jogos`},
                  {label:"🏆 Melhor Série", value:`${p.best_streak||0} jogos`},
                  {label:"💰 Total Pago", value:`${p.total_paid||0}€`},
                  {label:"🧤 Posição", value:p.position==="GR"?"Guarda-Redes":"Polivalente"},
                  {label:"⭐ MVPs", value:`${mvps} vez${mvps!==1?"es":"ez"}`},
                  {label:"📈 Presença", value:`${pPct}%`},
                ].map((s,si)=>(
                  <div key={si} style={{background:"#0a1a0a",borderRadius:8,padding:"8px 10px"}}>
                    <div style={{fontSize:10,color:"#6b7280",marginBottom:2}}>{s.label}</div>
                    <div style={{fontSize:13,fontWeight:800,color:"white"}}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── HALL OF FAME MVP ─────────────────────────────────────────────────────────
function HallOfFameMVP({history=[], members=[]}) {
  // All-time MVP counts
  const allTime={};
  history.forEach(g=>{if(g.mvp_name) allTime[g.mvp_name]=(allTime[g.mvp_name]||0)+1;});
  const ranked=Object.entries(allTime).sort((a,b)=>b[1]-a[1]);

  // MVP atual (último jogo com mvp)
  const lastMvp=history.find(g=>g.mvp_name);

  // MVP do ano
  const thisYear=new Date().getFullYear().toString();
  const yearCounts={};
  history.filter(g=>g.date?.startsWith(thisYear)).forEach(g=>{if(g.mvp_name) yearCounts[g.mvp_name]=(yearCounts[g.mvp_name]||0)+1;});
  const mvpAno=Object.entries(yearCounts).sort((a,b)=>b[1]-a[1])[0];

  if(ranked.length===0) return null;

  return (
    <div style={{marginBottom:14}}>
      <p className="section-label">🏆 HALL OF FAME MVP</p>

      {/* Top 3 destaques */}
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        {lastMvp&&(
          <div style={{flex:1,background:"rgba(217,119,6,0.15)",borderRadius:12,padding:"10px 12px",border:"1px solid #d97706"}}>
            <div style={{fontSize:9,fontWeight:800,color:"#d97706",letterSpacing:1,marginBottom:4}}>👑 MVP ATUAL</div>
            <div style={{fontSize:14,fontWeight:800,color:"#fbbf24"}}>{lastMvp.mvp_name}</div>
            <div style={{fontSize:10,color:"#fcd34d"}}>{lastMvp.date}</div>
          </div>
        )}
        {mvpAno&&(
          <div style={{flex:1,background:"#dbeafe",borderRadius:12,padding:"10px 12px",border:"1px solid #2563eb"}}>
            <div style={{fontSize:9,fontWeight:800,color:"#2563eb",letterSpacing:1,marginBottom:4}}>📅 MVP DO ANO</div>
            <div style={{fontSize:14,fontWeight:800,color:"#1e3a8a"}}>{mvpAno[0]}</div>
            <div style={{fontSize:10,color:"#1d4ed8"}}>{mvpAno[1]} vez{mvpAno[1]!==1?"es":""}</div>
          </div>
        )}
      </div>

      {/* Ranking completo */}
      <div style={{background:"#16241c",borderRadius:14,border:"1px solid #23362a",overflow:"hidden"}}>
        {ranked.map(([name,count],i)=>{
          const pl=members.find(m=>m.name===name);
          const max=ranked[0][1];
          return (
            <div key={name} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:i<ranked.length-1?"1px solid #f0fdf4":"none"}}>
              <span style={{fontSize:14,width:20,flexShrink:0}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}`}</span>
              {pl?<Avatar player={pl} size={28}/>:<div style={{width:28,height:28,borderRadius:"50%",background:"#d1fae5",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:"#16a34a"}}>{name[0]}</div>}
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:"white"}}>{name}</div>
                <div style={{height:4,background:"#f0fdf4",borderRadius:99,marginTop:4,overflow:"hidden"}}>
                  <div style={{width:`${(count/max)*100}%`,height:"100%",background:"linear-gradient(90deg,#d97706,#fbbf24)",borderRadius:99}}/>
                </div>
              </div>
              <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:22,color:"#d97706",flexShrink:0}}>{count}⭐</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── ROTATING HIGHLIGHTS ──────────────────────────────────────────────────────
function RotatingHighlights({members, history, mvpVotes, confirmed, gameInfo}) {
  const [idx, setIdx] = useState(0);

  const highlights = [];

  // MVP atual (jogo mais recente)
  if(history.length > 0 && history[0].mvp_name) {
    highlights.push({icon:"⭐", text:`${history[0].mvp_name} foi o MVP do último jogo!`});
  }

  // Equipa vencedora último jogo
  if(history.length > 0 && history[0].winner_team) {
    highlights.push({icon:"🏆", text:`Equipa ${history[0].winner_team} venceu o último jogo!`});
  }

  // Jogador com mais jogos (streak)
  const topPlayer = [...members].sort((a,b)=>(b.total_games||0)-(a.total_games||0))[0];
  if(topPlayer && topPlayer.total_games > 0) {
    highlights.push({icon:"👑", text:`${topPlayer.name} lidera com ${topPlayer.total_games} jogos!`});
  }

  // Faltam X para lotação
  const faltam = 15 - confirmed.length;
  if(faltam > 0 && faltam <= 5 && confirmed.length >= 8) {
    highlights.push({icon:"🎯", text:`Faltam apenas ${faltam} jogador${faltam!==1?"es":""} para lotação máxima!`});
  }

  // MVP mais votado hoje
  const votesHoje = mvpVotes.filter(v=>v.game_date===gameInfo.date);
  if(votesHoje.length > 0) {
    const counts={};
    votesHoje.forEach(v=>{counts[v.voted_for_id]=(counts[v.voted_for_id]||0)+1;});
    const topId = Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
    const topMvp = members.find(p=>p.id===Number(topId));
    if(topMvp) highlights.push({icon:"⭐", text:`${topMvp.name} está a liderar a votação MVP desta semana!`});
  }

  useEffect(()=>{
    if(highlights.length <= 1) return;
    const t = setInterval(()=>setIdx(i=>(i+1)%highlights.length), 4000);
    return ()=>clearInterval(t);
  }, [highlights.length]);

  if(highlights.length === 0) return null;
  const h = highlights[idx % highlights.length];

  return (
    <div style={{background:"linear-gradient(135deg,#166534,#15803d)",borderRadius:14,padding:"12px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:12,minHeight:52,transition:"all 0.3s"}}>
      <span style={{fontSize:22,flexShrink:0}}>{h.icon}</span>
      <span style={{fontSize:13,fontWeight:700,color:"white",flex:1}}>{h.text}</span>
      {highlights.length > 1 && (
        <div style={{display:"flex",gap:4,flexShrink:0}}>
          {highlights.map((_,i)=>(
            <div key={i} style={{width:6,height:6,borderRadius:"50%",background:i===idx%highlights.length?"white":"rgba(255,255,255,0.3)"}}/>
          ))}
        </div>
      )}
    </div>
  );
}

// ── DASHBOARD CARDS ──────────────────────────────────────────────────────────
function GroupStatusCard({confirmed, notYet, members, players=[]}) {
  const grs = confirmed.filter(p => {
    const pl = players.find(pl => pl.id === p.id);
    return pl?.position === "GR";
  });
  const hasEnoughGRs = grs.length >= 2;
  const isFull = confirmed.length >= 15;
  const almostFull = confirmed.length >= 12 && confirmed.length < 15;
  const teamsReady = confirmed.length >= 10 && hasEnoughGRs;

  let messages = [];

  if (isFull) messages.push({ icon: "🎉", text: "Jogo completo! Estamos todos!", color: "#16a34a", bg: "#dcfce7" });
  else if (almostFull) messages.push({ icon: "🔥", text: `Lotação quase completa — só faltam ${15 - confirmed.length}!`, color: "#d97706", bg: "#fef3c7" });
  if (!hasEnoughGRs && confirmed.length >= 6) messages.push({ icon: "⚠️", text: `Faltam guarda-redes! Só ${grs.length} GR confirmado${grs.length !== 1 ? "s" : ""}`, color: "#dc2626", bg: "#fee2e2" });
  if (teamsReady && !isFull) messages.push({ icon: "✅", text: "Equipas prontas para jogar!", color: "#16a34a", bg: "#dcfce7" });
  if (notYet.length > 0) messages.push({ icon: "📢", text: `${notYet.length} jogador${notYet.length !== 1 ? "es" : ""} ainda não ${notYet.length !== 1 ? "responderam" : "respondeu"}`, color: "#6b7280", bg: "#f1f5f9" });
  if (confirmed.length < 6) messages.push({ icon: "😴", text: "Ainda poucos confirmados — partilha com o grupo!", color: "#7c3aed", bg: "#ede9fe" });

  if (messages.length === 0) return null;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
      {messages.map((m, i) => (
        <div key={i} style={{background:m.bg,borderRadius:12,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,border:`1px solid ${m.color}22`}}>
          <span style={{fontSize:18}}>{m.icon}</span>
          <span style={{fontSize:13,fontWeight:700,color:m.color}}>{m.text}</span>
        </div>
      ))}
    </div>
  );
}

// ── EXPANDABLE LIST ──────────────────────────────────────────────────────────
function ExpandableList({confirmed}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{marginTop:4}}>
      <button onClick={()=>setOpen(v=>!v)} style={{background:"rgba(0,0,0,0.2)",border:"none",borderRadius:20,padding:"3px 10px",color:"rgba(255,255,255,0.9)",fontSize:10,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
        ✓ {confirmed.length} confirmados {open?"▲":"▼"}
      </button>
      {open&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:6}}>
          {confirmed.map(p=>(
            <span key={p.id} style={{background:p.is_guest?"rgba(124,58,237,0.3)":"rgba(0,0,0,0.25)",borderRadius:20,padding:"2px 7px",fontSize:10,color:p.is_guest?"#c4b5fd":"rgba(255,255,255,0.85)",fontWeight:600}}>
              {p.name}{p.is_guest?" 👤":""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── FIELD HEADER ─────────────────────────────────────────────────────────────
function FieldHeader({gameInfo,cdStr,confirmed,notYet,waiting,viewingDate,setViewingDate,historyGame,isViewingHistory,effectiveDate,darkMode,setDarkMode,extraRight,isLoggedIn=true}) {
  const pct=Math.round((confirmed.length/MAX_PLAYERS)*100);
  const canFwd=viewingDate&&viewingDate<gameInfo.date;
  return (
    <div className="field-header">
      <div className="field-lines"><div className="fl fl-cc"/><div className="fl fl-cl"/><div className="fl fl-lb"/><div className="fl fl-rb"/></div>
      <div className="field-content">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
          <div className="field-badge"><span style={{fontSize:16}}>⚽</span><span className="field-badge-name">{gameInfo.app_name||"Hoje Há Bola"}</span></div>
          <div style={{display:"flex",gap:4,alignItems:"center"}}>
            <button className="field-nav-btn" onClick={()=>setViewingDate(prevWeek(effectiveDate))}><Icon name="left" size={13}/></button>
            {isViewingHistory&&<button className="field-nav-btn" style={{fontSize:10,padding:"3px 8px",fontWeight:800}} onClick={()=>setViewingDate(null)}>HOJE</button>}
            {canFwd&&<button className="field-nav-btn" onClick={()=>setViewingDate(nextWeek(viewingDate))}><Icon name="right" size={13}/></button>}
            <button className="field-nav-btn" onClick={()=>setDarkMode(v=>!v)}><Icon name={darkMode?"sun":"moon"} size={13}/></button>
            {extraRight}
          </div>
        </div>
        {isViewingHistory?(
          <div style={{background:"rgba(0,0,0,0.3)",borderRadius:10,padding:"10px 12px",marginBottom:4}}>
            <div style={{fontSize:11,color:"#bbf7d0",fontWeight:700,marginBottom:6}}>📅 {formatDisplayDate(effectiveDate).toUpperCase()}</div>
            {historyGame?(
              <div>
                <div style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:8}}>
                  <div><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:"#4ade80"}}>{historyGame.players_count}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",letterSpacing:1}}>JOGADORES</div></div>
                  <div><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:"#fbbf24"}}>{historyGame.collected}€</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",letterSpacing:1}}>RECEBIDO</div></div>
                  {historyGame.winner_team&&<div><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:"#60a5fa"}}>{historyGame.winner_team}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",letterSpacing:1}}>VENCEDOR</div></div>}
                  {historyGame.mvp_name&&<div><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:"#f472b6"}}>{historyGame.mvp_name}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",letterSpacing:1}}>MVP ⭐</div></div>}
                </div>
                {attendance&&attendance.filter(a=>a.game_date===effectiveDate).length>0&&(
                  <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                    {attendance.filter(a=>a.game_date===effectiveDate).map((a,i)=>(
                      <span key={i} style={{background:"rgba(255,255,255,0.1)",borderRadius:20,padding:"2px 8px",fontSize:10,color:"rgba(255,255,255,0.7)",fontWeight:600}}>{a.player_name}</span>
                    ))}
                  </div>
                )}
              </div>
            ):<div style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>Sem registo para esta semana</div>}
          </div>
        ):(
          <>
            <div className="field-date">{formatDisplayDate(gameInfo.date)}</div>
            <div className="field-timeloc">
              <span className="field-chip"><Icon name="clock" size={10}/> {gameInfo.time}</span>
              <span className="field-chip"><Icon name="pin" size={10}/> {gameInfo.location}</span>
            </div>
            <div style={{marginBottom:6}}><span className="field-cd">{cdStr}</span></div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
              <div className="score-block"><span className="score-num green">{confirmed.length}</span><span className="score-label">CONF.</span></div>
              <div className="score-sep">/</div>
              <div className="score-block"><span className="score-num white">{MAX_PLAYERS}</span><span className="score-label">MÁXIMO</span></div>
              {notYet&&notYet.length>0&&<><div className="score-sep" style={{fontSize:16}}>·</div><div className="score-block"><span className="score-num" style={{fontSize:30,color:"#fbbf24"}}>{notYet.length}</span><span className="score-label">SEM RESP.</span></div></>}
            </div>
            <div className="pct-bar"><div className="pct-fill" style={{width:`${pct}%`}}/></div>
            <div className="pct-row" style={{marginBottom:confirmed.length>0?6:0}}>
              <span className="pct-label green">✓ {confirmed.length}</span>
              {notYet&&notYet.length>0&&<span className="pct-label muted">? {notYet.length}</span>}
              {waiting.length>0&&<span className="pct-label yellow">⏳ {waiting.length}</span>}
            </div>
            {confirmed.length>0&&isLoggedIn&&<ExpandableList confirmed={confirmed}/>}
          </>
        )}
      </div>
    </div>
  );
}

// ── LOGIN ────────────────────────────────────────────────────────────────────
function LoginView({gameInfo,cdStr,confirmed,notYet,waiting,members,viewingDate,setViewingDate,historyGame,isViewingHistory,effectiveDate,darkMode,setDarkMode,onLogin,showToast}) {
  const [username,setUsername]=useState("");
  const [password,setPassword]=useState("");
  const [showPw,setShowPw]=useState(false);
  const [loading,setLoading]=useState(false);
  const [showSuggestions,setShowSuggestions]=useState(false);

  const suggestions = username.trim().length>0
    ? members.filter(p=>p.username?.toLowerCase().startsWith(username.trim().toLowerCase())).slice(0,5)
    : [];

  const handleSubmit=async()=>{
    if(!username.trim()||!password.trim()) return;
    setLoading(true);
    const ok=await onLogin(username,password);
    setLoading(false);
    if(!ok){showToast("Utilizador, telemóvel ou password incorretos!","err");setPassword("");}
  };
  return (
    <div className="screen">
      <FieldHeader {...{gameInfo,cdStr,confirmed,notYet,waiting,viewingDate,setViewingDate,historyGame,isViewingHistory,effectiveDate,darkMode,setDarkMode}} isLoggedIn={false}/>
      <div className="body">
        {!isViewingHistory&&<>
          <div className="pw-box" style={{marginTop:20}}>
            <p className="pw-label" style={{textAlign:"center",marginBottom:4}}>Inicia sessão para continuar</p>
            <label className="field-label">Utilizador ou telemóvel</label>
            <div style={{position:"relative"}}>
              <input className="pw-input" placeholder="O teu utilizador ou nº..." value={username}
                onChange={e=>{setUsername(e.target.value);setShowSuggestions(true);}}
                onFocus={()=>setShowSuggestions(true)}
                onBlur={()=>setTimeout(()=>setShowSuggestions(false),150)}
                onKeyDown={e=>e.key==="Enter"&&handleSubmit()} autoCapitalize="none" autoFocus/>
              {showSuggestions&&suggestions.length>0&&(
                <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#16241c",border:"2px solid #23362a",borderRadius:10,marginTop:4,zIndex:10,overflow:"hidden",boxShadow:"0 8px 24px rgba(0,0,0,0.4)"}}>
                  {suggestions.map(p=>(
                    <button key={p.id} onClick={()=>{setUsername(p.username);setShowSuggestions(false);}}
                      style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 12px",background:"#16241c",border:"none",borderBottom:"1px solid #23362a",cursor:"pointer",textAlign:"left"}}>
                      <Avatar player={p} size={26}/>
                      <div>
                        <div style={{fontSize:13,fontWeight:700,color:"white"}}>{p.name}</div>
                        <div style={{fontSize:11,color:"#6b7280"}}>@{p.username}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <label className="field-label" style={{marginTop:4}}>Password</label>
            <div className="pw-row">
              <input className="pw-input" type={showPw?"text":"password"} placeholder="••••••" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit()}/>
              <button className="icon-ghost" onClick={()=>setShowPw(v=>!v)}><Icon name={showPw?"eyeoff":"eye"} size={16}/></button>
            </div>
            <button className="btn-primary" style={{justifyContent:"center",marginTop:4}} onClick={handleSubmit} disabled={loading}>
              {loading?"A entrar...":"ENTRAR →"}
            </button>
          </div>
        </>}
        {isViewingHistory&&<div style={{textAlign:"center",paddingTop:20}}><p style={{color:"#6b7280",fontSize:13}}>A ver histórico — <button style={{background:"none",border:"none",color:"#16a34a",fontWeight:700,cursor:"pointer"}} onClick={()=>setViewingDate(null)}>voltar ao atual</button></p></div>}
      </div>
    </div>
  );
}

// ── BOTTOM NAV ───────────────────────────────────────────────────────────────
function BottomNav({view, setView, isAdmin, hasDebts, unreadChat}) {
  const items = isAdmin ? [
    {key:"admin", icon:"⚽", label:"Jogo"},
    {key:"equipas_tab", icon:"🎲", label:"Equipas"},
    {key:"debts", icon:"💸", label:"Dívidas"},
    {key:"stats", icon:"📊", label:"Stats"},
    {key:"profile", icon:"👤", label:"Perfil"},
  ] : [
    {key:"player", icon:"⚽", label:"Jogo"},
    {key:"chat", icon:"💬", label:"Chat"},
    {key:"debts", icon:"💸", label:"Dívidas"},
    {key:"stats", icon:"📊", label:"Stats"},
    {key:"profile", icon:"👤", label:"Perfil"},
  ];

  const activeView = view;

  return (
    <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:"#0a0a0a",borderTop:"1px solid #1f2f1f",display:"flex",zIndex:100,paddingBottom:"env(safe-area-inset-bottom)"}}>
      {items.map(item=>{
        const isActive = activeView===item.key || (item.key==="admin" && ["jogo","dividas_admin"].includes(activeView));
        return (
          <button key={item.key} onClick={()=>setView(item.key)} style={{flex:1,padding:"8px 4px 10px",background:"transparent",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,position:"relative"}}>
            <span style={{fontSize:18}}>{item.icon}</span>
            <span style={{fontSize:9,fontWeight:700,color:isActive?"#d4af37":"#4b5563",letterSpacing:0.5}}>{item.label}</span>
            {isActive&&<div style={{position:"absolute",bottom:0,left:"25%",right:"25%",height:2,background:"#d4af37",borderRadius:99}}/>}
            {item.key==="debts"&&hasDebts&&<div style={{position:"absolute",top:6,right:"25%",width:7,height:7,background:"#dc2626",borderRadius:"50%"}}/>}
            {item.key==="chat"&&unreadChat&&<div style={{position:"absolute",top:6,right:"25%",width:7,height:7,background:"#dc2626",borderRadius:"50%"}}/>}
          </button>
        );
      })}
    </div>
  );
}

// ── EXPANDABLE CARD ──────────────────────────────────────────────────────────
function ExpandableCard({title, children, defaultOpen=false}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{background:"#16241c",border:"1px solid #23362a",borderRadius:14,marginBottom:10,overflow:"hidden"}}>
      <button onClick={()=>setOpen(v=>!v)} style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",background:"transparent",border:"none",cursor:"pointer",color:"white",fontFamily:"'DM Sans',sans-serif"}}>
        <span style={{fontSize:12,fontWeight:800,letterSpacing:1,color:"#8ba593"}}>{title}</span>
        <span style={{fontSize:14,color:"#4ade80",transition:"transform 0.2s",transform:open?"rotate(180deg)":"rotate(0deg)"}}>▼</span>
      </button>
      {open&&<div style={{padding:"0 14px 14px"}}>{children}</div>}
    </div>
  );
}

// ── TEAMS REVEAL (Phase 7 - animated) ────────────────────────────────────────
function TeamsReveal({confirmed, players=[], onReassign}) {
  const [phase, setPhase] = useState("idle");
  const [displayNames, setDisplayNames] = useState([]);
  const intervalRef = useRef(null);

  const allNames = confirmed.map(p=>p.name);

  const startReveal = () => {
    setPhase("animating");
    let ticks = 0;
    const maxTicks = 20;
    intervalRef.current = setInterval(()=>{
      const shuffled = [...allNames].sort(()=>Math.random()-0.5);
      setDisplayNames(shuffled.slice(0,4));
      ticks++;
      if(ticks >= maxTicks){
        clearInterval(intervalRef.current);
        // Only save to Supabase AFTER animation finishes
        if(onReassign) onReassign(confirmed);
        setPhase("revealed");
      }
    }, 100);
  };

  useEffect(()=>()=>clearInterval(intervalRef.current),[]);

  if(phase==="idle") return (
    <button onClick={startReveal} style={{width:"100%",padding:"14px",borderRadius:12,border:"2px solid #16a34a",background:"rgba(22,163,74,0.1)",color:"#4ade80",fontFamily:"'Bebas Neue',cursive",fontSize:16,letterSpacing:2,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
      🎲 REVELAR EQUIPAS
    </button>
  );

  if(phase==="animating") return (
    <div style={{background:"#0a1a0a",borderRadius:12,padding:"20px",textAlign:"center",border:"2px solid #16a34a"}}>
      <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:"#4ade80",marginBottom:12,letterSpacing:3}}>🎲 A SORTEAR...</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center"}}>
        {displayNames.map((name,i)=>(
          <span key={i} style={{background:"rgba(22,163,74,0.2)",borderRadius:20,padding:"4px 14px",fontSize:13,fontWeight:700,color:"#4ade80",border:"1px solid #16a34a"}}>
            {name}
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <AutoTeamsDisplay confirmed={confirmed} players={players}/>
      <button onClick={()=>setPhase("idle")} style={{width:"100%",marginTop:8,padding:"8px",borderRadius:10,border:"1px solid #23362a",background:"transparent",color:"#6b7280",fontSize:11,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
        🔄 Sortear novamente
      </button>
    </div>
  );
}

// ── AUTO TEAMS DISPLAY ───────────────────────────────────────────────────────
function AutoTeamsDisplay({confirmed, players=[]}) {
  if(!confirmed.length) return null;
  
  const teamNames = ["A","B","C"];
  const teamColors = TEAM_COLORS;
  
  // Group by team
  const groups = {};
  confirmed.forEach(p => {
    const pl = (players||[]).find(pl=>pl.id===p.id)||p;
    const team = pl.team || "SUB";
    if(!groups[team]) groups[team] = [];
    groups[team].push({...p, position: pl.position});
  });

  const activeTeams = teamNames.filter(t => groups[t]?.length > 0);
  const subs = groups["SUB"] || [];

  if(activeTeams.length === 0) return (
    <div style={{background:"#f0fdf4",borderRadius:12,padding:"12px",textAlign:"center",fontSize:13,color:"#6b7280"}}>
      As equipas formam-se automaticamente quando os jogadores confirmam presença.
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {activeTeams.map((teamName, ti) => {
        const color = teamColors[ti];
        const team = groups[teamName] || [];
        return (
          <div key={teamName} style={{background:color.bg,border:`2px solid ${color.border}`,borderRadius:12,padding:"10px 12px"}}>
            <div style={{fontSize:11,fontWeight:800,color:color.text,letterSpacing:1,marginBottom:8}}>
              EQUIPA {teamName}
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {team.map(p => (
                <div key={p.id} style={{display:"flex",alignItems:"center",gap:5,background:p.position==="GR"?"rgba(37,99,235,0.2)":"rgba(0,0,0,0.2)",borderRadius:20,padding:"4px 10px",fontSize:12,fontWeight:700,color:color.text,border:`1px solid ${p.position==="GR"?"#60a5fa":color.border}`}}>
                  <Avatar player={(players||[]).find(pl=>pl.id===p.id)||p} size={18}/>
                  {p.name}{p.position==="GR"&&<span style={{fontSize:11}}>🧤</span>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {subs.length > 0 && (
        <div style={{background:"rgba(255,255,255,0.05)",border:"1px dashed #4b5563",borderRadius:12,padding:"10px 12px"}}>
          <div style={{fontSize:11,fontWeight:800,color:"#64748b",letterSpacing:1,marginBottom:6}}>SUPLENTES</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {subs.map(p=>(
              <div key={p.id} style={{display:"flex",alignItems:"center",gap:5,background:"#1a1f1a",borderRadius:20,padding:"4px 10px",fontSize:12,fontWeight:700,color:"#9ca3af",border:"1px solid #2a332a"}}>
                <Avatar player={(players||[]).find(pl=>pl.id===p.id)||p} size={18}/>
                {p.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── TEAMS DISPLAY ────────────────────────────────────────────────────────────
function TeamsDisplay({teams=[],players=[],onVoteWinner,winnerTeam,setWinnerTeam}) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {teams.map((team,ti)=>{
        const color=TEAM_COLORS[ti];
        const main=team.slice(0,5), subs=team.slice(5);
        const isWinner=winnerTeam===color.name;
        return (
          <div key={ti} style={{background:color.bg,border:`2px solid ${isWinner?"#fbbf24":color.border}`,borderRadius:12,padding:"10px 12px",position:"relative"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:11,fontWeight:800,color:color.text,letterSpacing:1}}>{color.name} {isWinner&&"🏆"}</div>
              {onVoteWinner&&<button style={{background:isWinner?"#fbbf24":color.border,color:"white",border:"none",borderRadius:8,padding:"3px 10px",fontSize:10,fontWeight:800,cursor:"pointer"}} onClick={()=>{setWinnerTeam(isWinner?null:color.name);onVoteWinner&&onVoteWinner(color.name);}}>{isWinner?"✓ Vencedor":"Venceu"}</button>}
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {main.map(p=>{
                const pl=(players||[]).find(pl=>pl.id===p.id)||p;
                return (
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:5,background:pl.position==="GR"?"#eff6ff":"white",borderRadius:20,padding:"3px 10px",fontSize:12,fontWeight:700,color:color.text,border:`1px solid ${pl.position==="GR"?"#2563eb":color.border}`}}>
                    <Avatar player={pl} size={18}/>
                    {p.name}{pl.position==="GR"&&<span style={{fontSize:11}}>🧤</span>}
                  </div>
                );
              })}
            </div>
            {subs.length>0&&<div style={{marginTop:6,paddingTop:6,borderTop:`1px dashed ${color.border}`}}><div style={{fontSize:10,color:"#6b7280",fontWeight:700,marginBottom:4}}>SUPLENTES</div><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{subs.map(p=><span key={p.id} style={{fontSize:11,color:"#6b7280",background:"#f3f4f6",borderRadius:20,padding:"2px 8px"}}>{p.name}</span>)}</div></div>}
          </div>
        );
      })}
    </div>
  );
}

// ── MVP VOTE ─────────────────────────────────────────────────────────────────
function MvpVote({confirmed=[],mvpVotes=[],currentUserId,gameDate,onVote}) {
  const myVote=mvpVotes.find(v=>v.voter_id===currentUserId&&v.game_date===gameDate);
  const counts={};
  mvpVotes.filter(v=>v.game_date===gameDate).forEach(v=>{counts[v.voted_for_id]=(counts[v.voted_for_id]||0)+1;});
  const maxVotes=Math.max(...Object.values(counts),1);
  return (
    <div className="card-section" style={{marginBottom:14}}>
      <p className="section-label"><Icon name="star" size={12}/> MVP DA SEMANA</p>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {confirmed.filter(p=>!p.is_guest&&p.id!==currentUserId).map(p=>{
          const votes=counts[p.id]||0;
          const isVoted=myVote?.voted_for_id===p.id;
          return (
            <button key={p.id} onClick={()=>onVote(p.id)} style={{display:"flex",alignItems:"center",gap:10,background:isVoted?"rgba(217,119,6,0.15)":"#16241c",border:`2px solid ${isVoted?"#d97706":"#23362a"}`,borderRadius:10,padding:"8px 12px",cursor:"pointer",textAlign:"left",width:"100%"}}>
              <Avatar player={p} size={28}/>
              <span style={{flex:1,fontSize:13,fontWeight:700,color:"white"}}>{p.name}</span>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:60,height:6,background:"#f0fdf4",borderRadius:99,overflow:"hidden"}}>
                  <div style={{width:`${(votes/maxVotes)*100}%`,height:"100%",background:"#d97706",borderRadius:99}}/>
                </div>
                <span style={{fontSize:11,fontWeight:800,color:"#d97706",width:14}}>{votes}</span>
                {isVoted&&<span style={{fontSize:12}}>⭐</span>}
              </div>
            </button>
          );
        })}
      </div>
      {myVote&&<p style={{fontSize:11,color:"#6b7280",marginTop:8,textAlign:"center"}}>Votaste em {confirmed.find(p=>p.id===myVote.voted_for_id)?.name}</p>}
    </div>
  );
}

// ── PIGGYBANK ─────────────────────────────────────────────────────────────────
function PiggyBankCard({piggybank,history,cost=3}) {
  const totalReceived = history.reduce((s,g)=>s+(Number(g.collected)||0),0);
  const gamesPlayed = history.filter(g=>g.players_count>0).length;
  const totalRent = gamesPlayed * RENT;

  return (
    <div style={{marginTop:16}}>
      <p className="section-label"><Icon name="euro" size={12}/> MEALHEIRO DO GRUPO</p>
      <div style={{background:"linear-gradient(135deg,#0891b2,#0e7490)",borderRadius:16,padding:"18px",marginBottom:8,color:"white"}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:1,opacity:0.8,marginBottom:6}}>SALDO ATUAL</div>
        <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:42,lineHeight:1,color:piggybank>=0?"white":"#fecaca"}}>{piggybank>=0?"+":""}{piggybank}€</div>
        <div style={{display:"flex",gap:16,marginTop:14,paddingTop:14,borderTop:"1px solid rgba(255,255,255,0.2)"}}>
          <div>
            <div style={{fontSize:9,opacity:0.7,letterSpacing:0.5}}>TOTAL RECEBIDO</div>
            <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:"#86efac"}}>+{totalReceived}€</div>
          </div>
          <div>
            <div style={{fontSize:9,opacity:0.7,letterSpacing:0.5}}>PAGO EM ALUGUER</div>
            <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:"#fca5a5"}}>-{totalRent}€</div>
          </div>
          <div>
            <div style={{fontSize:9,opacity:0.7,letterSpacing:0.5}}>JOGOS PAGOS</div>
            <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:"white"}}>{gamesPlayed}</div>
          </div>
        </div>
      </div>
      <div style={{fontSize:11,color:"#6b7280",textAlign:"center"}}>Cada jogo desconta {RENT}€ do aluguer · {cost}€ por jogador</div>
    </div>
  );
}

// ── CONFIRMED LIST ───────────────────────────────────────────────────────────
function ConfirmedList({confirmed=[],onTogglePaid,isAdmin,debts=[],players=[],cost=3}) {
  if(!confirmed.length) return <p className="empty-msg">Ninguém confirmou ainda</p>;
  return (
    <div className="player-list">
      {confirmed.map((p,i)=>{
        const debt=debts.filter(d=>d.player_id===p.id).reduce((s,d)=>s+Number(d.amount),0);
        const pl=(players||[]).find(pl=>pl.id===p.id)||p;
        return (
          <div key={p.id} className={`list-row ${p.is_guest?"row-guest":""}`}>
            <span className="list-num">{i+1}</span>
            <Avatar player={pl} size={28}/>
            <div className="list-info">
              <span className="list-name">{p.name}</span>
              {p.is_guest&&<span className="guest-sub">convidado de {p.invited_by}</span>}
              {debt>0&&<span style={{fontSize:10,color:"#dc2626",fontWeight:700}}>⚠️ deve {debt}€ anteriores</span>}
            </div>
            {isAdmin
              ?<button className={`paid-btn ${p.paid?"paid-yes":"paid-no"}`} onClick={()=>onTogglePaid(p.id)}>{p.paid?<><Icon name="check" size={11}/> Pago</>:`Deve ${cost}€`}</button>
              :<span className={`paid-chip ${p.paid?"paid-yes":"paid-no"}`}>{p.paid?"Pago ✓":`Deve ${cost}€`}</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── DEBTS VIEW ───────────────────────────────────────────────────────────────
function DebtsView({debts=[], members=[], player, darkMode, onBack}) {
  const myDebts = debts.filter(d=>d.player_id===player.id);
  const myTotal = myDebts.reduce((s,d)=>s+Number(d.amount),0);
  const othersDebts = (members||[])
    .filter(m=>m.id!==player.id)
    .map(m=>({...m, total:debts.filter(d=>d.player_id===m.id).reduce((s,d)=>s+Number(d.amount),0)}))
    .filter(m=>m.total>0);

  return (
    <div className="screen">
      <div style={{background:"linear-gradient(160deg,#1a1a0a,#0a0a0a)",padding:"16px 16px 20px",borderBottom:"2px solid #d4af37"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button className="field-nav-btn" onClick={onBack}><Icon name="left" size={14}/></button>
          <span style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:"white",letterSpacing:2}}>DÍVIDAS</span>
        </div>
      </div>
      <div className="body">
        {/* My debts */}
        <p className="section-label"><Icon name="warn" size={12}/> AS MINHAS DÍVIDAS</p>
        {myTotal===0 ? (
          <div style={{background:"rgba(22,163,74,0.1)",border:"1px solid rgba(22,163,74,0.3)",borderRadius:12,padding:"16px",textAlign:"center",marginBottom:14}}>
            <div style={{fontSize:24,marginBottom:6}}>🎉</div>
            <div style={{fontSize:13,fontWeight:700,color:"#4ade80"}}>Não deves nada!</div>
          </div>
        ) : (
          <div style={{background:"rgba(239,68,68,0.1)",border:"2px solid #dc2626",borderRadius:14,padding:"14px",marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <span style={{fontSize:13,fontWeight:700,color:"white"}}>Total em dívida</span>
              <span style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:"#f87171"}}>{myTotal}€</span>
            </div>
            {myDebts.map(d=>(
              <div key={d.id} style={{background:"rgba(0,0,0,0.2)",borderRadius:8,padding:"8px 12px",marginBottom:6,display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:12,color:"#9ca3af"}}>{d.description}</span>
                <span style={{fontSize:12,fontWeight:700,color:"#f87171"}}>{d.amount}€</span>
              </div>
            ))}
          </div>
        )}

        {/* Others debts */}
        {othersDebts.length>0&&<>
          <p className="section-label" style={{marginTop:8}}><Icon name="people" size={12}/> DÍVIDAS DO GRUPO</p>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {othersDebts.map(m=>(
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,background:"#16241c",border:"1px solid #23362a",borderRadius:10,padding:"10px 14px"}}>
                <Avatar player={m} size={28}/>
                <span style={{flex:1,fontSize:13,fontWeight:700,color:"white"}}>{m.name}</span>
                <span style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:"#f87171"}}>{m.total}€</span>
              </div>
            ))}
          </div>
        </>}
        {othersDebts.length===0&&myTotal===0&&(
          <div style={{textAlign:"center",paddingTop:20,color:"#6b7280",fontSize:13}}>🎉 O grupo está quite!</div>
        )}
      </div>
    </div>
  );
}

// ── STATS VIEW ───────────────────────────────────────────────────────────────
function StatsView({members=[],history=[],debts=[],mvpVotes=[],piggybank=0,player,darkMode,onBack}) {
  const dm=darkMode;
  const [tab,setTab]=useState("pessoal");
  const [sortBy,setSortBy]=useState("games");
  const ranked=[...(members||[])].filter(p=>!p.is_guest).sort((a,b)=>{
    if(sortBy==="mvp") return (mvpCounts[b.name]||0)-(mvpCounts[a.name]||0);
    if(sortBy==="pct") return ((b.total_games||0)/Math.max(totalGames,1))-((a.total_games||0)/Math.max(totalGames,1));
    return (b.total_games||0)-(a.total_games||0);
  });
  const mvpCounts={};
  history.forEach(g=>{if(g.mvp_name)mvpCounts[g.mvp_name]=(mvpCounts[g.mvp_name]||0)+1;});
  const myDebt=(debts||[]).filter(d=>d.player_id===player.id).reduce((s,d)=>s+Number(d.amount),0);
  const totalGames=history.length;
  const myPct=totalGames>0?Math.round(((player.total_games||0)/totalGames)*100):0;
  const myMvps=mvpCounts[player.name]||0;

  const stats=[
    {icon:"⚽",label:"Jogos",value:player.total_games||0,color:"#16a34a"},
    {icon:"⭐",label:"MVPs",value:myMvps,color:"#d97706"},
    {icon:"📈",label:"Presença",value:`${myPct}%`,color:"#2563eb"},
    {icon:"🔥",label:"Série Atual",value:player.current_streak||0,color:"#dc2626"},
    {icon:"🏆",label:"Melhor Série",value:player.best_streak||0,color:"#7c3aed"},
    {icon:"💰",label:"Total Pago",value:`${player.total_paid||0}€`,color:"#0891b2"},
  ];

  return (
    <div className="screen">
      <div style={{background:"#166534",padding:"16px 16px 14px",borderBottom:"2px solid #d4af37"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <button className="field-nav-btn" onClick={onBack}><Icon name="left" size={14}/></button>
          <div style={{display:"flex",alignItems:"center",gap:10,flex:1}}>
            <Avatar player={player} size={36}/>
            <div>
              <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:"white",letterSpacing:2}}>{player.name}</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.6)"}}>{player.is_admin?"Admin ★":player.position==="GR"?"🧤 GR":"⚽ Polivalente"}{myDebt>0?` · ⚠️ ${myDebt}€ em dívida`:""}</div>
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:2,background:"rgba(0,0,0,0.2)",borderRadius:10,padding:3}}>
          {[["pessoal","⚽ Pessoal"],["ranking","🏆 Ranking"],["mvp","⭐ Hall of Fame"]].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:"6px 4px",borderRadius:8,border:"none",cursor:"pointer",background:tab===k?"#d4af37":"transparent",color:tab===k?"#14532d":"rgba(255,255,255,0.7)",fontSize:11,fontWeight:700,transition:"all .15s"}}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="body">
        {/* PESSOAL */}
        {tab==="pessoal"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            {stats.map((s,i)=>(
              <div key={i} style={{background:"#16241c",border:"1px solid #23362a",borderRadius:12,padding:"14px 8px",textAlign:"center"}}>
                <div style={{fontSize:20,marginBottom:6}}>{s.icon}</div>
                <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:26,color:s.color,lineHeight:1}}>{s.value}</div>
                <div style={{fontSize:9,color:"#6b7280",fontWeight:700,letterSpacing:1,marginTop:4}}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* RANKING */}
        {tab==="ranking"&&(
          <>
            <p className="section-label"><Icon name="trophy" size={12}/> RANKING DE PRESENÇAS</p>
            <ExpandableRanking ranked={ranked} mvpCounts={mvpCounts} totalGames={totalGames} currentPlayer={player} darkMode={dm}/>
          </>
        )}

        {/* MVP */}
        {tab==="mvp"&&<HallOfFameMVP history={history} members={members}/>}

        {/* MEALHEIRO */}

      </div>
    </div>
  );
}

// ── CHAT VIEW ────────────────────────────────────────────────────────────────
function ChatView({messages=[],players=[],player,darkMode,onSendMessage,onBack}) {
  const [text,setText]=useState("");
  const bottomRef=useRef(null);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[messages]);
  const dm=darkMode;
  return (
    <div className="screen" style={{height:"100vh",display:"flex",flexDirection:"column"}}>
      <div style={{background:"#166534",padding:"14px 16px",borderBottom:"3px solid white",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button className="field-nav-btn" onClick={onBack}><Icon name="left" size={14}/></button>
          <span style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:"white",letterSpacing:2}}>CHAT DO GRUPO</span>
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"12px 16px",background:"#0a0f0a",display:"flex",flexDirection:"column",gap:8}}>
        {messages.length===0&&<p className="empty-msg">Sem mensagens ainda. Diz algo! 💬</p>}
        {messages.map(msg=>{
          const isMe=msg.player_id===player.id;
          const pl=players.find(p=>p.id===msg.player_id)||{name:msg.player_name,avatar_color:"#16a34a"};
          return (
            <div key={msg.id} style={{display:"flex",gap:8,flexDirection:isMe?"row-reverse":"row",alignItems:"flex-end"}}>
              {!isMe&&<Avatar player={pl} size={28}/>}
              <div style={{maxWidth:"75%"}}>
                {!isMe&&<div style={{fontSize:10,color:"#6b7280",marginBottom:3,marginLeft:4}}>{msg.player_name}</div>}
                <div style={{background:isMe?"#16a34a":"#16241c",color:"white",borderRadius:isMe?"14px 14px 4px 14px":"14px 14px 14px 4px",padding:"8px 12px",fontSize:13,fontWeight:500,border:isMe?"none":"1px solid #23362a"}}>
                  {msg.message}
                </div>
                <div style={{fontSize:9,color:"#9ca3af",marginTop:2,textAlign:isMe?"right":"left"}}>{formatTime(new Date(msg.created_at).getTime())}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef}/>
      </div>
      <div style={{padding:"10px 16px",background:"#13201a",borderTop:"1px solid #23362a",display:"flex",gap:8,flexShrink:0}}>
        <input className="text-input" style={{flex:1}} placeholder="Escreve uma mensagem..." value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(onSendMessage(text),setText(""))}/>
        <button className="btn-add" onClick={()=>{onSendMessage(text);setText("");}}><Icon name="send" size={16}/></button>
      </div>
    </div>
  );
}

// ── PROFILE VIEW ─────────────────────────────────────────────────────────────
function ProfileView({player,darkMode,onUpdateProfile,onBack,onLogout,onSwitchAccount}) {
  const [newName,setNewName]=useState(player.name);
  const [newPhone,setNewPhone]=useState(player.phone||"");
  const [newPw,setNewPw]=useState("");
  const [newPwC,setNewPwC]=useState("");
  const [showPw,setShowPw]=useState(false);
  const [color,setColor]=useState(player.avatar_color||AVATAR_COLORS[0]);
  const dm=darkMode;
  return (
    <div className="screen">
      <div style={{background:"#166534",padding:"14px 16px",borderBottom:"3px solid white"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button className="field-nav-btn" onClick={onBack}><Icon name="left" size={14}/></button>
          <span style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:"white",letterSpacing:2}}>O MEU PERFIL</span>
        </div>
      </div>
      <div className="body">
        {/* Avatar preview */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:20}}>
          <Avatar player={{...player,avatar_color:color}} size={72} style={{marginBottom:12,boxShadow:"0 4px 20px rgba(0,0,0,0.2)"}}/>
          <p className="section-label" style={{marginBottom:8}}>COR DO AVATAR</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
            {AVATAR_COLORS.map(c=>(
              <button key={c} onClick={()=>setColor(c)} style={{width:32,height:32,borderRadius:"50%",background:c,border:color===c?"3px solid white":"2px solid transparent",cursor:"pointer",flexShrink:0}}/>
            ))}
          </div>
        </div>

        <div style={{background:"#16241c",border:"2px solid #23362a",borderRadius:14,padding:16,display:"flex",flexDirection:"column",gap:10}}>
          <label className="field-label">Nome</label>
          <input className="text-input" value={newName} onChange={e=>setNewName(e.target.value)}/>
          <label className="field-label"><Icon name="key" size={11}/> Telemóvel</label>
          <input className="text-input" type="tel" value={newPhone} onChange={e=>setNewPhone(e.target.value)} placeholder="9XX XXX XXX"/>
          <label className="field-label">Nova password</label>
          <div className="pw-row">
            <input className="text-input" type={showPw?"text":"password"} value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="Nova password..."/>
            <button className="icon-ghost" onClick={()=>setShowPw(v=>!v)}><Icon name={showPw?"eyeoff":"eye"} size={15}/></button>
          </div>
          <label className="field-label">Confirmar password</label>
          <input className="text-input" type={showPw?"text":"password"} value={newPwC} onChange={e=>setNewPwC(e.target.value)} placeholder="Repetir password..."/>
          <button className="btn-primary" style={{justifyContent:"center"}} onClick={()=>{
            if(newPw&&newPw!==newPwC){alert("As passwords não coincidem!");return;}
            onUpdateProfile(newName,newPw,color,newPhone);
            setTimeout(()=>onLogout(),800);
          }}><Icon name="check" size={15}/> GUARDAR E SAIR</button>
          <p style={{fontSize:11,color:"#6b7280",textAlign:"center"}}>💡 Após guardar volta a entrar com os novos dados.</p>
        </div>

        <button onClick={onSwitchAccount} style={{width:"100%",marginTop:14,padding:"11px",borderRadius:10,border:"2px solid rgba(239,68,68,0.3)",background:"transparent",color:"#f87171",fontWeight:800,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
          <Icon name="logout" size={14}/> TROCAR DE CONTA
        </button>
      </div>
    </div>
  );
}

// ── PLAYER VIEW ──────────────────────────────────────────────────────────────
function PlayerView({gameInfo,cdStr,confirmed,waiting,notYet,guests,spotsLeft,players,members,debts,messages,mvpVotes,history,piggybank,viewingDate,setViewingDate,historyGame,isViewingHistory,effectiveDate,darkMode,setDarkMode,player,onToggle,onAddGuest,onRemoveGuest,onUpdateProfile,onVoteMvp,onSendMessage,onUpdatePosition,onLogout,setView}) {
  const isIn=player.status==="in", isWait=player.status==="wait";
  const [confirming, setConfirming]=useState(false);
  const handleToggle=async()=>{setConfirming(true);await onToggle();setTimeout(()=>setConfirming(false),600);};
  const waitPos=waiting.findIndex(p=>p.id===player.id)+1;
  const myGuests=guests.filter(g=>g.invited_by_id===player.id);
  const myDebts=debts.filter(d=>d.player_id===player.id);
  const totalDebt=myDebts.reduce((s,d)=>s+Number(d.amount),0);
  const [guestName,setGuestName]=useState("");
  const [teams,setTeams]=useState(null);
  const [winnerTeam,setWinnerTeam]=useState(null);
  const unread=messages.filter(m=>m.player_id!==player.id).length;
  const dm=darkMode;

  return (
    <div className="screen">
      <FieldHeader {...{gameInfo,cdStr,confirmed,notYet,waiting,viewingDate,setViewingDate,historyGame,isViewingHistory,effectiveDate,darkMode,setDarkMode}}
        extraRight={
          <button className="field-nav-btn" style={{position:"relative"}} onClick={()=>setView("chat")}>
            <Icon name="chat" size={13}/>
            {messages.length>0&&<span style={{position:"absolute",top:-3,right:-3,background:"#dc2626",borderRadius:"50%",width:8,height:8}}/>}
          </button>
        }
      />
      <div className="body">
        <div className="topbar">
          <span className="topbar-name">Olá, <strong>{player.name}</strong></span>
          <div style={{display:"flex",gap:4}}>
            <button className="icon-ghost" onClick={onLogout}><Icon name="logout" size={16}/></button>
          </div>
        </div>

        {totalDebt>0&&(
          <button onClick={()=>setView("debts")} style={{width:"100%",background:"rgba(217,119,6,0.15)",border:"2px solid #d97706",borderRadius:12,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:10,cursor:"pointer",textAlign:"left"}}>
            <Icon name="warn" size={18}/>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:800,color:"#fbbf24"}}>Tens {totalDebt}€ em dívida</div>
              <div style={{fontSize:11,color:"#fcd34d"}}>Carrega para ver detalhes</div>
            </div>
            <Icon name="right" size={14}/>
          </button>
        )}

        <div className={`status-banner sb-${isIn?"in":isWait?"wait":"out"}`}>
          <span className="sb-icon">{isIn?"✅":isWait?"⏳":"⚽"}</span>
          <div>
            <div className="sb-title">{isIn?"Confirmado!":isWait?`Lista de espera #${waitPos}`:"Ainda não respondeste"}</div>
            <div className="sb-sub">{isIn?"Estás dentro":isWait?"Aguarda vaga":`${spotsLeft} vagas`}</div>
          </div>
        </div>

        <button className={`btn-big ${isIn||isWait?"btn-red":"btn-green"}`} onClick={handleToggle} style={{opacity:confirming?0.7:1,transform:confirming?"scale(0.97)":"scale(1)",transition:"all 0.15s"}}>
          {confirming?"⏳ A processar...":(isIn||isWait?<><Icon name="x" size={18}/> CANCELAR PRESENÇA</>:<><Icon name="check" size={18}/> CONFIRMAR PRESENÇA</>)}
        </button>

        <RotatingHighlights members={members} history={history} mvpVotes={mvpVotes} confirmed={confirmed} gameInfo={gameInfo}/>
        <GroupStatusCard confirmed={confirmed} notYet={notYet} members={members} players={players}/>

        {/* Position selector */}
        <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"center"}}>
          <span style={{fontSize:11,fontWeight:700,color:"#6b7280",letterSpacing:1}}>POSIÇÃO:</span>
          <button onClick={()=>onUpdatePosition("Polivalente")} style={{flex:1,padding:"8px",borderRadius:10,border:`2px solid ${(player.position||"Polivalente")==="Polivalente"?"#16a34a":"#23362a"}`,background:(player.position||"Polivalente")==="Polivalente"?"rgba(22,163,74,0.2)":"#16241c",fontWeight:800,fontSize:13,cursor:"pointer",color:(player.position||"Polivalente")==="Polivalente"?"#4ade80":"#6b7280"}}>
            ⚽ Polivalente
          </button>
          <button onClick={()=>onUpdatePosition("GR")} style={{flex:1,padding:"8px",borderRadius:10,border:`2px solid ${player.position==="GR"?"#2563eb":"#23362a"}`,background:player.position==="GR"?"rgba(37,99,235,0.2)":"#16241c",fontWeight:800,fontSize:13,cursor:"pointer",color:player.position==="GR"?"#60a5fa":"#6b7280"}}>
            🧤 Guarda-Redes
          </button>
        </div>

        {/* Equipas automáticas - sempre visível, só mostra após admin sortear */}
        {confirmed.length>=MIN_PLAYERS&&confirmed.some(p=>{const pl=(players||[]).find(pl=>pl.id===p.id); return pl?.team&&pl.team!=="SUB";})&&(
          <div style={{marginBottom:14}}>
            <div style={{background:"rgba(22,163,74,0.1)",border:"1px solid rgba(22,163,74,0.3)",borderRadius:12,padding:"10px 14px",marginBottom:8,fontSize:12,color:"#4ade80",fontWeight:700,textAlign:"center"}}>
              {confirmed.length>=15?"🏆 3 equipas de 5":`⚽ 2 equipas${confirmed.length%2!==0?" + suplentes":""}`}
            </div>
            <AutoTeamsDisplay confirmed={confirmed} players={players}/>
          </div>
        )}

        {/* MVP vote - expansível */}
        {confirmed.length>=MIN_PLAYERS&&(
          <ExpandableCard title="⭐ MVP DA SEMANA" defaultOpen={false}>
            <MvpVote confirmed={confirmed} mvpVotes={mvpVotes} currentUserId={player.id} gameDate={gameInfo.date} onVote={onVoteMvp}/>
          </ExpandableCard>
        )}

        {/* Lista do jogo - expansível */}
        <ExpandableCard title={`📋 LISTA DO JOGO (${confirmed.length})`} defaultOpen={false}>
          <ConfirmedList confirmed={confirmed} debts={debts} players={players} cost={gameInfo.cost_per_player||COST}/>
          {waiting.length>0&&<>
            <p className="section-label" style={{marginTop:10}}><Icon name="clock" size={12}/> LISTA DE ESPERA</p>
            <div className="player-list">{waiting.map((p,i)=><div key={p.id} className="list-row"><span className="list-num">{i+1}</span><Avatar player={players.find(pl=>pl.id===p.id)||p} size={28}/><span className="list-name" style={{marginLeft:4}}>{p.name}</span></div>)}</div>
          </>}
        </ExpandableCard>

        {/* Convidados - expansível */}
        <ExpandableCard title="👤 CONVIDAR ALGUÉM" defaultOpen={false}>
          {spotsLeft===0?<div className="guest-locked">🔒 Jogo cheio</div>:(
            <>
              {confirmed.length<MIN_PLAYERS&&<div className="guest-hint">⚠️ Membros têm prioridade.</div>}
              <div className="add-guest-row">
                <input className="text-input" placeholder="Nome do convidado..." value={guestName} onChange={e=>setGuestName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(onAddGuest(guestName),setGuestName(""))}/>
                <button className="btn-add" onClick={()=>{onAddGuest(guestName);setGuestName("");}}><Icon name="plus" size={16}/></button>
              </div>
              {myGuests.map(g=>(
                <div key={g.id} className="guest-row">
                  <div className="av-guest">{g.name[0]}</div><span className="guest-row-name">{g.name}</span>
                  <span className="tag-guest">convidado</span>
                  <button className="icon-danger" onClick={()=>onRemoveGuest(g.id)}><Icon name="trash" size={12}/></button>
                </div>
              ))}
            </>
          )}
        </ExpandableCard>

        <PiggyBankCard piggybank={piggybank} history={history} cost={gameInfo.cost_per_player||COST}/>
        <div style={{height:70}}/>
      </div>
      <BottomNav view={view} setView={setView} isAdmin={false} hasDebts={debts.filter(d=>d.player_id===player.id).length>0} unreadChat={messages.length>0}/>
    </div>
  );
}

// ── ADMIN VIEW ───────────────────────────────────────────────────────────────
function AdminView({gameInfo,cdStr,confirmed,waiting,notYet,guests,spotsLeft,players,members,history,piggybank,debts,messages,mvpVotes,viewingDate,setViewingDate,historyGame,isViewingHistory,effectiveDate,darkMode,setDarkMode,currentUser,adminTab,setAdminTab,onTogglePaid,onRemovePlayer,onAddPlayer,onChangePassword,onResetGame,onTogglePresence,onAddGuest,onRemoveGuest,onUpdateGameInfo,onUpdateProfile,onAddDebt,onPayDebt,onClearHistory,onSendPush,onReassignTeams,onSendMessage,onVoteMvp,onLogout,showToast,setView}) {
  const [newName,setNewName]=useState("");
  const [newUsername,setNewUsername]=useState("");
  const [newPhone,setNewPhone]=useState("");
  const [newPass,setNewPass]=useState("");
  const [editPassId,setEditPassId]=useState(null);
  const [editPassVal,setEditPassVal]=useState("");
  const [guestName,setGuestName]=useState("");
  const [editLoc,setEditLoc]=useState(gameInfo.location);
  const [editDate,setEditDate]=useState(gameInfo.date);
  const [editTime,setEditTime]=useState(gameInfo.time);
  const [editAppName,setEditAppName]=useState(gameInfo.app_name||"Hoje Há Bola");
  const [editCost,setEditCost]=useState(gameInfo.cost_per_player||3);
  const [edited,setEdited]=useState(false);
  const [teams,setTeams]=useState(null);
  const [winnerTeam,setWinnerTeam]=useState(null);
  const [debtPlayer,setDebtPlayer]=useState("");
  const [debtAmount,setDebtAmount]=useState("");
  const [debtDesc,setDebtDesc]=useState("");
  const [showReset,setShowReset]=useState(false);
  const [showClearConfirm,setShowClearConfirm]=useState(false);
  useEffect(()=>{setEditLoc(gameInfo.location);setEditDate(gameInfo.date);setEditTime(gameInfo.time);setEditAppName(gameInfo.app_name||"Hoje Há Bola");setEditCost(gameInfo.cost_per_player||3);},[gameInfo]);

  const totalPaid=confirmed.filter(p=>p.paid).length;
  const totalUnpaid=confirmed.filter(p=>!p.paid).length;
  const debtsByPlayer=(members||[]).map(m=>({...m,debts:(debts||[]).filter(d=>d.player_id===m.id),total:(debts||[]).filter(d=>d.player_id===m.id).reduce((s,d)=>s+Number(d.amount),0)})).filter(m=>m.total>0);
  const dm=darkMode;

  return (
    <div className="screen">
      <FieldHeader {...{gameInfo,cdStr,confirmed,notYet,waiting,viewingDate,setViewingDate,historyGame,isViewingHistory,effectiveDate,darkMode,setDarkMode}}
        extraRight={
          <button className="field-nav-btn" style={{position:"relative"}} onClick={()=>setView("chat")}>
            <Icon name="chat" size={13}/>
            {messages.length>0&&<span style={{position:"absolute",top:-3,right:-3,background:"#dc2626",borderRadius:"50%",width:8,height:8}}/>}
          </button>
        }
      />
      <div className="body">
        <div className="topbar">
          <span className="topbar-name"><Icon name="shield" size={13}/> <strong>{currentUser.name}</strong> · Admin</span>
          <div style={{display:"flex",gap:4}}>
            <button className="icon-ghost" onClick={onLogout}><Icon name="logout" size={16}/></button>
          </div>
        </div>

        <div style={{background:"linear-gradient(135deg,#0891b2,#0e7490)",borderRadius:14,padding:"14px 16px",marginBottom:14,color:"white"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:9,fontWeight:700,letterSpacing:1,opacity:0.8}}>MEALHEIRO</div>
              <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:32,lineHeight:1}}>{piggybank>=0?"+":""}{piggybank}€</div>
            </div>
            <div style={{display:"flex",gap:14,textAlign:"right"}}>
              <div><div style={{fontSize:9,opacity:0.7}}>RECEBIDO</div><div style={{fontSize:14,fontWeight:800,color:"#86efac"}}>{totalPaid*(gameInfo.cost_per_player||COST)}€</div></div>
              <div><div style={{fontSize:9,opacity:0.7}}>POR RECEBER</div><div style={{fontSize:14,fontWeight:800,color:"#fca5a5"}}>{totalUnpaid*(gameInfo.cost_per_player||COST)}€</div></div>
            </div>
          </div>
        </div>

        <RotatingHighlights members={members} history={history} mvpVotes={mvpVotes} confirmed={confirmed} gameInfo={gameInfo}/>
        <GroupStatusCard confirmed={confirmed} notYet={notYet} members={members} players={players}/>

        <div className="tabs">
          {[["jogo","⚽"],["equipas","🎲"],["dividas","💸"],["jogadores","👥"],["gerir","⚙️"]].map(([k,l])=>(
            <button key={k} className={`tab ${adminTab===k?"tab-active":""}`} onClick={()=>setAdminTab(k)}>{l}</button>
          ))}
        </div>

        {/* JOGO */}
        {adminTab==="jogo"&&<>
          <p className="section-label">✅ CONFIRMADOS ({confirmed.length})</p>
          <ConfirmedList confirmed={confirmed} onTogglePaid={onTogglePaid} isAdmin debts={debts} players={players} cost={gameInfo.cost_per_player||COST}/>
          {waiting.length>0&&<><p className="section-label" style={{marginTop:12}}>⏳ ESPERA</p><div className="player-list">{waiting.map((p,i)=><div key={p.id} className="list-row"><span className="list-num">{i+1}</span><Avatar player={(players||[]).find(pl=>pl.id===p.id)||p} size={26}/><span className="list-name" style={{marginLeft:4}}>{p.name}</span></div>)}</div></>}
          {notYet.length>0&&<><p className="section-label" style={{marginTop:12}}>❓ SEM RESPOSTA ({notYet.length})</p><div className="player-list">{notYet.map(p=><div key={p.id} className="list-row"><Avatar player={(players||[]).find(pl=>pl.id===p.id)||p} size={26}/><span className="list-name" style={{marginLeft:4}}>{p.name}</span></div>)}</div></>}
          {guests.filter(g=>g.status==="in").length>0&&<><p className="section-label" style={{marginTop:12}}>👤 CONVIDADOS</p>
          <div className="player-list">{guests.filter(g=>g.status==="in").map(g=><div key={g.id} className="list-row row-guest"><div className="av-guest">{g.name[0]}</div><div className="list-info"><span className="list-name">{g.name}</span><span className="guest-sub">de {g.invited_by}</span></div><button className={`paid-btn ${g.paid?"paid-yes":"paid-no"}`} onClick={()=>onTogglePaid(g.id)}>{g.paid?<><Icon name="check" size={11}/> Pago</>:`Deve ${gameInfo.cost_per_player||COST}€`}</button><button className="icon-danger" onClick={()=>onRemoveGuest(g.id)}><Icon name="trash" size={12}/></button></div>)}</div></>}

          {/* MVP vote for admin */}
          {confirmed.length>=MIN_PLAYERS&&<MvpVote confirmed={confirmed} mvpVotes={mvpVotes} currentUserId={currentUser.id} gameDate={gameInfo.date} onVote={onVoteMvp}/>}

          {!showReset
            ?<button className="btn-danger-full" style={{marginTop:14}} onClick={()=>setShowReset(true)}>🔄 Fechar jogo e guardar no histórico</button>
            :<div style={{background:"rgba(239,68,68,0.12)",border:"2px solid #dc2626",borderRadius:12,padding:14,marginTop:14}}>
              <p style={{fontSize:13,fontWeight:700,color:"#dc2626",marginBottom:10}}>Confirmas que queres fechar o jogo?</p>
              <p style={{fontSize:11,color:"#6b7280",marginBottom:12}}>Vai guardar no histórico, registar dívidas dos que não pagaram e limpar presenças.</p>
              <div style={{display:"flex",gap:8}}>
                <button className="btn-primary" style={{flex:1,justifyContent:"center",background:"#dc2626"}} onClick={()=>{onResetGame(winnerTeam);setShowReset(false);}}>✓ Confirmar</button>
                <button className="btn-primary" style={{flex:1,justifyContent:"center",background:"#6b7280"}} onClick={()=>setShowReset(false)}>Cancelar</button>
              </div>
            </div>}
        </>}

        {/* EQUIPAS */}
        {adminTab==="equipas"&&<>
          <p className="section-label"><Icon name="people" size={12}/> EQUIPAS AUTOMÁTICAS</p>
          {confirmed.length<MIN_PLAYERS
            ?<div className="guest-locked">⚠️ Precisas de {MIN_PLAYERS} confirmados. ({confirmed.length}/{MIN_PLAYERS})</div>
            :<>
              <div style={{background:"#f0fdf4",borderRadius:10,padding:"8px 12px",marginBottom:10,fontSize:12,color:"#166534",fontWeight:600}}>
                {confirmed.length>=15?"🏆 3 equipas de 5":`⚽ 2 equipas${confirmed.length%2!==0?" + suplentes":""}`}
              </div>
              <TeamsReveal confirmed={confirmed} players={players} onReassign={onReassignTeams}/>
              {/* Equipa vencedora */}
              <p className="section-label" style={{marginTop:14}}><Icon name="trophy" size={12}/> EQUIPA VENCEDORA</p>
              <div style={{display:"flex",gap:8}}>
                {["A","B","C"].slice(0,confirmed.length>=15?3:2).map(t=>(
                  <button key={t} onClick={()=>setWinnerTeam(winnerTeam===t?null:t)} style={{flex:1,padding:"10px",borderRadius:10,border:`2px solid ${winnerTeam===t?"#d97706":"#23362a"}`,background:winnerTeam===t?"rgba(217,119,6,0.15)":"#16241c",fontWeight:800,fontSize:13,cursor:"pointer",color:winnerTeam===t?"#fbbf24":"#9ca3af"}}>
                    {winnerTeam===t?"🏆":""} Equipa {t}
                  </button>
                ))}
              </div>
              {winnerTeam&&<div style={{background:"rgba(217,119,6,0.15)",borderRadius:10,padding:"10px 14px",marginTop:8,fontSize:13,fontWeight:700,color:"#fbbf24",textAlign:"center"}}>🏆 Equipa {winnerTeam} venceu!</div>}
            </>}
          <p className="section-label" style={{marginTop:14}}><Icon name="guest" size={12}/> ADICIONAR CONVIDADO</p>
          {spotsLeft===0?<div className="guest-locked">🔒 Jogo cheio</div>:(
            <div className="add-guest-row">
              <input className="text-input" placeholder="Nome do convidado..." value={guestName} onChange={e=>setGuestName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(onAddGuest(guestName),setGuestName(""))}/>
              <button className="btn-add" onClick={()=>{onAddGuest(guestName);setGuestName("");}}><Icon name="plus" size={16}/></button>
            </div>
          )}
        </>}

        {/* DÍVIDAS */}
        {adminTab==="dividas"&&<>
          <p className="section-label"><Icon name="euro" size={12}/> DÍVIDAS</p>
          {debtsByPlayer.length===0&&<p className="empty-msg">🎉 Sem dívidas em aberto!</p>}
          {debtsByPlayer.map(m=>(
            <div key={m.id} style={{background:"rgba(249,115,22,0.1)",border:"2px solid #f97316",borderRadius:12,padding:12,marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <Avatar player={(players||[]).find(p=>p.id===m.id)||m} size={30}/>
                  <span style={{fontWeight:800,fontSize:14,color:"white"}}>{m.name}</span>
                </div>
                <span style={{fontFamily:"'Bebas Neue',cursive",fontSize:22,color:"#dc2626"}}>{m.total}€</span>
              </div>
              {m.debts.map(d=><DebtRow key={d.id} debt={d} onPayDebt={onPayDebt}/>)}
            </div>
          ))}
          <p className="section-label" style={{marginTop:14}}>REGISTAR DÍVIDA MANUAL</p>
          <div style={{background:"#16241c",border:"1px solid #23362a",borderRadius:12,padding:12,display:"flex",flexDirection:"column",gap:8}}>
            <select className="text-input" value={debtPlayer} onChange={e=>setDebtPlayer(e.target.value)} style={{color:debtPlayer?"#14532d":"#9ca3af"}}>
              <option value="">Seleciona jogador...</option>
              {members.filter(m=>!m.is_admin).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <input className="text-input" type="number" placeholder="Valor (€)..." value={debtAmount} onChange={e=>setDebtAmount(e.target.value)}/>
            <input className="text-input" placeholder="Descrição..." value={debtDesc} onChange={e=>setDebtDesc(e.target.value)}/>
            <button className="btn-primary" onClick={()=>{
              const p=members.find(m=>m.id===Number(debtPlayer));
              if(!p||!debtAmount) return;
              onAddDebt(p.id,p.name,Number(debtAmount),debtDesc||"Dívida manual");
              setDebtPlayer("");setDebtAmount("");setDebtDesc("");
            }}><Icon name="plus" size={14}/> Registar</button>
          </div>
        </>}

        {/* JOGADORES */}
        {adminTab==="jogadores"&&(
          <div className="player-list">
            {members.map(p=>(
              <div key={p.id} className="list-row" style={{flexWrap:"wrap",paddingBottom:12,alignItems:"flex-start",gap:8}}>
                <Avatar player={players.find(pl=>pl.id===p.id)||p} size={30} style={{marginTop:2}}/>
                <div className="list-info" style={{flex:1}}>
                  <span className="list-name">{p.name}{p.is_admin&&<span className="admin-chip"> ★</span>}</span>
                  <span className="guest-sub">@{p.username||"sem-username"} · {p.status==="in"?"✅":p.status==="wait"?"⏳":"❌"} · {p.total_games||0} jogos</span>
                </div>
                <button className={`paid-btn ${p.status==="in"||p.status==="wait"?"paid-no":"paid-yes"}`} style={{fontSize:10}} onClick={()=>onTogglePresence(p.id)}>{p.status==="in"?"✅ Dentro":p.status==="wait"?"⏳":"❌ Fora"}</button>
                {!p.is_admin&&<button className="icon-danger" onClick={()=>onRemovePlayer(p.id)}><Icon name="trash" size={13}/></button>}
                {editPassId===p.id?(
                  <div style={{width:"100%",display:"flex",gap:6,marginTop:4}}>
                    <input className="text-input" style={{flex:1,fontSize:12,padding:"7px 10px"}} placeholder="Nova password..." value={editPassVal} onChange={e=>setEditPassVal(e.target.value)} autoFocus/>
                    <button className="btn-primary" style={{padding:"7px 10px"}} onClick={()=>{onChangePassword(p.id,editPassVal);setEditPassId(null);setEditPassVal("");}}><Icon name="check" size={13}/></button>
                    <button className="icon-ghost" onClick={()=>setEditPassId(null)}><Icon name="x" size={13}/></button>
                  </div>
                ):<button className="icon-ghost" onClick={()=>{setEditPassId(p.id);setEditPassVal("");}}><Icon name="key" size={14}/></button>}
              </div>
            ))}
          </div>
        )}

        {/* GERIR */}
        {adminTab==="gerir"&&<>
          <div className="game-info-card">
            <div className="game-info-header"><Icon name="edit" size={13}/> NOME DA APP</div>
            <input className="text-input" value={editAppName} onChange={e=>{setEditAppName(e.target.value);setEdited(true);}} placeholder="Nome do grupo/app..."/>
          </div>

          <div className="game-info-card" style={{marginTop:12}}>
            <div className="game-info-header"><Icon name="edit" size={13}/> INFORMAÇÕES DO JOGO</div>
            <label className="field-label"><Icon name="pin" size={11}/> Local</label>
            <input className="text-input" value={editLoc} onChange={e=>{setEditLoc(e.target.value);setEdited(true);}}/>
            <div className="date-time-row">
              <div style={{flex:1}}><label className="field-label"><Icon name="cal" size={11}/> Data</label><input className="text-input" type="date" value={editDate} onChange={e=>{setEditDate(e.target.value);setEdited(true);}}/></div>
              <div style={{width:100}}><label className="field-label"><Icon name="clock" size={11}/> Hora</label><input className="text-input" type="time" value={editTime} onChange={e=>{setEditTime(e.target.value);setEdited(true);}}/></div>
            </div>
            <label className="field-label">💰 Valor por jogador (€)</label>
            <input className="text-input" type="number" step="0.5" min="0" value={editCost} onChange={e=>{setEditCost(e.target.value);setEdited(true);}}/>
            <button className={`btn-save ${edited?"btn-save-active":""}`} disabled={!edited} onClick={()=>{onUpdateGameInfo({location:editLoc,date:editDate,time:editTime,app_name:editAppName,cost_per_player:Number(editCost)});setEdited(false);}}>
              <Icon name="check" size={13}/> {edited?"GUARDAR":"SEM ALTERAÇÕES"}
            </button>
          </div>
          <p className="section-label" style={{marginTop:16}}><Icon name="plus" size={11}/> ADICIONAR MEMBRO</p>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <input className="text-input" placeholder="Nome (ex: João Silva)..." value={newName} onChange={e=>setNewName(e.target.value)}/>
            <input className="text-input" placeholder="Utilizador (ex: joao_s)..." value={newUsername} onChange={e=>setNewUsername(e.target.value)} autoCapitalize="none"/>
            <input className="text-input" placeholder="Telemóvel (opcional)..." value={newPhone} onChange={e=>setNewPhone(e.target.value)}/>
            <input className="text-input" placeholder="Password inicial..." value={newPass} onChange={e=>setNewPass(e.target.value)}/>
            <button className="btn-primary" onClick={()=>{onAddPlayer(newName,newUsername,newPass,newPhone);setNewName("");setNewUsername("");setNewPass("");setNewPhone("");}}>
              <Icon name="plus" size={14}/> Adicionar membro
            </button>
          </div>
          <p style={{fontSize:11,color:"#6b7280",marginTop:8}}>💡 O jogador pode entrar com o utilizador OU o telemóvel.</p>

          <p className="section-label" style={{marginTop:20}}>🔔 NOTIFICAÇÕES MANUAIS</p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:8}}>
            <button className="btn-primary" style={{justifyContent:"center",background:"#16a34a"}} onClick={async()=>{
              await onSendPush("⚽ Novo jogo disponível!", `Novo jogo marcado para ${gameInfo.date} às ${gameInfo.time}. Confirma presença!`);
              showToast("Notificação enviada ✓");
            }}>⚽ Novo jogo disponível</button>
            <button className="btn-primary" style={{justifyContent:"center",background:"#0891b2"}} onClick={async()=>{
              await onSendPush("⏰ Lembrete de presença!", `Ainda não confirmaste presença para o jogo de ${gameInfo.date}. Confirma já!`);
              showToast("Notificação enviada ✓");
            }}>⏰ Lembrete — Marcar presença</button>
            <button className="btn-primary" style={{justifyContent:"center",background:"#d97706"}} onClick={async()=>{
              await onSendPush("💸 Aviso de pagamento!", `Não te esqueças de pagar os ${gameInfo.cost_per_player||3}€ do último jogo!`);
              showToast("Notificação enviada ✓");
            }}>💸 Lembrete — Pagamento</button>
            <button className="btn-primary" style={{justifyContent:"center",background:"#7c3aed"}} onClick={async()=>{
              await onSendPush("🏆 MVP aberto para votação!", "Já há jogadores suficientes — entra na app e vota no MVP da semana!");
              showToast("Notificação enviada ✓");
            }}>🏆 MVP aberto para votação</button>
          </div>
          <p style={{fontSize:11,color:"#6b7280",marginBottom:16}}>💡 Notificações enviadas a todos os subscritores.</p>

          <p className="section-label" style={{marginTop:4}}>⚠️ ZONA DE PERIGO</p>
          {!showClearConfirm ? (
            <button className="btn-danger-full" onClick={()=>setShowClearConfirm(true)}>🗑️ Limpar histórico e dívidas (reiniciar mealheiro)</button>
          ) : (
            <div style={{background:"rgba(239,68,68,0.12)",border:"2px solid #dc2626",borderRadius:12,padding:14}}>
              <p style={{fontSize:13,fontWeight:700,color:"#f87171",marginBottom:8}}>Tens a certeza?</p>
              <p style={{fontSize:11,color:"#6b7280",marginBottom:12}}>Isto apaga todo o histórico de jogos e dívidas. O mealheiro volta a 0€. Não afeta jogadores nem estatísticas pessoais.</p>
              <div style={{display:"flex",gap:8}}>
                <button className="btn-primary" style={{flex:1,justifyContent:"center",background:"#dc2626"}} onClick={()=>{onClearHistory();setShowClearConfirm(false);}}>✓ Confirmar</button>
                <button className="btn-primary" style={{flex:1,justifyContent:"center",background:"#6b7280"}} onClick={()=>setShowClearConfirm(false)}>Cancelar</button>
              </div>
            </div>
          )}
        </>}
        <div style={{height:70}}/>
      </div>
      <BottomNav view={view} setView={(v)=>{if(v==="equipas_tab"){setAdminTab("equipas");setView("admin");}else setView(v);}} isAdmin={true} hasDebts={debts.length>0} unreadChat={messages.length>0}/>
    </div>
  );
}

// ── CSS ──────────────────────────────────────────────────────────────────────
function getCss(dm) {
  const bg    = "#0a0a0a";
  const card  = "#111111";
  const text  = "#f0f0f0";
  const muted = "#6b7280";
  const border= "#1f1f1f";
  const input = "#0f0f0f";
  return `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;600;700;800&display=swap');
@keyframes spin{to{transform:rotate(360deg);}}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{background:${dm?"#0a0f0a":"#0a140e"};font-family:'DM Sans',sans-serif;color:${text};min-height:100vh;}
.screen{min-height:100vh;display:flex;flex-direction:column;max-width:480px;margin:0 auto;}
.spinner{width:36px;height:36px;border:4px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;}
.field-header{position:relative;overflow:hidden;background:linear-gradient(160deg,#1a4d2e 0%,#0f3320 60%,#0a2618 100%);padding:16px 16px 14px;border-bottom:2px solid #d4af37;}
.field-lines{position:absolute;inset:0;pointer-events:none;}
.fl{position:absolute;border:1.5px solid rgba(255,255,255,0.08);}
.fl-cc{width:100px;height:100px;border-radius:50%;top:50%;left:50%;transform:translate(-50%,-50%);}
.fl-cl{top:0;bottom:0;left:50%;width:0;border-left:1.5px solid rgba(255,255,255,0.08);}
.fl-lb{top:15%;bottom:15%;left:-20px;width:65px;border-radius:0 8px 8px 0;}
.fl-rb{top:15%;bottom:15%;right:-20px;width:65px;border-radius:8px 0 0 8px;}
.field-content{position:relative;z-index:1;}
.field-badge{display:flex;align-items:center;gap:7px;}
.field-badge-name{font-family:'Bebas Neue',cursive;font-size:18px;letter-spacing:1.5px;color:white;}
.field-nav-btn{background:rgba(0,0,0,0.3);border:none;border-radius:8px;padding:5px 7px;color:white;cursor:pointer;display:flex;align-items:center;font-family:'DM Sans',sans-serif;}
.field-nav-btn:hover{background:rgba(0,0,0,0.5);}
.field-date{font-size:11px;color:rgba(255,255,255,0.75);text-transform:capitalize;margin:4px 0;}
.field-timeloc{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:5px;}
.field-chip{display:inline-flex;align-items:center;gap:3px;background:rgba(0,0,0,0.3);border-radius:20px;padding:2px 8px;font-size:10px;color:rgba(255,255,255,0.85);font-weight:600;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.field-cd{font-family:'Bebas Neue',cursive;font-size:12px;color:#d4af37;background:rgba(0,0,0,0.3);border-radius:20px;padding:2px 9px;}
.score-block{display:flex;flex-direction:column;align-items:center;}
.score-num{font-family:'Bebas Neue',cursive;font-size:38px;line-height:1;}
.score-num.green{color:#4ade80;}.score-num.white{color:white;}
.score-label{font-size:8px;font-weight:700;letter-spacing:1.5px;color:rgba(255,255,255,0.45);margin-top:1px;}
.score-sep{font-family:'Bebas Neue',cursive;font-size:22px;color:rgba(255,255,255,0.3);}
.pct-bar{height:4px;background:rgba(255,255,255,0.15);border-radius:99px;overflow:hidden;margin-bottom:4px;}
.pct-fill{height:100%;background:linear-gradient(90deg,#4ade80,#d4af37);border-radius:99px;transition:width .6s;}
.pct-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:5px;}
.pct-label{font-size:10px;font-weight:700;}
.pct-label.green{color:#4ade80;}.pct-label.muted{color:rgba(255,255,255,0.4);}.pct-label.yellow{color:#fbbf24;}
.body,.login-body{flex:1;background:${bg};color:${text};padding:16px 16px 48px;}
.topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;}
.topbar-name{font-size:14px;color:#4ade80;font-weight:700;}
.section-label{font-size:10px;font-weight:800;letter-spacing:1.5px;color:${muted};text-transform:uppercase;margin-bottom:8px;display:flex;align-items:center;gap:5px;}
.player-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;}
.player-card{background:${card};border:2px solid ${border};border-radius:12px;padding:12px 8px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;transition:all .15s;color:${text};font-family:'DM Sans',sans-serif;}
.player-card:hover,.player-card.selected{border-color:#16a34a;box-shadow:0 0 0 3px rgba(22,163,74,.2);}
.player-card-name{font-size:12px;font-weight:700;}
.av-wait{width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#d97706,#b45309);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:white;flex-shrink:0;box-shadow:0 2px 6px rgba(0,0,0,0.3);}
.av-out{width:28px;height:28px;border-radius:50%;background:${dm?"#243024":"#1c2920"};color:${muted};border:1px solid ${border};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0;}
.av-guest{width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#a855f7,#7c3aed);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:white;flex-shrink:0;box-shadow:0 2px 6px rgba(0,0,0,0.3);}
.pw-box{background:${card};border:2px solid ${border};border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px;box-shadow:0 8px 24px rgba(0,0,0,0.25);}
.pw-label{font-size:13px;color:${muted};}.pw-label strong{color:${text};}
.pw-row{display:flex;gap:8px;}
.pw-input{flex:1;background:${input};border:2px solid ${border};border-radius:10px;padding:10px 14px;color:${text};font-size:14px;outline:none;font-family:'DM Sans',sans-serif;}
.pw-input:focus{border-color:#16a34a;}
.btn-primary{background:#16a34a;color:white;border:none;border-radius:10px;padding:11px 18px;font-weight:800;cursor:pointer;font-size:13px;font-family:'DM Sans',sans-serif;display:flex;align-items:center;gap:6px;}
.btn-primary:hover{background:#15803d;}
.btn-outline{width:100%;padding:10px;border-radius:10px;border:2px solid ${border};background:${card};color:#4ade80;font-weight:800;font-size:12px;font-family:'DM Sans',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;}
.btn-outline:hover{background:${dm?"#1a2e1a":"#1c2920"};}
.btn-big{width:100%;padding:13px;border-radius:12px;border:none;cursor:pointer;font-size:14px;font-weight:800;font-family:'Bebas Neue',cursive;letter-spacing:1.5px;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:14px;box-shadow:0 6px 16px rgba(0,0,0,0.25);}
.btn-big:hover{filter:brightness(1.08);}
.btn-green{background:linear-gradient(135deg,#22c55e,#15803d);color:white;}.btn-red{background:linear-gradient(135deg,#ef4444,#b91c1c);color:white;}
.btn-add{background:#16a34a;color:white;border:none;border-radius:10px;padding:10px 13px;cursor:pointer;display:flex;align-items:center;flex-shrink:0;}
.btn-danger-full{background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:12px;font-weight:800;cursor:pointer;font-size:12px;font-family:'DM Sans',sans-serif;width:100%;text-align:center;}
.icon-ghost{background:transparent;border:none;border-radius:8px;padding:7px;color:${muted};cursor:pointer;display:flex;align-items:center;}
.icon-ghost:hover{background:${dm?"#1a2e1a":"#1c2920"};color:${text};}
.icon-danger{background:rgba(239,68,68,0.15);border:none;border-radius:8px;padding:7px;color:#f87171;cursor:pointer;display:flex;flex-shrink:0;}
.status-banner{border-radius:14px;padding:12px 14px;display:flex;align-items:center;gap:12px;margin-bottom:14px;}
.sb-in{background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);}.sb-wait{background:rgba(217,119,6,0.15);border:1px solid rgba(217,119,6,0.3);}.sb-out{background:${dm?"#1a2e1a":"#142019"};border:2px solid ${border};}
.sb-icon{font-size:22px;}.sb-title{font-size:14px;font-weight:800;color:${text};}.sb-sub{font-size:11px;color:${muted};margin-top:2px;}
.player-list{display:flex;flex-direction:column;gap:5px;margin-bottom:4px;}
.list-row{display:flex;align-items:center;gap:8px;background:${card};border-radius:10px;padding:9px 12px;border:1px solid ${border};}
.row-guest{border-color:rgba(168,85,247,0.3);background:${dm?"#1a1330":"#1d1730"};}
.list-num{font-size:10px;color:${muted};width:14px;text-align:center;flex-shrink:0;}
.list-info{display:flex;flex-direction:column;flex:1;min-width:0;}
.list-name{font-size:13px;font-weight:700;color:${text};}
.guest-sub{font-size:10px;color:#a855f7;margin-top:1px;}
.admin-chip{color:#d4af37;}
.empty-msg{font-size:12px;color:${muted};text-align:center;padding:12px 0;}
.paid-chip,.paid-btn{font-size:11px;font-weight:700;border-radius:8px;padding:4px 9px;flex-shrink:0;}
.paid-chip{border:none;}.paid-btn{border:none;cursor:pointer;display:flex;align-items:center;gap:3px;font-family:'DM Sans',sans-serif;}
.paid-yes{background:rgba(34,197,94,0.2);color:#4ade80;}.paid-no{background:rgba(239,68,68,0.2);color:#f87171;}
.money-row{display:flex;gap:8px;margin-bottom:14px;}
.money-box{flex:1;border-radius:12px;padding:10px 8px;text-align:center;display:flex;flex-direction:column;gap:3px;}
.green-box{background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.25);}.red-box{background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.25);}
.money-num{font-family:'Bebas Neue',cursive;font-size:22px;line-height:1;}
.green-box .money-num{color:#4ade80;}.red-box .money-num{color:#f87171;}
.money-label{font-size:9px;font-weight:800;letter-spacing:1px;color:${muted};text-transform:uppercase;}
.card-section{background:${card};border:2px solid ${border};border-radius:14px;padding:13px;box-shadow:0 4px 16px rgba(0,0,0,0.2);}
.tabs{display:flex;gap:2px;background:${dm?"#1a2e1a":"#142019"};border-radius:10px;padding:3px;margin-bottom:14px;border:1px solid ${border};}
.tab{flex:1;padding:7px 2px;border-radius:8px;border:none;cursor:pointer;background:transparent;color:${muted};font-size:15px;font-family:'DM Sans',sans-serif;transition:all .15s;}
.tab-active{background:linear-gradient(135deg,#22c55e,#15803d);color:white;}
.guest-locked{background:${dm?"#1a2e1a":"#0f1c14"};border:2px dashed ${border};border-radius:10px;padding:14px;text-align:center;font-size:13px;color:${muted};}
.guest-hint{background:rgba(217,119,6,0.15);border:1px solid rgba(217,119,6,0.3);border-radius:10px;padding:9px 12px;font-size:11px;color:#fbbf24;font-weight:600;margin-bottom:8px;}
.add-guest-row{display:flex;gap:8px;margin-bottom:8px;}
.guest-row{display:flex;align-items:center;gap:8px;background:${dm?"#1a1330":"#1d1730"};border-radius:10px;padding:8px 10px;margin-top:6px;border:1px solid rgba(168,85,247,0.3);}
.guest-row-name{flex:1;font-size:13px;font-weight:700;color:${text};}
.tag-guest{font-size:10px;font-weight:700;background:rgba(168,85,247,0.2);color:#c084fc;border-radius:20px;padding:2px 8px;flex-shrink:0;}
.text-input{background:${input};border:2px solid ${border};border-radius:10px;padding:10px 14px;color:${text};font-size:13px;font-family:'DM Sans',sans-serif;outline:none;width:100%;}
.text-input:focus{border-color:#16a34a;}
.text-input::placeholder{color:${muted};}
input[type="date"],input[type="time"]{color-scheme:dark;}
select.text-input{appearance:none;}
.game-info-card{background:${card};border:2px solid ${border};border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px;box-shadow:0 4px 16px rgba(0,0,0,0.2);}
.game-info-header{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800;letter-spacing:1px;color:#d4af37;text-transform:uppercase;}
.field-label{font-size:11px;font-weight:700;color:${muted};display:flex;align-items:center;gap:4px;margin-bottom:4px;}
.date-time-row{display:flex;gap:10px;}
.btn-save{width:100%;padding:11px;border-radius:10px;border:2px solid ${border};background:${dm?"#1a2e1a":"#0f1c14"};color:${muted};font-weight:800;font-size:12px;font-family:'DM Sans',sans-serif;cursor:not-allowed;display:flex;align-items:center;justify-content:center;gap:6px;transition:all .2s;}
.btn-save-active{background:#16a34a;color:white;border-color:#16a34a;cursor:pointer;}
.btn-save-active:hover{background:#15803d;}
.toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);border-radius:12px;padding:11px 20px;font-size:13px;font-weight:700;color:white;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.4);white-space:nowrap;font-family:'DM Sans',sans-serif;}
.toast-ok{background:#16a34a;}.toast-warn{background:#d97706;}.toast-err{background:#dc2626;}
`;
}

