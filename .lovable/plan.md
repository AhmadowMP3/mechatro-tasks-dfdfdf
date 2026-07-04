## Fix: Sidebar highlights both "Reports" and "Report History"

### Root cause
`src/components/layout/Sidebar.tsx:161`:
```ts
const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
```
On `/reports-history`, `pathname.startsWith("/reports")` is `true`, so the `/reports` item also lights up. Same issue would hit any sibling routes sharing a prefix.

### Fix
Change the active check to require an exact match or a `/`-bounded prefix:
```ts
const active =
  to === "/"
    ? pathname === "/"
    : pathname === to || pathname.startsWith(to + "/");
```

Single-line change. No other files touched. Only one item will highlight at a time.
