import React, { useEffect, useState } from 'react';

export const CountUp: React.FC<{ value: number; decimals?: number; durationMs?: number }> = ({
  value,
  decimals = 0,
  durationMs = 900,
}) => {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let frame = 0;
    const totalFrames = Math.max(1, Math.round(durationMs / 24));
    setDisplay(0);
    const timer = window.setInterval(() => {
      frame += 1;
      const progress = Math.min(1, frame / totalFrames);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(value * eased);
      if (frame >= totalFrames) window.clearInterval(timer);
    }, 24);
    return () => window.clearInterval(timer);
  }, [value, durationMs]);
  return <>{display.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</>;
};

export default CountUp;
