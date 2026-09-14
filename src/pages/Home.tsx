import * as React from "react";
import { AnimatePresence } from "framer-motion";
import { LockScreen } from "@/components/phone/LockScreen";
import { HomeScreen } from "@/components/phone/HomeScreen";
import { usePhoneContext } from "@/hooks/usePhoneContext";

export default function Home() {
  const { profile } = usePhoneContext();
  const [locked, setLocked] = React.useState(true);

  return (
    <AnimatePresence mode="wait">
      {locked ? (
        <LockScreen
          key="lock"
          avatar={profile.avatar}
          username={profile.username}
          onUnlock={() => setLocked(false)}
        />
      ) : (
        <HomeScreen key="home" profile={profile} />
      )}
    </AnimatePresence>
  );
}
