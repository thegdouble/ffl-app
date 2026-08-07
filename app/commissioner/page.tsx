import type { Metadata } from "next";
import { CommissionerSetup } from "./setup";

export const metadata: Metadata = {
  title: "Commissioner Setup | NFL Poker and Liquor",
  description: "Configure teams, draft length, and playing-card draft order.",
};

export default function CommissionerPage() {
  return <CommissionerSetup />;
}
