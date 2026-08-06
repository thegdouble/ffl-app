"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Division = { id: string; name: string; shortName: string };
type Team = { id: string; name: string; abbreviation: string; draftOrder: number };
type Player = { id: string; firstName: string; lastName: string; position: string; nflTeam: string; adp: number };
type Pick = {
  id: number;
  teamId: string;
  round: number;
  pickNumber: number;
  teamName: string;
  teamAbbreviation: string;
  player: { firstName: string; lastName: string; position: string; nflTeam: string };
};
type DraftData = {
  league: { name: string; season: string };
  division: Division;
  divisions: Division[];
  teams: Team[];
  players: Player[];
  state: {
    round: number;
    pickIndex: number;
    totalRounds: number;
    status: string;
    currentTeam: { id: string; name: string; abbreviation: string } | null;
    roundOrder: { id: string; name: string; abbreviation: string }[];
  };
  picks: Pick[];
};

const positions = ["ALL", "QB", "RB", "WR", "TE", "DL", "LB", "DB", "K"];

export function DraftRoom({
  initialView,
  initialDivision,
}: {
  initialView: "operator" | "board";
  initialDivision: "front" | "rear";
}) {
  const [data, setData] = useState<DraftData | null>(null);
  const [divisionId, setDivisionId] = useState(initialDivision);
  const [view, setView] = useState<"operator" | "board">(initialView);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("ALL");
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [selected, setSelected] = useState<Player | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(true);
  const [announcement, setAnnouncement] = useState<Pick | null>(null);
  const latestPick = useRef<number | null>(null);

  const load = useCallback(async (quiet = false) => {
    try {
      const response = await fetch(`/api/draft?division=${divisionId}`, { cache: "no-store" });
      const next = (await response.json()) as DraftData & { error?: string };
      if (!response.ok) throw new Error(next.error || "Unable to load draft room.");
      if (latestPick.current !== null && next.picks[0] && next.picks[0].id > latestPick.current) {
        setAnnouncement(next.picks[0]);
        window.setTimeout(() => setAnnouncement(null), 4200);
      }
      latestPick.current = next.picks[0]?.id ?? null;
      setData(next);
      setConnected(true);
      if (!quiet) setError("");
    } catch (loadError) {
      setConnected(false);
      if (!quiet) setError(loadError instanceof Error ? loadError.message : "Unable to load draft room.");
    }
  }, [divisionId]);

  useEffect(() => {
    latestPick.current = null;
    const initialLoad = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(true), 900);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [load]);

  const nflTeams = useMemo(
    () => Array.from(new Set((data?.players ?? []).map((player) => player.nflTeam))).sort(),
    [data?.players],
  );

  const filteredPlayers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.players ?? [])
      .filter((player) => {
        const name = `${player.firstName} ${player.lastName}`.toLowerCase();
        return (!normalized || name.includes(normalized) || player.lastName.toLowerCase().startsWith(normalized))
          && (position === "ALL" || player.position === position)
          && (teamFilter === "ALL" || player.nflTeam === teamFilter);
      })
      .sort((a, b) => a.adp - b.adp)
      .slice(0, 12);
  }, [data?.players, position, query, teamFilter]);

  async function confirmPick() {
    if (!selected || !data) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ divisionId: data.division.id, playerId: selected.id }),
      });
      const next = (await response.json()) as DraftData & { error?: string };
      if (!response.ok) throw new Error(next.error || "Unable to confirm pick.");
      latestPick.current = next.picks[0]?.id ?? latestPick.current;
      setAnnouncement(next.picks[0] ?? null);
      window.setTimeout(() => setAnnouncement(null), 4200);
      setData(next);
      setSelected(null);
      setQuery("");
      setPosition("ALL");
      setTeamFilter("ALL");
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : "Unable to confirm pick.");
      await load(true);
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <main className="loading-shell">
        <div className="loading-mark">NPL</div>
        <p>{error || "Opening the draft room…"}</p>
        {error && <button onClick={() => void load()}>Try again</button>}
      </main>
    );
  }

  const totalPick = (data.state.round - 1) * data.teams.length + data.state.pickIndex + 1;
  const picksByTeam = new Map(data.teams.map((team) => [team.id, data.picks.filter((pick) => pick.teamId === team.id)]));

  return (
    <main className={`app-shell ${view === "board" ? "board-mode" : ""}`}>
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true"><span>N</span><span>P</span><span>L</span></div>
          <div>
            <p className="eyebrow">2026 draft prototype</p>
            <h1>{data.league.name}</h1>
          </div>
        </div>
        <div className="header-controls">
          <div className={`connection ${connected ? "online" : "offline"}`}>
            <span />{connected ? "Live" : "Reconnecting"}
          </div>
          <div className="segmented" aria-label="View selection">
            <button className={view === "operator" ? "active" : ""} onClick={() => setView("operator")}>Operator</button>
            <button className={view === "board" ? "active" : ""} onClick={() => setView("board")}>Draft board</button>
          </div>
        </div>
      </header>

      <nav className="division-tabs" aria-label="Division">
        {data.divisions.map((division) => (
          <button
            key={division.id}
            className={divisionId === division.id ? "active" : ""}
            onClick={() => {
              setData(null);
              setSelected(null);
              setDivisionId(division.id);
            }}
          >
            <span>{division.shortName}</span>{division.name}
          </button>
        ))}
      </nav>

      {announcement && (
        <div className="announcement" role="status" aria-live="polite">
          <p>Round {announcement.round} · Pick {announcement.pickNumber}</p>
          <strong>{announcement.teamName} selects</strong>
          <h2>{announcement.player.firstName} {announcement.player.lastName}</h2>
          <span>{announcement.player.position} · {announcement.player.nflTeam}</span>
        </div>
      )}

      {view === "operator" ? (
        <section className="operator-grid">
          <aside className="clock-panel">
            <div className="panel-label">On the clock</div>
            <div className="round-pill">Round {data.state.round} of {data.state.totalRounds}</div>
            <div className="clock-team-mark">{data.state.currentTeam?.abbreviation ?? "—"}</div>
            <h2>{data.state.currentTeam?.name ?? "Draft complete"}</h2>
            <p>Pick {totalPick} · Card order locked</p>
            <div className="order-list">
              {data.state.roundOrder.map((team, index) => (
                <div key={team.id} className={index === data.state.pickIndex ? "current" : index < data.state.pickIndex ? "done" : ""}>
                  <span>{index + 1}</span><strong>{team.abbreviation}</strong><small>{team.name}</small>
                </div>
              ))}
            </div>
            <button className="secondary-button" type="button">Pause draft</button>
          </aside>

          <section className="search-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Player entry</p>
                <h2>Find the pick</h2>
              </div>
              <span>{data.players.length} available</span>
            </div>
            <label className="search-box">
              <span>Player name</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a last name…" autoFocus />
              <kbd>⌘ K</kbd>
            </label>
            <div className="filters">
              <div className="position-chips" aria-label="Position filter">
                {positions.map((item) => (
                  <button key={item} className={position === item ? "active" : ""} onClick={() => setPosition(item)}>{item}</button>
                ))}
              </div>
              <label>
                <span>NFL team</span>
                <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}>
                  <option value="ALL">All teams</option>
                  {nflTeams.map((team) => <option key={team} value={team}>{team}</option>)}
                </select>
              </label>
              <div className="sort-note"><span>↕</span> ADP: low to high</div>
            </div>

            <div className="player-table" role="list" aria-label="Available players">
              <div className="player-row table-head"><span>Player</span><span>Pos</span><span>Team</span><span>ADP</span><span /></div>
              {filteredPlayers.map((player) => (
                <button key={player.id} className={`player-row ${selected?.id === player.id ? "selected" : ""}`} onClick={() => setSelected(player)} role="listitem">
                  <span className="player-name"><span className={`position-dot p-${player.position.toLowerCase()}`}>{player.position.slice(0, 1)}</span><strong>{player.firstName} {player.lastName}</strong></span>
                  <span>{player.position}</span><span>{player.nflTeam}</span><span>{player.adp.toFixed(1)}</span><span className="select-arrow">→</span>
                </button>
              ))}
              {filteredPlayers.length === 0 && <div className="empty-results">No available players match those filters.</div>}
            </div>

            {error && <div className="error-banner" role="alert">{error}</div>}
            <div className={`confirm-dock ${selected ? "visible" : ""}`}>
              {selected ? (
                <>
                  <div>
                    <p>Confirm for {data.state.currentTeam?.name}</p>
                    <strong>{selected.firstName} {selected.lastName}</strong>
                    <span>{selected.position} · {selected.nflTeam} · ADP {selected.adp.toFixed(1)}</span>
                  </div>
                  <div className="confirm-actions">
                    <button className="cancel-button" onClick={() => setSelected(null)} disabled={busy}>Cancel</button>
                    <button className="confirm-button" onClick={() => void confirmPick()} disabled={busy || !data.state.currentTeam}>
                      {busy ? "Confirming…" : "Confirm pick"}
                    </button>
                  </div>
                </>
              ) : <p>Select a player to review and confirm the pick.</p>}
            </div>
          </section>

          <aside className="recent-panel">
            <div className="section-heading compact"><div><p className="eyebrow">Live log</p><h2>Recent picks</h2></div><button>View all</button></div>
            <div className="recent-list">
              {data.picks.slice(0, 8).map((pick) => (
                <div key={pick.id} className="recent-pick">
                  <span className="pick-number">{pick.round}.{pick.pickNumber}</span>
                  <div><strong>{pick.player.firstName} {pick.player.lastName}</strong><span>{pick.player.position} · {pick.player.nflTeam}</span></div>
                  <small>{pick.teamAbbreviation}</small>
                </div>
              ))}
              {data.picks.length === 0 && <div className="empty-card"><strong>No picks yet</strong><span>The first confirmed pick will appear here.</span></div>}
            </div>
            <div className="operator-tip"><span>⌁</span><p><strong>Public boards stay neutral.</strong> Search results and ADP are visible only here.</p></div>
          </aside>
        </section>
      ) : (
        <section className="public-board">
          <div className="board-hero">
            <div><p className="eyebrow">{data.division.name}</p><h2>Round {data.state.round}</h2><span>Pick {totalPick}</span></div>
            <div className="now-picking"><p>Now picking</p><strong>{data.state.currentTeam?.name ?? "Draft complete"}</strong><span>{data.state.currentTeam?.abbreviation ?? "—"}</span></div>
            <div className="board-status"><span className="pulse" />Live draft board</div>
          </div>
          <div className="draft-grid">
            {data.teams.map((team) => (
              <article key={team.id} className={data.state.currentTeam?.id === team.id ? "on-clock" : ""}>
                <header><span>{team.abbreviation}</span><strong>{team.name}</strong></header>
                <div className="team-picks">
                  {(picksByTeam.get(team.id) ?? []).slice().reverse().map((pick) => (
                    <div key={pick.id}><span>{pick.round}</span><strong>{pick.player.firstName.slice(0, 1)}. {pick.player.lastName}</strong><small>{pick.player.position} · {pick.player.nflTeam}</small></div>
                  ))}
                  {(picksByTeam.get(team.id) ?? []).length === 0 && <p>Waiting for first pick</p>}
                </div>
              </article>
            ))}
          </div>
          <footer className="board-footer"><span>NFL POKER &amp; LIQUOR</span><strong>{data.division.shortName} DIVISION</strong><span>ROUND {data.state.round} · PICK {data.state.pickIndex + 1}</span></footer>
        </section>
      )}
    </main>
  );
}
