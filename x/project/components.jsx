// Shared components: icons, charts, badges, cards
// ───────────────────────────────────────────────

const { useState, useMemo, useEffect, useRef } = React;

// ── Icons ──────────────────────────────────────
function Icon({ name, size = 18, stroke = 1.6, ...rest }) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    ...rest,
  };
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>,
    list: <><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></>,
    pie: <><path d="M12 3a9 9 0 1 0 9 9h-9V3z"/><path d="M12 3v9h9a9 9 0 0 0-9-9z"/></>,
    chart: <><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></>,
    debt: <><circle cx="12" cy="12" r="9"/><path d="M9 12h6"/><path d="M12 9v6"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>,
    plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></>,
    bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></>,
    arrowUp: <><path d="M7 17 17 7"/><path d="M7 7h10v10"/></>,
    arrowDown: <><path d="M17 7 7 17"/><path d="M17 17H7V7"/></>,
    arrowRight: <><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></>,
    trendingUp: <><path d="m3 17 6-6 4 4 8-8"/><path d="M17 7h4v4"/></>,
    trendingDown: <><path d="m3 7 6 6 4-4 8 8"/><path d="M17 17h4v-4"/></>,
    arrowLeft: <><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></>,
    chevronDown: <path d="m6 9 6 6 6-6"/>,
    chevronLeft: <path d="m15 18-6-6 6-6"/>,
    chevronRight: <path d="m9 18 6-6-6-6"/>,
    filter: <path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3z"/>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></>,
    eyeOff: <><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="m2 2 20 20"/></>,
    wallet: <><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2"/><path d="M3 7h18a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3"/><circle cx="17" cy="12" r="1.2"/></>,
    card: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/><path d="M8 2v4"/><path d="M16 2v4"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    zap: <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/>,
    pause: <><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></>,
    play: <path d="M6 4l14 8-14 8V4z"/>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></>,
    trash: <><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></>,
    note: <><path d="M4 4h16v12l-5 5H4z"/><path d="M14 21v-5h6"/><path d="M8 9h8"/><path d="M8 13h5"/></>,
    pin: <><path d="M12 17v5"/><path d="M9 10.76V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6.76l2 3.24H7l2-3.24z"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/></>,
    alertTriangle: <><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4"/><path d="M12 17h.01"/></>,
    building: <><rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 8h.01"/><path d="M15 8h.01"/><path d="M9 12h.01"/><path d="M15 12h.01"/><path d="M10 21v-4h4v4"/></>,
    scale: <><path d="M12 3v18"/><path d="M5 7h14"/><path d="m5 7-2.5 6h5L5 7z"/><path d="m19 7-2.5 6h5L19 7z"/><path d="M8 21h8"/></>,
    flow: <><path d="M4 6h10"/><path d="m11 3 3 3-3 3"/><path d="M20 18H10"/><path d="m13 21-3-3 3-3"/></>,
    camera: <><path d="M5 7h3l1.5-2h5L16 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></>,
    sparkles: <><path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/><path d="m5.6 5.6 2.8 2.8"/><path d="m15.6 15.6 2.8 2.8"/><path d="m5.6 18.4 2.8-2.8"/><path d="m15.6 8.4 2.8-2.8"/></>,
    moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m4.93 19.07 1.41-1.41"/><path d="m17.66 6.34 1.41-1.41"/></>,
    repeat: <><path d="m17 1 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="m7 23-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></>,
    check: <path d="M5 12l5 5L20 7"/>,
    x: <><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>,
    more: <><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></>,
  };
  return <svg {...props}>{paths[name] || paths.more}</svg>;
}

// ── Money formatting ───────────────────────────
function Money({ value, sign = "auto", className = "", currency = "₺", hide = false, size = "md" }) {
  const v = Number(value || 0);
  const isNeg = v < 0;
  const isPos = v > 0;
  const showSign = sign === "always" || sign === "auto";
  const cls = ["mny", `mny-${size}`];
  if (sign !== "neutral") {
    if (isNeg) cls.push("mny-neg");
    else if (isPos && sign === "always") cls.push("mny-pos");
  }
  if (className) cls.push(className);
  const formatted = APP_DATA.fmt(Math.abs(v));
  const prefix = isNeg ? "−" : isPos && sign === "always" ? "+" : "";
  return (
    <span className={cls.join(" ")}>
      {hide ? "••••" : <>{prefix}{currency}{formatted}</>}
    </span>
  );
}

