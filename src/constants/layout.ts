// ── Responsive layout tokens ─────────────────────────────────────────────────
// Central breakpoints + width caps used across the app. Keep magic numbers here,
// not sprinkled inline. Consumed by useResponsive() and the responsive layout
// components (ResponsiveContainer / ResponsiveSheet).

export const Breakpoints = {
  // width < tablet  → phone
  // tablet ≤ width < desktop → tablet / small laptop
  // width ≥ desktop → desktop
  tablet:  768,
  desktop: 1024,
  wide:    1440,
} as const;

// Max content width for the centered app shell on large screens. Content never
// stretches past this — it centers with comfortable gutters instead.
export const ContentMaxWidth = 1120;

// Reading-width cap for narrow single-column screens (dashboards, forms) so text
// and cards don't run too wide even inside the shell.
export const NarrowMaxWidth = 720;

// Dialog width caps for modals that become centered dialogs on desktop.
export const DialogWidth = {
  sm: 420,   // simple confirm / small forms
  md: 520,   // standard forms (add client, add staff)
  lg: 680,   // richer sheets (progress detail, upload with lists)
} as const;
