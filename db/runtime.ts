import { env } from "cloudflare:workers";

type SeedTeam = [id: string, divisionId: string, name: string, abbreviation: string, order: number];
type SeedPlayer = [id: string, firstName: string, lastName: string, position: string, nflTeam: string, adp: number];

const seedTeams: SeedTeam[] = [
  ["front-law", "front", "The Law", "LAW", 0],
  ["front-sevens", "front", "All 7s", "A7S", 1],
  ["front-walkers", "front", "Day Walkers", "DAY", 2],
  ["front-dragon", "front", "Dragon Slayer", "DSL", 3],
  ["front-fortune", "front", "Fortune", "FOR", 4],
  ["front-who", "front", "Who Dey", "WHO", 5],
  ["rear-blitz", "rear", "The Blitz", "BLZ", 0],
  ["rear-salon", "rear", "Nail Salon", "NAI", 1],
  ["rear-taz", "rear", "Tazmaniacs", "TAZ", 2],
  ["rear-ivan", "rear", "Ivan the Terrible", "IVA", 3],
  ["rear-bluebird", "rear", "BlueBird Busriders", "BLU", 4],
  ["rear-jass", "rear", "Hugh Jassman", "HUG", 5],
];

const seedPlayers: SeedPlayer[] = [
  ["p01", "Mason", "Reed", "QB", "ATL", 9.2],
  ["p02", "Darius", "Cole", "RB", "BUF", 12.4],
  ["p03", "Malik", "Bennett", "WR", "CHI", 15.8],
  ["p04", "Theo", "Marshall", "TE", "DAL", 27.1],
  ["p05", "Andre", "Holloway", "DL", "DEN", 31.7],
  ["p06", "Caleb", "Grant", "LB", "GB", 34.5],
  ["p07", "Jalen", "Price", "DB", "HOU", 39.8],
  ["p08", "Evan", "Brooks", "K", "KC", 44.3],
  ["p09", "Nico", "Hayes", "RB", "LAR", 18.6],
  ["p10", "Roman", "Ellis", "WR", "MIA", 22.9],
  ["p11", "Isaiah", "Stone", "QB", "MIN", 24.2],
  ["p12", "Miles", "Foster", "LB", "NO", 42.1],
  ["p13", "Ty", "Warren", "WR", "NYJ", 47.4],
  ["p14", "Owen", "Banks", "DL", "PHI", 50.6],
  ["p15", "Cameron", "West", "DB", "SEA", 54.3],
  ["p16", "Jordan", "Knox", "TE", "SF", 56.8],
  ["p17", "Devin", "Cross", "RB", "TB", 61.2],
  ["p18", "Luca", "Morris", "K", "WAS", 68.9],
];

let initialization: Promise<void> | null = null;

export function getD1() {
  if (!env.DB) {
    throw new Error("The draft database is unavailable.");
  }
  return env.DB;
}

export async function ensureDatabase() {
  if (initialization) return initialization;

  initialization = (async () => {
    const db = getD1();
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS divisions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        short_name TEXT NOT NULL
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS league_config (
        id TEXT PRIMARY KEY,
        league_name TEXT NOT NULL,
        season TEXT NOT NULL,
        total_rounds INTEGER NOT NULL DEFAULT 20,
        rounds_per_draw INTEGER NOT NULL DEFAULT 2,
        redraw_allowed INTEGER NOT NULL DEFAULT 0
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        division_id TEXT NOT NULL,
        name TEXT NOT NULL,
        abbreviation TEXT NOT NULL,
        draft_order INTEGER NOT NULL
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        position TEXT NOT NULL,
        nfl_team TEXT NOT NULL,
        adp REAL NOT NULL
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS draft_state (
        division_id TEXT PRIMARY KEY,
        round INTEGER NOT NULL DEFAULT 1,
        pick_index INTEGER NOT NULL DEFAULT 0,
        total_rounds INTEGER NOT NULL DEFAULT 6,
        status TEXT NOT NULL DEFAULT 'live'
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS draft_picks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        division_id TEXT NOT NULL,
        team_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        round INTEGER NOT NULL,
        pick_number INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )`),
      db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS draft_picks_division_player_idx
        ON draft_picks (division_id, player_id)`),
      db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS draft_picks_slot_idx
        ON draft_picks (division_id, round, pick_number)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS draft_draws (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        division_id TEXT NOT NULL,
        block_start_round INTEGER NOT NULL,
        order_json TEXT NOT NULL,
        cards_json TEXT NOT NULL,
        locked INTEGER NOT NULL DEFAULT 0,
        actor TEXT NOT NULL DEFAULT 'Commissioner',
        created_at TEXT NOT NULL
      )`),
      db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS draft_draws_division_block_idx
        ON draft_draws (division_id, block_start_round)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS draft_skips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        division_id TEXT NOT NULL,
        team_id TEXT NOT NULL,
        round INTEGER NOT NULL,
        pick_number INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        filled_pick_id INTEGER,
        created_at TEXT NOT NULL,
        resolved_at TEXT
      )`),
      db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS draft_skips_slot_idx
        ON draft_skips (division_id, round, pick_number)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS draft_operators (
        division_id TEXT PRIMARY KEY,
        operator_name TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        division_id TEXT NOT NULL,
        action TEXT NOT NULL,
        detail TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`),
    ]);

    await db.batch([
      db.prepare("INSERT OR IGNORE INTO league_config (id, league_name, season, total_rounds, rounds_per_draw, redraw_allowed) VALUES ('default', 'NFL Poker and Liquor', '2026 Prototype', 20, 2, 0)"),
      db.prepare("INSERT OR IGNORE INTO divisions (id, name, short_name) VALUES (?, ?, ?)")
        .bind("front", "Liquor in the Front", "LIQUOR"),
      db.prepare("INSERT OR IGNORE INTO divisions (id, name, short_name) VALUES (?, ?, ?)")
        .bind("rear", "Poker in the Rear", "POKER"),
      ...seedTeams.map((team) =>
        db.prepare("INSERT OR IGNORE INTO teams (id, division_id, name, abbreviation, draft_order) VALUES (?, ?, ?, ?, ?)")
          .bind(...team),
      ),
      ...seedPlayers.map((player) =>
        db.prepare("INSERT OR IGNORE INTO players (id, first_name, last_name, position, nfl_team, adp) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(...player),
      ),
      db.prepare("INSERT OR IGNORE INTO draft_state (division_id, round, pick_index, total_rounds, status) VALUES (?, 1, 0, 20, 'awaiting_draw')")
        .bind("front"),
      db.prepare("INSERT OR IGNORE INTO draft_state (division_id, round, pick_index, total_rounds, status) VALUES (?, 1, 0, 20, 'awaiting_draw')")
        .bind("rear"),
      db.prepare(`UPDATE draft_state SET total_rounds = 20, status = 'awaiting_draw'
        WHERE round = 1 AND pick_index = 0 AND NOT EXISTS (
          SELECT 1 FROM draft_picks WHERE draft_picks.division_id = draft_state.division_id
        )`),
    ]);
  })().catch((error) => {
    initialization = null;
    throw error;
  });

  return initialization;
}