// ── Pill / Tag ─────────────────────────────────
function CategoryPill({ catId, size = "sm" }) {
  const c = APP_DATA.categories.find((x) => x.id === catId);
  if (!c) return null;
  return (
    <span className={`cat-pill cat-pill-${size}`}>
      <span className="cat-dot" style={{ background: c.color }} />
      {c.label}
    </span>
  );
}

// ── Section card ───────────────────────────────
function Card({ title, subtitle, action, children, padded = true, className = "" }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-h">
          <div>
            {title && <h3 className="card-t">{title}</h3>}
            {subtitle && <p className="card-st">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={padded ? "card-b" : "card-b card-b-flush"}>{children}</div>
    </section>
  );
}

// ── Sparkline ──────────────────────────────────
function Sparkline({ values, color = "currentColor", height = 32, fill = true }) {
  const w = 100;
  const h = height;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return [x, y];
  });
  const path = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  const area = `${path} L${w},${h} L0,${h} Z`;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height, width: "100%" }}>
      {fill && <path d={area} fill={color} opacity="0.12" />}
      <path d={path} stroke={color} strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ── Chart tooltip helpers ──────────────────────
function ChartTooltip({ x, y, containerWidth, children }) {
  // Smart positioning to avoid overflow
  const tipWidth = 180;
  const isRight = x + tipWidth + 16 > containerWidth;
  return (
    <div
      className="chart-tip"
      style={{
        left: isRight ? "auto" : x + 12,
        right: isRight ? containerWidth - x + 12 : "auto",
        top: y,
      }}
    >
      {children}
    </div>
  );
}

function useChartHover(count, padL = 8, padR = 2, w = 100) {
  const [hover, setHover] = useState(null); // { idx, mouseX, mouseY }
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const innerLeft = (padL / w) * rect.width;
    const innerRight = ((w - padR) / w) * rect.width;
    const ratio = Math.max(0, Math.min(1, (x - innerLeft) / (innerRight - innerLeft)));
    const idx = Math.round(ratio * (count - 1));
    setHover({ idx, mouseX: x, mouseY: e.clientY - rect.top, containerWidth: rect.width });
  };
  const onLeave = () => setHover(null);
  return { hover, onMove, onLeave };
}

