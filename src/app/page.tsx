import { fetchMarineData } from "@/lib/fetchMarineData";
import SurgeDashboard from "@/components/SurgeDashboard";

export default async function Home() {
  const data = await fetchMarineData();
  return <SurgeDashboard data={data} />;
}
