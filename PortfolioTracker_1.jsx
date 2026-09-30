import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  LayoutDashboard, Building2, Map as MapIcon, Wallet, Landmark, PiggyBank,
  Target, Calculator, FlaskConical, TrendingUp, FileText, Settings as SettingsIcon,
  Sparkles, Sun, Moon, Bell, ChevronRight, ChevronLeft, Plus, X, AlertTriangle,
  CheckCircle2, ArrowUpRight, ArrowDownRight, Home, DollarSign, Percent, Search,
  Download, Send, Loader2, MapPin, Clock, ShieldAlert, Info,
} from "lucide-react";

/* ============================== THEME ============================== */

const FONT_LINK = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap";

const THEMES = {
  dark: {
    bg: "#0F1B17", bgElev: "#152420", panel: "#1B2C26", panelSoft: "#20342C",
    border: "rgba(201,162,39,0.16)", borderStrong: "rgba(201,162,39,0.32)",
    text: "#F3EFE6", textDim: "#9FB0A6", textFaint: "#6C8078",
    brass: "#C9A227", brassSoft: "#E8CD73", positive: "#6FCF97", negative: "#E2725B",
    warning: "#E8B33D", chip: "#25392F",
  },
  light: {
    bg: "#F6F3EA", bgElev: "#FFFFFF", panel: "#FFFFFF", panelSoft: "#F0EBDD",
    border: "rgba(60,48,10,0.12)", borderStrong: "rgba(60,48,10,0.22)",
    text: "#1B2420", textDim: "#5B6D63", textFaint: "#8B9A91",
    brass: "#9C7A17", brassSoft: "#B8901F", positive: "#1E8E5A", negative: "#C0442B",
    warning: "#A9750F", chip: "#EDE6D3",
  },
};

/* ============================== HELPERS ============================== */

const fmtUSD = (n, opts = {}) => {
  if (n === null || n === undefined || isNaN(n)) return "$0";
  const abs = Math.abs(n);
  if (opts.compact && abs >= 1000000) return (n < 0 ? "-" : "") + "$" + (abs / 1000000).toFixed(2) + "M";
  if (opts.compact && abs >= 1000) return (n < 0 ? "-" : "") + "$" + (abs / 1000).toFixed(0) + "K";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: opts.cents ? 2 : 0 });
};
const fmtPct = (n, d = 1) => (n === null || n === undefined || isNaN(n) ? "0%" : n.toFixed(d) + "%");
const monthsBetween = (dateStr, ref = new Date()) => {
  const d = new Date(dateStr);
  return Math.max(0, (ref.getFullYear() - d.getFullYear()) * 12 + (ref.getMonth() - d.getMonth()));
};
const monthlyRate = (annualPct) => annualPct / 100 / 12;
function monthlyPayment(principal, annualPct, years) {
  const r = monthlyRate(annualPct), n = years * 12;
  if (principal <= 0) return 0;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}
function remainingBalance(principal, annualPct, years, monthsElapsed) {
  const r = monthlyRate(annualPct), n = years * 12;
  const m = Math.min(monthsElapsed, n);
  if (principal <= 0) return 0;
  const pmt = monthlyPayment(principal, annualPct, years);
  if (r === 0) return Math.max(principal - pmt * m, 0);
  const bal = principal * Math.pow(1 + r, m) - pmt * ((Math.pow(1 + r, m) - 1) / r);
  return Math.max(bal, 0);
}
function splitPI(balancePrior, annualPct, pmt) {
  const r = monthlyRate(annualPct);
  const interest = balancePrior * r;
  const principal = Math.max(pmt - interest, 0);
  return { interest, principal };
}
const uid = () => Math.random().toString(36).slice(2, 10);

/* ============================== SAMPLE DATA ============================== */

function makeProperties() {
  const raw = [
    {
      id: "p1", name: "The Maple Duplex", address: "214 Maple St, Yonkers, NY 10701",
      type: "Duplex", purchaseDate: "2021-06-01", purchasePrice: 480000, currentValue: 560000,
      sqft: 2400, status: "Occupied", lat: 40.9312, lng: -73.899, photo: "duplex",
      loan: { original: 384000, rate: 4.25, term: 30 },
      closingCosts: 9600, renovationCosts: 12000,
      units: [
        { id: "u1a", label: "Unit A", rent: 2100, tenant: "R. Alvarez", leaseStart: "2024-06-01", leaseEnd: "2026-05-31", deposit: 2100, status: "Occupied" },
        { id: "u1b", label: "Unit B", rent: 2000, tenant: "M. Chen", leaseStart: "2025-09-01", leaseEnd: "2026-08-31", deposit: 2000, status: "Occupied" },
      ],
      expenses: { taxes: 640, insurance: 130, hoa: 0, management: 328, maintenance: 180, capex: 150, vacancy: 165, utilities: 90, other: 40 },
    },
    {
      id: "p2", name: "Riverside Triplex", address: "88 Riverside Ave, Yonkers, NY 10703",
      type: "Triplex", purchaseDate: "2022-09-15", purchasePrice: 610000, currentValue: 690000,
      sqft: 3200, status: "Occupied", lat: 40.949, lng: -73.907, photo: "triplex",
      loan: { original: 488000, rate: 5.5, term: 30 },
      closingCosts: 13500, renovationCosts: 22000,
      units: [
        { id: "u2a", label: "Unit 1", rent: 1600, tenant: "D. Okafor", leaseStart: "2025-02-01", leaseEnd: "2026-01-31", deposit: 1600, status: "Occupied" },
        { id: "u2b", label: "Unit 2", rent: 1550, tenant: "L. Petrova", leaseStart: "2025-11-01", leaseEnd: "2026-10-31", deposit: 1550, status: "Occupied" },
        { id: "u2c", label: "Unit 3", rent: 1500, tenant: "J. Kim", leaseStart: "2024-08-01", leaseEnd: "2026-07-31", deposit: 1500, status: "Occupied" },
      ],
      expenses: { taxes: 810, insurance: 165, hoa: 0, management: 372, maintenance: 220, capex: 190, vacancy: 186, utilities: 120, other: 60 },
    },
    {
      id: "p3", name: "Elm Fourplex", address: "1207 Elm Ave, Bronx, NY 10469",
      type: "Fourplex", purchaseDate: "2019-03-01", purchasePrice: 720000, currentValue: 940000,
      sqft: 4800, status: "Partially Occupied", lat: 40.8697, lng: -73.859, photo: "fourplex",
      loan: { original: 576000, rate: 3.75, term: 30 },
      closingCosts: 16200, renovationCosts: 34000,
      units: [
        { id: "u3a", label: "Unit 1", rent: 1400, tenant: "T. Nguyen", leaseStart: "2025-05-01", leaseEnd: "2026-04-30", deposit: 1400, status: "Occupied" },
        { id: "u3b", label: "Unit 2", rent: 1400, tenant: "S. Brown", leaseStart: "2024-12-01", leaseEnd: "2026-11-30", deposit: 1400, status: "Occupied" },
        { id: "u3c", label: "Unit 3", rent: 1450, tenant: "A. Rossi", leaseStart: "2025-01-15", leaseEnd: "2026-01-14", deposit: 1450, status: "Occupied" },
        { id: "u3d", label: "Unit 4", rent: 0, tenant: "—", leaseStart: "", leaseEnd: "", deposit: 0, status: "Vacant" },
      ],
      expenses: { taxes: 980, insurance: 210, hoa: 0, management: 300, maintenance: 260, capex: 220, vacancy: 213, utilities: 150, other: 70 },
    },
    {
      id: "p4", name: "Suburban SFR", address: "56 Birchwood Ln, White Plains, NY 10601",
      type: "Single-family", purchaseDate: "2023-01-10", purchasePrice: 425000, currentValue: 455000,
      sqft: 1800, status: "Occupied", lat: 41.034, lng: -73.763, photo: "sfr",
      loan: { original: 340000, rate: 6.75, term: 30 },
      closingCosts: 8500, renovationCosts: 4000,
      units: [
        { id: "u4a", label: "Whole House", rent: 2600, tenant: "K. Sullivan", leaseStart: "2025-07-01", leaseEnd: "2026-06-30", deposit: 2600, status: "Occupied" },
      ],
      expenses: { taxes: 720, insurance: 105, hoa: 40, management: 208, maintenance: 130, capex: 130, vacancy: 130, utilities: 0, other: 30 },
    },
    {
      id: "p5", name: "Downtown Loft Building", address: "12 Warburton Ave, Yonkers, NY 10701",
      type: "Apartment complex", purchaseDate: "2020-11-01", purchasePrice: 1150000, currentValue: 1400000,
      sqft: 7200, status: "Occupied", lat: 40.9376, lng: -73.899, photo: "apt",
      loan: { original: 862500, rate: 4.5, term: 25 },
      closingCosts: 23000, renovationCosts: 58000,
      units: [
        { id: "u5a", label: "Unit 101", rent: 1750, tenant: "P. Osei", leaseStart: "2025-03-01", leaseEnd: "2026-02-28", deposit: 1750, status: "Occupied" },
        { id: "u5b", label: "Unit 102", rent: 1800, tenant: "H. Grant", leaseStart: "2024-10-01", leaseEnd: "2026-09-30", deposit: 1800, status: "Occupied" },
        { id: "u5c", label: "Unit 201", rent: 1850, tenant: "F. Dubois", leaseStart: "2025-06-01", leaseEnd: "2026-05-31", deposit: 1850, status: "Occupied" },
        { id: "u5d", label: "Unit 202", rent: 1750, tenant: "N. Ibrahim", leaseStart: "2025-09-01", leaseEnd: "2026-08-31", deposit: 1750, status: "Occupied" },
        { id: "u5e", label: "Unit 301", rent: 1900, tenant: "C. Delgado", leaseStart: "2024-11-15", leaseEnd: "2026-11-14", deposit: 1900, status: "Occupied" },
        { id: "u5f", label: "Unit 302", rent: 1950, tenant: "V. Popescu", leaseStart: "2025-04-01", leaseEnd: "2026-03-31", deposit: 1950, status: "Occupied" },
      ],
      expenses: { taxes: 1450, insurance: 340, hoa: 0, management: 878, maintenance: 420, capex: 380, vacancy: 439, utilities: 260, other: 120 },
    },
  ];
  return raw;
}

/* ---- Derived per-property metrics ---- */
function computeProperty(p, refDate = new Date()) {
  const monthsElapsed = monthsBetween(p.purchaseDate, refDate);
  const pmt = monthlyPayment(p.loan.original, p.loan.rate, p.loan.term);
  const balance = remainingBalance(p.loan.original, p.loan.rate, p.loan.term, monthsElapsed);
  const { interest: interestPortion, principal: principalPortion } = splitPI(
    remainingBalance(p.loan.original, p.loan.rate, p.loan.term, Math.max(monthsElapsed - 1, 0)),
    p.loan.rate, pmt
  );
  const downPayment = p.purchasePrice - p.loan.original;
  const totalInitialInvestment = downPayment + p.closingCosts + p.renovationCosts;

  const grossIncome = p.units.reduce((s, u) => s + (u.rent || 0), 0);
  const potentialIncome = p.units.reduce((s, u) => s + (u.rent || (u.status === "Vacant" ? 0 : u.rent)), 0);
  const opEx = Object.values(p.expenses).reduce((s, v) => s + v, 0);
  const noi = grossIncome - opEx;
  const debtService = pmt;
  const cashFlow = noi - debtService;
  const annualCashFlow = cashFlow * 12;
  const capRate = p.currentValue > 0 ? (noi * 12 / p.currentValue) * 100 : 0;
  const cashOnCash = totalInitialInvestment > 0 ? (annualCashFlow / totalInitialInvestment) * 100 : 0;
  const dscr = debtService > 0 ? noi / debtService : 0;
  const equity = p.currentValue - balance;
  const ltv = p.currentValue > 0 ? (balance / p.currentValue) * 100 : 0;
  const equityAtPurchase = downPayment;
  const equityGain = equity - equityAtPurchase;
  const cumulativeCashFlow = cashFlow * monthsElapsed;
  const totalProfit = equityGain + cumulativeCashFlow;
  const roi = totalInitialInvestment > 0 ? (totalProfit / totalInitialInvestment) * 100 : 0;
  const appreciation = p.currentValue - p.purchasePrice;
  const occupancy = p.units.length ? (p.units.filter(u => u.status === "Occupied").length / p.units.length) * 100 : 100;

  return {
    monthsElapsed, monthlyPI: pmt, balance, interestPortion, principalPortion, downPayment,
    totalInitialInvestment, grossIncome, potentialIncome, opEx, noi, debtService, cashFlow,
    annualCashFlow, capRate, cashOnCash, dscr, equity, ltv, equityGain, cumulativeCashFlow,
    totalProfit, roi, appreciation, occupancy,
  };
}

