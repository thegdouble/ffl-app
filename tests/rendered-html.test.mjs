import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("defines the branded draft-room entry point", async () => {
  const [page, draftRoom] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/draft-room.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Draft Room \| NFL Poker and Liquor/);
  assert.match(page, /initialView/);
  assert.match(page, /initialDivision/);
  assert.match(draftRoom, /Opening the draft room/);
  assert.match(draftRoom, /NPL/);
  assert.doesNotMatch(draftRoom, /Your site is taking shape/);
});

test("includes the draft workflow and social card", async () => {
  const [draftRoom, css, page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/draft-room.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(draftRoom, /Confirm pick/);
  assert.match(draftRoom, /Draft board/);
  assert.match(draftRoom, /ADP: low to high/);
  assert.match(draftRoom, /setInterval\(\(\) => void load\(true\), 900\)/);
  assert.match(page, /<DraftRoom/);
  assert.match(layout, /\/og\.png/);
  assert.match(layout, /x-forwarded-host/);
  assert.match(css, /\.board-mode/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await access(new URL("../public/og.png", import.meta.url));
});

test("includes configurable league setup and audited two-round card draws", async () => {
  const [setup, commissionerApi, draftEngine, draftApi, migration] = await Promise.all([
    readFile(new URL("../app/commissioner/setup.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/commissioner/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/draft.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/draft/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_youthful_doctor_spectrum.sql", import.meta.url), "utf8"),
  ]);

  assert.match(setup, /Draft rounds/);
  assert.match(setup, /min="20" max="25"/);
  assert.match(setup, /Division for/);
  assert.match(setup, /Deal cards/);
  assert.match(setup, /Lock order/);
  assert.match(commissionerApi, /new Set\(counts\)\.size !== 1/);
  assert.match(commissionerApi, /draw\.generated/);
  assert.match(commissionerApi, /draw\.locked/);
  assert.match(draftEngine, /crypto\.getRandomValues/);
  assert.match(draftEngine, /13 - overflow/);
  assert.match(draftApi, /awaiting_draw/);
  assert.match(draftApi, /teamsForRound/);
  assert.match(migration, /CREATE TABLE `draft_draws`/);
  assert.match(migration, /CREATE TABLE `league_config`/);
});

test("includes draft recovery controls with persistent skips and an audit trail", async () => {
  const [draftRoom, draftApi, schema, migration] = await Promise.all([
    readFile(new URL("../app/draft-room.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/draft/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0002_striped_guardian.sql", import.meta.url), "utf8"),
  ]);

  assert.match(draftRoom, /Skip current pick/);
  assert.match(draftRoom, /Outstanding makeup picks/);
  assert.match(draftRoom, /Take over/);
  assert.match(draftApi, /makeup\.confirmed/);
  assert.match(draftApi, /pick\.skipped/);
  assert.match(draftApi, /operator\.taken_over/);
  assert.match(schema, /draftSkips/);
  assert.match(schema, /draftOperators/);
  assert.match(migration, /CREATE TABLE `draft_skips`/);
  assert.match(migration, /CREATE TABLE `draft_operators`/);
});
