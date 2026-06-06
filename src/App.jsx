import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MAX_PLAYERS = 15;
const MIN_PLAYERS = 10;
const COST = 3;

function defaultGameInfo() {
  const now = new Date();
  const diff = (3 - now.getDay() + 7) % 7 || 7;
  const d = new Date(now);
  d.setDate(now.getDate() + diff);
  return {
    location: "Pavilhão Gimnodesportivo de Alcochete",
    date: d.toISOString().split("T")[0],
    time: "22:30"
  };
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
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

// ─── ICONS ───────────────────────────────────────────────────────────────────
const Icon = ({ name, size = 18 }) => {
  const icons = {
    ball:   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 6.88 2.75L12 12 5.12 4.75A10 10 0 0 1 12 2z"/><path d="M2.5 8.5l9.5 3.5 9.5-3.5"/><path d="M12 12v10"/></svg>,
    check:  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>,
    x:      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    plus:   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    clock:  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    logout: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
    shield: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    trash:  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
    people: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    key:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6"/><path d="M15.5 7.5l3 3L22 7l-3-3"/></svg>,
    eye:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
    eyeoff: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
    guest:  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>,
    pin:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
    edit:   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    cal:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  };
  return icons[name] || null;
};

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [players, setPlayers]     = useState([]);
  const [gameInfo, setGameInfo]   = useState(defaultGameInfo());
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView]           = useState("login");
  const [toast, setToast]         = useState(null);
  const [adminTab, setAdminTab]   = useState("jogo");
  const [loading, setLoading]     = useState(true);
  const [, setTick]               = useState(0);

  const showToast = (msg, type = "ok") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  // ── LOAD DATA ──
  useEffect(() => {
    loadAll();
    // Real-time subscriptions
    const playersSub = supabase.channel("players_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, () => loadPlayers())
      .subscribe();
    const gameSub = supabase.channel("game_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "game_info" }, () => loadGameInfo())
      .subscribe();
    const timer = setInterval(() => setTick(x => x + 1), 60000);
    return () => { supabase.removeChannel(playersSub); supabase.removeChannel(gameSub); clearInterval(timer); };
  }, []);

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadPlayers(), loadGameInfo()]);
    setLoading(false);
  }

  async function loadPlayers() {
    const { data } = await supabase.from("players").select("*").order("id");
    if (data) setPlayers(data);
  }

  async function loadGameInfo() {
    const { data } = await supabase.from("game_info").select("*").eq("id", 1).single();
    if (data) setGameInfo(data);
  }

  // ── DERIVED ──
  const members   = players.filter(p => !p.is_guest);
  const guests    = players.filter(p => p.is_guest);
  const confirmed = sortedConfirmed(players);
  const waiting   = players.filter(p => p.status === "wait");
  const notYet    = members.filter(p => p.status === "out");
  const spotsLeft = Math.max(0, MAX_PLAYERS - confirmed.length);
  const cdStr     = countdown(gameInfo.date, gameInfo.time);

  // ── AUTH ──
  const handleLogin = async (playerId, password) => {
    const p = players.find(p => p.id === playerId);
    if (!p || p.password !== password) return false;
    setCurrentUser(p);
    setView(p.is_admin ? "admin" : "player");
    return true;
  };
  const handleLogout = () => { setCurrentUser(null); setView("login"); };

  // ── PRESENCE ──
  const togglePresence = async (playerId) => {
    const p = players.find(pl => pl.id === playerId);
    if (!p) return;
    let newStatus, newConfirmedAt;
    if (p.status === "in" || p.status === "wait") {
      newStatus = "out"; newConfirmedAt = null;
    } else if (confirmed.length < MAX_PLAYERS) {
      newStatus = "in"; newConfirmedAt = Date.now();
    } else {
      newStatus = "wait"; newConfirmedAt = Date.now();
      showToast("Jogo cheio! Ficaste em lista de espera ⏳", "warn");
    }
    await supabase.from("players").update({ status: newStatus, confirmed_at: newConfirmedAt, paid: false }).eq("id", playerId);
  };

  // ── GUESTS ──
  const addGuest = async (guestName, invitedById) => {
    if (!guestName.trim()) return;
    const inviter = players.find(p => p.id === invitedById);
    if (!inviter) return;
    if (confirmed.length >= MAX_PLAYERS) { showToast("Jogo já está cheio!", "err"); return; }
    await supabase.from("players").insert({
      name: guestName.trim(), is_admin: false, password: null,
      paid: false, status: "in", is_guest: true,
      invited_by: inviter.name, invited_by_id: invitedById, confirmed_at: Date.now()
    });
    showToast(`${guestName} adicionado! 🎉`);
  };
  const removeGuest = async (id) => { await supabase.from("players").delete().eq("id", id); showToast("Convidado removido"); };

  // ── ADMIN ──
  const togglePaid = async (id) => {
    const p = players.find(pl => pl.id === id);
    await supabase.from("players").update({ paid: !p.paid }).eq("id", id);
    showToast("Pagamento atualizado ✓");
  };
  const removePlayer = async (id) => { await supabase.from("players").delete().eq("id", id); showToast("Jogador removido"); };
  const addPlayer = async (name, password) => {
    if (!name.trim() || !password.trim()) return;
    await supabase.from("players").insert({ name: name.trim(), is_admin: false, password: password.trim(), paid: false, status: "out", is_guest: false, invited_by: null, invited_by_id: null, confirmed_at: null });
    showToast(`${name} adicionado! 🎉`);
  };
  const changePassword = async (id, pw) => { await supabase.from("players").update({ password: pw }).eq("id", id); showToast("Password alterada ✓"); };
  const resetGame = async () => {
    await supabase.from("players").delete().eq("is_guest", true);
    await supabase.from("players").update({ status: "out", paid: false, confirmed_at: null }).eq("is_guest", false);
    showToast("Jogo reiniciado ✓");
  };
  const updateGameInfo = async (patch) => {
    await supabase.from("game_info").update(patch).eq("id", 1);
    showToast("Jogo atualizado ✓");
  };

  const liveUser = currentUser ? players.find(p => p.id === currentUser.id) : null;

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#166534", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <style>{globalCss}</style>
      <div style={{ fontSize: 48 }}>⚽</div>
      <div style={{ fontFamily: "'Bebas Neue',cursive", fontSize: 32, color: "white", letterSpacing: 3 }}>KICKOFF</div>
      <div style={{ width: 40, height: 40, border: "4px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  const shared = { gameInfo, cdStr, confirmed, waiting, notYet, guests, spotsLeft, members };

  return (
    <div>
      <style>{globalCss}</style>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      {view === "login"  && <LoginView  {...shared} onLogin={handleLogin} showToast={showToast} />}
      {view === "player" && liveUser && <PlayerView {...shared} player={liveUser} onToggle={() => togglePresence(liveUser.id)} onAddGuest={n => addGuest(n, liveUser.id)} onRemoveGuest={removeGuest} onLogout={handleLogout} />}
      {view === "admin"  && liveUser && <AdminView  {...shared} currentUser={liveUser} adminTab={adminTab} setAdminTab={setAdminTab} onTogglePaid={togglePaid} onRemovePlayer={removePlayer} onAddPlayer={addPlayer} onChangePassword={changePassword} onResetGame={resetGame} onTogglePresence={togglePresence} onAddGuest={n => addGuest(n, liveUser.id)} onRemoveGuest={removeGuest} onUpdateGameInfo={updateGameInfo} onLogout={handleLogout} showToast={showToast} />}
    </div>
  );
}

// ─── FIELD HEADER ─────────────────────────────────────────────────────────────
function FieldHeader({ gameInfo, cdStr, children }) {
  return (
    <div className="field-header">
      <div className="field-lines" aria-hidden="true">
        <div className="fl fl-center-circle" /><div className="fl fl-center-line" />
        <div className="fl fl-left-box" /><div className="fl fl-right-box" />
      </div>
      <div className="field-content">
        <div className="field-badge"><span className="field-badge-icon">⚽</span><span className="field-badge-name">KickOff</span></div>
        <div className="field-date">{formatDisplayDate(gameInfo.date)}</div>
        <div className="field-timeloc">
          <span className="field-chip"><Icon name="clock" size={11}/> {gameInfo.time}</span>
          <span className="field-chip"><Icon name="pin" size={11}/> {gameInfo.location}</span>
        </div>
        <div style={{ marginBottom: 10 }}><span className="field-cd">{cdStr}</span></div>
        {children}
      </div>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginView({ gameInfo, cdStr, confirmed, notYet, waiting, members, onLogin, showToast }) {
  const [selected, setSelected] = useState(null);
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const pct = Math.round((confirmed.length / MAX_PLAYERS) * 100);
  const handleSubmit = () => { if (!selected) return; if (!onLogin(selected.id, password)) { showToast("Password incorreta!", "err"); setPassword(""); } };
  return (
    <div className="screen">
      <FieldHeader gameInfo={gameInfo} cdStr={cdStr}>
        <div className="score-display">
          <div className="score-block"><span className="score-num green">{confirmed.length}</span><span className="score-label">CONFIRMADOS</span></div>
          <div className="score-sep">VS</div>
          <div className="score-block"><span className="score-num white">{MAX_PLAYERS}</span><span className="score-label">LUGARES</span></div>
        </div>
        <div className="pct-bar"><div className="pct-fill" style={{ width: `${pct}%` }} /></div>
        <div className="pct-row">
          <span className="pct-label green">✓ {confirmed.length} dentro</span>
          {notYet.length  > 0 && <span className="pct-label muted">? {notYet.length} sem resposta</span>}
          {waiting.length > 0 && <span className="pct-label yellow">⏳ {waiting.length} espera</span>}
        </div>
      </FieldHeader>
      <div className="login-body">
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
              <button className="icon-ghost" onClick={() => setShowPw(v => !v)}><Icon name={showPw ? "eyeoff" : "eye"} size={16} /></button>
            </div>
            <button className="btn-primary" onClick={handleSubmit}>ENTRAR →</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PLAYER VIEW ──────────────────────────────────────────────────────────────
function PlayerView({ gameInfo, cdStr, confirmed, waiting, notYet, guests, spotsLeft, player, onToggle, onAddGuest, onRemoveGuest, onLogout }) {
  const isIn = player.status === "in", isWait = player.status === "wait";
  const waitPos = waiting.findIndex(p => p.id === player.id) + 1;
  const myGuests = guests.filter(g => g.invited_by_id === player.id);
  const [guestName, setGuestName] = useState("");
  return (
    <div className="screen">
      <FieldHeader gameInfo={gameInfo} cdStr={cdStr}>
        <div className="score-display">
          <div className="score-block"><span className="score-num green">{confirmed.length}</span><span className="score-label">CONFIRMADOS</span></div>
          <div className="score-sep">/</div>
          <div className="score-block"><span className="score-num white">{MAX_PLAYERS}</span><span className="score-label">LUGARES</span></div>
        </div>
      </FieldHeader>
      <div className="body">
        <div className="topbar"><span className="topbar-name">Olá, <strong>{player.name}</strong></span><button className="icon-ghost" onClick={onLogout}><Icon name="logout" size={16}/></button></div>
        <div className={`status-banner sb-${isIn?"in":isWait?"wait":"out"}`}>
          <span className="sb-icon">{isIn?"✅":isWait?"⏳":"⚽"}</span>
          <div><div className="sb-title">{isIn?"Confirmado!":isWait?`Lista de espera #${waitPos}`:"Ainda não respondeste"}</div><div className="sb-sub">{isIn?"Estás dentro do jogo":isWait?"Aguarda por uma vaga":`${spotsLeft} vagas disponíveis`}</div></div>
        </div>
        <button className={`btn-big ${isIn||isWait?"btn-red":"btn-green"}`} onClick={onToggle}>
          {isIn||isWait?<><Icon name="x" size={18}/> CANCELAR PRESENÇA</>:<><Icon name="check" size={18}/> CONFIRMAR PRESENÇA</>}
        </button>
        <div className="card-section">
          <p className="section-label"><Icon name="guest" size={12}/> CONVIDAR ALGUÉM</p>
          {spotsLeft === 0 ? <div className="guest-locked">🔒 Jogo cheio</div> : (
            <>
              {confirmed.length < MIN_PLAYERS && <div className="guest-hint">⚠️ Menos de {MIN_PLAYERS} confirmados. Membros do grupo têm prioridade.</div>}
              <div className="add-guest-row">
                <input className="text-input" placeholder="Nome do convidado..." value={guestName} onChange={e => setGuestName(e.target.value)} onKeyDown={e => e.key==="Enter"&&(onAddGuest(guestName),setGuestName(""))} />
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
        <ConfirmedList confirmed={confirmed} />
        {waiting.length > 0 && <><p className="section-label" style={{marginTop:14}}><Icon name="clock" size={12}/> LISTA DE ESPERA</p><div className="player-list">{waiting.map((p,i)=><div key={p.id} className="list-row"><span className="list-num">{i+1}</span><div className="av-wait">{p.name[0]}</div><span className="list-name">{p.name}</span></div>)}</div></>}
      </div>
    </div>
  );
}

function ConfirmedList({ confirmed, onTogglePaid, isAdmin }) {
  if (!confirmed.length) return <p className="empty-msg">Ninguém confirmou ainda</p>;
  return (
    <div className="player-list">
      {confirmed.map((p, i) => (
        <div key={p.id} className={`list-row ${p.is_guest ? "row-guest" : ""}`}>
          <span className="list-num">{i+1}</span>
          <div className={p.is_guest ? "av-guest" : "av-member"}>{p.name[0]}</div>
          <div className="list-info"><span className="list-name">{p.name}</span>{p.is_guest && <span className="guest-sub">convidado de {p.invited_by}</span>}</div>
          {isAdmin
            ? <button className={`paid-btn ${p.paid?"paid-yes":"paid-no"}`} onClick={() => onTogglePaid(p.id)}>{p.paid?<><Icon name="check" size={11}/> Pago</>:`Deve ${COST}€`}</button>
            : <span className={`paid-chip ${p.paid?"paid-yes":"paid-no"}`}>{p.paid?"Pago ✓":`Deve ${COST}€`}</span>}
        </div>
      ))}
    </div>
  );
}

// ─── ADMIN VIEW ───────────────────────────────────────────────────────────────
function AdminView({ gameInfo, cdStr, confirmed, waiting, notYet, guests, spotsLeft, members, currentUser, adminTab, setAdminTab, onTogglePaid, onRemovePlayer, onAddPlayer, onChangePassword, onResetGame, onTogglePresence, onAddGuest, onRemoveGuest, onUpdateGameInfo, onLogout, showToast }) {
  const [newName, setNewName]       = useState("");
  const [newPass, setNewPass]       = useState("");
  const [editPassId, setEditPassId] = useState(null);
  const [editPassVal, setEditPassVal] = useState("");
  const [guestName, setGuestName]   = useState("");
  const [editLoc, setEditLoc]       = useState(gameInfo.location);
  const [editDate, setEditDate]     = useState(gameInfo.date);
  const [editTime, setEditTime]     = useState(gameInfo.time);
  const [edited, setEdited]         = useState(false);
  useEffect(() => { setEditLoc(gameInfo.location); setEditDate(gameInfo.date); setEditTime(gameInfo.time); }, [gameInfo]);
  const totalPaid = confirmed.filter(p => p.paid).length;
  const totalUnpaid = confirmed.filter(p => !p.paid).length;
  return (
    <div className="screen">
      <FieldHeader gameInfo={gameInfo} cdStr={cdStr}>
        <div className="score-display">
          <div className="score-block"><span className="score-num green">{confirmed.length}</span><span className="score-label">CONFIRMADOS</span></div>
          <div className="score-sep">/</div>
          <div className="score-block"><span className="score-num white">{MAX_PLAYERS}</span><span className="score-label">LUGARES</span></div>
        </div>
      </FieldHeader>
      <div className="body">
        <div className="topbar"><span className="topbar-name"><Icon name="shield" size={14}/> <strong>{currentUser.name}</strong> · Admin</span><button className="icon-ghost" onClick={onLogout}><Icon name="logout" size={16}/></button></div>
        <div className="money-row">
          <div className="money-box green-box"><span className="money-num">{totalPaid*COST}€</span><span className="money-label">Recebido</span></div>
          <div className="money-box red-box"><span className="money-num">{totalUnpaid*COST}€</span><span className="money-label">Por receber</span></div>
          <div className="money-box yellow-box"><span className="money-num">{notYet.length}</span><span className="money-label">Sem resposta</span></div>
        </div>
        <div className="tabs">
          {[["jogo","⚽ Jogo"],["convidados","🌟 Convidados"],["equipa","👥 Equipa"],["gerir","⚙️ Gerir"]].map(([k,l]) => (
            <button key={k} className={`tab ${adminTab===k?"tab-active":""}`} onClick={() => setAdminTab(k)}>{l}</button>
          ))}
        </div>

        {adminTab === "jogo" && <>
          <p className="section-label">✅ CONFIRMADOS ({confirmed.length})</p>
          <ConfirmedList confirmed={confirmed} onTogglePaid={onTogglePaid} isAdmin />
          {waiting.length>0&&<><p className="section-label" style={{marginTop:14}}>⏳ LISTA DE ESPERA</p><div className="player-list">{waiting.map((p,i)=><div key={p.id} className="list-row"><span className="list-num">{i+1}</span><div className="av-wait">{p.name[0]}</div><span className="list-name">{p.name}</span></div>)}</div></>}
          {notYet.length>0&&<><p className="section-label" style={{marginTop:14}}>❓ SEM RESPOSTA</p><div className="player-list">{notYet.map(p=><div key={p.id} className="list-row"><div className="av-out">{p.name[0]}</div><span className="list-name">{p.name}</span></div>)}</div></>}
          <button className="btn-danger-full" style={{marginTop:18}} onClick={onResetGame}>🔄 Reiniciar jogo (remove presenças e convidados)</button>
        </>}

        {adminTab === "convidados" && <>
          <p className="section-label"><Icon name="guest" size={12}/> ADICIONAR CONVIDADO</p>
          {spotsLeft===0?<div className="guest-locked">🔒 Jogo cheio</div>:(
            <>
              {confirmed.length<MIN_PLAYERS&&<div className="guest-hint">⚠️ Menos de {MIN_PLAYERS} confirmados. Membros têm prioridade.</div>}
              <div className="add-guest-row">
                <input className="text-input" placeholder="Nome do convidado..." value={guestName} onChange={e=>setGuestName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(onAddGuest(guestName),setGuestName(""))} />
                <button className="btn-add" onClick={()=>{onAddGuest(guestName);setGuestName("");}}><Icon name="plus" size={16}/></button>
              </div>
            </>
          )}
          {guests.length>0&&<><p className="section-label" style={{marginTop:14}}>TODOS OS CONVIDADOS ({guests.length})</p>
          <div className="player-list">{guests.map(g=><div key={g.id} className="list-row row-guest"><div className="av-guest">{g.name[0]}</div><div className="list-info"><span className="list-name">{g.name}</span><span className="guest-sub">convidado de {g.invited_by}</span></div><button className={`paid-btn ${g.paid?"paid-yes":"paid-no"}`} onClick={()=>onTogglePaid(g.id)}>{g.paid?<><Icon name="check" size={11}/> Pago</>:`Deve ${COST}€`}</button><button className="icon-danger" onClick={()=>onRemoveGuest(g.id)}><Icon name="trash" size={12}/></button></div>)}</div></>}
        </>}

        {adminTab === "equipa" && (
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

// ─── CSS ──────────────────────────────────────────────────────────────────────
const globalCss = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;600;700;800&display=swap');
@keyframes spin { to { transform: rotate(360deg); } }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0d1a0e; font-family: 'DM Sans', sans-serif; color: #f0fdf4; min-height: 100vh; }
.screen { min-height: 100vh; display: flex; flex-direction: column; max-width: 480px; margin: 0 auto; }
.field-header { position: relative; overflow: hidden; background: #166534; padding: 22px 20px 18px; border-bottom: 3px solid #fff; }
.field-lines { position: absolute; inset: 0; pointer-events: none; }
.fl { position: absolute; border: 1.5px solid rgba(255,255,255,0.12); }
.fl-center-circle { width: 110px; height: 110px; border-radius: 50%; top: 50%; left: 50%; transform: translate(-50%,-50%); }
.fl-center-line { top: 0; bottom: 0; left: 50%; width: 0; border-left: 1.5px solid rgba(255,255,255,0.12); }
.fl-left-box  { top: 15%; bottom: 15%; left: -24px; width: 80px; border-radius: 0 8px 8px 0; }
.fl-right-box { top: 15%; bottom: 15%; right: -24px; width: 80px; border-radius: 8px 0 0 8px; }
.field-content { position: relative; z-index: 1; }
.field-badge { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
.field-badge-icon { font-size: 18px; }
.field-badge-name { font-family: 'Bebas Neue', cursive; font-size: 22px; letter-spacing: 3px; color: white; }
.field-date { font-size: 12px; color: rgba(255,255,255,0.8); text-transform: capitalize; margin-bottom: 5px; }
.field-timeloc { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
.field-chip { display: inline-flex; align-items: center; gap: 4px; background: rgba(0,0,0,0.25); border-radius: 20px; padding: 3px 9px; font-size: 11px; color: rgba(255,255,255,0.85); font-weight: 600; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.field-cd { font-family: 'Bebas Neue', cursive; font-size: 13px; color: #bbf7d0; background: rgba(0,0,0,0.2); border-radius: 20px; padding: 2px 10px; }
.score-display { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.score-block { display: flex; flex-direction: column; align-items: center; }
.score-num { font-family: 'Bebas Neue', cursive; font-size: 48px; line-height: 1; }
.score-num.green { color: #4ade80; } .score-num.white { color: white; }
.score-label { font-size: 9px; font-weight: 700; letter-spacing: 1.5px; color: rgba(255,255,255,0.45); margin-top: 2px; }
.score-sep { font-family: 'Bebas Neue', cursive; font-size: 26px; color: rgba(255,255,255,0.35); }
.pct-bar { height: 5px; background: rgba(255,255,255,0.2); border-radius: 99px; overflow: hidden; margin-bottom: 5px; }
.pct-fill { height: 100%; background: #4ade80; border-radius: 99px; transition: width .6s; }
.pct-row { display: flex; gap: 10px; flex-wrap: wrap; }
.pct-label { font-size: 11px; font-weight: 700; }
.pct-label.green { color: #4ade80; } .pct-label.muted { color: rgba(255,255,255,0.45); } .pct-label.yellow { color: #fbbf24; }
.body, .login-body { flex: 1; background: #f0fdf4; color: #14532d; padding: 18px 16px 48px; }
.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
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
.btn-big { width: 100%; padding: 13px; border-radius: 12px; border: none; cursor: pointer; font-size: 14px; font-weight: 800; font-family: 'Bebas Neue',cursive; letter-spacing: 1.5px; display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 16px; }
.btn-big:hover { filter: brightness(1.08); }
.btn-green { background: #16a34a; color: white; } .btn-red { background: #dc2626; color: white; }
.btn-add { background: #16a34a; color: white; border: none; border-radius: 10px; padding: 10px 13px; cursor: pointer; display: flex; align-items: center; flex-shrink: 0; }
.btn-danger-full { background: #fee2e2; color: #dc2626; border: none; border-radius: 10px; padding: 12px; font-weight: 800; cursor: pointer; font-size: 12px; font-family: 'DM Sans',sans-serif; width: 100%; text-align: center; }
.icon-ghost { background: transparent; border: none; border-radius: 8px; padding: 7px; color: #6b7280; cursor: pointer; display: flex; align-items: center; }
.icon-ghost:hover { background: #d1fae5; }
.icon-danger { background: #fee2e2; border: none; border-radius: 8px; padding: 7px; color: #dc2626; cursor: pointer; display: flex; flex-shrink: 0; }
.status-banner { border-radius: 14px; padding: 13px 15px; display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
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
.money-num { font-family: 'Bebas Neue',cursive; font-size: 24px; line-height: 1; }
.green-box .money-num { color: #16a34a; } .red-box .money-num { color: #dc2626; } .yellow-box .money-num { color: #d97706; }
.money-label { font-size: 9px; font-weight: 800; letter-spacing: 1px; color: #6b7280; text-transform: uppercase; }
.card-section { background: white; border: 2px solid #d1fae5; border-radius: 14px; padding: 13px; margin-bottom: 14px; }
.tabs { display: flex; gap: 3px; background: #d1fae5; border-radius: 10px; padding: 3px; margin-bottom: 14px; }
.tab { flex: 1; padding: 7px 2px; border-radius: 8px; border: none; cursor: pointer; background: transparent; color: #6b7280; font-size: 10px; font-weight: 800; font-family: 'DM Sans',sans-serif; transition: all .15s; }
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
