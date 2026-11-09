import { useState } from "react";

// "Use my location": asks the browser where the visitor is.
// Calls onFound with the point; on failure sets an error to show instead.
export function useMyLocation(onFound: (lat: number, lng: number) => void) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");

  function locate(fallbackLabel: string) {
    if (!navigator.geolocation) {
      setError("Your browser does not support location.");
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onFound(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
      },
      () => {
        setError(`Could not get your location. Showing ${fallbackLabel}.`);
        setLocating(false);
      },
      { timeout: 10_000 },
    );
  }

  return { locate, locating, error };
}
