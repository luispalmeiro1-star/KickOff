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
function getAvatar(player) { return player?.avatar_color || AVATAR_COLORS[0]; }
function assignTeams(confirmed) {
  const n = confirmed.length;
  if (n === 0) return {};
  const numTeams = n >= 15 ? 3 : 2;
  const teams = Array.from({length: numTeams}, () => []);
  const teamNames = ["A", "B", "C"];
  const grs = shuffle(confirmed.filter(p => p.position === "GR"));
  const pols = shuffle(confirmed.filter(p => p.position !== "GR"));
  grs.slice(0, numTeams).forEach((gr, i) => teams[i].push(gr));
  const rest = shuffle([...pols, ...grs.slice(numTeams)]);
  rest.forEach(p => {
    const minLen = Math.min(...teams.map(t => t.length));
    const candidates = teams.map((t,i) => ({t,i})).filter(({t}) => t.length === minLen);
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    chosen.t.push(p);
  });
  const result = {};
  teams.forEach((team, ti) => {
    team.slice(0, 5).forEach(p => { result[p.id] = teamNames[ti]; });
    team.slice(5).forEach(p => { result[p.id] = "SUB"; });
  });
  return result;
}

const Icon = ({name,size=18}) => {
  const icons = {
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
    left:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>,
    right:   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>,
    warn:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    star:    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
    chat:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
    user:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    trophy:  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>,
    send:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
    share:   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
    copy:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  };
  return icons[name]||null;
};

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
  const [gameInfo, setGameInfo]       = useState({location:"",date:nextWednesday(),time:"22:30",app_name:"Hoje Há Jogo",cost_per_player:3});
  const [history, setHistory]         = useState([]);
  const [debts, setDebts]             = useState([]);
  const [messages, setMessages]       = useState([]);
  const [mvpVotes, setMvpVotes]       = useState([]);
  const [piggybank, setPiggybank]     = useState(0);
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView]               = useState("landing");
  const [toast, setToast]             = useState(null);
  const [adminTab, setAdminTab]       = useState("jogo");
  const [loading, setLoading]         = useState(true);
  const [viewingDate, setViewingDate] = useState(null);
  const [historyGame, setHistoryGame] = useState(null);
  const [attendance, setAttendance]   = useState([]);
  const isViewingHistory = !!viewingDate;
  const effectiveDate = viewingDate || gameInfo.date;

  const showToast = (msg,type="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };
  const groupIdRef = useRef(null); // guarda o groupId atual para os subscriptions

  const loadPlayers    = useCallback(async(gid=null)=>{ let q=supabase.from("players").select("*").order("id"); if(gid) q=q.eq("group_id",gid); const{data}=await q; if(data)setPlayers(data); },[]);
  const loadGameInfo   = useCallback(async(gid=null)=>{ let q=supabase.from("game_info").select("*"); if(gid){q=q.eq("group_id",gid).limit(1).single();}else{q=q.eq("id",1).single();} const{data}=await q; if(data)setGameInfo(data); },[]);
  const loadHistory    = useCallback(async(gid=null)=>{ let q=supabase.from("game_history").select("*").order("date",{ascending:false}); if(gid) q=q.eq("group_id",gid); const{data}=await q; if(data){setHistory(data);setPiggybank(data.reduce((s,g)=>s+(Number(g.collected)||0)-(g.players_count>0?RENT:0),0));} },[]);
  const loadDebts      = useCallback(async(gid=null)=>{ let q=supabase.from("debts").select("*").order("created_at"); if(gid) q=q.eq("group_id",gid); const{data}=await q; if(data)setDebts(data); },[]);
  const loadMessages   = useCallback(async(gid=null)=>{ let q=supabase.from("chat_messages").select("*").order("created_at").limit(100); if(gid) q=q.eq("group_id",gid); const{data}=await q; if(data)setMessages(data); },[]);
  const loadMvp        = useCallback(async(gid=null)=>{ let q=supabase.from("mvp_votes").select("*"); if(gid) q=q.eq("group_id",gid); const{data}=await q; if(data)setMvpVotes(data); },[]);
  const loadAttendance = useCallback(async(gid=null)=>{ let q=supabase.from("game_attendance").select("*").order("game_date",{ascending:false}); if(gid) q=q.eq("group_id",gid); const{data}=await q; if(data)setAttendance(data); },[]);

  const reloadAll = useCallback(async(gid=null)=>{
    await Promise.all([loadPlayers(gid),loadGameInfo(gid),loadHistory(gid),loadDebts(gid),loadMessages(gid),loadMvp(gid),loadAttendance(gid)]);
  },[loadPlayers,loadGameInfo,loadHistory,loadDebts,loadMessages,loadMvp,loadAttendance]);

  useEffect(()=>{
    (async()=>{ setLoading(true); await reloadAll(); setLoading(false); })();
    const subs=[
      supabase.channel("players_ch").on("postgres_changes",{event:"*",schema:"public",table:"players"},()=>loadPlayers(groupIdRef.current)).subscribe(),
      supabase.channel("gameinfo_ch").on("postgres_changes",{event:"*",schema:"public",table:"game_info"},()=>loadGameInfo(groupIdRef.current)).subscribe(),
      supabase.channel("history_ch").on("postgres_changes",{event:"*",schema:"public",table:"game_history"},()=>loadHistory(groupIdRef.current)).subscribe(),
      supabase.channel("debts_ch").on("postgres_changes",{event:"*",schema:"public",table:"debts"},()=>loadDebts(groupIdRef.current)).subscribe(),
      supabase.channel("chat_ch").on("postgres_changes",{event:"*",schema:"public",table:"chat_messages"},()=>loadMessages(groupIdRef.current)).subscribe(),
      supabase.channel("mvp_ch").on("postgres_changes",{event:"*",schema:"public",table:"mvp_votes"},()=>loadMvp(groupIdRef.current)).subscribe(),
    ];
    return()=>subs.forEach(s=>supabase.removeChannel(s));
  },[]);

  useEffect(()=>{ if(!viewingDate){setHistoryGame(null);return;} setHistoryGame(history.find(h=>h.date===viewingDate)||null); },[viewingDate,history]);

  // Actualiza a ref do groupId quando o user faz login
  useEffect(()=>{ if(currentUser?.group_id) groupIdRef.current=currentUser.group_id; },[currentUser]);

  // Fecho automático 3h30 após o jogo — vai buscar dados frescos ao Supabase
  useEffect(()=>{
    if(!gameInfo.date||!gameInfo.time||!currentUser) return;
    const [gy,gm,gd]=gameInfo.date.split("-").map(Number);
    const [gh,gmin]=gameInfo.time.split(":").map(Number);
    const gameEnd=new Date(gy,gm-1,gd,gh,gmin);
    gameEnd.setMinutes(gameEnd.getMinutes()+210); // +3h30
    const msUntilClose=gameEnd-new Date();
    if(msUntilClose<=0) return; // já passou, não agenda
    const groupId=currentUser.group_id||null;
    const gDate=gameInfo.date;
    const gCost=gameInfo.cost_per_player||COST;
    const gId=gameInfo.id||1;
    const timer=setTimeout(async()=>{
      // Buscar dados frescos directamente do Supabase
      const{data:freshPlayers}=await supabase.from("players").select("*").eq(groupId?"group_id":"is_guest",groupId||false);
      if(!freshPlayers) return;
      const freshConfirmed=freshPlayers.filter(p=>p.status==="in");
      const freshMembers=freshPlayers.filter(p=>!p.is_guest);
      // Dívidas para quem não pagou
      for(const p of freshConfirmed.filter(p=>!p.paid&&!p.is_guest))
        await supabase.from("debts").insert({player_id:p.id,player_name:p.name,amount:gCost,description:`Jogo de ${gDate}`,group_id:groupId});
      // Dívidas de convidados — transferidas para quem os convidou
      for(const p of freshConfirmed.filter(p=>!p.paid&&p.is_guest)){
        const inviter=freshPlayers.find(m=>m.id===p.invited_by_id);
        if(inviter) await supabase.from("debts").insert({player_id:inviter.id,player_name:inviter.name,amount:gCost,description:`Jogo de ${gDate} — convidado ${p.name}`,group_id:groupId});
      }
      // Presenças
      for(const p of freshConfirmed.filter(p=>!p.is_guest))
        await supabase.from("game_attendance").insert({game_date:gDate,player_id:p.id,player_name:p.name,group_id:groupId});
      // Estatísticas
      for(const p of freshConfirmed.filter(p=>!p.is_guest)){
        const ns=(p.current_streak||0)+1;
        await supabase.from("players").update({total_games:(p.total_games||0)+1,total_paid:(p.total_paid||0)+(p.paid?gCost:0),current_streak:ns,best_streak:Math.max(p.best_streak||0,ns)}).eq("id",p.id);
      }
      for(const p of freshMembers.filter(m=>!freshConfirmed.find(c=>c.id===m.id)))
        await supabase.from("players").update({current_streak:0}).eq("id",p.id);
      // MVP por votos
      const{data:votes}=await supabase.from("mvp_votes").select("*").eq("game_date",gDate);
      let mvpName=null;
      if(votes&&votes.length>0){const counts={};votes.forEach(v=>{counts[v.voted_for_id]=(counts[v.voted_for_id]||0)+1;});const topId=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];mvpName=freshPlayers.find(p=>p.id===Number(topId))?.name||null;}
      // Histórico (winner_team null — admin decide depois)
      const collected=freshConfirmed.filter(p=>p.paid).length*gCost;
      if(collected>0||freshConfirmed.length>0) await supabase.from("game_history").insert({date:gDate,players_count:freshConfirmed.length,collected,winner_team:null,mvp_name:mvpName,group_id:groupId});
      // Limpar presenças
      await supabase.from("players").delete().eq("is_guest",true);
      if(groupId) await supabase.from("players").update({status:"out",paid:false,confirmed_at:null,team:null}).eq("is_guest",false).eq("group_id",groupId);
      else await supabase.from("players").update({status:"out",paid:false,confirmed_at:null,team:null}).eq("is_guest",false);
      // Próxima data
      const{data:grp}=groupId?await supabase.from("groups").select("game_days").eq("id",groupId).single():{data:null};
      const gameDays=(grp?.game_days||[3]).map(Number).sort((a,b)=>a-b);
      const now2=new Date(); let nextDate=null;
      for(let i=1;i<=14;i++){const d=new Date(now2);d.setDate(now2.getDate()+i);if(gameDays.includes(d.getDay())){nextDate=d.toISOString().split("T")[0];break;}}
      if(!nextDate){const fb=new Date(now2);fb.setDate(now2.getDate()+7);nextDate=fb.toISOString().split("T")[0];}
      await supabase.from("game_info").update({date:nextDate}).eq("id",gId);
      await reloadAll(groupId);
    }, msUntilClose);
    return ()=>clearTimeout(timer);
  },[gameInfo.date, gameInfo.time, currentUser?.id]);

  useEffect(()=>{
    if(loading||currentUser||players.length===0) return;
    try{
      const saved=JSON.parse(localStorage.getItem("hhb_session"));
      if(saved?.playerId){
        const p=players.find(pl=>pl.id===saved.playerId);
        if(p){ setCurrentUser(p); setView(p.is_admin?"admin":"player"); if(saved.groupId) reloadAll(saved.groupId); }
        else setView("landing");
      } else setView("landing");
    }catch(e){setView("landing");}
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
        try{ if(OneSignal.Notifications.permission!==true) await OneSignal.Notifications.requestPermission(); if(OneSignal.Notifications.permission===true) await OneSignal.User.addTag("player_id",String(playerId)); }catch(err){}
      });
    }catch(e){}
  };

  const handleLogin = async(identifier,password,groupId=null)=>{
    const clean=identifier.trim().toLowerCase();
    // Buscar diretamente do Supabase — não depende do estado local
    let q=supabase.from("players").select("*").or(`username.eq.${clean},phone.eq.${identifier.trim().replace(/\s+/g,"")}`);
    if(groupId) q=q.eq("group_id",groupId);
    const{data:candidates}=await q;
    if(!candidates||candidates.length===0) return false;
    const p=candidates.find(c=>c.password===password);
    if(!p) return false;
    // Usar o group_id do próprio player (mesmo que não tenha sido passado)
    const effectiveGroupId=p.group_id||null;
    localStorage.setItem("hhb_session",JSON.stringify({playerId:p.id,groupId:effectiveGroupId}));
    if(effectiveGroupId) await reloadAll(effectiveGroupId);
    else await reloadAll();
    setCurrentUser(p); setView(p.is_admin?"admin":"player");
    linkOneSignal(p.id);
    return true;
  };
  const handleLogout  = ()=>{ setCurrentUser(null); setView("landing"); setViewingDate(null); };
  const switchAccount = ()=>{ localStorage.removeItem("hhb_session"); setCurrentUser(null); setView("landing"); setViewingDate(null); };

  const reassignAllTeams = async(updatedPlayers) => {
    const newConfirmed=updatedPlayers.filter(pl=>pl.status==="in");
    const teamMap=assignTeams(newConfirmed);
    const finalPlayers=updatedPlayers.map(pl=>({...pl,team:teamMap[pl.id]||null}));
    setPlayers(finalPlayers);
    for(const pl of finalPlayers) await supabase.from("players").update({team:teamMap[pl.id]||null}).eq("id",pl.id);
    return finalPlayers;
  };

  const togglePresence = async(playerId)=>{
    const p=players.find(pl=>pl.id===playerId); if(!p) return;
    let ns,na;
    if(p.status==="in"||p.status==="wait"){ns="out";na=null;}
    else if(confirmed.length<MAX_PLAYERS){ns="in";na=Date.now();}
    else{ns="wait";na=Date.now();showToast("Jogo cheio! ⏳","warn");}
    await supabase.from("players").update({status:ns,confirmed_at:na,paid:false}).eq("id",playerId);
    await reassignAllTeams(players.map(pl=>pl.id===playerId?{...pl,status:ns,confirmed_at:na,paid:false}:pl));
  };
  const addGuest = async(guestName,invitedById)=>{
    if(!guestName.trim()) return;
    const inviter=players.find(p=>p.id===invitedById);
    if(!inviter||confirmed.length>=MAX_PLAYERS){showToast("Jogo cheio!","err");return;}
    const{data:inserted}=await supabase.from("players").insert({name:guestName.trim(),is_admin:false,password:null,paid:false,status:"in",is_guest:true,invited_by:inviter.name,invited_by_id:invitedById,confirmed_at:Date.now(),group_id:inviter.group_id||null}).select().single();
    if(inserted) await reassignAllTeams([...players,inserted]);
    showToast(`${guestName} adicionado! 🎉`);
  };
  const removeGuest    = async(id)=>{ await supabase.from("players").delete().eq("id",id); await reassignAllTeams(players.filter(p=>p.id!==id)); showToast("Convidado removido"); };
  const togglePaid     = async(id)=>{ const p=players.find(pl=>pl.id===id); setPlayers(prev=>prev.map(pl=>pl.id===id?{...pl,paid:!p.paid}:pl)); await supabase.from("players").update({paid:!p.paid}).eq("id",id); showToast("Pagamento atualizado ✓"); };
  const removePlayer   = async(id)=>{ setPlayers(prev=>prev.filter(p=>p.id!==id)); await supabase.from("players").delete().eq("id",id); showToast("Jogador removido"); };
  const changePassword = async(id,pw)=>{ await supabase.from("players").update({password:pw}).eq("id",id); };
  const addPlayer      = async(name,username,password,phone)=>{
    if(!name.trim()||!username.trim()||!password.trim()) return;
    const color=AVATAR_COLORS[Math.floor(Math.random()*AVATAR_COLORS.length)];
    const cleanUsername=username.trim().toLowerCase().replace(/\s+/g,"");
    if(players.find(p=>p.username?.toLowerCase()===cleanUsername)){showToast("Esse utilizador já existe!","err");return;}
    const groupId=currentUser?.group_id||null;
    await supabase.from("players").insert({name:name.trim(),username:cleanUsername,phone:phone?.trim()||null,is_admin:false,password:password.trim(),paid:false,status:"out",is_guest:false,avatar_color:color,group_id:groupId});
    showToast(`${name} adicionado! 🎉`);
  };
  const updateGameInfo = async(patch)=>{ setGameInfo(prev=>({...prev,...patch})); await supabase.from("game_info").update(patch).eq("id",gameInfo.id||1); showToast("Jogo atualizado ✓"); };
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
  const updatePosition = async(id,pos)=>{
    await supabase.from("players").update({position:pos}).eq("id",id);
    await reassignAllTeams(players.map(p=>p.id===id?{...p,position:pos}:p));
    showToast("Posição atualizada ✓");
  };
  const sendPushNotification = async(title,message)=>{
    try{ await supabase.functions.invoke("send-notification",{body:{title,message,url:"https://hojehajogo.pt"}}); }catch(e){}
  };
  // Calcula próxima data baseada nos dias habituais do grupo
  const getNextGameDate = (gameDays=[3])=>{
    const days=gameDays.map(Number).sort((a,b)=>a-b);
    const now=new Date();
    // Tentar os próximos 14 dias
    for(let i=1;i<=14;i++){
      const d=new Date(now); d.setDate(now.getDate()+i);
      if(days.includes(d.getDay())) return d.toISOString().split("T")[0];
    }
    // Fallback: 7 dias
    const fb=new Date(now); fb.setDate(now.getDate()+7);
    return fb.toISOString().split("T")[0];
  };

  const resetGame = async(winnerTeam, isAuto=false)=>{
    const gameCost=gameInfo.cost_per_player||COST;
    const collected=confirmed.filter(p=>p.paid).length*gameCost;
    const groupId=currentUser?.group_id||null;
    // Dívidas automáticas para quem não pagou
    for(const p of confirmed.filter(p=>!p.paid&&!p.is_guest))
      await supabase.from("debts").insert({player_id:p.id,player_name:p.name,amount:gameCost,description:`Jogo de ${gameInfo.date}`,group_id:groupId});
    // Dívidas de convidados que não pagaram — transferidas para quem os convidou
    for(const p of confirmed.filter(p=>!p.paid&&p.is_guest)){
      const inviter=players.find(m=>m.id===p.invited_by_id);
      if(inviter) await supabase.from("debts").insert({player_id:inviter.id,player_name:inviter.name,amount:gameCost,description:`Jogo de ${gameInfo.date} — convidado ${p.name}`,group_id:groupId});
    }
    // Registo de presenças
    const confirmedMembers=confirmed.filter(p=>!p.is_guest);
    for(const p of confirmedMembers)
      await supabase.from("game_attendance").insert({game_date:gameInfo.date,player_id:p.id,player_name:p.name,group_id:groupId});
    // Estatísticas dos jogadores
    for(const p of confirmedMembers){
      const pl=players.find(m=>m.id===p.id);
      if(pl){ const ns=(pl.current_streak||0)+1; await supabase.from("players").update({total_games:(pl.total_games||0)+1,total_paid:(pl.total_paid||0)+(p.paid?gameCost:0),current_streak:ns,best_streak:Math.max(pl.best_streak||0,ns)}).eq("id",p.id); }
    }
    for(const p of members.filter(m=>!confirmedMembers.find(c=>c.id===m.id)))
      await supabase.from("players").update({current_streak:0}).eq("id",p.id);
    // MVP por votos
    const votes=mvpVotes.filter(v=>v.game_date===gameInfo.date);
    let mvpName=null;
    if(votes.length>0){ const counts={}; votes.forEach(v=>{counts[v.voted_for_id]=(counts[v.voted_for_id]||0)+1;}); const topId=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0]; mvpName=players.find(p=>p.id===Number(topId))?.name||null; }
    // Histórico (winnerTeam null se automático — admin decide depois)
    if(collected>0||confirmed.length>0) await supabase.from("game_history").insert({date:gameInfo.date,players_count:confirmed.length,collected,winner_team:isAuto?null:winnerTeam||null,mvp_name:mvpName,group_id:groupId});
    // Limpar presenças e convidados
    await supabase.from("players").delete().eq("is_guest",true);
    if(groupId) await supabase.from("players").update({status:"out",paid:false,confirmed_at:null,team:null}).eq("is_guest",false).eq("group_id",groupId);
    else await supabase.from("players").update({status:"out",paid:false,confirmed_at:null,team:null}).eq("is_guest",false);
    // Avançar data para próximo dia habitual
    const{data:grp}=groupId?await supabase.from("groups").select("game_days").eq("id",groupId).single():{data:null};
    const gameDays=grp?.game_days||[3];
    const nextDate=getNextGameDate(gameDays);
    await supabase.from("game_info").update({date:nextDate}).eq("id",gameInfo.id||1);
    showToast(isAuto?"Jogo fechado automaticamente ✓":"Jogo fechado ✓");
    await reloadAll(groupId);
  };
  const addDebt  = async(playerId,playerName,amount,desc)=>{ await supabase.from("debts").insert({player_id:playerId,player_name:playerName,amount,description:desc,group_id:currentUser?.group_id||null}); showToast("Dívida registada ✓"); };
  const payDebt  = async(debtId,amountPaid=null)=>{
    const debt=debts.find(d=>d.id===debtId); if(!debt) return;
    const full=amountPaid===null||amountPaid>=Number(debt.amount);
    const paidNow=full?Number(debt.amount):Number(amountPaid);
    await supabase.from("game_history").insert({date:gameInfo.date,players_count:0,collected:paidNow,winner_team:null,mvp_name:null,group_id:currentUser?.group_id||null});
    if(full){ await supabase.from("debts").delete().eq("id",debtId); showToast("Dívida paga ✓"); }
    else{ await supabase.from("debts").update({amount:Number(debt.amount)-Number(amountPaid)}).eq("id",debtId); showToast(`Pagamento parcial — restam ${Number(debt.amount)-Number(amountPaid)}€`); }
  };
  const clearAllHistory = async()=>{ await supabase.from("game_history").delete().neq("id",0); await supabase.from("debts").delete().neq("id",0); showToast("Histórico e dívidas limpos ✓"); };
  const sendMessage = async(text,playerId,playerName)=>{
    if(!text.trim()) return;
    setMessages(prev=>[...prev,{id:Date.now(),player_id:playerId,player_name:playerName,message:text.trim(),created_at:new Date().toISOString()}]);
    await supabase.from("chat_messages").insert({player_id:playerId,player_name:playerName,message:text.trim(),group_id:currentUser?.group_id||null});
  };
  const voteForMvp = async(voterId,votedForId)=>{
    setMvpVotes(prev=>[...prev.filter(v=>!(v.voter_id===voterId&&v.game_date===gameInfo.date)),{id:Date.now(),voter_id:voterId,voted_for_id:votedForId,game_date:gameInfo.date}]);
    await supabase.from("mvp_votes").upsert({voter_id:voterId,voted_for_id:votedForId,game_date:gameInfo.date,group_id:currentUser?.group_id||null},{onConflict:"voter_id,game_date"});
    showToast("Voto registado ✓");
  };

  const liveUser = currentUser ? players.find(p=>p.id===currentUser.id) : null;
  const effectiveCost = gameInfo.cost_per_player||COST;
  const shared = {gameInfo,cdStr,confirmed,waiting,notYet,guests,spotsLeft,members,players,history,piggybank,debts,messages,mvpVotes,attendance,viewingDate,setViewingDate,historyGame,isViewingHistory,effectiveDate,effectiveCost};

  if(loading) return (
    <div style={{minHeight:"100vh",background:"#0a0a0a",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
      <style>{getCss()}</style>
      <div style={{fontSize:48}}>⚽</div>
      <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:"white",letterSpacing:2}}>HOJE HÁ JOGO</div>
      <div className="spinner"/>
    </div>
  );

  return (
    <div style={{background:"#0a0a0a",minHeight:"100vh"}}>
      <style>{getCss()}</style>
      {toast&&<div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      {view==="landing"        && <LandingView setView={setView}/>}
      {view==="login"          && <LoginView onLogin={handleLogin} showToast={showToast} setView={setView}/>}
      {view==="criar-grupo"    && <CriarGrupoView setView={setView} showToast={showToast} onLogin={handleLogin} reloadAll={reloadAll}/>}
      {view==="entrar-convite" && <EntrarConviteView setView={setView} showToast={showToast}/>}
      {view==="criar-conta"    && <CriarContaView setView={setView} showToast={showToast}/>}
      {view==="player"  && liveUser && <PlayerView  {...shared} view={view} player={liveUser} onToggle={()=>togglePresence(liveUser.id)} onAddGuest={n=>addGuest(n,liveUser.id)} onRemoveGuest={removeGuest} onUpdateProfile={(name,pw,color,phone)=>updateProfile(liveUser.id,name,pw,color,phone)} onVoteMvp={vid=>voteForMvp(liveUser.id,vid)} onSendMessage={t=>sendMessage(t,liveUser.id,liveUser.name)} onUpdatePosition={pos=>updatePosition(liveUser.id,pos)} onLogout={switchAccount} setView={setView}/>}
      {view==="admin"   && liveUser && <AdminView   {...shared} view={view} currentUser={liveUser} adminTab={adminTab} setAdminTab={setAdminTab} onTogglePaid={togglePaid} onRemovePlayer={removePlayer} onAddPlayer={addPlayer} onChangePassword={changePassword} onResetGame={resetGame} onTogglePresence={togglePresence} onAddGuest={n=>addGuest(n,liveUser.id)} onRemoveGuest={removeGuest} onUpdateGameInfo={updateGameInfo} onUpdateProfile={(name,pw,color,phone)=>updateProfile(liveUser.id,name,pw,color,phone)} onAddDebt={addDebt} onPayDebt={payDebt} onClearHistory={clearAllHistory} onSendPush={sendPushNotification} onReassignTeams={reassignAllTeams} onSendMessage={t=>sendMessage(t,liveUser.id,liveUser.name)} onVoteMvp={vid=>voteForMvp(liveUser.id,vid)} onLogout={switchAccount} showToast={showToast} setView={setView}/>}
      {view==="debts"   && liveUser && <DebtsView   {...shared} player={liveUser} onBack={()=>setView(liveUser.is_admin?"admin":"player")}/>}
      {view==="stats"   && liveUser && <StatsView   {...shared} player={liveUser} onBack={()=>setView(liveUser.is_admin?"admin":"player")}/>}
      {view==="chat"    && liveUser && <ChatView    {...shared} player={liveUser} onSendMessage={t=>sendMessage(t,liveUser.id,liveUser.name)} onBack={()=>setView(liveUser.is_admin?"admin":"player")}/>}
      {view==="profile" && liveUser && <ProfileView {...shared} player={liveUser} onUpdateProfile={(name,pw,color,phone)=>updateProfile(liveUser.id,name,pw,color,phone)} onBack={()=>setView(liveUser.is_admin?"admin":"player")} onLogout={handleLogout} onSwitchAccount={switchAccount}/>}
    </div>
  );
}

