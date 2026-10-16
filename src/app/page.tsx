import { fetchMarineData } from "@/lib/fetchMarineData";
import { fetchTideData } from "@/lib/fetchTideData";
import SurgeDashboard from "@/components/SurgeDashboard";

export default async function Home() {
  const [data, tide] = await Promise.all([fetchMarineData(), fetchTideData()]);
  return <SurgeDashboard data={data} tide={tide} />;
}
