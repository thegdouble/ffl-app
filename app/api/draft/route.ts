import { drawBlockStart, teamsForRound, type DraftDraw, type DraftTeam } from "../../../db/draft";
import { ensureDatabase, getD1 } from "../../../db/runtime";

export const dynamic = "force-dynamic";

type DivisionRow = { id: string; name: string; short_name: string };
type PlayerRow = { id: string; first_name: string; last_name: string; position: string; nfl_team: string; adp: number };
type StateRow = { division_id: string; round: number; pick_index: number; total_rounds: number; status: string };
type ConfigRow = { league_name: string; season: string };
type OperatorRow = { operator_name: string; updated_at: string };
type PickRow = { id: number; division_id: string; team_id: string; player_id: string; round: number; pick_number: number; created_at: string; team_name: string; team_abbreviation: string; first_name: string; last_name: string; position: string; nfl_team: string };
type SkipRow = { id: number; team_id: string; round: number; pick_number: number; status: string; filled_pick_id: number | null; created_at: string; resolved_at: string | null; team_name: string; team_abbreviation: string };
type AuditRow = { id: number; action: string; detail: string; created_at: string };

function selectedDivision(request: Request) {
  const requested = new URL(request.url).searchParams.get("division")?.trim();
  return requested && /^[a-z0-9-]+$/.test(requested) ? requested : "front";
}

function nextState(state: StateRow, teamCount: number) {
  const nextIndex = state.pick_index + 1;
  const completesRound = nextIndex >= teamCount;
  const round = completesRound ? state.round + 1 : state.round;
  return {
    round,
    pickIndex: completesRound ? 0 : nextIndex,
    status: round > state.total_rounds ? "complete" : completesRound && round % 2 === 1 ? "awaiting_draw" : "live",
  };
}