function usePortfolio() {
  const [properties] = useState(makeProperties);
  const refDate = useMemo(() => new Date(), []);
  const computed = useMemo(() => {
    const map = {};
    properties.forEach(p => { map[p.id] = computeProperty(p, refDate); });
    return map;
  }, [properties, refDate]);

  const totals = useMemo(() => {
    let value = 0, equity = 0, debt = 0, income = 0, expenses = 0, cashFlow = 0,
      invested = 0, noi = 0, units = 0, occUnits = 0, appreciation = 0;
    properties.forEach(p => {
      const c = computed[p.id];
      value += p.currentValue; equity += c.equity; debt += c.balance;
      income += c.grossIncome; expenses += c.opEx + c.debtService; cashFlow += c.cashFlow;
      invested += c.totalInitialInvestment; noi += c.noi; appreciation += c.appreciation;
      units += p.units.length; occUnits += p.units.filter(u => u.status === "Occupied").length;
    });
    const capRate = value > 0 ? (noi * 12 / value) * 100 : 0;
    const cashOnCash = invested > 0 ? (cashFlow * 12 / invested) * 100 : 0;
    const roiSum = properties.reduce((s, p) => s + computed[p.id].totalProfit, 0);
    const roi = invested > 0 ? (roiSum / invested) * 100 : 0;
    return {
      value, equity, debt, income, expenses, cashFlow, annualCashFlow: cashFlow * 12,
      invested, noi, capRate, cashOnCash, roi, units, occUnits,
      occupancy: units ? (occUnits / units) * 100 : 100, appreciation,
      dte: equity > 0 ? debt / equity : 0, ltv: value > 0 ? (debt / value) * 100 : 0,
      availableEquity75: Math.max(properties.reduce((s, p) => s + Math.max(p.currentValue * 0.75 - computed[p.id].balance, 0), 0), 0),
    };
  }, [properties, computed]);

  return { properties, computed, totals };
}

/* Synthetic 24-month history for charts */
function useHistory(properties, computed) {
  return useMemo(() => {
    const months = 24;
    const now = new Date();
    const series = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      let value = 0, debt = 0, equity = 0, income = 0, expenses = 0;
      properties.forEach(p => {
        const purchased = new Date(p.purchaseDate);
        if (purchased > d) return;
        const elapsedAtD = monthsBetween(p.purchaseDate, d);
        const totalElapsed = monthsBetween(p.purchaseDate, now) || 1;
        const frac = Math.min(elapsedAtD / Math.max(totalElapsed, 1), 1);
        const v = p.purchasePrice + (p.currentValue - p.purchasePrice) * frac;
        const bal = remainingBalance(p.loan.original, p.loan.rate, p.loan.term, elapsedAtD);
        value += v; debt += bal; equity += v - bal;
        const c = computed[p.id];
        income += c.grossIncome * (0.94 + 0.06 * Math.sin(i * 0.6 + p.id.length));
        expenses += (c.opEx + c.debtService) * (0.97 + 0.03 * Math.cos(i * 0.5 + p.id.length));
      });
      series.push({
        month: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        value: Math.round(value), debt: Math.round(debt), equity: Math.round(equity),
        income: Math.round(income), expenses: Math.round(expenses),
        cashFlow: Math.round(income - expenses),
      });
    }
    return series;
  }, [properties, computed]);
}

/* ============================== SMALL UI PRIMITIVES ============================== */

function Panel({ children, style, className = "", theme }) {
  return (
    <div className={className} style={{ background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 14, ...style }}>
      {children}
    </div>
  );
}

function SectionLabel({ children, theme }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "28px 0 14px" }}>
      <span style={{ fontFamily: "Fraunces, serif", fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase", color: theme.brass, fontWeight: 600 }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: `repeating-linear-gradient(90deg, ${theme.borderStrong} 0 6px, transparent 6px 11px)` }} />
    </div>
  );
}

function MetricCard({ label, value, sub, trend, icon: Icon, theme, accent }) {
  const positive = trend !== undefined && trend >= 0;
  return (
    <Panel theme={theme} style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11.5, letterSpacing: "0.06em", textTransform: "uppercase", color: theme.textFaint, fontWeight: 600 }}>{label}</span>
        {Icon && <Icon size={15} color={accent || theme.brass} strokeWidth={2} />}
      </div>
      <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 22, fontWeight: 600, color: theme.text, lineHeight: 1.1 }}>{value}</div>
      {(sub || trend !== undefined) && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: trend !== undefined ? (positive ? theme.positive : theme.negative) : theme.textDim }}>
          {trend !== undefined && (positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />)}
          <span>{sub}</span>
        </div>
      )}
    </Panel>
  );
}

function Pill({ children, tone = "neutral", theme }) {
  const map = {
    positive: { bg: theme.positive + "22", color: theme.positive },
    negative: { bg: theme.negative + "22", color: theme.negative },
    warning: { bg: theme.warning + "26", color: theme.warning },
    neutral: { bg: theme.chip, color: theme.textDim },
    brass: { bg: theme.brass + "22", color: theme.brassSoft },
  };
  const s = map[tone];
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 999, letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function StatusPill({ status, theme }) {
  const tone = status === "Occupied" ? "positive" : status === "Vacant" ? "negative" : status === "Partially Occupied" ? "warning" : "neutral";
  return <Pill tone={tone} theme={theme}>{status}</Pill>;
}

function Field({ label, children, theme, hint }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, color: theme.textDim, fontWeight: 500 }}>
      <span style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{label}</span>
        {hint && <span style={{ color: theme.textFaint, fontWeight: 400 }}>{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function inputStyle(theme) {
  return {
    background: theme.bgElev, border: `1px solid ${theme.border}`, borderRadius: 8,
    padding: "8px 10px", color: theme.text, fontSize: 13.5, fontFamily: "IBM Plex Mono, monospace",
    outline: "none", width: "100%", boxSizing: "border-box",
  };
}

function NumInput({ value, onChange, theme, prefix, suffix, step = 1 }) {
  return (
    <div style={{ position: "relative" }}>
      {prefix && <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: theme.textFaint, fontSize: 13 }}>{prefix}</span>}
      <input type="number" step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        style={{ ...inputStyle(theme), paddingLeft: prefix ? 20 : 10, paddingRight: suffix ? 26 : 10 }} />
      {suffix && <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: theme.textFaint, fontSize: 12 }}>{suffix}</span>}
    </div>
  );
}

function Slider({ value, onChange, min, max, step, theme }) {
  return (
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(parseFloat(e.target.value))}
      style={{ width: "100%", accentColor: theme.brass }} />
  );
}

function CashFlowBadge({ cashFlow, theme }) {
  if (cashFlow > 50) return <Pill tone="positive" theme={theme}>🟢 Positive Cash Flow</Pill>;
  if (cashFlow < -50) return <Pill tone="negative" theme={theme}>🔴 Negative Cash Flow</Pill>;
  return <Pill tone="warning" theme={theme}>🟡 Break-Even</Pill>;
}

/* ============================== CHART HELPERS ============================== */

function chartAxisProps(theme) {
  return {
    stroke: theme.textFaint,
    tick: { fill: theme.textFaint, fontSize: 11, fontFamily: "Inter, sans-serif" },
    tickLine: false, axisLine: { stroke: theme.border },
  };
}
function ChartTooltip({ theme, formatter }) {
  return (
    <Tooltip
      formatter={formatter}
      contentStyle={{ background: theme.bgElev, border: `1px solid ${theme.borderStrong}`, borderRadius: 10, fontSize: 12.5, fontFamily: "Inter, sans-serif", color: theme.text }}
      labelStyle={{ color: theme.textDim, marginBottom: 4 }}
      itemStyle={{ color: theme.text }}
    />
  );
}

/* ============================== NAV ============================== */

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "properties", label: "Properties", icon: Building2 },
  { id: "map", label: "Map", icon: MapIcon },
  { id: "cashflow", label: "Cash Flow", icon: Wallet },
  { id: "debt", label: "Debt", icon: Landmark },
  { id: "equity", label: "Equity", icon: PiggyBank },
  { id: "buys", label: "Suggested Buys", icon: Target },
  { id: "analyzer", label: "Deal Analyzer", icon: Calculator },
  { id: "strategy", label: "Strategy Lab", icon: FlaskConical },
  { id: "growth", label: "Growth Planner", icon: TrendingUp },
  { id: "advisor", label: "Advisor", icon: Sparkles },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

/* ============================== MAIN APP ============================== */

export default function App() {
  const [mode, setMode] = useState("dark");
  const theme = THEMES[mode];
  const [view, setView] = useState("dashboard");
  const [selectedId, setSelectedId] = useState(null);
  const [navOpen, setNavOpen] = useState(true);

  const { properties, computed, totals } = usePortfolio();
  const history = useHistory(properties, computed);

  const alerts = useMemo(() => buildAlerts(properties, computed), [properties, computed]);

  const goProperty = (id) => { setSelectedId(id); setView("property-detail"); };

  return (
    <div style={{
      fontFamily: "Inter, sans-serif", background: theme.bg, color: theme.text,
      minHeight: "100%", display: "flex", position: "relative", isolation: "isolate",
    }}>
      <style>{`
        @import url('${FONT_LINK}');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 8px; }
        input[type=range] { height: 4px; border-radius: 4px; }
        .navitem { transition: background .15s ease, color .15s ease; cursor: pointer; }
        .navitem:hover { background: ${theme.panelSoft}; }
        .card-hover { transition: transform .15s ease, border-color .15s ease; }
        .card-hover:hover { transform: translateY(-2px); border-color: ${theme.borderStrong}; }
        .deed-corner { position: relative; overflow: hidden; }
        .deed-corner::after {
          content: ""; position: absolute; top: 0; right: 0; width: 26px; height: 26px;
          background: linear-gradient(135deg, transparent 50%, ${theme.brass}22 50%);
        }
        button { font-family: inherit; }
        .btn-primary { background: ${theme.brass}; color: ${mode === "dark" ? "#1B2420" : "#fff"}; border: none; border-radius: 9px; padding: 9px 16px; font-weight: 700; font-size: 13px; cursor: pointer; letter-spacing: .01em; }
        .btn-primary:hover { background: ${theme.brassSoft}; }
        .btn-ghost { background: transparent; color: ${theme.textDim}; border: 1px solid ${theme.border}; border-radius: 9px; padding: 8px 14px; font-size: 13px; cursor: pointer; }
        .btn-ghost:hover { border-color: ${theme.borderStrong}; color: ${theme.text}; }
        .tab-btn { background: transparent; border: 1px solid ${theme.border}; color: ${theme.textDim}; padding: 7px 13px; border-radius: 8px; font-size: 12.5px; cursor: pointer; font-weight: 600; }
        .tab-btn.active { background: ${theme.brass}; color: ${mode === "dark" ? "#1B2420" : "#fff"}; border-color: ${theme.brass}; }
      `}</style>

      {/* SIDEBAR */}
      <div style={{
        width: navOpen ? 224 : 66, flexShrink: 0, background: theme.bgElev, borderRight: `1px solid ${theme.border}`,
        display: "flex", flexDirection: "column", transition: "width .18s ease", position: "sticky", top: 0, height: "100vh", zIndex: 5,
      }}>
        <div style={{ padding: "20px 18px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${theme.border}` }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: theme.brass, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Home size={16} color={mode === "dark" ? "#1B2420" : "#fff"} />
          </div>
          {navOpen && <div style={{ fontFamily: "Fraunces, serif", fontWeight: 600, fontSize: 16.5, letterSpacing: "0.01em" }}>Ledgerstone</div>}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map(n => {
            const active = view === n.id || (n.id === "properties" && view === "property-detail");
            return (
              <div key={n.id} className="navitem" onClick={() => setView(n.id)} style={{
                display: "flex", alignItems: "center", gap: 11, padding: "9px 10px", borderRadius: 9,
                background: active ? theme.panelSoft : "transparent", color: active ? theme.brassSoft : theme.textDim,
              }}>
                <n.icon size={16.5} strokeWidth={2} style={{ flexShrink: 0 }} />
                {navOpen && <span style={{ fontSize: 13.3, fontWeight: active ? 700 : 500 }}>{n.label}</span>}
              </div>
            );
          })}
        </div>
        <div style={{ padding: 12, borderTop: `1px solid ${theme.border}` }}>
          <div className="navitem" onClick={() => setNavOpen(v => !v)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 9, color: theme.textFaint }}>
            {navOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            {navOpen && <span style={{ fontSize: 12.5 }}>Collapse</span>}
          </div>
        </div>
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <TopBar theme={theme} mode={mode} setMode={setMode} alerts={alerts} totals={totals} view={view} />
        <div style={{ padding: "24px 30px 60px", maxWidth: 1360, width: "100%", margin: "0 auto" }}>
          {view === "dashboard" && <Dashboard theme={theme} properties={properties} computed={computed} totals={totals} history={history} alerts={alerts} goProperty={goProperty} />}
          {view === "properties" && <PropertiesView theme={theme} properties={properties} computed={computed} goProperty={goProperty} />}
          {view === "property-detail" && <PropertyDetail theme={theme} property={properties.find(p => p.id === selectedId) || properties[0]} computed={computed} history={history} back={() => setView("properties")} />}
          {view === "map" && <MapView theme={theme} properties={properties} computed={computed} goProperty={goProperty} />}
          {view === "cashflow" && <CashFlowView theme={theme} properties={properties} computed={computed} totals={totals} history={history} />}
          {view === "debt" && <DebtView theme={theme} properties={properties} computed={computed} totals={totals} history={history} />}
          {view === "equity" && <EquityView theme={theme} properties={properties} computed={computed} totals={totals} />}
          {view === "buys" && <SuggestedBuys theme={theme} />}
          {view === "analyzer" && <DealAnalyzer theme={theme} />}
          {view === "strategy" && <StrategyLab theme={theme} totals={totals} />}
          {view === "growth" && <GrowthPlanner theme={theme} totals={totals} properties={properties} />}
          {view === "advisor" && <Advisor theme={theme} properties={properties} computed={computed} totals={totals} />}
          {view === "reports" && <Reports theme={theme} properties={properties} computed={computed} totals={totals} />}
          {view === "settings" && <SettingsView theme={theme} mode={mode} setMode={setMode} />}
        </div>
      </div>
    </div>
  );
}

/* ============================== ALERTS ============================== */

function buildAlerts(properties, computed) {
  const alerts = [];
  const now = new Date();
  properties.forEach(p => {
    const c = computed[p.id];
    p.units.forEach(u => {
      if (u.leaseEnd) {
        const days = (new Date(u.leaseEnd) - now) / 86400000;
        if (days > 0 && days < 75) alerts.push({ type: "lease", severity: "warning", text: `${u.label} at ${p.name} — lease ends ${new Date(u.leaseEnd).toLocaleDateString()}`, propertyId: p.id });
      }
      if (u.status === "Vacant") alerts.push({ type: "vacancy", severity: "negative", text: `Vacant unit: ${u.label} at ${p.name}`, propertyId: p.id });
    });
    if (c.cashFlow < 0) alerts.push({ type: "cashflow", severity: "negative", text: `${p.name} is running negative cash flow (${fmtUSD(c.cashFlow)}/mo)`, propertyId: p.id });
    if (c.ltv > 78) alerts.push({ type: "ltv", severity: "warning", text: `${p.name} LTV is elevated at ${fmtPct(c.ltv)}`, propertyId: p.id });
    if (p.loan.rate <= 4.0) alerts.push({ type: "refi-hold", severity: "neutral", text: `${p.name} has a favorable ${fmtPct(p.loan.rate)} rate — good candidate to hold`, propertyId: p.id });
    if (p.loan.rate >= 6.5) alerts.push({ type: "refi-opp", severity: "warning", text: `${p.name} rate is ${fmtPct(p.loan.rate)} — consider refinancing if rates drop`, propertyId: p.id });
  });
  return alerts;
}

/* ============================== TOP BAR ============================== */

function TopBar({ theme, mode, setMode, alerts, totals, view }) {
  const [bellOpen, setBellOpen] = useState(false);
  const titleMap = Object.fromEntries(NAV.map(n => [n.id, n.label]));
  const title = view === "property-detail" ? "Property Detail" : (titleMap[view] || "Dashboard");
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 4, background: theme.bg + "F2", backdropFilter: "blur(8px)",
      borderBottom: `1px solid ${theme.border}`, padding: "16px 30px", display: "flex", alignItems: "center", justifyContent: "space-between",
    }}>
      <div>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: 21, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 12, color: theme.textFaint, marginTop: 2 }}>
          Portfolio value {fmtUSD(totals.value, { compact: true })} · Net cash flow {fmtUSD(totals.cashFlow)}/mo
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
        <div onClick={() => setBellOpen(v => !v)} style={{
          width: 36, height: 36, borderRadius: 9, border: `1px solid ${theme.border}`, display: "flex", alignItems: "center",
          justifyContent: "center", cursor: "pointer", position: "relative", background: theme.panel,
        }}>
          <Bell size={16} color={theme.textDim} />
          {alerts.length > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: theme.negative, color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 999, minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{alerts.length}</span>}
        </div>
        {bellOpen && (
          <div style={{ position: "absolute", top: 44, right: 46, width: 320, maxHeight: 380, overflowY: "auto", background: theme.panel, border: `1px solid ${theme.borderStrong}`, borderRadius: 12, padding: 10, boxShadow: "0 12px 30px rgba(0,0,0,0.35)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: theme.textDim, padding: "4px 6px 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Alerts & Dates</div>
            {alerts.length === 0 && <div style={{ padding: 10, fontSize: 13, color: theme.textFaint }}>All clear — nothing needs attention.</div>}
            {alerts.map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 8, padding: "8px 6px", borderTop: i ? `1px solid ${theme.border}` : "none" }}>
                {a.severity === "negative" ? <AlertTriangle size={14} color={theme.negative} style={{ marginTop: 2, flexShrink: 0 }} /> :
                 a.severity === "warning" ? <Clock size={14} color={theme.warning} style={{ marginTop: 2, flexShrink: 0 }} /> :
                 <Info size={14} color={theme.textFaint} style={{ marginTop: 2, flexShrink: 0 }} />}
                <span style={{ fontSize: 12.5, color: theme.textDim, lineHeight: 1.4 }}>{a.text}</span>
              </div>
            ))}
          </div>
        )}
        <div onClick={() => setMode(m => m === "dark" ? "light" : "dark")} style={{
          width: 36, height: 36, borderRadius: 9, border: `1px solid ${theme.border}`, display: "flex", alignItems: "center",
          justifyContent: "center", cursor: "pointer", background: theme.panel,
        }}>
          {mode === "dark" ? <Sun size={16} color={theme.textDim} /> : <Moon size={16} color={theme.textDim} />}
        </div>
      </div>
    </div>
  );
}

