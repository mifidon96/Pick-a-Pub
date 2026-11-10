import { useEffect, useState } from "react";

// Loads data for a page and keeps it in step with what's on screen.
//
// `key` names what is being loaded (e.g. the pub id plus filters). When it
// changes, `load` runs again and any answer still on its way for the old key
// is ignored, so a slow reply can never overwrite a newer one. A null key
// means "not yet" (e.g. waiting for sign-in) and loads nothing. reload() tries
// the same key again (the "Try again" button after an error).
export function useFetch<T>(key: string | null, load: () => Promise<T>) {
  const [state, setState] = useState<{ key: string; data?: T; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (key === null) return;
    let live = true;
    load()
      .then((data) => live && setState({ key, data }))
      .catch((e: Error) => live && setState({ key, error: e.message }));
    return () => {
      live = false;
    };
    // `load` is a new function every render; `key` captures everything it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const current = state !== null && state.key === key ? state : null;
  const reload = () => {
    setState(null);
    setAttempt((a) => a + 1);
  };
  return { data: current?.data, error: current?.error, loading: key !== null && current === null, reload };
}