async function loadState(divisionId: string) {
  const db = getD1();
  const [division, divisionsResult, teamsResult, playersResult, state, picksResult, config, operator, skipsResult, auditResult] = await Promise.all([
    db.prepare("SELECT id, name, short_name FROM divisions WHERE id = ?").bind(divisionId).first<DivisionRow>(),
    db.prepare("SELECT id, name, short_name FROM divisions ORDER BY rowid").all<DivisionRow>(),
    db.prepare("SELECT id, division_id, name, abbreviation, draft_order FROM teams WHERE division_id = ? ORDER BY draft_order").bind(divisionId).all<DraftTeam>(),
    db.prepare(`SELECT p.id, p.first_name, p.last_name, p.position, p.nfl_team, p.adp FROM players p
      WHERE NOT EXISTS (SELECT 1 FROM draft_picks dp WHERE dp.division_id = ? AND dp.player_id = p.id)
      ORDER BY p.adp, p.last_name`).bind(divisionId).all<PlayerRow>(),
    db.prepare("SELECT division_id, round, pick_index, total_rounds, status FROM draft_state WHERE division_id = ?").bind(divisionId).first<StateRow>(),
    db.prepare(`SELECT dp.id, dp.division_id, dp.team_id, dp.player_id, dp.round, dp.pick_number, dp.created_at,
      t.name AS team_name, t.abbreviation AS team_abbreviation, p.first_name, p.last_name, p.position, p.nfl_team
      FROM draft_picks dp JOIN teams t ON t.id = dp.team_id JOIN players p ON p.id = dp.player_id
      WHERE dp.division_id = ? ORDER BY dp.id DESC`).bind(divisionId).all<PickRow>(),
    db.prepare("SELECT league_name, season FROM league_config WHERE id = 'default'").first<ConfigRow>(),
    db.prepare("SELECT operator_name, updated_at FROM draft_operators WHERE division_id = ?").bind(divisionId).first<OperatorRow>(),
    db.prepare(`SELECT ds.id, ds.team_id, ds.round, ds.pick_number, ds.status, ds.filled_pick_id, ds.created_at, ds.resolved_at,
      t.name AS team_name, t.abbreviation AS team_abbreviation FROM draft_skips ds JOIN teams t ON t.id = ds.team_id
      WHERE ds.division_id = ? ORDER BY ds.status = 'open' DESC, ds.round, ds.pick_number`).bind(divisionId).all<SkipRow>(),
    db.prepare("SELECT id, action, detail, created_at FROM audit_events WHERE division_id IN (?, 'league') ORDER BY id DESC LIMIT 24").bind(divisionId).all<AuditRow>(),
  ]);
  if (!division || !state || !config) throw new Error("Draft room not found.");
  const teams = teamsResult.results;
  const blockStartRound = drawBlockStart(state.round);
  const draw = await db.prepare(`SELECT id, division_id, block_start_round, order_json, cards_json, locked, actor, created_at FROM draft_draws
    WHERE division_id = ? AND block_start_round = ?`).bind(divisionId, blockStartRound).first<DraftDraw>();
  const order = teamsForRound(teams, state.round, draw);
  const currentTeam = state.status === "live" ? order[state.pick_index] ?? null : null;
  const teamMap = new Map(teams.map((team) => [team.id, team]));
  const assignments = draw ? JSON.parse(draw.cards_json) as Array<{ teamId: string; card: string; rank: string; suit: string; order: number }> : [];

  return {
    league: { name: config.league_name, season: config.season },
    division: { id: division.id, name: division.name, shortName: division.short_name },
    divisions: divisionsResult.results.map((item) => ({ id: item.id, name: item.name, shortName: item.short_name })),
    teams: teams.map((team) => ({ id: team.id, name: team.name, abbreviation: team.abbreviation, draftOrder: team.draft_order })),
    players: playersResult.results.map((player) => ({ id: player.id, firstName: player.first_name, lastName: player.last_name, position: player.position, nflTeam: player.nfl_team, adp: player.adp })),
    state: {
      round: state.round, pickIndex: state.pick_index, totalRounds: state.total_rounds, status: state.status,
      currentTeam: currentTeam ? { id: currentTeam.id, name: currentTeam.name, abbreviation: currentTeam.abbreviation } : null,
      roundOrder: order.map((team) => ({ id: team.id, name: team.name, abbreviation: team.abbreviation })),
      operator: { name: operator?.operator_name ?? "Unassigned", updatedAt: operator?.updated_at ?? null },
      draw: { required: state.status === "awaiting_draw" || !draw?.locked, locked: Boolean(draw?.locked), blockStartRound,
        assignments: assignments.map((assignment) => ({ ...assignment, teamName: teamMap.get(assignment.teamId)?.name ?? "Unknown team", teamAbbreviation: teamMap.get(assignment.teamId)?.abbreviation ?? "—" })) },
    },
    picks: picksResult.results.map((pick) => ({ id: pick.id, teamId: pick.team_id, round: pick.round, pickNumber: pick.pick_number, teamName: pick.team_name, teamAbbreviation: pick.team_abbreviation, player: { firstName: pick.first_name, lastName: pick.last_name, position: pick.position, nflTeam: pick.nfl_team } })),
    skips: skipsResult.results.map((skip) => ({ id: skip.id, teamId: skip.team_id, teamName: skip.team_name, teamAbbreviation: skip.team_abbreviation, round: skip.round, pickNumber: skip.pick_number, status: skip.status, createdAt: skip.created_at })),
    audit: auditResult.results.map((event) => ({ id: event.id, action: event.action, detail: event.detail, createdAt: event.created_at })),
  };
}

async function currentDraftContext(divisionId: string) {
  const db = getD1();
  const [state, teamsResult] = await Promise.all([
    db.prepare("SELECT division_id, round, pick_index, total_rounds, status FROM draft_state WHERE division_id = ?").bind(divisionId).first<StateRow>(),
    db.prepare("SELECT id, division_id, name, abbreviation, draft_order FROM teams WHERE division_id = ? ORDER BY draft_order").bind(divisionId).all<DraftTeam>(),
  ]);
  if (!state || !teamsResult.results.length) throw new Error("Draft room not found.");
  const draw = await db.prepare(`SELECT id, division_id, block_start_round, order_json, cards_json, locked, actor, created_at FROM draft_draws
    WHERE division_id = ? AND block_start_round = ?`).bind(divisionId, drawBlockStart(state.round)).first<DraftDraw>();
  return { db, state, teams: teamsResult.results, draw };
}

