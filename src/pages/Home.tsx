import { HomeScreen } from "@/components/phone/HomeScreen";
import { usePhoneContext } from "@/hooks/usePhoneContext";

export default function Home() {
  const { profile } = usePhoneContext();
  return <HomeScreen profile={profile} />;
}
