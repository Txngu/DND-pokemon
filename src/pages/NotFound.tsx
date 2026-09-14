import { Link } from "react-router-dom";
import { PhoneFrame } from "@/components/phone/PhoneFrame";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <PhoneFrame>
      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="font-display text-5xl font-bold text-mist/20">404</p>
        <p className="text-sm text-mist/60">This screen wandered off into the tall grass.</p>
        <Button asChild variant="outline">
          <Link to="/">Back to home screen</Link>
        </Button>
      </div>
    </PhoneFrame>
  );
}