// ── DEBT ROW ─────────────────────────────────────────────────────────────────
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
      {!showPartial
        ? <button onClick={()=>setShowPartial(true)} style={{background:"none",border:"none",color:"#fbbf24",fontSize:10,fontWeight:600,cursor:"pointer",marginTop:4,padding:0}}>Pagamento parcial?</button>
        : <div style={{display:"flex",gap:6,marginTop:6}}>
            <input className="text-input" type="number" placeholder="Valor recebido..." value={amount} onChange={e=>setAmount(e.target.value)} style={{fontSize:12,padding:"6px 10px"}}/>
            <button style={{background:"#d97706",border:"none",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:800,color:"white",cursor:"pointer",flexShrink:0}} onClick={()=>{if(amount&&Number(amount)>0){onPayDebt(debt.id,Number(amount));setShowPartial(false);setAmount("");}}}>OK</button>
          </div>}
    </div>
  );
}

// ── EXPANDABLE RANKING ───────────────────────────────────────────────────────
function ExpandableRanking({ranked=[], mvpCounts={}, totalGames=0, currentPlayer}) {
  const [expandedId, setExpandedId] = useState(null);
  return (
    <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
      {ranked.map((p,i)=>{
        const isOpen=expandedId===p.id, isMe=p.id===currentPlayer?.id;
        const pctBar=ranked[0]?.total_games>0?Math.round(((p.total_games||0)/(ranked[0].total_games||1))*100):0;
        const mvps=mvpCounts[p.name]||0;
        const pPct=totalGames>0?Math.round(((p.total_games||0)/totalGames)*100):0;
        const medal=i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}`;
        return (
          <div key={p.id} style={{background:isMe?"#16241c":"#13201a",border:isMe?"2px solid #16a34a":"1px solid #23362a",borderRadius:12,overflow:"hidden"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",cursor:"pointer"}} onClick={()=>setExpandedId(isOpen?null:p.id)}>
              <span style={{fontSize:12,fontWeight:800,color:i===0?"#fbbf24":i===1?"#cbd5e1":i===2?"#d97706":"#6b7d70",width:18,flexShrink:0}}>{medal}</span>
              <Avatar player={p} size={28}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:"white"}}>{p.name}{isMe?" (tu)":""}</div>
                <div style={{fontSize:10,color:"#8ba593",display:"flex",gap:8,marginTop:2}}>
                  <span>⚽ {p.total_games||0}</span>{mvps>0&&<span>⭐ {mvps}</span>}<span>📈 {pPct}%</span>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                {(p.current_streak||0)>1&&<span style={{fontSize:10,color:"#f87171",fontWeight:700}}>🔥{p.current_streak}</span>}
                <span style={{fontSize:11,color:"#8ba593"}}>{isOpen?"▲":"▼"}</span>
              </div>
            </div>
            <div style={{height:3,background:"#1a2218",margin:"0 12px 8px 50px",borderRadius:99,overflow:"hidden"}}>
              <div style={{width:`${pctBar}%`,height:"100%",background:"linear-gradient(90deg,#16a34a,#d4af37)",borderRadius:99}}/>
            </div>
            {isOpen&&(
              <div style={{padding:"0 12px 12px 50px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[{label:"🔥 Série Atual",value:`${p.current_streak||0} jogos`},{label:"🏆 Melhor Série",value:`${p.best_streak||0} jogos`},{label:"💰 Total Pago",value:`${p.total_paid||0}€`},{label:"🧤 Posição",value:p.position==="GR"?"Guarda-Redes":"Polivalente"},{label:"⭐ MVPs",value:`${mvps} vez${mvps!==1?"es":"ez"}`},{label:"📈 Presença",value:`${pPct}%`}]
                  .map((s,si)=>(
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
  const allTime={};
  history.forEach(g=>{if(g.mvp_name) allTime[g.mvp_name]=(allTime[g.mvp_name]||0)+1;});
  const ranked=Object.entries(allTime).sort((a,b)=>b[1]-a[1]);
  const lastMvp=history.find(g=>g.mvp_name);
  const thisYear=new Date().getFullYear().toString();
  const yearCounts={};
  history.filter(g=>g.date?.startsWith(thisYear)).forEach(g=>{if(g.mvp_name) yearCounts[g.mvp_name]=(yearCounts[g.mvp_name]||0)+1;});
  const mvpAno=Object.entries(yearCounts).sort((a,b)=>b[1]-a[1])[0];
  if(ranked.length===0) return null;
  return (
    <div style={{marginBottom:14}}>
      <p className="section-label">🏆 HALL OF FAME MVP</p>
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        {lastMvp&&(<div style={{flex:1,background:"rgba(217,119,6,0.15)",borderRadius:12,padding:"10px 12px",border:"1px solid #d97706"}}><div style={{fontSize:9,fontWeight:800,color:"#d97706",letterSpacing:1,marginBottom:4}}>👑 MVP ATUAL</div><div style={{fontSize:14,fontWeight:800,color:"#fbbf24"}}>{lastMvp.mvp_name}</div><div style={{fontSize:10,color:"#fcd34d"}}>{lastMvp.date}</div></div>)}
        {mvpAno&&(<div style={{flex:1,background:"#1e2a3a",borderRadius:12,padding:"10px 12px",border:"1px solid #2563eb"}}><div style={{fontSize:9,fontWeight:800,color:"#60a5fa",letterSpacing:1,marginBottom:4}}>📅 MVP DO ANO</div><div style={{fontSize:14,fontWeight:800,color:"#93c5fd"}}>{mvpAno[0]}</div><div style={{fontSize:10,color:"#60a5fa"}}>{mvpAno[1]} vez{mvpAno[1]!==1?"es":""}</div></div>)}
      </div>
      <div style={{background:"#16241c",borderRadius:14,border:"1px solid #23362a",overflow:"hidden"}}>
        {ranked.map(([name,count],i)=>{
          const pl=members.find(m=>m.name===name);
          return (
            <div key={name} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:i<ranked.length-1?"1px solid #1a2e1a":"none"}}>
              <span style={{fontSize:14,width:20,flexShrink:0}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}`}</span>
              {pl?<Avatar player={pl} size={28}/>:<div style={{width:28,height:28,borderRadius:"50%",background:"#16a34a",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:"white"}}>{name[0]}</div>}
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:"white"}}>{name}</div>
                <div style={{height:4,background:"#0f1a0f",borderRadius:99,marginTop:4,overflow:"hidden"}}><div style={{width:`${(count/ranked[0][1])*100}%`,height:"100%",background:"linear-gradient(90deg,#d97706,#fbbf24)",borderRadius:99}}/></div>
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
  if(history.length>0&&history[0].mvp_name) highlights.push({icon:"⭐",text:`${history[0].mvp_name} foi o MVP do último jogo!`});
  if(history.length>0&&history[0].winner_team) highlights.push({icon:"🏆",text:`Equipa ${history[0].winner_team} venceu o último jogo!`});
  const topPlayer=[...members].sort((a,b)=>(b.total_games||0)-(a.total_games||0))[0];
  if(topPlayer&&topPlayer.total_games>0) highlights.push({icon:"👑",text:`${topPlayer.name} lidera com ${topPlayer.total_games} jogos!`});
  const faltam=15-confirmed.length;
  if(faltam>0&&faltam<=5&&confirmed.length>=8) highlights.push({icon:"🎯",text:`Faltam apenas ${faltam} jogador${faltam!==1?"es":""} para lotação máxima!`});
  const votesHoje=mvpVotes.filter(v=>v.game_date===gameInfo.date);
  if(votesHoje.length>0){const counts={};votesHoje.forEach(v=>{counts[v.voted_for_id]=(counts[v.voted_for_id]||0)+1;});const topId=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];const topMvp=members.find(p=>p.id===Number(topId));if(topMvp) highlights.push({icon:"⭐",text:`${topMvp.name} está a liderar a votação MVP!`});}
  useEffect(()=>{if(highlights.length<=1) return;const t=setInterval(()=>setIdx(i=>(i+1)%highlights.length),4000);return()=>clearInterval(t);},[highlights.length]);
  if(highlights.length===0) return null;
  const h=highlights[idx%highlights.length];
  return (
    <div style={{background:"linear-gradient(135deg,#166534,#15803d)",borderRadius:14,padding:"12px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:12,minHeight:52}}>
      <span style={{fontSize:22,flexShrink:0}}>{h.icon}</span>
      <span style={{fontSize:13,fontWeight:700,color:"white",flex:1}}>{h.text}</span>
      {highlights.length>1&&<div style={{display:"flex",gap:4,flexShrink:0}}>{highlights.map((_,i)=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:i===idx%highlights.length?"white":"rgba(255,255,255,0.3)"}}/>)}</div>}
    </div>
  );
}

