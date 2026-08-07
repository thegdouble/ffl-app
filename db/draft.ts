export type DraftTeam = {
  id: string;
  division_id: string;
  name: string;
  abbreviation: string;
  draft_order: number;
};

export type DrawCard = {
  teamId: string;
  card: string;
  rank: string;
  suit: "spades" | "hearts";
  order: number;
};

export type DraftDraw = {
  id: number;
  division_id: string;
  block_start_round: number;
  order_json: string;
  cards_json: string;
  locked: number;
  actor: string;
  created_at: string;
};

const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function drawBlockStart(round: number) {
  return round % 2 === 0 ? round - 1 : round;
}

export function cardsForTeamCount(teamCount: number) {
  if (teamCount < 1 || teamCount > 26) {
    throw new Error("A division must contain between 1 and 26 teams.");
  }

  const spades = ranks.slice(0, Math.min(teamCount, 13)).map((rank, index) => ({
    card: `${rank}♠`, rank, suit: "spades" as const, order: index,
  }));
  const overflow = Math.max(0, teamCount - 13);
  const hearts = ranks.slice(13 - overflow).map((rank, index) => ({
    card: `${rank}♥`, rank, suit: "hearts" as const, order: 13 + index,
  }));
  return [...spades, ...hearts];
}

export function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const range = index + 1;
    const limit = Math.floor(0x100000000 / range) * range;
    const randomValue = new Uint32Array(1);
    do crypto.getRandomValues(randomValue); while (randomValue[0] >= limit);
    const swapIndex = randomValue[0] % range;
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function generateCardDraw(teams: DraftTeam[]) {
  const shuffledTeams = shuffled(teams);
  const cards = cardsForTeamCount(teams.length);
  const assignments: DrawCard[] = shuffledTeams.map((team, index) => ({
    teamId: team.id,
    ...cards[index],
  }));
  return {
    order: assignments.slice().sort((a, b) => a.order - b.order).map((assignment) => assignment.teamId),
    assignments,
  };
}

export function teamsForRound(teams: DraftTeam[], round: number, draw?: DraftDraw | null) {
  const fallback = [...teams].sort((a, b) => a.draft_order - b.draft_order);
  if (!draw?.locked) return fallback;
  const ids = JSON.parse(draw.order_json) as string[];
  const teamMap = new Map(teams.map((team) => [team.id, team]));
  const ordered = ids.map((id) => teamMap.get(id)).filter((team): team is DraftTeam => Boolean(team));
  if (ordered.length !== teams.length) return fallback;
  return round % 2 === 0 ? ordered.reverse() : ordered;
}
