/**
 * Shared Recharts styling, pinned to the design tokens so charts retheme with
 * the app. Series colours are ordered for maximum separation — the first three
 * also differ in lightness, so they survive greyscale printing and colour-blind
 * viewers.
 */

export const CHART_COLORS = [
  'var(--cj-chart-1)',
  'var(--cj-chart-2)',
  'var(--cj-chart-3)',
  'var(--cj-chart-4)',
  'var(--cj-chart-5)',
  'var(--cj-chart-6)',
]

export const chartGrid = {
  stroke: 'var(--cj-chart-grid)',
  strokeDasharray: '3 3',
  vertical: false,
}

export const chartAxis = {
  tick: { fill: 'var(--cj-chart-axis)', fontSize: 11 },
  axisLine: false,
  tickLine: false,
}

export const chartTooltip = {
  contentStyle: {
    background: 'var(--cj-bg)',
    border: '1px solid var(--cj-border)',
    borderRadius: '12px',
    fontSize: '12px',
    boxShadow: 'var(--cj-shadow-md)',
    color: 'var(--cj-text)',
  },
  labelStyle: { color: 'var(--cj-text-muted)', fontWeight: 500, marginBottom: 2 },
  itemStyle: { color: 'var(--cj-text)' },
  cursor: { fill: 'var(--cj-surface-2)' },
}
