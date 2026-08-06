import type { Metadata } from "next";
import { DraftRoom } from "./draft-room";

export const metadata: Metadata = {
  title: "Draft Room | NFL Poker and Liquor",
  description: "Live divisional draft prototype for NFL Poker and Liquor.",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; division?: string }>;
}) {
  const params = await searchParams;
  return (
    <DraftRoom
      initialView={params.view === "board" ? "board" : "operator"}
      initialDivision={params.division === "rear" ? "rear" : "front"}
    />
  );
}
