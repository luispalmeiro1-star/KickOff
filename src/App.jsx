import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase.js";

const MAX_PLAYERS = 15;
const MIN_PLAYERS = 10;
const COST = 3;
const RENT = 22;

const TEAM_COLORS = [
  { bg: "#dcfce7", border: "#16a34a", text: "#14532d", name: "EQUIPA A" },
  { bg: "#dbeafe", border: "#2563eb", text: "#1e3a8a", name: "EQUIPA B" },
  { bg: "#fef3c7", border: "#d97706", text: "#92400e", name: "EQUIPA C" },
];

function nextWednesday() {
  const now = new Date();
  const diff = (3 - now.getDay() + 7) % 7 || 7;
  const d = new Date(now);
  d.setDate(now.getDate() + diff);
  return d.toISOString().split("T")[0];
}
function prevWednesday(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 7);
  return date.toISOString().split("T")[0];
}
function nextWeek(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + 7);
  return date.toISOString().split("T")[0];
}
function formatDisplayDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
}
function formatShortDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
}
function countdown(dateStr, timeStr) {
  if (!dateStr || !timeStr) return "—";
  const [h, min] = timeStr.split(":").map(Number);
  const [y, mo, d] = dateStr.split("-").map(Number);
  const diff = new Date(y, mo - 1, d, h, min) - new Date();
  if (diff <= 0) return "A DECORRER ⚽";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `${days}D ${hours}H`;
  if (hours > 0) return `${hours}H ${mins}M`;
  return `${mins} MIN`;
}
function sortedConfirmed(players) {
  const members = players.filter(p => p.status === "in" && !p.is_guest).sort((a, b) => a.confirmed_at - b.confirmed_at);
  const guests  = players.filter(p => p.status === "in" &&  p.is_guest).sort((a, b) => a.confirmed_at - b.confirmed_at);
  return [...members, ...guests];
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function makeTeams(confirmed) {
  const shuffled = shuffle(confirmed);
  const n = shuffled.length;
  if (n >= 15) return [shuffled.slice(0, 5), shuffled.slice(5, 10), shuffled.slice(10, 15)];
  const half = Math.ceil(n / 2);
  return [shuffled.slice(0, half), shuffled.slice(half)];
}

const Icon = ({ name, size = 18 }) => {
  const icons = {
    ball:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 6.88 2.75L12 12 5.12 4.75A10 10 0 0 1 12 2z"/><path d="M2.5 8.5l9.5 3.5 9.5-3.5"/><path d="M12 12v10"/></svg>,
    check:   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>,
    x:       <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    plus:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    minus:   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>,
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
  };
  return icons[name] || null;
};

export default function App() {
  const [players, setPlayers]       = useState([]);
  const [gameInfo, setGameInfo]     = useState({ location: "Pavilhão Gimnodesportivo de Alcochete", date: nextWednesday(), time: "22:30" });
  const [history, setHistory]       = useState([]);
  const [debts, setDebts]           = useState([]);
  const [piggybank, setPiggybank]   = useState(0);
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView]             = useState("login");
  const [toast, setToast]           = useState(null);
  const [adminTab, setAdminTab]     = useState("jogo");
  const [loading, setLoading]       = useState(true);
  const [viewingDate, setViewingDate] = useState(null); // null = current game
  const [historyGame, setHistoryGame] = useState(null); // game_history record for viewed date

  const showToast = (msg, type = "ok") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const loadPlayers  = useCallback(async () => { const { data } = await supabase.from("players").select("*").order("id"); if (data) setPlayers(data); }, []);
  const loadGameInfo = useCallback(async () => { const { data } = await supabase.from("game_info").select("*").eq("id", 1).single(); if (data) setGameInfo(data); }, []);
  const loadHistory  = useCallback(async () => {
    const { data } = await supabase.from("game_history").select("*").order("date", { ascending: false });
    if (data) { setHistory(data); const total = data.reduce((s, g) => s + (g.collected || 0) - RENT, 0); setPiggybank(total); }
  }, []);
  const loadDebts = useCallback(async () => { const { data } = await supabase.from("debts").select("*").order("created_at"); if (data) setDebts(data); }, []);

  useEffect(() => {
    (async () => { setLoading(true); await Promise.all([loadPlayers(), loadGameInfo(), loadHistory(), loadDebts()]); setLoading(false); })();
    const subs = [
      supabase.channel("p").on("postgres_changes", { event: "*", schema: "public", table: "players" }, loadPlayers).subscribe(),
      supabase.channel("g").on("postgres_changes", { event: "*", schema: "public", table: "game_info" }, loadGameInfo).subscribe(),
      supabase.channel("h").on("postgres_changes", { event: "*", schema: "public", table: "game_history" }, loadHistory).subscribe(),
      supabase.channel("d").on("postgres_changes", { event: "*", schema: "public", table: "debts" }, loadDebts).subscribe(),
    ];
    return () => subs.forEach(s => supabase.removeChannel(s));
  }, [loadPlayers, loadGameInfo, loadHistory, loadDebts]);

  // Load history game when viewing past date
  useEffect(() => {
    if (!viewingDate) { setHistoryGame(null); return; }
    const g = history.find(h => h.date === viewingDate);
    setHistoryGame(g || null);
  }, [viewingDate, history]);

  const members   = players.filter(p => !p.is_guest);
  const guests    = players.filter(p => p.is_guest);
  const confirmed = sortedConfirmed(players);
  const waiting   = players.filter(p => p.status === "wait");
  const notYet    = members.filter(p => p.status === "out");
  const spotsLeft = Math.max(0, MAX_PLAYERS - confirmed.length);
  const cdStr     = countdown(gameInfo.date, gameInfo.time);
  const isViewingHistory = !!viewingDate;
  const effectiveDate = viewingDate || gameInfo.date;

  const handleLogin = async (playerId, password) => {
    const p = players.find(p => p.id === playerId);
    if (!p || p.password !== password) return false;
    setCurrentUser(p);
    setView(p.is_admin ? "admin" : "player");
    return true;
  };
  const handleLogout = () => { setCurrentUser(null); setView("login"); setViewingDate(null); };

  const togglePresence = async (playerId) => {
    const p = players.find(pl => pl.id === playerId);
    if (!p) return;
    let newStatus, newAt;
    if (p.status === "in" || p.status === "wait") { newStatus = "out"; newAt = null; }
    else if (confirmed.length < MAX_PLAYERS) { newStatus = "in"; newAt = Date.now(); }
    else { newStatus = "wait"; newAt = Date.now(); showToast("Jogo cheio! ⏳", "warn"); }
    await supabase.from("players").update({ status: newStatus, confirmed_at: newAt, paid: false }).eq("id", playerId);
  };

  const addGuest = async (guestName, invitedById) => {
    if (!guestName.trim()) return;
    const inviter = players.find(p => p.id === invitedById);
    if (!inviter || confirmed.length >= MAX_PLAYERS) { showToast("Jogo cheio!", "err"); return; }
    await supabase.from("players").insert({ name: guestName.trim(), is_admin: false, password: null, paid: false, status: "in", is_guest: true, invited_by: inviter.name, invited_by_id: invitedById, confirmed_at: Date.now() });
    showToast(`${guestName} adicionado! 🎉`);
  };
  const removeGuest    = async (id) => { await supabase.from("players").delete().eq("id", id); showToast("Convidado removido"); };
  const togglePaid     = async (id) => { const p = players.find(pl => pl.id === id); await supabase.from("players").update({ paid: !p.paid }).eq("id", id); showToast("Pagamento atualizado ✓"); };
  const removePlayer   = async (id) => { await supabase.from("players").delete().eq("id", id); showToast("Jogador removido"); };
  const changePassword = async (id, pw) => { await supabase.from("players").update({ password: pw }).eq("id", id); };
  const addPlayer      = async (name, password) => {
    if (!name.trim() || !password.trim()) return;
    await supabase.from("players").insert({ name: name.trim(), is_admin: false, password: password.trim(), paid: false, status: "out", is_guest: false, invited_by: null, invited_by_id: null, confirmed_at: null });
    showToast(`${name} adicionado! 🎉`);
  };
  const updateGameInfo = async (patch) => { await supabase.from("game_info").update(patch).eq("id", 1); showToast("Jogo atualizado ✓"); };
  const updateProfile  = async (id, newName, newPassword) => {
    const updates = {};
    if (newName.trim()) updates.name = newName.trim();
    if (newPassword.trim()) updates.password = newPassword.trim();
    if (Object.keys(updates).length === 0) return;
    await supabase.from("players").update(updates).eq("id", id);
    showToast("Perfil atualizado ✓");
  };

  const resetGame = async () => {
    const paidCount = confirmed.filter(p => p.paid).length;
    const collected = paidCount * COST;
    // Add debts for unpaid confirmed players
    const unpaidMembers = confirmed.filter(p => !p.paid && !p.is_guest);
    for (const p of unpaidMembers) {
      await supabase.from("debts").insert({ player_id: p.id, player_name: p.name, amount: COST, description: `Jogo de ${gameInfo.date}` });
    }
    if (collected > 0 || confirmed.length > 0) {
      await supabase.from("game_history").insert({ date: gameInfo.date, players_count: confirmed.length, collected });
    }
    await supabase.from("players").delete().eq("is_guest", true);
    await supabase.from("players").update({ status: "out", paid: false, confirmed_at: null }).eq("is_guest", false);
    showToast("Jogo fechado e guardado ✓");
  };

  const addDebt  = async (playerId, playerName, amount, desc) => { await supabase.from("debts").insert({ player_id: playerId, player_name: playerName, amount, description: desc }); showToast("Dívida registada ✓"); };
  const payDebt  = async (debtId) => { await supabase.from("debts").delete().eq("id", debtId); showToast("Dívida paga ✓"); };

  const liveUser = currentUser ? players.find(p => p.id === currentUser.id) : null;
  const shared = { gameInfo, cdStr, confirmed, waiting, notYet, guests, spotsLeft, members, history, piggybank, debts, viewingDate, setViewingDate, historyGame, isViewingHistory, effectiveDate };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#166534", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <style>{globalCss}</style>
      <div style={{ fontSize: 48 }}>⚽</div>
      <div style={{ fontFamily: "'Bebas Neue',cursive", fontSize: 32, color: "white", letterSpacing: 3 }}>KICKOFF</div>
      <div className="spinner" />
    </div>
  );

  return (
    <div>
      <style>{globalCss}</style>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      {view === "login"  && <LoginView  {...shared} onLogin={handleLogin} showToast={showToast} />}
      {view === "player" && liveUser && <PlayerView {...shared} player={liveUser} onToggle={() => togglePresence(liveUser.id)} onAddGuest={n => addGuest(n, liveUser.id)} onRemoveGuest={removeGuest} onUpdateProfile={(name, pw) => updateProfile(liveUser.id, name, pw)} onLogout={handleLogout} />}
      {view === "admin"  && liveUser && <AdminView  {...shared} currentUser={liveUser} adminTab={adminTab} setAdminTab={setAdminTab} onTogglePaid={togglePaid} onRemovePlayer={removePlayer} onAddPlayer={addPlayer} onChangePassword={changePassword} onResetGame={resetGame} onTogglePresence={togglePresence} onAddGuest={n => addGuest(n, liveUser.id)} onRemoveGuest={removeGuest} onUpdateGameInfo={updateGameInfo} onUpdateProfile={(name, pw) => updateProfile(liveUser.id, name, pw)} onAddDebt={addDebt} onPayDebt={payDebt} onLogout={handleLogout} showToast={showToast} />}
    </div>
  );
}

