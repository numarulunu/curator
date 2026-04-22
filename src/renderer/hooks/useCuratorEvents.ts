import { useEffect, useState } from "react";

export interface CuratorEvent {
  kind: string;
  [key: string]: unknown;
}

export function useCuratorEvents(): CuratorEvent | null {
  const [event, setEvent] = useState<CuratorEvent | null>(null);

  useEffect(() => {
    const off = window.curator.onEvent((next) => setEvent(next as CuratorEvent));
    return () => {
      off();
    };
  }, []);

  return event;
}
