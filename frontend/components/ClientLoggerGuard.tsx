"use client";

import { useEffect } from "react";

export default function ClientLoggerGuard() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      console.log = () => {};
    }
  }, []);

  return null;
}
