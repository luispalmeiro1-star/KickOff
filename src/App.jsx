import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase.js";

const MAX_PLAYERS = 15;
const MIN_PLAYERS = 10;
const COST = 3;
const RENT = 22;
const AVATAR_COLORS = ["#16a34a","#2563eb","#7c3aed","#dc2626","#d97706","#0891b2","#be185d","#065f46"];
const TEAM_COLORS = [
  { bg: "#dcfce7", border: "#16a34a", text: "#14532d", name: "EQUIPA A" },
  { bg: "#dbeafe", border: "#2563eb", text: "#1e3a8a", name: "EQUIPA B" },
  { bg: "#fef3c7", border: "#d97706", text: "#92400e", name: "EQUIPA C" },
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
  const [gameInfo, setGameInfo]       = useState({location:"Pavilhão Gimnodesportivo de Alcochete",date:nextWednesday(),time:"22:30"});
  const [history, setHistory]         = useState([]);
  const [debts, setDebts]             = useState([]);
  const [messages, setMessages]       = useState([]);
  const [mvpVotes, setMvpVotes]       = useState([]);
  const [piggybank, setPiggybank]     = useState(0);
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView]               = useState("login"); // login | player | admin | profile | stats | chat
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
  const loadHistory  = useCallback(async()=>{const{data}=await supabase.from("game_history").select("*").order("date",{ascending:false});if(data){setHistory(data);setPiggybank(data.reduce((s,g)=>s+(Number(g.collected)||0)-RENT,0));}},[]);
  const loadDebts    = useCallback(async()=>{const{data}=await supabase.from("debts").select("*").order("created_at");if(data)setDebts(data);},[]);
  const loadMessages = useCallback(async()=>{const{data}=await supabase.from("chat_messages").select("*").order("created_at").limit(100);if(data)setMessages(data);},[]);
  const loadMvp      = useCallback(async()=>{const{data}=await supabase.from("mvp_votes").select("*");if(data)setMvpVotes(data);},[]);

  useEffect(()=>{
    (async()=>{setLoading(true);await Promise.all([loadPlayers(),loadGameInfo(),loadHistory(),loadDebts(),loadMessages(),loadMvp()]);setLoading(false);})();
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

  const members   = players.filter(p=>!p.is_guest);
  const guests    = players.filter(p=>p.is_guest);
  const confirmed = sortedConfirmed(players);
  const waiting   = players.filter(p=>p.status==="wait");
  const notYet    = members.filter(p=>p.status==="out");
  const spotsLeft = Math.max(0,MAX_PLAYERS-confirmed.length);
  const cdStr     = countdown(gameInfo.date,gameInfo.time);

  const handleLogin = async(playerId,password)=>{
    const p=players.find(p=>p.id===playerId);
    if(!p||p.password!==password) return false;
    setCurrentUser(p); setView(p.is_admin?"admin":"player"); return true;
  };
  const handleLogout = ()=>{setCurrentUser(null);setView("login");setViewingDate(null);};

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
  const addPlayer      = async(name,password)=>{
    if(!name.trim()||!password.trim()) return;
    const color=AVATAR_COLORS[Math.floor(Math.random()*AVATAR_COLORS.length)];
    setPlayers(prev=>[...prev,{id:Date.now(),name:name.trim(),is_admin:false,password:password.trim(),paid:false,status:"out",is_guest:false,invited_by:null,invited_by_id:null,confirmed_at:null,avatar_color:color,position:"Polivalente",total_games:0,total_paid:0}]);
    await supabase.from("players").insert({name:name.trim(),is_admin:false,password:password.trim(),paid:false,status:"out",is_guest:false,invited_by:null,invited_by_id:null,confirmed_at:null,avatar_color:color});
    showToast(`${name} adicionado! 🎉`);
  };
  const updateGameInfo = async(patch)=>{setGameInfo(prev=>({...prev,...patch}));await supabase.from("game_info").update(patch).eq("id",1);showToast("Jogo atualizado ✓");};
  const updateProfile  = async(id,newName,newPassword,newColor)=>{
    const updates={};
    if(newName?.trim()) updates.name=newName.trim();
    if(newPassword?.trim()) updates.password=newPassword.trim();
    if(newColor) updates.avatar_color=newColor;
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
  const resetGame = async(winnerTeam)=>{
    const paidCount=confirmed.filter(p=>p.paid).length;
    const collected=paidCount*COST;
    const unpaidMembers=confirmed.filter(p=>!p.paid&&!p.is_guest);
    for(const p of unpaidMembers){
      await supabase.from("debts").insert({player_id:p.id,player_name:p.name,amount:COST,description:`Jogo de ${gameInfo.date}`});
    }
    // update stats
    for(const p of confirmed.filter(pl=>!pl.is_guest)){
      const pl=players.find(m=>m.id===p.id);
      if(pl){await supabase.from("players").update({total_games:(pl.total_games||0)+1,total_paid:(pl.total_paid||0)+(p.paid?COST:0)}).eq("id",p.id);}
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
    await supabase.from("players").update({status:"out",paid:false,confirmed_at:null}).eq("is_guest",false);
    showToast("Jogo fechado ✓");
  };
  const addDebt  = async(playerId,playerName,amount,desc)=>{await supabase.from("debts").insert({player_id:playerId,player_name:playerName,amount,description:desc});showToast("Dívida registada ✓");};
  const payDebt  = async(debtId)=>{await supabase.from("debts").delete().eq("id",debtId);showToast("Dívida paga ✓");};
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
  const shared = {gameInfo,cdStr,confirmed,waiting,notYet,guests,spotsLeft,members,players,history,piggybank,debts,messages,mvpVotes,viewingDate,setViewingDate,historyGame,isViewingHistory,effectiveDate,darkMode,setDarkMode};

  if(loading) return (
    <div style={{minHeight:"100vh",background:"#166534",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
      <style>{getCss(false)}</style>
      <div style={{fontSize:48}}>⚽</div>
      <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:32,color:"white",letterSpacing:3}}>KICKOFF</div>
      <div className="spinner"/>
    </div>
  );

  const dm = darkMode;
  return (
    <div style={{background:dm?"#0a0f0a":"#0d1a0e",minHeight:"100vh"}}>
      <style>{getCss(dm)}</style>
      {toast&&<div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      {view==="login"   && <LoginView   {...shared} onLogin={handleLogin} showToast={showToast}/>}
      {view==="player"  && liveUser && <PlayerView  {...shared} player={liveUser} onToggle={()=>togglePresence(liveUser.id)} onAddGuest={n=>addGuest(n,liveUser.id)} onRemoveGuest={removeGuest} onUpdateProfile={(name,pw,color)=>updateProfile(liveUser.id,name,pw,color)} onVoteMvp={(vid)=>voteForMvp(liveUser.id,vid)} onSendMessage={(t)=>sendMessage(t,liveUser.id,liveUser.name)} onUpdatePosition={(pos)=>updatePosition(liveUser.id,pos)} onLogout={handleLogout} setView={setView}/>}
      {view==="admin"   && liveUser && <AdminView   {...shared} currentUser={liveUser} adminTab={adminTab} setAdminTab={setAdminTab} onTogglePaid={togglePaid} onRemovePlayer={removePlayer} onAddPlayer={addPlayer} onChangePassword={changePassword} onResetGame={resetGame} onTogglePresence={togglePresence} onAddGuest={n=>addGuest(n,liveUser.id)} onRemoveGuest={removeGuest} onUpdateGameInfo={updateGameInfo} onUpdateProfile={(name,pw,color)=>updateProfile(liveUser.id,name,pw,color)} onAddDebt={addDebt} onPayDebt={payDebt} onSendMessage={(t)=>sendMessage(t,liveUser.id,liveUser.name)} onVoteMvp={(vid)=>voteForMvp(liveUser.id,vid)} onLogout={handleLogout} showToast={showToast} setView={setView}/>}
      {view==="stats"   && liveUser && <StatsView   {...shared} player={liveUser} onBack={()=>setView(liveUser.is_admin?"admin":"player")}/>}
      {view==="chat"    && liveUser && <ChatView    {...shared} player={liveUser} onSendMessage={(t)=>sendMessage(t,liveUser.id,liveUser.name)} onBack={()=>setView(liveUser.is_admin?"admin":"player")}/>}
      {view==="profile" && liveUser && <ProfileView {...shared} player={liveUser} onUpdateProfile={(name,pw,color)=>updateProfile(liveUser.id,name,pw,color)} onBack={()=>setView(liveUser.is_admin?"admin":"player")} onLogout={handleLogout}/>}
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
function FieldHeader({gameInfo,cdStr,confirmed,notYet,waiting,viewingDate,setViewingDate,historyGame,isViewingHistory,effectiveDate,darkMode,setDarkMode,extraRight}) {
  const pct=Math.round((confirmed.length/MAX_PLAYERS)*100);
  const canFwd=viewingDate&&viewingDate<gameInfo.date;
  return (
    <div className="field-header">
      <div className="field-lines"><div className="fl fl-cc"/><div className="fl fl-cl"/><div className="fl fl-lb"/><div className="fl fl-rb"/></div>
      <div className="field-content">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
          <div className="field-badge"><span style={{fontSize:16}}>⚽</span><span className="field-badge-name">KickOff</span></div>
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
              <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
                <div><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:"#4ade80"}}>{historyGame.players_count}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",letterSpacing:1}}>JOGADORES</div></div>
                <div><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:"#fbbf24"}}>{historyGame.collected}€</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",letterSpacing:1}}>RECEBIDO</div></div>
                {historyGame.winner_team&&<div><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:"#60a5fa"}}>{historyGame.winner_team}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",letterSpacing:1}}>VENCEDOR</div></div>}
                {historyGame.mvp_name&&<div><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:"#f472b6"}}>{historyGame.mvp_name}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",letterSpacing:1}}>MVP ⭐</div></div>}
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
            {confirmed.length>0&&<ExpandableList confirmed={confirmed}/>}
          </>
        )}
      </div>
    </div>
  );
}

