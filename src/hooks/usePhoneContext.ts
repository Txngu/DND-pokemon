import { useOutletContext } from "react-router-dom";
import type { Profile } from "@/types/database.types";

export function usePhoneContext() {
  return useOutletContext<{ profile: Profile }>();
}