// ── GROUP STATUS CARD ────────────────────────────────────────────────────────
function GroupStatusCard({confirmed, notYet, members, players=[]}) {
  const grs=confirmed.filter(p=>(players.find(pl=>pl.id===p.id))?.position==="GR");
  const msgs=[];
  if(confirmed.length>=15) msgs.push({icon:"🎉",text:"Jogo completo! Estamos todos!",color:"#16a34a",bg:"rgba(22,163,74,0.1)"});
  else if(confirmed.length>=12) msgs.push({icon:"🔥",text:`Lotação quase completa — só faltam ${15-confirmed.length}!`,color:"#d97706",bg:"rgba(217,119,6,0.1)"});
  if(grs.length<2&&confirmed.length>=6) msgs.push({icon:"⚠️",text:`Faltam guarda-redes! Só ${grs.length} GR confirmado${grs.length!==1?"s":""}`,color:"#dc2626",bg:"rgba(239,68,68,0.1)"});
  if(confirmed.length>=10&&grs.length>=2&&confirmed.length<15) msgs.push({icon:"✅",text:"Equipas prontas para jogar!",color:"#16a34a",bg:"rgba(22,163,74,0.1)"});
  if(notYet.length>0) msgs.push({icon:"📢",text:`${notYet.length} jogador${notYet.length!==1?"es":""} ainda não ${notYet.length!==1?"responderam":"respondeu"}`,color:"#6b7280",bg:"rgba(107,114,128,0.1)"});
  if(confirmed.length<6) msgs.push({icon:"😴",text:"Ainda poucos confirmados — partilha com o grupo!",color:"#7c3aed",bg:"rgba(124,58,237,0.1)"});
  if(msgs.length===0) return null;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
      {msgs.map((m,i)=>(
        <div key={i} style={{background:m.bg,borderRadius:12,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,border:`1px solid ${m.color}33`}}>
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
      <button onClick={()=>setOpen(v=>!v)} style={{background:"rgba(0,0,0,0.2)",border:"none",borderRadius:20,padding:"3px 10px",color:"rgba(255,255,255,0.9)",fontSize:10,fontWeight:700,cursor:"pointer"}}>
        ✓ {confirmed.length} confirmados {open?"▲":"▼"}
      </button>
      {open&&<div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:6}}>{confirmed.map(p=><span key={p.id} style={{background:p.is_guest?"rgba(124,58,237,0.3)":"rgba(0,0,0,0.25)",borderRadius:20,padding:"2px 7px",fontSize:10,color:p.is_guest?"#c4b5fd":"rgba(255,255,255,0.85)",fontWeight:600}}>{p.name}{p.is_guest?" 👤":""}</span>)}</div>}
    </div>
  );
}