// ── LOGIN ────────────────────────────────────────────────────────────────────
function LoginView({gameInfo,cdStr,confirmed,notYet,waiting,members,viewingDate,setViewingDate,historyGame,isViewingHistory,effectiveDate,darkMode,setDarkMode,onLogin,showToast}) {
  const [selected,setSelected]=useState(null);
  const [password,setPassword]=useState("");
  const [showPw,setShowPw]=useState(false);
  const handleSubmit=()=>{if(!selected)return;if(!onLogin(selected.id,password)){showToast("Password incorreta!","err");setPassword("");}};
  return (
    <div className="screen">
      <FieldHeader {...{gameInfo,cdStr,confirmed,notYet,waiting,viewingDate,setViewingDate,historyGame,isViewingHistory,effectiveDate,darkMode,setDarkMode}}/>
      <div className="body">
        {!isViewingHistory&&<>
          <p className="section-label">QUEM ÉS TU?</p>
          <div className="player-grid">
            {members.map(p=>(
              <button key={p.id} className={`player-card ${selected?.id===p.id?"selected":""}`} onClick={()=>{setSelected(p);setPassword("");}}>
                <Avatar player={p} size={36}/>
                <span className="player-card-name">{p.name}</span>
                <span style={{fontSize:11}}>{p.status==="in"?"✅":p.status==="wait"?"⏳":"—"}</span>
              </button>
            ))}
          </div>
          {selected&&(
            <div className="pw-box">
              <p className="pw-label">Password de <strong>{selected.name}</strong></p>
              <div className="pw-row">
                <input className="pw-input" type={showPw?"text":"password"} placeholder="••••••" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} autoFocus/>
                <button className="icon-ghost" onClick={()=>setShowPw(v=>!v)}><Icon name={showPw?"eyeoff":"eye"} size={16}/></button>
              </div>
              <button className="btn-primary" onClick={handleSubmit}>ENTRAR →</button>
            </div>
          )}
        </>}
        {isViewingHistory&&<div style={{textAlign:"center",paddingTop:20}}><p style={{color:"#6b7280",fontSize:13}}>A ver histórico — <button style={{background:"none",border:"none",color:"#16a34a",fontWeight:700,cursor:"pointer"}} onClick={()=>setViewingDate(null)}>voltar ao atual</button></p></div>}
      </div>
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
                <div key={p.id} style={{display:"flex",alignItems:"center",gap:5,background:p.position==="GR"?"#eff6ff":"white",borderRadius:20,padding:"4px 10px",fontSize:12,fontWeight:700,color:color.text,border:`1px solid ${p.position==="GR"?"#2563eb":color.border}`}}>
                  <Avatar player={(players||[]).find(pl=>pl.id===p.id)||p} size={18}/>
                  {p.name}{p.position==="GR"&&<span style={{fontSize:11}}>🧤</span>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {subs.length > 0 && (
        <div style={{background:"#f8fafc",border:"1px dashed #94a3b8",borderRadius:12,padding:"10px 12px"}}>
          <div style={{fontSize:11,fontWeight:800,color:"#64748b",letterSpacing:1,marginBottom:6}}>SUPLENTES</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {subs.map(p=>(
              <div key={p.id} style={{display:"flex",alignItems:"center",gap:5,background:"white",borderRadius:20,padding:"4px 10px",fontSize:12,fontWeight:700,color:"#64748b",border:"1px solid #e2e8f0"}}>
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
            <button key={p.id} onClick={()=>onVote(p.id)} style={{display:"flex",alignItems:"center",gap:10,background:isVoted?"#fef3c7":"white",border:`2px solid ${isVoted?"#d97706":"#d1fae5"}`,borderRadius:10,padding:"8px 12px",cursor:"pointer",textAlign:"left",width:"100%"}}>
              <Avatar player={p} size={28}/>
              <span style={{flex:1,fontSize:13,fontWeight:700,color:"#14532d"}}>{p.name}</span>
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
function PiggyBankCard({piggybank,history}) {
  const [show,setShow]=useState(false);
  return (
    <div style={{marginTop:16}}>
      <p className="section-label"><Icon name="euro" size={12}/> MEALHEIRO DO GRUPO</p>
      <div style={{background:piggybank>=0?"#dcfce7":"#fee2e2",borderRadius:14,padding:"14px",border:`2px solid ${piggybank>=0?"#16a34a":"#dc2626"}`,marginBottom:8}}>
        <div style={{fontSize:10,color:"#6b7280",fontWeight:700,marginBottom:4}}>SALDO ACUMULADO (após pagar pavilhão)</div>
        <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:40,color:piggybank>=0?"#16a34a":"#dc2626",lineHeight:1}}>{piggybank>=0?"+":""}{piggybank}€</div>
        <div style={{fontSize:11,color:"#6b7280",marginTop:4}}>Cada jogo desconta {RENT}€ · {COST}€ por jogador</div>
      </div>
      <button className="btn-outline" onClick={()=>setShow(v=>!v)} style={{marginBottom:10}}><Icon name="chart" size={13}/> {show?"ESCONDER":"VER"} ESTATÍSTICAS</button>
      {show&&(
        <div style={{background:"white",borderRadius:14,padding:"14px",border:"1px solid #d1fae5"}}>
          <div style={{fontSize:10,fontWeight:800,color:"#6b7280",marginBottom:10,letterSpacing:1}}>JOGADORES POR JOGO</div>
          {history.length===0&&<p className="empty-msg">Ainda sem jogos registados</p>}
          {history.slice(0,12).map((g,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span style={{fontSize:10,color:"#6b7280",width:55,flexShrink:0}}>{formatShortDate(g.date)}</span>
              <div style={{flex:1,background:"#f0fdf4",borderRadius:99,height:22,overflow:"hidden"}}>
                <div style={{width:`${(g.players_count/MAX_PLAYERS)*100}%`,minWidth:28,background:g.players_count>=MIN_PLAYERS?"linear-gradient(90deg,#16a34a,#4ade80)":"linear-gradient(90deg,#d97706,#fbbf24)",height:"100%",borderRadius:99,display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:6}}>
                  <span style={{fontSize:10,fontWeight:800,color:"white"}}>{g.players_count}</span>
                </div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontSize:10,fontWeight:700,color:"#16a34a"}}>{g.collected}€</div>
                {g.mvp_name&&<div style={{fontSize:9,color:"#d97706"}}>⭐{g.mvp_name}</div>}
                {g.winner_team&&<div style={{fontSize:9,color:"#2563eb"}}>🏆{g.winner_team}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── CONFIRMED LIST ───────────────────────────────────────────────────────────
function ConfirmedList({confirmed=[],onTogglePaid,isAdmin,debts=[],players=[]}) {
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
              ?<button className={`paid-btn ${p.paid?"paid-yes":"paid-no"}`} onClick={()=>onTogglePaid(p.id)}>{p.paid?<><Icon name="check" size={11}/> Pago</>:`Deve ${COST}€`}</button>
              :<span className={`paid-chip ${p.paid?"paid-yes":"paid-no"}`}>{p.paid?"Pago ✓":`Deve ${COST}€`}</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── STATS VIEW ───────────────────────────────────────────────────────────────
function StatsView({members=[],history=[],debts=[],mvpVotes=[],piggybank=0,player,darkMode,onBack}) {
  const dm=darkMode;
  // ranking by total_games
  const ranked=[...(members||[])].filter(p=>!p.is_guest).sort((a,b)=>(b.total_games||0)-(a.total_games||0));
  const mvpCounts={};
  history.forEach(g=>{if(g.mvp_name)mvpCounts[g.mvp_name]=(mvpCounts[g.mvp_name]||0)+1;});
  const myDebt=debts.filter(d=>d.player_id===player.id).reduce((s,d)=>s+Number(d.amount),0);
  const pct=player.total_games>0?Math.round(((player.total_games||0)/Math.max(...ranked.map(p=>p.total_games||0),1))*100):0;

  return (
    <div className="screen">
      <div style={{background:"#166534",padding:"16px 16px 20px",borderBottom:"3px solid white"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button className="field-nav-btn" onClick={onBack}><Icon name="left" size={14}/></button>
          <span style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:"white",letterSpacing:2}}>ESTATÍSTICAS</span>
        </div>
      </div>
      <div className="body">
        {/* My card */}
        <div style={{background:dm?"#1a2e1a":"white",border:`2px solid #16a34a`,borderRadius:16,padding:16,marginBottom:16,display:"flex",gap:14,alignItems:"center"}}>
          <Avatar player={player} size={52}/>
          <div style={{flex:1}}>
            <div style={{fontSize:16,fontWeight:800,color:dm?"white":"#14532d"}}>{player.name}</div>
            <div style={{fontSize:11,color:"#6b7280",marginTop:2}}>{player.is_admin?"Admin ★":"Jogador"}</div>
            <div style={{display:"flex",gap:12,marginTop:8}}>
              <div><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:24,color:"#16a34a"}}>{player.total_games||0}</div><div style={{fontSize:9,color:"#6b7280",letterSpacing:1}}>JOGOS</div></div>
              <div><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:24,color:"#2563eb"}}>{player.total_paid||0}€</div><div style={{fontSize:9,color:"#6b7280",letterSpacing:1}}>PAGO</div></div>
              {myDebt>0&&<div><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:24,color:"#dc2626"}}>{myDebt}€</div><div style={{fontSize:9,color:"#6b7280",letterSpacing:1}}>EM DÍVIDA</div></div>}
              {mvpCounts[player.name]&&<div><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:24,color:"#d97706"}}>{mvpCounts[player.name]}x</div><div style={{fontSize:9,color:"#6b7280",letterSpacing:1}}>MVP</div></div>}
            </div>
          </div>
        </div>

        {/* Ranking */}
        <p className="section-label"><Icon name="trophy" size={12}/> RANKING DE PRESENÇAS</p>
        <div className="player-list" style={{marginBottom:16}}>
          {ranked.map((p,i)=>{
            const pctBar=ranked[0].total_games>0?Math.round(((p.total_games||0)/(ranked[0].total_games||1))*100):0;
            const mvps=mvpCounts[p.name]||0;
            return (
              <div key={p.id} className="list-row" style={{background:p.id===player.id?(dm?"#1a2e1a":"#f0fdf4"):(dm?"#111":"white"),border:p.id===player.id?"2px solid #16a34a":"1px solid #d1fae5"}}>
                <span style={{fontSize:12,fontWeight:800,color:i===0?"#d97706":i===1?"#94a3b8":i===2?"#b45309":"#9ca3af",width:18,flexShrink:0}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}`}</span>
                <Avatar player={p} size={28}/>
                <div className="list-info">
                  <span className="list-name" style={{color:dm?"white":"#14532d"}}>{p.name}{p.id===player.id?" (tu)":""}</span>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3}}>
                    <div style={{flex:1,height:4,background:dm?"#333":"#f0fdf4",borderRadius:99,overflow:"hidden"}}>
                      <div style={{width:`${pctBar}%`,height:"100%",background:"linear-gradient(90deg,#16a34a,#4ade80)",borderRadius:99}}/>
                    </div>
                    <span style={{fontSize:10,color:"#6b7280",flexShrink:0}}>{p.total_games||0} jogos</span>
                    {mvps>0&&<span style={{fontSize:10,color:"#d97706",flexShrink:0}}>⭐{mvps}</span>}
                  </div>
                </div>
                <span style={{fontFamily:"'Bebas Neue',cursive",fontSize:18,color:"#16a34a"}}>{p.total_paid||0}€</span>
              </div>
            );
          })}
        </div>

        <PiggyBankCard piggybank={piggybank} history={history}/>
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
      <div style={{flex:1,overflowY:"auto",padding:"12px 16px",background:dm?"#0a0f0a":"#f0fdf4",display:"flex",flexDirection:"column",gap:8}}>
        {messages.length===0&&<p className="empty-msg">Sem mensagens ainda. Diz algo! 💬</p>}
        {messages.map(msg=>{
          const isMe=msg.player_id===player.id;
          const pl=players.find(p=>p.id===msg.player_id)||{name:msg.player_name,avatar_color:"#16a34a"};
          return (
            <div key={msg.id} style={{display:"flex",gap:8,flexDirection:isMe?"row-reverse":"row",alignItems:"flex-end"}}>
              {!isMe&&<Avatar player={pl} size={28}/>}
              <div style={{maxWidth:"75%"}}>
                {!isMe&&<div style={{fontSize:10,color:"#6b7280",marginBottom:3,marginLeft:4}}>{msg.player_name}</div>}
                <div style={{background:isMe?"#16a34a":(dm?"#1a2e1a":"white"),color:isMe?"white":(dm?"white":"#14532d"),borderRadius:isMe?"14px 14px 4px 14px":"14px 14px 14px 4px",padding:"8px 12px",fontSize:13,fontWeight:500,border:isMe?"none":`1px solid ${dm?"#333":"#d1fae5"}`}}>
                  {msg.message}
                </div>
                <div style={{fontSize:9,color:"#9ca3af",marginTop:2,textAlign:isMe?"right":"left"}}>{formatTime(new Date(msg.created_at).getTime())}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef}/>
      </div>
      <div style={{padding:"10px 16px",background:dm?"#111":"white",borderTop:`1px solid ${dm?"#333":"#d1fae5"}`,display:"flex",gap:8,flexShrink:0}}>
        <input className="text-input" style={{flex:1}} placeholder="Escreve uma mensagem..." value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(onSendMessage(text),setText(""))}/>
        <button className="btn-add" onClick={()=>{onSendMessage(text);setText("");}}><Icon name="send" size={16}/></button>
      </div>
    </div>
  );
}

// ── PROFILE VIEW ─────────────────────────────────────────────────────────────
function ProfileView({player,darkMode,onUpdateProfile,onBack,onLogout}) {
  const [newName,setNewName]=useState(player.name);
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
              <button key={c} onClick={()=>setColor(c)} style={{width:32,height:32,borderRadius:"50%",background:c,border:color===c?"3px solid #14532d":"2px solid transparent",cursor:"pointer",flexShrink:0}}/>
            ))}
          </div>
        </div>

        <div style={{background:dm?"#1a2e1a":"white",border:"2px solid #d1fae5",borderRadius:14,padding:16,display:"flex",flexDirection:"column",gap:10}}>
          <label className="field-label">Nome</label>
          <input className="text-input" value={newName} onChange={e=>setNewName(e.target.value)}/>
          <label className="field-label">Nova password</label>
          <div className="pw-row">
            <input className="text-input" type={showPw?"text":"password"} value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="Nova password..."/>
            <button className="icon-ghost" onClick={()=>setShowPw(v=>!v)}><Icon name={showPw?"eyeoff":"eye"} size={15}/></button>
          </div>
          <label className="field-label">Confirmar password</label>
          <input className="text-input" type={showPw?"text":"password"} value={newPwC} onChange={e=>setNewPwC(e.target.value)} placeholder="Repetir password..."/>
          <button className="btn-primary" style={{justifyContent:"center"}} onClick={()=>{
            if(newPw&&newPw!==newPwC){alert("As passwords não coincidem!");return;}
            onUpdateProfile(newName,newPw,color);
            setTimeout(()=>onLogout(),800);
          }}><Icon name="check" size={15}/> GUARDAR E SAIR</button>
          <p style={{fontSize:11,color:"#6b7280",textAlign:"center"}}>💡 Após guardar volta a entrar com os novos dados.</p>
        </div>
      </div>
    </div>
  );
}

// ── PLAYER VIEW ──────────────────────────────────────────────────────────────
function PlayerView({gameInfo,cdStr,confirmed,waiting,notYet,guests,spotsLeft,players,members,debts,messages,mvpVotes,history,piggybank,viewingDate,setViewingDate,historyGame,isViewingHistory,effectiveDate,darkMode,setDarkMode,player,onToggle,onAddGuest,onRemoveGuest,onUpdateProfile,onVoteMvp,onSendMessage,onUpdatePosition,onLogout,setView}) {
  const isIn=player.status==="in", isWait=player.status==="wait";
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
            <button className="icon-ghost" onClick={()=>setView("stats")}><Icon name="chart" size={16}/></button>
            <button className="icon-ghost" onClick={()=>setView("profile")}><Icon name="user" size={16}/></button>
            <button className="icon-ghost" onClick={onLogout}><Icon name="logout" size={16}/></button>
          </div>
        </div>

        {totalDebt>0&&(
          <div style={{background:"#fef3c7",border:"2px solid #d97706",borderRadius:12,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
            <Icon name="warn" size={18}/>
            <div>
              <div style={{fontSize:13,fontWeight:800,color:"#92400e"}}>Tens {totalDebt}€ em dívida</div>
              <div style={{fontSize:11,color:"#b45309"}}>{myDebts.map(d=>d.description).join(" · ")}</div>
            </div>
          </div>
        )}

        <div className={`status-banner sb-${isIn?"in":isWait?"wait":"out"}`}>
          <span className="sb-icon">{isIn?"✅":isWait?"⏳":"⚽"}</span>
          <div>
            <div className="sb-title">{isIn?"Confirmado!":isWait?`Lista de espera #${waitPos}`:"Ainda não respondeste"}</div>
            <div className="sb-sub">{isIn?"Estás dentro":isWait?"Aguarda vaga":`${spotsLeft} vagas`}</div>
          </div>
        </div>

        <button className={`btn-big ${isIn||isWait?"btn-red":"btn-green"}`} onClick={onToggle}>
          {isIn||isWait?<><Icon name="x" size={18}/> CANCELAR PRESENÇA</>:<><Icon name="check" size={18}/> CONFIRMAR PRESENÇA</>}
        </button>

        {/* Position selector */}
        <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"center"}}>
          <span style={{fontSize:11,fontWeight:700,color:"#6b7280",letterSpacing:1}}>POSIÇÃO:</span>
          <button onClick={()=>onUpdatePosition("Polivalente")} style={{flex:1,padding:"8px",borderRadius:10,border:`2px solid ${(player.position||"Polivalente")==="Polivalente"?"#16a34a":"#d1fae5"}`,background:(player.position||"Polivalente")==="Polivalente"?"#dcfce7":"white",fontWeight:800,fontSize:13,cursor:"pointer",color:(player.position||"Polivalente")==="Polivalente"?"#14532d":"#6b7280"}}>
            ⚽ Polivalente
          </button>
          <button onClick={()=>onUpdatePosition("GR")} style={{flex:1,padding:"8px",borderRadius:10,border:`2px solid ${player.position==="GR"?"#2563eb":"#d1fae5"}`,background:player.position==="GR"?"#dbeafe":"white",fontWeight:800,fontSize:13,cursor:"pointer",color:player.position==="GR"?"#1e3a8a":"#6b7280"}}>
            🧤 Guarda-Redes
          </button>
        </div>

        {/* MVP vote */}
        {confirmed.length>=MIN_PLAYERS&&(
          <MvpVote confirmed={confirmed} mvpVotes={mvpVotes} currentUserId={player.id} gameDate={gameInfo.date} onVote={onVoteMvp}/>
        )}

        {/* Equipas automáticas */}
        {confirmed.length>=MIN_PLAYERS&&(
          <div className="card-section" style={{marginBottom:14}}>
            <p className="section-label"><Icon name="people" size={12}/> EQUIPAS</p>
            <div style={{background:"#f0fdf4",borderRadius:10,padding:"8px 12px",marginBottom:10,fontSize:12,color:"#166534",fontWeight:600}}>
              {confirmed.length>=15?"🏆 3 equipas de 5":`⚽ 2 equipas${confirmed.length%2!==0?" + suplentes":""}`}
            </div>
            <AutoTeamsDisplay confirmed={confirmed} players={players}/>
          </div>
        )}

        {/* Convidados */}
        <div className="card-section" style={{marginBottom:14}}>
          <p className="section-label"><Icon name="guest" size={12}/> CONVIDAR ALGUÉM</p>
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
        </div>

        <p className="section-label"><Icon name="people" size={12}/> LISTA DO JOGO</p>
        <ConfirmedList confirmed={confirmed} debts={debts} players={players}/>

        {waiting.length>0&&<>
          <p className="section-label" style={{marginTop:14}}><Icon name="clock" size={12}/> LISTA DE ESPERA</p>
          <div className="player-list">{waiting.map((p,i)=><div key={p.id} className="list-row"><span className="list-num">{i+1}</span><Avatar player={players.find(pl=>pl.id===p.id)||p} size={28}/><span className="list-name" style={{marginLeft:4}}>{p.name}</span></div>)}</div>
        </>}

        {/* Dívidas */}
        {debts.length>0&&(()=>{
          const dp=(members||[]).map(m=>({...m,total:(debts||[]).filter(d=>d.player_id===m.id).reduce((s,d)=>s+Number(d.amount),0)})).filter(m=>m.total>0);
          if(!dp.length) return null;
          return (
            <div style={{marginTop:16}}>
              <p className="section-label"><Icon name="warn" size={12}/> DÍVIDAS EM ABERTO</p>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {dp.map(m=>(
                  <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,background:m.id===player.id?"#fff7ed":"white",border:`1px solid ${m.id===player.id?"#f97316":"#d1fae5"}`,borderRadius:10,padding:"9px 14px"}}>
                    <Avatar player={m} size={28}/>
                    <span style={{flex:1,fontSize:13,fontWeight:700,color:"#14532d"}}>{m.name}{m.id===player.id?" (tu)":""}</span>
                    <span style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:"#dc2626"}}>{m.total}€</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        <PiggyBankCard piggybank={piggybank} history={history}/>
      </div>
    </div>
  );
}

// ── ADMIN VIEW ───────────────────────────────────────────────────────────────
function AdminView({gameInfo,cdStr,confirmed,waiting,notYet,guests,spotsLeft,players,members,history,piggybank,debts,messages,mvpVotes,viewingDate,setViewingDate,historyGame,isViewingHistory,effectiveDate,darkMode,setDarkMode,currentUser,adminTab,setAdminTab,onTogglePaid,onRemovePlayer,onAddPlayer,onChangePassword,onResetGame,onTogglePresence,onAddGuest,onRemoveGuest,onUpdateGameInfo,onUpdateProfile,onAddDebt,onPayDebt,onSendMessage,onVoteMvp,onLogout,showToast,setView}) {
  const [newName,setNewName]=useState("");
  const [newPass,setNewPass]=useState("");
  const [editPassId,setEditPassId]=useState(null);
  const [editPassVal,setEditPassVal]=useState("");
  const [guestName,setGuestName]=useState("");
  const [editLoc,setEditLoc]=useState(gameInfo.location);
  const [editDate,setEditDate]=useState(gameInfo.date);
  const [editTime,setEditTime]=useState(gameInfo.time);
  const [edited,setEdited]=useState(false);
  const [teams,setTeams]=useState(null);
  const [winnerTeam,setWinnerTeam]=useState(null);
  const [debtPlayer,setDebtPlayer]=useState("");
  const [debtAmount,setDebtAmount]=useState("");
  const [debtDesc,setDebtDesc]=useState("");
  const [showReset,setShowReset]=useState(false);
  useEffect(()=>{setEditLoc(gameInfo.location);setEditDate(gameInfo.date);setEditTime(gameInfo.time);},[gameInfo]);

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
            <button className="icon-ghost" onClick={()=>setView("stats")}><Icon name="chart" size={16}/></button>
            <button className="icon-ghost" onClick={()=>setView("profile")}><Icon name="user" size={16}/></button>
            <button className="icon-ghost" onClick={onLogout}><Icon name="logout" size={16}/></button>
          </div>
        </div>

        <div className="money-row">
          <div className="money-box green-box"><span className="money-num">{totalPaid*COST}€</span><span className="money-label">Recebido</span></div>
          <div className="money-box red-box"><span className="money-num">{totalUnpaid*COST}€</span><span className="money-label">Por receber</span></div>
          <div className="money-box" style={{background:piggybank>=0?"#dcfce7":"#fee2e2"}}>
            <span className="money-num" style={{color:piggybank>=0?"#16a34a":"#dc2626"}}>{piggybank>=0?"+":""}{piggybank}€</span>
            <span className="money-label">Mealheiro</span>
          </div>
        </div>

        <div className="tabs">
          {[["jogo","⚽"],["equipas","🎲"],["dividas","💸"],["jogadores","👥"],["gerir","⚙️"]].map(([k,l])=>(
            <button key={k} className={`tab ${adminTab===k?"tab-active":""}`} onClick={()=>setAdminTab(k)}>{l}</button>
          ))}
        </div>

        {/* JOGO */}
        {adminTab==="jogo"&&<>
          <p className="section-label">✅ CONFIRMADOS ({confirmed.length})</p>
          <ConfirmedList confirmed={confirmed} onTogglePaid={onTogglePaid} isAdmin debts={debts} players={players}/>
          {waiting.length>0&&<><p className="section-label" style={{marginTop:12}}>⏳ ESPERA</p><div className="player-list">{waiting.map((p,i)=><div key={p.id} className="list-row"><span className="list-num">{i+1}</span><Avatar player={(players||[]).find(pl=>pl.id===p.id)||p} size={26}/><span className="list-name" style={{marginLeft:4}}>{p.name}</span></div>)}</div></>}
          {notYet.length>0&&<><p className="section-label" style={{marginTop:12}}>❓ SEM RESPOSTA ({notYet.length})</p><div className="player-list">{notYet.map(p=><div key={p.id} className="list-row"><Avatar player={(players||[]).find(pl=>pl.id===p.id)||p} size={26}/><span className="list-name" style={{marginLeft:4}}>{p.name}</span></div>)}</div></>}
          {guests.filter(g=>g.status==="in").length>0&&<><p className="section-label" style={{marginTop:12}}>👤 CONVIDADOS</p>
          <div className="player-list">{guests.filter(g=>g.status==="in").map(g=><div key={g.id} className="list-row row-guest"><div className="av-guest">{g.name[0]}</div><div className="list-info"><span className="list-name">{g.name}</span><span className="guest-sub">de {g.invited_by}</span></div><button className={`paid-btn ${g.paid?"paid-yes":"paid-no"}`} onClick={()=>onTogglePaid(g.id)}>{g.paid?<><Icon name="check" size={11}/> Pago</>:`Deve ${COST}€`}</button><button className="icon-danger" onClick={()=>onRemoveGuest(g.id)}><Icon name="trash" size={12}/></button></div>)}</div></>}

          {/* MVP vote for admin */}
          {confirmed.length>=MIN_PLAYERS&&<MvpVote confirmed={confirmed} mvpVotes={mvpVotes} currentUserId={currentUser.id} gameDate={gameInfo.date} onVote={onVoteMvp}/>}

          {!showReset
            ?<button className="btn-danger-full" style={{marginTop:14}} onClick={()=>setShowReset(true)}>🔄 Fechar jogo e guardar no histórico</button>
            :<div style={{background:"#fee2e2",border:"2px solid #dc2626",borderRadius:12,padding:14,marginTop:14}}>
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
              <AutoTeamsDisplay confirmed={confirmed} players={players}/>
              {/* Equipa vencedora */}
              <p className="section-label" style={{marginTop:14}}><Icon name="trophy" size={12}/> EQUIPA VENCEDORA</p>
              <div style={{display:"flex",gap:8}}>
                {["A","B","C"].slice(0,confirmed.length>=15?3:2).map(t=>(
                  <button key={t} onClick={()=>setWinnerTeam(winnerTeam===t?null:t)} style={{flex:1,padding:"10px",borderRadius:10,border:`2px solid ${winnerTeam===t?"#d97706":"#d1fae5"}`,background:winnerTeam===t?"#fef3c7":"white",fontWeight:800,fontSize:13,cursor:"pointer",color:winnerTeam===t?"#92400e":"#6b7280"}}>
                    {winnerTeam===t?"🏆":""} Equipa {t}
                  </button>
                ))}
              </div>
              {winnerTeam&&<div style={{background:"#fef3c7",borderRadius:10,padding:"10px 14px",marginTop:8,fontSize:13,fontWeight:700,color:"#92400e",textAlign:"center"}}>🏆 Equipa {winnerTeam} venceu!</div>}
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
            <div key={m.id} style={{background:"#fff7ed",border:"2px solid #f97316",borderRadius:12,padding:12,marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <Avatar player={(players||[]).find(p=>p.id===m.id)||m} size={30}/>
                  <span style={{fontWeight:800,fontSize:14,color:"#14532d"}}>{m.name}</span>
                </div>
                <span style={{fontFamily:"'Bebas Neue',cursive",fontSize:22,color:"#dc2626"}}>{m.total}€</span>
              </div>
              {m.debts.map(d=>(
                <div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"white",borderRadius:8,padding:"6px 10px",marginBottom:5,border:"1px solid #fed7aa"}}>
                  <span style={{fontSize:12,color:"#6b7280"}}>{d.description}</span>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:12,fontWeight:700,color:"#dc2626"}}>{d.amount}€</span>
                    <button className="btn-primary" style={{padding:"4px 10px",fontSize:11}} onClick={()=>onPayDebt(d.id)}><Icon name="check" size={11}/> Pago</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
          <p className="section-label" style={{marginTop:14}}>REGISTAR DÍVIDA MANUAL</p>
          <div style={{background:"white",border:"1px solid #d1fae5",borderRadius:12,padding:12,display:"flex",flexDirection:"column",gap:8}}>
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
                  <span className="guest-sub">{p.status==="in"?"✅ Confirmado":p.status==="wait"?"⏳ Espera":"❌ Fora"} · {p.total_games||0} jogos</span>
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
            <div className="game-info-header"><Icon name="edit" size={13}/> INFORMAÇÕES DO JOGO</div>
            <label className="field-label"><Icon name="pin" size={11}/> Local</label>
            <input className="text-input" value={editLoc} onChange={e=>{setEditLoc(e.target.value);setEdited(true);}}/>
            <div className="date-time-row">
              <div style={{flex:1}}><label className="field-label"><Icon name="cal" size={11}/> Data</label><input className="text-input" type="date" value={editDate} onChange={e=>{setEditDate(e.target.value);setEdited(true);}}/></div>
              <div style={{width:100}}><label className="field-label"><Icon name="clock" size={11}/> Hora</label><input className="text-input" type="time" value={editTime} onChange={e=>{setEditTime(e.target.value);setEdited(true);}}/></div>
            </div>
            <button className={`btn-save ${edited?"btn-save-active":""}`} disabled={!edited} onClick={()=>{onUpdateGameInfo({location:editLoc,date:editDate,time:editTime});setEdited(false);}}>
              <Icon name="check" size={13}/> {edited?"GUARDAR":"SEM ALTERAÇÕES"}
            </button>
          </div>
          <p className="section-label" style={{marginTop:16}}><Icon name="plus" size={11}/> ADICIONAR MEMBRO</p>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <input className="text-input" placeholder="Nome..." value={newName} onChange={e=>setNewName(e.target.value)}/>
            <input className="text-input" placeholder="Password inicial..." value={newPass} onChange={e=>setNewPass(e.target.value)}/>
            <button className="btn-primary" onClick={()=>{onAddPlayer(newName,newPass);setNewName("");setNewPass("");}}>
              <Icon name="plus" size={14}/> Adicionar membro
            </button>
          </div>
          <p style={{fontSize:11,color:"#6b7280",marginTop:8}}>💡 Partilha a password pelo WhatsApp.</p>
        </>}
      </div>
    </div>
  );
}

// ── CSS ──────────────────────────────────────────────────────────────────────
function getCss(dm) {
  const bg    = dm?"#0a0f0a":"#f0fdf4";
  const card  = dm?"#111":"white";
  const text  = dm?"#e2e8f0":"#14532d";
  const muted = dm?"#4b5563":"#6b7280";
  const border= dm?"#1f2f1f":"#d1fae5";
  const input = dm?"#0a1a0a":"#f0fdf4";
  return `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;600;700;800&display=swap');
@keyframes spin{to{transform:rotate(360deg);}}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{background:${dm?"#0a0f0a":"#0d1a0e"};font-family:'DM Sans',sans-serif;color:${text};min-height:100vh;}
.screen{min-height:100vh;display:flex;flex-direction:column;max-width:480px;margin:0 auto;}
.spinner{width:36px;height:36px;border:4px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;}
.field-header{position:relative;overflow:hidden;background:#166534;padding:16px 16px 14px;border-bottom:3px solid #fff;}
.field-lines{position:absolute;inset:0;pointer-events:none;}
.fl{position:absolute;border:1.5px solid rgba(255,255,255,0.1);}
.fl-cc{width:100px;height:100px;border-radius:50%;top:50%;left:50%;transform:translate(-50%,-50%);}
.fl-cl{top:0;bottom:0;left:50%;width:0;border-left:1.5px solid rgba(255,255,255,0.1);}
.fl-lb{top:15%;bottom:15%;left:-20px;width:65px;border-radius:0 8px 8px 0;}
.fl-rb{top:15%;bottom:15%;right:-20px;width:65px;border-radius:8px 0 0 8px;}
.field-content{position:relative;z-index:1;}
.field-badge{display:flex;align-items:center;gap:7px;}
.field-badge-name{font-family:'Bebas Neue',cursive;font-size:20px;letter-spacing:3px;color:white;}
.field-nav-btn{background:rgba(0,0,0,0.25);border:none;border-radius:8px;padding:5px 7px;color:white;cursor:pointer;display:flex;align-items:center;font-family:'DM Sans',sans-serif;}
.field-nav-btn:hover{background:rgba(0,0,0,0.4);}
.field-date{font-size:11px;color:rgba(255,255,255,0.75);text-transform:capitalize;margin:4px 0;}
.field-timeloc{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:5px;}
.field-chip{display:inline-flex;align-items:center;gap:3px;background:rgba(0,0,0,0.25);border-radius:20px;padding:2px 8px;font-size:10px;color:rgba(255,255,255,0.85);font-weight:600;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.field-cd{font-family:'Bebas Neue',cursive;font-size:12px;color:#bbf7d0;background:rgba(0,0,0,0.2);border-radius:20px;padding:2px 9px;}
.score-block{display:flex;flex-direction:column;align-items:center;}
.score-num{font-family:'Bebas Neue',cursive;font-size:38px;line-height:1;}
.score-num.green{color:#4ade80;}.score-num.white{color:white;}
.score-label{font-size:8px;font-weight:700;letter-spacing:1.5px;color:rgba(255,255,255,0.4);margin-top:1px;}
.score-sep{font-family:'Bebas Neue',cursive;font-size:22px;color:rgba(255,255,255,0.3);}
.pct-bar{height:4px;background:rgba(255,255,255,0.2);border-radius:99px;overflow:hidden;margin-bottom:4px;}
.pct-fill{height:100%;background:#4ade80;border-radius:99px;transition:width .6s;}
.pct-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:5px;}
.pct-label{font-size:10px;font-weight:700;}
.pct-label.green{color:#4ade80;}.pct-label.muted{color:rgba(255,255,255,0.4);}.pct-label.yellow{color:#fbbf24;}
.body,.login-body{flex:1;background:${bg};color:${text};padding:16px 16px 48px;}
.topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;}
.topbar-name{font-size:14px;color:#166534;}
.section-label{font-size:10px;font-weight:800;letter-spacing:1.5px;color:${muted};text-transform:uppercase;margin-bottom:8px;display:flex;align-items:center;gap:5px;}
.player-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;}
.player-card{background:${card};border:2px solid ${border};border-radius:12px;padding:12px 8px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;transition:all .15s;color:${text};font-family:'DM Sans',sans-serif;}
.player-card:hover,.player-card.selected{border-color:#16a34a;box-shadow:0 0 0 3px rgba(22,163,74,.15);}
.player-card-name{font-size:12px;font-weight:700;}
.av-wait{width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#d97706,#b45309);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:white;flex-shrink:0;}
.av-out{width:28px;height:28px;border-radius:50%;background:${dm?"#333":"#d1fae5"};color:${muted};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0;}
.av-guest{width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#6d28d9);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:white;flex-shrink:0;}
.pw-box{background:${card};border:2px solid ${border};border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px;}
.pw-label{font-size:13px;color:${muted};}.pw-label strong{color:${text};}
.pw-row{display:flex;gap:8px;}
.pw-input{flex:1;background:${input};border:2px solid ${border};border-radius:10px;padding:10px 14px;color:${text};font-size:14px;outline:none;font-family:'DM Sans',sans-serif;}
.pw-input:focus{border-color:#16a34a;}
.btn-primary{background:#16a34a;color:white;border:none;border-radius:10px;padding:11px 18px;font-weight:800;cursor:pointer;font-size:13px;font-family:'DM Sans',sans-serif;display:flex;align-items:center;gap:6px;}
.btn-primary:hover{background:#15803d;}
.btn-outline{width:100%;padding:10px;border-radius:10px;border:2px solid ${border};background:${card};color:#16a34a;font-weight:800;font-size:12px;font-family:'DM Sans',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;}
.btn-outline:hover{background:${dm?"#1a2e1a":"#f0fdf4"};}
.btn-big{width:100%;padding:13px;border-radius:12px;border:none;cursor:pointer;font-size:14px;font-weight:800;font-family:'Bebas Neue',cursive;letter-spacing:1.5px;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:14px;}
.btn-big:hover{filter:brightness(1.08);}
.btn-green{background:#16a34a;color:white;}.btn-red{background:#dc2626;color:white;}
.btn-add{background:#16a34a;color:white;border:none;border-radius:10px;padding:10px 13px;cursor:pointer;display:flex;align-items:center;flex-shrink:0;}
.btn-danger-full{background:#fee2e2;color:#dc2626;border:none;border-radius:10px;padding:12px;font-weight:800;cursor:pointer;font-size:12px;font-family:'DM Sans',sans-serif;width:100%;text-align:center;}
.icon-ghost{background:transparent;border:none;border-radius:8px;padding:7px;color:${muted};cursor:pointer;display:flex;align-items:center;}
.icon-ghost:hover{background:${dm?"#1a2e1a":"#d1fae5"};}
.icon-danger{background:#fee2e2;border:none;border-radius:8px;padding:7px;color:#dc2626;cursor:pointer;display:flex;flex-shrink:0;}
.status-banner{border-radius:14px;padding:12px 14px;display:flex;align-items:center;gap:12px;margin-bottom:14px;}
.sb-in{background:#dcfce7;}.sb-wait{background:#fef3c7;}.sb-out{background:${dm?"#1a2e1a":bg};border:2px solid ${border};}
.sb-icon{font-size:22px;}.sb-title{font-size:14px;font-weight:800;color:${text};}.sb-sub{font-size:11px;color:${muted};margin-top:2px;}
.player-list{display:flex;flex-direction:column;gap:5px;margin-bottom:4px;}
.list-row{display:flex;align-items:center;gap:8px;background:${card};border-radius:10px;padding:9px 12px;border:1px solid ${border};}
.row-guest{border-color:#ede9fe;background:${dm?"#1a1330":"#faf5ff"};}
.list-num{font-size:10px;color:${muted};width:14px;text-align:center;flex-shrink:0;}
.list-info{display:flex;flex-direction:column;flex:1;min-width:0;}
.list-name{font-size:13px;font-weight:700;color:${text};}
.guest-sub{font-size:10px;color:#7c3aed;margin-top:1px;}
.admin-chip{color:#16a34a;}
.empty-msg{font-size:12px;color:${muted};text-align:center;padding:12px 0;}
.paid-chip,.paid-btn{font-size:11px;font-weight:700;border-radius:8px;padding:4px 9px;flex-shrink:0;}
.paid-chip{border:none;}.paid-btn{border:none;cursor:pointer;display:flex;align-items:center;gap:3px;font-family:'DM Sans',sans-serif;}
.paid-yes{background:#dcfce7;color:#16a34a;}.paid-no{background:#fee2e2;color:#dc2626;}
.money-row{display:flex;gap:8px;margin-bottom:14px;}
.money-box{flex:1;border-radius:12px;padding:10px 8px;text-align:center;display:flex;flex-direction:column;gap:3px;}
.green-box{background:#dcfce7;}.red-box{background:#fee2e2;}
.money-num{font-family:'Bebas Neue',cursive;font-size:22px;line-height:1;}
.green-box .money-num{color:#16a34a;}.red-box .money-num{color:#dc2626;}
.money-label{font-size:9px;font-weight:800;letter-spacing:1px;color:${muted};text-transform:uppercase;}
.card-section{background:${card};border:2px solid ${border};border-radius:14px;padding:13px;}
.tabs{display:flex;gap:2px;background:${dm?"#1a2e1a":"#d1fae5"};border-radius:10px;padding:3px;margin-bottom:14px;}
.tab{flex:1;padding:7px 2px;border-radius:8px;border:none;cursor:pointer;background:transparent;color:${muted};font-size:15px;font-family:'DM Sans',sans-serif;transition:all .15s;}
.tab-active{background:#16a34a;color:white;}
.guest-locked{background:${dm?"#1a2e1a":bg};border:2px dashed ${border};border-radius:10px;padding:14px;text-align:center;font-size:13px;color:${muted};}
.guest-hint{background:#fef3c7;border-radius:10px;padding:9px 12px;font-size:11px;color:#92400e;font-weight:600;margin-bottom:8px;}
.add-guest-row{display:flex;gap:8px;margin-bottom:8px;}
.guest-row{display:flex;align-items:center;gap:8px;background:${dm?"#1a1330":"#faf5ff"};border-radius:10px;padding:8px 10px;margin-top:6px;border:1px solid #ede9fe;}
.guest-row-name{flex:1;font-size:13px;font-weight:700;color:${text};}
.tag-guest{font-size:10px;font-weight:700;background:#ede9fe;color:#7c3aed;border-radius:20px;padding:2px 8px;flex-shrink:0;}
.text-input{background:${input};border:2px solid ${border};border-radius:10px;padding:10px 14px;color:${text};font-size:13px;font-family:'DM Sans',sans-serif;outline:none;width:100%;}
.text-input:focus{border-color:#16a34a;}
.text-input::placeholder{color:${muted};}
input[type="date"],input[type="time"]{color-scheme:${dm?"dark":"light"};}
select.text-input{appearance:none;}
.game-info-card{background:${card};border:2px solid ${border};border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px;}
.game-info-header{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800;letter-spacing:1px;color:#166534;text-transform:uppercase;}
.field-label{font-size:11px;font-weight:700;color:${muted};display:flex;align-items:center;gap:4px;margin-bottom:4px;}
.date-time-row{display:flex;gap:10px;}
.btn-save{width:100%;padding:11px;border-radius:10px;border:2px solid ${border};background:${dm?"#1a2e1a":bg};color:${muted};font-weight:800;font-size:12px;font-family:'DM Sans',sans-serif;cursor:not-allowed;display:flex;align-items:center;justify-content:center;gap:6px;transition:all .2s;}
.btn-save-active{background:#16a34a;color:white;border-color:#16a34a;cursor:pointer;}
.btn-save-active:hover{background:#15803d;}
.toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);border-radius:12px;padding:11px 20px;font-size:13px;font-weight:700;color:white;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.3);white-space:nowrap;font-family:'DM Sans',sans-serif;}
.toast-ok{background:#16a34a;}.toast-warn{background:#d97706;}.toast-err{background:#dc2626;}
`;
}