// ── FIELD HEADER ─────────────────────────────────────────────────────────────
function FieldHeader({ gameInfo, cdStr, confirmed, notYet, waiting, viewingDate, setViewingDate, historyGame, isViewingHistory, effectiveDate, children }) {
  const pct = Math.round((confirmed.length / MAX_PLAYERS) * 100);
  const today = new Date().toISOString().split("T")[0];
  const canGoForward = viewingDate && viewingDate < gameInfo.date;

  return (
    <div className="field-header">
      <div className="field-lines" aria-hidden="true">
        <div className="fl fl-center-circle" /><div className="fl fl-center-line" />
        <div className="fl fl-left-box" /><div className="fl fl-right-box" />
      </div>
      <div className="field-content">
        {/* Top row: badge + nav */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div className="field-badge"><span className="field-badge-icon">⚽</span><span className="field-badge-name">KickOff</span></div>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <button className="field-nav-btn" onClick={() => setViewingDate(prevWednesday(effectiveDate))} title="Semana anterior"><Icon name="left" size={14}/></button>
            {isViewingHistory && <button className="field-nav-btn" style={{ fontSize: 10, padding: "4px 8px", fontWeight: 800 }} onClick={() => setViewingDate(null)}>HOJE</button>}
            {canGoForward && <button className="field-nav-btn" onClick={() => setViewingDate(viewingDate ? nextWeek(viewingDate) : null)} title="Semana seguinte"><Icon name="right" size={14}/></button>}
          </div>
        </div>

        {isViewingHistory ? (
          <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: "#bbf7d0", fontWeight: 700, marginBottom: 4 }}>📅 JOGO DE {formatDisplayDate(effectiveDate).toUpperCase()}</div>
            {historyGame ? (
              <div style={{ display: "flex", gap: 16 }}>
                <div><div style={{ fontFamily: "'Bebas Neue',cursive", fontSize: 32, color: "#4ade80" }}>{historyGame.players_count}</div><div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", letterSpacing: 1 }}>JOGADORES</div></div>
                <div><div style={{ fontFamily: "'Bebas Neue',cursive", fontSize: 32, color: "#fbbf24" }}>{historyGame.collected}€</div><div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", letterSpacing: 1 }}>RECEBIDO</div></div>
                <div><div style={{ fontFamily: "'Bebas Neue',cursive", fontSize: 32, color: historyGame.collected - RENT >= 0 ? "#4ade80" : "#f87171" }}>{historyGame.collected - RENT >= 0 ? "+" : ""}{historyGame.collected - RENT}€</div><div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", letterSpacing: 1 }}>APÓS ALUGUER</div></div>
              </div>
            ) : <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Sem registo para esta semana</div>}
          </div>
        ) : (
          <>
            <div className="field-date">{formatDisplayDate(gameInfo.date)}</div>
            <div className="field-timeloc">
              <span className="field-chip"><Icon name="clock" size={11}/> {gameInfo.time}</span>
              <span className="field-chip"><Icon name="pin" size={11}/> {gameInfo.location}</span>
            </div>
            <div style={{ marginBottom: 8 }}><span className="field-cd">{cdStr}</span></div>

            {/* Score */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div className="score-block"><span className="score-num green">{confirmed.length}</span><span className="score-label">CONFIRMADOS</span></div>
              <div className="score-sep">/</div>
              <div className="score-block"><span className="score-num white">{MAX_PLAYERS}</span><span className="score-label">LUGARES</span></div>
              {notYet && notYet.length > 0 && <>
                <div className="score-sep" style={{ fontSize: 16 }}>·</div>
                <div className="score-block"><span className="score-num" style={{ fontSize: 32, color: "#fbbf24" }}>{notYet.length}</span><span className="score-label">SEM RESP.</span></div>
              </>}
            </div>

            <div className="pct-bar"><div className="pct-fill" style={{ width: `${pct}%` }} /></div>
            <div className="pct-row" style={{ marginBottom: confirmed.length > 0 ? 8 : 0 }}>
              <span className="pct-label green">✓ {confirmed.length} dentro</span>
              {notYet && notYet.length > 0 && <span className="pct-label muted">? {notYet.length} sem resposta</span>}
              {waiting.length > 0 && <span className="pct-label yellow">⏳ {waiting.length} espera</span>}
            </div>

            {/* Mini confirmed list */}
            {confirmed.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
                {confirmed.map(p => (
                  <span key={p.id} style={{ background: p.is_guest ? "rgba(124,58,237,0.3)" : "rgba(0,0,0,0.25)", borderRadius: 20, padding: "2px 8px", fontSize: 11, color: p.is_guest ? "#c4b5fd" : "rgba(255,255,255,0.85)", fontWeight: 600 }}>
                    {p.name}{p.is_guest ? " 👤" : ""}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
        {children}
      </div>
    </div>
  );
}

// ── PROFILE SECTION ──────────────────────────────────────────────────────────
function ProfileSection({ player, onUpdateProfile, onLogout }) {
  const [newName, setNewName]           = useState(player.name);
  const [newPw, setNewPw]               = useState("");
  const [newPwConfirm, setNewPwConfirm] = useState("");
  const [showPw, setShowPw]             = useState(false);
  return (
    <div className="card-section" style={{ marginBottom: 14 }}>
      <p className="section-label"><Icon name="key" size={12}/> O MEU PERFIL</p>
      <label className="field-label">Nome</label>
      <input className="text-input" style={{ marginBottom: 8 }} value={newName} onChange={e => setNewName(e.target.value)} />
      <label className="field-label">Nova password</label>
      <div className="pw-row" style={{ marginBottom: 8 }}>
        <input className="text-input" type={showPw ? "text" : "password"} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Nova password..." />
        <button className="icon-ghost" onClick={() => setShowPw(v => !v)}><Icon name={showPw ? "eyeoff" : "eye"} size={15}/></button>
      </div>
      <label className="field-label">Confirmar password</label>
      <input className="text-input" style={{ marginBottom: 10 }} type={showPw ? "text" : "password"} value={newPwConfirm} onChange={e => setNewPwConfirm(e.target.value)} placeholder="Repetir password..." />
      <button className="btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => {
        if (newPw && newPw !== newPwConfirm) { alert("As passwords não coincidem!"); return; }
        onUpdateProfile(newName, newPw);
        setTimeout(() => onLogout(), 800);
      }}>
        <Icon name="check" size={15}/> GUARDAR E SAIR
      </button>
      <p style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>💡 Após guardar volta a entrar com os novos dados.</p>
    </div>
  );
}

// ── LOGIN ────────────────────────────────────────────────────────────────────
function LoginView({ gameInfo, cdStr, confirmed, notYet, waiting, members, debts, viewingDate, setViewingDate, historyGame, isViewingHistory, effectiveDate, onLogin, showToast }) {
  const [selected, setSelected] = useState(null);
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const handleSubmit = () => { if (!selected) return; if (!onLogin(selected.id, password)) { showToast("Password incorreta!", "err"); setPassword(""); } };
  return (
    <div className="screen">
      <FieldHeader gameInfo={gameInfo} cdStr={cdStr} confirmed={confirmed} notYet={notYet} waiting={waiting} viewingDate={viewingDate} setViewingDate={setViewingDate} historyGame={historyGame} isViewingHistory={isViewingHistory} effectiveDate={effectiveDate} />
      <div className="login-body">
        {!isViewingHistory && <>
          <p className="section-label">QUEM ÉS TU?</p>
          <div className="player-grid">
            {members.map(p => (
              <button key={p.id} className={`player-card ${selected?.id === p.id ? "selected" : ""}`} onClick={() => { setSelected(p); setPassword(""); }}>
                <div className={`player-avatar av-${p.status}`}>{p.name[0]}</div>
                <span className="player-card-name">{p.name}</span>
                <span>{p.status === "in" ? "✅" : p.status === "wait" ? "⏳" : "—"}</span>
              </button>
            ))}
          </div>
          {selected && (
            <div className="pw-box">
              <p className="pw-label">Password de <strong>{selected.name}</strong></p>
              <div className="pw-row">
                <input className="pw-input" type={showPw ? "text" : "password"} placeholder="••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} autoFocus />
                <button className="icon-ghost" onClick={() => setShowPw(v => !v)}><Icon name={showPw ? "eyeoff" : "eye"} size={16}/></button>
              </div>
              <button className="btn-primary" onClick={handleSubmit}>ENTRAR →</button>
            </div>
          )}
        </>}
        {isViewingHistory && (
          <div style={{ textAlign: "center", paddingTop: 20 }}>
            <p style={{ color: "#6b7280", fontSize: 13 }}>A ver histórico — <button style={{ background: "none", border: "none", color: "#16a34a", fontWeight: 700, cursor: "pointer" }} onClick={() => setViewingDate(null)}>voltar ao jogo atual</button></p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── TEAMS DISPLAY ────────────────────────────────────────────────────────────
function TeamsDisplay({ teams }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {teams.map((team, ti) => {
        const color = TEAM_COLORS[ti];
        const main = team.slice(0, 5);
        const subs = team.slice(5);
        return (
          <div key={ti} style={{ background: color.bg, border: `2px solid ${color.border}`, borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: color.text, letterSpacing: 1, marginBottom: 8 }}>{color.name}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {main.map(p => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 5, background: "white", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 700, color: color.text, border: `1px solid ${color.border}` }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: color.border, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800 }}>{p.name[0]}</div>
                  {p.name}
                </div>
              ))}
            </div>
            {subs.length > 0 && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${color.border}` }}>
                <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, marginBottom: 4 }}>SUPLENTES</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {subs.map(p => <span key={p.id} style={{ fontSize: 11, color: "#6b7280", background: "#f3f4f6", borderRadius: 20, padding: "2px 8px" }}>{p.name}</span>)}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── PIGGYBANK ────────────────────────────────────────────────────────────────
function PiggyBankCard({ piggybank, history }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ marginTop: 16 }}>
      <p className="section-label"><Icon name="euro" size={12}/> MEALHEIRO DO GRUPO</p>
      <div style={{ background: piggybank >= 0 ? "#dcfce7" : "#fee2e2", borderRadius: 14, padding: "16px", border: `2px solid ${piggybank >= 0 ? "#16a34a" : "#dc2626"}`, marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, marginBottom: 4 }}>SALDO ACUMULADO (após pagar pavilhão)</div>
        <div style={{ fontFamily: "'Bebas Neue',cursive", fontSize: 42, color: piggybank >= 0 ? "#16a34a" : "#dc2626", lineHeight: 1 }}>{piggybank >= 0 ? "+" : ""}{piggybank}€</div>
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>Cada jogo desconta {RENT}€ de aluguer · {COST}€ por jogador</div>
      </div>
      <button className="btn-primary" style={{ width: "100%", justifyContent: "center", background: "#f0fdf4", color: "#166534", border: "2px solid #d1fae5", marginBottom: 12 }} onClick={() => setShow(v => !v)}>
        <Icon name="chart" size={14}/> {show ? "ESCONDER" : "VER"} ESTATÍSTICAS
      </button>
      {show && (
        <div style={{ background: "white", borderRadius: 14, padding: "14px", border: "1px solid #d1fae5" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#6b7280", marginBottom: 12, letterSpacing: 1 }}>JOGADORES POR JOGO</div>
          {history.length === 0 && <p className="empty-msg">Ainda não há jogos registados</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.slice(0, 12).map((g, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "#6b7280", width: 60, flexShrink: 0 }}>{formatShortDate(g.date)}</span>
                <div style={{ flex: 1, background: "#f0fdf4", borderRadius: 99, height: 24, overflow: "hidden" }}>
                  <div style={{ width: `${(g.players_count / MAX_PLAYERS) * 100}%`, minWidth: 30, background: g.players_count >= MIN_PLAYERS ? "linear-gradient(90deg,#16a34a,#4ade80)" : "linear-gradient(90deg,#d97706,#fbbf24)", height: "100%", borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "white" }}>{g.players_count}</span>
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#16a34a", width: 36, textAlign: "right", flexShrink: 0 }}>{g.collected}€</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── CONFIRMED LIST ───────────────────────────────────────────────────────────
function ConfirmedList({ confirmed, onTogglePaid, isAdmin, debts = [] }) {
  if (!confirmed.length) return <p className="empty-msg">Ninguém confirmou ainda</p>;
  return (
    <div className="player-list">
      {confirmed.map((p, i) => {
        const playerDebt = debts.filter(d => d.player_id === p.id).reduce((s, d) => s + Number(d.amount), 0);
        return (
          <div key={p.id} className={`list-row ${p.is_guest ? "row-guest" : ""}`}>
            <span className="list-num">{i+1}</span>
            <div className={p.is_guest ? "av-guest" : "av-member"}>{p.name[0]}</div>
            <div className="list-info">
              <span className="list-name">{p.name}</span>
              {p.is_guest && <span className="guest-sub">convidado de {p.invited_by}</span>}
              {playerDebt > 0 && <span style={{ fontSize: 10, color: "#dc2626", fontWeight: 700 }}>⚠️ Em dívida: {playerDebt}€</span>}
            </div>
            {isAdmin
              ? <button className={`paid-btn ${p.paid ? "paid-yes" : "paid-no"}`} onClick={() => onTogglePaid(p.id)}>{p.paid ? <><Icon name="check" size={11}/> Pago</> : `Deve ${COST}€`}</button>
              : <span className={`paid-chip ${p.paid ? "paid-yes" : "paid-no"}`}>{p.paid ? "Pago ✓" : `Deve ${COST}€`}</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── PLAYER VIEW ──────────────────────────────────────────────────────────────
function PlayerView({ gameInfo, cdStr, confirmed, waiting, notYet, guests, spotsLeft, player, history, piggybank, debts, viewingDate, setViewingDate, historyGame, isViewingHistory, effectiveDate, onToggle, onAddGuest, onRemoveGuest, onUpdateProfile, onLogout }) {
  const isIn = player.status === "in", isWait = player.status === "wait";
  const waitPos = waiting.findIndex(p => p.id === player.id) + 1;
  const myGuests = guests.filter(g => g.invited_by_id === player.id);
  const myDebts  = debts.filter(d => d.player_id === player.id);
  const totalDebt = myDebts.reduce((s, d) => s + Number(d.amount), 0);
  const [guestName, setGuestName]     = useState("");
  const [showProfile, setShowProfile] = useState(false);
  const [teams, setTeams]             = useState(null);

  return (
    <div className="screen">
      <FieldHeader gameInfo={gameInfo} cdStr={cdStr} confirmed={confirmed} notYet={notYet} waiting={waiting} viewingDate={viewingDate} setViewingDate={setViewingDate} historyGame={historyGame} isViewingHistory={isViewingHistory} effectiveDate={effectiveDate} />
      <div className="body">
        <div className="topbar">
          <span className="topbar-name">Olá, <strong>{player.name}</strong></span>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="icon-ghost" onClick={() => setShowProfile(v => !v)}><Icon name="key" size={16}/></button>
            <button className="icon-ghost" onClick={onLogout}><Icon name="logout" size={16}/></button>
          </div>
        </div>

        {showProfile && <ProfileSection player={player} onUpdateProfile={onUpdateProfile} onLogout={onLogout} />}

        {/* My debts warning */}
        {totalDebt > 0 && (
          <div style={{ background: "#fef3c7", border: "2px solid #d97706", borderRadius: 12, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="warn" size={18}/>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#92400e" }}>Tens {totalDebt}€ em dívida</div>
              <div style={{ fontSize: 11, color: "#b45309" }}>{myDebts.map(d => d.description).join(" · ")}</div>
            </div>
          </div>
        )}

        <div className={`status-banner sb-${isIn ? "in" : isWait ? "wait" : "out"}`}>
          <span className="sb-icon">{isIn ? "✅" : isWait ? "⏳" : "⚽"}</span>
          <div>
            <div className="sb-title">{isIn ? "Confirmado!" : isWait ? `Lista de espera #${waitPos}` : "Ainda não respondeste"}</div>
            <div className="sb-sub">{isIn ? "Estás dentro do jogo" : isWait ? "Aguarda por uma vaga" : `${spotsLeft} vagas disponíveis`}</div>
          </div>
        </div>

        <button className={`btn-big ${isIn || isWait ? "btn-red" : "btn-green"}`} onClick={onToggle}>
          {isIn || isWait ? <><Icon name="x" size={18}/> CANCELAR PRESENÇA</> : <><Icon name="check" size={18}/> CONFIRMAR PRESENÇA</>}
        </button>

        {/* Sorteio */}
        {confirmed.length >= MIN_PLAYERS && (
          <div className="card-section" style={{ marginBottom: 14 }}>
            <p className="section-label"><Icon name="shuffle" size={12}/> SORTEIO DE EQUIPAS</p>
            <button className="btn-primary" style={{ width: "100%", justifyContent: "center", marginBottom: teams ? 12 : 0 }} onClick={() => setTeams(makeTeams(confirmed))}>
              <Icon name="shuffle" size={15}/> {teams ? "SORTEAR NOVAMENTE" : "SORTEAR EQUIPAS"}
            </button>
            {teams && <TeamsDisplay teams={teams} />}
          </div>
        )}

        {/* Convidados */}
        <div className="card-section" style={{ marginBottom: 14 }}>
          <p className="section-label"><Icon name="guest" size={12}/> CONVIDAR ALGUÉM</p>
          {spotsLeft === 0 ? <div className="guest-locked">🔒 Jogo cheio</div> : (
            <>
              {confirmed.length < MIN_PLAYERS && <div className="guest-hint">⚠️ Membros têm prioridade.</div>}
              <div className="add-guest-row">
                <input className="text-input" placeholder="Nome do convidado..." value={guestName} onChange={e => setGuestName(e.target.value)} onKeyDown={e => e.key === "Enter" && (onAddGuest(guestName), setGuestName(""))} />
                <button className="btn-add" onClick={() => { onAddGuest(guestName); setGuestName(""); }}><Icon name="plus" size={16}/></button>
              </div>
              {myGuests.map(g => (
                <div key={g.id} className="guest-row">
                  <div className="av-guest">{g.name[0]}</div><span className="guest-row-name">{g.name}</span>
                  <span className="tag-guest">convidado</span>
                  <button className="icon-danger" onClick={() => onRemoveGuest(g.id)}><Icon name="trash" size={12}/></button>
                </div>
              ))}
            </>
          )}
        </div>

        <p className="section-label"><Icon name="people" size={12}/> LISTA DO JOGO</p>
        <ConfirmedList confirmed={confirmed} debts={debts} />

        {waiting.length > 0 && <>
          <p className="section-label" style={{ marginTop: 14 }}><Icon name="clock" size={12}/> LISTA DE ESPERA</p>
          <div className="player-list">{waiting.map((p, i) => <div key={p.id} className="list-row"><span className="list-num">{i+1}</span><div className="av-wait">{p.name[0]}</div><span className="list-name">{p.name}</span></div>)}</div>
        </>}

        <PiggyBankCard piggybank={piggybank} history={history} />

        {/* Dívidas públicas */}
        {debts.length > 0 && (() => {
          const debtsByPlayer = members
            .map(m => ({ ...m, total: debts.filter(d => d.player_id === m.id).reduce((s, d) => s + Number(d.amount), 0) }))
            .filter(m => m.total > 0);
          if (debtsByPlayer.length === 0) return null;
          return (
            <div style={{ marginTop: 16 }}>
              <p className="section-label"><Icon name="warn" size={12}/> DÍVIDAS EM ABERTO</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {debtsByPlayer.map(m => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, background: m.id === player.id ? "#fff7ed" : "white", border: `1px solid ${m.id === player.id ? "#f97316" : "#d1fae5"}`, borderRadius: 10, padding: "10px 14px" }}>
                    <div className="av-member" style={{ background: m.id === player.id ? "linear-gradient(135deg,#dc2626,#b91c1c)" : undefined }}>{m.name[0]}</div>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#14532d" }}>{m.name}{m.id === player.id ? " (tu)" : ""}</span>
                    <span style={{ fontFamily: "'Bebas Neue',cursive", fontSize: 20, color: "#dc2626" }}>{m.total}€</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ── ADMIN VIEW ───────────────────────────────────────────────────────────────
function AdminView({ gameInfo, cdStr, confirmed, waiting, notYet, guests, spotsLeft, members, history, piggybank, debts, viewingDate, setViewingDate, historyGame, isViewingHistory, effectiveDate, currentUser, adminTab, setAdminTab, onTogglePaid, onRemovePlayer, onAddPlayer, onChangePassword, onResetGame, onTogglePresence, onAddGuest, onRemoveGuest, onUpdateGameInfo, onUpdateProfile, onAddDebt, onPayDebt, onLogout, showToast }) {
  const [newName, setNewName]           = useState("");
  const [newPass, setNewPass]           = useState("");
  const [editPassId, setEditPassId]     = useState(null);
  const [editPassVal, setEditPassVal]   = useState("");
  const [guestName, setGuestName]       = useState("");
  const [editLoc, setEditLoc]           = useState(gameInfo.location);
  const [editDate, setEditDate]         = useState(gameInfo.date);
  const [editTime, setEditTime]         = useState(gameInfo.time);
  const [edited, setEdited]             = useState(false);
  const [showProfile, setShowProfile]   = useState(false);
  const [teams, setTeams]               = useState(null);
  const [debtPlayer, setDebtPlayer]     = useState("");
  const [debtAmount, setDebtAmount]     = useState("");
  const [debtDesc, setDebtDesc]         = useState("");
  useEffect(() => { setEditLoc(gameInfo.location); setEditDate(gameInfo.date); setEditTime(gameInfo.time); }, [gameInfo]);
  const totalPaid   = confirmed.filter(p => p.paid).length;
  const totalUnpaid = confirmed.filter(p => !p.paid).length;

  // Group debts by player
  const debtsByPlayer = members.map(m => ({
    ...m,
    debts: debts.filter(d => d.player_id === m.id),
    total: debts.filter(d => d.player_id === m.id).reduce((s, d) => s + Number(d.amount), 0),
  })).filter(m => m.total > 0);

  return (
    <div className="screen">
      <FieldHeader gameInfo={gameInfo} cdStr={cdStr} confirmed={confirmed} notYet={notYet} waiting={waiting} viewingDate={viewingDate} setViewingDate={setViewingDate} historyGame={historyGame} isViewingHistory={isViewingHistory} effectiveDate={effectiveDate} />
      <div className="body">
        <div className="topbar">
          <span className="topbar-name"><Icon name="shield" size={14}/> <strong>{currentUser.name}</strong> · Admin</span>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="icon-ghost" onClick={() => setShowProfile(v => !v)}><Icon name="key" size={16}/></button>
            <button className="icon-ghost" onClick={onLogout}><Icon name="logout" size={16}/></button>
          </div>
        </div>

        {showProfile && <ProfileSection player={currentUser} onUpdateProfile={onUpdateProfile} onLogout={onLogout} />}

        <div className="money-row">
          <div className="money-box green-box"><span className="money-num">{totalPaid*COST}€</span><span className="money-label">Recebido</span></div>
          <div className="money-box red-box"><span className="money-num">{totalUnpaid*COST}€</span><span className="money-label">Por receber</span></div>
          <div className="money-box" style={{ background: piggybank >= 0 ? "#dcfce7" : "#fee2e2" }}>
            <span className="money-num" style={{ color: piggybank >= 0 ? "#16a34a" : "#dc2626" }}>{piggybank >= 0 ? "+" : ""}{piggybank}€</span>
            <span className="money-label">Mealheiro</span>
          </div>
        </div>

        <div className="tabs">
          {[["jogo","⚽"],["equipas","🎲"],["dividas","💸"],["stats","📊"],["jogadores","👥"],["gerir","⚙️"]].map(([k,l]) => (
            <button key={k} className={`tab ${adminTab===k?"tab-active":""}`} onClick={() => setAdminTab(k)}>{l}</button>
          ))}
        </div>

        {/* JOGO */}
        {adminTab === "jogo" && <>
          <p className="section-label">✅ CONFIRMADOS ({confirmed.length})</p>
          <ConfirmedList confirmed={confirmed} onTogglePaid={onTogglePaid} isAdmin debts={debts} />
          {waiting.length>0&&<><p className="section-label" style={{marginTop:14}}>⏳ LISTA DE ESPERA</p><div className="player-list">{waiting.map((p,i)=><div key={p.id} className="list-row"><span className="list-num">{i+1}</span><div className="av-wait">{p.name[0]}</div><span className="list-name">{p.name}</span></div>)}</div></>}
          {notYet.length>0&&<><p className="section-label" style={{marginTop:14}}>❓ SEM RESPOSTA ({notYet.length})</p><div className="player-list">{notYet.map(p=><div key={p.id} className="list-row"><div className="av-out">{p.name[0]}</div><span className="list-name">{p.name}</span></div>)}</div></>}

          {/* Convidados no jogo */}
          {guests.filter(g=>g.status==="in").length>0&&<><p className="section-label" style={{marginTop:14}}>👤 CONVIDADOS</p>
          <div className="player-list">{guests.filter(g=>g.status==="in").map(g=><div key={g.id} className="list-row row-guest"><div className="av-guest">{g.name[0]}</div><div className="list-info"><span className="list-name">{g.name}</span><span className="guest-sub">de {g.invited_by}</span></div><button className={`paid-btn ${g.paid?"paid-yes":"paid-no"}`} onClick={()=>onTogglePaid(g.id)}>{g.paid?<><Icon name="check" size={11}/> Pago</>:`Deve ${COST}€`}</button><button className="icon-danger" onClick={()=>onRemoveGuest(g.id)}><Icon name="trash" size={12}/></button></div>)}</div></>}

          <button className="btn-danger-full" style={{marginTop:18}} onClick={onResetGame}>🔄 Fechar jogo e guardar no histórico</button>
        </>}

        {/* EQUIPAS */}
        {adminTab === "equipas" && <>
          <p className="section-label"><Icon name="shuffle" size={12}/> SORTEIO DE EQUIPAS</p>
          {confirmed.length < MIN_PLAYERS ? (
            <div className="guest-locked">⚠️ Precisas de {MIN_PLAYERS} confirmados. ({confirmed.length}/{MIN_PLAYERS})</div>
          ) : (
            <>
              <div style={{background:"#f0fdf4",borderRadius:12,padding:"10px 14px",marginBottom:12,fontSize:12,color:"#166534",fontWeight:600}}>
                {confirmed.length >= 15 ? "🏆 3 equipas de 5 jogadores" : `⚽ 2 equipas${confirmed.length%2!==0?" + 1 suplente":""}`}
              </div>
              <button className="btn-primary" style={{width:"100%",justifyContent:"center",marginBottom:14}} onClick={()=>setTeams(makeTeams(confirmed))}>
                <Icon name="shuffle" size={15}/> {teams?"SORTEAR NOVAMENTE":"SORTEAR EQUIPAS"}
              </button>
              {teams && <TeamsDisplay teams={teams} />}
            </>
          )}
          {/* Add guest */}
          <p className="section-label" style={{marginTop:16}}><Icon name="guest" size={12}/> ADICIONAR CONVIDADO</p>
          {spotsLeft===0?<div className="guest-locked">🔒 Jogo cheio</div>:(
            <div className="add-guest-row">
              <input className="text-input" placeholder="Nome do convidado..." value={guestName} onChange={e=>setGuestName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(onAddGuest(guestName),setGuestName(""))} />
              <button className="btn-add" onClick={()=>{onAddGuest(guestName);setGuestName("");}}><Icon name="plus" size={16}/></button>
            </div>
          )}
        </>}

        {/* DÍVIDAS */}
        {adminTab === "dividas" && <>
          <p className="section-label"><Icon name="euro" size={12}/> DÍVIDAS POR JOGADOR</p>
          {debtsByPlayer.length === 0 && <p className="empty-msg">🎉 Sem dívidas em aberto!</p>}
          {debtsByPlayer.map(m => (
            <div key={m.id} style={{ background: "#fff7ed", border: "2px solid #f97316", borderRadius: 12, padding: "12px", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div className="av-member">{m.name[0]}</div>
                  <span style={{ fontWeight: 800, fontSize: 14, color: "#14532d" }}>{m.name}</span>
                </div>
                <span style={{ fontFamily: "'Bebas Neue',cursive", fontSize: 22, color: "#dc2626" }}>{m.total}€</span>
              </div>
              {m.debts.map(d => (
                <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "white", borderRadius: 8, padding: "6px 10px", marginBottom: 5, border: "1px solid #fed7aa" }}>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>{d.description}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#dc2626" }}>{d.amount}€</span>
                    <button className="btn-primary" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => onPayDebt(d.id)}><Icon name="check" size={11}/> Pago</button>
                  </div>
                </div>
              ))}
            </div>
          ))}

          {/* Adicionar dívida manual */}
          <p className="section-label" style={{ marginTop: 16 }}>REGISTAR DÍVIDA MANUAL</p>
          <div style={{ background: "white", border: "1px solid #d1fae5", borderRadius: 12, padding: "12px", display: "flex", flexDirection: "column", gap: 8 }}>
            <select className="text-input" value={debtPlayer} onChange={e => setDebtPlayer(e.target.value)} style={{ color: debtPlayer ? "#14532d" : "#9ca3af" }}>
              <option value="">Seleciona jogador...</option>
              {members.filter(m => !m.is_admin).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <input className="text-input" type="number" placeholder="Valor (€)..." value={debtAmount} onChange={e => setDebtAmount(e.target.value)} />
            <input className="text-input" placeholder="Descrição (ex: Jogo 11 Jun)..." value={debtDesc} onChange={e => setDebtDesc(e.target.value)} />
            <button className="btn-primary" onClick={() => {
              const p = members.find(m => m.id === Number(debtPlayer));
              if (!p || !debtAmount) return;
              onAddDebt(p.id, p.name, Number(debtAmount), debtDesc || `Dívida manual`);
              setDebtPlayer(""); setDebtAmount(""); setDebtDesc("");
            }}><Icon name="plus" size={15}/> Registar dívida</button>
          </div>
        </>}

        {/* STATS */}
        {adminTab === "stats" && <PiggyBankCard piggybank={piggybank} history={history} />}

        {/* JOGADORES */}
        {adminTab === "jogadores" && (
          <div className="player-list">
            {members.map(p=>(
              <div key={p.id} className="list-row" style={{flexWrap:"wrap",paddingBottom:12,alignItems:"flex-start",gap:8}}>
                <div className="av-member" style={{marginTop:2}}>{p.name[0]}</div>
                <div className="list-info" style={{flex:1}}><span className="list-name">{p.name}{p.is_admin&&<span className="admin-chip"> ★</span>}</span><span className="guest-sub">{p.status==="in"?"✅ Confirmado":p.status==="wait"?"⏳ Espera":"❌ Fora"}</span></div>
                <button className={`paid-btn ${p.status==="in"||p.status==="wait"?"paid-no":"paid-yes"}`} style={{fontSize:10}} onClick={()=>onTogglePresence(p.id)}>{p.status==="in"?"✅ Dentro":p.status==="wait"?"⏳ Espera":"❌ Fora"}</button>
                {!p.is_admin&&<button className="icon-danger" onClick={()=>onRemovePlayer(p.id)}><Icon name="trash" size={13}/></button>}
                {editPassId===p.id?(
                  <div style={{width:"100%",display:"flex",gap:6,marginTop:4}}>
                    <input className="text-input" style={{flex:1,fontSize:12,padding:"7px 10px"}} placeholder="Nova password..." value={editPassVal} onChange={e=>setEditPassVal(e.target.value)} autoFocus />
                    <button className="btn-primary" style={{padding:"7px 10px"}} onClick={()=>{onChangePassword(p.id,editPassVal);setEditPassId(null);setEditPassVal("");}}><Icon name="check" size={13}/></button>
                    <button className="icon-ghost" onClick={()=>setEditPassId(null)}><Icon name="x" size={13}/></button>
                  </div>
                ):<button className="icon-ghost" onClick={()=>{setEditPassId(p.id);setEditPassVal("");}}><Icon name="key" size={14}/></button>}
              </div>
            ))}
          </div>
        )}

        {/* GERIR */}
        {adminTab === "gerir" && <>
          <div className="game-info-card">
            <div className="game-info-header"><Icon name="edit" size={14}/> INFORMAÇÕES DO JOGO</div>
            <label className="field-label"><Icon name="pin" size={12}/> Local</label>
            <input className="text-input" value={editLoc} onChange={e=>{setEditLoc(e.target.value);setEdited(true);}} />
            <div className="date-time-row">
              <div style={{flex:1}}><label className="field-label"><Icon name="cal" size={12}/> Data</label><input className="text-input" type="date" value={editDate} onChange={e=>{setEditDate(e.target.value);setEdited(true);}}/></div>
              <div style={{width:100}}><label className="field-label"><Icon name="clock" size={12}/> Hora</label><input className="text-input" type="time" value={editTime} onChange={e=>{setEditTime(e.target.value);setEdited(true);}}/></div>
            </div>
            <button className={`btn-save ${edited?"btn-save-active":""}`} disabled={!edited} onClick={()=>{onUpdateGameInfo({location:editLoc,date:editDate,time:editTime});setEdited(false);}}>
              <Icon name="check" size={14}/> {edited?"GUARDAR ALTERAÇÕES":"SEM ALTERAÇÕES"}
            </button>
          </div>
          <p className="section-label" style={{marginTop:20}}><Icon name="plus" size={12}/> ADICIONAR MEMBRO</p>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <input className="text-input" placeholder="Nome..." value={newName} onChange={e=>setNewName(e.target.value)} />
            <input className="text-input" placeholder="Password inicial..." value={newPass} onChange={e=>setNewPass(e.target.value)} />
            <button className="btn-primary" onClick={()=>{onAddPlayer(newName,newPass);setNewName("");setNewPass("");}}>
              <Icon name="plus" size={15}/> Adicionar membro
            </button>
          </div>
          <p style={{fontSize:11,color:"#6b7280",marginTop:10}}>💡 Partilha a password com o jogador pelo WhatsApp.</p>
        </>}
      </div>
    </div>
  );
}

const globalCss = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;600;700;800&display=swap');
@keyframes spin { to { transform: rotate(360deg); } }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0d1a0e; font-family: 'DM Sans', sans-serif; color: #f0fdf4; min-height: 100vh; }
.screen { min-height: 100vh; display: flex; flex-direction: column; max-width: 480px; margin: 0 auto; }
.spinner { width: 40px; height: 40px; border: 4px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.8s linear infinite; }
.field-header { position: relative; overflow: hidden; background: #166534; padding: 18px 16px 14px; border-bottom: 3px solid #fff; }
.field-lines { position: absolute; inset: 0; pointer-events: none; }
.fl { position: absolute; border: 1.5px solid rgba(255,255,255,0.1); }
.fl-center-circle { width: 100px; height: 100px; border-radius: 50%; top: 50%; left: 50%; transform: translate(-50%,-50%); }
.fl-center-line { top: 0; bottom: 0; left: 50%; width: 0; border-left: 1.5px solid rgba(255,255,255,0.1); }
.fl-left-box  { top: 15%; bottom: 15%; left: -20px; width: 70px; border-radius: 0 8px 8px 0; }
.fl-right-box { top: 15%; bottom: 15%; right: -20px; width: 70px; border-radius: 8px 0 0 8px; }
.field-content { position: relative; z-index: 1; }
.field-badge { display: flex; align-items: center; gap: 8px; }
.field-badge-icon { font-size: 16px; }
.field-badge-name { font-family: 'Bebas Neue', cursive; font-size: 20px; letter-spacing: 3px; color: white; }
.field-nav-btn { background: rgba(0,0,0,0.25); border: none; border-radius: 8px; padding: 5px 8px; color: white; cursor: pointer; display: flex; align-items: center; font-family: 'DM Sans',sans-serif; }
.field-nav-btn:hover { background: rgba(0,0,0,0.4); }
.field-date { font-size: 11px; color: rgba(255,255,255,0.75); text-transform: capitalize; margin-bottom: 4px; margin-top: 4px; }
.field-timeloc { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
.field-chip { display: inline-flex; align-items: center; gap: 3px; background: rgba(0,0,0,0.25); border-radius: 20px; padding: 2px 8px; font-size: 10px; color: rgba(255,255,255,0.85); font-weight: 600; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.field-cd { font-family: 'Bebas Neue', cursive; font-size: 12px; color: #bbf7d0; background: rgba(0,0,0,0.2); border-radius: 20px; padding: 2px 10px; }
.score-display { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.score-block { display: flex; flex-direction: column; align-items: center; }
.score-num { font-family: 'Bebas Neue', cursive; font-size: 40px; line-height: 1; }
.score-num.green { color: #4ade80; } .score-num.white { color: white; }
.score-label { font-size: 8px; font-weight: 700; letter-spacing: 1.5px; color: rgba(255,255,255,0.4); margin-top: 1px; }
.score-sep { font-family: 'Bebas Neue', cursive; font-size: 22px; color: rgba(255,255,255,0.3); }
.pct-bar { height: 4px; background: rgba(255,255,255,0.2); border-radius: 99px; overflow: hidden; margin-bottom: 4px; }
.pct-fill { height: 100%; background: #4ade80; border-radius: 99px; transition: width .6s; }
.pct-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
.pct-label { font-size: 10px; font-weight: 700; }
.pct-label.green { color: #4ade80; } .pct-label.muted { color: rgba(255,255,255,0.4); } .pct-label.yellow { color: #fbbf24; }
.body, .login-body { flex: 1; background: #f0fdf4; color: #14532d; padding: 16px 16px 48px; }
.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.topbar-name { font-size: 14px; color: #166534; }
.section-label { font-size: 10px; font-weight: 800; letter-spacing: 1.5px; color: #6b7280; text-transform: uppercase; margin-bottom: 8px; display: flex; align-items: center; gap: 5px; }
.player-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; }
.player-card { background: white; border: 2px solid #d1fae5; border-radius: 12px; padding: 12px 8px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px; transition: all .15s; color: #14532d; font-family: 'DM Sans', sans-serif; }
.player-card:hover, .player-card.selected { border-color: #16a34a; box-shadow: 0 0 0 3px rgba(22,163,74,.15); }
.player-card-name { font-size: 12px; font-weight: 700; }
.av-member, .av-wait, .av-out, .av-guest, .player-avatar { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; flex-shrink: 0; color: white; }
.av-member, .player-avatar.av-in { background: linear-gradient(135deg,#16a34a,#15803d); }
.player-avatar.av-out { background: linear-gradient(135deg,#166534,#14532d); }
.player-avatar.av-wait { background: linear-gradient(135deg,#d97706,#b45309); }
.av-wait { background: linear-gradient(135deg,#d97706,#b45309); }
.av-out  { background: #d1fae5; color: #9ca3af; }
.av-guest { background: linear-gradient(135deg,#7c3aed,#6d28d9); }
.pw-box { background: white; border: 2px solid #d1fae5; border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.pw-label { font-size: 13px; color: #6b7280; } .pw-label strong { color: #14532d; }
.pw-row { display: flex; gap: 8px; }
.pw-input { flex: 1; background: #f0fdf4; border: 2px solid #d1fae5; border-radius: 10px; padding: 10px 14px; color: #14532d; font-size: 14px; outline: none; font-family: 'DM Sans',sans-serif; }
.pw-input:focus { border-color: #16a34a; }
.btn-primary { background: #16a34a; color: white; border: none; border-radius: 10px; padding: 11px 18px; font-weight: 800; cursor: pointer; font-size: 13px; font-family: 'DM Sans',sans-serif; display: flex; align-items: center; gap: 6px; }
.btn-primary:hover { background: #15803d; }
.btn-big { width: 100%; padding: 13px; border-radius: 12px; border: none; cursor: pointer; font-size: 14px; font-weight: 800; font-family: 'Bebas Neue',cursive; letter-spacing: 1.5px; display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 14px; }
.btn-big:hover { filter: brightness(1.08); }
.btn-green { background: #16a34a; color: white; } .btn-red { background: #dc2626; color: white; }
.btn-add { background: #16a34a; color: white; border: none; border-radius: 10px; padding: 10px 13px; cursor: pointer; display: flex; align-items: center; flex-shrink: 0; }
.btn-danger-full { background: #fee2e2; color: #dc2626; border: none; border-radius: 10px; padding: 12px; font-weight: 800; cursor: pointer; font-size: 12px; font-family: 'DM Sans',sans-serif; width: 100%; text-align: center; }
.icon-ghost { background: transparent; border: none; border-radius: 8px; padding: 7px; color: #6b7280; cursor: pointer; display: flex; align-items: center; }
.icon-ghost:hover { background: #d1fae5; }
.icon-danger { background: #fee2e2; border: none; border-radius: 8px; padding: 7px; color: #dc2626; cursor: pointer; display: flex; flex-shrink: 0; }
.status-banner { border-radius: 14px; padding: 12px 14px; display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.sb-in { background: #dcfce7; } .sb-wait { background: #fef3c7; } .sb-out { background: #f0fdf4; border: 2px solid #d1fae5; }
.sb-icon { font-size: 22px; } .sb-title { font-size: 14px; font-weight: 800; color: #14532d; } .sb-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
.player-list { display: flex; flex-direction: column; gap: 5px; margin-bottom: 4px; }
.list-row { display: flex; align-items: center; gap: 8px; background: white; border-radius: 10px; padding: 9px 12px; border: 1px solid #d1fae5; }
.row-guest { border-color: #ede9fe; background: #faf5ff; }
.list-num { font-size: 10px; color: #9ca3af; width: 14px; text-align: center; flex-shrink: 0; }
.list-info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.list-name { font-size: 13px; font-weight: 700; color: #14532d; }
.guest-sub { font-size: 10px; color: #7c3aed; margin-top: 1px; }
.admin-chip { color: #16a34a; }
.empty-msg { font-size: 12px; color: #9ca3af; text-align: center; padding: 12px 0; }
.paid-chip, .paid-btn { font-size: 11px; font-weight: 700; border-radius: 8px; padding: 4px 9px; flex-shrink: 0; }
.paid-chip { border: none; } .paid-btn { border: none; cursor: pointer; display: flex; align-items: center; gap: 3px; font-family: 'DM Sans',sans-serif; }
.paid-yes { background: #dcfce7; color: #16a34a; } .paid-no { background: #fee2e2; color: #dc2626; }
.money-row { display: flex; gap: 8px; margin-bottom: 14px; }
.money-box { flex: 1; border-radius: 12px; padding: 10px 8px; text-align: center; display: flex; flex-direction: column; gap: 3px; }
.green-box { background: #dcfce7; } .red-box { background: #fee2e2; } .yellow-box { background: #fef3c7; }
.money-num { font-family: 'Bebas Neue',cursive; font-size: 22px; line-height: 1; }
.green-box .money-num { color: #16a34a; } .red-box .money-num { color: #dc2626; }
.money-label { font-size: 9px; font-weight: 800; letter-spacing: 1px; color: #6b7280; text-transform: uppercase; }
.card-section { background: white; border: 2px solid #d1fae5; border-radius: 14px; padding: 13px; }
.tabs { display: flex; gap: 2px; background: #d1fae5; border-radius: 10px; padding: 3px; margin-bottom: 14px; }
.tab { flex: 1; padding: 7px 2px; border-radius: 8px; border: none; cursor: pointer; background: transparent; color: #6b7280; font-size: 14px; font-family: 'DM Sans',sans-serif; transition: all .15s; }
.tab-active { background: #16a34a; color: white; }
.guest-locked { background: #f0fdf4; border: 2px dashed #bbf7d0; border-radius: 10px; padding: 14px; text-align: center; font-size: 13px; color: #6b7280; }
.guest-hint { background: #fef3c7; border-radius: 10px; padding: 9px 12px; font-size: 11px; color: #92400e; font-weight: 600; margin-bottom: 8px; }
.add-guest-row { display: flex; gap: 8px; margin-bottom: 8px; }
.guest-row { display: flex; align-items: center; gap: 8px; background: #faf5ff; border-radius: 10px; padding: 8px 10px; margin-top: 6px; border: 1px solid #ede9fe; }
.guest-row-name { flex: 1; font-size: 13px; font-weight: 700; color: #14532d; }
.tag-guest { font-size: 10px; font-weight: 700; background: #ede9fe; color: #7c3aed; border-radius: 20px; padding: 2px 8px; flex-shrink: 0; }
.text-input { background: #f0fdf4; border: 2px solid #d1fae5; border-radius: 10px; padding: 10px 14px; color: #14532d; font-size: 13px; font-family: 'DM Sans',sans-serif; outline: none; width: 100%; }
.text-input:focus { border-color: #16a34a; }
.text-input::placeholder { color: #9ca3af; }
input[type="date"], input[type="time"] { color-scheme: light; }
select.text-input { appearance: none; }
.game-info-card { background: white; border: 2px solid #d1fae5; border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.game-info-header { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; letter-spacing: 1px; color: #166534; text-transform: uppercase; }
.field-label { font-size: 11px; font-weight: 700; color: #6b7280; display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
.date-time-row { display: flex; gap: 10px; }
.btn-save { width: 100%; padding: 11px; border-radius: 10px; border: 2px solid #d1fae5; background: #f0fdf4; color: #9ca3af; font-weight: 800; font-size: 12px; font-family: 'DM Sans',sans-serif; cursor: not-allowed; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all .2s; }
.btn-save-active { background: #16a34a; color: white; border-color: #16a34a; cursor: pointer; }
.btn-save-active:hover { background: #15803d; }
.toast { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); border-radius: 12px; padding: 11px 20px; font-size: 13px; font-weight: 700; color: white; z-index: 9999; box-shadow: 0 8px 24px rgba(0,0,0,.25); white-space: nowrap; font-family: 'DM Sans',sans-serif; }
.toast-ok { background: #16a34a; } .toast-warn { background: #d97706; } .toast-err { background: #dc2626; }
`;