// ── GAME HEADER — design limpo e profissional ────────────────────────────────
function FieldHeader({gameInfo,cdStr,confirmed,notYet,waiting,viewingDate,setViewingDate,historyGame,isViewingHistory,effectiveDate,attendance,extraRight,isLoggedIn=true}) {
  const pct=Math.round((confirmed.length/MAX_PLAYERS)*100);
  const canFwd=viewingDate&&viewingDate<gameInfo.date;
  const now=new Date();
  const [gy,gm,gd]=(gameInfo.date||"2099-01-01").split("-").map(Number);
  const [gh,gmin]=(gameInfo.time||"22:30").split(":").map(Number);
  const gameStart=new Date(gy,gm-1,gd,gh,gmin);
  const gameEnd=new Date(gameStart.getTime()+3.5*60*60*1000);
  const isLive=now>=gameStart&&now<gameEnd;
  const isOver=now>=gameEnd;
  return (
    <div style={{background:"#111",borderBottom:"1px solid #1f1f1f",padding:"16px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div>
          <div style={{fontSize:10,fontWeight:700,color:"#4b5563",letterSpacing:2,marginBottom:3}}>GRUPO</div>
          <div style={{fontSize:20,fontWeight:800,color:"white",letterSpacing:0.5}}>{gameInfo.app_name||"Hoje Há Jogo"}</div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <button style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:10,padding:"7px",cursor:"pointer",color:"#6b7280",display:"flex",alignItems:"center"}} onClick={()=>setViewingDate(prevWeek(effectiveDate))}><Icon name="left" size={14}/></button>
          {isViewingHistory&&<button style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:10,padding:"5px 10px",cursor:"pointer",color:"#d4af37",fontSize:10,fontWeight:800}} onClick={()=>setViewingDate(null)}>HOJE</button>}
          {canFwd&&<button style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:10,padding:"7px",cursor:"pointer",color:"#6b7280",display:"flex",alignItems:"center"}} onClick={()=>setViewingDate(nextWeek(viewingDate))}><Icon name="right" size={14}/></button>}
          {extraRight}
        </div>
      </div>
      {isViewingHistory?(
        <div style={{background:"#0a0a0a",borderRadius:12,padding:"14px 16px",border:"1px solid #1a1a1a"}}>
          <div style={{fontSize:11,color:"#6b7280",fontWeight:700,letterSpacing:1,marginBottom:10,textTransform:"capitalize"}}>{formatDisplayDate(effectiveDate)}</div>
          {historyGame?(
            <div>
              <div style={{display:"flex",gap:20,flexWrap:"wrap",marginBottom:10}}>
                <div><div style={{fontSize:28,fontWeight:800,color:"#4ade80",lineHeight:1}}>{historyGame.players_count}</div><div style={{fontSize:9,color:"#4b5563",letterSpacing:1,marginTop:2}}>JOGADORES</div></div>
                <div><div style={{fontSize:28,fontWeight:800,color:"#fbbf24",lineHeight:1}}>{historyGame.collected}€</div><div style={{fontSize:9,color:"#4b5563",letterSpacing:1,marginTop:2}}>RECEBIDO</div></div>
                {historyGame.winner_team&&<div><div style={{fontSize:28,fontWeight:800,color:"#60a5fa",lineHeight:1}}>Equipa {historyGame.winner_team}</div><div style={{fontSize:9,color:"#4b5563",letterSpacing:1,marginTop:2}}>VENCEDOR</div></div>}
                {historyGame.mvp_name&&<div><div style={{fontSize:28,fontWeight:800,color:"#f472b6",lineHeight:1}}>{historyGame.mvp_name}</div><div style={{fontSize:9,color:"#4b5563",letterSpacing:1,marginTop:2}}>MVP</div></div>}
              </div>
              {attendance&&attendance.filter(a=>a.game_date===effectiveDate).length>0&&(
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>{attendance.filter(a=>a.game_date===effectiveDate).map((a,i)=><span key={i} style={{background:"#1a1a1a",borderRadius:20,padding:"3px 10px",fontSize:11,color:"#6b7280",fontWeight:600}}>{a.player_name}</span>)}</div>
              )}
            </div>
          ):<div style={{fontSize:13,color:"#4b5563"}}>Sem registo para esta semana</div>}
        </div>
      ):isLive?(
        <div style={{background:"#0a0a0a",borderRadius:12,padding:"14px 16px",border:"1px solid #16a34a33",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{background:"#16241c",border:"1px solid #16a34a55",borderRadius:20,padding:"4px 12px",display:"inline-flex",alignItems:"center",gap:6,marginBottom:10}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:"#16a34a"}}/>
              <span style={{fontSize:11,color:"#4ade80",fontWeight:800,letterSpacing:1}}>A JOGAR</span>
            </div>
            <div style={{fontSize:13,color:"#9ca3af",textTransform:"capitalize"}}>{formatDisplayDate(gameInfo.date)}</div>
            <div style={{display:"flex",gap:8,marginTop:4}}>
              <span style={{fontSize:12,color:"#6b7280"}}>{gameInfo.time}</span>
              {gameInfo.location&&<><span style={{color:"#2a2a2a"}}>·</span><span style={{fontSize:12,color:"#6b7280"}}>{gameInfo.location}</span></>}
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:10,color:"#4b5563",fontWeight:700,letterSpacing:1,marginBottom:4}}>JOGADORES</div>
            <div style={{fontSize:40,fontWeight:900,color:"#4ade80",lineHeight:1}}>{confirmed.length}</div>
          </div>
        </div>
      ):isOver?(
        <div style={{background:"#0a0a0a",borderRadius:12,padding:"14px 16px",border:"1px solid #1a1a1a"}}>
          <div style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:20,padding:"4px 12px",display:"inline-flex",alignItems:"center",gap:6,marginBottom:10}}>
            <span style={{fontSize:11,color:"#6b7280",fontWeight:800,letterSpacing:1}}>JOGO TERMINADO</span>
          </div>
          <div style={{fontSize:13,color:"#9ca3af",textTransform:"capitalize",marginBottom:4}}>{formatDisplayDate(gameInfo.date)}</div>
          <div style={{fontSize:12,color:"#4b5563"}}>A aguardar fecho automático...</div>
        </div>
      ):(
        <>
          <div style={{background:"#0a0a0a",borderRadius:12,padding:"14px 16px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center",border:"1px solid #1a1a1a"}}>
            <div>
              <div style={{fontSize:10,color:"#4b5563",fontWeight:700,letterSpacing:1.5,marginBottom:6}}>PRÓXIMO JOGO</div>
              <div style={{fontSize:13,color:"#9ca3af",fontWeight:600,marginBottom:4,textTransform:"capitalize"}}>{formatDisplayDate(gameInfo.date)}</div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{fontSize:12,color:"#6b7280"}}>{gameInfo.time}</span>
                {gameInfo.location&&<><span style={{color:"#2a2a2a"}}>·</span><span style={{fontSize:12,color:"#6b7280",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{gameInfo.location}</span></>}
              </div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:10,color:"#4b5563",fontWeight:700,letterSpacing:1.5,marginBottom:6}}>FALTAM</div>
              <div style={{fontSize:32,fontWeight:900,color:"#d4af37",lineHeight:1}}>{cdStr}</div>
            </div>
          </div>
          <div style={{marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <span style={{fontSize:11,color:"#4b5563",fontWeight:700,letterSpacing:1}}>CONFIRMADOS</span>
              <span style={{fontSize:11,color:"#4b5563",fontWeight:700}}>{confirmed.length} / {MAX_PLAYERS}</span>
            </div>
            <div style={{height:6,background:"#1a1a1a",borderRadius:99,overflow:"hidden"}}>
              <div style={{width:`${pct}%`,height:"100%",background:"#16a34a",borderRadius:99,transition:"width 0.6s"}}/>
            </div>
          </div>
          {isLoggedIn&&(
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {confirmed.length>0&&<div style={{background:"#16241c",border:"1px solid #16a34a33",borderRadius:20,padding:"5px 12px",display:"flex",alignItems:"center",gap:5}}><div style={{width:5,height:5,borderRadius:"50%",background:"#16a34a",flexShrink:0}}/><span style={{fontSize:11,color:"#4ade80",fontWeight:700}}>{confirmed.length} confirmados</span></div>}
              {notYet&&notYet.length>0&&<div style={{background:"#1a1a0a",border:"1px solid #d4af3733",borderRadius:20,padding:"5px 12px",display:"flex",alignItems:"center",gap:5}}><div style={{width:5,height:5,borderRadius:"50%",background:"#d4af37",flexShrink:0}}/><span style={{fontSize:11,color:"#fbbf24",fontWeight:700}}>{notYet.length} sem resposta</span></div>}
              {waiting.length>0&&<div style={{background:"#1a1010",border:"1px solid #dc262633",borderRadius:20,padding:"5px 12px",display:"flex",alignItems:"center",gap:5}}><div style={{width:5,height:5,borderRadius:"50%",background:"#dc2626",flexShrink:0}}/><span style={{fontSize:11,color:"#f87171",fontWeight:700}}>{waiting.length} em espera</span></div>}
              {confirmed.length>0&&<ExpandableList confirmed={confirmed}/>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── LANDING VIEW — 4 botões ───────────────────────────────────────────────────
function LandingView({setView}) {
  const items = [
    {key:"criar-grupo",    icon:"plus",   iconBg:"rgba(212,175,55,0.15)", title:"Criar grupo",        sub:"Sou o organizador",          solid:true},
    {key:"entrar-convite", icon:"key",    iconBg:"rgba(255,255,255,0.05)",title:"Entrar com convite", sub:"Tenho um código de convite",  solid:true},
    {key:"criar-conta",    icon:"user",   iconBg:"rgba(255,255,255,0.05)",title:"Criar conta",         sub:"Entrar num grupo existente", solid:true},
    {key:"login",          icon:"shield", iconBg:"rgba(255,255,255,0.03)",title:"Já tenho conta",      sub:"Iniciar sessão",             solid:false},
  ];
  return (
    <div style={{background:"#0a0a0a",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px"}}>
      <div style={{textAlign:"center",marginBottom:36}}>
        <div style={{fontSize:22,fontWeight:500,color:"white",letterSpacing:1}}>HOJE HÁ</div>
        <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:52,color:"#d4af37",letterSpacing:3,lineHeight:1}}>JOGO</div>
        <div style={{fontSize:12,color:"#4b5563",marginTop:8}}>Gestão de futsal semanal</div>
      </div>
      <div style={{width:"100%",maxWidth:360,display:"flex",flexDirection:"column",gap:10}}>
        {items.map((item,i)=>(
          <button key={i} onClick={()=>setView(item.key)} style={{width:"100%",background:item.solid?"#111":"transparent",border:item.solid?"1px solid #1f1f1f":"none",borderRadius:14,padding:item.solid?"16px":"14px",cursor:"pointer",display:"flex",alignItems:"center",gap:14,textAlign:"left"}}>
            <div style={{width:44,height:44,background:item.iconBg,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <Icon name={item.icon} size={22}/>
            </div>
            <div style={{flex:1}}>
              <div style={{color:"white",fontSize:15,fontWeight:700,marginBottom:2}}>{item.title}</div>
              <div style={{color:"#4b5563",fontSize:12}}>{item.sub}</div>
            </div>
            <Icon name="right" size={16}/>
          </button>
        ))}
      </div>
      <div style={{position:"absolute",bottom:24,color:"#222",fontSize:11}}>hojehajogo.pt</div>
    </div>
  );
}

// ── LOGIN VIEW — página limpa ─────────────────────────────────────────────────
function LoginView({onLogin, showToast, setView}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async() => {
    if(!username.trim()||!password.trim()) return;
    setLoading(true);
    const ok = await onLogin(username, password);
    setLoading(false);
    if(!ok){ showToast("Utilizador ou password incorretos!","err"); setPassword(""); }
  };

  return (
    <div style={{background:"#0a0a0a",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px"}}>
      <div style={{textAlign:"center",marginBottom:36}}>
        <div style={{fontSize:20,fontWeight:500,color:"white",letterSpacing:1}}>HOJE HÁ</div>
        <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:48,color:"#d4af37",letterSpacing:3,lineHeight:1}}>JOGO</div>
      </div>
      <div style={{width:"100%",maxWidth:360,background:"#111",border:"1px solid #1f1f1f",borderRadius:16,padding:"24px",display:"flex",flexDirection:"column",gap:14}}>
        <div style={{fontSize:14,fontWeight:700,color:"white",textAlign:"center",marginBottom:4}}>Iniciar sessão</div>
        <div>
          <label style={{color:"#6b7280",fontSize:11,fontWeight:700,display:"block",marginBottom:6,letterSpacing:0.5}}>UTILIZADOR OU TELEMÓVEL</label>
          <input className="text-input" placeholder="O teu utilizador..." value={username} onChange={e=>setUsername(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} autoCapitalize="none" autoFocus/>
        </div>
        <div>
          <label style={{color:"#6b7280",fontSize:11,fontWeight:700,display:"block",marginBottom:6,letterSpacing:0.5}}>PASSWORD</label>
          <div style={{position:"relative",display:"flex",alignItems:"center"}}>
            <input className="text-input" type={showPw?"text":"password"} placeholder="••••••" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} style={{paddingRight:44}}/>
            <button type="button" onClick={()=>setShowPw(v=>!v)} style={{position:"absolute",right:12,background:"transparent",border:"none",color:"#6b7280",cursor:"pointer",display:"flex",alignItems:"center"}}>
              <Icon name={showPw?"eyeoff":"eye"} size={16}/>
            </button>
          </div>
        </div>
        <button className="btn-big btn-green" style={{marginBottom:0,marginTop:4}} onClick={handleSubmit} disabled={loading}>
          {loading?"A entrar...":"ENTRAR →"}
        </button>
      </div>
      <button onClick={()=>setView("landing")} style={{marginTop:20,background:"transparent",border:"none",color:"#4b5563",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
        <Icon name="left" size={14}/> Voltar
      </button>
    </div>
  );
}

// ── CRIAR CONTA VIEW ──────────────────────────────────────────────────────────
function CriarContaView({setView, showToast}) {
  const [name, setName]         = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);

  const handleRegister = async() => {
    if(!name.trim()||!username.trim()||!password.trim()){showToast("Preenche todos os campos obrigatórios","err");return;}
    setLoading(true);
    // Verificar se username já existe (sem group_id)
    const{data:existing}=await supabase.from("players").select("id").eq("username",username.trim().toLowerCase()).is("group_id",null);
    if(existing&&existing.length>0){showToast("Username já existe","err");setLoading(false);return;}
    const color=AVATAR_COLORS[Math.floor(Math.random()*AVATAR_COLORS.length)];
    const{error}=await supabase.from("players").insert({name:name.trim(),username:username.trim().toLowerCase(),password,phone:phone||null,is_admin:false,status:"out",paid:false,is_guest:false,avatar_color:color,group_id:null});
    setLoading(false);
    if(error){showToast("Erro ao criar conta","err");return;}
    setDone(true);
  };

  if(done) return (
    <div style={{background:"#0a0a0a",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px",textAlign:"center"}}>
      <div style={{fontSize:56,marginBottom:16}}>✅</div>
      <div style={{color:"white",fontSize:20,fontWeight:700,marginBottom:10}}>Conta criada!</div>
      <div style={{color:"#6b7280",fontSize:13,marginBottom:32,maxWidth:300,lineHeight:1.6}}>
        Fala com o administrador do grupo para te adicionar. Depois podes entrar normalmente com o teu username e password.
      </div>
      <button onClick={()=>setView("login")} style={{background:"#16a34a",border:"none",borderRadius:12,padding:"14px 32px",color:"white",fontWeight:800,fontSize:14,cursor:"pointer"}}>
        Ir para o login →
      </button>
      <button onClick={()=>setView("landing")} style={{marginTop:12,background:"transparent",border:"none",color:"#4b5563",fontSize:13,cursor:"pointer"}}>
        Voltar ao início
      </button>
    </div>
  );

  return (
    <div style={{background:"#0a0a0a",minHeight:"100vh"}}>
      <div style={{background:"#111",padding:"16px",borderBottom:"1px solid #1f1f1f",display:"flex",alignItems:"center",gap:10}}>
        <button onClick={()=>setView("landing")} style={{background:"transparent",border:"none",color:"white",cursor:"pointer",padding:4}}><Icon name="left" size={18}/></button>
        <span style={{color:"white",fontWeight:700,fontSize:16}}>Criar conta</span>
      </div>
      <div style={{padding:"24px 20px"}}>
        <div style={{background:"rgba(37,99,235,0.1)",border:"1px solid #2563eb",borderRadius:12,padding:"12px 14px",marginBottom:24,display:"flex",gap:10,alignItems:"flex-start"}}>
          <span style={{fontSize:16,flexShrink:0}}>ℹ️</span>
          <p style={{color:"#93c5fd",fontSize:12,lineHeight:1.6}}>Depois de criares a conta, fala com o admin do teu grupo para te adicionar. Só depois consegues entrar na app.</p>
        </div>
        <label style={{color:"#9ca3af",fontSize:11,fontWeight:700,display:"block",marginBottom:6}}>O TEU NOME *</label>
        <input className="text-input" value={name} onChange={e=>setName(e.target.value)} placeholder="Ex: Pedro Santos" style={{marginBottom:14}}/>
        <label style={{color:"#9ca3af",fontSize:11,fontWeight:700,display:"block",marginBottom:6}}>USERNAME *</label>
        <input className="text-input" value={username} onChange={e=>setUsername(e.target.value)} placeholder="Ex: pedro" autoCapitalize="none" style={{marginBottom:14}}/>
        <label style={{color:"#9ca3af",fontSize:11,fontWeight:700,display:"block",marginBottom:6}}>PASSWORD *</label>
        <input className="text-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••" style={{marginBottom:14}}/>
        <label style={{color:"#9ca3af",fontSize:11,fontWeight:700,display:"block",marginBottom:6}}>TELEMÓVEL (opcional)</label>
        <input className="text-input" type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="9XX XXX XXX" style={{marginBottom:24}}/>
        <button className="btn-big btn-green" onClick={handleRegister} disabled={loading}>{loading?"A criar conta...":"✅ Criar conta"}</button>
      </div>
    </div>
  );
}

// ── CRIAR GRUPO VIEW — ecrã 3 permanente ──────────────────────────────────────
function CriarGrupoView({setView, showToast, onLogin, reloadAll}) {
  const [step, setStep]               = useState(()=>{
    // Se já há um código pendente no localStorage, ir direto para passo 3
    return localStorage.getItem("hhb_pending_code") ? 3 : 1;
  });
  const [groupName, setGroupName]     = useState(()=>localStorage.getItem("hhb_pending_group")||"");
  const [location, setLocation]       = useState("");
  const [time, setTime]               = useState("22:30");
  const [cost, setCost]               = useState("3");
  const [adminName, setAdminName]     = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPhone, setAdminPhone]   = useState("");
  const [loading, setLoading]         = useState(false);
  const [inviteCode, setInviteCode]   = useState(()=>localStorage.getItem("hhb_pending_code")||"");
  const [createdGroup, setCreatedGroup] = useState(()=>{
    const c=localStorage.getItem("hhb_pending_group_data");
    return c?JSON.parse(c):null;
  });
  const [copied, setCopied]           = useState(false);

  const generateCode = () => {
    const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code="HHJ-";
    for(let i=0;i<4;i++) code+=chars[Math.floor(Math.random()*chars.length)];
    return code;
  };

  const handleCreate = async() => {
    if(!groupName.trim()||!adminName.trim()||!adminUsername.trim()||!adminPassword.trim()){
      showToast("Preenche todos os campos obrigatórios","err"); return;
    }
    setLoading(true);
    try {
      const code=generateCode();
      // Guardar código E nome do grupo imediatamente no localStorage
      localStorage.setItem("hhb_pending_code", code);
      localStorage.setItem("hhb_pending_group", groupName.trim());
      const{data:group,error:ge}=await supabase.from("groups").insert({name:groupName.trim(),location:location.trim(),time,cost_per_player:Number(cost),invite_code:code}).select().single();
      if(ge) throw ge;
      const color=AVATAR_COLORS[Math.floor(Math.random()*AVATAR_COLORS.length)];
      const{error:pe}=await supabase.from("players").insert({name:adminName.trim(),username:adminUsername.trim().toLowerCase(),password:adminPassword,phone:adminPhone||null,is_admin:true,status:"out",paid:false,is_guest:false,avatar_color:color,group_id:group.id});
      if(pe) throw pe;
      const nw=()=>{const d=new Date();const day=d.getDay();const diff=(3-day+7)%7||7;d.setDate(d.getDate()+diff);return d.toISOString().split("T")[0];};
      await supabase.from("game_info").insert({location:location.trim()||"A definir",date:nw(),time,app_name:groupName.trim(),cost_per_player:Number(cost),group_id:group.id});
      const groupData={...group,adminUsername:adminUsername.trim().toLowerCase(),adminPassword};
      setInviteCode(code);
      setCreatedGroup(groupData);
      localStorage.setItem("hhb_pending_group_data", JSON.stringify(groupData));
      setGroupName(groupName.trim());
      setStep(3);
    } catch(e) {
      showToast("Erro ao criar grupo: "+e.message,"err");
    }
    setLoading(false);
  };

  const handleShare = () => {
    if(navigator.share){
      navigator.share({title:"Hoje Há Jogo",text:`Junta-te ao grupo "${groupName}"!\nCódigo: ${inviteCode}`,url:"https://hojehajogo.pt"});
    } else {
      navigator.clipboard.writeText(inviteCode).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000); showToast("Código copiado ✓"); });
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteCode).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000); showToast("Código copiado ✓"); });
  };

  const handleEnterApp = async() => {
    if(!createdGroup) return;
    setLoading(true);
    try {
      const{data:player}=await supabase.from("players").select("*").eq("username",createdGroup.adminUsername).eq("group_id",createdGroup.id).single();
      if(!player){ showToast("Erro ao entrar. Faz login manualmente.","err"); setLoading(false); return; }
      // Guardar sessão + código para mostrar após reload
      localStorage.setItem("hhb_session",JSON.stringify({playerId:player.id,groupId:player.group_id}));
      localStorage.setItem("hhb_new_group_code",inviteCode);
      // Limpar dados temporários
      localStorage.removeItem("hhb_pending_code");
      localStorage.removeItem("hhb_pending_group");
      localStorage.removeItem("hhb_pending_group_data");
      window.location.reload();
    } catch(e) {
      showToast("Erro ao entrar","err");
      setLoading(false);
    }
  };

  // Passo 3 — sucesso simples, sem mostrar código
  if(step===3) return (
    <div style={{background:"#0a0a0a",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px",textAlign:"center"}}>
      <div style={{fontSize:64,marginBottom:20}}>🎉</div>
      <div style={{color:"white",fontSize:22,fontWeight:800,marginBottom:10}}>Grupo criado!</div>
      <div style={{color:"#6b7280",fontSize:14,lineHeight:1.7,maxWidth:300,marginBottom:40}}>
        Para ver o código do grupo e partilhar com os teus jogadores, entra na app.
      </div>
      <button onClick={handleEnterApp} disabled={loading} style={{width:"100%",maxWidth:300,padding:"16px",background:"#16a34a",border:"none",borderRadius:12,color:"white",fontWeight:800,fontSize:15,cursor:"pointer"}}>
        {loading?"A entrar...":"Entrar na app →"}
      </button>
    </div>
  );

  return (
    <div style={{background:"#0a0a0a",minHeight:"100vh"}}>
      <div style={{background:"#111",padding:"16px",borderBottom:"1px solid #1f1f1f",display:"flex",alignItems:"center",gap:10}}>
        <button onClick={()=>step===1?setView("landing"):setStep(1)} style={{background:"transparent",border:"none",color:"white",cursor:"pointer",padding:4}}><Icon name="left" size={18}/></button>
        <span style={{color:"white",fontWeight:700,fontSize:16}}>Criar grupo</span>
        <span style={{color:"#4b5563",fontSize:12,marginLeft:"auto"}}>Passo {step}/2</span>
      </div>
      <div style={{padding:"24px 20px"}}>
        {step===1&&<>
          <p style={{color:"#6b7280",fontSize:12,marginBottom:20}}>Informações do grupo</p>
          <label style={{color:"#9ca3af",fontSize:11,fontWeight:700,display:"block",marginBottom:6}}>NOME DO GRUPO *</label>
          <input className="text-input" value={groupName} onChange={e=>setGroupName(e.target.value)} placeholder="Ex: Futebolada da Quinta" style={{marginBottom:14}}/>
          <label style={{color:"#9ca3af",fontSize:11,fontWeight:700,display:"block",marginBottom:6}}>LOCAL HABITUAL</label>
          <input className="text-input" value={location} onChange={e=>setLocation(e.target.value)} placeholder="Ex: Pavilhão Municipal" style={{marginBottom:14}}/>
          <label style={{color:"#9ca3af",fontSize:11,fontWeight:700,display:"block",marginBottom:6}}>HORA HABITUAL</label>
          <input className="text-input" type="time" value={time} onChange={e=>setTime(e.target.value)} style={{marginBottom:14}}/>
          <label style={{color:"#9ca3af",fontSize:11,fontWeight:700,display:"block",marginBottom:6}}>CUSTO POR JOGADOR (€)</label>
          <input className="text-input" type="number" step="0.5" min="0" value={cost} onChange={e=>setCost(e.target.value)} style={{marginBottom:24}}/>
          <button className="btn-big btn-green" onClick={()=>{if(!groupName.trim()){showToast("Nome do grupo obrigatório","err");return;}setStep(2);}}>Continuar →</button>
        </>}
        {step===2&&<>
          <p style={{color:"#6b7280",fontSize:12,marginBottom:20}}>Os teus dados como administrador</p>
          <label style={{color:"#9ca3af",fontSize:11,fontWeight:700,display:"block",marginBottom:6}}>O TEU NOME *</label>
          <input className="text-input" value={adminName} onChange={e=>setAdminName(e.target.value)} placeholder="Ex: João Silva" style={{marginBottom:14}}/>
          <label style={{color:"#9ca3af",fontSize:11,fontWeight:700,display:"block",marginBottom:6}}>USERNAME *</label>
          <input className="text-input" value={adminUsername} onChange={e=>setAdminUsername(e.target.value)} placeholder="Ex: joao" autoCapitalize="none" style={{marginBottom:14}}/>
          <label style={{color:"#9ca3af",fontSize:11,fontWeight:700,display:"block",marginBottom:6}}>PASSWORD *</label>
          <input className="text-input" type="password" value={adminPassword} onChange={e=>setAdminPassword(e.target.value)} placeholder="••••••" style={{marginBottom:14}}/>
          <label style={{color:"#9ca3af",fontSize:11,fontWeight:700,display:"block",marginBottom:6}}>TELEMÓVEL (opcional)</label>
          <input className="text-input" type="tel" value={adminPhone} onChange={e=>setAdminPhone(e.target.value)} placeholder="9XX XXX XXX" style={{marginBottom:24}}/>
          <button className="btn-big btn-green" onClick={handleCreate} disabled={loading}>{loading?"A criar grupo...":"🚀 Criar grupo"}</button>
        </>}
      </div>
    </div>
  );
}

// ── ENTRAR CONVITE VIEW ───────────────────────────────────────────────────────
function EntrarConviteView({setView, showToast}) {
  const [code, setCode]         = useState("");
  const [group, setGroup]       = useState(null);
  const [step, setStep]         = useState(1); // 1=código, 2=escolha, 3=login, 4=registo
  const [name, setName]         = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone]       = useState("");
  const [loading, setLoading]   = useState(false);

  const checkCode = async() => {
    if(!code.trim()){showToast("Insere o código de convite","err");return;}
    setLoading(true);
    const{data}=await supabase.from("groups").select("*").eq("invite_code",code.trim().toUpperCase()).single();
    setLoading(false);
    if(!data){showToast("Código inválido ou expirado","err");return;}
    setGroup(data); setStep(2);
  };

  const handleLogin = async() => {
    if(!username.trim()||!password.trim()){showToast("Preenche os campos","err");return;}
    setLoading(true);
    const u=username.trim().toLowerCase();
    // Primeiro tenta encontrar no grupo
    let{data:candidates}=await supabase.from("players").select("*").eq("username",u).eq("group_id",group.id);
    // Se não encontrar, tenta sem group_id (conta criada via "Criar conta")
    if(!candidates||candidates.length===0){
      const{data:orphans}=await supabase.from("players").select("*").eq("username",u).is("group_id",null);
      candidates=orphans||[];
    }
    const p=candidates?.find(c=>c.password===password);
    if(!p){showToast("Utilizador ou password incorretos","err");setLoading(false);return;}
    // Se o player não tem group_id, associa-o agora ao grupo
    if(!p.group_id){
      await supabase.from("players").update({group_id:group.id}).eq("id",p.id);
    }
    localStorage.setItem("hhb_session",JSON.stringify({playerId:p.id,groupId:group.id}));
    window.location.reload();
  };

  const handleRegister = async() => {
    if(!name.trim()||!username.trim()||!password.trim()){showToast("Preenche todos os campos obrigatórios","err");return;}
    setLoading(true);
    const{data:existing}=await supabase.from("players").select("id").eq("username",username.trim().toLowerCase()).eq("group_id",group.id);
    if(existing&&existing.length>0){showToast("Username já existe neste grupo","err");setLoading(false);return;}
    const color=AVATAR_COLORS[Math.floor(Math.random()*AVATAR_COLORS.length)];
    const{data:inserted,error}=await supabase.from("players").insert({name:name.trim(),username:username.trim().toLowerCase(),password,phone:phone||null,is_admin:false,status:"out",paid:false,is_guest:false,avatar_color:color,group_id:group.id}).select().single();
    if(error||!inserted){showToast("Erro ao criar conta","err");setLoading(false);return;}
    showToast("Conta criada! A entrar... 🎉");
    localStorage.setItem("hhb_session",JSON.stringify({playerId:inserted.id,groupId:group.id}));
    await new Promise(r=>setTimeout(r,800));
    window.location.reload();
  };

  return (
    <div style={{background:"#0a0a0a",minHeight:"100vh"}}>
      <div style={{background:"#111",padding:"16px",borderBottom:"1px solid #1f1f1f",display:"flex",alignItems:"center",gap:10}}>
        <button onClick={()=>step===1?setView("landing"):setStep(step===4||step===3?2:1)} style={{background:"transparent",border:"none",color:"white",cursor:"pointer",padding:4}}><Icon name="left" size={18}/></button>
        <span style={{color:"white",fontWeight:700,fontSize:16}}>Entrar com convite</span>
      </div>
      <div style={{padding:"24px 20px"}}>

        {/* PASSO 1 — código */}
        {step===1&&<>
          <p style={{color:"#6b7280",fontSize:13,marginBottom:24}}>Insere o código que recebeste do organizador</p>
          <label style={{color:"#9ca3af",fontSize:11,fontWeight:700,display:"block",marginBottom:6}}>CÓDIGO DE CONVITE</label>
          <input className="text-input" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="Ex: HHJ-X7K9" autoCapitalize="characters" style={{marginBottom:24,fontFamily:"'Bebas Neue',cursive",fontSize:20,letterSpacing:3,textAlign:"center"}}/>
          <button className="btn-big btn-green" onClick={checkCode} disabled={loading}>{loading?"A verificar...":"Verificar código →"}</button>
        </>}

        {/* PASSO 2 — escolha */}
        {step===2&&group&&<>
          <div style={{background:"rgba(212,175,55,0.1)",border:"1px solid #d4af37",borderRadius:12,padding:"14px",marginBottom:28,textAlign:"center"}}>
            <div style={{color:"#d4af37",fontSize:12,marginBottom:4}}>GRUPO ENCONTRADO</div>
            <div style={{color:"white",fontSize:18,fontWeight:700}}>{group.name}</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <button onClick={()=>setStep(3)} style={{width:"100%",background:"#16a34a",border:"none",borderRadius:12,padding:"16px",cursor:"pointer",display:"flex",alignItems:"center",gap:14,textAlign:"left"}}>
              <div style={{width:40,height:40,background:"rgba(255,255,255,0.15)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <Icon name="shield" size={20}/>
              </div>
              <div>
                <div style={{color:"white",fontSize:14,fontWeight:700}}>Já tenho conta</div>
                <div style={{color:"rgba(255,255,255,0.6)",fontSize:12}}>Entrar com username e password</div>
              </div>
            </button>
            <button onClick={()=>setStep(4)} style={{width:"100%",background:"#111",border:"1px solid #1f1f1f",borderRadius:12,padding:"16px",cursor:"pointer",display:"flex",alignItems:"center",gap:14,textAlign:"left"}}>
              <div style={{width:40,height:40,background:"rgba(255,255,255,0.05)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <Icon name="plus" size={20}/>
              </div>
              <div>
                <div style={{color:"white",fontSize:14,fontWeight:700}}>Criar conta</div>
                <div style={{color:"#4b5563",fontSize:12}}>Primeira vez neste grupo</div>
              </div>
            </button>
          </div>
        </>}

        {/* PASSO 3 — login */}
        {step===3&&group&&<>
          <p style={{color:"#6b7280",fontSize:13,marginBottom:20}}>Entra com a tua conta do grupo <strong style={{color:"#d4af37"}}>{group.name}</strong></p>
          <label style={{color:"#9ca3af",fontSize:11,fontWeight:700,display:"block",marginBottom:6}}>USERNAME</label>
          <input className="text-input" value={username} onChange={e=>setUsername(e.target.value)} placeholder="O teu username..." autoCapitalize="none" style={{marginBottom:14}}/>
          <label style={{color:"#9ca3af",fontSize:11,fontWeight:700,display:"block",marginBottom:6}}>PASSWORD</label>
          <input className="text-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••" onKeyDown={e=>e.key==="Enter"&&handleLogin()} style={{marginBottom:24}}/>
          <button className="btn-big btn-green" onClick={handleLogin} disabled={loading}>{loading?"A entrar...":"Entrar →"}</button>
        </>}

        {/* PASSO 4 — registo */}
        {step===4&&group&&<>
          <p style={{color:"#6b7280",fontSize:13,marginBottom:20}}>Criar conta no grupo <strong style={{color:"#d4af37"}}>{group.name}</strong></p>
          <label style={{color:"#9ca3af",fontSize:11,fontWeight:700,display:"block",marginBottom:6}}>O TEU NOME *</label>
          <input className="text-input" value={name} onChange={e=>setName(e.target.value)} placeholder="Ex: Pedro Santos" style={{marginBottom:14}}/>
          <label style={{color:"#9ca3af",fontSize:11,fontWeight:700,display:"block",marginBottom:6}}>USERNAME *</label>
          <input className="text-input" value={username} onChange={e=>setUsername(e.target.value)} placeholder="Ex: pedro" autoCapitalize="none" style={{marginBottom:14}}/>
          <label style={{color:"#9ca3af",fontSize:11,fontWeight:700,display:"block",marginBottom:6}}>PASSWORD *</label>
          <input className="text-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••" style={{marginBottom:14}}/>
          <label style={{color:"#9ca3af",fontSize:11,fontWeight:700,display:"block",marginBottom:6}}>TELEMÓVEL (opcional)</label>
          <input className="text-input" type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="9XX XXX XXX" style={{marginBottom:24}}/>
          <button className="btn-big btn-green" onClick={handleRegister} disabled={loading}>{loading?"A criar conta...":"✅ Criar conta e entrar"}</button>
        </>}

      </div>
    </div>
  );
}

// ── BOTTOM NAV ───────────────────────────────────────────────────────────────
function BottomNav({view, setView, isAdmin, hasDebts, unreadChat, showToast}) {
  const items = isAdmin
    ? [{key:"admin",icon:"⚽",label:"Jogo"},{key:"equipas_tab",icon:"🎲",label:"Equipas"},{key:"debts",icon:"💸",label:"Dívidas"},{key:"stats",icon:"📊",label:"Stats"},{key:"em-breve",icon:"🌍",label:"Em Breve"},{key:"profile",icon:"👤",label:"Perfil"}]
    : [{key:"player",icon:"⚽",label:"Jogo"},{key:"chat",icon:"💬",label:"Chat"},{key:"debts",icon:"💸",label:"Dívidas"},{key:"stats",icon:"📊",label:"Stats"},{key:"em-breve",icon:"🌍",label:"Em Breve"},{key:"profile",icon:"👤",label:"Perfil"}];
  return (
    <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:"#0a0a0a",borderTop:"1px solid #1a1a1a",display:"flex",zIndex:100,paddingBottom:"env(safe-area-inset-bottom)"}}>
      {items.map(item=>{
        const isActive=view===item.key;
        return (
          <button key={item.key} onClick={()=>{
            if(item.key==="em-breve"){ showToast("🔜 Em breve poderás encontrar jogadores para completar o vosso jogo!","warn"); return; }
            setView(item.key);
          }} style={{flex:1,padding:"8px 4px 10px",background:"transparent",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,position:"relative"}}>
            <span style={{fontSize:20}}>{item.icon}</span>
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

// ── TEAMS REVEAL ─────────────────────────────────────────────────────────────
function TeamsReveal({confirmed, players=[], onReassign}) {
  const [phase, setPhase] = useState("idle");
  const [displayNames, setDisplayNames] = useState([]);
  const intervalRef = useRef(null);
  const startReveal = () => {
    setPhase("animating"); let ticks=0;
    intervalRef.current=setInterval(()=>{ setDisplayNames([...confirmed].sort(()=>Math.random()-0.5).slice(0,4).map(p=>p.name)); ticks++; if(ticks>=20){clearInterval(intervalRef.current);if(onReassign)onReassign(confirmed);setPhase("revealed");}},100);
  };
  useEffect(()=>()=>clearInterval(intervalRef.current),[]);
  if(phase==="idle") return <button onClick={startReveal} style={{width:"100%",padding:"14px",borderRadius:12,border:"2px solid #16a34a",background:"rgba(22,163,74,0.1)",color:"#4ade80",fontFamily:"'Bebas Neue',cursive",fontSize:16,letterSpacing:2,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>🎲 REVELAR EQUIPAS</button>;
  if(phase==="animating") return <div style={{background:"#0a1a0a",borderRadius:12,padding:"20px",textAlign:"center",border:"2px solid #16a34a"}}><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:"#4ade80",marginBottom:12,letterSpacing:3}}>🎲 A SORTEAR...</div><div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center"}}>{displayNames.map((name,i)=><span key={i} style={{background:"rgba(22,163,74,0.2)",borderRadius:20,padding:"4px 14px",fontSize:13,fontWeight:700,color:"#4ade80",border:"1px solid #16a34a"}}>{name}</span>)}</div></div>;
  return <div><AutoTeamsDisplay confirmed={confirmed} players={players}/><button onClick={()=>setPhase("idle")} style={{width:"100%",marginTop:8,padding:"8px",borderRadius:10,border:"1px solid #23362a",background:"transparent",color:"#6b7280",fontSize:11,cursor:"pointer"}}>🔄 Sortear novamente</button></div>;
}

// ── AUTO TEAMS DISPLAY ───────────────────────────────────────────────────────
function AutoTeamsDisplay({confirmed, players=[]}) {
  if(!confirmed.length) return null;
  const groups={};
  confirmed.forEach(p=>{const pl=(players||[]).find(pl=>pl.id===p.id)||p;const team=pl.team||"SUB";if(!groups[team])groups[team]=[];groups[team].push({...p,position:pl.position});});
  const activeTeams=["A","B","C"].filter(t=>groups[t]?.length>0);
  const subs=groups["SUB"]||[];
  if(activeTeams.length===0) return <div style={{background:"#0f1a0f",borderRadius:12,padding:"12px",textAlign:"center",fontSize:13,color:"#6b7280"}}>As equipas formam-se automaticamente quando os jogadores confirmam presença.</div>;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {activeTeams.map((teamName,ti)=>{
        const color=TEAM_COLORS[ti],team=groups[teamName]||[];
        return <div key={teamName} style={{background:color.bg,border:`2px solid ${color.border}`,borderRadius:12,padding:"10px 12px"}}><div style={{fontSize:11,fontWeight:800,color:color.text,letterSpacing:1,marginBottom:8}}>EQUIPA {teamName}</div><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{team.map(p=><div key={p.id} style={{display:"flex",alignItems:"center",gap:5,background:p.position==="GR"?"rgba(37,99,235,0.2)":"rgba(0,0,0,0.2)",borderRadius:20,padding:"4px 10px",fontSize:12,fontWeight:700,color:color.text,border:`1px solid ${p.position==="GR"?"#60a5fa":color.border}`}}><Avatar player={(players||[]).find(pl=>pl.id===p.id)||p} size={18}/>{p.name}{p.position==="GR"&&<span style={{fontSize:11}}>🧤</span>}</div>)}</div></div>;
      })}
      {subs.length>0&&<div style={{background:"rgba(255,255,255,0.05)",border:"1px dashed #4b5563",borderRadius:12,padding:"10px 12px"}}><div style={{fontSize:11,fontWeight:800,color:"#64748b",letterSpacing:1,marginBottom:6}}>SUPLENTES</div><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{subs.map(p=><div key={p.id} style={{display:"flex",alignItems:"center",gap:5,background:"#1a1f1a",borderRadius:20,padding:"4px 10px",fontSize:12,fontWeight:700,color:"#9ca3af",border:"1px solid #2a332a"}}><Avatar player={(players||[]).find(pl=>pl.id===p.id)||p} size={18}/>{p.name}</div>)}</div></div>}
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
    <div style={{marginBottom:14}}>
      <p className="section-label"><Icon name="star" size={12}/> MVP DA SEMANA</p>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {confirmed.filter(p=>!p.is_guest&&p.id!==currentUserId).map(p=>{
          const votes=counts[p.id]||0,isVoted=myVote?.voted_for_id===p.id;
          return <button key={p.id} onClick={()=>onVote(p.id)} style={{display:"flex",alignItems:"center",gap:10,background:isVoted?"rgba(217,119,6,0.15)":"#16241c",border:`2px solid ${isVoted?"#d97706":"#23362a"}`,borderRadius:10,padding:"8px 12px",cursor:"pointer",textAlign:"left",width:"100%"}}><Avatar player={p} size={28}/><span style={{flex:1,fontSize:13,fontWeight:700,color:"white"}}>{p.name}</span><div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:60,height:6,background:"#0f1a0f",borderRadius:99,overflow:"hidden"}}><div style={{width:`${(votes/maxVotes)*100}%`,height:"100%",background:"#d97706",borderRadius:99}}/></div><span style={{fontSize:11,fontWeight:800,color:"#d97706",width:14}}>{votes}</span>{isVoted&&<span style={{fontSize:12}}>⭐</span>}</div></button>;
        })}
      </div>
      {myVote&&<p style={{fontSize:11,color:"#6b7280",marginTop:8,textAlign:"center"}}>Votaste em {confirmed.find(p=>p.id===myVote.voted_for_id)?.name}</p>}
    </div>
  );
}

// ── PIGGYBANK ─────────────────────────────────────────────────────────────────
function PiggyBankCard({piggybank,history,cost=3}) {
  const totalReceived=history.reduce((s,g)=>s+(Number(g.collected)||0),0);
  const gamesPlayed=history.filter(g=>g.players_count>0).length;
  return (
    <div style={{marginTop:16}}>
      <p className="section-label"><Icon name="euro" size={12}/> MEALHEIRO DO GRUPO</p>
      <div style={{background:"linear-gradient(135deg,#0891b2,#0e7490)",borderRadius:16,padding:"18px",marginBottom:8,color:"white"}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:1,opacity:0.8,marginBottom:6}}>SALDO ATUAL</div>
        <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:42,lineHeight:1,color:piggybank>=0?"white":"#fecaca"}}>{piggybank>=0?"+":""}{piggybank}€</div>
        <div style={{display:"flex",gap:16,marginTop:14,paddingTop:14,borderTop:"1px solid rgba(255,255,255,0.2)"}}>
          <div><div style={{fontSize:9,opacity:0.7}}>TOTAL RECEBIDO</div><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:"#86efac"}}>+{totalReceived}€</div></div>
          <div><div style={{fontSize:9,opacity:0.7}}>PAGO EM ALUGUER</div><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:"#fca5a5"}}>-{gamesPlayed*RENT}€</div></div>
          <div><div style={{fontSize:9,opacity:0.7}}>JOGOS</div><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:"white"}}>{gamesPlayed}</div></div>
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
            <span className="list-num">{i+1}</span><Avatar player={pl} size={28}/>
            <div className="list-info">
              <span className="list-name">{p.name}</span>
              {p.is_guest&&<span className="guest-sub">convidado de {p.invited_by}</span>}
              {debt>0&&<span style={{fontSize:10,color:"#dc2626",fontWeight:700}}>⚠️ deve {debt}€</span>}
            </div>
            {isAdmin?<button className={`paid-btn ${p.paid?"paid-yes":"paid-no"}`} onClick={()=>onTogglePaid(p.id)}>{p.paid?<><Icon name="check" size={11}/> Pago</>:`Deve ${cost}€`}</button>:<span className={`paid-chip ${p.paid?"paid-yes":"paid-no"}`}>{p.paid?"Pago ✓":`Deve ${cost}€`}</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── DEBTS VIEW ───────────────────────────────────────────────────────────────
function DebtsView({debts=[], members=[], player, onBack}) {
  const myDebts=debts.filter(d=>d.player_id===player.id);
  const myTotal=myDebts.reduce((s,d)=>s+Number(d.amount),0);
  const othersDebts=(members||[]).filter(m=>m.id!==player.id).map(m=>({...m,total:debts.filter(d=>d.player_id===m.id).reduce((s,d)=>s+Number(d.amount),0)})).filter(m=>m.total>0);
  return (
    <div className="screen">
      <div style={{background:"#111",padding:"16px 16px 20px",borderBottom:"1px solid #1f1f1f"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button className="field-nav-btn" onClick={onBack}><Icon name="left" size={14}/></button>
          <span style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:"white",letterSpacing:2}}>DÍVIDAS</span>
        </div>
      </div>
      <div className="body">
        <p className="section-label"><Icon name="warn" size={12}/> AS MINHAS DÍVIDAS</p>
        {myTotal===0
          ?<div style={{background:"rgba(22,163,74,0.1)",border:"1px solid rgba(22,163,74,0.3)",borderRadius:12,padding:"16px",textAlign:"center",marginBottom:14}}><div style={{fontSize:24,marginBottom:6}}>🎉</div><div style={{fontSize:13,fontWeight:700,color:"#4ade80"}}>Não deves nada!</div></div>
          :<div style={{background:"rgba(239,68,68,0.1)",border:"2px solid #dc2626",borderRadius:14,padding:"14px",marginBottom:14}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><span style={{fontSize:13,fontWeight:700,color:"white"}}>Total em dívida</span><span style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:"#f87171"}}>{myTotal}€</span></div>{myDebts.map(d=><div key={d.id} style={{background:"rgba(0,0,0,0.2)",borderRadius:8,padding:"8px 12px",marginBottom:6,display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,color:"#9ca3af"}}>{d.description}</span><span style={{fontSize:12,fontWeight:700,color:"#f87171"}}>{d.amount}€</span></div>)}</div>}
        {othersDebts.length>0&&<><p className="section-label" style={{marginTop:8}}><Icon name="people" size={12}/> DÍVIDAS DO GRUPO</p><div style={{display:"flex",flexDirection:"column",gap:6}}>{othersDebts.map(m=><div key={m.id} style={{display:"flex",alignItems:"center",gap:10,background:"#16241c",border:"1px solid #23362a",borderRadius:10,padding:"10px 14px"}}><Avatar player={m} size={28}/><span style={{flex:1,fontSize:13,fontWeight:700,color:"white"}}>{m.name}</span><span style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:"#f87171"}}>{m.total}€</span></div>)}</div></>}
        {othersDebts.length===0&&myTotal===0&&<div style={{textAlign:"center",paddingTop:20,color:"#6b7280",fontSize:13}}>🎉 O grupo está quite!</div>}
      </div>
    </div>
  );
}