// ── Area/Line chart with grid + hover ──────────
function AreaChart({ series, height = 240, showGrid = true, showAxis = true, formatY, formatTooltipValue }) {
  // series = [{ label, values: [n], color }]
  const w = 100;
  const h = 100;
  const labels = series[0]?.labels || [];
  const all = series.flatMap((s) => s.values);
  const min = Math.min(0, ...all);
  const max = Math.max(...all);
  const range = max - min || 1;
  const padL = 8, padR = 2, padT = 4, padB = 10;

  const xAt = (i) => padL + (i / Math.max(1, labels.length - 1)) * (w - padL - padR);
  const yAt = (v) => padT + (1 - (v - min) / range) * (h - padT - padB);

  const gridLines = 4;
  const grid = Array.from({ length: gridLines + 1 }, (_, i) => {
    const v = min + (range * (gridLines - i)) / gridLines;
    return { y: padT + (i / gridLines) * (h - padT - padB), v };
  });

  const { hover, onMove, onLeave } = useChartHover(labels.length, padL, padR, w);

  return (
    <div className="chart-wrap" style={{ height }} onMouseMove={onMove} onMouseLeave={onLeave}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="chart-svg">
        {showGrid && grid.map((g, i) => (
          <line key={i} x1={padL} y1={g.y} x2={w - padR} y2={g.y} stroke="var(--border)" strokeWidth="0.15" vectorEffect="non-scaling-stroke" />
        ))}
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" L");
          const path = `M${pts}`;
          const area = `${path} L${xAt(s.values.length - 1)},${yAt(min)} L${xAt(0)},${yAt(min)} Z`;
          return (
            <g key={si}>
              {s.fill !== false && <path d={area} fill={s.color} opacity="0.12" />}
              <path d={path} stroke={s.color} strokeWidth="1.2" fill="none" vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
        {hover && (
          <g className="hover-layer">
            <line x1={xAt(hover.idx)} y1={padT} x2={xAt(hover.idx)} y2={h - padB} stroke="var(--fg-3)" strokeWidth="0.3" vectorEffect="non-scaling-stroke" strokeDasharray="1 1"/>
            {series.map((s, si) => (
              <circle key={si} cx={xAt(hover.idx)} cy={yAt(s.values[hover.idx])} r="0.9" fill={s.color} stroke="var(--bg-card)" strokeWidth="0.4" vectorEffect="non-scaling-stroke"/>
            ))}
          </g>
        )}
      </svg>
      {showAxis && (
        <>
          <div className="chart-y-axis">
            {grid.map((g, i) => (
              <div key={i} className="chart-y-tick" style={{ top: `${(g.y / h) * 100}%` }}>
                {formatY ? formatY(g.v) : APP_DATA.fmtShort(g.v)}
              </div>
            ))}
          </div>
          <div className="chart-x-axis">
            {labels.map((l, i) => (
              <div key={i} className="chart-x-tick">{l}</div>
            ))}
          </div>
        </>
      )}
      {hover && labels[hover.idx] !== undefined && (
        <ChartTooltip x={hover.mouseX} y={hover.mouseY - 20} containerWidth={hover.containerWidth}>
          <div className="chart-tip-h">{labels[hover.idx]}</div>
          {series.map((s, si) => (
            <div key={si} className="chart-tip-row">
              <span className="chart-tip-dot" style={{background: s.color}}/>
              <span className="chart-tip-l">{s.name || "Değer"}</span>
              <span className="chart-tip-v mono">{formatTooltipValue ? formatTooltipValue(s.values[hover.idx]) : "₺" + APP_DATA.fmt(s.values[hover.idx])}</span>
            </div>
          ))}
        </ChartTooltip>
      )}
    </div>
  );
}

