import { drawBlockStart, generateCardDraw, type DraftDraw, type DraftTeam } from "../../../db/draft";
import { ensureDatabase, getD1 } from "../../../db/runtime";

export const dynamic = "force-dynamic";

type ConfigRow = { league_name: string; season: string; total_rounds: number; rounds_per_draw: number; redraw_allowed: number };
type DivisionRow = { id: string; name: string; short_name: string };
type StateRow = { division_id: string; round: number; pick_index: number; total_rounds: number; status: string };
type ImportedPlayer = { id: string; firstName: string; lastName: string; position: string; nflTeam: string; adp: number };

async function loadSetup() {
  const db = getD1();
  const [config, divisions, teams, states, draws, pickCount, playerCount] = await Promise.all([
    db.prepare("SELECT league_name, season, total_rounds, rounds_per_draw, redraw_allowed FROM league_config WHERE id = 'default'").first<ConfigRow>(),
    db.prepare("SELECT id, name, short_name FROM divisions ORDER BY rowid").all<DivisionRow>(),
    db.prepare("SELECT id, division_id, name, abbreviation, draft_order FROM teams ORDER BY division_id, draft_order").all<DraftTeam>(),
    db.prepare("SELECT division_id, round, pick_index, total_rounds, status FROM draft_state ORDER BY division_id").all<StateRow>(),
    db.prepare(`SELECT id, division_id, block_start_round, order_json, cards_json, locked, actor, created_at
      FROM draft_draws ORDER BY division_id, block_start_round DESC`).all<DraftDraw>(),
    db.prepare("SELECT COUNT(*) AS count FROM draft_picks").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM players").first<{ count: number }>(),
  ]);
  if (!config) throw new Error("League configuration is unavailable.");
  const teamMap = new Map(teams.results.map((team) => [team.id, team]));

  return {
    config: {
      leagueName: config.league_name,
      season: config.season,
      totalRounds: config.total_rounds,
      roundsPerDraw: config.rounds_per_draw,
      redrawAllowed: Boolean(config.redraw_allowed),
    },
    divisions: divisions.results.map((division) => ({
      id: division.id,
      name: division.name,
      shortName: division.short_name,
      teams: teams.results.filter((team) => team.division_id === division.id).map((team) => ({
        id: team.id,
        name: team.name,
        abbreviation: team.abbreviation,
        draftOrder: team.draft_order,
      })),
      state: states.results.find((state) => state.division_id === division.id) ?? null,
      draws: draws.results.filter((draw) => draw.division_id === division.id).map((draw) => ({
        id: draw.id,
        blockStartRound: draw.block_start_round,
        locked: Boolean(draw.locked),
        actor: draw.actor,
        createdAt: draw.created_at,
        assignments: (JSON.parse(draw.cards_json) as Array<{ teamId: string; card: string; order: number }>).map((assignment) => ({
          ...assignment,
          teamName: teamMap.get(assignment.teamId)?.name ?? "Unknown team",
          teamAbbreviation: teamMap.get(assignment.teamId)?.abbreviation ?? "—",
        })),
      })),
    })),
    hasPicks: Number(pickCount?.count ?? 0) > 0,
    playerCount: Number(playerCount?.count ?? 0),
  };
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseCsvRows(csv: string) {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field.trim()); field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; field = "";
    } else field += character;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function readImportedPlayers(csv: string): ImportedPlayer[] {
  const rows = parseCsvRows(csv.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("Paste a CSV with a header row and at least one player.");
  const header = rows[0].map((value) => value.trim().toLowerCase());
  const column = (...names: string[]) => header.findIndex((value) => names.includes(value));
  const nameIndex = column("player", "player name", "name");
  const teamIndex = column("team", "nfl team");
  const positionIndex = column("roster position", "position", "pos");
  const adpIndex = column("adp", "average draft position");
  const idIndex = column("player id", "id", "player_id");
  if ([nameIndex, teamIndex, positionIndex, adpIndex].some((index) => index < 0)) {
    throw new Error("CSV needs Player, Team, Roster Position (or Position), and ADP columns.");
  }
  const players = rows.slice(1).map((row, index) => {
    const name = cleanText(row[nameIndex], 100);
    const nameParts = name.split(/\s+/).filter(Boolean);
    const suffix = /^(Jr\.?|Sr\.?|II|III|IV|V)$/i.test(nameParts.at(-1) ?? "") ? nameParts.pop() : "";
    const last = [nameParts.pop(), suffix].filter(Boolean).join(" ");
    const first = nameParts.join(" ");
    const rawPosition = cleanText(row[positionIndex], 20).toUpperCase();
    const position = rawPosition.replace(/[0-9].*$/, "").replace("D/ST", "DST");
    const nflTeam = cleanText(row[teamIndex], 8).toUpperCase();
    const adp = Number(row[adpIndex]);
    const suppliedId = cleanText(idIndex >= 0 ? row[idIndex] : "", 70);
    if (!first || !last || !position || !nflTeam || !Number.isFinite(adp)) {
      throw new Error(`Row ${index + 2} is missing a usable name, team, position, or ADP.`);
    }
    return { id: suppliedId ? `import-${suppliedId}` : `import-${index + 1}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, firstName: first, lastName: last, position, nflTeam, adp };
  });
  if (players.length > 1500) throw new Error("Import up to 1,500 players at a time.");
  if (new Set(players.map((player) => player.id)).size !== players.length) throw new Error("Each imported player needs a unique Player ID.");
  return players;
}

export async function GET() {
  try {
    await ensureDatabase();
    return Response.json(await loadSetup(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load setup." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const body = (await request.json()) as Record<string, unknown>;
    const action = cleanText(body.action, 40);
    const db = getD1();

    if (action === "saveSettings") {
      const leagueName = cleanText(body.leagueName, 80);
      const totalRounds = Number(body.totalRounds);
      const redrawAllowed = Boolean(body.redrawAllowed);
      if (!leagueName || !Number.isInteger(totalRounds) || totalRounds < 20 || totalRounds > 25) {
        return Response.json({ error: "Enter a league name and 20–25 rounds." }, { status: 400 });
      }
      await db.batch([
        db.prepare("UPDATE league_config SET league_name = ?, total_rounds = ?, redraw_allowed = ? WHERE id = 'default'")
          .bind(leagueName, totalRounds, redrawAllowed ? 1 : 0),
        db.prepare("UPDATE draft_state SET total_rounds = ? WHERE status != 'complete'").bind(totalRounds),
        db.prepare("INSERT INTO audit_events (division_id, action, detail, created_at) VALUES ('league', 'settings.updated', ?, ?)")
          .bind(JSON.stringify({ leagueName, totalRounds, redrawAllowed }), new Date().toISOString()),
      ]);
    } else if (action === "saveTeams") {
      const hasPicks = await db.prepare("SELECT 1 AS found FROM draft_picks LIMIT 1").first<{ found: number }>();
      if (hasPicks) return Response.json({ error: "Team assignments are locked after the first pick." }, { status: 409 });
      const incoming = Array.isArray(body.teams) ? body.teams : [];
      const divisions = await db.prepare("SELECT id, name, short_name FROM divisions ORDER BY rowid").all<DivisionRow>();
      const validDivisions = new Set(divisions.results.map((division) => division.id));
      const teams = incoming.map((item, index) => {
        const row = item as Record<string, unknown>;
        const id = cleanText(row.id, 70) || `team-${crypto.randomUUID()}`;
        const divisionId = cleanText(row.divisionId, 40);
        const name = cleanText(row.name, 70);
        const abbreviation = cleanText(row.abbreviation, 5).toUpperCase();
        if (!name || !abbreviation || !validDivisions.has(divisionId)) throw new Error(`Team ${index + 1} needs a name, abbreviation, and division.`);
        return { id, divisionId, name, abbreviation };
      });
      if (new Set(teams.map((team) => team.id)).size !== teams.length) {
        return Response.json({ error: "Each team must have a unique identity." }, { status: 400 });
      }
      const statements = [db.prepare("DELETE FROM teams")];
      for (const division of divisions.results) {
        teams.filter((team) => team.divisionId === division.id).forEach((team, index) => {
          statements.push(db.prepare("INSERT INTO teams (id, division_id, name, abbreviation, draft_order) VALUES (?, ?, ?, ?, ?)")
            .bind(team.id, team.divisionId, team.name, team.abbreviation, index));
        });
      }
      statements.push(db.prepare("DELETE FROM draft_draws"));
      statements.push(db.prepare("UPDATE draft_state SET round = 1, pick_index = 0, status = 'awaiting_draw'"));
      statements.push(db.prepare("INSERT INTO audit_events (division_id, action, detail, created_at) VALUES ('league', 'teams.updated', ?, ?)")
        .bind(JSON.stringify({ teamCount: teams.length }), new Date().toISOString()));
      await db.batch(statements);
    } else if (action === "importPlayers") {
      const hasPicks = await db.prepare("SELECT 1 AS found FROM draft_picks LIMIT 1").first<{ found: number }>();
      if (hasPicks) return Response.json({ error: "The player pool is locked after the first confirmed pick." }, { status: 409 });
      const csv = cleanText(body.csv, 1000000);
      const players = readImportedPlayers(csv);
      const now = new Date().toISOString();
      await db.batch([
        db.prepare("DELETE FROM players"),
        ...players.map((player) => db.prepare("INSERT INTO players (id, first_name, last_name, position, nfl_team, adp) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(player.id, player.firstName, player.lastName, player.position, player.nflTeam, player.adp)),
        db.prepare("INSERT INTO audit_events (division_id, action, detail, created_at) VALUES ('league', 'players.imported', ?, ?)")
          .bind(JSON.stringify({ playerCount: players.length }), now),
      ]);
    } else if (action === "generateDraw") {
      const divisionId = cleanText(body.divisionId, 40);
      const actor = cleanText(body.actor, 60) || "Commissioner";
      const [state, teamsResult, divisionCounts, config] = await Promise.all([
        db.prepare("SELECT division_id, round, pick_index, total_rounds, status FROM draft_state WHERE division_id = ?")
          .bind(divisionId).first<StateRow>(),
        db.prepare("SELECT id, division_id, name, abbreviation, draft_order FROM teams WHERE division_id = ? ORDER BY draft_order")
          .bind(divisionId).all<DraftTeam>(),
        db.prepare("SELECT division_id, COUNT(*) AS count FROM teams GROUP BY division_id ORDER BY division_id").all<{ division_id: string; count: number }>(),
        db.prepare("SELECT league_name, season, total_rounds, rounds_per_draw, redraw_allowed FROM league_config WHERE id = 'default'").first<ConfigRow>(),
      ]);
      if (!state || !config || teamsResult.results.length === 0) return Response.json({ error: "Division draft not found." }, { status: 404 });
      const blockStartRound = drawBlockStart(state.round);
      const blockHasPicks = await db.prepare(`SELECT 1 AS found FROM draft_picks
        WHERE division_id = ? AND round IN (?, ?) LIMIT 1`)
        .bind(divisionId, blockStartRound, blockStartRound + 1).first<{ found: number }>();
      if (blockHasPicks) return Response.json({ error: "This two-round block already has confirmed picks, so its order cannot be changed." }, { status: 409 });
      const counts = divisionCounts.results.map((row) => Number(row.count));
      if (counts.length < 2 || new Set(counts).size !== 1) {
        return Response.json({ error: "Every division must contain the same number of teams before drawing cards." }, { status: 409 });
      }
      const existing = await db.prepare("SELECT id, division_id, block_start_round, order_json, cards_json, locked, actor, created_at FROM draft_draws WHERE division_id = ? AND block_start_round = ?")
        .bind(divisionId, blockStartRound).first<DraftDraw>();
      if (existing?.locked) return Response.json({ error: "This order is already locked." }, { status: 409 });
      if (existing && !config.redraw_allowed) return Response.json({ error: "A draw already exists. Lock it to continue; redraws are disabled." }, { status: 409 });

      const draw = generateCardDraw(teamsResult.results);
      const now = new Date().toISOString();
      await db.batch([
        db.prepare("DELETE FROM draft_draws WHERE division_id = ? AND block_start_round = ?").bind(divisionId, blockStartRound),
        db.prepare(`INSERT INTO draft_draws (division_id, block_start_round, order_json, cards_json, locked, actor, created_at)
          VALUES (?, ?, ?, ?, 0, ?, ?)`)
          .bind(divisionId, blockStartRound, JSON.stringify(draw.order), JSON.stringify(draw.assignments), actor, now),
        db.prepare("INSERT INTO audit_events (division_id, action, detail, created_at) VALUES (?, 'draw.generated', ?, ?)")
          .bind(divisionId, JSON.stringify({ blockStartRound, actor, assignments: draw.assignments }), now),
      ]);
    } else if (action === "lockDraw") {
      const divisionId = cleanText(body.divisionId, 40);
      const state = await db.prepare("SELECT division_id, round, pick_index, total_rounds, status FROM draft_state WHERE division_id = ?")
        .bind(divisionId).first<StateRow>();
      if (!state) return Response.json({ error: "Division draft not found." }, { status: 404 });
      const blockStartRound = drawBlockStart(state.round);
      const draw = await db.prepare("SELECT id, division_id, block_start_round, order_json, cards_json, locked, actor, created_at FROM draft_draws WHERE division_id = ? AND block_start_round = ?")
        .bind(divisionId, blockStartRound).first<DraftDraw>();
      if (!draw) return Response.json({ error: "Generate the card draw before locking it." }, { status: 409 });
      const now = new Date().toISOString();
      await db.batch([
        db.prepare("UPDATE draft_draws SET locked = 1 WHERE id = ?").bind(draw.id),
        db.prepare("UPDATE draft_state SET status = 'live' WHERE division_id = ? AND status != 'complete'").bind(divisionId),
        db.prepare("INSERT INTO audit_events (division_id, action, detail, created_at) VALUES (?, 'draw.locked', ?, ?)")
          .bind(divisionId, JSON.stringify({ blockStartRound, drawId: draw.id }), now),
      ]);
    } else {
      return Response.json({ error: "Unknown commissioner action." }, { status: 400 });
    }

    return Response.json(await loadSetup());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save setup." }, { status: 500 });
  }
}