// ── STATS VIEW ───────────────────────────────────────────────────────────────
function StatsView({members=[],history=[],debts=[],mvpVotes=[],player,onBack}) {
  const [tab,setTab]=useState("pessoal");
  const mvpCounts={};
  history.forEach(g=>{if(g.mvp_name)mvpCounts[g.mvp_name]=(mvpCounts[g.mvp_name]||0)+1;});
  const totalGames=history.length;
  const ranked=[...members].filter(p=>!p.is_guest).sort((a,b)=>(b.total_games||0)-(a.total_games||0));
  const myDebt=debts.filter(d=>d.player_id===player.id).reduce((s,d)=>s+Number(d.amount),0);
  const myPct=totalGames>0?Math.round(((player.total_games||0)/totalGames)*100):0;
  const myMvps=mvpCounts[player.name]||0;
  const stats=[{icon:"⚽",label:"Jogos",value:player.total_games||0,color:"#16a34a"},{icon:"⭐",label:"MVPs",value:myMvps,color:"#d97706"},{icon:"📈",label:"Presença",value:`${myPct}%`,color:"#2563eb"},{icon:"🔥",label:"Série Atual",value:player.current_streak||0,color:"#dc2626"},{icon:"🏆",label:"Melhor Série",value:player.best_streak||0,color:"#7c3aed"},{icon:"💰",label:"Total Pago",value:`${player.total_paid||0}€`,color:"#0891b2"}];
  return (
    <div className="screen">
      <div style={{background:"#111",padding:"16px 16px 14px",borderBottom:"1px solid #1f1f1f"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <button className="field-nav-btn" onClick={onBack}><Icon name="left" size={14}/></button>
          <Avatar player={player} size={36}/>
          <div><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:"white",letterSpacing:2}}>{player.name}</div><div style={{fontSize:10,color:"rgba(255,255,255,0.6)"}}>{player.is_admin?"Admin ★":player.position==="GR"?"🧤 GR":"⚽ Polivalente"}{myDebt>0?` · ⚠️ ${myDebt}€ em dívida`:""}</div></div>
        </div>
        <div style={{display:"flex",gap:2,background:"rgba(0,0,0,0.2)",borderRadius:10,padding:3}}>
          {[["pessoal","⚽ Pessoal"],["ranking","🏆 Ranking"],["mvp","⭐ Hall of Fame"]].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:"6px 4px",borderRadius:8,border:"none",cursor:"pointer",background:tab===k?"#d4af37":"transparent",color:tab===k?"#14532d":"rgba(255,255,255,0.7)",fontSize:11,fontWeight:700}}>{l}</button>
          ))}
        </div>
      </div>
      <div className="body">
        {tab==="pessoal"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>{stats.map((s,i)=><div key={i} style={{background:"#16241c",border:"1px solid #23362a",borderRadius:12,padding:"14px 8px",textAlign:"center"}}><div style={{fontSize:20,marginBottom:6}}>{s.icon}</div><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:26,color:s.color,lineHeight:1}}>{s.value}</div><div style={{fontSize:9,color:"#6b7280",fontWeight:700,letterSpacing:1,marginTop:4}}>{s.label}</div></div>)}</div>}
        {tab==="ranking"&&<><p className="section-label"><Icon name="trophy" size={12}/> RANKING DE PRESENÇAS</p><ExpandableRanking ranked={ranked} mvpCounts={mvpCounts} totalGames={totalGames} currentPlayer={player}/></>}
        {tab==="mvp"&&<HallOfFameMVP history={history} members={members}/>}
      </div>
    </div>
  );
}

