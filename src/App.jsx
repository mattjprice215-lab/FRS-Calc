import { useState, useCallback } from "react";

// ── Constants ──────────────────────────────────────────────────────────────
const FRS_PENSION_MULT = 0.016;
const FRS_TOTAL_CONTRIB = 0.113;
const DEFAULT_RETURN = 0.07;
const DEFAULT_RAISE = 0.02;
const DEFAULT_INFLATION = 0.03;
const DEFAULT_REPLACE = 0.80;
const DEFAULT_RET_YRS = 25;
const WITHDRAWAL_4PCT = 0.04;

// ── Helpers ────────────────────────────────────────────────────────────────
function projectSalaries(salary, years, raise) {
  return Array.from({ length: years + 1 }, (_, i) => salary * Math.pow(1 + raise, i));
}

function computeAFC(history, n) {
  const sorted = [...history].sort((a, b) => b - a);
  const top = sorted.slice(0, Math.min(n, sorted.length));
  return top.reduce((s, v) => s + v, 0) / top.length;
}

function fvAnnuityDue(pmt, r, n) {
  if (r === 0) return pmt * n;
  return pmt * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
}

function pvOfIncome(monthly, r, months) {
  if (r === 0) return monthly * months;
  return (monthly * (1 - Math.pow(1 + r, -months))) / r;
}

function pmtFromPV(pv, r, months) {
  if (r === 0) return pv / months;
  return (pv * r) / (1 - Math.pow(1 + r, -months));
}

