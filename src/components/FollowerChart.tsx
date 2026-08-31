// Plain SVG line chart - dates on X, followers on Y. No chart library.
// markers: dates (e.g. profile changes) drawn as vertical dotted lines for
// before/after comparison.
export default function FollowerChart({
  data,
  markers = [],
}: {
  data: { date: string; followers: number }[];
  markers?: string[];
}) {
  if (data.length === 0) return <p className="muted">No data yet.</p>;

  const W = 860;
  const H = 260;
  const PAD = { top: 16, right: 16, bottom: 28, left: 56 };

  const xs = data.map((d) => Date.parse(d.date));
  const ys = data.map((d) => d.followers);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const ySpan = yMax - yMin || 1;
  const xSpan = xMax - xMin || 1;

  const px = (x: number) =>
    PAD.left + ((x - xMin) / xSpan) * (W - PAD.left - PAD.right);
  const py = (y: number) =>
    H - PAD.bottom - ((y - yMin) / ySpan) * (H - PAD.top - PAD.bottom);

  const points = data
    .map((d) => `${px(Date.parse(d.date)).toFixed(1)},${py(d.followers).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      role="img"
      aria-label="Follower graph"
    >
      <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} stroke="#2a2f3a" />
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} stroke="#2a2f3a" />
      <text x={PAD.left - 8} y={py(yMax) + 4} fill="#8b93a3" fontSize="12" textAnchor="end">
        {yMax.toLocaleString()}
      </text>
      <text x={PAD.left - 8} y={py(yMin) + 4} fill="#8b93a3" fontSize="12" textAnchor="end">
        {yMin.toLocaleString()}
      </text>
      <text x={PAD.left} y={H - 8} fill="#8b93a3" fontSize="12">
        {data[0].date}
      </text>
      <text x={W - PAD.right} y={H - 8} fill="#8b93a3" fontSize="12" textAnchor="end">
        {data[data.length - 1].date}
      </text>
      {markers
        .map((d) => Date.parse(d))
        .filter((t) => Number.isFinite(t) && t >= xMin && t <= xMax)
        .map((t, i) => (
          <line
            key={i}
            x1={px(t)}
            y1={PAD.top}
            x2={px(t)}
            y2={H - PAD.bottom}
            stroke="#d29922"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            opacity="0.8"
          />
        ))}
      {data.length === 1 ? (
        <circle cx={px(xs[0])} cy={py(ys[0])} r="4" fill="#4da3ff" />
      ) : (
        <polyline points={points} fill="none" stroke="#4da3ff" strokeWidth="2" />
      )}
    </svg>
  );
}