/* ============================== DASHBOARD ============================== */

function Dashboard({ theme, properties, computed, totals, history, alerts, goProperty }) {
  const expenseBreakdown = useMemo(() => {
    const cats = { Taxes: 0, Insurance: 0, Management: 0, Maintenance: 0, CapEx: 0, Utilities: 0, Debt: 0, Other: 0 };
    properties.forEach(p => {
      const c = computed[p.id];
      cats.Taxes += p.expenses.taxes; cats.Insurance += p.expenses.insurance;
      cats.Management += p.expenses.management; cats.Maintenance += p.expenses.maintenance;
      cats.CapEx += p.expenses.capex; cats.Utilities += p.expenses.utilities;
      cats.Debt += c.debtService; cats.Other += p.expenses.other + p.expenses.hoa + p.expenses.vacancy;
    });
    return Object.entries(cats).map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [properties, computed]);

  const perfData = properties.map(p => ({ name: p.name.split(" ")[0], coc: +computed[p.id].cashOnCash.toFixed(1), cap: +computed[p.id].capRate.toFixed(1) }));

  const pieColors = [theme.brass, theme.positive, "#8B6FCF", theme.warning, "#5FA8D3", theme.negative, theme.textFaint, theme.brassSoft];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <MetricCard theme={theme} label="Portfolio Value" value={fmtUSD(totals.value, { compact: true })} sub={`${fmtUSD(totals.appreciation, { compact: true })} appreciation`} trend={1} icon={Building2} />
        <MetricCard theme={theme} label="Total Equity" value={fmtUSD(totals.equity, { compact: true })} sub={`LTV ${fmtPct(totals.ltv)}`} icon={PiggyBank} />
        <MetricCard theme={theme} label="Total Debt" value={fmtUSD(totals.debt, { compact: true })} sub={`D/E ${totals.dte.toFixed(2)}`} icon={Landmark} />
        <MetricCard theme={theme} label="Net Monthly Cash Flow" value={fmtUSD(totals.cashFlow)} sub={`${fmtUSD(totals.annualCashFlow, { compact: true })}/yr`} trend={totals.cashFlow >= 0 ? 1 : -1} icon={Wallet} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginTop: 14 }}>
        <MetricCard theme={theme} label="Portfolio Cash-on-Cash" value={fmtPct(totals.cashOnCash)} icon={DollarSign} />
        <MetricCard theme={theme} label="Portfolio ROI" value={fmtPct(totals.roi)} icon={TrendingUp} />
        <MetricCard theme={theme} label="Avg Cap Rate" value={fmtPct(totals.capRate)} icon={Percent} />
        <MetricCard theme={theme} label="Available Equity (75% LTV)" value={fmtUSD(totals.availableEquity75, { compact: true })} icon={Sparkles} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginTop: 14 }}>
        <MetricCard theme={theme} label="Properties" value={properties.length} />
        <MetricCard theme={theme} label="Total Units" value={totals.units} />
        <MetricCard theme={theme} label="Avg Occupancy" value={fmtPct(totals.occupancy)} />
        <MetricCard theme={theme} label="Monthly Expenses" value={fmtUSD(totals.expenses)} />
      </div>

      <SectionLabel theme={theme}>Portfolio Value & Equity — 24 Months</SectionLabel>
      <Panel theme={theme} style={{ padding: 18, height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history}>
            <defs>
              <linearGradient id="valGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={theme.brass} stopOpacity={0.4} />
                <stop offset="100%" stopColor={theme.brass} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={theme.positive} stopOpacity={0.35} />
                <stop offset="100%" stopColor={theme.positive} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={theme.border} vertical={false} />
            <XAxis dataKey="month" {...chartAxisProps(theme)} interval={2} />
            <YAxis {...chartAxisProps(theme)} tickFormatter={v => fmtUSD(v, { compact: true })} width={56} />
            <ChartTooltip theme={theme} formatter={(v) => fmtUSD(v)} />
            <Area type="monotone" dataKey="value" name="Portfolio Value" stroke={theme.brass} fill="url(#valGrad)" strokeWidth={2} />
            <Area type="monotone" dataKey="equity" name="Equity" stroke={theme.positive} fill="url(#eqGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 14, marginTop: 20 }}>
        <div>
          <SectionLabel theme={theme}>Monthly Cash Flow Trend</SectionLabel>
          <Panel theme={theme} style={{ padding: 18, height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={history.slice(-12)}>
                <CartesianGrid stroke={theme.border} vertical={false} />
                <XAxis dataKey="month" {...chartAxisProps(theme)} />
                <YAxis {...chartAxisProps(theme)} tickFormatter={v => fmtUSD(v, { compact: true })} width={56} />
                <ChartTooltip theme={theme} formatter={(v) => fmtUSD(v)} />
                <Bar dataKey="cashFlow" name="Cash Flow" radius={[4, 4, 0, 0]}>
                  {history.slice(-12).map((d, i) => <Cell key={i} fill={d.cashFlow >= 0 ? theme.positive : theme.negative} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </div>
        <div>
          <SectionLabel theme={theme}>Expense Breakdown</SectionLabel>
          <Panel theme={theme} style={{ padding: 18, height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={expenseBreakdown} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2}>
                  {expenseBreakdown.map((e, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
                </Pie>
                <ChartTooltip theme={theme} formatter={(v) => fmtUSD(v)} />
                <Legend wrapperStyle={{ fontSize: 11, color: theme.textDim }} />
              </PieChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      </div>

      <SectionLabel theme={theme}>Property Performance</SectionLabel>
      <Panel theme={theme} style={{ padding: 18, height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={perfData}>
            <CartesianGrid stroke={theme.border} vertical={false} />
            <XAxis dataKey="name" {...chartAxisProps(theme)} />
            <YAxis {...chartAxisProps(theme)} tickFormatter={v => v + "%"} width={44} />
            <ChartTooltip theme={theme} formatter={(v) => v + "%"} />
            <Legend wrapperStyle={{ fontSize: 11.5, color: theme.textDim }} />
            <Bar dataKey="coc" name="Cash-on-Cash" fill={theme.brass} radius={[4, 4, 0, 0]} />
            <Bar dataKey="cap" name="Cap Rate" fill={theme.positive} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <SectionLabel theme={theme}>Portfolio at a Glance</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {properties.map(p => {
          const c = computed[p.id];
          return (
            <Panel key={p.id} theme={theme} className="card-hover deed-corner" style={{ padding: 16, cursor: "pointer" }}>
              <div onClick={() => goProperty(p.id)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ fontFamily: "Fraunces, serif", fontSize: 15.5, fontWeight: 600 }}>{p.name}</div>
                  <StatusPill status={p.status} theme={theme} />
                </div>
                <div style={{ fontSize: 12, color: theme.textFaint, marginTop: 3 }}>{p.address}</div>
                <div style={{ display: "flex", gap: 16, marginTop: 12, fontFamily: "IBM Plex Mono, monospace" }}>
                  <div>
                    <div style={{ fontSize: 10.5, color: theme.textFaint, textTransform: "uppercase" }}>Cash Flow</div>
                    <div style={{ fontSize: 14.5, fontWeight: 600, color: c.cashFlow >= 0 ? theme.positive : theme.negative }}>{fmtUSD(c.cashFlow)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: theme.textFaint, textTransform: "uppercase" }}>Cap Rate</div>
                    <div style={{ fontSize: 14.5, fontWeight: 600 }}>{fmtPct(c.capRate)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: theme.textFaint, textTransform: "uppercase" }}>Equity</div>
                    <div style={{ fontSize: 14.5, fontWeight: 600 }}>{fmtUSD(c.equity, { compact: true })}</div>
                  </div>
                </div>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

/* ============================== PROPERTIES ============================== */

function PropertiesView({ theme, properties, computed, goProperty }) {
  const [query, setQuery] = useState("");
  const filtered = properties.filter(p => p.name.toLowerCase().includes(query.toLowerCase()) || p.address.toLowerCase().includes(query.toLowerCase()));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 340 }}>
          <Search size={15} color={theme.textFaint} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }} />
          <input placeholder="Search properties or address…" value={query} onChange={e => setQuery(e.target.value)}
            style={{ ...inputStyle(theme), fontFamily: "Inter, sans-serif", paddingLeft: 34 }} />
        </div>
        <button className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }}><Plus size={15} /> Add Property</button>
      </div>

      <Panel theme={theme} style={{ overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 0.9fr 0.9fr 0.9fr 0.9fr 0.9fr", padding: "12px 18px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: theme.textFaint, fontWeight: 700, borderBottom: `1px solid ${theme.border}` }}>
          <div>Property</div><div>Status</div><div>Value</div><div>Cash Flow</div><div>Cap Rate</div><div>CoC</div><div>DSCR</div>
        </div>
        {filtered.map(p => {
          const c = computed[p.id];
          return (
            <div key={p.id} onClick={() => goProperty(p.id)} className="navitem" style={{
              display: "grid", gridTemplateColumns: "2fr 1fr 0.9fr 0.9fr 0.9fr 0.9fr 0.9fr", padding: "14px 18px",
              borderBottom: `1px solid ${theme.border}`, alignItems: "center", fontFamily: "IBM Plex Mono, monospace", fontSize: 13,
            }}>
              <div style={{ fontFamily: "Inter, sans-serif" }}>
                <div style={{ fontWeight: 700, fontFamily: "Fraunces, serif", fontSize: 14.5 }}>{p.name}</div>
                <div style={{ fontSize: 11.5, color: theme.textFaint, fontFamily: "Inter, sans-serif" }}>{p.type} · {p.units.length} unit{p.units.length > 1 ? "s" : ""}</div>
              </div>
              <div><StatusPill status={p.status} theme={theme} /></div>
              <div>{fmtUSD(p.currentValue, { compact: true })}</div>
              <div style={{ color: c.cashFlow >= 0 ? theme.positive : theme.negative, fontWeight: 600 }}>{fmtUSD(c.cashFlow)}</div>
              <div>{fmtPct(c.capRate)}</div>
              <div>{fmtPct(c.cashOnCash)}</div>
              <div>{c.dscr.toFixed(2)}x</div>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}

/* ============================== PROPERTY DETAIL ============================== */

function PropertyDetail({ theme, property: p, computed, history, back }) {
  const c = computed[p.id];
  const flowSteps = [
    { label: "Gross Income", value: c.grossIncome, color: theme.brass },
    { label: "Operating Expenses", value: -c.opEx, color: theme.negative },
    { label: "NOI", value: c.noi, color: theme.brassSoft, strong: true },
    { label: "Debt Service", value: -c.debtService, color: theme.negative },
    { label: "Net Cash Flow", value: c.cashFlow, color: c.cashFlow >= 0 ? theme.positive : theme.negative, strong: true },
  ];
  return (
    <div>
      <div onClick={back} style={{ display: "flex", alignItems: "center", gap: 6, color: theme.textDim, fontSize: 13, cursor: "pointer", marginBottom: 16 }}>
        <ChevronLeft size={15} /> Back to Properties
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 600 }}>{p.name}</div>
            <StatusPill status={p.status} theme={theme} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: theme.textFaint, fontSize: 13, marginTop: 4 }}>
            <MapPin size={13} /> {p.address}
          </div>
        </div>
        <CashFlowBadge cashFlow={c.cashFlow} theme={theme} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginTop: 20 }}>
        <MetricCard theme={theme} label="Current Value" value={fmtUSD(p.currentValue, { compact: true })} sub={`Purchased ${fmtUSD(p.purchasePrice, { compact: true })}`} icon={Building2} />
        <MetricCard theme={theme} label="Equity" value={fmtUSD(c.equity, { compact: true })} sub={`LTV ${fmtPct(c.ltv)}`} icon={PiggyBank} />
        <MetricCard theme={theme} label="Mortgage Balance" value={fmtUSD(c.balance, { compact: true })} sub={`${fmtPct(p.loan.rate, 2)} · ${p.loan.term}yr`} icon={Landmark} />
        <MetricCard theme={theme} label="Monthly Cash Flow" value={fmtUSD(c.cashFlow)} sub={`${fmtUSD(c.annualCashFlow, { compact: true })}/yr`} trend={c.cashFlow >= 0 ? 1 : -1} icon={Wallet} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginTop: 14 }}>
        <MetricCard theme={theme} label="Cap Rate" value={fmtPct(c.capRate)} />
        <MetricCard theme={theme} label="Cash-on-Cash Return" value={fmtPct(c.cashOnCash)} />
        <MetricCard theme={theme} label="ROI Since Purchase" value={fmtPct(c.roi)} />
        <MetricCard theme={theme} label="DSCR" value={c.dscr.toFixed(2) + "x"} />
      </div>

      <SectionLabel theme={theme}>Income → Expenses → Debt → Cash Flow</SectionLabel>
      <Panel theme={theme} style={{ padding: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {flowSteps.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 170, fontSize: 12.5, color: theme.textDim, fontWeight: s.strong ? 700 : 500 }}>{s.label}</div>
              <div style={{ flex: 1, height: 10, background: theme.chip, borderRadius: 6, overflow: "hidden", position: "relative" }}>
                <div style={{ width: `${Math.min(Math.abs(s.value) / c.grossIncome * 100, 100)}%`, height: "100%", background: s.color, borderRadius: 6 }} />
              </div>
              <div style={{ width: 100, textAlign: "right", fontFamily: "IBM Plex Mono, monospace", fontWeight: s.strong ? 700 : 500, fontSize: 13.5, color: s.value < 0 ? theme.negative : theme.text }}>
                {fmtUSD(s.value)}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
        <div>
          <SectionLabel theme={theme}>Since Purchase</SectionLabel>
          <Panel theme={theme} style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            <Row theme={theme} label="Appreciation" value={fmtUSD(c.appreciation)} positive={c.appreciation >= 0} />
            <Row theme={theme} label="Equity Growth" value={fmtUSD(c.equityGain)} positive={c.equityGain >= 0} />
            <Row theme={theme} label="Mortgage Principal Reduction" value={fmtUSD(p.loan.original - c.balance)} positive />
            <Row theme={theme} label="Total Cash Invested" value={fmtUSD(c.totalInitialInvestment)} />
            <Row theme={theme} label="Total Cash Returned (cumulative CF)" value={fmtUSD(c.cumulativeCashFlow)} positive={c.cumulativeCashFlow >= 0} />
            <Row theme={theme} label="Total Profit" value={fmtUSD(c.totalProfit)} positive={c.totalProfit >= 0} strong />
          </Panel>
        </div>
        <div>
          <SectionLabel theme={theme}>Units</SectionLabel>
          <Panel theme={theme} style={{ overflow: "hidden" }}>
            {p.units.map((u, i) => (
              <div key={u.id} style={{ padding: "12px 16px", borderBottom: i < p.units.length - 1 ? `1px solid ${theme.border}` : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{u.label}</div>
                  <div style={{ fontSize: 11.5, color: theme.textFaint }}>{u.tenant} {u.leaseEnd && `· lease ends ${new Date(u.leaseEnd).toLocaleDateString()}`}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "IBM Plex Mono, monospace", fontWeight: 600 }}>{fmtUSD(u.rent)}/mo</div>
                  <StatusPill status={u.status} theme={theme} />
                </div>
              </div>
            ))}
          </Panel>
        </div>
      </div>

      <SectionLabel theme={theme}>Value & Equity History</SectionLabel>
      <Panel theme={theme} style={{ padding: 18, height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history}>
            <CartesianGrid stroke={theme.border} vertical={false} />
            <XAxis dataKey="month" {...chartAxisProps(theme)} interval={2} />
            <YAxis {...chartAxisProps(theme)} tickFormatter={v => fmtUSD(v, { compact: true })} width={56} />
            <ChartTooltip theme={theme} formatter={v => fmtUSD(v)} />
            <Line type="monotone" dataKey="value" stroke={theme.brass} strokeWidth={2} dot={false} name="Portfolio Value (proxy)" />
          </LineChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}

function Row({ theme, label, value, positive, strong }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 10, borderBottom: `1px solid ${theme.border}` }}>
      <span style={{ fontSize: 13, color: theme.textDim, fontWeight: strong ? 700 : 500 }}>{label}</span>
      <span style={{ fontFamily: "IBM Plex Mono, monospace", fontWeight: strong ? 700 : 600, fontSize: 14, color: positive === undefined ? theme.text : (positive ? theme.positive : theme.negative) }}>{value}</span>
    </div>
  );
}

/* ============================== MAP ============================== */

function MapView({ theme, properties, computed, goProperty }) {
  const [filterType, setFilterType] = useState("All");
  const [active, setActive] = useState(null);
  const types = ["All", ...Array.from(new Set(properties.map(p => p.type)))];
  const filtered = properties.filter(p => filterType === "All" || p.type === filterType);

  const lats = properties.map(p => p.lat), lngs = properties.map(p => p.lng);
  const minLat = Math.min(...lats) - 0.02, maxLat = Math.max(...lats) + 0.02;
  const minLng = Math.min(...lngs) - 0.02, maxLng = Math.max(...lngs) + 0.02;
  const project = (lat, lng) => ({
    x: ((lng - minLng) / (maxLng - minLng)) * 640 + 20,
    y: (1 - (lat - minLat) / (maxLat - minLat)) * 380 + 20,
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {types.map(t => (
          <button key={t} className={`tab-btn ${filterType === t ? "active" : ""}`} onClick={() => setFilterType(t)}>{t}</button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16 }}>
        <Panel theme={theme} style={{ padding: 14, position: "relative" }}>
          <svg viewBox="0 0 680 420" width="100%" height="440" style={{ background: `linear-gradient(180deg, ${theme.bgElev}, ${theme.panelSoft})`, borderRadius: 10 }}>
            <defs>
              <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M 24 0 L 0 0 0 24" fill="none" stroke={theme.border} strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="680" height="420" fill="url(#grid)" />
            {filtered.map(p => {
              const { x, y } = project(p.lat, p.lng);
              const c = computed[p.id];
              const color = c.cashFlow >= 0 ? theme.positive : theme.negative;
              return (
                <g key={p.id} onClick={() => setActive(p.id === active ? null : p.id)} style={{ cursor: "pointer" }}>
                  <circle cx={x} cy={y} r={active === p.id ? 12 : 9} fill={color} fillOpacity={0.25} stroke={color} strokeWidth={2} />
                  <circle cx={x} cy={y} r={3.5} fill={color} />
                  <text x={x + 14} y={y + 4} fontSize="11" fill={theme.textDim} fontFamily="Inter, sans-serif">{p.name.split(" ")[0]}</text>
                </g>
              );
            })}
          </svg>
          {active && (() => {
            const p = properties.find(pp => pp.id === active); const c = computed[p.id];
            return (
              <div style={{ position: "absolute", bottom: 24, left: 24, background: theme.panel, border: `1px solid ${theme.borderStrong}`, borderRadius: 12, padding: 14, width: 250, boxShadow: "0 10px 24px rgba(0,0,0,.3)" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }}>{p.name}</div>
                  <X size={14} color={theme.textFaint} style={{ cursor: "pointer" }} onClick={() => setActive(null)} />
                </div>
                <div style={{ fontSize: 11.5, color: theme.textFaint, marginBottom: 8 }}>{p.address}</div>
                <Row theme={theme} label="Value" value={fmtUSD(p.currentValue, { compact: true })} />
                <Row theme={theme} label="Monthly Rent" value={fmtUSD(c.grossIncome)} />
                <Row theme={theme} label="Cash Flow" value={fmtUSD(c.cashFlow)} positive={c.cashFlow >= 0} />
                <Row theme={theme} label="Cap Rate" value={fmtPct(c.capRate)} />
                <div style={{ marginTop: 8 }}><button className="btn-primary" style={{ width: "100%" }} onClick={() => goProperty(p.id)}>View Property</button></div>
              </div>
            );
          })()}
        </Panel>
        <Panel theme={theme} style={{ padding: 0, overflow: "hidden", maxHeight: 440, overflowY: "auto" }}>
          {filtered.map((p, i) => {
            const c = computed[p.id];
            return (
              <div key={p.id} onClick={() => setActive(p.id)} className="navitem" style={{ padding: 14, borderBottom: i < filtered.length - 1 ? `1px solid ${theme.border}` : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{p.name}</div>
                  <span style={{ color: c.cashFlow >= 0 ? theme.positive : theme.negative, fontFamily: "IBM Plex Mono, monospace", fontSize: 13 }}>{fmtUSD(c.cashFlow)}</span>
                </div>
                <div style={{ fontSize: 11.5, color: theme.textFaint }}>{p.address}</div>
              </div>
            );
          })}
        </Panel>
      </div>
    </div>
  );
}

/* ============================== CASH FLOW ============================== */

function CashFlowView({ theme, properties, computed, totals, history }) {
  const perProp = properties.map(p => ({ name: p.name.split(" ")[0], income: computed[p.id].grossIncome, expenses: computed[p.id].opEx + computed[p.id].debtService, cf: computed[p.id].cashFlow }));
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <MetricCard theme={theme} label="Monthly Cash Flow" value={fmtUSD(totals.cashFlow)} icon={Wallet} trend={totals.cashFlow >= 0 ? 1 : -1} />
        <MetricCard theme={theme} label="Annual Cash Flow" value={fmtUSD(totals.annualCashFlow, { compact: true })} icon={TrendingUp} />
        <MetricCard theme={theme} label="Cash Flow / Unit" value={fmtUSD(totals.units ? totals.cashFlow / totals.units : 0)} icon={Building2} />
        <MetricCard theme={theme} label="Cash Flow / $ Invested" value={fmtPct(totals.invested ? (totals.annualCashFlow / totals.invested) * 100 : 0)} icon={Percent} />
      </div>

      <SectionLabel theme={theme}>Income vs. Expenses — Last 12 Months</SectionLabel>
      <Panel theme={theme} style={{ padding: 18, height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={history.slice(-12)}>
            <CartesianGrid stroke={theme.border} vertical={false} />
            <XAxis dataKey="month" {...chartAxisProps(theme)} />
            <YAxis {...chartAxisProps(theme)} tickFormatter={v => fmtUSD(v, { compact: true })} width={56} />
            <ChartTooltip theme={theme} formatter={v => fmtUSD(v)} />
            <Legend wrapperStyle={{ fontSize: 11.5, color: theme.textDim }} />
            <Bar dataKey="income" name="Income" fill={theme.brass} radius={[4, 4, 0, 0]} />
            <Bar dataKey="expenses" name="Expenses" fill={theme.negative} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <SectionLabel theme={theme}>Cash Flow by Property</SectionLabel>
      <Panel theme={theme} style={{ overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "12px 18px", fontSize: 11, textTransform: "uppercase", color: theme.textFaint, fontWeight: 700, borderBottom: `1px solid ${theme.border}` }}>
          <div>Property</div><div>Income</div><div>Expenses (incl. debt)</div><div>Cash Flow</div>
        </div>
        {perProp.map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "12px 18px", borderBottom: `1px solid ${theme.border}`, fontFamily: "IBM Plex Mono, monospace", fontSize: 13 }}>
            <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 600 }}>{r.name}</div>
            <div style={{ color: theme.positive }}>{fmtUSD(r.income)}</div>
            <div style={{ color: theme.negative }}>{fmtUSD(-r.expenses)}</div>
            <div style={{ fontWeight: 700, color: r.cf >= 0 ? theme.positive : theme.negative }}>{fmtUSD(r.cf)}</div>
          </div>
        ))}
      </Panel>

      <SectionLabel theme={theme}>Transactions</SectionLabel>
      <TransactionsLedger theme={theme} properties={properties} />
    </div>
  );
}

function TransactionsLedger({ theme, properties }) {
  const [txns, setTxns] = useState(() => {
    const now = new Date();
    const out = [];
    properties.forEach(p => {
      out.push({ id: uid(), date: now.toISOString().slice(0, 10), property: p.name, category: "Rent", type: "Income", amount: p.units.reduce((s, u) => s + u.rent, 0), recurring: true });
      out.push({ id: uid(), date: now.toISOString().slice(0, 10), property: p.name, category: "Property Tax", type: "Expense", amount: -p.expenses.taxes, recurring: true });
      out.push({ id: uid(), date: now.toISOString().slice(0, 10), property: p.name, category: "Insurance", type: "Expense", amount: -p.expenses.insurance, recurring: true });
    });
    return out;
  });
  const [form, setForm] = useState({ property: properties[0].name, category: "Repairs", type: "Expense", amount: "", recurring: false });

  const addTxn = () => {
    if (!form.amount) return;
    setTxns(t => [{ id: uid(), date: new Date().toISOString().slice(0, 10), ...form, amount: form.type === "Expense" ? -Math.abs(+form.amount) : Math.abs(+form.amount) }, ...t]);
    setForm(f => ({ ...f, amount: "" }));
  };

  return (
    <Panel theme={theme} style={{ padding: 18 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
        <Field label="Property" theme={theme}>
          <select value={form.property} onChange={e => setForm(f => ({ ...f, property: e.target.value }))} style={inputStyle(theme)}>
            {properties.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Category" theme={theme}>
          <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inputStyle(theme)}>
            {["Rent", "Parking", "Laundry", "Storage", "Fees", "Other Income", "Mortgage", "Property Tax", "Insurance", "Utilities", "Repairs", "Maintenance", "Property Management", "HOA", "Legal", "Accounting", "Advertising", "Landscaping", "Snow Removal", "CapEx", "Other"].map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Type" theme={theme}>
          <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={inputStyle(theme)}>
            <option>Income</option><option>Expense</option>
          </select>
        </Field>
        <Field label="Amount" theme={theme}>
          <NumInput theme={theme} value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} prefix="$" />
        </Field>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: theme.textDim, paddingBottom: 8 }}>
          <input type="checkbox" checked={form.recurring} onChange={e => setForm(f => ({ ...f, recurring: e.target.checked }))} /> Recurring
        </label>
        <button className="btn-primary" onClick={addTxn} style={{ display: "flex", alignItems: "center", gap: 6 }}><Plus size={14} /> Add</button>
      </div>
      <div style={{ maxHeight: 280, overflowY: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "0.9fr 1.4fr 1.2fr 0.9fr 0.9fr 0.9fr", fontSize: 11, textTransform: "uppercase", color: theme.textFaint, fontWeight: 700, padding: "6px 4px", position: "sticky", top: 0, background: theme.panel }}>
          <div>Date</div><div>Property</div><div>Category</div><div>Type</div><div>Recurring</div><div>Amount</div>
        </div>
        {txns.map(t => (
          <div key={t.id} style={{ display: "grid", gridTemplateColumns: "0.9fr 1.4fr 1.2fr 0.9fr 0.9fr 0.9fr", fontSize: 12.5, padding: "8px 4px", borderTop: `1px solid ${theme.border}`, fontFamily: "IBM Plex Mono, monospace" }}>
            <div>{t.date}</div>
            <div style={{ fontFamily: "Inter, sans-serif" }}>{t.property}</div>
            <div style={{ fontFamily: "Inter, sans-serif" }}>{t.category}</div>
            <div>{t.type}</div>
            <div>{t.recurring ? "Yes" : "One-time"}</div>
            <div style={{ color: t.amount >= 0 ? theme.positive : theme.negative, fontWeight: 600 }}>{fmtUSD(t.amount)}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ============================== DEBT ============================== */

function DebtView({ theme, properties, computed, totals, history }) {
  const [selected, setSelected] = useState(properties[0].id);
  const p = properties.find(x => x.id === selected);
  const c = computed[p.id];
  const [extra, setExtra] = useState(0);
  const [newRate, setNewRate] = useState(p.loan.rate);

  const schedule = useMemo(() => {
    const r = monthlyRate(p.loan.rate);
    const pmt = monthlyPayment(p.loan.original, p.loan.rate, p.loan.term) + extra;
    let bal = p.loan.original;
    const rows = [];
    let totalInterest = 0;
    for (let m = 1; m <= p.loan.term * 12 && bal > 0.5; m++) {
      const interest = bal * r;
      const principal = Math.min(pmt - interest, bal);
      bal = Math.max(bal - principal, 0);
      totalInterest += interest;
      if (m % 12 === 0 || bal <= 0.5) rows.push({ year: Math.ceil(m / 12), balance: Math.round(bal), totalInterest: Math.round(totalInterest) });
    }
    return { rows, payoffMonths: rows.length ? rows[rows.length - 1].year * 12 : 0, totalInterest };
  }, [p, extra]);

  const baseline = useMemo(() => {
    const r = monthlyRate(p.loan.rate);
    const pmt = monthlyPayment(p.loan.original, p.loan.rate, p.loan.term);
    let bal = p.loan.original, totalInterest = 0;
    for (let m = 1; m <= p.loan.term * 12 && bal > 0.5; m++) {
      const interest = bal * r; const principal = Math.min(pmt - interest, bal);
      bal -= principal; totalInterest += interest;
    }
    return { totalInterest, months: p.loan.term * 12 };
  }, [p]);

  const refi = useMemo(() => {
    const newPmt = monthlyPayment(c.balance, newRate, p.loan.term);
    const delta = newPmt - c.monthlyPI;
    return { newPmt, delta };
  }, [c, newRate, p.loan.term]);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <MetricCard theme={theme} label="Total Debt" value={fmtUSD(totals.debt, { compact: true })} icon={Landmark} />
        <MetricCard theme={theme} label="Total Monthly Debt Service" value={fmtUSD(properties.reduce((s, p) => s + computed[p.id].debtService, 0))} icon={Wallet} />
        <MetricCard theme={theme} label="Weighted Avg Rate" value={fmtPct(properties.reduce((s, p) => s + p.loan.rate * computed[p.id].balance, 0) / totals.debt, 2)} icon={Percent} />
        <MetricCard theme={theme} label="Portfolio LTV" value={fmtPct(totals.ltv)} icon={ShieldAlert} />
      </div>

      <SectionLabel theme={theme}>Total Debt Paydown — 24 Months</SectionLabel>
      <Panel theme={theme} style={{ padding: 18, height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history}>
            <CartesianGrid stroke={theme.border} vertical={false} />
            <XAxis dataKey="month" {...chartAxisProps(theme)} interval={2} />
            <YAxis {...chartAxisProps(theme)} tickFormatter={v => fmtUSD(v, { compact: true })} width={56} />
            <ChartTooltip theme={theme} formatter={v => fmtUSD(v)} />
            <Line type="monotone" dataKey="debt" stroke={theme.negative} strokeWidth={2} dot={false} name="Total Debt" />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      <SectionLabel theme={theme}>Loans</SectionLabel>
      <Panel theme={theme} style={{ overflow: "hidden", marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 0.8fr 0.8fr 1fr 1fr", padding: "12px 18px", fontSize: 11, textTransform: "uppercase", color: theme.textFaint, fontWeight: 700, borderBottom: `1px solid ${theme.border}` }}>
          <div>Property</div><div>Balance</div><div>Rate</div><div>Term</div><div>Monthly P&I</div><div>Maturity</div>
        </div>
        {properties.map(p2 => {
          const c2 = computed[p2.id];
          const maturity = new Date(p2.purchaseDate); maturity.setFullYear(maturity.getFullYear() + p2.loan.term);
          return (
            <div key={p2.id} onClick={() => { setSelected(p2.id); setNewRate(p2.loan.rate); setExtra(0); }} className="navitem"
              style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 0.8fr 0.8fr 1fr 1fr", padding: "12px 18px", borderBottom: `1px solid ${theme.border}`, fontFamily: "IBM Plex Mono, monospace", fontSize: 13, background: p2.id === selected ? theme.panelSoft : "transparent" }}>
              <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 600 }}>{p2.name}</div>
              <div>{fmtUSD(c2.balance, { compact: true })}</div>
              <div>{fmtPct(p2.loan.rate, 2)}</div>
              <div>{p2.loan.term}yr</div>
              <div>{fmtUSD(c2.monthlyPI)}</div>
              <div>{maturity.getFullYear()}</div>
            </div>
          );
        })}
      </Panel>

      <SectionLabel theme={theme}>Amortization — {p.name}</SectionLabel>
      <Panel theme={theme} style={{ padding: 18, height: 240, marginBottom: 20 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={schedule.rows}>
            <defs>
              <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={theme.brass} stopOpacity={0.35} /><stop offset="100%" stopColor={theme.brass} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={theme.border} vertical={false} />
            <XAxis dataKey="year" {...chartAxisProps(theme)} label={{ value: "Year", position: "insideBottom", offset: -4, fill: theme.textFaint, fontSize: 11 }} />
            <YAxis {...chartAxisProps(theme)} tickFormatter={v => fmtUSD(v, { compact: true })} width={56} />
            <ChartTooltip theme={theme} formatter={v => fmtUSD(v)} />
            <Area type="monotone" dataKey="balance" stroke={theme.brass} fill="url(#balGrad)" strokeWidth={2} name="Principal Remaining" />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Panel theme={theme} style={{ padding: 18 }}>
          <div style={{ fontFamily: "Fraunces, serif", fontWeight: 600, marginBottom: 4 }}>Extra Payment Scenario</div>
          <div style={{ fontSize: 12, color: theme.textFaint, marginBottom: 12 }}>"What if I make an extra payment each month?"</div>
          <Field label="Extra Monthly Payment" theme={theme}><NumInput theme={theme} value={extra} onChange={setExtra} prefix="$" step={50} /></Field>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            <Row theme={theme} label="New Payoff (years)" value={(schedule.payoffMonths / 12).toFixed(1)} />
            <Row theme={theme} label="Baseline Payoff (years)" value={p.loan.term} />
            <Row theme={theme} label="Total Interest (this scenario)" value={fmtUSD(schedule.totalInterest)} />
            <Row theme={theme} label="Interest Saved vs. Baseline" value={fmtUSD(baseline.totalInterest - schedule.totalInterest)} positive={baseline.totalInterest - schedule.totalInterest >= 0} strong />
          </div>
        </Panel>
        <Panel theme={theme} style={{ padding: 18 }}>
          <div style={{ fontFamily: "Fraunces, serif", fontWeight: 600, marginBottom: 4 }}>Refinance Scenario</div>
          <div style={{ fontSize: 12, color: theme.textFaint, marginBottom: 12 }}>Model refinancing the current balance at a new rate.</div>
          <Field label="New Interest Rate" theme={theme}><NumInput theme={theme} value={newRate} onChange={setNewRate} suffix="%" step={0.125} /></Field>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            <Row theme={theme} label="Current Payment" value={fmtUSD(c.monthlyPI)} />
            <Row theme={theme} label="New Payment" value={fmtUSD(refi.newPmt)} />
            <Row theme={theme} label="Monthly Cash Flow Change" value={fmtUSD(-refi.delta)} positive={-refi.delta >= 0} strong />
            <Row theme={theme} label="Annual Cash Flow Change" value={fmtUSD(-refi.delta * 12)} positive={-refi.delta >= 0} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ============================== EQUITY ============================== */

function EquityView({ theme, properties, computed, totals }) {
  const [maxLTV, setMaxLTV] = useState(75);
  const rows = properties.map(p => {
    const c = computed[p.id];
    const borrowCapacity = p.currentValue * (maxLTV / 100);
    const available = Math.max(borrowCapacity - c.balance, 0);
    return { p, c, borrowCapacity, available };
  });
  const totalAvailable = rows.reduce((s, r) => s + r.available, 0);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        <MetricCard theme={theme} label="Total Equity" value={fmtUSD(totals.equity, { compact: true })} icon={PiggyBank} />
        <MetricCard theme={theme} label="Available Equity" value={fmtUSD(totalAvailable, { compact: true })} sub={`at ${maxLTV}% max LTV`} icon={Sparkles} />
        <MetricCard theme={theme} label="Portfolio LTV" value={fmtPct(totals.ltv)} icon={ShieldAlert} />
      </div>

      <SectionLabel theme={theme}>Maximum Leverage Assumption</SectionLabel>
      <Panel theme={theme} style={{ padding: 18, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
          <span style={{ color: theme.textDim }}>Maximum LTV for borrowing capacity</span>
          <span style={{ fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: theme.brassSoft }}>{maxLTV}%</span>
        </div>
        <Slider theme={theme} value={maxLTV} min={50} max={90} step={1} onChange={setMaxLTV} />
        {maxLTV > 80 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, padding: "8px 12px", background: theme.warning + "1A", borderRadius: 8 }}>
            <AlertTriangle size={15} color={theme.warning} />
            <span style={{ fontSize: 12.5, color: theme.warning }}>An LTV above 80% is considered aggressive leverage and may limit lender options or raise borrowing costs.</span>
          </div>
        )}
      </Panel>

      <SectionLabel theme={theme}>Equity by Property</SectionLabel>
      <Panel theme={theme} style={{ overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1fr 1fr", padding: "12px 18px", fontSize: 11, textTransform: "uppercase", color: theme.textFaint, fontWeight: 700, borderBottom: `1px solid ${theme.border}` }}>
          <div>Property</div><div>Value</div><div>Balance</div><div>Equity</div><div>Borrow Capacity</div><div>Available Equity</div>
        </div>
        {rows.map(({ p, c, borrowCapacity, available }) => (
          <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1fr 1fr", padding: "12px 18px", borderBottom: `1px solid ${theme.border}`, fontFamily: "IBM Plex Mono, monospace", fontSize: 13, alignItems: "center" }}>
            <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 600 }}>{p.name}</div>
            <div>{fmtUSD(p.currentValue, { compact: true })}</div>
            <div>{fmtUSD(c.balance, { compact: true })}</div>
            <div style={{ color: theme.brassSoft, fontWeight: 700 }}>{fmtUSD(c.equity, { compact: true })}</div>
            <div>{fmtUSD(borrowCapacity, { compact: true })}</div>
            <div style={{ color: theme.positive, fontWeight: 700 }}>{fmtUSD(available, { compact: true })}</div>
          </div>
        ))}
      </Panel>

      <SectionLabel theme={theme}>Worked Example</SectionLabel>
      <Panel theme={theme} style={{ padding: 18, fontSize: 13, color: theme.textDim, lineHeight: 1.9, fontFamily: "IBM Plex Mono, monospace" }}>
        Property Value: {fmtUSD(rows[0].p.currentValue)}<br />
        Mortgage: {fmtUSD(rows[0].c.balance)}<br />
        Equity: {fmtUSD(rows[0].c.equity)}<br />
        Maximum LTV: {maxLTV}%<br />
        Potential Borrowing Capacity: {fmtUSD(rows[0].borrowCapacity)}<br />
        <span style={{ color: theme.positive, fontWeight: 700 }}>Potential Available Equity: {fmtUSD(rows[0].available)}</span>
      </Panel>
    </div>
  );
}

/* ============================== SUGGESTED BUYS ============================== */

const MARKET_LISTINGS = [
  { id: "m1", name: "Cedar Street Duplex", address: "45 Cedar St, Yonkers, NY", type: "Duplex", price: 495000, units: 2, rent: 3900, taxes: 620, insurance: 130, renovation: 8000, appreciation: 3.2 },
  { id: "m2", name: "Oak Ridge Triplex", address: "301 Oak Ridge Rd, Mount Vernon, NY", type: "Triplex", price: 615000, units: 3, rent: 4650, taxes: 780, insurance: 160, renovation: 15000, appreciation: 2.8 },
  { id: "m3", name: "Highland Fourplex", address: "77 Highland Ave, Yonkers, NY", type: "Fourplex", price: 780000, units: 4, rent: 6200, taxes: 950, insurance: 210, renovation: 30000, appreciation: 3.0 },
  { id: "m4", name: "Grove Park SFR", address: "19 Grove Park, White Plains, NY", type: "Single-family", price: 410000, units: 1, rent: 2750, taxes: 700, insurance: 100, renovation: 3000, appreciation: 3.6 },
  { id: "m5", name: "Sunset Terrace 6-Unit", address: "500 Sunset Terrace, Bronx, NY", type: "Apartment complex", price: 1250000, units: 6, rent: 10800, taxes: 1550, insurance: 320, renovation: 45000, appreciation: 2.6 },
  { id: "m6", name: "Pinehurst Duplex", address: "8 Pinehurst Ct, New Rochelle, NY", type: "Duplex", price: 530000, units: 2, rent: 3700, taxes: 660, insurance: 140, renovation: 10000, appreciation: 2.9 },
];

function analyzeListing(listing, criteria) {
  const downPct = criteria.downPct / 100;
  const down = listing.price * downPct;
  const loan = listing.price - down;
  const closing = listing.price * 0.025;
  const totalCash = down + closing + listing.renovation;
  const pmt = monthlyPayment(loan, criteria.rate, 30);
  const management = listing.rent * 0.08;
  const maintenance = listing.rent * 0.06;
  const vacancy = listing.rent * 0.05;
  const capex = listing.rent * 0.05;
  const opEx = listing.taxes + listing.insurance + management + maintenance + vacancy + capex;
  const noi = listing.rent - opEx;
  const cashFlow = noi - pmt;
  const capRate = (noi * 12 / listing.price) * 100;
  const coc = totalCash > 0 ? (cashFlow * 12 / totalCash) * 100 : 0;
  const dscr = pmt > 0 ? noi / pmt : 0;
  const rentToPrice = (listing.rent * 12 / listing.price) * 100;
  const equityAfter = listing.price - loan;

  let score = 0;
  score += Math.min(Math.max(cashFlow / 15, 0), 25);
  score += Math.min(Math.max(capRate * 3, 0), 20);
  score += Math.min(Math.max(coc * 1.5, 0), 20);
  score += Math.min(Math.max((dscr - 1) * 40, 0), 15);
  score += Math.min(Math.max(rentToPrice * 4, 0), 10);
  score += Math.min(listing.appreciation * 2.5, 10);
  score = Math.max(0, Math.min(100, Math.round(score)));

  const label = score >= 85 ? "Strong Buy" : score >= 70 ? "Buy" : score >= 55 ? "Consider" : score >= 40 ? "Marginal" : "Pass";

  return { down, loan, closing, totalCash, pmt, opEx, noi, cashFlow, capRate, coc, dscr, rentToPrice, equityAfter, score, label };
}

function SuggestedBuys({ theme }) {
  const [criteria, setCriteria] = useState({ maxPrice: 900000, minCashFlow: 0, minCapRate: 5, minCoC: 6, downPct: 20, rate: 6.5 });
  const [sortKey, setSortKey] = useState("score");

  const results = useMemo(() => {
    return MARKET_LISTINGS
      .map(l => ({ l, a: analyzeListing(l, criteria) }))
      .filter(({ l, a }) => l.price <= criteria.maxPrice && a.cashFlow >= criteria.minCashFlow && a.capRate >= criteria.minCapRate && a.coc >= criteria.minCoC)
      .sort((x, y) => y.a[sortKey] - x.a[sortKey]);
  }, [criteria, sortKey]);

  return (
    <div>
      <Panel theme={theme} style={{ padding: 18, marginBottom: 20 }}>
        <div style={{ fontFamily: "Fraunces, serif", fontWeight: 600, marginBottom: 14 }}>Investment Criteria</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          <Field label="Maximum Purchase Price" theme={theme}><NumInput theme={theme} value={criteria.maxPrice} onChange={v => setCriteria(c => ({ ...c, maxPrice: v }))} prefix="$" step={5000} /></Field>
          <Field label="Minimum Monthly Cash Flow" theme={theme}><NumInput theme={theme} value={criteria.minCashFlow} onChange={v => setCriteria(c => ({ ...c, minCashFlow: v }))} prefix="$" step={25} /></Field>
          <Field label="Minimum Cap Rate" theme={theme}><NumInput theme={theme} value={criteria.minCapRate} onChange={v => setCriteria(c => ({ ...c, minCapRate: v }))} suffix="%" step={0.25} /></Field>
          <Field label="Minimum Cash-on-Cash Return" theme={theme}><NumInput theme={theme} value={criteria.minCoC} onChange={v => setCriteria(c => ({ ...c, minCoC: v }))} suffix="%" step={0.25} /></Field>
          <Field label="Assumed Down Payment" theme={theme}><NumInput theme={theme} value={criteria.downPct} onChange={v => setCriteria(c => ({ ...c, downPct: v }))} suffix="%" step={1} /></Field>
          <Field label="Assumed Interest Rate" theme={theme}><NumInput theme={theme} value={criteria.rate} onChange={v => setCriteria(c => ({ ...c, rate: v }))} suffix="%" step={0.125} /></Field>
        </div>
      </Panel>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <SectionLabel theme={theme}>Matching Opportunities ({results.length})</SectionLabel>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[["score", "Score"], ["cashFlow", "Cash Flow"], ["capRate", "Cap Rate"], ["coc", "CoC Return"]].map(([k, l]) => (
          <button key={k} className={`tab-btn ${sortKey === k ? "active" : ""}`} onClick={() => setSortKey(k)}>{l}</button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {results.map(({ l, a }) => (
          <Panel key={l.id} theme={theme} className="deed-corner" style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontFamily: "Fraunces, serif", fontSize: 17, fontWeight: 600 }}>{l.name}</div>
                  <Pill theme={theme} tone={a.score >= 85 ? "positive" : a.score >= 60 ? "brass" : a.score >= 40 ? "warning" : "negative"}>{a.score}/100 — {a.label}</Pill>
                </div>
                <div style={{ fontSize: 12, color: theme.textFaint, marginTop: 2 }}>{l.address} · {l.type} · {l.units} unit{l.units > 1 ? "s" : ""}</div>
              </div>
              <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 20, fontWeight: 700 }}>{fmtUSD(l.price)}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginTop: 16 }}>
              <MiniStat theme={theme} label="Est. Down Payment" value={fmtUSD(a.down, { compact: true })} />
              <MiniStat theme={theme} label="Est. Closing + Reno" value={fmtUSD(a.closing + l.renovation, { compact: true })} />
              <MiniStat theme={theme} label="Total Cash Required" value={fmtUSD(a.totalCash, { compact: true })} />
              <MiniStat theme={theme} label="Est. Monthly Rent" value={fmtUSD(l.rent)} />
              <MiniStat theme={theme} label="Est. Mortgage" value={fmtUSD(a.pmt)} />
              <MiniStat theme={theme} label="Est. Cash Flow" value={fmtUSD(a.cashFlow)} tone={a.cashFlow >= 0 ? "positive" : "negative"} />
              <MiniStat theme={theme} label="Cap Rate" value={fmtPct(a.capRate)} />
              <MiniStat theme={theme} label="Cash-on-Cash" value={fmtPct(a.coc)} />
              <MiniStat theme={theme} label="DSCR" value={a.dscr.toFixed(2) + "x"} />
              <MiniStat theme={theme} label="Rent-to-Price" value={fmtPct(a.rentToPrice)} />
              <MiniStat theme={theme} label="Equity After Purchase" value={fmtUSD(a.equityAfter, { compact: true })} />
              <MiniStat theme={theme} label="Est. Appreciation" value={fmtPct(l.appreciation) + "/yr"} />
            </div>
          </Panel>
        ))}
        {results.length === 0 && <Panel theme={theme} style={{ padding: 30, textAlign: "center", color: theme.textFaint }}>No listings currently meet these criteria — try loosening them.</Panel>}
      </div>
      <div style={{ fontSize: 11.5, color: theme.textFaint, marginTop: 14, display: "flex", gap: 6, alignItems: "flex-start" }}>
        <Info size={13} style={{ marginTop: 1, flexShrink: 0 }} /> All figures on this page are estimates based on typical operating assumptions, not guaranteed returns. Verify rents, taxes, and condition before making an offer.
      </div>
    </div>
  );
}

function MiniStat({ theme, label, value, tone }) {
  const color = tone === "positive" ? theme.positive : tone === "negative" ? theme.negative : theme.text;
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: "uppercase", color: theme.textFaint, letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, fontSize: 14, color }}>{value}</div>
    </div>
  );
}

/* ============================== DEAL ANALYZER ============================== */

function DealAnalyzer({ theme }) {
  const [f, setF] = useState({
    price: 500000, downPct: 20, rate: 6.5, term: 30, closingPct: 2.5, renovation: 10000,
    rent: 3800, vacancyPct: 5, taxes: 700, insurance: 140, managementPct: 8, maintenancePct: 5,
    utilities: 0, other: 50, appreciation: 3,
  });
  const set = (k) => (v) => setF(s => ({ ...s, [k]: v }));

  const r = useMemo(() => {
    const down = f.price * (f.downPct / 100);
    const loan = f.price - down;
    const closing = f.price * (f.closingPct / 100);
    const totalCash = down + closing + f.renovation;
    const mortgage = monthlyPayment(loan, f.rate, f.term);
    const vacancy = f.rent * (f.vacancyPct / 100);
    const management = f.rent * (f.managementPct / 100);
    const maintenance = f.rent * (f.maintenancePct / 100);
    const totalExpenses = f.taxes + f.insurance + vacancy + management + maintenance + f.utilities + f.other;
    const noi = f.rent - totalExpenses;
    const cashFlow = noi - mortgage;
    const annualCashFlow = cashFlow * 12;
    const capRate = (noi * 12 / f.price) * 100;
    const coc = totalCash > 0 ? (annualCashFlow / totalCash) * 100 : 0;
    const roi = totalCash > 0 ? ((annualCashFlow + f.price * (f.appreciation / 100)) / totalCash) * 100 : 0;
    const dscr = mortgage > 0 ? noi / mortgage : 0;
    const breakEvenOccupancy = f.rent > 0 ? Math.min(100, ((totalExpenses - vacancy + mortgage) / f.rent) * 100) : 0;
    const requiredRent = totalExpenses - vacancy + mortgage;
    return { down, loan, closing, totalCash, mortgage, vacancy, management, maintenance, totalExpenses, noi, cashFlow, annualCashFlow, capRate, coc, roi, dscr, breakEvenOccupancy, requiredRent };
  }, [f]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <div>
        <Panel theme={theme} style={{ padding: 18 }}>
          <div style={{ fontFamily: "Fraunces, serif", fontWeight: 600, marginBottom: 14 }}>Deal Inputs</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Purchase Price" theme={theme}><NumInput theme={theme} value={f.price} onChange={set("price")} prefix="$" step={5000} /></Field>
            <Field label="Down Payment" theme={theme}><NumInput theme={theme} value={f.downPct} onChange={set("downPct")} suffix="%" step={1} /></Field>
            <Field label="Interest Rate" theme={theme}><NumInput theme={theme} value={f.rate} onChange={set("rate")} suffix="%" step={0.125} /></Field>
            <Field label="Loan Term" theme={theme}><NumInput theme={theme} value={f.term} onChange={set("term")} suffix="yrs" step={5} /></Field>
            <Field label="Closing Costs" theme={theme}><NumInput theme={theme} value={f.closingPct} onChange={set("closingPct")} suffix="%" step={0.25} /></Field>
            <Field label="Renovation Costs" theme={theme}><NumInput theme={theme} value={f.renovation} onChange={set("renovation")} prefix="$" step={1000} /></Field>
            <Field label="Monthly Rent" theme={theme}><NumInput theme={theme} value={f.rent} onChange={set("rent")} prefix="$" step={50} /></Field>
            <Field label="Vacancy Allowance" theme={theme}><NumInput theme={theme} value={f.vacancyPct} onChange={set("vacancyPct")} suffix="%" step={1} /></Field>
            <Field label="Property Taxes" theme={theme}><NumInput theme={theme} value={f.taxes} onChange={set("taxes")} prefix="$" step={25} /></Field>
            <Field label="Insurance" theme={theme}><NumInput theme={theme} value={f.insurance} onChange={set("insurance")} prefix="$" step={10} /></Field>
            <Field label="Management" theme={theme}><NumInput theme={theme} value={f.managementPct} onChange={set("managementPct")} suffix="%" step={1} /></Field>
            <Field label="Maintenance" theme={theme}><NumInput theme={theme} value={f.maintenancePct} onChange={set("maintenancePct")} suffix="%" step={1} /></Field>
            <Field label="Utilities" theme={theme}><NumInput theme={theme} value={f.utilities} onChange={set("utilities")} prefix="$" step={10} /></Field>
            <Field label="Other Expenses" theme={theme}><NumInput theme={theme} value={f.other} onChange={set("other")} prefix="$" step={10} /></Field>
            <Field label="Expected Appreciation" theme={theme}><NumInput theme={theme} value={f.appreciation} onChange={set("appreciation")} suffix="%/yr" step={0.25} /></Field>
          </div>
        </Panel>
      </div>

      <div>
        <Panel theme={theme} style={{ padding: 18, marginBottom: 16, textAlign: "center" }}>
          <CashFlowBadge cashFlow={r.cashFlow} theme={theme} />
          <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 34, fontWeight: 700, marginTop: 10, color: r.cashFlow >= 0 ? theme.positive : theme.negative }}>{fmtUSD(r.cashFlow)}<span style={{ fontSize: 14, color: theme.textFaint }}>/mo</span></div>
          <div style={{ fontSize: 12.5, color: theme.textFaint, marginTop: 2 }}>{fmtUSD(r.annualCashFlow)} annually</div>
        </Panel>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <MetricCard theme={theme} label="Monthly Mortgage" value={fmtUSD(r.mortgage)} />
          <MetricCard theme={theme} label="Total Monthly Expenses" value={fmtUSD(r.totalExpenses)} />
          <MetricCard theme={theme} label="NOI" value={fmtUSD(r.noi)} />
          <MetricCard theme={theme} label="Cap Rate" value={fmtPct(r.capRate)} />
          <MetricCard theme={theme} label="Cash-on-Cash Return" value={fmtPct(r.coc)} />
          <MetricCard theme={theme} label="ROI (incl. appreciation)" value={fmtPct(r.roi)} />
          <MetricCard theme={theme} label="DSCR" value={r.dscr.toFixed(2) + "x"} />
          <MetricCard theme={theme} label="Break-Even Occupancy" value={fmtPct(r.breakEvenOccupancy)} />
        </div>

        <Panel theme={theme} style={{ padding: 18, marginTop: 16 }}>
          <Row theme={theme} label="Total Cash Required" value={fmtUSD(r.totalCash)} strong />
          <Row theme={theme} label="Loan Amount" value={fmtUSD(r.loan)} />
          <Row theme={theme} label="Required Rent to Break Even" value={fmtUSD(r.requiredRent)} />
        </Panel>
      </div>
    </div>
  );
}