function fmt$(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtPct(n, d = 1) {
  return `${(n * 100).toFixed(d)}%`;
}

// ── Calculations ───────────────────────────────────────────────────────────
function calcPension(inp) {
  const ytr = inp.retirementAge - inp.currentAge;
  const totalYOS = inp.yearsOfService + ytr;
  const afcYrs = inp.hirePeriod === "before2011" ? 5 : 8;
  const history = projectSalaries(inp.currentSalary, ytr, inp.salaryRaiseRate);
  const afc = computeAFC(history, afcYrs);
  const finalSalary = history[history.length - 1];
  const annual = FRS_PENSION_MULT * totalYOS * afc;
  return { annual, monthly: annual / 12, afc, afcYrs, totalYOS, finalSalary };
}

function calcInvestment(inp) {
  const ytr = inp.retirementAge - inp.currentAge;
  const r = inp.investmentReturnRate;
  let currentBal = 0;
  let balSource = "estimated";

  if (inp.currentBalance > 0) {
    currentBal = inp.currentBalance;
    balSource = "provided";
  } else {
    let ySinceStart = 0;
    if (inp.planStartDate) {
      const ms = Date.now() - new Date(inp.planStartDate).getTime();
      ySinceStart = Math.max(0, Math.floor(ms / (365.25 * 24 * 3600 * 1000)));
    } else if (inp.yearsOfService > 0) {
      ySinceStart = inp.yearsOfService;
    }
    if (ySinceStart > 0) {
      currentBal = fvAnnuityDue(FRS_TOTAL_CONTRIB * inp.currentSalary, r, ySinceStart);
    }
  }

  const fvBal = currentBal * Math.pow(1 + r, ytr);
  const salaries = projectSalaries(inp.currentSalary, ytr, inp.salaryRaiseRate);
  let fvFuture = 0;
  for (let i = 0; i < ytr; i++) {
    fvFuture += FRS_TOTAL_CONTRIB * salaries[i] * Math.pow(1 + r, ytr - i);
  }
  const balance = fvBal + fvFuture;
  const annual4 = balance * WITHDRAWAL_4PCT;
  const monthly4 = annual4 / 12;
  const monthlyDraw = pmtFromPV(balance, r / 12, inp.retirementYears * 12);
  return { balance, annual4, monthly4, monthlyDraw, currentBal, balSource };
}

function calcContrib(inp, gap) {
  const zero = { pct: 0, monthly: 0, balance: 0, tradPct: 0, rothPct: 0, tradMo: 0, rothMo: 0, covered: true };
  if (gap.gapAnnual <= 0) return zero;
  const ytr = inp.retirementAge - inp.currentAge;
  const r = inp.investmentReturnRate;
  const mr = r / 12;
  const months = inp.retirementYears * 12;
  const reqBal = pvOfIncome(gap.gapMonthly, mr, months);
  const fv403 = (inp.existing403bBalance || 0) * Math.pow(1 + r, ytr);
  const fvRoth = (inp.existingRoth403bBalance || 0) * Math.pow(1 + r, ytr);
  const net = Math.max(0, reqBal - fv403 - fvRoth);
  if (net <= 0) return zero;
  const salaries = projectSalaries(inp.currentSalary, ytr, inp.salaryRaiseRate);
  let fvUnit = 0;
  for (let yr = 0; yr < ytr; yr++) {
    const ms = salaries[yr] / 12;
    for (let m = 0; m < 12; m++) {
      fvUnit += ms * Math.pow(1 + mr, (ytr - yr) * 12 - m);
    }
  }
  if (fvUnit <= 0) return zero;
  const pct = net / fvUnit;
  const monthly = pct * (inp.currentSalary / 12);
  let tradPct = 0, rothPct = 0;
  if (inp.plan403bType === "traditional") tradPct = pct;
  else if (inp.plan403bType === "roth") rothPct = pct;
  else { tradPct = pct / 2; rothPct = pct / 2; }
  return {
    pct, monthly, balance: net,
    tradPct, rothPct,
    tradMo: tradPct * (inp.currentSalary / 12),
    rothMo: rothPct * (inp.currentSalary / 12),
    covered: false,
  };
}

function runAll(inp) {
  const ytr = inp.retirementAge - inp.currentAge;
  const salaries = projectSalaries(inp.currentSalary, ytr, inp.salaryRaiseRate);
  const finalSalary = salaries[salaries.length - 1];
  let pension = null, investment = null, frsAnnual = 0, frsMonthly = 0;
  if (inp.planType === "pension") {
    pension = calcPension(inp);
    frsAnnual = pension.annual; frsMonthly = pension.monthly;
  } else {
    investment = calcInvestment(inp);
    frsAnnual = investment.annual4; frsMonthly = investment.monthly4;
  }
  const target = inp.incomeReplacementPct * finalSalary;
  const targetMo = target / 12;
  const gapAnnual = Math.max(0, target - frsAnnual);
  const gapMonthly = Math.max(0, targetMo - frsMonthly);
  const coverage = target > 0 ? Math.min(1, frsAnnual / target) : 1;
  const gap = { target, targetMo, frsAnnual, frsMonthly, gapAnnual, gapMonthly, coverage, finalSalary };
  const contrib = calcContrib(inp, gap);
  return { pension, investment, gap, contrib };
}

// ── UI Components ──────────────────────────────────────────────────────────
const S = {
  app: { fontFamily: "system-ui, sans-serif", minHeight: "100vh", background: "#f9fafb", color: "#111827" },
  header: { background: "linear-gradient(135deg, #1e3a5f 0%, #2d5986 100%)", color: "#fff", padding: "24px 20px" },
  headerInner: { maxWidth: 860, margin: "0 auto" },
  h1: { fontSize: 22, fontWeight: 700, margin: 0 },
  subtitle: { fontSize: 13, color: "#bfdbfe", marginTop: 4 },
  main: { maxWidth: 860, margin: "0 auto", padding: "24px 16px" },
  card: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 22, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,.06)" },
  cardTitle: { fontSize: 15, fontWeight: 600, color: "#111827", marginBottom: 4 },
  cardSub: { fontSize: 12, color: "#6b7280", marginBottom: 16 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 },
  label: { display: "block", fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 4 },
  input: { width: "100%", borderRadius: 8, border: "1px solid #d1d5db", padding: "8px 12px", fontSize: 14, outline: "none", boxSizing: "border-box" },
  inputWrap: { position: "relative" },
  prefix: { position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "#6b7280", pointerEvents: "none" },
  suffix: { position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "#6b7280", pointerEvents: "none" },
  btn: { width: "100%", background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 12, padding: "13px 0", fontSize: 15, fontWeight: 600, cursor: "pointer" },
  btnReset: { padding: "13px 20px", border: "1px solid #d1d5db", background: "#fff", borderRadius: 12, fontSize: 14, cursor: "pointer", color: "#374151" },
  err: { fontSize: 11, color: "#dc2626", marginTop: 2 },
  help: { fontSize: 11, color: "#9ca3af", marginTop: 2 },
  radioCard: (sel, accent) => ({
    border: sel ? `2px solid ${accent}` : "1px solid #e5e7eb",
    borderRadius: 12, padding: 14, cursor: "pointer", background: sel ? `${accent}10` : "#fff",
    textAlign: "left", width: "100%", transition: "all .15s",
  }),
  divider: { border: "none", borderTop: "1px solid #f3f4f6", margin: "14px 0" },
  metric: { label: { fontSize: 11, color: "#6b7280", marginBottom: 2 }, val: { fontSize: 20, fontWeight: 700, color: "#111827" }, sm: { fontSize: 14, fontWeight: 600 } },
  mono: { fontFamily: "monospace", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#374151" },
  infoBox: (c) => ({ background: `${c}15`, border: `1px solid ${c}40`, borderRadius: 10, padding: 12, fontSize: 12 }),
  badge: (c) => ({ background: `${c}20`, color: c, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, display: "inline-block" }),
  progressBar: { height: 12, background: "#f3f4f6", borderRadius: 99, overflow: "hidden" },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
};

function Field({ label, id, value, onChange, prefix, suffix, error, help, min, max, step, type = "number", optional, placeholder }) {
  return (
    <div>
      <label style={S.label} htmlFor={id}>{label}{optional && <span style={{ color: "#9ca3af", fontWeight: 400 }}> (opt)</span>}</label>
      <div style={S.inputWrap}>
        {prefix && <span style={S.prefix}>{prefix}</span>}
        <input
          id={id} type={type} value={value ?? ""} min={min} max={max} step={step} placeholder={placeholder}
          style={{ ...S.input, paddingLeft: prefix ? 26 : 12, paddingRight: suffix ? 36 : 12 }}
          onChange={e => {
            if (type === "number") {
              const v = parseFloat(e.target.value);
              onChange(isNaN(v) ? undefined : v);
            } else onChange(e.target.value || undefined);
          }}
        />
        {suffix && <span style={S.suffix}>{suffix}</span>}
      </div>
      {error && <div style={S.err}>{error}</div>}
      {help && !error && <div style={S.help}>{help}</div>}
    </div>
  );
}

function RadioCard({ selected, onClick, title, sub, accent = "#1d4ed8" }) {
  return (
    <button type="button" onClick={onClick} style={S.radioCard(selected, accent)}>
      <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>{title}</div>
      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3, lineHeight: 1.4 }}>{sub}</div>
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${selected ? accent : "#d1d5db"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {selected && <div style={{ width: 6, height: 6, borderRadius: "50%", background: accent }} />}
        </div>
        <span style={{ fontSize: 11, color: "#9ca3af" }}>{selected ? "Selected" : "Select"}</span>
      </div>
    </button>
  );
}

