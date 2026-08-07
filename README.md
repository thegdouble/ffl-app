# NFL Poker and Liquor Draft Room

A private fantasy-football draft-night application for two independent divisions: Liquor in the Front and Poker in the Rear.

## Current capabilities

- Independent card-draw order for every two-round draft block
- Live operator room and public draft board
- Commissioner setup for teams, rounds, player-pool CSV import, and card draws
- Skip, makeup-pick, undo, pause, and takeover controls with an audit trail
- Division-specific player availability and ADP search

## Development

```bash
npm install
npm run dev
npm run lint
npm test
```

The app uses Cloudflare D1 for durable draft data. Generate and inspect a Drizzle migration after schema changes:

```bash
npm run db:generate
```

See `../docs/HANDOFF.md` for the working product decisions and next development slice.
