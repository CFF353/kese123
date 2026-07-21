// Davranışsal İçgörü — harcama örüntüleri
// Maaş sonrası harcama, "sızıntı" tespiti, nakit yakım takvimi
// ─────────────────────────────────────────────────────────

function BehavioralInsights({ transactions, today }) {
  const fmt = APP_DATA.fmt, fmtS = APP_DATA.fmtShort;
  const cats = APP_DATA.categories;

  // Son 90 günlük gider işlemleri (transfer ve borç ödemeleri hariç — iç para hareketleri sayılmaz)
  const d90 = new Date(today); d90.setDate(today.getDate() - 90);
  const exp90 = transactions.filter((t) => t.amount < 0 && !isTransferLeg(t) && !isDebtPayment(t) && new Date(t.date) >= d90);
  const inc90 = transactions.filter((t) => t.amount > 0 && !isTransferLeg(t) && !isDebtPayment(t) && new Date(t.date) >= d90);

  // ── 1) Maaş sonrası harcama örüntüsü ──
  // Maaş günlerini bul (en büyük tekrarlayan gelir = maaş)
  const salaryTx = inc90.filter((t) => t.category === "maas");
  const paydays = salaryTx.map((t) => new Date(t.date).getDate());
  const avgPayday = paydays.length ? Math.round(paydays.reduce((s, d) => s + d, 0) / paydays.length) : null;

  // Maaş sonrası 7 gün vs diğer günlerin günlük ortalama harcaması
  const daysSincePayday = (txDate) => {
    const d = new Date(txDate);
    const day = d.getDate();
    if (avgPayday === null) return 99;
    let diff = day - avgPayday;
    if (diff < 0) diff += 30; // önceki ayın maaşından bu yana
    return diff;
  };
  let firstWeekSum = 0, firstWeekDays = new Set();
  let restSum = 0, restDays = new Set();
  exp90.forEach((t) => {
    const ds = daysSincePayday(t.date);
    const key = new Date(t.date).toISOString().slice(0, 10);
    if (ds >= 0 && ds <= 6) { firstWeekSum += -t.amount; firstWeekDays.add(key); }
    else { restSum += -t.amount; restDays.add(key); }
  });
  const firstWeekDaily = firstWeekDays.size ? firstWeekSum / firstWeekDays.size : 0;
  const restDaily = restDays.size ? restSum / restDays.size : 0;
  const paydaySpike = restDaily ? (firstWeekDaily / restDaily - 1) * 100 : 0;

  // ── 2) "Sızıntı" tespiti — küçük ama sık tekrarlayan harcamalar ──
  // Merchant adına göre grupla; 3+ kez tekrarlanan ve ortalama < 500₺ olan
  const byMerchant = {};
  exp90.forEach((t) => {
    const key = (t.name || "Bilinmeyen").trim();
    if (!byMerchant[key]) byMerchant[key] = { name: key, count: 0, total: 0, cat: t.category };
    byMerchant[key].count += 1;
    byMerchant[key].total += -t.amount;
  });
  const leaks = Object.values(byMerchant)
    .map((m) => ({ ...m, avg: m.total / m.count, monthly: m.total / 3 }))
    .filter((m) => m.count >= 3 && m.avg <= 500 && m.cat !== "faturalar" && m.cat !== "kira" && m.cat !== "abonelik")
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
  const leakTotalMonthly = leaks.reduce((s, m) => s + m.monthly, 0);
  const leakYearly = leakTotalMonthly * 12;

  // ── 3) Nakit yakım takvimi — bu ay gün gün kümülatif gider ──
  const mStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const curDay = today.getDate();
  const monthExp = transactions.filter((t) => t.amount < 0 && !isTransferLeg(t) && !isDebtPayment(t) && new Date(t.date) >= mStart && new Date(t.date) <= today);
  const dailyBurn = new Array(daysInMonth).fill(0);
  monthExp.forEach((t) => { const day = new Date(t.date).getDate() - 1; if (day >= 0 && day < daysInMonth) dailyBurn[day] += -t.amount; });
  let cum = 0;
  const burnCurve = dailyBurn.map((v, i) => { cum += v; return { day: i + 1, cum, daily: v, future: i + 1 > curDay }; });
  const spentSoFar = cum;
  const dailyAvg = curDay ? spentSoFar / curDay : 0;
  const projectedMonth = dailyAvg * daysInMonth;
  const maxCum = Math.max(projectedMonth, spentSoFar, 1);

  // Önceki ay aynı güne kadar
  const pmStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const pmSameDay = new Date(today.getFullYear(), today.getMonth() - 1, curDay, 23, 59, 59);
  const prevMonthToDate = transactions.filter((t) => t.amount < 0 && !isTransferLeg(t) && !isDebtPayment(t) && new Date(t.date) >= pmStart && new Date(t.date) <= pmSameDay)
    .reduce((s, t) => s + -t.amount, 0);
  const vsPrevPace = prevMonthToDate ? (spentSoFar / prevMonthToDate - 1) * 100 : null;

  const TR_M = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];

  // SVG burn curve dims
  const W = 560, H = 150, padL = 4, padR = 4, padT = 10, padB = 18;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const xFor = (day) => padL + (day - 1) / (daysInMonth - 1) * plotW;
  const yFor = (val) => padT + plotH - (val / maxCum) * plotH;
  const actualPts = burnCurve.filter((p) => !p.future);
  const linePath = actualPts.map((p, i) => `${i === 0 ? "M" : "L"}${xFor(p.day).toFixed(1)},${yFor(p.cum).toFixed(1)}`).join(" ");
  const areaPath = actualPts.length ? `${linePath} L${xFor(actualPts[actualPts.length-1].day).toFixed(1)},${yFor(0)} L${xFor(1).toFixed(1)},${yFor(0)} Z` : "";
  // projection line from today to month end
  const projPath = `M${xFor(curDay).toFixed(1)},${yFor(spentSoFar).toFixed(1)} L${xFor(daysInMonth).toFixed(1)},${yFor(projectedMonth).toFixed(1)}`;

  return (
    <Card title="Davranışsal içgörüler" subtitle="Harcama örüntülerin · son 90 gün">
      <div className="beh-grid">

        {/* Maaş sonrası harcama */}
        <div className="beh-block">
          <div className="beh-h">
            <span className="beh-icon" style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}><Icon name="calendar" size={15} /></span>
            <div>
              <div className="beh-t">Maaş sonrası ivme</div>
              <div className="beh-sub">{avgPayday ? `Ayın ~${avgPayday}'inde maaş` : "Maaş örüntüsü tespit edilemedi"}</div>
            </div>
          </div>
          {avgPayday && restDaily > 0 ? (
            <>
              <div className={`beh-big ${paydaySpike > 0 ? "neg" : "pos"}`}>{paydaySpike >= 0 ? "+" : "−"}%{Math.abs(paydaySpike).toFixed(0)}</div>
              <div className="beh-cap">Maaş sonrası ilk hafta, günlük harcaman ayın geri kalanına göre {paydaySpike >= 0 ? "daha yüksek" : "daha düşük"}.</div>
              <div className="beh-compare">
                <div className="beh-cmp-row">
                  <span>İlk 7 gün / gün</span>
                  <div className="beh-cmp-bar"><div style={{ width: `${Math.min(100, firstWeekDaily / Math.max(firstWeekDaily, restDaily) * 100)}%`, background: "#f59e0b" }} /></div>
                  <strong className="mono">₺{fmtS(firstWeekDaily)}</strong>
                </div>
                <div className="beh-cmp-row">
                  <span>Diğer günler / gün</span>
                  <div className="beh-cmp-bar"><div style={{ width: `${Math.min(100, restDaily / Math.max(firstWeekDaily, restDaily) * 100)}%`, background: "var(--fg-4)" }} /></div>
                  <strong className="mono">₺{fmtS(restDaily)}</strong>
                </div>
              </div>
            </>
          ) : (
            <div className="beh-empty">Maaş gelirini "Maaş" kategorisiyle eklersen, maaş sonrası harcama örüntünü burada gösteririz.</div>
          )}
        </div>

        {/* Sızıntı tespiti */}
        <div className="beh-block">
          <div className="beh-h">
            <span className="beh-icon" style={{ background: "rgba(239,68,68,0.12)", color: "var(--neg)" }}><Icon name="trendingDown" size={15} /></span>
            <div>
              <div className="beh-t">Küçük sızıntılar</div>
              <div className="beh-sub">Sık tekrarlayan küçük harcamalar</div>
            </div>
          </div>
          {leaks.length > 0 ? (
            <>
              <div className="beh-big neg">₺{fmtS(leakTotalMonthly)}<span className="beh-big-u">/ay</span></div>
              <div className="beh-cap">Bu küçük ama sık harcamalar yılda <strong>₺{fmtS(leakYearly)}</strong> tutuyor.</div>
              <div className="beh-leaks">
                {leaks.map((m) => {
                  const cat = cats.find((c) => c.id === m.cat) || { color: "#64748b" };
                  return (
                    <div key={m.name} className="beh-leak">
                      <span className="beh-leak-dot" style={{ background: cat.color }} />
                      <span className="beh-leak-n">{m.name}</span>
                      <span className="beh-leak-c">{m.count}×</span>
                      <span className="beh-leak-v mono">₺{fmtS(m.monthly)}/ay</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="beh-empty">Sık tekrarlayan küçük harcama örüntüsü bulunamadı. 👏</div>
          )}
        </div>
      </div>

      {/* Nakit yakım takvimi */}
      <div className="beh-burn">
        <div className="beh-burn-h">
          <div>
            <div className="beh-t">Nakit yakım takvimi</div>
            <div className="beh-sub">{TR_M[today.getMonth()]} {today.getFullYear()} · gün gün kümülatif gider</div>
          </div>
          <div className="beh-burn-stats">
            <div className="beh-bs">
              <div className="beh-bs-l">Bugüne kadar</div>
              <div className="beh-bs-v mono">₺{fmtS(spentSoFar)}</div>
            </div>
            <div className="beh-bs">
              <div className="beh-bs-l">Ay sonu tahmini</div>
              <div className="beh-bs-v mono neg">₺{fmtS(projectedMonth)}</div>
            </div>
            {vsPrevPace !== null && (
              <div className="beh-bs">
                <div className="beh-bs-l">Geçen ay aynı gün</div>
                <div className={`beh-bs-v mono ${vsPrevPace > 0 ? "neg" : "pos"}`}>{vsPrevPace >= 0 ? "+" : "−"}%{Math.abs(vsPrevPace).toFixed(0)}</div>
              </div>
            )}
          </div>
        </div>
        <svg className="beh-burn-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="burnGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--neg)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--neg)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {areaPath && <path d={areaPath} fill="url(#burnGrad)" />}
          {linePath && <path d={linePath} fill="none" stroke="var(--neg)" strokeWidth="2" strokeLinejoin="round" />}
          <path d={projPath} fill="none" stroke="var(--fg-4)" strokeWidth="1.5" strokeDasharray="4 4" />
          <circle cx={xFor(curDay)} cy={yFor(spentSoFar)} r="3.5" fill="var(--neg)" />
          {[1, Math.round(daysInMonth / 2), daysInMonth].map((d) => (
            <text key={d} x={xFor(d)} y={H - 4} fontSize="10" fill="var(--fg-4)" textAnchor={d === 1 ? "start" : d === daysInMonth ? "end" : "middle"}>{d}</text>
          ))}
        </svg>
        <div className="beh-burn-legend">
          <span><span className="beh-leg-line" style={{ background: "var(--neg)" }} />Gerçekleşen</span>
          <span><span className="beh-leg-line beh-leg-dash" />Ay sonu projeksiyonu</span>
        </div>
        <div className="beh-burn-verdict">
          <Icon name="info" size={14} />
          <span>{vsPrevPace === null
            ? `Ayın ${curDay}. günündesin · günlük ortalama ₺${fmtS(dailyAvg)} harcamayla ay sonu ~₺${fmtS(projectedMonth)} tahmin ediliyor.`
            : vsPrevPace > 5
            ? `Bu ay geçen aya göre %${vsPrevPace.toFixed(0)} daha hızlı harcıyorsun — bu hızla ay sonu ~₺${fmtS(projectedMonth)} olur. Frene basmanın tam zamanı.`
            : vsPrevPace < -5
            ? `Bu ay geçen aya göre %${Math.abs(vsPrevPace).toFixed(0)} daha tutumlusun — ay sonu ~₺${fmtS(projectedMonth)} ile iyi gidiyorsun. 👏`
            : `Geçen ayki tempona yakınsın · ay sonu ~₺${fmtS(projectedMonth)} bekleniyor.`}</span>
        </div>
      </div>
    </Card>
  );
}

Object.assign(window, { BehavioralInsights });
