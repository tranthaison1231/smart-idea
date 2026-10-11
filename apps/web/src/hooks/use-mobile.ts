import * as React from "react"

const mediaQuery = "(max-width: 767px)"

function subscribe(onChange: () => void) {
  const query = window.matchMedia(mediaQuery)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function getSnapshot() {
  return window.matchMedia(mediaQuery).matches
}

function getServerSnapshot() {
  return false
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
