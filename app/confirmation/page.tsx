import { Suspense } from "react";
import ConfirmationClient from "./ConfirmationClient";

export const dynamic = "force-dynamic";

export default function ConfirmationPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmationClient />
    </Suspense>
  );
}