// ── Bar chart (grouped) + hover ────────────────
function BarChart({ data, height = 240, formatY, formatTooltipValue, seriesLabels }) {
  // data = [{ label, values: [n,n], colors: [c,c] }]
  const w = 100, h = 100;
  const padL = 8, padR = 2, padT = 4, padB = 10;
  const all = data.flatMap((d) => d.values);
  const max = Math.max(...all);
  const min = Math.min(0, ...all);
  const range = max - min || 1;
  const yAt = (v) => padT + (1 - (v - min) / range) * (h - padT - padB);
  const groupW = (w - padL - padR) / data.length;
  const barCount = data[0]?.values.length || 1;
  const innerW = groupW * 0.7;
  const barW = innerW / barCount;
  const gridLines = 4;
  const grid = Array.from({ length: gridLines + 1 }, (_, i) => ({
    y: padT + (i / gridLines) * (h - padT - padB),
    v: min + (range * (gridLines - i)) / gridLines,
  }));
  const zero = yAt(0);

  const [hoverGroup, setHoverGroup] = useState(null);
  const containerRef = useRef(null);

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const innerLeft = (padL / w) * rect.width;
    const innerRight = ((w - padR) / w) * rect.width;
    const ratio = Math.max(0, Math.min(0.9999, (x - innerLeft) / (innerRight - innerLeft)));
    const idx = Math.floor(ratio * data.length);
    setHoverGroup({ idx, mouseX: x, mouseY: e.clientY - rect.top, containerWidth: rect.width });
  };

  return (
    <div ref={containerRef} className="chart-wrap" style={{ height }} onMouseMove={onMove} onMouseLeave={()=>setHoverGroup(null)}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="chart-svg">
        {grid.map((g, i) => (
          <line key={i} x1={padL} y1={g.y} x2={w - padR} y2={g.y} stroke="var(--border)" strokeWidth="0.15" vectorEffect="non-scaling-stroke" />
        ))}
        {data.map((d, i) => {
          const gx = padL + i * groupW + (groupW - innerW) / 2;
          const isHover = hoverGroup?.idx === i;
          return (
            <g key={i} opacity={hoverGroup && !isHover ? 0.5 : 1}>
              {isHover && <rect x={padL + i * groupW + 0.2} y={padT} width={groupW - 0.4} height={h - padT - padB} fill="var(--fg)" opacity="0.05" rx="0.4"/>}
              {d.values.map((v, j) => {
                const x = gx + j * barW;
                const y = v >= 0 ? yAt(v) : zero;
                const bh = Math.abs(yAt(v) - zero);
                return (
                  <rect key={j} x={x + 0.2} y={y} width={barW - 0.4} height={bh} fill={d.colors[j]} rx="0.4" />
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="chart-y-axis">
        {grid.map((g, i) => (
          <div key={i} className="chart-y-tick" style={{ top: `${(g.y / h) * 100}%` }}>
            {formatY ? formatY(g.v) : APP_DATA.fmtShort(g.v)}
          </div>
        ))}
      </div>
      <div className="chart-x-axis">
        {data.map((d, i) => (
          <div key={i} className="chart-x-tick">{d.label}</div>
        ))}
      </div>
      {hoverGroup && data[hoverGroup.idx] && (
        <ChartTooltip x={hoverGroup.mouseX} y={hoverGroup.mouseY - 20} containerWidth={hoverGroup.containerWidth}>
          <div className="chart-tip-h">{data[hoverGroup.idx].label}</div>
          {data[hoverGroup.idx].values.map((v, j) => (
            <div key={j} className="chart-tip-row">
              <span className="chart-tip-dot" style={{background: data[hoverGroup.idx].colors[j]}}/>
              <span className="chart-tip-l">{seriesLabels?.[j] || `Değer ${j+1}`}</span>
              <span className="chart-tip-v mono">{formatTooltipValue ? formatTooltipValue(v) : "₺" + APP_DATA.fmt(v)}</span>
            </div>
          ))}
        </ChartTooltip>
      )}
    </div>
  );
}

// ── Donut chart + hover ────────────────────────
function Donut({ segments, size = 180, thickness = 22, center, formatTooltipValue }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - thickness / 2 - 2;
  const c = size / 2;
  const C = 2 * Math.PI * r;
  const [hoverIdx, setHoverIdx] = useState(null);
  let offset = 0;
  const segs = segments.map((s, i) => {
    const len = (s.value / total) * C;
    const seg = { ...s, len, offset, i };
    offset += len;
    return seg;
  });
  return (
    <div className="donut-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="donut">
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--bg-elev-2)" strokeWidth={thickness} />
        {segs.map((s) => {
          const dash = `${s.len} ${C - s.len}`;
          const isHover = hoverIdx === s.i;
          const sw = isHover ? thickness + 4 : thickness;
          return (
            <circle
              key={s.i}
              cx={c} cy={c} r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={sw}
              strokeDasharray={dash}
              strokeDashoffset={-s.offset}
              transform={`rotate(-90 ${c} ${c})`}
              strokeLinecap="butt"
              opacity={hoverIdx !== null && !isHover ? 0.4 : 1}
              onMouseEnter={() => setHoverIdx(s.i)}
              onMouseLeave={() => setHoverIdx(null)}
              style={{ cursor: "pointer", transition: "stroke-width 0.12s ease, opacity 0.12s ease" }}
            />
          );
        })}
      </svg>
      {center && hoverIdx === null && <div className="donut-center">{center}</div>}
      {hoverIdx !== null && (
        <div className="donut-center donut-center-hover">
          <div className="donut-center-inner">
            <div className="donut-c-label" style={{color: segments[hoverIdx].color}}>{segments[hoverIdx].label}</div>
            <div className="donut-c-val">{formatTooltipValue ? formatTooltipValue(segments[hoverIdx].value) : "₺" + APP_DATA.fmtShort(segments[hoverIdx].value)}</div>
            <div className="donut-c-pct">%{((segments[hoverIdx].value / total) * 100).toFixed(1)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Progress bar ───────────────────────────────
function Progress({ value, max, color = "var(--accent)", trackColor = "var(--bg-elev-2)", height = 6 }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="prog" style={{ height, background: trackColor }}>
      <div className="prog-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

// ── Button ─────────────────────────────────────
function Button({ children, variant = "ghost", size = "md", icon, onClick, type = "button", disabled }) {
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`btn btn-${variant} btn-${size}`}>
      {icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />}
      {children}
    </button>
  );
}

// ── Stacked area chart + hover ─────────────────
function StackedAreaChart({ series, labels, height = 240, formatY, formatTooltipValue }) {
  // series = [{ label, color, values: [n,...] }]
  const w = 100, h = 100;
  const padL = 8, padR = 2, padT = 4, padB = 10;
  const n = labels.length;

  // Compute cumulative stacks
  const stacks = []; // per index, array of [start, end]
  for (let i = 0; i < n; i++) {
    let acc = 0;
    const col = [];
    for (const s of series) {
      const v = s.values[i] || 0;
      col.push([acc, acc + v]);
      acc += v;
    }
    stacks.push(col);
  }
  const totals = stacks.map(c => c[c.length-1][1]);
  const max = Math.max(...totals) || 1;

  const xAt = (i) => padL + (n === 1 ? 0 : i / (n - 1)) * (w - padL - padR);
  const yAt = (v) => padT + (1 - v / max) * (h - padT - padB);

  const paths = series.map((s, si) => {
    const top = stacks.map((c, i) => `${xAt(i)},${yAt(c[si][1])}`).join(" L");
    const bottom = stacks.map((c, i) => `${xAt(i)},${yAt(c[si][0])}`).reverse().join(" L");
    return { color: s.color, label: s.label, d: `M${top} L${bottom} Z` };
  });

  const grid = [0, 0.25, 0.5, 0.75, 1].map(p => ({
    y: padT + p * (h - padT - padB),
    v: max * (1 - p),
  }));

  const { hover, onMove, onLeave } = useChartHover(n, padL, padR, w);

  return (
    <div className="chart-wrap" style={{ height }} onMouseMove={onMove} onMouseLeave={onLeave}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="chart-svg">
        {grid.map((g, i) => (
          <line key={i} x1={padL} y1={g.y} x2={w - padR} y2={g.y} stroke="var(--border)" strokeWidth="0.15" vectorEffect="non-scaling-stroke" />
        ))}
        {paths.map((p, i) => (
          <path key={i} d={p.d} fill={p.color} opacity={hover ? 0.7 : 0.85} />
        ))}
        {hover && (
          <g>
            <line x1={xAt(hover.idx)} y1={padT} x2={xAt(hover.idx)} y2={h - padB} stroke="var(--fg)" strokeWidth="0.3" vectorEffect="non-scaling-stroke" strokeDasharray="1 1"/>
            {series.map((s, si) => (
              <circle key={si} cx={xAt(hover.idx)} cy={yAt(stacks[hover.idx][si][1])} r="0.8" fill={s.color} stroke="var(--bg-card)" strokeWidth="0.4" vectorEffect="non-scaling-stroke"/>
            ))}
          </g>
        )}
      </svg>
      <div className="chart-y-axis">
        {grid.map((g, i) => (
          <div key={i} className="chart-y-tick" style={{ top: `${(g.y / h) * 100}%` }}>
            {formatY ? formatY(g.v) : APP_DATA.fmtShort(g.v)}
          </div>
        ))}
      </div>
      <div className="chart-x-axis">
        {labels.map((l, i) => (
          <div key={i} className="chart-x-tick">{l}</div>
        ))}
      </div>
      {hover && labels[hover.idx] !== undefined && (
        <ChartTooltip x={hover.mouseX} y={hover.mouseY - 20} containerWidth={hover.containerWidth}>
          <div className="chart-tip-h">{labels[hover.idx]}</div>
          <div className="chart-tip-total">
            <span>Toplam</span>
            <span className="mono">{formatTooltipValue ? formatTooltipValue(totals[hover.idx]) : "₺" + APP_DATA.fmt(totals[hover.idx])}</span>
          </div>
          {series.map((s, si) => (
            <div key={si} className="chart-tip-row">
              <span className="chart-tip-dot" style={{background: s.color}}/>
              <span className="chart-tip-l">{s.label}</span>
              <span className="chart-tip-v mono">{formatTooltipValue ? formatTooltipValue(s.values[hover.idx]) : "₺" + APP_DATA.fmt(s.values[hover.idx])}</span>
            </div>
          ))}
        </ChartTooltip>
      )}
    </div>
  );
}

// ── Multi-line chart with overlays + hover ─────
function MultiLineChart({ series, labels, height = 240, formatY, showZero = true, formatTooltipValue }) {
  const w = 100, h = 100;
  const padL = 8, padR = 2, padT = 4, padB = 10;
  const all = series.flatMap(s => s.values).filter(v => Number.isFinite(v));
  const max = Math.max(...all);
  const min = showZero ? Math.min(0, ...all) : Math.min(...all);
  const range = max - min || 1;
  const xAt = (i) => padL + (labels.length === 1 ? 0 : i / (labels.length - 1)) * (w - padL - padR);
  const yAt = (v) => padT + (1 - (v - min) / range) * (h - padT - padB);
  const grid = [0, 0.25, 0.5, 0.75, 1].map(p => ({
    y: padT + p * (h - padT - padB),
    v: min + range * (1 - p),
  }));

  const { hover, onMove, onLeave } = useChartHover(labels.length, padL, padR, w);

  return (
    <div className="chart-wrap" style={{ height }} onMouseMove={onMove} onMouseLeave={onLeave}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="chart-svg">
        {grid.map((g, i) => (
          <line key={i} x1={padL} y1={g.y} x2={w - padR} y2={g.y} stroke="var(--border)" strokeWidth="0.15" vectorEffect="non-scaling-stroke" />
        ))}
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => Number.isFinite(v) ? `${xAt(i)},${yAt(v)}` : null).filter(Boolean);
          if (pts.length < 2) return null;
          const path = `M${pts.join(" L")}`;
          return (
            <g key={si}>
              {s.fill && <path d={`${path} L${xAt(s.values.length - 1)},${yAt(min)} L${xAt(0)},${yAt(min)} Z`} fill={s.color} opacity="0.1" />}
              <path d={path} stroke={s.color} strokeWidth={s.strokeWidth || 1.4} strokeDasharray={s.dashed ? "2 2" : null} fill="none" vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
        {hover && (
          <g>
            <line x1={xAt(hover.idx)} y1={padT} x2={xAt(hover.idx)} y2={h - padB} stroke="var(--fg-3)" strokeWidth="0.3" vectorEffect="non-scaling-stroke" strokeDasharray="1 1"/>
            {series.filter(s => !s.dashed).map((s, si) => (
              Number.isFinite(s.values[hover.idx]) ? <circle key={si} cx={xAt(hover.idx)} cy={yAt(s.values[hover.idx])} r="0.9" fill={s.color} stroke="var(--bg-card)" strokeWidth="0.4" vectorEffect="non-scaling-stroke"/> : null
            ))}
          </g>
        )}
      </svg>
      <div className="chart-y-axis">
        {grid.map((g, i) => (
          <div key={i} className="chart-y-tick" style={{ top: `${(g.y / h) * 100}%` }}>
            {formatY ? formatY(g.v) : APP_DATA.fmtShort(g.v)}
          </div>
        ))}
      </div>
      <div className="chart-x-axis">
        {labels.map((l, i) => (
          <div key={i} className="chart-x-tick">{l}</div>
        ))}
      </div>
      {hover && labels[hover.idx] !== undefined && (
        <ChartTooltip x={hover.mouseX} y={hover.mouseY - 20} containerWidth={hover.containerWidth}>
          <div className="chart-tip-h">{labels[hover.idx]}</div>
          {series.filter(s => !s.dashed && s.name).map((s, si) => (
            <div key={si} className="chart-tip-row">
              <span className="chart-tip-dot" style={{background: s.color}}/>
              <span className="chart-tip-l">{s.name}</span>
              <span className="chart-tip-v mono">{formatTooltipValue ? formatTooltipValue(s.values[hover.idx]) : "₺" + APP_DATA.fmt(s.values[hover.idx])}</span>
            </div>
          ))}
        </ChartTooltip>
      )}
    </div>
  );
}

// ── Heatmap calendar with hover ─────────────────
function HeatmapCalendar({ days, max, color = "var(--accent)" }) {
  const [hover, setHover] = useState(null);
  if (!days.length) return null;
  const start = new Date(days[0].date);
  const startDow = (start.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (const d of days) cells.push(d);

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  const heatColor = (v) => {
    if (!v) return "var(--bg-elev-2)";
    const intensity = Math.min(1, v / max);
    return `color-mix(in oklch, var(--bg-elev-2), ${color} ${Math.round(intensity * 100)}%)`;
  };

  const tr = ["Pzt","Sal","Çar","Per","Cum","Cmt","Paz"];
  const months = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];

  const monthCols = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const first = week.find(c => c);
    if (first) {
      const m = new Date(first.date).getMonth();
      if (m !== lastMonth) {
        monthCols.push({ wi, label: months[m] });
        lastMonth = m;
      }
    }
  });

  return (
    <div className="hmap" onMouseLeave={()=>setHover(null)}>
      <div className="hmap-months" style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}>
        {weeks.map((_, wi) => {
          const lbl = monthCols.find(m => m.wi === wi)?.label;
          return <div key={wi} className="hmap-month">{lbl || ""}</div>;
        })}
      </div>
      <div className="hmap-body">
        <div className="hmap-dow">
          {tr.map((d, i) => <div key={i} className="hmap-dow-l">{i % 2 === 0 ? d : ""}</div>)}
        </div>
        <div className="hmap-grid" style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}>
          {weeks.map((week, wi) => (
            <div key={wi} className="hmap-week">
              {Array.from({ length: 7 }, (_, di) => {
                const cell = week[di];
                if (!cell) return <div key={di} className="hmap-cell hmap-cell-empty"/>;
                const d = new Date(cell.date);
                const isHover = hover && hover.date === cell.date;
                return (
                  <div
                    key={di}
                    className={`hmap-cell ${isHover ? "hmap-cell-hover" : ""}`}
                    style={{ background: heatColor(cell.value) }}
                    onMouseEnter={(e)=>{
                      const grid = e.currentTarget.closest('.hmap').getBoundingClientRect();
                      const cellRect = e.currentTarget.getBoundingClientRect();
                      setHover({ date: cell.date, value: cell.value, x: cellRect.left - grid.left + cellRect.width/2, y: cellRect.top - grid.top });
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="hmap-legend">
        <span>Az</span>
        {[0.1, 0.3, 0.5, 0.7, 0.9].map((v, i) => (
          <span key={i} className="hmap-cell" style={{ background: heatColor(v * max) }}/>
        ))}
        <span>Çok</span>
      </div>
      {hover && (
        <div className="chart-tip hmap-tip" style={{ left: hover.x, top: hover.y - 8 }}>
          <div className="chart-tip-h">
            {new Date(hover.date).getDate()} {months[new Date(hover.date).getMonth()]} {new Date(hover.date).getFullYear()}
          </div>
          <div className="chart-tip-row">
            <span className="chart-tip-l">{tr[(new Date(hover.date).getDay() + 6) % 7]}</span>
            <span className="chart-tip-v mono">{hover.value > 0 ? "₺" + APP_DATA.fmt(hover.value) : "Harcama yok"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Score ring (gauge) ─────────────────────────
function ScoreRing({ score, color = "var(--accent)", size = 150, label, sublabel }) {
  const r = size / 2 - 12;
  const c = size / 2;
  const C = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const off = C * (1 - pct / 100);
  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--bg-elev-2)" strokeWidth="11" />
        <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth="11"
          strokeDasharray={C} strokeDashoffset={off} strokeLinecap="round"
          transform={`rotate(-90 ${c} ${c})`} style={{ transition: "stroke-dashoffset 0.5s ease" }} />
      </svg>
      <div className="score-ring-center">
        <div className="score-ring-val" style={{ color }}>{Math.round(score)}</div>
        {label && <div className="score-ring-label">{label}</div>}
        {sublabel && <div className="score-ring-sub">{sublabel}</div>}
      </div>
    </div>
  );
}

// Make available to other script tags
Object.assign(window, {
  Icon, Money, CategoryPill, Card, Sparkline, AreaChart, BarChart, Donut, Progress, Button,
  StackedAreaChart, MultiLineChart, HeatmapCalendar, ScoreRing,
});
