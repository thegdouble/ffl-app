import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const divisions = sqliteTable("divisions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
});

export const leagueConfig = sqliteTable("league_config", {
  id: text("id").primaryKey(),
  leagueName: text("league_name").notNull(),
  season: text("season").notNull(),
  totalRounds: integer("total_rounds").notNull().default(20),
  roundsPerDraw: integer("rounds_per_draw").notNull().default(2),
  redrawAllowed: integer("redraw_allowed", { mode: "boolean" }).notNull().default(false),
});

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  divisionId: text("division_id").notNull(),
  name: text("name").notNull(),
  abbreviation: text("abbreviation").notNull(),
  draftOrder: integer("draft_order").notNull(),
});

export const players = sqliteTable("players", {
  id: text("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  position: text("position").notNull(),
  nflTeam: text("nfl_team").notNull(),
  adp: real("adp").notNull(),
});

export const draftState = sqliteTable("draft_state", {
  divisionId: text("division_id").primaryKey(),
  round: integer("round").notNull().default(1),
  pickIndex: integer("pick_index").notNull().default(0),
  totalRounds: integer("total_rounds").notNull().default(6),
  status: text("status").notNull().default("live"),
});

export const draftPicks = sqliteTable(
  "draft_picks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    divisionId: text("division_id").notNull(),
    teamId: text("team_id").notNull(),
    playerId: text("player_id").notNull(),
    round: integer("round").notNull(),
    pickNumber: integer("pick_number").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("draft_picks_division_player_idx").on(
      table.divisionId,
      table.playerId,
    ),
    uniqueIndex("draft_picks_slot_idx").on(
      table.divisionId,
      table.round,
      table.pickNumber,
    ),
  ],
);

export const draftDraws = sqliteTable(
  "draft_draws",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    divisionId: text("division_id").notNull(),
    blockStartRound: integer("block_start_round").notNull(),
    orderJson: text("order_json").notNull(),
    cardsJson: text("cards_json").notNull(),
    locked: integer("locked", { mode: "boolean" }).notNull().default(false),
    actor: text("actor").notNull().default("Commissioner"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("draft_draws_division_block_idx").on(
      table.divisionId,
      table.blockStartRound,
    ),
  ],
);

export const auditEvents = sqliteTable("audit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  divisionId: text("division_id").notNull(),
  action: text("action").notNull(),
  detail: text("detail").notNull(),
  createdAt: text("created_at").notNull(),
});