// ── CHAT VIEW ────────────────────────────────────────────────────────────────
function ChatView({messages=[],players=[],player,onSendMessage,onBack}) {
  const [text,setText]=useState("");
  const bottomRef=useRef(null);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[messages]);
  return (
    <div className="screen" style={{height:"100vh",display:"flex",flexDirection:"column"}}>
      <div style={{background:"#111",padding:"14px 16px",borderBottom:"1px solid #1f1f1f",flexShrink:0}}>
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
                <div style={{background:isMe?"#16a34a":"#16241c",color:"white",borderRadius:isMe?"14px 14px 4px 14px":"14px 14px 14px 4px",padding:"8px 12px",fontSize:13,fontWeight:500,border:isMe?"none":"1px solid #23362a"}}>{msg.message}</div>
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
function ProfileView({player,onUpdateProfile,onBack,onLogout,onSwitchAccount}) {
  const [newName,setNewName]=useState(player.name);
  const [newPhone,setNewPhone]=useState(player.phone||"");
  const [newPw,setNewPw]=useState("");
  const [newPwC,setNewPwC]=useState("");
  const [showPw,setShowPw]=useState(false);
  const [color,setColor]=useState(player.avatar_color||AVATAR_COLORS[0]);
  return (
    <div className="screen">
      <div style={{background:"#111",padding:"14px 16px",borderBottom:"1px solid #1f1f1f"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button className="field-nav-btn" onClick={onBack}><Icon name="left" size={14}/></button>
          <span style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:"white",letterSpacing:2}}>O MEU PERFIL</span>
        </div>
      </div>
      <div className="body">
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:20}}>
          <Avatar player={{...player,avatar_color:color}} size={72} style={{marginBottom:12}}/>
          <p className="section-label" style={{marginBottom:8}}>COR DO AVATAR</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
            {AVATAR_COLORS.map(c=><button key={c} onClick={()=>setColor(c)} style={{width:32,height:32,borderRadius:"50%",background:c,border:color===c?"3px solid white":"2px solid transparent",cursor:"pointer",flexShrink:0}}/>)}
          </div>
        </div>
        <div style={{background:"#16241c",border:"2px solid #23362a",borderRadius:14,padding:16,display:"flex",flexDirection:"column",gap:10}}>
          <label className="field-label">Nome</label>
          <input className="text-input" value={newName} onChange={e=>setNewName(e.target.value)}/>
          <label className="field-label">Telemóvel</label>
          <input className="text-input" type="tel" value={newPhone} onChange={e=>setNewPhone(e.target.value)} placeholder="9XX XXX XXX"/>
          <label className="field-label">Nova password</label>
          <div style={{display:"flex",gap:8}}>
            <input className="text-input" type={showPw?"text":"password"} value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="Nova password..."/>
            <button className="icon-ghost" onClick={()=>setShowPw(v=>!v)}><Icon name={showPw?"eyeoff":"eye"} size={15}/></button>
          </div>
          <label className="field-label">Confirmar password</label>
          <input className="text-input" type={showPw?"text":"password"} value={newPwC} onChange={e=>setNewPwC(e.target.value)} placeholder="Repetir password..."/>
          <button className="btn-primary" style={{justifyContent:"center"}} onClick={()=>{if(newPw&&newPw!==newPwC){alert("As passwords não coincidem!");return;}onUpdateProfile(newName,newPw,color,newPhone);setTimeout(()=>onLogout(),800);}}><Icon name="check" size={15}/> GUARDAR E SAIR</button>
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
function PlayerView({gameInfo,cdStr,confirmed,waiting,notYet,guests,spotsLeft,players,members,debts,messages,mvpVotes,history,piggybank,attendance,viewingDate,setViewingDate,historyGame,isViewingHistory,effectiveDate,player,onToggle,onAddGuest,onRemoveGuest,onUpdateProfile,onVoteMvp,onSendMessage,onUpdatePosition,onLogout,setView,view}) {
  const isIn=player.status==="in",isWait=player.status==="wait";
  const [confirming,setConfirming]=useState(false);
  const handleToggle=async()=>{setConfirming(true);await onToggle();setTimeout(()=>setConfirming(false),600);};
  const waitPos=waiting.findIndex(p=>p.id===player.id)+1;
  const myGuests=guests.filter(g=>g.invited_by_id===player.id);
  const totalDebt=debts.filter(d=>d.player_id===player.id).reduce((s,d)=>s+Number(d.amount),0);
  const [guestName,setGuestName]=useState("");
  return (
    <div className="screen">
      <FieldHeader {...{gameInfo,cdStr,confirmed,notYet,waiting,viewingDate,setViewingDate,historyGame,isViewingHistory,effectiveDate,attendance}}
        extraRight={<button className="field-nav-btn" onClick={()=>setView("chat")}><Icon name="chat" size={13}/></button>}
      />
      <div className="body">
        <div className="topbar">
          <span className="topbar-name">Olá, <strong>{player.name}</strong></span>
          <button className="icon-ghost" onClick={onLogout}><Icon name="logout" size={16}/></button>
        </div>
        {totalDebt>0&&(
          <button onClick={()=>setView("debts")} style={{width:"100%",background:"rgba(217,119,6,0.15)",border:"2px solid #d97706",borderRadius:12,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:10,cursor:"pointer",textAlign:"left"}}>
            <Icon name="warn" size={18}/><div style={{flex:1}}><div style={{fontSize:13,fontWeight:800,color:"#fbbf24"}}>Tens {totalDebt}€ em dívida</div><div style={{fontSize:11,color:"#fcd34d"}}>Carrega para ver detalhes</div></div><Icon name="right" size={14}/>
          </button>
        )}
        <div className={`status-banner sb-${isIn?"in":isWait?"wait":"out"}`}>
          <span className="sb-icon">{isIn?"✅":isWait?"⏳":"⚽"}</span>
          <div><div className="sb-title">{isIn?"Confirmado!":isWait?`Lista de espera #${waitPos}`:"Ainda não respondeste"}</div><div className="sb-sub">{isIn?"Estás dentro":isWait?"Aguarda vaga":`${spotsLeft} vagas`}</div></div>
        </div>
        <button className={`btn-big ${isIn||isWait?"btn-red":"btn-green"}`} onClick={handleToggle} style={{opacity:confirming?0.7:1,transform:confirming?"scale(0.97)":"scale(1)",transition:"all 0.15s"}}>
          {confirming?"⏳ A processar...":(isIn||isWait?<><Icon name="x" size={18}/> CANCELAR PRESENÇA</>:<><Icon name="check" size={18}/> CONFIRMAR PRESENÇA</>)}
        </button>
        <RotatingHighlights members={members} history={history} mvpVotes={mvpVotes} confirmed={confirmed} gameInfo={gameInfo}/>
        <GroupStatusCard confirmed={confirmed} notYet={notYet} members={members} players={players}/>
        <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"center"}}>
          <span style={{fontSize:11,fontWeight:700,color:"#6b7280",letterSpacing:1}}>POSIÇÃO:</span>
          <button onClick={()=>onUpdatePosition("Polivalente")} style={{flex:1,padding:"8px",borderRadius:10,border:`2px solid ${(player.position||"Polivalente")==="Polivalente"?"#16a34a":"#23362a"}`,background:(player.position||"Polivalente")==="Polivalente"?"rgba(22,163,74,0.2)":"#16241c",fontWeight:800,fontSize:13,cursor:"pointer",color:(player.position||"Polivalente")==="Polivalente"?"#4ade80":"#6b7280"}}>⚽ Polivalente</button>
          <button onClick={()=>onUpdatePosition("GR")} style={{flex:1,padding:"8px",borderRadius:10,border:`2px solid ${player.position==="GR"?"#2563eb":"#23362a"}`,background:player.position==="GR"?"rgba(37,99,235,0.2)":"#16241c",fontWeight:800,fontSize:13,cursor:"pointer",color:player.position==="GR"?"#60a5fa":"#6b7280"}}>🧤 Guarda-Redes</button>
        </div>
        {confirmed.length>=MIN_PLAYERS&&confirmed.some(p=>{const pl=(players||[]).find(pl=>pl.id===p.id);return pl?.team&&pl.team!=="SUB";})&&(
          <div style={{marginBottom:14}}>
            <div style={{background:"rgba(22,163,74,0.1)",border:"1px solid rgba(22,163,74,0.3)",borderRadius:12,padding:"10px 14px",marginBottom:8,fontSize:12,color:"#4ade80",fontWeight:700,textAlign:"center"}}>{confirmed.length>=15?"🏆 3 equipas de 5":`⚽ 2 equipas${confirmed.length%2!==0?" + suplentes":""}`}</div>
            <AutoTeamsDisplay confirmed={confirmed} players={players}/>
          </div>
        )}
        {confirmed.length>=MIN_PLAYERS&&<ExpandableCard title="⭐ MVP DA SEMANA"><MvpVote confirmed={confirmed} mvpVotes={mvpVotes} currentUserId={player.id} gameDate={gameInfo.date} onVote={onVoteMvp}/></ExpandableCard>}
        <ExpandableCard title={`📋 LISTA DO JOGO (${confirmed.length})`}>
          <ConfirmedList confirmed={confirmed} debts={debts} players={players} cost={gameInfo.cost_per_player||COST}/>
          {waiting.length>0&&<><p className="section-label" style={{marginTop:10}}><Icon name="clock" size={12}/> LISTA DE ESPERA</p><div className="player-list">{waiting.map((p,i)=><div key={p.id} className="list-row"><span className="list-num">{i+1}</span><Avatar player={players.find(pl=>pl.id===p.id)||p} size={28}/><span className="list-name" style={{marginLeft:4}}>{p.name}</span></div>)}</div></>}
        </ExpandableCard>
        <ExpandableCard title="👤 CONVIDAR ALGUÉM">
          {spotsLeft===0?<div className="guest-locked">🔒 Jogo cheio</div>:<>
            {confirmed.length<MIN_PLAYERS&&<div className="guest-hint">⚠️ Membros têm prioridade.</div>}
            <div className="add-guest-row"><input className="text-input" placeholder="Nome do convidado..." value={guestName} onChange={e=>setGuestName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(onAddGuest(guestName),setGuestName(""))}/><button className="btn-add" onClick={()=>{onAddGuest(guestName);setGuestName("");}}><Icon name="plus" size={16}/></button></div>
            {myGuests.map(g=><div key={g.id} className="guest-row"><div className="av-guest">{g.name[0]}</div><span className="guest-row-name">{g.name}</span><span className="tag-guest">convidado</span><button className="icon-danger" onClick={()=>onRemoveGuest(g.id)}><Icon name="trash" size={12}/></button></div>)}
          </>}
        </ExpandableCard>
        <PiggyBankCard piggybank={piggybank} history={history} cost={gameInfo.cost_per_player||COST}/>
        <GroupCodeCard groupId={player.group_id}/>
        <div style={{height:70}}/>
      </div>
      <BottomNav view={view} setView={setView} isAdmin={false} hasDebts={debts.filter(d=>d.player_id===player.id).length>0} unreadChat={false} showToast={()=>alert("🔜 Em breve poderás encontrar jogadores para completar o vosso jogo!")}/>
    </div>
  );
}

