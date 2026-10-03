import { GameDetail } from "@/components/game-detail";

export default async function GamePage({ params }: { params: Promise<{ sport: string; id: string }> }) {
  const { sport, id } = await params;
  return <GameDetail sport={sport} id={id} />;
}
