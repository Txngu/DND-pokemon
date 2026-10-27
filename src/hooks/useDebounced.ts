import * as React from "react";

/** The value, but only after it has stopped changing for `ms` milliseconds. */
export function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}
