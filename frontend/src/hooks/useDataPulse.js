import { useEffect, useRef, useState } from "react";

export function useDataPulse(dataUpdatedAt, isFetching) {
  const [pulse, setPulse] = useState(false);
  const prevUpdatedAt = useRef(0);

  useEffect(() => {
    if (!dataUpdatedAt) return;

    if (prevUpdatedAt.current && dataUpdatedAt > prevUpdatedAt.current && !isFetching) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 500);
      prevUpdatedAt.current = dataUpdatedAt;
      return () => clearTimeout(timer);
    }

    prevUpdatedAt.current = dataUpdatedAt;
  }, [dataUpdatedAt, isFetching]);

  return pulse;
}

export default useDataPulse;