function Metric({ label, value, large }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: large ? 22 : 15, fontWeight: 700, color: "#111827" }}>{value}</div>
    </div>
  );
}

// ── Simple SVG Bar Chart ───────────────────────────────────────────────────
function IncomeChart({ gap, contrib }) {
  const frs = Math.round(gap.frsMonthly);
  const c403 = contrib.covered ? 0 : Math.round(contrib.monthly > 0 ? gap.gapMonthly : 0);
  const remaining = Math.max(0, Math.round(gap.gapMonthly - c403));
  const target = Math.round(gap.targetMo);
  const total = frs + c403 + remaining;
  const maxVal = Math.max(total, target) * 1.15;
  const W = 320, H = 180, barW = 80, barX = (W - barW) / 2;
  const toY = v => H - 40 - ((v / maxVal) * (H - 60));
  const toH = v => (v / maxVal) * (H - 60);

  const segments = [
    { v: frs, color: "#3b82f6", label: "FRS" },
    { v: c403, color: "#22c55e", label: "403(b)" },
    { v: remaining, color: "#fca5a5", label: "Gap" },
  ];

  let yOff = H - 40;
  const bars = segments.filter(s => s.v > 0).map(s => {
    const h = toH(s.v);
    yOff -= h;
    return { ...s, y: yOff, h };
  });

  const targetY = toY(target);

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", marginBottom: 12 }}>Monthly Income Breakdown at Retirement</div>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-end" }}>
        <svg width={W} height={H} style={{ overflow: "visible" }}>
          {/* Y axis */}
          {[0, 0.25, 0.5, 0.75, 1].map(t => {
            const y = H - 40 - t * (H - 60);
            const v = maxVal * t;
            return (
              <g key={t}>
                <line x1={40} y1={y} x2={W - 10} y2={y} stroke="#f3f4f6" strokeWidth={1} />
                <text x={36} y={y + 4} textAnchor="end" fontSize={10} fill="#9ca3af">${Math.round(v / 1000)}k</text>
              </g>
            );
          })}
          {/* Bars */}
          {bars.map((b, i) => (
            <rect key={i} x={barX} y={b.y} width={barW} height={b.h} fill={b.color} rx={i === bars.length - 1 ? 4 : 0} />
          ))}
          {/* Target line */}
          <line x1={barX - 10} y1={targetY} x2={barX + barW + 10} y2={targetY} stroke="#6366f1" strokeWidth={2} strokeDasharray="5 3" />
          <text x={barX + barW + 14} y={targetY + 4} fontSize={10} fill="#6366f1">Target</text>
          {/* X label */}
          <text x={barX + barW / 2} y={H - 20} textAnchor="middle" fontSize={11} fill="#6b7280">Monthly</text>
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
          {[
            { color: "#3b82f6", label: "FRS Benefit", val: fmt$(frs) + "/mo" },
            { color: "#22c55e", label: "403(b) Income", val: fmt$(c403) + "/mo" },
            ...(remaining > 0 ? [{ color: "#fca5a5", label: "Remaining Gap", val: fmt$(remaining) + "/mo" }] : []),
            { color: "#6366f1", label: "Target Income", val: fmt$(target) + "/mo", dashed: true },
          ].map(item => (
            <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 12, height: 12, background: item.color, borderRadius: 3, flexShrink: 0, opacity: item.dashed ? 0.7 : 1, border: item.dashed ? `2px dashed ${item.color}` : "none", background: item.dashed ? "transparent" : item.color }} />
              <div style={{ color: "#6b7280" }}>{item.label}</div>
              <div style={{ fontWeight: 600, color: "#111827", marginLeft: 4 }}>{item.val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
const DEFAULTS = {
  currentAge: 35, currentSalary: 50000, retirementAge: 65,
  planType: "pension", hirePeriod: "after2011", yearsOfService: 5,
  currentBalance: undefined, planStartDate: undefined,
  plan403bType: "traditional", existing403bBalance: undefined, existingRoth403bBalance: undefined,
  salaryRaiseRate: DEFAULT_RAISE, inflationRate: DEFAULT_INFLATION,
  investmentReturnRate: DEFAULT_RETURN, incomeReplacementPct: DEFAULT_REPLACE,
  retirementYears: DEFAULT_RET_YRS,
};

export default function App() {
  const [inp, setInp] = useState(DEFAULTS);
  const [errors, setErrors] = useState({});
  const [results, setResults] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const set = (k, v) => { setInp(p => ({ ...p, [k]: v })); setErrors(p => { const n = { ...p }; delete n[k]; return n; }); };

  const validate = () => {
    const e = {};
    if (!inp.currentAge || inp.currentAge < 18 || inp.currentAge > 80) e.currentAge = "Must be 18–80";
    if (!inp.retirementAge || inp.retirementAge <= inp.currentAge) e.retirementAge = "Must be > current age";
    if (!inp.currentSalary || inp.currentSalary <= 0) e.currentSalary = "Must be > $0";
    if (inp.yearsOfService < 0) e.yearsOfService = "Cannot be negative";
    if (inp.incomeReplacementPct <= 0 || inp.incomeReplacementPct > 2) e.incomeReplacementPct = "1%–200%";
    if (inp.retirementYears < 5 || inp.retirementYears > 50) e.retirementYears = "5–50 years";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const calculate = () => { if (validate()) setResults(runAll(inp)); };
  const reset = () => { setInp(DEFAULTS); setErrors({}); setResults(null); };

  const r = results;
  const showTrad = inp.plan403bType === "traditional" || inp.plan403bType === "both";
  const showRoth = inp.plan403bType === "roth" || inp.plan403bType === "both";

  return (
    <div style={S.app}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.headerInner}>
          <div style={S.h1}>FRS Retirement Calculator</div>
          <div style={S.subtitle}>Florida Retirement System · Pension &amp; Investment Plan · 403(b) Gap Analysis</div>
          <div style={{ fontSize: 13, color: "#93c5fd", marginTop: 8, maxWidth: 600 }}>
            Project your FRS benefit and calculate how much to contribute to a 403(b) or Roth 403(b) to reach your income goal.
          </div>
        </div>
      </div>

      <div style={S.main}>
        {/* ── Personal Info ── */}
        <div style={S.card}>
          <div style={S.cardTitle}>Personal Information</div>
          <div style={S.cardSub}>Basic details used in all calculations.</div>
          <div style={S.grid3}>
            <Field label="Current Age" id="age" value={inp.currentAge} onChange={v => set("currentAge", v)} min={18} max={80} error={errors.currentAge} />
            <Field label="Retirement Age" id="retAge" value={inp.retirementAge} onChange={v => set("retirementAge", v)} min={inp.currentAge + 1} max={80} error={errors.retirementAge} />
            <Field label="Current Annual Salary" id="sal" value={inp.currentSalary} onChange={v => set("currentSalary", v)} prefix="$" min={1} step={1000} error={errors.currentSalary} />
          </div>
        </div>

        {/* ── FRS Plan Type ── */}
        <div style={S.card}>
          <div style={S.cardTitle}>FRS Plan Type</div>
          <div style={S.cardSub}>Florida educators belong to one plan — select yours.</div>
          <div style={S.grid2}>
            <RadioCard selected={inp.planType === "pension"} onClick={() => set("planType", "pension")}
              title="FRS Pension Plan" accent="#1d4ed8"
              sub="Defined benefit · Guaranteed monthly income · 1.6% × YOS × AFC" />
            <RadioCard selected={inp.planType === "investment"} onClick={() => set("planType", "investment")}
              title="FRS Investment Plan" accent="#059669"
              sub="Defined contribution · You own the account · 11.3% total contributions" />
          </div>
        </div>

        {/* ── Plan-specific inputs ── */}
        {inp.planType === "pension" ? (
          <div style={S.card}>
            <div style={S.cardTitle}>Pension Plan Details</div>
            <div style={S.cardSub}>Used to calculate your projected FRS pension benefit.</div>
            <div style={S.grid2}>
              <RadioCard selected={inp.hirePeriod === "before2011"} onClick={() => set("hirePeriod", "before2011")}
                title="Hired Before 2011" sub="AFC = average of highest 5 years" />
              <RadioCard selected={inp.hirePeriod === "after2011"} onClick={() => set("hirePeriod", "after2011")}
                title="Hired 2011 or After" sub="AFC = average of highest 8 years" />
            </div>
            <div style={{ marginTop: 16, maxWidth: 280 }}>
              <Field label="Current Years of FRS Service" id="yos" value={inp.yearsOfService} onChange={v => set("yearsOfService", v ?? 0)} min={0} max={50} error={errors.yearsOfService} help="Enter 0 if just starting." />
            </div>
          </div>
        ) : (
          <div style={S.card}>
            <div style={S.cardTitle}>Investment Plan Details</div>
            <div style={S.cardSub}>Your account grows with 11.3% total contributions (3% + 8.3% employer).</div>
            <div style={S.grid2}>
              <Field label="Current Account Balance" id="bal" value={inp.currentBalance} onChange={v => set("currentBalance", v)} prefix="$" min={0} step={100} optional placeholder="e.g. 25000"
                help="Leave blank to estimate from start date." />
              {!inp.currentBalance && (
                <Field label="Plan Start Date" id="startDate" value={inp.planStartDate} onChange={v => set("planStartDate", v)} type="date" optional
                  help="Used to estimate current balance." />
              )}
            </div>
            <div style={{ ...S.infoBox("#3b82f6"), marginTop: 12, color: "#1e40af" }}>
              <strong>Note:</strong> If no balance provided, we estimate it using an annuity-due formula (11.3% of salary, 7% return). Example: 2 years + $50k salary ≈ $12,513.
            </div>
          </div>
        )}

        {/* ── 403(b) Section ── */}
        <div style={S.card}>
          <div style={S.cardTitle}>403(b) / Roth 403(b) Plan</div>
          <div style={S.cardSub}>Select your supplemental retirement account type.</div>
          <div style={S.grid3}>
            <RadioCard selected={inp.plan403bType === "traditional"} onClick={() => set("plan403bType", "traditional")} accent="#1d4ed8"
              title="Traditional 403(b)" sub="Pre-tax · Reduces income now · Taxed at withdrawal" />
            <RadioCard selected={inp.plan403bType === "roth"} onClick={() => set("plan403bType", "roth")} accent="#7c3aed"
              title="Roth 403(b)" sub="After-tax · No deduction · Tax-free growth &amp; withdrawals" />
            <RadioCard selected={inp.plan403bType === "both"} onClick={() => set("plan403bType", "both")} accent="#059669"
              title="Both Plans" sub="Split contributions evenly between Traditional and Roth" />
          </div>
          <div style={{ ...S.grid2, marginTop: 14 }}>
            {showTrad && <Field label="Existing Traditional 403(b) Balance" id="b403" value={inp.existing403bBalance} onChange={v => set("existing403bBalance", v)} prefix="$" min={0} step={100} optional placeholder="e.g. 10000" />}
            {showRoth && <Field label="Existing Roth 403(b) Balance" id="bRoth" value={inp.existingRoth403bBalance} onChange={v => set("existingRoth403bBalance", v)} prefix="$" min={0} step={100} optional placeholder="e.g. 5000" />}
          </div>
        </div>

        {/* ── Goals & Assumptions ── */}
        <div style={S.card}>
          <div style={S.cardTitle}>Income Goal &amp; Assumptions</div>
          <div style={S.grid2}>
            <Field label="Income Replacement Goal" id="replace" value={+(inp.incomeReplacementPct * 100).toFixed(1)}
              onChange={v => set("incomeReplacementPct", (v ?? 80) / 100)} suffix="%" min={1} max={200} step={5}
              error={errors.incomeReplacementPct} help="Typical: 70–85% of projected final salary." />
            <Field label="Years in Retirement (Drawdown)" id="retYrs" value={inp.retirementYears}
              onChange={v => set("retirementYears", v ?? 25)} suffix="yrs" min={5} max={50} error={errors.retirementYears} />
          </div>
          <button type="button" onClick={() => setShowAdvanced(v => !v)}
            style={{ marginTop: 12, background: "none", border: "none", cursor: "pointer", color: "#1d4ed8", fontSize: 13, fontWeight: 500, padding: 0, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ display: "inline-block", transform: showAdvanced ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▶</span>
            {showAdvanced ? "Hide" : "Show"} Advanced Assumptions
          </button>
          {showAdvanced && (
            <div style={{ ...S.grid3, marginTop: 12, paddingTop: 12, borderTop: "1px solid #f3f4f6" }}>
              <Field label="Annual Salary Raise" id="raise" value={+(inp.salaryRaiseRate * 100).toFixed(2)}
                onChange={v => set("salaryRaiseRate", (v ?? 2) / 100)} suffix="%" min={0} max={20} step={0.25}
                help="Applied each year until retirement." />
              <Field label="Inflation Rate" id="infl" value={+(inp.inflationRate * 100).toFixed(2)}
                onChange={v => set("inflationRate", (v ?? 3) / 100)} suffix="%" min={0} max={15} step={0.25}
                help="For reference in projections." />
              <Field label="Investment Return Rate" id="ret" value={+(inp.investmentReturnRate * 100).toFixed(2)}
                onChange={v => set("investmentReturnRate", (v ?? 7) / 100)} suffix="%" min={0} max={25} step={0.25}
                help="For Investment Plan &amp; 403(b) growth." />
            </div>
          )}
        </div>

        {/* ── Action Buttons ── */}
        <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
          <button type="button" onClick={calculate} style={S.btn}>Calculate Retirement Plan</button>
          <button type="button" onClick={reset} style={S.btnReset}>Reset</button>
        </div>

        {/* ── Results ── */}
        {r && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ height: 3, flex: 1, background: "#1d4ed8", borderRadius: 99 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8", letterSpacing: 1, textTransform: "uppercase" }}>Results</span>
              <div style={{ height: 3, flex: 1, background: "#1d4ed8", borderRadius: 99 }} />
            </div>

            {/* FRS Benefit */}
            <div style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={S.cardTitle}>FRS Benefit Projection</div>
                <span style={S.badge(inp.planType === "pension" ? "#1d4ed8" : "#059669")}>
                  {inp.planType === "pension" ? "Pension Plan" : "Investment Plan"}
                </span>
              </div>

              {r.pension && (
                <>
                  <div style={S.grid2}>
                    <Metric label="Annual Pension Benefit" value={fmt$(r.pension.annual)} large />
                    <Metric label="Monthly Pension Benefit" value={fmt$(r.pension.monthly)} large />
                  </div>
                  <hr style={S.divider} />
                  <div style={S.grid3}>
                    <Metric label="Total Years of Service" value={`${r.pension.totalYOS} yrs`} />
                    <Metric label={`AFC (avg top ${r.pension.afcYrs} yrs)`} value={fmt$(r.pension.afc)} />
                    <Metric label="Projected Final Salary" value={fmt$(r.pension.finalSalary)} />
                  </div>
                  <div style={{ ...S.mono, marginTop: 12 }}>
                    1.6% × {r.pension.totalYOS} yrs × {fmt$(r.pension.afc)} AFC = {fmt$(r.pension.annual)}/yr
                  </div>
                </>
              )}

              {r.investment && (
                <>
                  <div style={S.grid2}>
                    <Metric label="Projected Balance at Retirement" value={fmt$(r.investment.balance)} large />
                    <Metric label="Monthly Income (4% Rule)" value={fmt$(r.investment.monthly4)} large />
                  </div>
                  <hr style={S.divider} />
                  <div style={S.grid3}>
                    <Metric label={`Monthly (${inp.retirementYears}-yr Drawdown)`} value={fmt$(r.investment.monthlyDraw)} />
                    <Metric label="Annual Income (4% Rule)" value={fmt$(r.investment.annual4)} />
                    <Metric label={r.investment.balSource === "provided" ? "Balance (Provided)" : "Est. Current Balance"} value={fmt$(r.investment.currentBal)} />
                  </div>
                  <div style={{ ...S.infoBox("#3b82f6"), marginTop: 12, color: "#1e40af" }}>
                    Contributions: 3% employee + 8.3% employer = 11.3% of salary · {fmtPct(inp.investmentReturnRate)} annual return assumed.
                  </div>
                </>
              )}
            </div>

            {/* Income Gap */}
            <div style={S.card}>
              <div style={S.cardTitle}>Income Gap Analysis</div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                  <span>FRS Coverage</span>
                  <span>{fmtPct(r.gap.coverage)} of target</span>
                </div>
                <div style={S.progressBar}>
                  <div style={{ height: "100%", width: `${Math.min(100, r.gap.coverage * 100)}%`, background: r.gap.gapAnnual <= 0 ? "#22c55e" : "#3b82f6", transition: "width .5s" }} />
                </div>
                {r.gap.gapAnnual > 0 && <div style={{ fontSize: 11, color: "#dc2626", textAlign: "right", marginTop: 2 }}>Gap: {fmtPct(1 - r.gap.coverage)}</div>}
              </div>
              {[
                { label: `Projected Final Salary (age ${inp.retirementAge})`, val: fmt$(r.gap.finalSalary), sub: null, color: "#374151" },
                { label: `Target Income (${fmtPct(inp.incomeReplacementPct, 0)} replacement)`, val: fmt$(r.gap.target) + "/yr", sub: fmt$(r.gap.targetMo) + "/mo", color: "#374151" },
                { label: "FRS Benefit", val: fmt$(r.gap.frsAnnual) + "/yr", sub: fmt$(r.gap.frsMonthly) + "/mo", color: "#1d4ed8" },
                { label: "Income Gap", val: r.gap.gapAnnual <= 0 ? "✓ No gap" : fmt$(r.gap.gapAnnual) + "/yr", sub: r.gap.gapAnnual <= 0 ? "FRS covers your goal" : fmt$(r.gap.gapMonthly) + "/mo to fill", color: r.gap.gapAnnual <= 0 ? "#059669" : "#dc2626" },
              ].map(item => (
                <div key={item.label} style={S.row}>
                  <span style={{ fontSize: 13, color: "#6b7280" }}>{item.label}</span>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: item.color }}>{item.val}</div>
                    {item.sub && <div style={{ fontSize: 11, color: "#9ca3af" }}>{item.sub}</div>}
                  </div>
                </div>
              ))}
            </div>

            {/* 403(b) Contribution */}
            <div style={r.contrib.covered ? { ...S.card, border: "1px solid #86efac", background: "#f0fdf4" } : S.card}>
              <div style={S.cardTitle}>Required 403(b) Contributions</div>
              {r.contrib.covered ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#fff", fontSize: 20 }}>✓</div>
                  <div>
                    <div style={{ fontWeight: 600, color: "#15803d" }}>Your FRS benefit covers your income goal!</div>
                    <div style={{ fontSize: 13, color: "#16a34a", marginTop: 2 }}>No additional 403(b) contributions needed.</div>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ ...S.infoBox("#1d4ed8"), marginBottom: 14, color: "#1e40af" }}>
                    To fill your {fmt$(r.contrib.monthly > 0 ? r.gap.gapMonthly : 0)}/mo income gap at retirement.
                  </div>
                  <div style={{ ...S.grid2, marginBottom: 14 }}>
                    <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12, padding: 16 }}>
                      <div style={{ fontSize: 11, color: "#1d4ed8", marginBottom: 2 }}>Total Required</div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: "#1e40af" }}>{fmtPct(r.contrib.pct)}</div>
                      <div style={{ fontSize: 12, color: "#3b82f6" }}>of your salary</div>
                    </div>
                    <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12, padding: 16 }}>
                      <div style={{ fontSize: 11, color: "#1d4ed8", marginBottom: 2 }}>Monthly Amount</div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: "#1e40af" }}>{fmt$(r.contrib.monthly)}</div>
                      <div style={{ fontSize: 12, color: "#3b82f6" }}>per month (today)</div>
                    </div>
                  </div>

                  {inp.plan403bType === "both" && (
                    <div style={{ ...S.grid2, marginBottom: 14 }}>
                      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#1d4ed8" }}>Traditional 403(b)</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#1e40af" }}>{fmtPct(r.contrib.tradPct)}</div>
                        <div style={{ fontSize: 12, color: "#3b82f6" }}>{fmt$(r.contrib.tradMo)}/mo</div>
                      </div>
                      <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 10, padding: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#7c3aed" }}>Roth 403(b)</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#6d28d9" }}>{fmtPct(r.contrib.rothPct)}</div>
                        <div style={{ fontSize: 12, color: "#7c3aed" }}>{fmt$(r.contrib.rothMo)}/mo</div>
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {showTrad && (
                      <div style={{ ...S.infoBox("#1d4ed8"), color: "#1e40af" }}>
                        <strong>Traditional 403(b) — Pre-Tax:</strong> Contributions reduce your taxable income by {fmt$(r.contrib.tradMo)}/mo now. Withdrawals taxed as ordinary income in retirement.
                      </div>
                    )}
                    {showRoth && (
                      <div style={{ ...S.infoBox("#7c3aed"), color: "#4c1d95" }}>
                        <strong>Roth 403(b) — After-Tax:</strong> Contributions of {fmt$(r.contrib.rothMo)}/mo are made after taxes. All growth and qualified withdrawals are completely tax-free.
                      </div>
                    )}
                  </div>

                  <div style={{ borderTop: "1px solid #f3f4f6", marginTop: 14, paddingTop: 12, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: "#6b7280" }}>Projected 403(b) Balance at Retirement</span>
                    <span style={{ fontWeight: 700 }}>{fmt$(r.contrib.balance)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Chart */}
            <div style={S.card}>
              <IncomeChart gap={r.gap} contrib={r.contrib} />
            </div>

            <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", marginTop: 8 }}>
              Estimates for planning purposes only. Consult a financial advisor for personalized advice. Values shown in nominal (future) dollars.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
