"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Team = { id: string; name: string; abbreviation: string; draftOrder: number };
type Draw = {
  id: number;
  blockStartRound: number;
  locked: boolean;
  actor: string;
  createdAt: string;
  assignments: Array<{ teamId: string; teamName: string; teamAbbreviation: string; card: string; order: number }>;
};
type Division = {
  id: string;
  name: string;
  shortName: string;
  teams: Team[];
  state: { round: number; pick_index: number; total_rounds: number; status: string } | null;
  draws: Draw[];
};
type SetupData = {
  config: { leagueName: string; season: string; totalRounds: number; roundsPerDraw: number; redrawAllowed: boolean };
  divisions: Division[];
  hasPicks: boolean;
};
type EditableTeam = Team & { divisionId: string };

export function CommissionerSetup() {
  const [data, setData] = useState<SetupData | null>(null);
  const [tab, setTab] = useState<"league" | "teams" | "draws">("league");
  const [leagueName, setLeagueName] = useState("");
  const [totalRounds, setTotalRounds] = useState(20);
  const [redrawAllowed, setRedrawAllowed] = useState(false);
  const [teams, setTeams] = useState<EditableTeam[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const applyData = useCallback((next: SetupData) => {
    setData(next);
    setLeagueName(next.config.leagueName);
    setTotalRounds(next.config.totalRounds);
    setRedrawAllowed(next.config.redrawAllowed);
    setTeams(next.divisions.flatMap((division) => division.teams.map((team) => ({ ...team, divisionId: division.id }))));
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/commissioner", { cache: "no-store" });
      const next = (await response.json()) as SetupData & { error?: string };
      if (!response.ok) throw new Error(next.error || "Unable to load setup.");
      applyData(next);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load setup.");
    }
  }, [applyData]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const counts = useMemo(() => data?.divisions.map((division) => teams.filter((team) => team.divisionId === division.id).length) ?? [], [data?.divisions, teams]);
  const balanced = counts.length > 1 && counts.every((count) => count > 0 && count === counts[0]);

  async function send(action: string, payload: Record<string, unknown>, success: string) {
    setBusy(action);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/commissioner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const next = (await response.json()) as SetupData & { error?: string };
      if (!response.ok) throw new Error(next.error || "Unable to save changes.");
      applyData(next);
      setNotice(success);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save changes.");
    } finally {
      setBusy("");
    }
  }

  function updateTeam(id: string, field: "name" | "abbreviation" | "divisionId", value: string) {
    setTeams((current) => current.map((team) => team.id === id ? { ...team, [field]: field === "abbreviation" ? value.toUpperCase().slice(0, 5) : value } : team));
  }

  function addTeam(divisionId: string) {
    const id = `team-${crypto.randomUUID()}`;
    setTeams((current) => [...current, { id, divisionId, name: "", abbreviation: "", draftOrder: current.length }]);
  }

  if (!data) {
    return <main className="setup-loading"><div className="loading-mark">NPL</div><p>{error || "Opening commissioner setup…"}</p></main>;
  }

  return (
    <main className="setup-shell">
      <header className="setup-header">
        <div>
          <p className="eyebrow">2026 draft control</p>
          <h1>Commissioner setup</h1>
          <span>{data.config.leagueName}</span>
        </div>
        <Link href="/">Return to draft room →</Link>
      </header>

      <section className="setup-status" aria-label="Draft readiness">
        <div><span className={balanced ? "ready-dot" : "warning-dot"} /><strong>{teams.length} teams</strong><small>{balanced ? `Balanced ${counts.join(" / ")}` : `Needs equal divisions · ${counts.join(" / ")}`}</small></div>
        <div><span className="ready-dot" /><strong>{totalRounds} rounds</strong><small>Fresh draw every two rounds</small></div>
        <div><span className={data.divisions.every((division) => division.draws.some((draw) => draw.blockStartRound === (division.state?.round ?? 1) && draw.locked)) ? "ready-dot" : "warning-dot"} /><strong>Opening draws</strong><small>Each division locks independently</small></div>
      </section>

      <nav className="setup-tabs" aria-label="Commissioner setup sections">
        <button className={tab === "league" ? "active" : ""} onClick={() => setTab("league")}><span>1</span>League</button>
        <button className={tab === "teams" ? "active" : ""} onClick={() => setTab("teams")}><span>2</span>Teams &amp; divisions</button>
        <button className={tab === "draws" ? "active" : ""} onClick={() => setTab("draws")}><span>3</span>Card draws</button>
      </nav>

      {error && <div className="setup-message error" role="alert">{error}</div>}
      {notice && <div className="setup-message success" role="status">{notice}</div>}

      {tab === "league" && (
        <section className="setup-card league-settings">
          <div className="setup-card-heading"><div><p className="eyebrow">League rules</p><h2>Set the draft frame</h2></div><span>Changes save for both rooms</span></div>
          <div className="settings-grid">
            <label><span>League name</span><input value={leagueName} onChange={(event) => setLeagueName(event.target.value)} /></label>
            <label><span>Draft rounds</span><input type="number" min="20" max="25" value={totalRounds} onChange={(event) => setTotalRounds(Number(event.target.value))} /><small>Configurable from 20 through 25.</small></label>
            <div className="rule-card"><strong>Two-round blocks</strong><span>Odd round follows the draw. Even round automatically reverses it.</span><div className="round-example"><b>1</b><i>Draw order</i><b>2</b><i>Reverse</i></div></div>
            <label className="toggle-row"><input type="checkbox" checked={redrawAllowed} onChange={(event) => setRedrawAllowed(event.target.checked)} /><span><strong>Allow redraw before lock</strong><small>Off by default. Locked orders can never be redrawn.</small></span></label>
          </div>
          <div className="setup-actions"><button className="primary-action" disabled={busy !== ""} onClick={() => void send("saveSettings", { leagueName, totalRounds, redrawAllowed }, "League settings saved.")}>{busy === "saveSettings" ? "Saving…" : "Save league settings"}</button></div>
        </section>
      )}

      {tab === "teams" && (
        <section className="setup-card">
          <div className="setup-card-heading"><div><p className="eyebrow">Draft-day attendance</p><h2>Balance the player pools</h2></div><span className={balanced ? "valid-badge" : "invalid-badge"}>{balanced ? "Ready to draw" : "Not balanced"}</span></div>
          {data.hasPicks && <div className="locked-note">Team assignments are locked because this draft already has confirmed picks.</div>}
          <div className="division-editor-grid">
            {data.divisions.map((division) => {
              const divisionTeams = teams.filter((team) => team.divisionId === division.id);
              return (
                <article className="division-editor" key={division.id}>
                  <header><div><span>{division.shortName}</span><h3>{division.name}</h3></div><strong>{divisionTeams.length}</strong></header>
                  <div className="team-editor-list">
                    {divisionTeams.map((team, index) => (
                      <div className="team-editor-row" key={team.id}>
                        <span>{index + 1}</span>
                        <input aria-label={`${division.name} team ${index + 1} name`} placeholder="Team name" value={team.name} disabled={data.hasPicks} onChange={(event) => updateTeam(team.id, "name", event.target.value)} />
                        <input aria-label={`${division.name} team ${index + 1} abbreviation`} placeholder="ABBR" value={team.abbreviation} disabled={data.hasPicks} onChange={(event) => updateTeam(team.id, "abbreviation", event.target.value)} />
                        <select aria-label={`Division for ${team.name || `team ${index + 1}`}`} value={team.divisionId} disabled={data.hasPicks} onChange={(event) => updateTeam(team.id, "divisionId", event.target.value)}>
                          {data.divisions.map((option) => <option key={option.id} value={option.id}>{option.shortName}</option>)}
                        </select>
                        <button aria-label={`Remove ${team.name || `team ${index + 1}`}`} disabled={data.hasPicks} onClick={() => setTeams((current) => current.filter((item) => item.id !== team.id))}>×</button>
                      </div>
                    ))}
                  </div>
                  <button className="add-team" disabled={data.hasPicks || divisionTeams.length >= 16} onClick={() => addTeam(division.id)}>+ Add team to {division.shortName}</button>
                </article>
              );
            })}
          </div>
          <div className="setup-actions"><p>Both divisions must have the same number of teams before either opening draw can begin.</p><button className="primary-action" disabled={busy !== "" || data.hasPicks} onClick={() => void send("saveTeams", { teams }, "Teams and division assignments saved.")}>{busy === "saveTeams" ? "Saving…" : "Save teams"}</button></div>
        </section>
      )}

      {tab === "draws" && (
        <section className="draw-section">
          <div className="setup-card-heading draw-heading"><div><p className="eyebrow">Independent rooms</p><h2>Deal and lock the next card order</h2></div><span>Spades first · high hearts for overflow</span></div>
          <div className="draw-grid">
            {data.divisions.map((division) => {
              const round = division.state?.round ?? 1;
              const blockStart = round % 2 === 0 ? round - 1 : round;
              const draw = division.draws.find((item) => item.blockStartRound === blockStart);
              return (
                <article className="draw-card" key={division.id}>
                  <header><div><p>{division.shortName} division</p><h3>{division.name}</h3></div><span>Rounds {blockStart}{blockStart < totalRounds ? `–${blockStart + 1}` : ""}</span></header>
                  {!draw ? (
                    <div className="draw-empty"><span>♠</span><strong>Ready for a fresh draw</strong><p>The server randomly assigns one unique card to every team.</p></div>
                  ) : (
                    <div className="card-order">
                      {draw.assignments.slice().sort((a, b) => a.order - b.order).map((assignment, index) => (
                        <div key={assignment.teamId}><span>{index + 1}</span><b className={assignment.card.includes("♥") ? "heart-card" : ""}>{assignment.card}</b><strong>{assignment.teamName}</strong><small>{assignment.teamAbbreviation}</small></div>
                      ))}
                    </div>
                  )}
                  <footer>
                    {draw?.locked ? <div className="locked-order">✓ Order locked</div> : (
                      <>
                        <button className="deal-button" disabled={busy !== "" || !balanced || Boolean(draw && !redrawAllowed)} onClick={() => void send("generateDraw", { divisionId: division.id, actor: "Commissioner" }, `${division.shortName} cards dealt.`)}>{draw ? "Redraw cards" : "Deal cards"}</button>
                        <button className="lock-button" disabled={busy !== "" || !draw} onClick={() => void send("lockDraw", { divisionId: division.id }, `${division.shortName} order locked and ready.`)}>Lock order</button>
                      </>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