/* ============================== STRATEGY LAB ============================== */

const STRATEGIES = {
  buyhold: { label: "Buy & Hold", propsPerYear: 0.5, ltvTarget: 75, appreciation: 3.5, rentGrowth: 2.5 },
  brrrr: { label: "BRRRR", propsPerYear: 1.5, ltvTarget: 75, appreciation: 3, rentGrowth: 3 },
  cashout: { label: "Cash-Out Refinance", propsPerYear: 1, ltvTarget: 75, appreciation: 3.2, rentGrowth: 2.5 },
  heloc: { label: "HELOC Strategy", propsPerYear: 1.2, ltvTarget: 80, appreciation: 3.2, rentGrowth: 2.5 },
  aggressive: { label: "Aggressive Growth", propsPerYear: 2, ltvTarget: 85, appreciation: 3, rentGrowth: 2 },
  conservative: { label: "Conservative Growth", propsPerYear: 0.35, ltvTarget: 65, appreciation: 3.5, rentGrowth: 3 },
};

function StrategyLab({ theme, totals }) {
  const [strategy, setStrategy] = useState("buyhold");
  const s = STRATEGIES[strategy];
  const [vars, setVars] = useState({ downPct: 22, rate: 6.5, appreciation: s.appreciation, rentGrowth: s.rentGrowth, propsPerYear: s.propsPerYear, avgPropPrice: 550000 });

  useEffect(() => { setVars(v => ({ ...v, appreciation: s.appreciation, rentGrowth: s.rentGrowth, propsPerYear: s.propsPerYear })); }, [strategy]);
  const set = (k) => (v) => setVars(s2 => ({ ...s2, [k]: v }));

  const projection = useMemo(() => {
    const years = [5, 10, 20];
    let properties = totals.units > 0 ? 5 : 0;
    let value = totals.value, debt = totals.debt, equity = totals.equity, cashFlow = totals.cashFlow;
    const rows = [];
    let yearCursor = 0;
    years.forEach(targetYear => {
      for (; yearCursor < targetYear; yearCursor++) {
        value *= 1 + vars.appreciation / 100;
        cashFlow *= 1 + vars.rentGrowth / 100 * 0.6;
        const newProps = vars.propsPerYear;
        const newValue = newProps * vars.avgPropPrice;
        const newDown = newValue * (vars.downPct / 100);
        const newLoan = newValue - newDown;
        value += newValue; debt += newLoan; equity += newDown;
        const newPmt = monthlyPayment(newLoan, vars.rate, 30) * newProps;
        const newRent = newValue * 0.008;
        cashFlow += (newRent - newPmt) * 0.5;
        properties += newProps;
        debt *= 0.98;
      }
      equity = value - debt;
      rows.push({
        year: targetYear, properties: Math.round(properties), value: Math.round(value), debt: Math.round(debt),
        equity: Math.round(equity), cashFlow: Math.round(cashFlow), annualCashFlow: Math.round(cashFlow * 12),
        netWorth: Math.round(equity), cashReserve: Math.round(cashFlow * 12 * 0.5),
      });
    });
    return rows;
  }, [vars, totals]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {Object.entries(STRATEGIES).map(([k, v]) => (
          <button key={k} className={`tab-btn ${strategy === k ? "active" : ""}`} onClick={() => setStrategy(k)}>{v.label}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 20 }}>
        <Panel theme={theme} style={{ padding: 18 }}>
          <div style={{ fontFamily: "Fraunces, serif", fontWeight: 600, marginBottom: 14 }}>Assumptions</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Down Payment %" theme={theme}><NumInput theme={theme} value={vars.downPct} onChange={set("downPct")} suffix="%" step={1} /></Field>
            <Field label="Interest Rate" theme={theme}><NumInput theme={theme} value={vars.rate} onChange={set("rate")} suffix="%" step={0.125} /></Field>
            <Field label="Property Appreciation" theme={theme}><NumInput theme={theme} value={vars.appreciation} onChange={set("appreciation")} suffix="%/yr" step={0.25} /></Field>
            <Field label="Rent Growth" theme={theme}><NumInput theme={theme} value={vars.rentGrowth} onChange={set("rentGrowth")} suffix="%/yr" step={0.25} /></Field>
            <Field label="Properties Purchased / Year" theme={theme}><NumInput theme={theme} value={vars.propsPerYear} onChange={set("propsPerYear")} step={0.1} /></Field>
            <Field label="Avg. New Property Price" theme={theme}><NumInput theme={theme} value={vars.avgPropPrice} onChange={set("avgPropPrice")} prefix="$" step={10000} /></Field>
          </div>
        </Panel>

        <div>
          <Panel theme={theme} style={{ padding: 18, height: 280, marginBottom: 16 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={[{ year: 0, netWorth: totals.equity, value: totals.value, debt: totals.debt }, ...projection]}>
                <CartesianGrid stroke={theme.border} vertical={false} />
                <XAxis dataKey="year" {...chartAxisProps(theme)} label={{ value: "Years", position: "insideBottom", offset: -4, fill: theme.textFaint, fontSize: 11 }} />
                <YAxis {...chartAxisProps(theme)} tickFormatter={v => fmtUSD(v, { compact: true })} width={56} />
                <ChartTooltip theme={theme} formatter={v => fmtUSD(v)} />
                <Legend wrapperStyle={{ fontSize: 11.5, color: theme.textDim }} />
                <Line type="monotone" dataKey="value" stroke={theme.brass} strokeWidth={2} dot name="Portfolio Value" />
                <Line type="monotone" dataKey="netWorth" stroke={theme.positive} strokeWidth={2} dot name="Net Worth (Equity)" />
                <Line type="monotone" dataKey="debt" stroke={theme.negative} strokeWidth={2} dot name="Debt" />
              </LineChart>
            </ResponsiveContainer>
          </Panel>

          <Panel theme={theme} style={{ overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "0.6fr 0.9fr 1.1fr 1fr 1.1fr 1.1fr 1.1fr", padding: "12px 16px", fontSize: 10.5, textTransform: "uppercase", color: theme.textFaint, fontWeight: 700, borderBottom: `1px solid ${theme.border}` }}>
              <div>Year</div><div>Props</div><div>Value</div><div>Debt</div><div>Equity</div><div>Monthly CF</div><div>Net Worth</div>
            </div>
            {projection.map(r => (
              <div key={r.year} style={{ display: "grid", gridTemplateColumns: "0.6fr 0.9fr 1.1fr 1fr 1.1fr 1.1fr 1.1fr", padding: "12px 16px", borderBottom: `1px solid ${theme.border}`, fontFamily: "IBM Plex Mono, monospace", fontSize: 12.5 }}>
                <div style={{ fontWeight: 700 }}>Yr {r.year}</div>
                <div>{r.properties}</div>
                <div>{fmtUSD(r.value, { compact: true })}</div>
                <div>{fmtUSD(r.debt, { compact: true })}</div>
                <div style={{ color: theme.brassSoft }}>{fmtUSD(r.equity, { compact: true })}</div>
                <div style={{ color: r.cashFlow >= 0 ? theme.positive : theme.negative }}>{fmtUSD(r.cashFlow)}</div>
                <div style={{ fontWeight: 700 }}>{fmtUSD(r.netWorth, { compact: true })}</div>
              </div>
            ))}
          </Panel>
          <div style={{ fontSize: 11.5, color: theme.textFaint, marginTop: 10, display: "flex", gap: 6 }}>
            <Info size={13} style={{ marginTop: 1, flexShrink: 0 }} /> Projections are illustrative assumptions, not guarantees. Real markets vary.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================== GROWTH PLANNER ============================== */

function GrowthPlanner({ theme, totals, properties }) {
  const [inputs, setInputs] = useState({
    currentCash: 60000, monthlySavings: 3500, targetProperties: properties.length + 5,
    targetNetWorth: 3000000, avgDownPayment: 110000,
  });
  const set = (k) => (v) => setInputs(s => ({ ...s, [k]: v }));

  const timeline = useMemo(() => {
    const rows = [];
    let cash = inputs.currentCash, props = properties.length, equity = totals.equity, cashFlow = totals.cashFlow, month = 0;
    const maxMonths = 240;
    while (props < inputs.targetProperties && month < maxMonths) {
      month++;
      cash += inputs.monthlySavings + Math.max(cashFlow, 0);
      if (cash >= inputs.avgDownPayment) {
        cash -= inputs.avgDownPayment;
        props += 1;
        equity += inputs.avgDownPayment;
        cashFlow += 250;
        rows.push({ month, props, cash: Math.round(cash), equity: Math.round(equity), cashFlow: Math.round(cashFlow) });
      }
    }
    return rows;
  }, [inputs, properties.length, totals]);

  const yearsToTarget = timeline.length ? (timeline[timeline.length - 1].month / 12).toFixed(1) : "—";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 20 }}>
      <Panel theme={theme} style={{ padding: 18 }}>
        <div style={{ fontFamily: "Fraunces, serif", fontWeight: 600, marginBottom: 14 }}>Your Inputs</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Current Cash Available" theme={theme}><NumInput theme={theme} value={inputs.currentCash} onChange={set("currentCash")} prefix="$" step={1000} /></Field>
          <Field label="Monthly Amount You Can Save" theme={theme}><NumInput theme={theme} value={inputs.monthlySavings} onChange={set("monthlySavings")} prefix="$" step={100} /></Field>
          <Field label="Avg. Down Payment per Property" theme={theme}><NumInput theme={theme} value={inputs.avgDownPayment} onChange={set("avgDownPayment")} prefix="$" step={5000} /></Field>
          <Field label="Target Number of Properties" theme={theme}><NumInput theme={theme} value={inputs.targetProperties} onChange={set("targetProperties")} step={1} /></Field>
          <Field label="Target Net Worth" theme={theme}><NumInput theme={theme} value={inputs.targetNetWorth} onChange={set("targetNetWorth")} prefix="$" step={50000} /></Field>
        </div>
      </Panel>

      <div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          <Panel theme={theme} style={{ padding: 18 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", color: theme.textFaint, fontWeight: 700, marginBottom: 10 }}>Current</div>
            <Row theme={theme} label="Properties" value={properties.length} />
            <Row theme={theme} label="Portfolio Value" value={fmtUSD(totals.value, { compact: true })} />
            <Row theme={theme} label="Equity" value={fmtUSD(totals.equity, { compact: true })} />
            <Row theme={theme} label="Monthly Cash Flow" value={fmtUSD(totals.cashFlow)} />
          </Panel>
          <Panel theme={theme} style={{ padding: 18 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", color: theme.textFaint, fontWeight: 700, marginBottom: 10 }}>At Target ({yearsToTarget} yrs)</div>
            <Row theme={theme} label="Properties" value={inputs.targetProperties} strong />
            <Row theme={theme} label="Projected Equity" value={fmtUSD(timeline.length ? timeline[timeline.length - 1].equity : totals.equity, { compact: true })} strong />
            <Row theme={theme} label="Projected Cash Flow" value={fmtUSD(timeline.length ? timeline[timeline.length - 1].cashFlow : totals.cashFlow)} strong />
            <Row theme={theme} label="Remaining Cash Buffer" value={fmtUSD(timeline.length ? timeline[timeline.length - 1].cash : inputs.currentCash)} />
          </Panel>
        </div>

        <SectionLabel theme={theme}>Acquisition Timeline</SectionLabel>
        <Panel theme={theme} style={{ padding: 18, height: 240, marginBottom: 16 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeline.map(r => ({ ...r, year: (r.month / 12).toFixed(1) }))}>
              <CartesianGrid stroke={theme.border} vertical={false} />
              <XAxis dataKey="year" {...chartAxisProps(theme)} label={{ value: "Years", position: "insideBottom", offset: -4, fill: theme.textFaint, fontSize: 11 }} />
              <YAxis {...chartAxisProps(theme)} width={40} allowDecimals={false} />
              <ChartTooltip theme={theme} />
              <Line type="stepAfter" dataKey="props" stroke={theme.brass} strokeWidth={2} dot name="Properties Owned" />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        {timeline.length === 0 && <Panel theme={theme} style={{ padding: 20, color: theme.textFaint, textAlign: "center" }}>Increase savings or reduce the target down payment to reach your goal within 20 years.</Panel>}
      </div>
    </div>
  );
}

/* ============================== ADVISOR ============================== */

function Advisor({ theme, properties, computed, totals }) {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "I'm your Portfolio Advisor. Ask me about cash flow, equity, refinancing, or which property to focus on. My answers are based on your actual portfolio data — not guaranteed financial advice." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  const buildContext = () => {
    const propSummaries = properties.map(p => {
      const c = computed[p.id];
      return `${p.name} (${p.type}, ${p.address}): value ${fmtUSD(p.currentValue)}, equity ${fmtUSD(c.equity)}, mortgage ${fmtUSD(c.balance)} at ${p.loan.rate}%, monthly cash flow ${fmtUSD(c.cashFlow)}, cap rate ${c.capRate.toFixed(2)}%, CoC ${c.cashOnCash.toFixed(2)}%, DSCR ${c.dscr.toFixed(2)}, LTV ${c.ltv.toFixed(1)}%, occupancy ${c.occupancy.toFixed(0)}%.`;
    }).join("\n");
    return `Portfolio totals: value ${fmtUSD(totals.value)}, equity ${fmtUSD(totals.equity)}, debt ${fmtUSD(totals.debt)}, monthly cash flow ${fmtUSD(totals.cashFlow)}, avg cap rate ${totals.capRate.toFixed(2)}%, portfolio LTV ${totals.ltv.toFixed(1)}%, available equity at 75% LTV ${fmtUSD(totals.availableEquity75)}.\n\nProperties:\n${propSummaries}`;
  };

  const send = async (text) => {
    const q = text ?? input;
    if (!q.trim() || loading) return;
    const newMessages = [...messages, { role: "user", content: q }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    try {
      const systemPrompt = `You are Portfolio Advisor, an assistant inside a real-estate portfolio tracker app. Answer the investor's question using ONLY the portfolio data provided below. Be concise (under 150 words), concrete, and cite specific numbers from the data. Clearly separate facts (from the data) from any projection or opinion, and never present projections as guaranteed. If asked something the data can't answer, say so plainly.\n\nPORTFOLIO DATA:\n${buildContext()}`;
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: systemPrompt,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await response.json();
      const text2 = (data.content || []).map(b => b.text || "").join("\n").trim() || "I couldn't generate a response just now — try again.";
      setMessages(m => [...m, { role: "assistant", content: text2 }]);
    } catch (e) {
      setMessages(m => [...m, { role: "assistant", content: "I ran into a connection issue reaching the advisor service. Please try again in a moment." }]);
    } finally {
      setLoading(false);
    }
  };

  const quick = [
    "Which property is performing the best?",
    "Which property has the worst cash flow?",
    "How much equity do I have?",
    "Should I refinance any property?",
    "How can I increase my monthly cash flow?",
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 20 }}>
      <Panel theme={theme} style={{ display: "flex", flexDirection: "column", height: 560 }}>
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ maxWidth: "80%", alignSelf: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                background: m.role === "user" ? theme.brass : theme.panelSoft, color: m.role === "user" ? "#1B2420" : theme.text,
                padding: "10px 14px", borderRadius: 12, fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap",
              }}>{m.content}</div>
            </div>
          ))}
          {loading && (
            <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 8, color: theme.textFaint, fontSize: 13 }}>
              <Loader2 size={14} className="spin" style={{ animation: "spin 1s linear infinite" }} /> Thinking through your portfolio…
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, padding: 14, borderTop: `1px solid ${theme.border}` }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
            placeholder="Ask about your portfolio…" style={{ ...inputStyle(theme), fontFamily: "Inter, sans-serif", flex: 1 }} />
          <button className="btn-primary" onClick={() => send()} style={{ display: "flex", alignItems: "center", gap: 6 }} disabled={loading}>
            <Send size={14} /> Send
          </button>
        </div>
      </Panel>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", color: theme.textFaint, fontWeight: 700, marginBottom: 4 }}>Quick Questions</div>
        {quick.map((q, i) => (
          <button key={i} className="btn-ghost" style={{ textAlign: "left" }} onClick={() => send(q)}>{q}</button>
        ))}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }`}</style>
    </div>
  );
}

/* ============================== REPORTS ============================== */

function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(v => typeof v === "string" && v.includes(",") ? `"${v}"` : v).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function Reports({ theme, properties, computed, totals }) {
  const exportPortfolio = () => {
    const rows = [["Property", "Type", "Value", "Equity", "Mortgage Balance", "Monthly Income", "Monthly Expenses", "Cash Flow", "Cap Rate", "CoC Return", "DSCR", "LTV"]];
    properties.forEach(p => { const c = computed[p.id]; rows.push([p.name, p.type, p.currentValue, Math.round(c.equity), Math.round(c.balance), c.grossIncome, Math.round(c.opEx + c.debtService), Math.round(c.cashFlow), c.capRate.toFixed(2), c.cashOnCash.toFixed(2), c.dscr.toFixed(2), c.ltv.toFixed(1)]); });
    downloadCSV("portfolio-summary.csv", rows);
  };
  const exportCashFlow = () => {
    const rows = [["Property", "Gross Income", "Operating Expenses", "Debt Service", "NOI", "Net Cash Flow", "Annual Cash Flow"]];
    properties.forEach(p => { const c = computed[p.id]; rows.push([p.name, c.grossIncome, Math.round(c.opEx), Math.round(c.debtService), Math.round(c.noi), Math.round(c.cashFlow), Math.round(c.annualCashFlow)]); });
    downloadCSV("cash-flow-report.csv", rows);
  };
  const exportMortgages = () => {
    const rows = [["Property", "Original Loan", "Current Balance", "Rate", "Term", "Monthly P&I", "Principal Portion", "Interest Portion"]];
    properties.forEach(p => { const c = computed[p.id]; rows.push([p.name, p.loan.original, Math.round(c.balance), p.loan.rate, p.loan.term, Math.round(c.monthlyPI), Math.round(c.principalPortion), Math.round(c.interestPortion)]); });
    downloadCSV("mortgage-balances.csv", rows);
  };
  const exportTax = () => {
    const rows = [["Property", "Gross Rental Income", "Property Taxes", "Insurance", "Management", "Maintenance", "CapEx", "Mortgage Interest (monthly)", "Total Deductible Expenses (approx)"]];
    properties.forEach(p => { const c = computed[p.id]; const ded = p.expenses.taxes + p.expenses.insurance + p.expenses.management + p.expenses.maintenance + c.interestPortion; rows.push([p.name, c.grossIncome, p.expenses.taxes, p.expenses.insurance, p.expenses.management, p.expenses.maintenance, p.expenses.capex, Math.round(c.interestPortion), Math.round(ded)]); });
    downloadCSV("tax-summary.csv", rows);
  };

  const items = [
    { title: "Portfolio Summary", desc: "All properties with equity, cash flow, and return metrics.", action: exportPortfolio },
    { title: "Cash Flow Report", desc: "Monthly income, expenses, NOI, and net cash flow by property.", action: exportCashFlow },
    { title: "Mortgage Balances", desc: "Loan balances, rates, and P&I split by property.", action: exportMortgages },
    { title: "Tax Income/Expense Summary", desc: "Approximate deductible expense categories per property.", action: exportTax },
  ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        {items.map((it, i) => (
          <Panel key={i} theme={theme} style={{ padding: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: "Fraunces, serif", fontWeight: 600, fontSize: 15 }}>{it.title}</div>
              <div style={{ fontSize: 12, color: theme.textFaint, marginTop: 3 }}>{it.desc}</div>
            </div>
            <button className="btn-ghost" onClick={it.action} style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}><Download size={14} /> CSV</button>
          </Panel>
        ))}
      </div>
      <SectionLabel theme={theme}>Portfolio Snapshot</SectionLabel>
      <Panel theme={theme} style={{ padding: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, fontFamily: "IBM Plex Mono, monospace" }}>
          <Row theme={theme} label="Total Value" value={fmtUSD(totals.value, { compact: true })} />
          <Row theme={theme} label="Total Equity" value={fmtUSD(totals.equity, { compact: true })} />
          <Row theme={theme} label="Total Debt" value={fmtUSD(totals.debt, { compact: true })} />
          <Row theme={theme} label="Net Cash Flow" value={fmtUSD(totals.cashFlow)} />
        </div>
      </Panel>
    </div>
  );
}

/* ============================== SETTINGS ============================== */

function SettingsView({ theme, mode, setMode }) {
  return (
    <div style={{ maxWidth: 560 }}>
      <Panel theme={theme} style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontFamily: "Fraunces, serif", fontWeight: 600, marginBottom: 4 }}>Appearance</div>
        <div style={{ fontSize: 12.5, color: theme.textFaint, marginBottom: 14 }}>Choose how Ledgerstone looks on your screen.</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className={`tab-btn ${mode === "dark" ? "active" : ""}`} onClick={() => setMode("dark")} style={{ display: "flex", alignItems: "center", gap: 6 }}><Moon size={14} /> Dark</button>
          <button className={`tab-btn ${mode === "light" ? "active" : ""}`} onClick={() => setMode("light")} style={{ display: "flex", alignItems: "center", gap: 6 }}><Sun size={14} /> Light</button>
        </div>
      </Panel>
      <Panel theme={theme} style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontFamily: "Fraunces, serif", fontWeight: 600, marginBottom: 4 }}>Data</div>
        <div style={{ fontSize: 12.5, color: theme.textFaint, lineHeight: 1.6 }}>
          This preview runs on realistic sample properties so every calculation is populated immediately. Connecting your own data source (spreadsheet import, MLS feed, or property management system) is the natural next step.
        </div>
      </Panel>
      <Panel theme={theme} style={{ padding: 20 }}>
        <div style={{ fontFamily: "Fraunces, serif", fontWeight: 600, marginBottom: 4 }}>About</div>
        <div style={{ fontSize: 12.5, color: theme.textFaint, lineHeight: 1.6 }}>
          Ledgerstone is a real estate portfolio management and investment strategy workspace — track what you own, understand true cash flow, evaluate new deals, and plan how to grow.
        </div>
      </Panel>
    </div>
  );
}