// ── ADMIN VIEW ───────────────────────────────────────────────────────────────
function AdminView({gameInfo,cdStr,confirmed,waiting,notYet,guests,spotsLeft,players,members,history,piggybank,debts,messages,mvpVotes,attendance,viewingDate,setViewingDate,historyGame,isViewingHistory,effectiveDate,currentUser,adminTab,setAdminTab,onTogglePaid,onRemovePlayer,onAddPlayer,onChangePassword,onResetGame,onTogglePresence,onAddGuest,onRemoveGuest,onUpdateGameInfo,onAddDebt,onPayDebt,onClearHistory,onSendPush,onReassignTeams,onSendMessage,onVoteMvp,onLogout,showToast,setView,view}) {
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
  const [editAppName,setEditAppName]=useState(gameInfo.app_name||"Hoje Há Jogo");
  const [editCost,setEditCost]=useState(gameInfo.cost_per_player||3);
  const [edited,setEdited]=useState(false);
  const [winnerTeam,setWinnerTeam]=useState(null);
  const [debtPlayer,setDebtPlayer]=useState("");
  const [debtAmount,setDebtAmount]=useState("");
  const [debtDesc,setDebtDesc]=useState("");
  const [showReset,setShowReset]=useState(false);
  const [editGameDays,setEditGameDays]=useState(null);
  const [showClearConfirm,setShowClearConfirm]=useState(false);
  const [inviteCode,setInviteCode]=useState("");
  const [newGroupCode,setNewGroupCode]=useState(()=>{ const c=localStorage.getItem("hhb_new_group_code"); if(c) localStorage.removeItem("hhb_new_group_code"); return c||null; });
  const [codeCopied,setCodeCopied]=useState(false);

  useEffect(()=>{setEditLoc(gameInfo.location);setEditDate(gameInfo.date);setEditTime(gameInfo.time);setEditAppName(gameInfo.app_name||"Hoje Há Jogo");setEditCost(gameInfo.cost_per_player||3);},[gameInfo]);
  useEffect(()=>{
    if(!currentUser?.group_id) return;
    supabase.from("groups").select("game_days").eq("id",currentUser.group_id).single().then(({data})=>{ if(data?.game_days) setEditGameDays(data.game_days.map(Number)); else setEditGameDays([3]); });
  },[currentUser?.group_id]);

  // Buscar código do grupo
  useEffect(()=>{
    if(!currentUser?.group_id) return;
    supabase.from("groups").select("invite_code").eq("id",currentUser.group_id).single().then(({data})=>{ if(data) setInviteCode(data.invite_code); });
  },[currentUser?.group_id]);

  const handleShareCode = () => {
    if(navigator.share){ navigator.share({title:"Hoje Há Jogo",text:`Junta-te ao grupo!\nCódigo: ${inviteCode}`,url:"https://hojehajogo.pt"}); }
    else { navigator.clipboard.writeText(inviteCode).then(()=>{setCodeCopied(true);setTimeout(()=>setCodeCopied(false),2500);showToast("Código copiado ✓");}); }
  };
  const handleCopyCode = () => {
    navigator.clipboard.writeText(inviteCode).then(()=>{setCodeCopied(true);setTimeout(()=>setCodeCopied(false),2500);showToast("Código copiado ✓");});
  };

  const totalPaid=confirmed.filter(p=>p.paid).length;
  const totalUnpaid=confirmed.filter(p=>!p.paid).length;
  const debtsByPlayer=(members||[]).map(m=>({...m,debts:(debts||[]).filter(d=>d.player_id===m.id),total:(debts||[]).filter(d=>d.player_id===m.id).reduce((s,d)=>s+Number(d.amount),0)})).filter(m=>m.total>0);

  return (
    <div className="screen">
      <FieldHeader {...{gameInfo,cdStr,confirmed,notYet,waiting,viewingDate,setViewingDate,historyGame,isViewingHistory,effectiveDate,attendance}}
        extraRight={<button className="field-nav-btn" onClick={()=>setView("chat")}><Icon name="chat" size={13}/></button>}
      />
      <div className="body">
        <div className="topbar">
          <span className="topbar-name"><Icon name="shield" size={13}/> <strong>{currentUser.name}</strong> · Admin</span>
          <button className="icon-ghost" onClick={onLogout}><Icon name="logout" size={16}/></button>
        </div>

        {/* Mealheiro */}
        <div style={{background:"linear-gradient(135deg,#0891b2,#0e7490)",borderRadius:14,padding:"14px 16px",marginBottom:14,color:"white"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{fontSize:9,fontWeight:700,letterSpacing:1,opacity:0.8}}>MEALHEIRO</div><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:32,lineHeight:1}}>{piggybank>=0?"+":""}{piggybank}€</div></div>
            <div style={{display:"flex",gap:14,textAlign:"right"}}>
              <div><div style={{fontSize:9,opacity:0.7}}>RECEBIDO</div><div style={{fontSize:14,fontWeight:800,color:"#86efac"}}>{totalPaid*(gameInfo.cost_per_player||COST)}€</div></div>
              <div><div style={{fontSize:9,opacity:0.7}}>POR RECEBER</div><div style={{fontSize:14,fontWeight:800,color:"#fca5a5"}}>{totalUnpaid*(gameInfo.cost_per_player||COST)}€</div></div>
            </div>
          </div>
        </div>

        {/* Código de convite — visível no topo do painel admin */}
        {inviteCode&&(
          <div style={{background:"#111",border:"1px solid #2a2a2a",borderRadius:14,padding:"12px 16px",marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:"#6b7280",letterSpacing:1,marginBottom:4}}>CÓDIGO DO GRUPO</div>
                <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:26,color:"#d4af37",letterSpacing:5}}>{inviteCode}</div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={handleCopyCode} style={{background:"rgba(212,175,55,0.1)",border:"1px solid #d4af37",borderRadius:10,padding:"8px 12px",color:codeCopied?"#4ade80":"#d4af37",fontWeight:700,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:6,transition:"color 0.2s"}}>
                  <Icon name="copy" size={14}/>{codeCopied?"Copiado!":"Copiar"}
                </button>
                <button onClick={handleShareCode} style={{background:"#d4af37",border:"none",borderRadius:10,padding:"8px 14px",color:"#0a0a0a",fontWeight:800,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
                  <Icon name="share" size={14}/>Partilhar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Banner código novo grupo */}
        {newGroupCode&&(
          <div style={{background:"#111",border:"2px solid #d4af37",borderRadius:16,padding:"20px",marginBottom:14,textAlign:"center"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#6b7280",letterSpacing:2,marginBottom:8}}>O CÓDIGO DO TEU GRUPO É</div>
            <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:48,color:"#d4af37",letterSpacing:8,marginBottom:12}}>{newGroupCode}</div>
            <div style={{fontSize:12,color:"#6b7280",marginBottom:14}}>Partilha com os teus jogadores para entrarem</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{navigator.clipboard.writeText(newGroupCode);showToast("Código copiado ✓");}} style={{flex:1,padding:"10px",background:"rgba(212,175,55,0.1)",border:"1px solid #d4af37",borderRadius:10,color:"#d4af37",fontWeight:700,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                <Icon name="copy" size={14}/> Copiar
              </button>
              <button onClick={()=>{if(navigator.share){navigator.share({title:"Hoje Há Jogo",text:`Junta-te ao grupo!\nCódigo: ${newGroupCode}`,url:"https://hojehajogo.pt"});}else{navigator.clipboard.writeText(newGroupCode);showToast("Código copiado ✓");}}} style={{flex:1,padding:"10px",background:"#d4af37",border:"none",borderRadius:10,color:"#0a0a0a",fontWeight:800,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                <Icon name="share" size={14}/> Partilhar
              </button>
            </div>
            <button onClick={()=>setNewGroupCode(null)} style={{marginTop:10,background:"transparent",border:"none",color:"#4b5563",fontSize:11,cursor:"pointer"}}>Fechar</button>
          </div>
        )}

        <RotatingHighlights members={members} history={history} mvpVotes={mvpVotes} confirmed={confirmed} gameInfo={gameInfo}/>
        <GroupStatusCard confirmed={confirmed} notYet={notYet} members={members} players={players}/>

        <div className="tabs">
          {[["jogo","⚽"],["equipas","🎲"],["dividas","💸"],["jogadores","👥"],["gerir","⚙️"]].map(([k,l])=>(
            <button key={k} className={`tab ${adminTab===k?"tab-active":""}`} onClick={()=>setAdminTab(k)}>{l}</button>
          ))}
        </div>

        {adminTab==="jogo"&&<>
          <p className="section-label">✅ CONFIRMADOS ({confirmed.length})</p>
          <ConfirmedList confirmed={confirmed} onTogglePaid={onTogglePaid} isAdmin debts={debts} players={players} cost={gameInfo.cost_per_player||COST}/>
          {waiting.length>0&&<><p className="section-label" style={{marginTop:12}}>⏳ ESPERA</p><div className="player-list">{waiting.map((p,i)=><div key={p.id} className="list-row"><span className="list-num">{i+1}</span><Avatar player={(players||[]).find(pl=>pl.id===p.id)||p} size={26}/><span className="list-name" style={{marginLeft:4}}>{p.name}</span></div>)}</div></>}
          {notYet.length>0&&<><p className="section-label" style={{marginTop:12}}>❓ SEM RESPOSTA ({notYet.length})</p><div className="player-list">{notYet.map(p=><div key={p.id} className="list-row"><Avatar player={(players||[]).find(pl=>pl.id===p.id)||p} size={26}/><span className="list-name" style={{marginLeft:4}}>{p.name}</span></div>)}</div></>}
          {guests.filter(g=>g.status==="in").length>0&&<><p className="section-label" style={{marginTop:12}}>👤 CONVIDADOS</p><div className="player-list">{guests.filter(g=>g.status==="in").map(g=><div key={g.id} className="list-row row-guest"><div className="av-guest">{g.name[0]}</div><div className="list-info"><span className="list-name">{g.name}</span><span className="guest-sub">de {g.invited_by}</span></div><button className={`paid-btn ${g.paid?"paid-yes":"paid-no"}`} onClick={()=>onTogglePaid(g.id)}>{g.paid?<><Icon name="check" size={11}/> Pago</>:`Deve ${gameInfo.cost_per_player||COST}€`}</button><button className="icon-danger" onClick={()=>onRemoveGuest(g.id)}><Icon name="trash" size={12}/></button></div>)}</div></>}
          {confirmed.length>=MIN_PLAYERS&&<MvpVote confirmed={confirmed} mvpVotes={mvpVotes} currentUserId={currentUser.id} gameDate={gameInfo.date} onVote={onVoteMvp}/>}
          {!showReset
            ?<button className="btn-danger-full" style={{marginTop:14}} onClick={()=>setShowReset(true)}>🔄 Fechar jogo e guardar no histórico</button>
            :<div style={{background:"rgba(239,68,68,0.12)",border:"2px solid #dc2626",borderRadius:12,padding:14,marginTop:14}}>
              <p style={{fontSize:13,fontWeight:700,color:"#dc2626",marginBottom:10}}>Confirmas que queres fechar o jogo?</p>
              <p style={{fontSize:11,color:"#6b7280",marginBottom:12}}>Vai guardar no histórico, registar dívidas e limpar presenças.</p>
              <div style={{display:"flex",gap:8}}>
                <button className="btn-primary" style={{flex:1,justifyContent:"center",background:"#dc2626"}} onClick={()=>{onResetGame(winnerTeam);setShowReset(false);}}>✓ Confirmar</button>
                <button className="btn-primary" style={{flex:1,justifyContent:"center",background:"#6b7280"}} onClick={()=>setShowReset(false)}>Cancelar</button>
              </div>
            </div>}
        </>}

        {adminTab==="equipas"&&<>
          <p className="section-label"><Icon name="people" size={12}/> EQUIPAS AUTOMÁTICAS</p>
          {confirmed.length<MIN_PLAYERS
            ?<div className="guest-locked">⚠️ Precisas de {MIN_PLAYERS} confirmados. ({confirmed.length}/{MIN_PLAYERS})</div>
            :<>
              <div style={{background:"#0f1a0f",borderRadius:10,padding:"8px 12px",marginBottom:10,fontSize:12,color:"#4ade80",fontWeight:600}}>{confirmed.length>=15?"🏆 3 equipas de 5":`⚽ 2 equipas${confirmed.length%2!==0?" + suplentes":""}`}</div>
              <TeamsReveal confirmed={confirmed} players={players} onReassign={onReassignTeams}/>
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
          {spotsLeft===0?<div className="guest-locked">🔒 Jogo cheio</div>:<div className="add-guest-row"><input className="text-input" placeholder="Nome do convidado..." value={guestName} onChange={e=>setGuestName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(onAddGuest(guestName),setGuestName(""))}/><button className="btn-add" onClick={()=>{onAddGuest(guestName);setGuestName("");}}><Icon name="plus" size={16}/></button></div>}
        </>}

        {adminTab==="dividas"&&<>
          <p className="section-label"><Icon name="euro" size={12}/> DÍVIDAS</p>
          {debtsByPlayer.length===0&&<p className="empty-msg">🎉 Sem dívidas em aberto!</p>}
          {debtsByPlayer.map(m=>(
            <div key={m.id} style={{background:"rgba(249,115,22,0.1)",border:"2px solid #f97316",borderRadius:12,padding:12,marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}><Avatar player={(players||[]).find(p=>p.id===m.id)||m} size={30}/><span style={{fontWeight:800,fontSize:14,color:"white"}}>{m.name}</span></div>
                <span style={{fontFamily:"'Bebas Neue',cursive",fontSize:22,color:"#dc2626"}}>{m.total}€</span>
              </div>
              {m.debts.map(d=><DebtRow key={d.id} debt={d} onPayDebt={onPayDebt}/>)}
            </div>
          ))}
          <p className="section-label" style={{marginTop:14}}>REGISTAR DÍVIDA MANUAL</p>
          <div style={{background:"#16241c",border:"1px solid #23362a",borderRadius:12,padding:12,display:"flex",flexDirection:"column",gap:8}}>
            <select className="text-input" value={debtPlayer} onChange={e=>setDebtPlayer(e.target.value)}>
              <option value="">Seleciona jogador...</option>
              {members.filter(m=>!m.is_admin).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <input className="text-input" type="number" placeholder="Valor (€)..." value={debtAmount} onChange={e=>setDebtAmount(e.target.value)}/>
            <input className="text-input" placeholder="Descrição..." value={debtDesc} onChange={e=>setDebtDesc(e.target.value)}/>
            <button className="btn-primary" onClick={()=>{const p=members.find(m=>m.id===Number(debtPlayer));if(!p||!debtAmount)return;onAddDebt(p.id,p.name,Number(debtAmount),debtDesc||"Dívida manual");setDebtPlayer("");setDebtAmount("");setDebtDesc("");}}><Icon name="plus" size={14}/> Registar</button>
          </div>
        </>}

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
                {editPassId===p.id
                  ?<div style={{width:"100%",display:"flex",gap:6,marginTop:4}}><input className="text-input" style={{flex:1,fontSize:12,padding:"7px 10px"}} placeholder="Nova password..." value={editPassVal} onChange={e=>setEditPassVal(e.target.value)} autoFocus/><button className="btn-primary" style={{padding:"7px 10px"}} onClick={()=>{onChangePassword(p.id,editPassVal);setEditPassId(null);setEditPassVal("");}}><Icon name="check" size={13}/></button><button className="icon-ghost" onClick={()=>setEditPassId(null)}><Icon name="x" size={13}/></button></div>
                  :<button className="icon-ghost" onClick={()=>{setEditPassId(p.id);setEditPassVal("");}}><Icon name="key" size={14}/></button>}
              </div>
            ))}
          </div>
        )}

        {adminTab==="gerir"&&<>
          <div className="game-info-card">
            <div className="game-info-header"><Icon name="edit" size={13}/> NOME DA APP</div>
            <input className="text-input" value={editAppName} onChange={e=>{setEditAppName(e.target.value);setEdited(true);}} placeholder="Nome do grupo/app..."/>
          </div>
          <div className="game-info-card" style={{marginTop:12}}>
            <div className="game-info-header"><Icon name="cal" size={13}/> DIAS HABITUAIS</div>
            <p style={{fontSize:11,color:"#6b7280",marginBottom:8}}>Quando o jogo fechar, a data avança para o próximo dia selecionado.</p>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[["Dom",0],["Seg",1],["Ter",2],["Qua",3],["Qui",4],["Sex",5],["Sáb",6]].map(([label,day])=>{
                const active=(editGameDays||[3]).includes(day);
                return (
                  <button key={day} onClick={()=>{
                    const curr=editGameDays||[3];
                    const next=active?curr.filter(d=>d!==day):[...curr,day].sort((a,b)=>a-b);
                    if(next.length===0) return; // pelo menos 1 dia
                    setEditGameDays(next); setEdited(true);
                  }} style={{padding:"7px 12px",borderRadius:20,border:`1px solid ${active?"#16a34a":"#2a2a2a"}`,background:active?"#16241c":"#111",color:active?"#4ade80":"#6b7280",fontWeight:700,fontSize:12,cursor:"pointer"}}>
                    {label}
                  </button>
                );
              })}
            </div>
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
            <button className={`btn-save ${edited?"btn-save-active":""}`} disabled={!edited} onClick={async()=>{
              onUpdateGameInfo({location:editLoc,date:editDate,time:editTime,app_name:editAppName,cost_per_player:Number(editCost)});
              if(currentUser?.group_id&&editGameDays) await supabase.from("groups").update({game_days:editGameDays}).eq("id",currentUser.group_id);
              setEdited(false);}}>
              <Icon name="check" size={13}/> {edited?"GUARDAR":"SEM ALTERAÇÕES"}
            </button>
          </div>
          <p className="section-label" style={{marginTop:16}}><Icon name="plus" size={11}/> ADICIONAR MEMBRO</p>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <input className="text-input" placeholder="Nome..." value={newName} onChange={e=>setNewName(e.target.value)}/>
            <input className="text-input" placeholder="Utilizador..." value={newUsername} onChange={e=>setNewUsername(e.target.value)} autoCapitalize="none"/>
            <input className="text-input" placeholder="Telemóvel (opcional)..." value={newPhone} onChange={e=>setNewPhone(e.target.value)}/>
            <input className="text-input" placeholder="Password inicial..." value={newPass} onChange={e=>setNewPass(e.target.value)}/>
            <button className="btn-primary" onClick={()=>{onAddPlayer(newName,newUsername,newPass,newPhone);setNewName("");setNewUsername("");setNewPass("");setNewPhone("");}}><Icon name="plus" size={14}/> Adicionar membro</button>
          </div>
          <p style={{fontSize:11,color:"#6b7280",marginTop:8}}>💡 O jogador pode entrar com o utilizador OU o telemóvel.</p>
          <p className="section-label" style={{marginTop:20}}>🔔 NOTIFICAÇÕES MANUAIS</p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:8}}>
            <button className="btn-primary" style={{justifyContent:"center",background:"#16a34a"}} onClick={async()=>{await onSendPush("⚽ Novo jogo disponível!",`Novo jogo marcado para ${gameInfo.date} às ${gameInfo.time}. Confirma presença!`);showToast("Notificação enviada ✓");}}>⚽ Novo jogo disponível</button>
            <button className="btn-primary" style={{justifyContent:"center",background:"#0891b2"}} onClick={async()=>{await onSendPush("⏰ Lembrete de presença!",`Ainda não confirmaste para ${gameInfo.date}. Confirma já!`);showToast("Notificação enviada ✓");}}>⏰ Lembrete — Marcar presença</button>
            <button className="btn-primary" style={{justifyContent:"center",background:"#d97706"}} onClick={async()=>{await onSendPush("💸 Aviso de pagamento!",`Não te esqueças de pagar os ${gameInfo.cost_per_player||3}€!`);showToast("Notificação enviada ✓");}}>💸 Lembrete — Pagamento</button>
            <button className="btn-primary" style={{justifyContent:"center",background:"#7c3aed"}} onClick={async()=>{await onSendPush("🏆 MVP aberto para votação!","Entra na app e vota no MVP da semana!");showToast("Notificação enviada ✓");}}>🏆 MVP aberto para votação</button>
          </div>
          <p className="section-label" style={{marginTop:4}}>⚠️ ZONA DE PERIGO</p>
          {!showClearConfirm
            ?<button className="btn-danger-full" onClick={()=>setShowClearConfirm(true)}>🗑️ Limpar histórico e dívidas (reiniciar mealheiro)</button>
            :<div style={{background:"rgba(239,68,68,0.12)",border:"2px solid #dc2626",borderRadius:12,padding:14}}>
              <p style={{fontSize:13,fontWeight:700,color:"#f87171",marginBottom:8}}>Tens a certeza?</p>
              <p style={{fontSize:11,color:"#6b7280",marginBottom:12}}>Isto apaga todo o histórico e dívidas. O mealheiro volta a 0€.</p>
              <div style={{display:"flex",gap:8}}>
                <button className="btn-primary" style={{flex:1,justifyContent:"center",background:"#dc2626"}} onClick={()=>{onClearHistory();setShowClearConfirm(false);}}>✓ Confirmar</button>
                <button className="btn-primary" style={{flex:1,justifyContent:"center",background:"#6b7280"}} onClick={()=>setShowClearConfirm(false)}>Cancelar</button>
              </div>
            </div>}
        </>}

        <div style={{height:70}}/>
      </div>
      <BottomNav view={view} setView={v=>{if(v==="equipas_tab"){setAdminTab("equipas");setView("admin");}else setView(v);}} isAdmin={true} hasDebts={debts.length>0} unreadChat={false} showToast={()=>alert("🔜 Em breve poderás encontrar jogadores para completar o vosso jogo!")}/>
    </div>
  );
}


