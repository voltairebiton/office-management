const paths = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  building: "M4 21V5l8-3 8 3v16 M2 21h20 M9 21v-5h6v5 M8 7h1 M15 7h1 M8 11h1 M15 11h1",
  people: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  box: "m12 3 9 5-9 5-9-5 9-5z M3 8v9l9 5 9-5V8 M12 13v9 M7.5 5.5l9 5",
  check: "M9 5H5v16h14V5h-4 M9 3h6v4H9z M8 14l3 3 5-6",
  transfer: "M3 7h17 M16 3l4 4-4 4 M21 17H4 M8 13l-4 4 4 4",
  coffee: "M3 8h14v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z M17 8h2a3 3 0 1 1 0 6h-2 M6 2v3 M10 2v3 M14 2v3 M2 23h17",
  visitor: "M4 4h16v18H4z M8 2v4 M16 2v4 M8 18h8 M15 11a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3z",
  arrow: "M5 12h14 M14 7l5 5-5 5",
  search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  chevron: "m9 5 7 7-7 7",
  menu: "M3 6h18 M3 12h18 M3 18h18",
  close: "m6 6 12 12 M18 6 6 18",
  logout: "M9 3H3v18h6 M9 12h12 M16 7l5 5-5 5",
  alert: "m12 3 10 18H2L12 3z M12 9v5 M12 17h.01",
};
export function WorkspaceIcon({ name, size = 20, ...props }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name] ?? paths.box} /></svg>;
}
