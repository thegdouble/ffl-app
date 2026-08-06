import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const divisions = sqliteTable("divisions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
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

export const auditEvents = sqliteTable("audit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  divisionId: text("division_id").notNull(),
  action: text("action").notNull(),
  detail: text("detail").notNull(),
  createdAt: text("created_at").notNull(),
});

