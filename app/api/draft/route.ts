import { ensureDatabase, getD1 } from "../../../db/runtime";

export const dynamic = "force-dynamic";

type DivisionRow = { id: string; name: string; short_name: string };
type TeamRow = { id: string; division_id: string; name: string; abbreviation: string; draft_order: number };
type PlayerRow = { id: string; first_name: string; last_name: string; position: string; nfl_team: string; adp: number };
type StateRow = { division_id: string; round: number; pick_index: number; total_rounds: number; status: string };
type PickRow = {
  id: number;
  division_id: string;
  team_id: string;
  player_id: string;
  round: number;
  pick_number: number;
  created_at: string;
  team_name: string;
  team_abbreviation: string;
  first_name: string;
  last_name: string;
  position: string;
  nfl_team: string;
};

function selectedDivision(request: Request) {
  const requested = new URL(request.url).searchParams.get("division");
  return requested === "rear" ? "rear" : "front";
}

function orderedTeams(teams: TeamRow[], round: number) {
  const base = [...teams].sort((a, b) => a.draft_order - b.draft_order);
  return round % 2 === 0 ? base.reverse() : base;
}

async function loadState(divisionId: string) {
  const db = getD1();
  const [division, divisionsResult, teamsResult, playersResult, state, picksResult] = await Promise.all([
    db.prepare("SELECT id, name, short_name FROM divisions WHERE id = ?").bind(divisionId).first<DivisionRow>(),
    db.prepare("SELECT id, name, short_name FROM divisions ORDER BY id").all<DivisionRow>(),
    db.prepare("SELECT id, division_id, name, abbreviation, draft_order FROM teams WHERE division_id = ? ORDER BY draft_order")
      .bind(divisionId).all<TeamRow>(),
    db.prepare(`SELECT p.id, p.first_name, p.last_name, p.position, p.nfl_team, p.adp
      FROM players p
      WHERE NOT EXISTS (
        SELECT 1 FROM draft_picks dp WHERE dp.division_id = ? AND dp.player_id = p.id
      )
      ORDER BY p.adp, p.last_name`).bind(divisionId).all<PlayerRow>(),
    db.prepare("SELECT division_id, round, pick_index, total_rounds, status FROM draft_state WHERE division_id = ?")
      .bind(divisionId).first<StateRow>(),
    db.prepare(`SELECT dp.id, dp.division_id, dp.team_id, dp.player_id, dp.round, dp.pick_number, dp.created_at,
        t.name AS team_name, t.abbreviation AS team_abbreviation,
        p.first_name, p.last_name, p.position, p.nfl_team
      FROM draft_picks dp
      JOIN teams t ON t.id = dp.team_id
      JOIN players p ON p.id = dp.player_id
      WHERE dp.division_id = ?
      ORDER BY dp.id DESC`).bind(divisionId).all<PickRow>(),
  ]);

  if (!division || !state) throw new Error("Draft room not found.");
  const teams = teamsResult.results;
  const order = orderedTeams(teams, state.round);
  const currentTeam = state.status === "complete" ? null : order[state.pick_index] ?? null;

  return {
    league: { name: "NFL Poker and Liquor", season: "2026 Prototype" },
    division: { id: division.id, name: division.name, shortName: division.short_name },
    divisions: divisionsResult.results.map((item) => ({ id: item.id, name: item.name, shortName: item.short_name })),
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      abbreviation: team.abbreviation,
      draftOrder: team.draft_order,
    })),
    players: playersResult.results.map((player) => ({
      id: player.id,
      firstName: player.first_name,
      lastName: player.last_name,
      position: player.position,
      nflTeam: player.nfl_team,
      adp: player.adp,
    })),
    state: {
      round: state.round,
      pickIndex: state.pick_index,
      totalRounds: state.total_rounds,
      status: state.status,
      currentTeam: currentTeam ? { id: currentTeam.id, name: currentTeam.name, abbreviation: currentTeam.abbreviation } : null,
      roundOrder: order.map((team) => ({ id: team.id, name: team.name, abbreviation: team.abbreviation })),
    },
    picks: picksResult.results.map((pick) => ({
      id: pick.id,
      divisionId: pick.division_id,
      teamId: pick.team_id,
      playerId: pick.player_id,
      round: pick.round,
      pickNumber: pick.pick_number,
      createdAt: pick.created_at,
      teamName: pick.team_name,
      teamAbbreviation: pick.team_abbreviation,
      player: {
        firstName: pick.first_name,
        lastName: pick.last_name,
        position: pick.position,
        nflTeam: pick.nfl_team,
      },
    })),
  };
}

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    return Response.json(await loadState(selectedDivision(request)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load the draft." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const body = (await request.json()) as { divisionId?: string; playerId?: string };
    const divisionId = body.divisionId === "rear" ? "rear" : body.divisionId === "front" ? "front" : "";
    const playerId = body.playerId?.trim() ?? "";
    if (!divisionId || !playerId) {
      return Response.json({ error: "Division and player are required." }, { status: 400 });
    }

    const db = getD1();
    const state = await db.prepare("SELECT division_id, round, pick_index, total_rounds, status FROM draft_state WHERE division_id = ?")
      .bind(divisionId).first<StateRow>();
    if (!state || state.status !== "live") {
      return Response.json({ error: "This draft is not accepting picks." }, { status: 409 });
    }

    const teamsResult = await db.prepare("SELECT id, division_id, name, abbreviation, draft_order FROM teams WHERE division_id = ? ORDER BY draft_order")
      .bind(divisionId).all<TeamRow>();
    const order = orderedTeams(teamsResult.results, state.round);
    const currentTeam = order[state.pick_index];
    if (!currentTeam) {
      return Response.json({ error: "The current draft slot is invalid." }, { status: 409 });
    }

    const player = await db.prepare("SELECT id, first_name, last_name, position, nfl_team, adp FROM players WHERE id = ?")
      .bind(playerId).first<PlayerRow>();
    if (!player) return Response.json({ error: "Player not found." }, { status: 404 });

    const now = new Date().toISOString();
    const nextIndex = state.pick_index + 1;
    const completesRound = nextIndex >= order.length;
    const nextRound = completesRound ? state.round + 1 : state.round;
    const nextPickIndex = completesRound ? 0 : nextIndex;
    const nextStatus = nextRound > state.total_rounds ? "complete" : "live";
    const detail = JSON.stringify({
      teamId: currentTeam.id,
      teamName: currentTeam.name,
      playerId: player.id,
      playerName: `${player.first_name} ${player.last_name}`,
      round: state.round,
      pickNumber: state.pick_index + 1,
    });

    await db.batch([
      db.prepare(`INSERT INTO draft_picks
        (division_id, team_id, player_id, round, pick_number, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(divisionId, currentTeam.id, player.id, state.round, state.pick_index + 1, now),
      db.prepare(`UPDATE draft_state SET round = ?, pick_index = ?, status = ?
        WHERE division_id = ? AND round = ? AND pick_index = ?`)
        .bind(nextRound, nextPickIndex, nextStatus, divisionId, state.round, state.pick_index),
      db.prepare("INSERT INTO audit_events (division_id, action, detail, created_at) VALUES (?, 'pick.confirmed', ?, ?)")
        .bind(divisionId, detail, now),
    ]);

    return Response.json(await loadState(divisionId), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to confirm the pick.";
    const conflict = message.includes("UNIQUE") || message.includes("constraint");
    return Response.json(
      { error: conflict ? "That player or draft slot was just taken. The board has been refreshed." : message },
      { status: conflict ? 409 : 500 },
    );
  }
}

