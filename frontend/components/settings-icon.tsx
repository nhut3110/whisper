const paths = {
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  once: 'M2 12s3-6 10-6 10 6 10 6-3 6-10 6S2 12 2 12Zm10-3v6m-2-4 2-2',
  shield: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Zm-3 9 2 2 4-4',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5V10Zm7 4v3',
  type: 'M4 5h16M12 5v15M8 20h8',
} as const
export function SettingsIcon({kind}: {kind: keyof typeof paths}) {
  return <svg className="setting-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={paths[kind]} /></svg>
}