function auditStatement(db: D1Database, divisionId: string, action: string, detail: unknown, now: string) {
  return db.prepare("INSERT INTO audit_events (division_id, action, detail, created_at) VALUES (?, ?, ?, ?)").bind(divisionId, action, JSON.stringify(detail), now);
}

export async function GET(request: Request) {
  try { await ensureDatabase(); return Response.json(await loadState(selectedDivision(request)), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unable to load the draft." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const body = await request.json() as { divisionId?: string; playerId?: string; action?: string; makeupSkipId?: number; operatorName?: string };
    const divisionId = body.divisionId?.trim() ?? "";
    const action = body.action ?? "confirm";
    if (!divisionId || !/^[a-z0-9-]+$/.test(divisionId)) return Response.json({ error: "A valid division is required." }, { status: 400 });
    const now = new Date().toISOString();
    const { db, state, teams, draw } = await currentDraftContext(divisionId);

    if (action === "takeover") {
      const operatorName = body.operatorName?.trim().slice(0, 60) || "Commissioner";
      await db.batch([
        db.prepare(`INSERT INTO draft_operators (division_id, operator_name, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(division_id) DO UPDATE SET operator_name = excluded.operator_name, updated_at = excluded.updated_at`).bind(divisionId, operatorName, now),
        auditStatement(db, divisionId, "operator.taken_over", { operatorName }, now),
      ]);
      return Response.json(await loadState(divisionId));
    }

    if (action === "pause" || action === "resume") {
      const expected = action === "pause" ? "live" : "paused";
      const next = action === "pause" ? "paused" : "live";
      if (state.status !== expected) return Response.json({ error: action === "pause" ? "Only an active draft can be paused." : "This draft is not paused." }, { status: 409 });
      await db.batch([
        db.prepare("UPDATE draft_state SET status = ? WHERE division_id = ? AND status = ?").bind(next, divisionId, expected),
        auditStatement(db, divisionId, action === "pause" ? "draft.paused" : "draft.resumed", {}, now),
      ]);
      return Response.json(await loadState(divisionId));
    }

    if (action === "undo") {
      const latest = await db.prepare(`SELECT id, division_id, team_id, player_id, round, pick_number, created_at FROM draft_picks
        WHERE division_id = ? ORDER BY id DESC LIMIT 1`).bind(divisionId).first<{ id: number; team_id: string; player_id: string; round: number; pick_number: number }>();
      if (!latest) return Response.json({ error: "There is no confirmed pick to undo." }, { status: 409 });
      const skip = await db.prepare("SELECT id FROM draft_skips WHERE filled_pick_id = ? AND division_id = ?").bind(latest.id, divisionId).first<{ id: number }>();
      const statements = [db.prepare("DELETE FROM draft_picks WHERE id = ? AND division_id = ?").bind(latest.id, divisionId)];
      if (skip) {
        statements.push(db.prepare("UPDATE draft_skips SET status = 'open', filled_pick_id = NULL, resolved_at = NULL WHERE id = ?").bind(skip.id));
      } else {
        statements.push(db.prepare("UPDATE draft_state SET round = ?, pick_index = ?, status = 'live' WHERE division_id = ?").bind(latest.round, latest.pick_number - 1, divisionId));
      }
      statements.push(auditStatement(db, divisionId, skip ? "makeup.undone" : "pick.undone", { pickId: latest.id, playerId: latest.player_id, round: latest.round, pickNumber: latest.pick_number }, now));
      await db.batch(statements);
      return Response.json(await loadState(divisionId));
    }

    let currentTeam: DraftTeam | null = null;
    if (!body.makeupSkipId) {
      if (state.status !== "live") return Response.json({ error: state.status === "paused" ? "The draft is paused." : "This draft is not accepting scheduled picks." }, { status: 409 });
      if (!draw?.locked) return Response.json({ error: "Lock the current card draw before entering picks." }, { status: 409 });
      const order = teamsForRound(teams, state.round, draw);
      currentTeam = order[state.pick_index] ?? null;
      if (!currentTeam) return Response.json({ error: "The current draft slot is invalid." }, { status: 409 });
    }

    if (action === "skip") {
      if (!currentTeam) return Response.json({ error: "The current draft slot is invalid." }, { status: 409 });
      const next = nextState(state, teams.length);
      await db.batch([
        db.prepare("INSERT INTO draft_skips (division_id, team_id, round, pick_number, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)")
          .bind(divisionId, currentTeam.id, state.round, state.pick_index + 1, now),
        db.prepare("UPDATE draft_state SET round = ?, pick_index = ?, status = ? WHERE division_id = ? AND round = ? AND pick_index = ?")
          .bind(next.round, next.pickIndex, next.status, divisionId, state.round, state.pick_index),
        auditStatement(db, divisionId, "pick.skipped", { teamId: currentTeam.id, teamName: currentTeam.name, round: state.round, pickNumber: state.pick_index + 1 }, now),
      ]);
      return Response.json(await loadState(divisionId));
    }

    const playerId = body.playerId?.trim() ?? "";
    if (!playerId) return Response.json({ error: "Choose a player before confirming." }, { status: 400 });
    const player = await db.prepare("SELECT id, first_name, last_name FROM players WHERE id = ?").bind(playerId).first<{ id: string; first_name: string; last_name: string }>();
    if (!player) return Response.json({ error: "Player not found." }, { status: 404 });
    const taken = await db.prepare("SELECT id FROM draft_picks WHERE division_id = ? AND player_id = ?").bind(divisionId, playerId).first<{ id: number }>();
    if (taken) return Response.json({ error: "That player was already drafted in this division." }, { status: 409 });

    if (body.makeupSkipId) {
      const skip = await db.prepare("SELECT id, team_id, round, pick_number FROM draft_skips WHERE id = ? AND division_id = ? AND status = 'open'")
        .bind(body.makeupSkipId, divisionId).first<{ id: number; team_id: string; round: number; pick_number: number }>();
      if (!skip) return Response.json({ error: "That makeup slot is no longer open." }, { status: 409 });
      await db.batch([
        db.prepare("INSERT INTO draft_picks (division_id, team_id, player_id, round, pick_number, created_at) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(divisionId, skip.team_id, playerId, skip.round, skip.pick_number, now),
        db.prepare(`UPDATE draft_skips SET status = 'filled', filled_pick_id = (
          SELECT id FROM draft_picks WHERE division_id = ? AND player_id = ?
        ), resolved_at = ? WHERE id = ? AND status = 'open'`).bind(divisionId, playerId, now, skip.id),
        auditStatement(db, divisionId, "makeup.confirmed", { skipId: skip.id, teamId: skip.team_id, playerId, playerName: `${player.first_name} ${player.last_name}` }, now),
      ]);
    } else {
      if (!currentTeam || !draw) return Response.json({ error: "The current draft slot is invalid." }, { status: 409 });
      const next = nextState(state, teams.length);
      await db.batch([
        db.prepare("INSERT INTO draft_picks (division_id, team_id, player_id, round, pick_number, created_at) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(divisionId, currentTeam.id, playerId, state.round, state.pick_index + 1, now),
        db.prepare("UPDATE draft_state SET round = ?, pick_index = ?, status = ? WHERE division_id = ? AND round = ? AND pick_index = ?")
          .bind(next.round, next.pickIndex, next.status, divisionId, state.round, state.pick_index),
        auditStatement(db, divisionId, "pick.confirmed", { teamId: currentTeam.id, teamName: currentTeam.name, playerId, playerName: `${player.first_name} ${player.last_name}`, round: state.round, pickNumber: state.pick_index + 1, drawId: draw.id }, now),
      ]);
    }
    return Response.json(await loadState(divisionId), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update the draft.";
    const conflict = message.includes("UNIQUE") || message.includes("constraint");
    return Response.json({ error: conflict ? "That player or draft slot was just updated. The board has been refreshed." : message }, { status: conflict ? 409 : 500 });
  }
}
