"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HRReviewQueueRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/hr-dashboard/review-queue");
  }, [router]);

  return null;
}
