import { useEffect, useRef, useState } from "react";

export function useCountUp(value: number, durationMs = 250) {
  const [displayValue, setDisplayValue] = useState<number>(value);
  const previousValue = useRef<number | null>(null);

  useEffect(() => {
    const startValue = previousValue.current ?? value;
    if (startValue === value) {
      setDisplayValue(value);
      previousValue.current = value;
      return;
    }

    const startTime = performance.now();
    let rafId = 0;

    const step = (now: number) => {
      const progress = Math.min((now - startTime) / durationMs, 1);
      const nextValue = startValue + (value - startValue) * progress;
      setDisplayValue(nextValue);
      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        previousValue.current = value;
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [value, durationMs]);

  return displayValue;
}
