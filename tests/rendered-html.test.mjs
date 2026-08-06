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