// ── GROUP CODE CARD ───────────────────────────────────────────────────────────
function GroupCodeCard({groupId}) {
  const [code, setCode] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(()=>{
    if(!groupId) return;
    supabase.from("groups").select("invite_code").eq("id",groupId).single().then(({data})=>{ if(data) setCode(data.invite_code); });
  },[groupId]);

  if(!code) return null;

  const handleShare = () => {
    if(navigator.share){ navigator.share({title:"Hoje Há Jogo",text:`Junta-te ao grupo!\nCódigo: ${code}`,url:"https://hojehajogo.pt"}); }
    else { navigator.clipboard.writeText(code).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000); }); }
  };

  return (
    <div style={{marginTop:16,background:"#111",border:"1px solid #1f1f1f",borderRadius:14,padding:"14px 16px"}}>
      <div style={{fontSize:10,fontWeight:700,color:"#4b5563",letterSpacing:2,marginBottom:8}}>CÓDIGO DO GRUPO</div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:"#d4af37",letterSpacing:5}}>{code}</div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>{navigator.clipboard.writeText(code).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});}} style={{background:"rgba(212,175,55,0.1)",border:"1px solid #d4af37",borderRadius:8,padding:"7px 12px",color:copied?"#4ade80":"#d4af37",fontWeight:700,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
            <Icon name="copy" size={13}/>{copied?"Copiado!":"Copiar"}
          </button>
          <button onClick={handleShare} style={{background:"#d4af37",border:"none",borderRadius:8,padding:"7px 12px",color:"#0a0a0a",fontWeight:800,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
            <Icon name="share" size={13}/>Partilhar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CSS ──────────────────────────────────────────────────────────────────────
function getCss() {
  return `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;600;700;800&display=swap');
@keyframes spin{to{transform:rotate(360deg);}}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{background:#0a0a0a;font-family:'DM Sans',sans-serif;color:#f0f0f0;min-height:100vh;}
.screen{min-height:100vh;display:flex;flex-direction:column;max-width:480px;margin:0 auto;}
.spinner{width:36px;height:36px;border:4px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;}

.field-nav-btn{background:transparent;border:none;border-radius:8px;padding:6px;color:#9ca3af;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.field-nav-btn:hover{background:rgba(255,255,255,0.05);}
.body{flex:1;background:#0a0a0a;color:#f0f0f0;padding:16px 16px 48px;}
.topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;}
.topbar-name{font-size:14px;color:#4ade80;font-weight:700;}
.section-label{font-size:10px;font-weight:800;letter-spacing:1.5px;color:#6b7280;text-transform:uppercase;margin-bottom:8px;display:flex;align-items:center;gap:5px;}
.av-guest{width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#a855f7,#7c3aed);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:white;flex-shrink:0;}
.btn-primary{background:#16a34a;color:white;border:none;border-radius:10px;padding:11px 18px;font-weight:800;cursor:pointer;font-size:13px;font-family:'DM Sans',sans-serif;display:flex;align-items:center;gap:6px;}
.btn-primary:hover{background:#15803d;}
.btn-big{width:100%;padding:13px;border-radius:12px;border:none;cursor:pointer;font-size:14px;font-weight:800;font-family:'Bebas Neue',cursive;letter-spacing:1.5px;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:14px;box-shadow:0 6px 16px rgba(0,0,0,0.25);}
.btn-big:hover{filter:brightness(1.08);}
.btn-green{background:linear-gradient(135deg,#22c55e,#15803d);color:white;}.btn-red{background:linear-gradient(135deg,#ef4444,#b91c1c);color:white;}
.btn-add{background:#16a34a;color:white;border:none;border-radius:10px;padding:10px 13px;cursor:pointer;display:flex;align-items:center;flex-shrink:0;}
.btn-danger-full{background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:12px;font-weight:800;cursor:pointer;font-size:12px;font-family:'DM Sans',sans-serif;width:100%;text-align:center;}
.icon-ghost{background:transparent;border:none;border-radius:8px;padding:7px;color:#6b7280;cursor:pointer;display:flex;align-items:center;}
.icon-ghost:hover{background:#1a2e1a;color:#f0f0f0;}
.icon-danger{background:rgba(239,68,68,0.15);border:none;border-radius:8px;padding:7px;color:#f87171;cursor:pointer;display:flex;flex-shrink:0;}
.status-banner{border-radius:14px;padding:12px 14px;display:flex;align-items:center;gap:12px;margin-bottom:14px;}
.sb-in{background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);}
.sb-wait{background:rgba(217,119,6,0.15);border:1px solid rgba(217,119,6,0.3);}
.sb-out{background:#142019;border:2px solid #1f1f1f;}
.sb-icon{font-size:22px;}.sb-title{font-size:14px;font-weight:800;color:#f0f0f0;}.sb-sub{font-size:11px;color:#6b7280;margin-top:2px;}
.player-list{display:flex;flex-direction:column;gap:5px;margin-bottom:4px;}
.list-row{display:flex;align-items:center;gap:8px;background:#111;border-radius:10px;padding:9px 12px;border:1px solid #1f1f1f;}
.row-guest{border-color:rgba(168,85,247,0.3);background:#1d1730;}
.list-num{font-size:10px;color:#6b7280;width:14px;text-align:center;flex-shrink:0;}
.list-info{display:flex;flex-direction:column;flex:1;min-width:0;}
.list-name{font-size:13px;font-weight:700;color:#f0f0f0;}
.guest-sub{font-size:10px;color:#a855f7;margin-top:1px;}
.admin-chip{color:#d4af37;}
.empty-msg{font-size:12px;color:#6b7280;text-align:center;padding:12px 0;}
.paid-chip,.paid-btn{font-size:11px;font-weight:700;border-radius:8px;padding:4px 9px;flex-shrink:0;}
.paid-chip{border:none;}.paid-btn{border:none;cursor:pointer;display:flex;align-items:center;gap:3px;font-family:'DM Sans',sans-serif;}
.paid-yes{background:rgba(34,197,94,0.2);color:#4ade80;}.paid-no{background:rgba(239,68,68,0.2);color:#f87171;}
.tabs{display:flex;gap:2px;background:#142019;border-radius:10px;padding:3px;margin-bottom:14px;border:1px solid #1f1f1f;}
.tab{flex:1;padding:7px 2px;border-radius:8px;border:none;cursor:pointer;background:transparent;color:#6b7280;font-size:15px;font-family:'DM Sans',sans-serif;transition:all .15s;}
.tab-active{background:linear-gradient(135deg,#22c55e,#15803d);color:white;}
.guest-locked{background:#0f1c14;border:2px dashed #1f1f1f;border-radius:10px;padding:14px;text-align:center;font-size:13px;color:#6b7280;}
.guest-hint{background:rgba(217,119,6,0.15);border:1px solid rgba(217,119,6,0.3);border-radius:10px;padding:9px 12px;font-size:11px;color:#fbbf24;font-weight:600;margin-bottom:8px;}
.add-guest-row{display:flex;gap:8px;margin-bottom:8px;}
.guest-row{display:flex;align-items:center;gap:8px;background:#1d1730;border-radius:10px;padding:8px 10px;margin-top:6px;border:1px solid rgba(168,85,247,0.3);}
.guest-row-name{flex:1;font-size:13px;font-weight:700;color:#f0f0f0;}
.tag-guest{font-size:10px;font-weight:700;background:rgba(168,85,247,0.2);color:#c084fc;border-radius:20px;padding:2px 8px;flex-shrink:0;}
.text-input{background:#0f0f0f;border:2px solid #1f1f1f;border-radius:10px;padding:10px 14px;color:#f0f0f0;font-size:13px;font-family:'DM Sans',sans-serif;outline:none;width:100%;}
.text-input:focus{border-color:#16a34a;}
.text-input::placeholder{color:#6b7280;}
input[type="date"],input[type="time"]{color-scheme:dark;}
select.text-input{appearance:none;}
.game-info-card{background:#111;border:2px solid #1f1f1f;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px;}
.game-info-header{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800;letter-spacing:1px;color:#d4af37;text-transform:uppercase;}
.field-label{font-size:11px;font-weight:700;color:#6b7280;display:flex;align-items:center;gap:4px;margin-bottom:4px;}
.date-time-row{display:flex;gap:10px;}
.btn-save{width:100%;padding:11px;border-radius:10px;border:2px solid #1f1f1f;background:#0f1c14;color:#6b7280;font-weight:800;font-size:12px;font-family:'DM Sans',sans-serif;cursor:not-allowed;display:flex;align-items:center;justify-content:center;gap:6px;transition:all .2s;}
.btn-save-active{background:#16a34a;color:white;border-color:#16a34a;cursor:pointer;}
.btn-save-active:hover{background:#15803d;}
.toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);border-radius:12px;padding:11px 20px;font-size:13px;font-weight:700;color:white;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.4);white-space:nowrap;font-family:'DM Sans',sans-serif;}
.toast-ok{background:#16a34a;}.toast-warn{background:#d97706;}.toast-err{background:#dc2626;}
`;
}
