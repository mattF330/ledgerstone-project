import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  LayoutGrid, Building2, LineChart as LineChartIcon, Sparkles, Calculator,
  Settings as SettingsIcon, Plus, Search, Pencil, Trash2, X, ChevronLeft,
  TrendingUp, TrendingDown, AlertTriangle, Check, ChevronRight, RotateCcw,
  Sun, Moon, Newspaper, ExternalLink, ChevronDown, RefreshCw, Loader2,
  ShieldCheck, Landmark, Info, Mail, BellRing, Bot, Send, LogOut, Lock,
} from "lucide-react";

/* ============================== TOKENS ==============================
   Brand tokens (C) stay constant across light/dark mode — the sidebar,
   stat cards, tags, and gold accent are treated as fixed brand elements.
   Theme tokens (LIGHT / DARK) control the page background, card surfaces,
   body text, borders, and hover states, and are switched from Settings. */
const C = {
  ink: "#15140F",
  ink2: "#1E1C15",
  ivory: "#F6F2E8",
  gold: "#C6A15B",
  goldSoft: "rgba(198,161,91,0.16)",
  goldLine: "rgba(198,161,91,0.45)",
  green: "#3F6B4A",
  greenSoft: "rgba(63,107,74,0.12)",
  rust: "#A6543A",
  rustSoft: "rgba(166,84,58,0.12)",
  lineOnDark: "rgba(246,242,232,0.12)",
  mutedOnDark: "rgba(246,242,232,0.55)",
};

const LIGHT_THEME = {
  name: "light",
  bg: "#FBF9F4",
  surface: "#FFFFFF",
  text: "#15140F",
  muted: "#8A8372",
  border: "rgba(21,20,15,0.10)",
  inputBg: "#FFFFFF",
  overlay: "rgba(21,20,15,0.5)",
  hover: "#F6F2E8",
  chartGrid: "rgba(21,20,15,0.10)",
  chartAxis: "#8A8372",
};

const DARK_THEME = {
  name: "dark",
  bg: "#121110",
  surface: "#1C1A16",
  text: "#F1ECE0",
  muted: "rgba(241,236,224,0.55)",
  border: "rgba(255,255,255,0.09)",
  inputBg: "#221F19",
  overlay: "rgba(0,0,0,0.65)",
  hover: "rgba(255,255,255,0.06)",
  chartGrid: "rgba(255,255,255,0.09)",
  chartAxis: "rgba(241,236,224,0.5)",
};

const FONT_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,340;9..144,440;9..144,560&family=IBM+Plex+Sans:wght@400;500;600&display=swap');";

/* ============================== SUPABASE BACKEND ==============================
   Real backend for Ledgerstone. There is no npm/build step available in this
   environment, so instead of importing the @supabase/supabase-js package this
   talks directly to the same HTTP endpoints that package wraps (Auth/GoTrue and
   PostgREST) using fetch. Behaviorally this IS a real Supabase integration —
   real signup/login/session, real Postgres rows, real Row Level Security — it's
   just not going through the SDK's JS wrapper.

   Only the publishable (anon) key ships in this file, exactly as required —
   it has no special privileges on its own; every table request also carries the
   signed-in user's access token, and Postgres Row Level Security (policies
   created via the SQL script provided separately) is what actually restricts
   each user to their own rows. This file never sees a service-role/secret key.

   Session persistence: browser localStorage/sessionStorage are not available
   inside a Claude.ai artifact, so the session (access token, refresh token,
   expiry, user id/email) is persisted with this artifact's own per-user
   key-value storage (window.storage) instead. That keeps you signed in across
   visits to this artifact, the same job localStorage would do in a normal
   deployed app. */

const SUPABASE_URL = "https://kqtnzheqcmzbhxtnwikr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_yJfOjmCNtVfKsR-hYBdgRg_s7m9mJ7K";
const SESSION_STORAGE_KEY = "ledgerstone_supabase_session";

async function supaFetch(path, { method = "GET", auth, body, extraHeaders } = {}) {
  const headers = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${auth || SUPABASE_ANON_KEY}`,
    ...(extraHeaders || {}),
  };
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
  return res;
}

async function supaError(res, fallback) {
  let data = null;
  try { data = await res.json(); } catch (e) { /* ignore */ }
  return new Error(data?.error_description || data?.msg || data?.message || fallback);
}

const SupabaseAuth = {
  async signUp(email, password) {
    const res = await supaFetch("/auth/v1/signup", { method: "POST", body: { email, password } });
    if (!res.ok) throw await supaError(res, "Sign up failed. Please try again.");
    return res.json();
  },
  async signIn(email, password) {
    const res = await supaFetch("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
    if (!res.ok) throw await supaError(res, "Incorrect email or password.");
    return res.json();
  },
  async signOut(accessToken) {
    try { await supaFetch("/auth/v1/logout", { method: "POST", auth: accessToken }); } catch (e) { /* best effort */ }
  },
  async refresh(refreshToken) {
    const res = await supaFetch("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: refreshToken } });
    if (!res.ok) throw await supaError(res, "Your session expired. Please log in again.");
    return res.json();
  },
};

function sessionFromAuthResponse(data) {
  if (!data?.access_token || !data?.user) return null;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ? data.expires_in * 1000 : 3600 * 1000),
    userId: data.user.id,
    email: data.user.email,
  };
}

async function ensureFreshSession(session) {
  if (!session) return null;
  if (session.expiresAt - Date.now() > 60000) return session;
  try {
    const data = await SupabaseAuth.refresh(session.refreshToken);
    return sessionFromAuthResponse(data);
  } catch (e) {
    return null;
  }
}

async function saveStoredSession(session) {
  try {
    if (window.storage) await window.storage.set(SESSION_STORAGE_KEY, JSON.stringify(session), false);
  } catch (e) { /* best effort */ }
}
async function loadStoredSession() {
  try {
    if (!window.storage) return null;
    const r = await window.storage.get(SESSION_STORAGE_KEY, false);
    return r?.value ? JSON.parse(r.value) : null;
  } catch (e) {
    return null;
  }
}
async function clearStoredSession() {
  try {
    if (window.storage) await window.storage.delete(SESSION_STORAGE_KEY, false);
  } catch (e) { /* best effort */ }
}

const SupabaseDB = {
  async select(table, session, query = "select=*") {
    const res = await supaFetch(`/rest/v1/${table}?${query}`, { auth: session.accessToken });
    if (!res.ok) throw await supaError(res, `Couldn't load ${table}.`);
    return res.json();
  },
  async insert(table, session, rows) {
    const res = await supaFetch(`/rest/v1/${table}`, {
      method: "POST",
      auth: session.accessToken,
      body: rows,
      extraHeaders: { Prefer: "return=representation" },
    });
    if (!res.ok) throw await supaError(res, `Couldn't save to ${table}.`);
    return res.json();
  },
  async update(table, session, match, patch) {
    const res = await supaFetch(`/rest/v1/${table}?${match}`, {
      method: "PATCH",
      auth: session.accessToken,
      body: patch,
      extraHeaders: { Prefer: "return=representation" },
    });
    if (!res.ok) throw await supaError(res, `Couldn't update ${table}.`);
    return res.json();
  },
  async remove(table, session, match) {
    const res = await supaFetch(`/rest/v1/${table}?${match}`, { method: "DELETE", auth: session.accessToken });
    if (!res.ok) throw await supaError(res, `Couldn't delete from ${table}.`);
    return true;
  },
};

// --- profiles -----------------------------------------------------------
async function fetchProfile(session) {
  const rows = await SupabaseDB.select("profiles", session, `select=*&id=eq.${session.userId}`);
  return rows[0] || null;
}
async function ensureProfile(session) {
  const existing = await fetchProfile(session);
  if (existing) return existing;
  const inserted = await SupabaseDB.insert("profiles", session, [
    { id: session.userId, email: session.email, display_name: "My Portfolio" },
  ]);
  return inserted[0];
}
async function updateProfileDisplayName(session, name) {
  const rows = await SupabaseDB.update("profiles", session, `id=eq.${session.userId}`, { display_name: name });
  return rows[0];
}

// --- properties: camelCase (app) <-> snake_case (Postgres) --------------
function propertyToRow(p, userId) {
  return {
    user_id: userId,
    name: p.name,
    address: p.address,
    type: p.type,
    purchase_price: p.purchasePrice,
    purchase_date: p.purchaseDate || null,
    current_value: p.currentValue,
    units: p.units,
    sqft: p.sqft,
    occupancy_pct: p.occupancyPct,
    monthly_rent: p.monthlyRent,
    other_income: p.otherIncome,
    property_taxes: p.propertyTaxes,
    insurance: p.insurance,
    maintenance: p.maintenance,
    property_management: p.propertyManagement,
    hoa: p.hoa,
    utilities: p.utilities,
    vacancy_pct: p.vacancyPct,
    capex: p.capex,
    other_expenses: p.otherExpenses,
    down_payment: p.downPayment,
    interest_rate: p.interestRate,
    loan_term_years: p.loanTermYears,
    closing_costs: p.closingCosts,
    rehab_costs: p.rehabCosts,
  };
}
function rowToProperty(r) {
  return {
    id: r.id,
    name: r.name,
    address: r.address,
    type: r.type,
    purchasePrice: num(r.purchase_price),
    purchaseDate: r.purchase_date,
    currentValue: num(r.current_value),
    units: num(r.units),
    sqft: num(r.sqft),
    occupancyPct: num(r.occupancy_pct),
    monthlyRent: num(r.monthly_rent),
    otherIncome: num(r.other_income),
    propertyTaxes: num(r.property_taxes),
    insurance: num(r.insurance),
    maintenance: num(r.maintenance),
    propertyManagement: num(r.property_management),
    hoa: num(r.hoa),
    utilities: num(r.utilities),
    vacancyPct: num(r.vacancy_pct),
    capex: num(r.capex),
    otherExpenses: num(r.other_expenses),
    downPayment: num(r.down_payment),
    interestRate: num(r.interest_rate),
    loanTermYears: num(r.loan_term_years),
    closingCosts: num(r.closing_costs),
    rehabCosts: num(r.rehab_costs),
  };
}
async function fetchPropertiesForUser(session) {
  const rows = await SupabaseDB.select("properties", session, `select=*&user_id=eq.${session.userId}&order=created_at.asc`);
  return rows.map(rowToProperty);
}
async function insertPropertyRow(session, property) {
  const rows = await SupabaseDB.insert("properties", session, [propertyToRow(property, session.userId)]);
  return rowToProperty(rows[0]);
}
async function updatePropertyRow(session, id, patchProperty) {
  const rows = await SupabaseDB.update("properties", session, `id=eq.${id}&user_id=eq.${session.userId}`, propertyToRow(patchProperty, session.userId));
  return rowToProperty(rows[0]);
}
async function deletePropertyRow(session, id) {
  await SupabaseDB.remove("properties", session, `id=eq.${id}&user_id=eq.${session.userId}`);
}
async function bulkInsertProperties(session, properties) {
  const rows = properties.map((p) => propertyToRow(p, session.userId));
  const inserted = await SupabaseDB.insert("properties", session, rows);
  return inserted.map(rowToProperty);
}
async function deleteAllPropertiesForUser(session) {
  await SupabaseDB.remove("properties", session, `user_id=eq.${session.userId}`);
}

/* ============================== HELPERS ============================== */
let _id = 100;
const uid = () => `p_${_id++}_${Math.random().toString(36).slice(2, 7)}`;

const todayISO = () => new Date().toISOString().slice(0, 10);

const fmtMoney = (n, decimals = 0) => {
  if (n === null || n === undefined || isNaN(n)) return "$0";
  const sign = n < 0 ? "-" : "";
  return (
    sign +
    "$" +
    Math.abs(n).toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
};
const fmtPct = (n, decimals = 1) => {
  if (n === null || n === undefined || isNaN(n)) return "0.0%";
  return (n * 100).toFixed(decimals) + "%";
};
const fmtNum = (n) => (n === null || n === undefined || isNaN(n) ? "0" : n.toLocaleString("en-US"));

function monthsBetween(dateStr, now = new Date()) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  return Math.max(months, 0);
}

function calcMonthlyPayment(principal, annualRatePct, years) {
  const r = annualRatePct / 100 / 12;
  const n = Math.round(years * 12);
  if (n <= 0) return 0;
  if (r === 0) return principal / n;
  const pow = Math.pow(1 + r, n);
  return (principal * r * pow) / (pow - 1);
}

function amortize(principal, annualRatePct, years, monthsElapsed) {
  const payment = calcMonthlyPayment(principal, annualRatePct, years);
  const r = annualRatePct / 100 / 12;
  let balance = principal;
  let interestPaid = 0,
    principalPaid = 0;
  const n = Math.min(monthsElapsed, Math.round(years * 12));
  for (let i = 0; i < n; i++) {
    if (balance <= 0) break;
    const interest = balance * r;
    let princ = payment - interest;
    if (princ > balance) princ = balance;
    balance -= princ;
    interestPaid += interest;
    principalPaid += princ;
  }
  return { payment, balance: Math.max(balance, 0), interestPaid, principalPaid };
}

function getPropertyMetrics(p) {
  const loanAmount = Math.max(p.purchasePrice - p.downPayment, 0);
  const monthsElapsed = monthsBetween(p.purchaseDate);
  const amort = amortize(loanAmount, p.interestRate, p.loanTermYears, monthsElapsed);
  const grossIncome = p.monthlyRent + p.otherIncome;
  const vacancyLoss = p.monthlyRent * (p.vacancyPct / 100);
  const effectiveIncome = grossIncome - vacancyLoss;
  const operatingExpenses =
    p.propertyTaxes + p.insurance + p.maintenance + p.propertyManagement + p.hoa + p.utilities + p.capex + p.otherExpenses;
  const noi = effectiveIncome - operatingExpenses;
  const monthlyPayment = amort.payment;
  const cashFlow = noi - monthlyPayment;
  const annualCashFlow = cashFlow * 12;
  const equity = p.currentValue - amort.balance;
  const ltv = p.currentValue > 0 ? amort.balance / p.currentValue : 0;
  const capRate = p.currentValue > 0 ? (noi * 12) / p.currentValue : 0;
  const totalCashInvested = p.downPayment + p.closingCosts + p.rehabCosts;
  const cashOnCash = totalCashInvested > 0 ? annualCashFlow / totalCashInvested : 0;
  const appreciationGain = p.currentValue - p.purchasePrice;
  const roi = totalCashInvested > 0 ? (annualCashFlow + appreciationGain) / totalCashInvested : 0;
  return {
    loanAmount,
    mortgageBalance: amort.balance,
    monthlyPayment,
    principalPaid: amort.principalPaid,
    interestPaid: amort.interestPaid,
    grossIncome,
    vacancyLoss,
    effectiveIncome,
    operatingExpenses,
    noi,
    cashFlow,
    annualCashFlow,
    equity,
    ltv,
    capRate,
    totalCashInvested,
    cashOnCash,
    roi,
    appreciationGain,
  };
}

function computePortfolioTotals(properties) {
  const list = properties.map((p) => ({ p, m: getPropertyMetrics(p) }));
  const totalValue = list.reduce((s, x) => s + x.p.currentValue, 0);
  const totalDebt = list.reduce((s, x) => s + x.m.mortgageBalance, 0);
  const totalEquity = totalValue - totalDebt;
  const monthlyIncome = list.reduce((s, x) => s + x.m.effectiveIncome, 0);
  const monthlyExpenses = list.reduce((s, x) => s + x.m.operatingExpenses, 0);
  const monthlyCashFlow = list.reduce((s, x) => s + x.m.cashFlow, 0);
  const annualCashFlow = monthlyCashFlow * 12;
  const totalNOI = list.reduce((s, x) => s + x.m.noi, 0);
  const totalCashInvested = list.reduce((s, x) => s + x.m.totalCashInvested, 0);
  const ltv = totalValue > 0 ? totalDebt / totalValue : 0;
  const capRate = totalValue > 0 ? (totalNOI * 12) / totalValue : 0;
  const cashOnCash = totalCashInvested > 0 ? annualCashFlow / totalCashInvested : 0;
  return {
    list, totalValue, totalDebt, totalEquity, monthlyIncome, monthlyExpenses,
    monthlyCashFlow, annualCashFlow, ltv, capRate, cashOnCash,
  };
}

const PROPERTY_TYPES = ["Single-Family", "Duplex", "Condo", "Townhouse", "Multi-Family", "Commercial"];

/* ============================== DAILY BRIEFING (rule-based, no AI API) ==============================
   This feature does not call Claude, Anthropic, OpenAI, or any other AI API, and requires no API key.
   NEWS_DATA below is a small curated snapshot of real, verifiable news (real source, headline, date,
   and URL) that a future version would replace with a live news/RSS feed. Everything else — relevance
   scoring, "why it matters" text, impact labels, and the outlook — is computed locally with plain
   JavaScript rules against the user's actual portfolio data. If NEWS_DATA is ever empty (e.g. a feed
   fails to load in a future version), the UI shows a clean "unavailable" state instead of inventing news. */

const BRIEFING_INTERESTS = [
  "Mortgage rates", "Housing market", "Rental market", "Economy", "Taxes", "Insurance",
  "Landlord regulations", "Local legislation", "Construction", "Commercial real estate",
  "Multifamily", "Single-family rentals",
];

const DEFAULT_BRIEFING_PREFS = {
  interests: ["Mortgage rates", "Housing market", "Rental market", "Insurance", "Landlord regulations"],
  geoInterests: "",
  length: "standard",
};

const CATEGORY_INTEREST = {
  financing: "Mortgage rates",
  market: "Housing market",
  rental: "Rental market",
  insurance: "Insurance",
  regulation: "Landlord regulations",
};
const CATEGORY_LABEL = {
  financing: "Financing",
  market: "Housing market",
  rental: "Rental market",
  insurance: "Insurance",
  regulation: "Regulation",
};

function parseAddress(address) {
  const parts = String(address || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { city: parts[parts.length - 2], state: parts[parts.length - 1] };
  return { city: "", state: "" };
}

// Curated snapshot of real, sourced news (captured September 3, 2026). Each entry cites a real
// publication, a real publication date, and a real URL — nothing here is invented.
const NEWS_DATA = [
  {
    id: "mortgage-rate-671",
    category: "financing",
    national: true,
    headline: "30-year mortgage rate climbs to 6.71%",
    source: "Freddie Mac",
    sourceType: "primary",
    url: "https://www.freddiemac.com/pmms",
    publishedDate: "September 3, 2026",
    summary:
      "Freddie Mac's weekly Primary Mortgage Market Survey put the average 30-year fixed mortgage rate at 6.71%, up from 6.66% a week earlier and 6.50% a year ago. The 15-year rate rose to 6.04%.",
    affectedAreas: ["Financing", "Acquisition strategy", "Refinancing"],
    baseImpact: "negative",
    baseImpactLevel: "moderate",
  },
  {
    id: "fed-hold-july",
    category: "financing",
    national: true,
    headline: "Fed holds rates steady; next decision due September 16",
    source: "Federal Reserve",
    sourceType: "primary",
    url: "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260729a.htm",
    publishedDate: "July 29, 2026",
    summary:
      "The Federal Open Market Committee voted to keep the federal funds rate target range at 3.5%–3.75%, noting inflation remains elevated relative to its 2% goal. The next rate decision is scheduled for September 16, 2026.",
    affectedAreas: ["Financing", "Acquisition strategy"],
    baseImpact: "neutral",
    baseImpactLevel: "moderate",
  },
  {
    id: "sc-insurance",
    category: "insurance",
    state: "SC",
    headline: "Home insurance costs keep climbing; South Carolina among the hardest hit",
    source: "Insurify",
    sourceType: "secondary",
    url: "https://insurify.com/homeowners-insurance/report/home-insurance-price-projections/",
    publishedDate: "March 17, 2026",
    summary:
      "Insurify's annual report found homeowners insurance premiums rising nationally for a fifth straight year, with South Carolina one of six states where rates jumped at least 20% over the past year, driven by storm losses and reinsurance costs.",
    affectedAreas: ["Expenses", "Existing properties"],
    baseImpact: "negative",
    baseImpactLevel: "high",
  },
  {
    id: "columbus-registry",
    category: "regulation",
    state: "OH",
    city: "Columbus",
    headline: "Columbus enacts citywide rental registry and inspection ordinance",
    source: "Scioto Title",
    sourceType: "secondary",
    url: "https://www.sciototitle.com/scioto-blog/columbus-city-council-passes-rental-registry-and-property-inspection-ordinance",
    publishedDate: "April 20, 2026",
    summary:
      "Columbus City Council passed an ordinance creating Columbus City Code Chapter 4515, requiring every residential rental property in city limits to register annually with the city and comply with new inspection requirements.",
    affectedAreas: ["Existing properties", "Expenses", "Acquisition strategy"],
    baseImpact: "negative",
    baseImpactLevel: "moderate",
  },
  {
    id: "austin-multifamily",
    category: "rental",
    state: "TX",
    city: "Austin",
    propertyTypes: ["Multi-Family", "Duplex"],
    headline: "Austin apartment rents rise for the first time since 2022 as supply glut eases",
    source: "CRE Daily",
    sourceType: "secondary",
    url: "https://www.credaily.com/briefs/austin-multifamily-rents-rise-as-supply-glut-starts-to-ease/",
    publishedDate: "July 19, 2026",
    summary:
      "Austin market-rate apartment rents rose 1.3% in Q2 2026, the first quarterly gain since 2022, as new construction slows following nearly 97,000 units delivered since 2020 (RealPage Analytics, via CRE Daily).",
    affectedAreas: ["Rental income", "Cash flow", "Austin market"],
    baseImpact: "positive",
    baseImpactLevel: "moderate",
  },
  {
    id: "omaha-market",
    category: "market",
    state: "NE",
    city: "Omaha",
    headline: "Omaha home prices keep climbing in a competitive market",
    source: "Redfin",
    sourceType: "primary",
    url: "https://www.redfin.com/city/9417/NE/Omaha/housing-market",
    publishedDate: "Reported July 2026",
    summary:
      "Redfin rates the Omaha housing market 88 out of 100 for competitiveness, with the median home price up roughly 5% year over year to about $289,000 and homes selling in around 14 days.",
    affectedAreas: ["Property values", "Omaha market"],
    baseImpact: "positive",
    baseImpactLevel: "low",
  },
];

function matchesProperty(article, city, state) {
  if (article.city && state && article.city === city && article.state === state) return "city";
  if (article.state && article.state === state) return "state";
  return null;
}

function scoreArticle(article, properties, totals, prefs) {
  let score = article.national ? 12 : 0;
  const propTypes = new Set(properties.map((p) => p.type));
  const hasDebt = totals.totalDebt > 0;
  const hasRentalIncome = properties.some((p) => p.monthlyRent > 0);

  let bestMatch = null;
  properties.forEach((p) => {
    const { city, state } = parseAddress(p.address);
    const m = matchesProperty(article, city, state);
    if (m === "city") { score += 50; bestMatch = "city"; }
    else if (m === "state" && bestMatch !== "city") { score += 32; bestMatch = "state"; }
  });

  if (article.propertyTypes && article.propertyTypes.some((t) => propTypes.has(t))) score += 15;
  if (article.category === "financing" && hasDebt) score += 20;
  if (article.category === "rental" && hasRentalIncome) score += 12;
  if ((article.category === "insurance" || article.category === "regulation") && properties.length > 0) score += 8;

  if (prefs.interests.includes(CATEGORY_INTEREST[article.category])) score += 15;

  const geo = prefs.geoInterests.trim().toLowerCase();
  if (geo) {
    if (article.city && geo.includes(article.city.toLowerCase())) score += 25;
    else if (article.state && geo.includes(article.state.toLowerCase())) score += 18;
  }

  score += article.baseImpactLevel === "high" ? 6 : article.baseImpactLevel === "moderate" ? 3 : 0;
  return { score, bestMatch };
}

function matchingProperties(article, properties) {
  return properties.filter((p) => {
    const { city, state } = parseAddress(p.address);
    return matchesProperty(article, city, state) !== null;
  });
}

function whyItMattersFor(article, properties, totals) {
  const matches = matchingProperties(article, properties);
  switch (article.category) {
    case "financing": {
      if (totals.totalDebt <= 0) {
        return "Your portfolio currently carries no mortgage debt, so this has limited effect on existing loans, though it could affect the cost of financing future purchases.";
      }
      return `Your portfolio carries ${fmtMoney(totals.totalDebt)} in mortgage debt across ${properties.length} ${properties.length === 1 ? "property" : "properties"} at a portfolio LTV of ${fmtPct(totals.ltv)}, so this could affect refinancing costs and the economics of future acquisitions.`;
    }
    case "insurance": {
      if (matches.length === 0) return "You don't currently own property in this state, but it's a useful signal for where insurance costs are trending nationally.";
      const names = matches.map((p) => p.name).join(", ");
      return `You own ${matches.length} ${matches.length === 1 ? "property" : "properties"} in this market (${names}), so rising insurance costs here could directly increase operating expenses.`;
    }
    case "regulation": {
      if (matches.length === 0) return "You don't currently own property in this city, but similar rules have been spreading to other markets.";
      const names = matches.map((p) => p.name).join(", ");
      return `${names} ${matches.length === 1 ? "is" : "are"} located in this city, so new compliance requirements like this could add administrative work and cost.`;
    }
    case "rental": {
      if (matches.length === 0) return "You don't currently own property in this market, but it may be relevant if you're evaluating acquisitions there.";
      const cf = matches.reduce((s, p) => s + getPropertyMetrics(p).cashFlow, 0);
      const names = matches.map((p) => p.name).join(", ");
      return `${names} ${matches.length === 1 ? "is" : "are"} in this market, currently generating ${fmtMoney(cf)}/mo in combined cash flow, so shifts in local rents could affect that income directly.`;
    }
    case "market": {
      if (matches.length === 0) return "You don't currently own property in this market, but it may be worth watching if you're targeting this area.";
      const value = matches.reduce((s, p) => s + p.currentValue, 0);
      const names = matches.map((p) => p.name).join(", ");
      return `${names} ${matches.length === 1 ? "is" : "are"} located here, with a combined estimated value of ${fmtMoney(value)}, so price trends in this market could affect your equity.`;
    }
    default:
      return "";
  }
}

function takeawayFor(article) {
  switch (article.category) {
    case "financing": return "This could affect borrowing costs and financing conditions for future purchases.";
    case "insurance": return "This could affect operating expenses for properties in the affected area.";
    case "regulation": return "This could affect compliance requirements and operating costs for properties in the affected area.";
    case "rental": return "This could affect rental income and cash flow in the affected market.";
    case "market": return "This could affect property values and potential equity growth.";
    default: return "";
  }
}

function marketLabel(article) {
  return article.city && article.state ? `${article.city}, ${article.state}` : article.state || "National";
}

function buildBriefing(properties, prefs) {
  if (!NEWS_DATA.length) return { unavailable: true };

  const totals = computePortfolioTotals(properties);
  const storyCount = prefs.length === "short" ? 2 : prefs.length === "detailed" ? 6 : 4;

  const propStates = new Set(properties.map((p) => parseAddress(p.address).state));
  const propCities = new Set(properties.map((p) => parseAddress(p.address).city));

  const candidates = NEWS_DATA.filter((a) => {
    const interestSelected = prefs.interests.includes(CATEGORY_INTEREST[a.category]);
    const geoMatch = (a.city && propCities.has(a.city)) || (a.state && propStates.has(a.state));
    return interestSelected || geoMatch;
  });

  const ranked = candidates
    .map((a) => ({ article: a, ...scoreArticle(a, properties, totals, prefs) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, storyCount);

  const topStories = ranked.map(({ article }) => ({
    headline: article.headline,
    source: article.source,
    sourceType: article.sourceType,
    url: article.url,
    publishedDate: article.publishedDate,
    category: CATEGORY_LABEL[article.category],
    relevance: matchingProperties(article, properties).length > 0 ? "Your markets" : article.national ? "National" : "Watchlist",
    summary: article.summary,
    whyItMatters: whyItMattersFor(article, properties, totals),
    impact: article.baseImpact,
    impactLevel: article.baseImpactLevel,
    affectedAreas: article.affectedAreas,
    market: marketLabel(article),
    takeaway: takeawayFor(article),
  }));

  const marketsInPortfolio = [...new Set(properties.map((p) => marketLabel(parseAddress(p.address))))].filter(Boolean);
  const marketWatch = marketsInPortfolio
    .map((market) => {
      const [city, state] = market.split(", ");
      const items = NEWS_DATA.filter((a) => (a.city && a.city === city) || (!a.city && a.state === state)).map(
        (a) => `${CATEGORY_LABEL[a.category]}: ${a.headline}`
      );
      return { market, items };
    })
    .filter((m) => m.items.length > 0)
    .slice(0, 3);

  const financingWatch = NEWS_DATA.filter((a) => a.category === "financing").map(
    (a) => `${a.headline} — ${a.source}, ${a.publishedDate}`
  ).slice(0, 4);

  const posCount = topStories.filter((s) => s.impact === "positive").length;
  const negCount = topStories.filter((s) => s.impact === "negative").length;

  let label = "Neutral";
  if (posCount === 0 && negCount === 0) label = "Neutral";
  else if (posCount > negCount * 1.5) label = "Positive";
  else if (negCount > posCount * 1.5) label = "Negative";
  else label = "Mixed";

  const outlookSummary = topStories.length
    ? `Of today's ${topStories.length} most relevant ${topStories.length === 1 ? "story" : "stories"}, ${posCount} lean favorable for your portfolio and ${negCount} could raise costs or add friction. With a portfolio LTV of ${fmtPct(totals.ltv)} and monthly cash flow of ${fmtMoney(totals.monthlyCashFlow)}, financing and local compliance costs are the categories most worth monitoring.`
    : "No stories matched your current filters and portfolio today — try widening your news interests or geographic focus.";

  const portfolioImpactSummary = properties.length
    ? `Existing properties: ${negCount > posCount ? "modestly exposed to rising costs" : "relatively insulated"} from today's coverage. Cash flow: currently ${fmtMoney(totals.monthlyCashFlow)}/mo, ${totals.monthlyCashFlow >= 0 ? "positive" : "negative"}. Financing: ${totals.totalDebt > 0 ? `${fmtMoney(totals.totalDebt)} in debt at ${fmtPct(totals.ltv)} LTV could see refinancing costs shift with rate movement.` : "no outstanding mortgage debt to refinance."} Future acquisitions: elevated rates may reduce projected cash flow on new purchases financed at similar terms.`
    : "Add properties to see how today's coverage could affect your existing debt, cash flow, and equity.";

  const personalizationLevel = properties.length === 0 ? "limited" : marketsInPortfolio.some((m) => marketWatch.some((mw) => mw.market === m)) ? "full" : "partial";

  return {
    personalizationLevel,
    topStories,
    marketWatch,
    financingWatch,
    portfolioImpactSummary,
    outlook: { label, summary: outlookSummary },
  };
}

/* ============================== PERSONAL AI ASSISTANT ==============================
   This is the ONLY feature in the app that calls an AI API. It is fully isolated behind
   the AIService object below — no other part of the app (including Daily Briefing, which
   remains rule-based and API-free) imports or depends on it.

   No API key ever appears in this code, in the browser, or in any client-side storage.
   Requests go to Anthropic's /v1/messages endpoint through this environment's built-in
   artifact proxy, which authenticates the request server-side — the browser bundle itself
   never holds, sends, or has access to a credential. That is the "secure server-side
   architecture" requirement translated to a environment with no custom backend of its own.

   The assistant is never allowed to invent numbers: any calculation it needs is performed
   by calling one of a small allowlist of tools below, each of which reuses this app's real
   calculation primitives (calcMonthlyPayment, getPropertyMetrics, computePortfolioTotals).
   The tools can only read/compute — none of them can create, edit, or delete a property. */

const num = (v) => (typeof v === "number" && !isNaN(v) ? v : parseFloat(v) || 0);
const round = (v, d = 0) => {
  const f = Math.pow(10, d);
  return Math.round((Number(v) || 0) * f) / f;
};

function buildPortfolioContext(properties) {
  const totals = computePortfolioTotals(properties);
  return {
    portfolio: {
      propertyCount: properties.length,
      totalValue: round(totals.totalValue),
      totalEquity: round(totals.totalEquity),
      totalDebt: round(totals.totalDebt),
      ltv: round(totals.ltv * 100, 1),
      monthlyIncome: round(totals.monthlyIncome),
      monthlyExpenses: round(totals.monthlyExpenses),
      monthlyCashFlow: round(totals.monthlyCashFlow),
      annualCashFlow: round(totals.annualCashFlow),
      capRatePct: round(totals.capRate * 100, 2),
      cashOnCashPct: round(totals.cashOnCash * 100, 2),
    },
    properties: properties.map((p) => {
      const m = getPropertyMetrics(p);
      const { city, state } = parseAddress(p.address);
      return {
        id: p.id,
        name: p.name,
        type: p.type,
        location: city && state ? `${city}, ${state}` : p.address,
        units: p.units,
        purchasePrice: round(p.purchasePrice),
        purchaseDate: p.purchaseDate,
        currentValue: round(p.currentValue),
        equity: round(m.equity),
        mortgageBalance: round(m.mortgageBalance),
        ltvPct: round(m.ltv * 100, 1),
        interestRatePct: p.interestRate,
        loanTermYears: p.loanTermYears,
        monthlyPayment: round(m.monthlyPayment),
        monthlyRent: round(p.monthlyRent),
        otherIncome: round(p.otherIncome),
        vacancyPct: p.vacancyPct,
        operatingExpenses: round(m.operatingExpenses),
        noi: round(m.noi),
        monthlyCashFlow: round(m.cashFlow),
        annualCashFlow: round(m.annualCashFlow),
        capRatePct: round(m.capRate * 100, 2),
        cashOnCashPct: round(m.cashOnCash * 100, 2),
        roiPct: round(m.roi * 100, 2),
      };
    }),
  };
}

const ASSISTANT_SYSTEM_PROMPT = `You are the Personal AI Assistant built into Ledgerstone, a real-estate portfolio tracker. You are a portfolio-aware investment copilot, not a generic chatbot.

Rules you always follow:
- The user's real, current portfolio is provided below as JSON. Treat it as ground truth. Never invent property details, financial figures, interest rates, market data, or sources that aren't in it or returned by a tool.
- For ANY calculation — a mortgage payment, NOI, cash flow, cap rate, cash-on-cash return, LTV, or any "what if" scenario — you MUST call the matching tool instead of doing the arithmetic yourself. Never state a computed number that didn't come from a tool result.
- Always label a tool result built from hypothetical inputs as a "Hypothetical Scenario." It never changes the user's actual portfolio.
- If a question needs information that isn't in the portfolio context, say exactly what's missing instead of guessing.
- Never present an uncertain outcome as guaranteed advice. Avoid phrasing like "you should definitely...". Prefer "based on the assumptions entered, this produces an estimated X%."
- Keep answers concise and investor-focused. Use a short **Answer**, then a **Key numbers** bullet list when numbers are involved, then a brief **What matters** line when useful. Use a markdown table only when comparing multiple properties.
- You cannot create, edit, or delete portfolio data, run purchases, or change settings. If asked, explain that you can only analyze and calculate, and name the page where the user can make that change themselves (Properties, Strategy, Calculators, Analytics, Settings).
- When a specific property or app page is clearly relevant to your answer, mention it by its exact name so the app can offer a shortcut.`;

const ASSISTANT_TOOLS = [
  {
    name: "calculate_mortgage",
    description: "Calculate a mortgage payment breakdown for a hypothetical or specified loan. Always use this instead of computing mortgage math yourself.",
    input_schema: {
      type: "object",
      properties: {
        purchasePrice: { type: "number" },
        downPayment: { type: "number" },
        interestRate: { type: "number", description: "Annual rate as a percentage, e.g. 6.5" },
        loanTermYears: { type: "number" },
        propertyTaxes: { type: "number", description: "Monthly" },
        insurance: { type: "number", description: "Monthly" },
        hoa: { type: "number", description: "Monthly" },
      },
      required: ["purchasePrice", "downPayment", "interestRate", "loanTermYears"],
    },
  },
  {
    name: "calculate_cashflow_scenario",
    description: "Calculate NOI, cash flow, cap rate, cash-on-cash return, and LTV for a hypothetical property purchase or rental scenario. Always use this instead of computing these yourself.",
    input_schema: {
      type: "object",
      properties: {
        purchasePrice: { type: "number" },
        downPayment: { type: "number" },
        interestRate: { type: "number" },
        loanTermYears: { type: "number" },
        monthlyRent: { type: "number" },
        otherIncome: { type: "number" },
        propertyTaxes: { type: "number" },
        insurance: { type: "number" },
        maintenance: { type: "number" },
        propertyManagement: { type: "number" },
        hoa: { type: "number" },
        utilities: { type: "number" },
        vacancyPct: { type: "number" },
        capex: { type: "number" },
        otherExpenses: { type: "number" },
      },
      required: ["purchasePrice", "downPayment", "interestRate", "loanTermYears", "monthlyRent"],
    },
  },
  {
    name: "adjust_existing_property",
    description:
      "Recalculate an existing portfolio property's (or the whole portfolio's) metrics after a hypothetical change — a rent %, expense %, interest-rate percentage-point change, value %, or a debt paydown amount. Use the exact property id from the portfolio context, or 'portfolio' for a portfolio-wide change. Always use this instead of estimating the effect yourself.",
    input_schema: {
      type: "object",
      properties: {
        propertyId: { type: "string", description: "An exact id from the portfolio context, or 'portfolio'." },
        rentDeltaPct: { type: "number", description: "e.g. 5 for +5%, -5 for -5%" },
        expenseDeltaPct: { type: "number" },
        interestRateDeltaPct: { type: "number", description: "Percentage points, e.g. 1 for +1 point" },
        valueDeltaPct: { type: "number" },
        debtPaydown: { type: "number", description: "Dollar amount of extra principal paid down today" },
      },
      required: ["propertyId"],
    },
  },
];

function execCalculateMortgage(args) {
  const loan = Math.max(num(args.purchasePrice) - num(args.downPayment), 0);
  const payment = calcMonthlyPayment(loan, num(args.interestRate), num(args.loanTermYears) || 30);
  const total = payment + num(args.propertyTaxes) + num(args.insurance) + num(args.hoa);
  return {
    hypothetical: true,
    loanAmount: round(loan),
    monthlyPrincipalAndInterest: round(payment, 2),
    monthlyPropertyTax: round(num(args.propertyTaxes)),
    monthlyInsurance: round(num(args.insurance)),
    monthlyHOA: round(num(args.hoa)),
    totalMonthlyPayment: round(total, 2),
  };
}

function execCashflowScenario(args) {
  const loan = Math.max(num(args.purchasePrice) - num(args.downPayment), 0);
  const payment = calcMonthlyPayment(loan, num(args.interestRate), num(args.loanTermYears) || 30);
  const grossIncome = num(args.monthlyRent) + num(args.otherIncome);
  const vacancyLoss = num(args.monthlyRent) * (num(args.vacancyPct) / 100);
  const effectiveIncome = grossIncome - vacancyLoss;
  const totalExpenses =
    num(args.propertyTaxes) + num(args.insurance) + num(args.maintenance) + num(args.propertyManagement) +
    num(args.hoa) + num(args.utilities) + num(args.capex) + num(args.otherExpenses);
  const noi = effectiveIncome - totalExpenses;
  const cashFlow = noi - payment;
  const annualCashFlow = cashFlow * 12;
  const capRate = num(args.purchasePrice) > 0 ? (noi * 12) / num(args.purchasePrice) : 0;
  const cashOnCash = num(args.downPayment) > 0 ? annualCashFlow / num(args.downPayment) : 0;
  const ltv = num(args.purchasePrice) > 0 ? loan / num(args.purchasePrice) : 0;
  return {
    hypothetical: true,
    purchasePrice: round(num(args.purchasePrice)),
    downPayment: round(num(args.downPayment)),
    loanAmount: round(loan),
    monthlyPayment: round(payment, 2),
    grossMonthlyIncome: round(effectiveIncome),
    totalMonthlyExpenses: round(totalExpenses),
    noi: round(noi),
    monthlyCashFlow: round(cashFlow),
    annualCashFlow: round(annualCashFlow),
    capRate: `${round(capRate * 100, 2)}%`,
    cashOnCashReturn: `${round(cashOnCash * 100, 2)}%`,
    ltv: `${round(ltv * 100, 1)}%`,
  };
}

function scenarioAdjustedMetrics(p, args) {
  const base = getPropertyMetrics(p);
  const monthsElapsed = monthsBetween(p.purchaseDate);
  const remainingMonths = Math.max(Math.round(p.loanTermYears * 12) - monthsElapsed, 1);
  const remainingYears = remainingMonths / 12;

  let balance = base.mortgageBalance;
  if (args.debtPaydown) balance = Math.max(balance - num(args.debtPaydown), 0);

  const rate = p.interestRate + (num(args.interestRateDeltaPct) || 0);
  const payment = calcMonthlyPayment(balance, Math.max(rate, 0), remainingYears);

  const rentMult = 1 + (num(args.rentDeltaPct) || 0) / 100;
  const expenseMult = 1 + (num(args.expenseDeltaPct) || 0) / 100;
  const valueMult = 1 + (num(args.valueDeltaPct) || 0) / 100;

  const monthlyRent = p.monthlyRent * rentMult;
  const grossIncome = monthlyRent + p.otherIncome;
  const vacancyLoss = monthlyRent * (p.vacancyPct / 100);
  const effectiveIncome = grossIncome - vacancyLoss;
  const operatingExpenses = base.operatingExpenses * expenseMult;
  const noi = effectiveIncome - operatingExpenses;
  const cashFlow = noi - payment;
  const currentValue = p.currentValue * valueMult;
  const equity = currentValue - balance;
  const ltv = currentValue > 0 ? balance / currentValue : 0;
  const capRate = currentValue > 0 ? (noi * 12) / currentValue : 0;

  return {
    currentValue, mortgageBalance: balance, monthlyPayment: payment, equity, ltv, capRate,
    cashFlow, annualCashFlow: cashFlow * 12,
  };
}

function execAdjustProperty(args, properties) {
  if (!args.propertyId || args.propertyId === "portfolio") {
    const before = computePortfolioTotals(properties);
    const adjusted = properties.map((p) => {
      const a = scenarioAdjustedMetrics(p, args);
      return { currentValue: a.currentValue, debt: a.mortgageBalance, cashFlow: a.cashFlow };
    });
    const totalValue = adjusted.reduce((s, x) => s + x.currentValue, 0);
    const totalDebt = adjusted.reduce((s, x) => s + x.debt, 0);
    const monthlyCashFlow = adjusted.reduce((s, x) => s + x.cashFlow, 0);
    return {
      hypothetical: true,
      scope: "portfolio",
      before: { totalValue: round(before.totalValue), totalEquity: round(before.totalEquity), totalDebt: round(before.totalDebt), monthlyCashFlow: round(before.monthlyCashFlow), ltv: round(before.ltv * 100, 1) },
      after: {
        totalValue: round(totalValue), totalEquity: round(totalValue - totalDebt), totalDebt: round(totalDebt),
        monthlyCashFlow: round(monthlyCashFlow), ltv: round(totalValue > 0 ? (totalDebt / totalValue) * 100 : 0, 1),
      },
    };
  }
  const p = properties.find((x) => x.id === args.propertyId);
  if (!p) return { error: `No property with id "${args.propertyId}" exists in this portfolio. Use an exact id from the portfolio context.` };
  const before = getPropertyMetrics(p);
  const after = scenarioAdjustedMetrics(p, args);
  return {
    hypothetical: true,
    scope: "property",
    propertyName: p.name,
    before: { currentValue: round(p.currentValue), mortgageBalance: round(before.mortgageBalance), monthlyPayment: round(before.monthlyPayment, 2), equity: round(before.equity), cashFlow: round(before.cashFlow), capRate: round(before.capRate * 100, 2) },
    after: { currentValue: round(after.currentValue), mortgageBalance: round(after.mortgageBalance), monthlyPayment: round(after.monthlyPayment, 2), equity: round(after.equity), cashFlow: round(after.cashFlow), capRate: round(after.capRate * 100, 2) },
  };
}

async function callClaude(system, messages) {
  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, system, messages, tools: ASSISTANT_TOOLS }),
    });
  } catch (e) {
    throw new Error("Couldn't reach the assistant service. Check your connection and try again.");
  }
  if (!response.ok) {
    if (response.status === 429) throw new Error("The assistant is getting a lot of requests right now. Please try again in a moment.");
    if (response.status >= 500) throw new Error("The assistant service is temporarily unavailable. Please try again.");
    throw new Error("The assistant couldn't process that request. Please try again.");
  }
  return response.json();
}

const AIService = {
  async ask(properties, portfolioContext, priorTurns, userMessage) {
    const system = `${ASSISTANT_SYSTEM_PROMPT}\n\nCURRENT PORTFOLIO CONTEXT (JSON — ground truth, do not contradict it):\n${JSON.stringify(portfolioContext)}`;
    let working = [...priorTurns.map((t) => ({ role: t.role, content: t.content })), { role: "user", content: userMessage }];
    let lastScenario = null;

    for (let i = 0; i < 4; i++) {
      const data = await callClaude(system, working);
      const content = data.content || [];
      const toolUses = content.filter((b) => b.type === "tool_use");

      if (toolUses.length === 0) {
        const text = content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
        return { text: text || "I wasn't able to put together a response for that — try rephrasing the question.", scenario: lastScenario };
      }

      working.push({ role: "assistant", content });
      const toolResults = toolUses.map((tu) => {
        let result;
        try {
          if (tu.name === "calculate_mortgage") result = execCalculateMortgage(tu.input || {});
          else if (tu.name === "calculate_cashflow_scenario") result = execCashflowScenario(tu.input || {});
          else if (tu.name === "adjust_existing_property") result = execAdjustProperty(tu.input || {}, properties);
          else result = { error: "That tool isn't available." };
        } catch (e) {
          result = { error: "That calculation couldn't be completed with the given inputs." };
        }
        if (result && !result.error) lastScenario = result;
        return { type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(result) };
      });
      working.push({ role: "user", content: toolResults });
    }
    return { text: "That question needed more steps than I can currently take — try breaking it into a simpler question.", scenario: lastScenario };
  },
};

/* ============================== DEMO DATA ============================== */
function makeDemoProperties() {
  return [
    {
      id: uid(),
      name: "Maple Row Duplex",
      address: "1421 Maple Row, Columbus, OH",
      type: "Duplex",
      purchasePrice: 285000,
      purchaseDate: "2021-06-01",
      currentValue: 335000,
      units: 2,
      sqft: 2400,
      occupancyPct: 100,
      monthlyRent: 3200,
      otherIncome: 150,
      propertyTaxes: 320,
      insurance: 140,
      maintenance: 180,
      propertyManagement: 256,
      hoa: 0,
      utilities: 90,
      vacancyPct: 5,
      capex: 120,
      otherExpenses: 40,
      downPayment: 57000,
      interestRate: 5.25,
      loanTermYears: 30,
      closingCosts: 6500,
      rehabCosts: 4000,
    },
    {
      id: uid(),
      name: "Harbor View Condo",
      address: "88 Harbor View Dr, Unit 4B, Charleston, SC",
      type: "Condo",
      purchasePrice: 410000,
      purchaseDate: "2022-09-15",
      currentValue: 452000,
      units: 1,
      sqft: 1150,
      occupancyPct: 100,
      monthlyRent: 2650,
      otherIncome: 0,
      propertyTaxes: 410,
      insurance: 120,
      maintenance: 90,
      propertyManagement: 212,
      hoa: 380,
      utilities: 0,
      vacancyPct: 4,
      capex: 100,
      otherExpenses: 25,
      downPayment: 82000,
      interestRate: 6.1,
      loanTermYears: 30,
      closingCosts: 8200,
      rehabCosts: 0,
    },
    {
      id: uid(),
      name: "Willowbrook Fourplex",
      address: "220 Willowbrook Ln, Austin, TX",
      type: "Multi-Family",
      purchasePrice: 720000,
      purchaseDate: "2020-03-10",
      currentValue: 890000,
      units: 4,
      sqft: 4800,
      occupancyPct: 75,
      monthlyRent: 6400,
      otherIncome: 300,
      propertyTaxes: 780,
      insurance: 340,
      maintenance: 400,
      propertyManagement: 512,
      hoa: 0,
      utilities: 260,
      vacancyPct: 8,
      capex: 300,
      otherExpenses: 80,
      downPayment: 144000,
      interestRate: 4.75,
      loanTermYears: 30,
      closingCosts: 14000,
      rehabCosts: 22000,
    },
    {
      id: uid(),
      name: "Prairie Point House",
      address: "9 Prairie Point Ct, Omaha, NE",
      type: "Single-Family",
      purchasePrice: 235000,
      purchaseDate: "2023-01-20",
      currentValue: 248000,
      units: 1,
      sqft: 1800,
      occupancyPct: 100,
      monthlyRent: 1950,
      otherIncome: 0,
      propertyTaxes: 220,
      insurance: 95,
      maintenance: 110,
      propertyManagement: 156,
      hoa: 0,
      utilities: 0,
      vacancyPct: 5,
      capex: 80,
      otherExpenses: 20,
      downPayment: 47000,
      interestRate: 6.75,
      loanTermYears: 30,
      closingCosts: 5200,
      rehabCosts: 0,
    },
  ];
}

const BLANK_FORM = {
  name: "",
  address: "",
  type: "Single-Family",
  purchasePrice: "",
  purchaseDate: todayISO(),
  currentValue: "",
  units: "1",
  sqft: "",
  occupancyPct: "100",
  monthlyRent: "",
  otherIncome: "0",
  propertyTaxes: "0",
  insurance: "0",
  maintenance: "0",
  propertyManagement: "0",
  hoa: "0",
  utilities: "0",
  vacancyPct: "5",
  capex: "0",
  otherExpenses: "0",
  downPayment: "",
  interestRate: "6.5",
  loanTermYears: "30",
  closingCosts: "0",
  rehabCosts: "0",
};

const NUMERIC_FIELDS = [
  "purchasePrice", "currentValue", "units", "sqft", "occupancyPct", "monthlyRent", "otherIncome",
  "propertyTaxes", "insurance", "maintenance", "propertyManagement", "hoa", "utilities", "vacancyPct",
  "capex", "otherExpenses", "downPayment", "interestRate", "loanTermYears", "closingCosts", "rehabCosts",
];

function validatePropertyForm(f) {
  const e = {};
  if (!f.name.trim()) e.name = "Name is required.";
  if (!f.address.trim()) e.address = "Address is required.";
  if (!f.type) e.type = "Select a property type.";

  const num = (k) => parseFloat(f[k]);

  if (f.purchasePrice === "" || isNaN(num("purchasePrice")) || num("purchasePrice") <= 0)
    e.purchasePrice = "Enter a purchase price greater than 0.";
  if (f.currentValue === "" || isNaN(num("currentValue")) || num("currentValue") <= 0)
    e.currentValue = "Enter a current value greater than 0.";
  if (!f.purchaseDate) e.purchaseDate = "Purchase date is required.";
  else if (new Date(f.purchaseDate) > new Date()) e.purchaseDate = "Purchase date can't be in the future.";

  if (f.units === "" || isNaN(num("units")) || num("units") < 1 || !Number.isInteger(num("units")))
    e.units = "Enter a whole number of units (1 or more).";
  if (f.sqft !== "" && (isNaN(num("sqft")) || num("sqft") < 0)) e.sqft = "Square footage can't be negative.";

  if (f.occupancyPct === "" || isNaN(num("occupancyPct")) || num("occupancyPct") < 0 || num("occupancyPct") > 100)
    e.occupancyPct = "Occupancy must be between 0 and 100.";

  if (f.monthlyRent === "" || isNaN(num("monthlyRent")) || num("monthlyRent") < 0)
    e.monthlyRent = "Enter a monthly rent of 0 or more.";

  ["otherIncome", "propertyTaxes", "insurance", "maintenance", "propertyManagement", "hoa", "utilities", "capex", "otherExpenses", "closingCosts", "rehabCosts"].forEach(
    (k) => {
      if (f[k] !== "" && (isNaN(num(k)) || num(k) < 0)) e[k] = "This value can't be negative.";
    }
  );

  if (f.vacancyPct === "" || isNaN(num("vacancyPct")) || num("vacancyPct") < 0 || num("vacancyPct") > 100)
    e.vacancyPct = "Vacancy must be between 0 and 100.";

  if (f.downPayment === "" || isNaN(num("downPayment")) || num("downPayment") < 0)
    e.downPayment = "Enter a down payment of 0 or more.";
  else if (!isNaN(num("purchasePrice")) && num("downPayment") > num("purchasePrice"))
    e.downPayment = "Down payment can't exceed the purchase price.";

  if (f.interestRate === "" || isNaN(num("interestRate")) || num("interestRate") < 0 || num("interestRate") > 30)
    e.interestRate = "Enter a rate between 0 and 30%.";

  if (f.loanTermYears === "" || isNaN(num("loanTermYears")) || num("loanTermYears") <= 0 || num("loanTermYears") > 40)
    e.loanTermYears = "Enter a loan term between 1 and 40 years.";

  return e;
}

function formToProperty(f, existingId) {
  const out = { id: existingId || uid() };
  Object.keys(f).forEach((k) => {
    if (NUMERIC_FIELDS.includes(k)) out[k] = parseFloat(f[k]) || 0;
    else out[k] = f[k];
  });
  return out;
}

function propertyToForm(p) {
  const f = {};
  Object.keys(BLANK_FORM).forEach((k) => {
    f[k] = p[k] === undefined || p[k] === null ? BLANK_FORM[k] : String(p[k]);
  });
  return f;
}

/* ============================== SMALL UI PRIMITIVES ============================== */
function Field({ label, error, children, hint }) {
  return (
    <label className="lg-field">
      <span className="lg-field-label">{label}</span>
      {children}
      {hint && !error && <span className="lg-field-hint">{hint}</span>}
      {error && (
        <span className="lg-field-error">
          <AlertTriangle size={12} strokeWidth={2.4} /> {error}
        </span>
      )}
    </label>
  );
}

function NumInput({ value, onChange, error, prefix, suffix, ...rest }) {
  return (
    <div className={`lg-input-wrap ${error ? "lg-input-err" : ""}`}>
      {prefix && <span className="lg-input-affix">{prefix}</span>}
      <input
        type="number"
        className="lg-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
      {suffix && <span className="lg-input-affix">{suffix}</span>}
    </div>
  );
}

function TextInput({ value, onChange, error, ...rest }) {
  return (
    <div className={`lg-input-wrap ${error ? "lg-input-err" : ""}`}>
      <input type="text" className="lg-input" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
    </div>
  );
}

function StatCard({ label, value, sub, tone }) {
  return (
    <div className="lg-stat">
      <div className="lg-stat-label">{label}</div>
      <div className="lg-stat-value">{value}</div>
      {sub && (
        <div className={`lg-stat-sub ${tone === "up" ? "lg-up" : tone === "down" ? "lg-down" : ""}`}>
          {tone === "up" && <TrendingUp size={13} />} {tone === "down" && <TrendingDown size={13} />} {sub}
        </div>
      )}
    </div>
  );
}

function CashFlowTag({ value }) {
  const positive = value >= 0;
  return (
    <span className={`lg-tag ${positive ? "lg-tag-green" : "lg-tag-rust"}`}>
      {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {fmtMoney(value)}
    </span>
  );
}

const CHART_COLORS = ["#C6A15B", "#3F6B4A", "#8B6F47", "#A6543A", "#6C7A63", "#7A8CA3"];

const tooltipStyle = {
  background: C.ink,
  border: `1px solid ${C.goldLine}`,
  borderRadius: 8,
  color: C.ivory,
  fontSize: 12,
  padding: "8px 10px",
};

/* ============================== NAV ============================== */
const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { key: "assistant", label: "AI Assistant", icon: Bot },
  { key: "properties", label: "Properties", icon: Building2 },
  { key: "briefing", label: "Daily Briefing", icon: Newspaper },
  { key: "analytics", label: "Analytics", icon: LineChartIcon },
  { key: "strategy", label: "Strategy", icon: Sparkles },
  { key: "calculators", label: "Calculators", icon: Calculator },
  { key: "settings", label: "Settings", icon: SettingsIcon },
];

function Sidebar({ page, goTo }) {
  return (
    <aside className="lg-sidebar">
      <div className="lg-brand">
        <div className="lg-brand-mark">L</div>
        <div>
          <div className="lg-brand-name">Ledgerstone</div>
          <div className="lg-brand-tag">Portfolio Tracker</div>
        </div>
      </div>
      <nav className="lg-nav">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = page === item.key || (page === "propertyDetail" && item.key === "properties");
          return (
            <button
              key={item.key}
              className={`lg-nav-item ${active ? "lg-nav-item-active" : ""}`}
              onClick={() => goTo(item.key)}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{item.label}</span>
              {active && <span className="lg-nav-dot" />}
            </button>
          );
        })}
      </nav>
      <div className="lg-sidebar-foot">
        <div className="lg-sidebar-foot-line" />
        <div className="lg-sidebar-foot-text">Synced to your Supabase account</div>
      </div>
    </aside>
  );
}

/* ============================== DASHBOARD ============================== */
function Dashboard({ properties, goTo, openProperty, theme, briefing }) {
  const metrics = useMemo(() => computePortfolioTotals(properties), [properties]);

  const valueHistory = useMemo(() => {
    const months = 12;
    const annualAppreciation = 0.045;
    const monthlyRate = Math.pow(1 + annualAppreciation, 1 / 12) - 1;
    const pts = [];
    const now = new Date();
    for (let i = months; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = metrics.totalValue / Math.pow(1 + monthlyRate, i);
      pts.push({ month: d.toLocaleDateString("en-US", { month: "short" }), value: Math.round(value) });
    }
    return pts;
  }, [metrics.totalValue]);

  const cashFlowHistory = useMemo(() => {
    const now = new Date();
    const pts = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const seasonal = 1 + Math.sin((d.getMonth() / 12) * Math.PI * 2) * 0.04;
      pts.push({ month: d.toLocaleDateString("en-US", { month: "short" }), cashFlow: Math.round(metrics.monthlyCashFlow * seasonal) });
    }
    return pts;
  }, [metrics.monthlyCashFlow]);

  const incomeVsExpense = useMemo(
    () =>
      metrics.list.map(({ p, m }) => ({
        name: p.name.length > 14 ? p.name.slice(0, 13) + "…" : p.name,
        Income: Math.round(m.effectiveIncome),
        Expenses: Math.round(m.operatingExpenses + m.monthlyPayment),
      })),
    [metrics.list]
  );

  const allocation = useMemo(
    () => metrics.list.map(({ p, m }) => ({ name: p.name, value: Math.round(m.equity) })).filter((x) => x.value > 0),
    [metrics.list]
  );

  const gridColor = theme.chartGrid;
  const axisColor = theme.chartAxis;

  if (properties.length === 0) {
    return (
      <div className="lg-empty-page">
        <Building2 size={30} strokeWidth={1.3} />
        <h2>No properties in your portfolio yet</h2>
        <p>Add your first property to see live dashboard metrics and charts.</p>
        <button className="lg-btn lg-btn-primary" onClick={() => goTo("properties")}>
          <Plus size={15} /> Add a property
        </button>
      </div>
    );
  }

  return (
    <div className="lg-page">
      <header className="lg-page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="lg-page-sub">A live view of your portfolio, updated as your data changes.</p>
        </div>
      </header>

      <button className="lg-briefing-teaser" onClick={() => goTo("briefing")}>
        <div className="lg-briefing-teaser-icon"><Newspaper size={16} /></div>
        <div className="lg-briefing-teaser-text">
          <div className="lg-briefing-teaser-title">
            {briefing.status === "ready" ? `Today's outlook: ${briefing.data?.outlook?.label || "—"}` : "Daily Briefing"}
          </div>
          <div className="lg-briefing-teaser-sub">
            {briefing.status === "ready"
              ? "Your personalized news briefing is ready — view it"
              : "Get a personalized news briefing built from your portfolio"}
          </div>
        </div>
        <ChevronRight size={16} />
      </button>

      <div className="lg-stat-grid">
        <StatCard label="Total Portfolio Value" value={fmtMoney(metrics.totalValue)} />
        <StatCard label="Total Equity" value={fmtMoney(metrics.totalEquity)} />
        <StatCard label="Total Debt" value={fmtMoney(metrics.totalDebt)} />
        <StatCard label="Number of Properties" value={fmtNum(properties.length)} />
        <StatCard
          label="Monthly Income"
          value={fmtMoney(metrics.monthlyIncome)}
        />
        <StatCard label="Monthly Expenses" value={fmtMoney(metrics.monthlyExpenses)} />
        <StatCard
          label="Monthly Cash Flow"
          value={fmtMoney(metrics.monthlyCashFlow)}
          sub={metrics.monthlyCashFlow >= 0 ? "Positive" : "Negative"}
          tone={metrics.monthlyCashFlow >= 0 ? "up" : "down"}
        />
        <StatCard
          label="Annual Cash Flow"
          value={fmtMoney(metrics.annualCashFlow)}
          sub={metrics.annualCashFlow >= 0 ? "Positive" : "Negative"}
          tone={metrics.annualCashFlow >= 0 ? "up" : "down"}
        />
        <StatCard label="Portfolio LTV" value={fmtPct(metrics.ltv)} />
        <StatCard label="Portfolio Cap Rate" value={fmtPct(metrics.capRate)} />
        <StatCard label="Cash-on-Cash Return" value={fmtPct(metrics.cashOnCash)} />
      </div>

      <div className="lg-chart-grid">
        <div className="lg-card lg-chart-card">
          <div className="lg-chart-title">Portfolio value over time</div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={valueHistory} margin={{ left: -18, top: 8, right: 8 }}>
              <defs>
                <linearGradient id="valGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.gold} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={C.gold} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={gridColor} vertical={false} />
              <XAxis dataKey="month" stroke={axisColor} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke={axisColor} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} width={54} />
              <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="value" stroke={C.gold} strokeWidth={2} fill="url(#valGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="lg-card lg-chart-card">
          <div className="lg-chart-title">Monthly cash flow</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={cashFlowHistory} margin={{ left: -18, top: 8, right: 8 }}>
              <CartesianGrid stroke={gridColor} vertical={false} />
              <XAxis dataKey="month" stroke={axisColor} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke={axisColor} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${Math.round(v)}`} width={54} />
              <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={tooltipStyle} />
              <Bar dataKey="cashFlow" radius={[3, 3, 0, 0]}>
                {cashFlowHistory.map((entry, i) => (
                  <Cell key={i} fill={entry.cashFlow >= 0 ? C.green : C.rust} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="lg-card lg-chart-card">
          <div className="lg-chart-title">Income vs. expenses by property</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={incomeVsExpense} margin={{ left: -18, top: 8, right: 8 }}>
              <CartesianGrid stroke={gridColor} vertical={false} />
              <XAxis dataKey="name" stroke={axisColor} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke={axisColor} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${Math.round(v)}`} width={54} />
              <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Income" fill={C.gold} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Expenses" fill={C.rust} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="lg-card lg-chart-card">
          <div className="lg-chart-title">Portfolio allocation (equity by property)</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={allocation} dataKey="value" nameKey="name" innerRadius={54} outerRadius={82} paddingAngle={2}>
                {allocation.map((entry, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="lg-card">
        <div className="lg-chart-title">Properties</div>
        <table className="lg-table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Value</th>
              <th>Equity</th>
              <th>Cash Flow</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {metrics.list.map(({ p, m }) => (
              <tr key={p.id} className="lg-row-click" onClick={() => openProperty(p.id)}>
                <td>
                  <div className="lg-table-name">{p.name}</div>
                  <div className="lg-table-sub">{p.address}</div>
                </td>
                <td>{fmtMoney(p.currentValue)}</td>
                <td>{fmtMoney(m.equity)}</td>
                <td>
                  <CashFlowTag value={m.cashFlow} />
                </td>
                <td className="lg-table-arrow">
                  <ChevronRight size={16} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================== PROPERTIES PAGE ============================== */
function PropertiesPage({ properties, openProperty, onAdd, onEdit, onDelete }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const filtered = useMemo(() => {
    return properties.filter((p) => {
      const matchesSearch =
        !search.trim() ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.address.toLowerCase().includes(search.toLowerCase()) ||
        p.type.toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === "All" || p.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [properties, search, typeFilter]);

  return (
    <div className="lg-page">
      <header className="lg-page-head">
        <div>
          <h1>Properties</h1>
          <p className="lg-page-sub">{properties.length} {properties.length === 1 ? "property" : "properties"} in your portfolio</p>
        </div>
        <button className="lg-btn lg-btn-primary" onClick={onAdd}>
          <Plus size={15} /> Add property
        </button>
      </header>

      <div className="lg-toolbar">
        <div className="lg-search">
          <Search size={15} />
          <input
            placeholder="Search by name, address, or type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="lg-search-clear" onClick={() => setSearch("")}>
              <X size={13} />
            </button>
          )}
        </div>
        <select className="lg-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="All">All types</option>
          {PROPERTY_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {properties.length === 0 ? (
        <div className="lg-empty-page">
          <Building2 size={30} strokeWidth={1.3} />
          <h2>No properties yet</h2>
          <p>Add your first property to start tracking your portfolio.</p>
          <button className="lg-btn lg-btn-primary" onClick={onAdd}>
            <Plus size={15} /> Add property
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="lg-empty-page">
          <Search size={28} strokeWidth={1.3} />
          <h2>No matching properties</h2>
          <p>Try a different search term or clear the type filter.</p>
          <button
            className="lg-btn lg-btn-ghost"
            onClick={() => {
              setSearch("");
              setTypeFilter("All");
            }}
          >
            Clear search & filters
          </button>
        </div>
      ) : (
        <div className="lg-card lg-table-wrap">
          <table className="lg-table">
            <thead>
              <tr>
                <th>Property</th>
                <th>Type</th>
                <th>Value</th>
                <th>Equity</th>
                <th>Rent</th>
                <th>Cash Flow</th>
                <th>LTV</th>
                <th>Occ.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const m = getPropertyMetrics(p);
                return (
                  <tr key={p.id} className="lg-row-click" onClick={() => openProperty(p.id)}>
                    <td>
                      <div className="lg-table-name">{p.name}</div>
                      <div className="lg-table-sub">{p.address}</div>
                    </td>
                    <td><span className="lg-pill">{p.type}</span></td>
                    <td>{fmtMoney(p.currentValue)}</td>
                    <td>{fmtMoney(m.equity)}</td>
                    <td>{fmtMoney(p.monthlyRent)}</td>
                    <td><CashFlowTag value={m.cashFlow} /></td>
                    <td>{fmtPct(m.ltv)}</td>
                    <td>{p.occupancyPct}%</td>
                    <td className="lg-row-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="lg-icon-btn" title="Edit" onClick={() => onEdit(p)}>
                        <Pencil size={14} />
                      </button>
                      <button className="lg-icon-btn lg-icon-btn-danger" title="Delete" onClick={() => setConfirmDelete(p)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete this property?"
          body={`"${confirmDelete.name}" will be permanently removed from your portfolio. This can't be undone.`}
          confirmLabel="Delete property"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            onDelete(confirmDelete.id);
            setConfirmDelete(null);
          }}
        />
      )}
    </div>
  );
}

function ConfirmModal({ title, body, confirmLabel, danger, onCancel, onConfirm }) {
  return (
    <div className="lg-overlay" onClick={onCancel}>
      <div className="lg-modal lg-modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="lg-modal-icon"><AlertTriangle size={18} /></div>
        <h3>{title}</h3>
        <p className="lg-modal-body">{body}</p>
        <div className="lg-modal-actions">
          <button className="lg-btn lg-btn-ghost" onClick={onCancel}>Cancel</button>
          <button className={`lg-btn ${danger ? "lg-btn-danger" : "lg-btn-primary"}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================== PROPERTY FORM MODAL ============================== */
function PropertyFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial ? propertyToForm(initial) : BLANK_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    const errs = validatePropertyForm(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSaving(true);
    await onSave(formToProperty(form, initial?.id));
    // If the save failed, the parent leaves this modal open (rather than closing it) — in that
    // case, re-enable the button so the user can retry. On success this modal has unmounted.
    if (mountedRef.current) setSaving(false);
  };

  return (
    <div className="lg-overlay" onClick={onCancel}>
      <div className="lg-modal lg-modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="lg-modal-head">
          <h3>{initial ? "Edit property" : "Add a property"}</h3>
          <button className="lg-icon-btn" onClick={onCancel}><X size={16} /></button>
        </div>

        <div className="lg-modal-scroll">
          <div className="lg-form-section">
            <div className="lg-form-section-title">Property information</div>
            <div className="lg-form-grid">
              <Field label="Property name" error={errors.name}>
                <TextInput value={form.name} onChange={set("name")} placeholder="e.g. Maple Row Duplex" />
              </Field>
              <Field label="Address" error={errors.address}>
                <TextInput value={form.address} onChange={set("address")} placeholder="Street, City, State" />
              </Field>
              <Field label="Property type" error={errors.type}>
                <select className="lg-select lg-select-full" value={form.type} onChange={(e) => set("type")(e.target.value)}>
                  {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Purchase price" error={errors.purchasePrice}>
                <NumInput prefix="$" value={form.purchasePrice} onChange={set("purchasePrice")} min="0" />
              </Field>
              <Field label="Purchase date" error={errors.purchaseDate}>
                <div className="lg-input-wrap"><input type="date" className="lg-input" value={form.purchaseDate} onChange={(e) => set("purchaseDate")(e.target.value)} /></div>
              </Field>
              <Field label="Current estimated value" error={errors.currentValue}>
                <NumInput prefix="$" value={form.currentValue} onChange={set("currentValue")} min="0" />
              </Field>
              <Field label="Units" error={errors.units}>
                <NumInput value={form.units} onChange={set("units")} min="1" step="1" />
              </Field>
              <Field label="Square footage" error={errors.sqft}>
                <NumInput value={form.sqft} onChange={set("sqft")} min="0" />
              </Field>
              <Field label="Occupancy" error={errors.occupancyPct}>
                <NumInput suffix="%" value={form.occupancyPct} onChange={set("occupancyPct")} min="0" max="100" />
              </Field>
            </div>
          </div>

          <div className="lg-form-section">
            <div className="lg-form-section-title">Income</div>
            <div className="lg-form-grid">
              <Field label="Monthly rent" error={errors.monthlyRent}>
                <NumInput prefix="$" value={form.monthlyRent} onChange={set("monthlyRent")} min="0" />
              </Field>
              <Field label="Other income" error={errors.otherIncome}>
                <NumInput prefix="$" value={form.otherIncome} onChange={set("otherIncome")} min="0" />
              </Field>
              <Field label="Vacancy rate" error={errors.vacancyPct} hint="Applied against monthly rent">
                <NumInput suffix="%" value={form.vacancyPct} onChange={set("vacancyPct")} min="0" max="100" />
              </Field>
            </div>
          </div>

          <div className="lg-form-section">
            <div className="lg-form-section-title">Monthly expenses</div>
            <div className="lg-form-grid">
              <Field label="Property taxes" error={errors.propertyTaxes}><NumInput prefix="$" value={form.propertyTaxes} onChange={set("propertyTaxes")} min="0" /></Field>
              <Field label="Insurance" error={errors.insurance}><NumInput prefix="$" value={form.insurance} onChange={set("insurance")} min="0" /></Field>
              <Field label="Maintenance" error={errors.maintenance}><NumInput prefix="$" value={form.maintenance} onChange={set("maintenance")} min="0" /></Field>
              <Field label="Property management" error={errors.propertyManagement}><NumInput prefix="$" value={form.propertyManagement} onChange={set("propertyManagement")} min="0" /></Field>
              <Field label="HOA" error={errors.hoa}><NumInput prefix="$" value={form.hoa} onChange={set("hoa")} min="0" /></Field>
              <Field label="Utilities" error={errors.utilities}><NumInput prefix="$" value={form.utilities} onChange={set("utilities")} min="0" /></Field>
              <Field label="CapEx reserve" error={errors.capex}><NumInput prefix="$" value={form.capex} onChange={set("capex")} min="0" /></Field>
              <Field label="Other expenses" error={errors.otherExpenses}><NumInput prefix="$" value={form.otherExpenses} onChange={set("otherExpenses")} min="0" /></Field>
            </div>
          </div>

          <div className="lg-form-section">
            <div className="lg-form-section-title">Financing</div>
            <div className="lg-form-grid">
              <Field label="Down payment" error={errors.downPayment}><NumInput prefix="$" value={form.downPayment} onChange={set("downPayment")} min="0" /></Field>
              <Field label="Interest rate" error={errors.interestRate}><NumInput suffix="%" value={form.interestRate} onChange={set("interestRate")} min="0" max="30" step="0.05" /></Field>
              <Field label="Loan term" error={errors.loanTermYears}><NumInput suffix="yrs" value={form.loanTermYears} onChange={set("loanTermYears")} min="1" max="40" step="1" /></Field>
              <Field label="Closing costs" error={errors.closingCosts}><NumInput prefix="$" value={form.closingCosts} onChange={set("closingCosts")} min="0" /></Field>
              <Field label="Rehab costs" error={errors.rehabCosts}><NumInput prefix="$" value={form.rehabCosts} onChange={set("rehabCosts")} min="0" /></Field>
            </div>
          </div>
        </div>

        <div className="lg-modal-actions">
          <button className="lg-btn lg-btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
          <button className="lg-btn lg-btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 size={15} className="lg-spin" /> : <Check size={15} />}
            {saving ? "Saving…" : initial ? "Save changes" : "Add property"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================== PROPERTY DETAIL ============================== */
const DETAIL_TABS = ["Overview", "Financial Performance", "Income", "Expenses", "Mortgage"];

function InlineNumField({ label, value, onChange, prefix, suffix, error }) {
  return (
    <Field label={label} error={error}>
      <NumInput prefix={prefix} suffix={suffix} value={value} onChange={onChange} />
    </Field>
  );
}

function PropertyDetail({ property, onBack, onUpdate, onEdit, onDeleteRequest }) {
  const [tab, setTab] = useState("Overview");
  const m = useMemo(() => getPropertyMetrics(property), [property]);

  const [editingSection, setEditingSection] = useState(null); // 'income' | 'expenses' | 'mortgage'
  const [sectionForm, setSectionForm] = useState({});
  const [sectionErrors, setSectionErrors] = useState({});

  const startEdit = (section, fields) => {
    setEditingSection(section);
    const f = {};
    fields.forEach((k) => (f[k] = String(property[k])));
    setSectionForm(f);
    setSectionErrors({});
  };

  const saveSection = () => {
    const asForm = { ...propertyToForm(property), ...sectionForm };
    const errs = validatePropertyForm(asForm);
    const relevantErrs = {};
    Object.keys(sectionForm).forEach((k) => { if (errs[k]) relevantErrs[k] = errs[k]; });
    if (Object.keys(relevantErrs).length > 0) { setSectionErrors(relevantErrs); return; }
    const patch = {};
    Object.keys(sectionForm).forEach((k) => (patch[k] = parseFloat(sectionForm[k]) || 0));
    onUpdate(property.id, patch);
    setEditingSection(null);
  };

  return (
    <div className="lg-page">
      <button className="lg-back-link" onClick={onBack}>
        <ChevronLeft size={15} /> All properties
      </button>

      <header className="lg-page-head">
        <div>
          <h1>{property.name}</h1>
          <p className="lg-page-sub">{property.address} · <span className="lg-pill">{property.type}</span></p>
        </div>
        <div className="lg-head-actions">
          <button className="lg-btn lg-btn-ghost" onClick={() => onEdit(property)}><Pencil size={14} /> Edit property</button>
          <button className="lg-btn lg-btn-danger" onClick={onDeleteRequest}><Trash2 size={14} /> Delete</button>
        </div>
      </header>

      <div className="lg-tabs">
        {DETAIL_TABS.map((t) => (
          <button key={t} className={`lg-tab ${tab === t ? "lg-tab-active" : ""}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="lg-stat-grid">
          <StatCard label="Property Value" value={fmtMoney(property.currentValue)} />
          <StatCard label="Purchase Price" value={fmtMoney(property.purchasePrice)} />
          <StatCard label="Purchase Date" value={new Date(property.purchaseDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })} />
          <StatCard label="Equity" value={fmtMoney(m.equity)} />
          <StatCard label="Debt" value={fmtMoney(m.mortgageBalance)} />
          <StatCard label="LTV" value={fmtPct(m.ltv)} />
          <StatCard label="Monthly Income" value={fmtMoney(m.effectiveIncome)} />
          <StatCard label="Monthly Expenses" value={fmtMoney(m.operatingExpenses)} />
          <StatCard label="Monthly Cash Flow" value={fmtMoney(m.cashFlow)} tone={m.cashFlow >= 0 ? "up" : "down"} />
          <StatCard label="Annual Cash Flow" value={fmtMoney(m.annualCashFlow)} tone={m.annualCashFlow >= 0 ? "up" : "down"} />
        </div>
      )}

      {tab === "Financial Performance" && (
        <div className="lg-card lg-kv-card">
          {[
            ["Gross income", fmtMoney(m.grossIncome)],
            ["Vacancy loss", "-" + fmtMoney(m.vacancyLoss)],
            ["Operating expenses", fmtMoney(m.operatingExpenses)],
            ["NOI (Net Operating Income)", fmtMoney(m.noi)],
            ["Mortgage payment", fmtMoney(m.monthlyPayment)],
            ["Cash flow", fmtMoney(m.cashFlow)],
            ["Cap rate", fmtPct(m.capRate)],
            ["Cash-on-cash return", fmtPct(m.cashOnCash)],
            ["ROI (since purchase)", fmtPct(m.roi)],
          ].map(([k, v]) => (
            <div className="lg-kv-row" key={k}>
              <span>{k}</span><span className="lg-kv-val">{v}</span>
            </div>
          ))}
        </div>
      )}

      {tab === "Income" && (
        <div className="lg-card">
          <div className="lg-section-head">
            <div className="lg-chart-title">Income sources</div>
            {editingSection !== "income" ? (
              <button className="lg-btn lg-btn-ghost lg-btn-sm" onClick={() => startEdit("income", ["monthlyRent", "otherIncome", "vacancyPct"])}>
                <Pencil size={13} /> Edit
              </button>
            ) : null}
          </div>
          {editingSection === "income" ? (
            <>
              <div className="lg-form-grid">
                <InlineNumField label="Monthly rent" prefix="$" value={sectionForm.monthlyRent} onChange={(v) => setSectionForm((f) => ({ ...f, monthlyRent: v }))} error={sectionErrors.monthlyRent} />
                <InlineNumField label="Other income" prefix="$" value={sectionForm.otherIncome} onChange={(v) => setSectionForm((f) => ({ ...f, otherIncome: v }))} error={sectionErrors.otherIncome} />
                <InlineNumField label="Vacancy rate" suffix="%" value={sectionForm.vacancyPct} onChange={(v) => setSectionForm((f) => ({ ...f, vacancyPct: v }))} error={sectionErrors.vacancyPct} />
              </div>
              <div className="lg-modal-actions lg-modal-actions-inline">
                <button className="lg-btn lg-btn-ghost" onClick={() => setEditingSection(null)}>Cancel</button>
                <button className="lg-btn lg-btn-primary" onClick={saveSection}><Check size={14} /> Save</button>
              </div>
            </>
          ) : (
            <div className="lg-kv-card">
              <div className="lg-kv-row"><span>Monthly rent</span><span className="lg-kv-val">{fmtMoney(property.monthlyRent)}</span></div>
              <div className="lg-kv-row"><span>Other income</span><span className="lg-kv-val">{fmtMoney(property.otherIncome)}</span></div>
              <div className="lg-kv-row"><span>Vacancy rate</span><span className="lg-kv-val">{property.vacancyPct}%</span></div>
              <div className="lg-kv-row"><span>Effective monthly income</span><span className="lg-kv-val">{fmtMoney(m.effectiveIncome)}</span></div>
            </div>
          )}
        </div>
      )}

      {tab === "Expenses" && (
        <div className="lg-card">
          <div className="lg-section-head">
            <div className="lg-chart-title">Expense categories</div>
            {editingSection !== "expenses" ? (
              <button className="lg-btn lg-btn-ghost lg-btn-sm" onClick={() => startEdit("expenses", ["propertyTaxes", "insurance", "maintenance", "propertyManagement", "hoa", "utilities", "capex", "otherExpenses"])}>
                <Pencil size={13} /> Edit
              </button>
            ) : null}
          </div>
          {editingSection === "expenses" ? (
            <>
              <div className="lg-form-grid">
                {[
                  ["propertyTaxes", "Property taxes"], ["insurance", "Insurance"], ["maintenance", "Maintenance"],
                  ["propertyManagement", "Property management"], ["hoa", "HOA"], ["utilities", "Utilities"],
                  ["capex", "CapEx reserve"], ["otherExpenses", "Other expenses"],
                ].map(([k, label]) => (
                  <InlineNumField key={k} label={label} prefix="$" value={sectionForm[k]} onChange={(v) => setSectionForm((f) => ({ ...f, [k]: v }))} error={sectionErrors[k]} />
                ))}
              </div>
              <div className="lg-modal-actions lg-modal-actions-inline">
                <button className="lg-btn lg-btn-ghost" onClick={() => setEditingSection(null)}>Cancel</button>
                <button className="lg-btn lg-btn-primary" onClick={saveSection}><Check size={14} /> Save</button>
              </div>
            </>
          ) : (
            <div className="lg-kv-card">
              {[
                ["Property taxes", property.propertyTaxes], ["Insurance", property.insurance], ["Maintenance", property.maintenance],
                ["Property management", property.propertyManagement], ["HOA", property.hoa], ["Utilities", property.utilities],
                ["CapEx reserve", property.capex], ["Other expenses", property.otherExpenses],
              ].map(([k, v]) => (
                <div className="lg-kv-row" key={k}><span>{k}</span><span className="lg-kv-val">{fmtMoney(v)}</span></div>
              ))}
              <div className="lg-kv-row"><span>Total monthly operating expenses</span><span className="lg-kv-val">{fmtMoney(m.operatingExpenses)}</span></div>
            </div>
          )}
        </div>
      )}

      {tab === "Mortgage" && (
        <div className="lg-card">
          <div className="lg-section-head">
            <div className="lg-chart-title">Mortgage details</div>
            {editingSection !== "mortgage" ? (
              <button className="lg-btn lg-btn-ghost lg-btn-sm" onClick={() => startEdit("mortgage", ["downPayment", "interestRate", "loanTermYears"])}>
                <Pencil size={13} /> Edit
              </button>
            ) : null}
          </div>
          {editingSection === "mortgage" ? (
            <>
              <div className="lg-form-grid">
                <InlineNumField label="Down payment" prefix="$" value={sectionForm.downPayment} onChange={(v) => setSectionForm((f) => ({ ...f, downPayment: v }))} error={sectionErrors.downPayment} />
                <InlineNumField label="Interest rate" suffix="%" value={sectionForm.interestRate} onChange={(v) => setSectionForm((f) => ({ ...f, interestRate: v }))} error={sectionErrors.interestRate} />
                <InlineNumField label="Loan term" suffix="yrs" value={sectionForm.loanTermYears} onChange={(v) => setSectionForm((f) => ({ ...f, loanTermYears: v }))} error={sectionErrors.loanTermYears} />
              </div>
              <div className="lg-modal-actions lg-modal-actions-inline">
                <button className="lg-btn lg-btn-ghost" onClick={() => setEditingSection(null)}>Cancel</button>
                <button className="lg-btn lg-btn-primary" onClick={saveSection}><Check size={14} /> Save</button>
              </div>
            </>
          ) : (
            <div className="lg-kv-card">
              <div className="lg-kv-row"><span>Original loan amount</span><span className="lg-kv-val">{fmtMoney(m.loanAmount)}</span></div>
              <div className="lg-kv-row"><span>Current balance</span><span className="lg-kv-val">{fmtMoney(m.mortgageBalance)}</span></div>
              <div className="lg-kv-row"><span>Interest rate</span><span className="lg-kv-val">{property.interestRate}%</span></div>
              <div className="lg-kv-row"><span>Loan term</span><span className="lg-kv-val">{property.loanTermYears} years</span></div>
              <div className="lg-kv-row"><span>Monthly payment</span><span className="lg-kv-val">{fmtMoney(m.monthlyPayment)}</span></div>
              <div className="lg-kv-row"><span>Down payment</span><span className="lg-kv-val">{fmtMoney(property.downPayment)}</span></div>
              <div className="lg-kv-row"><span>Principal paid to date</span><span className="lg-kv-val">{fmtMoney(m.principalPaid)}</span></div>
              <div className="lg-kv-row"><span>Interest paid to date</span><span className="lg-kv-val">{fmtMoney(m.interestPaid)}</span></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================== MORTGAGE CALCULATOR ============================== */
function MortgageCalculator() {
  const [i, setI] = useState({
    purchasePrice: "350000", downPayment: "70000", interestRate: "6.5",
    loanTermYears: "30", propertyTaxes: "300", insurance: "110", hoa: "0",
  });
  const set = (k) => (v) => setI((s) => ({ ...s, [k]: v }));
  const n = (k) => parseFloat(i[k]) || 0;

  const result = useMemo(() => {
    const loan = Math.max(n("purchasePrice") - n("downPayment"), 0);
    const r = n("interestRate") / 100 / 12;
    const payment = calcMonthlyPayment(loan, n("interestRate"), n("loanTermYears"));
    const firstInterest = loan * r;
    const firstPrincipal = payment - firstInterest;
    const total = payment + n("propertyTaxes") + n("insurance") + n("hoa");
    return { loan, payment, firstInterest, firstPrincipal, total };
  }, [i]);

  return (
    <div className="lg-calc-grid">
      <div className="lg-card">
        <div className="lg-form-section-title">Loan details</div>
        <div className="lg-form-grid lg-form-grid-1">
          <Field label="Purchase price"><NumInput prefix="$" value={i.purchasePrice} onChange={set("purchasePrice")} min="0" /></Field>
          <Field label="Down payment"><NumInput prefix="$" value={i.downPayment} onChange={set("downPayment")} min="0" /></Field>
          <Field label="Interest rate"><NumInput suffix="%" value={i.interestRate} onChange={set("interestRate")} min="0" max="30" step="0.05" /></Field>
          <Field label="Loan term"><NumInput suffix="yrs" value={i.loanTermYears} onChange={set("loanTermYears")} min="1" max="40" /></Field>
          <Field label="Property taxes (monthly)"><NumInput prefix="$" value={i.propertyTaxes} onChange={set("propertyTaxes")} min="0" /></Field>
          <Field label="Insurance (monthly)"><NumInput prefix="$" value={i.insurance} onChange={set("insurance")} min="0" /></Field>
          <Field label="HOA (monthly)"><NumInput prefix="$" value={i.hoa} onChange={set("hoa")} min="0" /></Field>
        </div>
      </div>
      <div className="lg-card lg-result-card">
        <div className="lg-form-section-title">Results</div>
        <div className="lg-big-stat">{fmtMoney(result.total, 2)}<span>/ month total</span></div>
        <div className="lg-kv-card">
          <div className="lg-kv-row"><span>Loan amount</span><span className="lg-kv-val">{fmtMoney(result.loan)}</span></div>
          <div className="lg-kv-row"><span>Monthly principal (1st pmt)</span><span className="lg-kv-val">{fmtMoney(result.firstPrincipal, 2)}</span></div>
          <div className="lg-kv-row"><span>Monthly interest (1st pmt)</span><span className="lg-kv-val">{fmtMoney(result.firstInterest, 2)}</span></div>
          <div className="lg-kv-row"><span>Monthly property tax</span><span className="lg-kv-val">{fmtMoney(n("propertyTaxes"))}</span></div>
          <div className="lg-kv-row"><span>Monthly insurance</span><span className="lg-kv-val">{fmtMoney(n("insurance"))}</span></div>
          <div className="lg-kv-row"><span>Monthly HOA</span><span className="lg-kv-val">{fmtMoney(n("hoa"))}</span></div>
          <div className="lg-kv-row lg-kv-row-total"><span>Total monthly payment</span><span className="lg-kv-val">{fmtMoney(result.total, 2)}</span></div>
        </div>
      </div>
    </div>
  );
}

/* ============================== CASH FLOW CALCULATOR ============================== */
function CashFlowCalculator() {
  const [i, setI] = useState({
    purchasePrice: "300000", downPayment: "60000", interestRate: "6.5", loanTermYears: "30",
    monthlyRent: "2400", otherIncome: "0", propertyTaxes: "280", insurance: "100", maintenance: "150",
    propertyManagement: "192", hoa: "0", utilities: "0", vacancyPct: "5", capex: "100", otherExpenses: "0",
  });
  const set = (k) => (v) => setI((s) => ({ ...s, [k]: v }));
  const n = (k) => parseFloat(i[k]) || 0;

  const result = useMemo(() => {
    const loan = Math.max(n("purchasePrice") - n("downPayment"), 0);
    const payment = calcMonthlyPayment(loan, n("interestRate"), n("loanTermYears"));
    const grossIncome = n("monthlyRent") + n("otherIncome");
    const vacancyLoss = n("monthlyRent") * (n("vacancyPct") / 100);
    const effectiveIncome = grossIncome - vacancyLoss;
    const totalExpenses = n("propertyTaxes") + n("insurance") + n("maintenance") + n("propertyManagement") + n("hoa") + n("utilities") + n("capex") + n("otherExpenses");
    const noi = effectiveIncome - totalExpenses;
    const cashFlow = noi - payment;
    const annualCashFlow = cashFlow * 12;
    const capRate = n("purchasePrice") > 0 ? (noi * 12) / n("purchasePrice") : 0;
    const cashInvested = n("downPayment");
    const cashOnCash = cashInvested > 0 ? annualCashFlow / cashInvested : 0;
    const ltv = n("purchasePrice") > 0 ? loan / n("purchasePrice") : 0;
    return { grossIncome, totalExpenses, noi, payment, cashFlow, annualCashFlow, capRate, cashOnCash, ltv };
  }, [i]);

  const expenseFields = [
    ["propertyTaxes", "Property taxes"], ["insurance", "Insurance"], ["maintenance", "Maintenance"],
    ["propertyManagement", "Property management"], ["hoa", "HOA"], ["utilities", "Utilities"],
    ["capex", "CapEx"], ["otherExpenses", "Other"],
  ];

  return (
    <div className="lg-calc-grid">
      <div className="lg-card">
        <div className="lg-form-section-title">Purchase & financing</div>
        <div className="lg-form-grid lg-form-grid-1">
          <Field label="Purchase price"><NumInput prefix="$" value={i.purchasePrice} onChange={set("purchasePrice")} min="0" /></Field>
          <Field label="Down payment"><NumInput prefix="$" value={i.downPayment} onChange={set("downPayment")} min="0" /></Field>
          <Field label="Interest rate"><NumInput suffix="%" value={i.interestRate} onChange={set("interestRate")} min="0" max="30" step="0.05" /></Field>
          <Field label="Loan term"><NumInput suffix="yrs" value={i.loanTermYears} onChange={set("loanTermYears")} min="1" max="40" /></Field>
        </div>
        <div className="lg-form-section-title lg-mt">Income</div>
        <div className="lg-form-grid lg-form-grid-1">
          <Field label="Monthly rent"><NumInput prefix="$" value={i.monthlyRent} onChange={set("monthlyRent")} min="0" /></Field>
          <Field label="Other income"><NumInput prefix="$" value={i.otherIncome} onChange={set("otherIncome")} min="0" /></Field>
          <Field label="Vacancy rate"><NumInput suffix="%" value={i.vacancyPct} onChange={set("vacancyPct")} min="0" max="100" /></Field>
        </div>
        <div className="lg-form-section-title lg-mt">Expenses</div>
        <div className="lg-form-grid lg-form-grid-1">
          {expenseFields.map(([k, label]) => (
            <Field key={k} label={label}><NumInput prefix="$" value={i[k]} onChange={set(k)} min="0" /></Field>
          ))}
        </div>
      </div>
      <div className="lg-card lg-result-card">
        <div className="lg-form-section-title">Results</div>
        <div className={`lg-big-stat ${result.cashFlow >= 0 ? "lg-up" : "lg-down"}`}>{fmtMoney(result.cashFlow)}<span>/ month cash flow</span></div>
        <div className="lg-kv-card">
          <div className="lg-kv-row"><span>Gross monthly income</span><span className="lg-kv-val">{fmtMoney(result.grossIncome)}</span></div>
          <div className="lg-kv-row"><span>Total monthly expenses</span><span className="lg-kv-val">{fmtMoney(result.totalExpenses)}</span></div>
          <div className="lg-kv-row"><span>NOI</span><span className="lg-kv-val">{fmtMoney(result.noi)}</span></div>
          <div className="lg-kv-row"><span>Mortgage payment</span><span className="lg-kv-val">{fmtMoney(result.payment, 2)}</span></div>
          <div className="lg-kv-row lg-kv-row-total"><span>Monthly cash flow</span><span className="lg-kv-val">{fmtMoney(result.cashFlow)}</span></div>
          <div className="lg-kv-row"><span>Annual cash flow</span><span className="lg-kv-val">{fmtMoney(result.annualCashFlow)}</span></div>
          <div className="lg-kv-row"><span>Cap rate</span><span className="lg-kv-val">{fmtPct(result.capRate)}</span></div>
          <div className="lg-kv-row"><span>Cash-on-cash return</span><span className="lg-kv-val">{fmtPct(result.cashOnCash)}</span></div>
          <div className="lg-kv-row"><span>LTV</span><span className="lg-kv-val">{fmtPct(result.ltv)}</span></div>
        </div>
      </div>
    </div>
  );
}

/* ============================== STRATEGY CALCULATOR ============================== */
function StrategyCalculator() {
  const [i, setI] = useState({
    availableCash: "80000", availableEquity: "0", purchasePrice: "320000", downPaymentPct: "20",
    interestRate: "6.5", loanTermYears: "30", expectedRent: "2500", expectedExpenses: "900",
    closingCosts: "6000", rehabCosts: "5000",
  });
  const set = (k) => (v) => setI((s) => ({ ...s, [k]: v }));
  const n = (k) => parseFloat(i[k]) || 0;

  const result = useMemo(() => {
    const downPayment = n("purchasePrice") * (n("downPaymentPct") / 100);
    const loan = n("purchasePrice") - downPayment;
    const payment = calcMonthlyPayment(loan, n("interestRate"), n("loanTermYears"));
    const requiredCash = downPayment + n("closingCosts") + n("rehabCosts");
    const noi = n("expectedRent") - n("expectedExpenses");
    const cashFlow = noi - payment;
    const annualCashFlow = cashFlow * 12;
    const equity = downPayment;
    const ltv = n("purchasePrice") > 0 ? loan / n("purchasePrice") : 0;
    const capRate = n("purchasePrice") > 0 ? (noi * 12) / n("purchasePrice") : 0;
    const cashOnCash = requiredCash > 0 ? annualCashFlow / requiredCash : 0;
    const totalAvailable = n("availableCash") + n("availableEquity");
    const shortfall = requiredCash - totalAvailable;
    return { downPayment, loan, payment, requiredCash, cashFlow, annualCashFlow, equity, ltv, capRate, cashOnCash, shortfall, totalAvailable };
  }, [i]);

  return (
    <div className="lg-calc-grid">
      <div className="lg-card">
        <div className="lg-form-section-title">Available capital</div>
        <div className="lg-form-grid lg-form-grid-1">
          <Field label="Available cash"><NumInput prefix="$" value={i.availableCash} onChange={set("availableCash")} min="0" /></Field>
          <Field label="Available equity (HELOC/refi)"><NumInput prefix="$" value={i.availableEquity} onChange={set("availableEquity")} min="0" /></Field>
        </div>
        <div className="lg-form-section-title lg-mt">Deal assumptions</div>
        <div className="lg-form-grid lg-form-grid-1">
          <Field label="Purchase price"><NumInput prefix="$" value={i.purchasePrice} onChange={set("purchasePrice")} min="0" /></Field>
          <Field label="Down payment"><NumInput suffix="%" value={i.downPaymentPct} onChange={set("downPaymentPct")} min="0" max="100" /></Field>
          <Field label="Interest rate"><NumInput suffix="%" value={i.interestRate} onChange={set("interestRate")} min="0" max="30" step="0.05" /></Field>
          <Field label="Loan term"><NumInput suffix="yrs" value={i.loanTermYears} onChange={set("loanTermYears")} min="1" max="40" /></Field>
          <Field label="Expected rent"><NumInput prefix="$" value={i.expectedRent} onChange={set("expectedRent")} min="0" /></Field>
          <Field label="Expected expenses"><NumInput prefix="$" value={i.expectedExpenses} onChange={set("expectedExpenses")} min="0" /></Field>
          <Field label="Closing costs"><NumInput prefix="$" value={i.closingCosts} onChange={set("closingCosts")} min="0" /></Field>
          <Field label="Rehab costs"><NumInput prefix="$" value={i.rehabCosts} onChange={set("rehabCosts")} min="0" /></Field>
        </div>
      </div>
      <div className="lg-card lg-result-card">
        <div className="lg-form-section-title">Projected outcome</div>
        <div className={`lg-big-stat ${result.shortfall > 0 ? "lg-down" : "lg-up"}`}>
          {result.shortfall > 0 ? fmtMoney(result.shortfall) : "Fully funded"}
          <span>{result.shortfall > 0 ? "cash shortfall" : `${fmtMoney(result.totalAvailable - result.requiredCash)} buffer`}</span>
        </div>
        <div className="lg-kv-card">
          <div className="lg-kv-row"><span>Required cash</span><span className="lg-kv-val">{fmtMoney(result.requiredCash)}</span></div>
          <div className="lg-kv-row"><span>Loan amount</span><span className="lg-kv-val">{fmtMoney(result.loan)}</span></div>
          <div className="lg-kv-row"><span>Monthly payment</span><span className="lg-kv-val">{fmtMoney(result.payment, 2)}</span></div>
          <div className="lg-kv-row"><span>Monthly cash flow</span><span className="lg-kv-val">{fmtMoney(result.cashFlow)}</span></div>
          <div className="lg-kv-row"><span>Annual cash flow</span><span className="lg-kv-val">{fmtMoney(result.annualCashFlow)}</span></div>
          <div className="lg-kv-row"><span>Equity at close</span><span className="lg-kv-val">{fmtMoney(result.equity)}</span></div>
          <div className="lg-kv-row"><span>LTV</span><span className="lg-kv-val">{fmtPct(result.ltv)}</span></div>
          <div className="lg-kv-row"><span>Cap rate</span><span className="lg-kv-val">{fmtPct(result.capRate)}</span></div>
          <div className="lg-kv-row"><span>Cash-on-cash return</span><span className="lg-kv-val">{fmtPct(result.cashOnCash)}</span></div>
        </div>
      </div>
    </div>
  );
}

/* ============================== CALCULATORS PAGE ============================== */
function CalculatorsPage() {
  const [tab, setTab] = useState("mortgage");
  return (
    <div className="lg-page">
      <header className="lg-page-head">
        <div>
          <h1>Calculators</h1>
          <p className="lg-page-sub">Model a purchase before it's in your portfolio.</p>
        </div>
      </header>
      <div className="lg-tabs">
        <button className={`lg-tab ${tab === "mortgage" ? "lg-tab-active" : ""}`} onClick={() => setTab("mortgage")}>Mortgage</button>
        <button className={`lg-tab ${tab === "cashflow" ? "lg-tab-active" : ""}`} onClick={() => setTab("cashflow")}>Cash Flow</button>
      </div>
      {tab === "mortgage" ? <MortgageCalculator /> : <CashFlowCalculator />}
    </div>
  );
}

function StrategyPage() {
  return (
    <div className="lg-page">
      <header className="lg-page-head">
        <div>
          <h1>Strategy</h1>
          <p className="lg-page-sub">Test acquisition assumptions and see the impact instantly.</p>
        </div>
      </header>
      <StrategyCalculator />
    </div>
  );
}

/* ============================== ANALYTICS PAGE ============================== */
function AnalyticsPage({ properties, theme }) {
  const [propFilter, setPropFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [period, setPeriod] = useState(12);

  const filtered = useMemo(() => {
    return properties.filter((p) => {
      const matchesProp = propFilter === "All" || p.id === propFilter;
      const matchesType = typeFilter === "All" || p.type === typeFilter;
      return matchesProp && matchesType;
    });
  }, [properties, propFilter, typeFilter]);

  const list = useMemo(() => filtered.map((p) => ({ p, m: getPropertyMetrics(p) })), [filtered]);

  const totals = useMemo(() => {
    const totalValue = list.reduce((s, x) => s + x.p.currentValue, 0);
    const totalDebt = list.reduce((s, x) => s + x.m.mortgageBalance, 0);
    const totalEquity = totalValue - totalDebt;
    const monthlyIncome = list.reduce((s, x) => s + x.m.effectiveIncome, 0);
    const monthlyExpenses = list.reduce((s, x) => s + x.m.operatingExpenses + x.m.monthlyPayment, 0);
    const monthlyCashFlow = list.reduce((s, x) => s + x.m.cashFlow, 0);
    return { totalValue, totalDebt, totalEquity, monthlyIncome, monthlyExpenses, monthlyCashFlow };
  }, [list]);

  const equityGrowth = useMemo(() => {
    const months = period;
    const annualAppreciation = 0.045;
    const monthlyRate = Math.pow(1 + annualAppreciation, 1 / 12) - 1;
    const now = new Date();
    const pts = [];
    for (let i = months; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = totals.totalValue / Math.pow(1 + monthlyRate, i);
      const debt = totals.totalDebt * (1 - i / (months + 6)); // debt paid down gradually looking back
      pts.push({ month: d.toLocaleDateString("en-US", { month: "short" }), equity: Math.round(value - Math.max(debt, 0)) });
    }
    return pts;
  }, [totals, period]);

  const cashFlowTrend = useMemo(() => {
    const now = new Date();
    const pts = [];
    for (let i = period - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const seasonal = 1 + Math.sin((d.getMonth() / 12) * Math.PI * 2) * 0.04;
      pts.push({
        month: d.toLocaleDateString("en-US", { month: "short" }),
        Income: Math.round(totals.monthlyIncome * seasonal),
        Expenses: Math.round(totals.monthlyExpenses * seasonal),
      });
    }
    return pts;
  }, [totals, period]);

  const performanceTable = list;
  const gridColor = theme.chartGrid;
  const axisColor = theme.chartAxis;

  return (
    <div className="lg-page">
      <header className="lg-page-head">
        <div>
          <h1>Analytics</h1>
          <p className="lg-page-sub">Filter by property, type, or time period to explore performance.</p>
        </div>
      </header>

      <div className="lg-toolbar">
        <select className="lg-select" value={propFilter} onChange={(e) => setPropFilter(e.target.value)}>
          <option value="All">All properties</option>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="lg-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="All">All types</option>
          {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="lg-select" value={period} onChange={(e) => setPeriod(parseInt(e.target.value))}>
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
          <option value={24}>Last 24 months</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="lg-empty-page">
          <LineChartIcon size={28} strokeWidth={1.3} />
          <h2>No properties match these filters</h2>
          <p>Adjust the filters above to see analytics.</p>
        </div>
      ) : (
        <>
          <div className="lg-stat-grid">
            <StatCard label="Portfolio Value" value={fmtMoney(totals.totalValue)} />
            <StatCard label="Equity" value={fmtMoney(totals.totalEquity)} />
            <StatCard label="Debt" value={fmtMoney(totals.totalDebt)} />
            <StatCard label="Monthly Cash Flow" value={fmtMoney(totals.monthlyCashFlow)} tone={totals.monthlyCashFlow >= 0 ? "up" : "down"} />
          </div>

          <div className="lg-chart-grid">
            <div className="lg-card lg-chart-card">
              <div className="lg-chart-title">Equity growth</div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={equityGrowth} margin={{ left: -18, top: 8, right: 8 }}>
                  <defs>
                    <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.green} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={C.green} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={gridColor} vertical={false} />
                  <XAxis dataKey="month" stroke={axisColor} fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke={axisColor} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} width={54} />
                  <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="equity" stroke={C.green} strokeWidth={2} fill="url(#eqGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="lg-card lg-chart-card">
              <div className="lg-chart-title">Income vs. expenses trend</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={cashFlowTrend} margin={{ left: -18, top: 8, right: 8 }}>
                  <CartesianGrid stroke={gridColor} vertical={false} />
                  <XAxis dataKey="month" stroke={axisColor} fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke={axisColor} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${Math.round(v)}`} width={54} />
                  <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="Income" stroke={C.gold} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Expenses" stroke={C.rust} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg-card">
            <div className="lg-chart-title">Property performance</div>
            <table className="lg-table">
              <thead>
                <tr>
                  <th>Property</th><th>Cap Rate</th><th>Cash-on-Cash</th><th>Cash Flow</th><th>Equity</th>
                </tr>
              </thead>
              <tbody>
                {performanceTable.map(({ p, m }) => (
                  <tr key={p.id}>
                    <td><div className="lg-table-name">{p.name}</div></td>
                    <td>{fmtPct(m.capRate)}</td>
                    <td>{fmtPct(m.cashOnCash)}</td>
                    <td><CashFlowTag value={m.cashFlow} /></td>
                    <td>{fmtMoney(m.equity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================== SETTINGS PAGE ============================== */
function SettingsPage({ onResetDemo, onClearAll, propertyCount, theme, onSetTheme, session, profile, onSaveDisplayName, onLogOut }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name || "My Portfolio");

  useEffect(() => {
    setDisplayName(profile?.display_name || "My Portfolio");
  }, [profile]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveDisplayName(displayName);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="lg-page">
      <header className="lg-page-head">
        <div>
          <h1>Settings</h1>
          <p className="lg-page-sub">Preferences and account controls.</p>
        </div>
      </header>

      <div className="lg-card">
        <div className="lg-form-section-title">Account</div>
        <div className="lg-settings-row lg-settings-row-first">
          <div>
            <div className="lg-settings-row-title">Signed in as</div>
            <div className="lg-settings-row-sub">{session?.email}</div>
          </div>
          <button className="lg-btn lg-btn-ghost" onClick={onLogOut}>
            <LogOut size={14} /> Log out
          </button>
        </div>
      </div>

      <div className="lg-card">
        <div className="lg-form-section-title">Appearance</div>
        <div className="lg-settings-row lg-settings-row-first">
          <div>
            <div className="lg-settings-row-title">Theme</div>
            <div className="lg-settings-row-sub">Choose how Ledgerstone looks on this device.</div>
          </div>
          <div className="lg-theme-toggle">
            <button
              className={`lg-theme-option ${theme === "light" ? "lg-theme-option-active" : ""}`}
              onClick={() => onSetTheme("light")}
            >
              <Sun size={14} /> Light
            </button>
            <button
              className={`lg-theme-option ${theme === "dark" ? "lg-theme-option-active" : ""}`}
              onClick={() => onSetTheme("dark")}
            >
              <Moon size={14} /> Dark
            </button>
          </div>
        </div>
      </div>

      <div className="lg-card">
        <div className="lg-form-section-title">Portfolio</div>
        <div className="lg-form-grid lg-form-grid-1">
          <Field label="Portfolio display name">
            <TextInput value={displayName} onChange={setDisplayName} />
          </Field>
        </div>
        <div className="lg-modal-actions lg-modal-actions-inline">
          <button className="lg-btn lg-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="lg-spin" /> : <Check size={14} />} Save preferences
          </button>
          {saved && <span className="lg-saved-note">Saved</span>}
        </div>
      </div>

      <div className="lg-card">
        <div className="lg-form-section-title">Data</div>
        <p className="lg-settings-note">
          This portfolio is stored in your Supabase account and persists across sessions. It currently holds {propertyCount} {propertyCount === 1 ? "property" : "properties"}.
        </p>
        <div className="lg-settings-row lg-settings-row-first">
          <div>
            <div className="lg-settings-row-title">Restore demo data</div>
            <div className="lg-settings-row-sub">Replace your current properties with the original demo portfolio.</div>
          </div>
          <button className="lg-btn lg-btn-ghost" onClick={() => setConfirmReset(true)}>
            <RotateCcw size={14} /> Restore demo data
          </button>
        </div>
        <div className="lg-settings-row">
          <div>
            <div className="lg-settings-row-title">Clear all properties</div>
            <div className="lg-settings-row-sub">Remove every property from your portfolio. This can't be undone.</div>
          </div>
          <button className="lg-btn lg-btn-danger" onClick={() => setConfirmClear(true)}>
            <Trash2 size={14} /> Clear all
          </button>
        </div>
      </div>

      {confirmReset && (
        <ConfirmModal
          title="Restore demo data?"
          body="This will replace your current properties with the original four demo properties. Any edits you've made will be lost."
          confirmLabel="Restore demo data"
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => { onResetDemo(); setConfirmReset(false); }}
        />
      )}
      {confirmClear && (
        <ConfirmModal
          title="Clear all properties?"
          body="Every property in your portfolio will be removed. This can't be undone."
          confirmLabel="Clear all properties"
          danger
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => { onClearAll(); setConfirmClear(false); }}
        />
      )}
    </div>
  );
}

/* ============================== DAILY BRIEFING PAGE ============================== */
const IMPACT_ORDER = ["positive", "negative", "neutral", "mixed"];
const LEVEL_ORDER = ["low", "moderate", "high"];

function ImpactBadge({ impact }) {
  const label = IMPACT_ORDER.includes(impact) ? impact : "neutral";
  return <span className={`lg-badge lg-impact-${label}`}>{label}</span>;
}
function LevelBadge({ level }) {
  const label = LEVEL_ORDER.includes(level) ? level : "low";
  return <span className={`lg-badge lg-level-${label}`}>{label} impact</span>;
}

function BriefingPage({ properties, briefing, prefs, onUpdatePrefs, onGenerate, goTo }) {
  const [showCustomize, setShowCustomize] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [deliveryNote, setDeliveryNote] = useState(false);
  const totals = useMemo(() => computePortfolioTotals(properties), [properties]);

  useEffect(() => {
    if (briefing.status === "idle") onGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleInterest = (name) => {
    onUpdatePrefs((p) => ({
      ...p,
      interests: p.interests.includes(name) ? p.interests.filter((x) => x !== name) : [...p.interests, name],
    }));
  };

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const data = briefing.data;
  const showFull = (idx) => expandedIdx === idx || prefs.length === "detailed";
  const showBody = (idx) => expandedIdx === idx || prefs.length !== "short";

  return (
    <div className="lg-page">
      <header className="lg-page-head">
        <div>
          <h1>Daily Briefing</h1>
          <p className="lg-page-sub">{today} · Personalized to your portfolio</p>
        </div>
        <div className="lg-head-actions">
          <button className="lg-btn lg-btn-ghost" onClick={() => setShowCustomize((s) => !s)}>
            <SettingsIcon size={14} /> Customize
          </button>
          <button className="lg-btn lg-btn-primary" onClick={onGenerate} disabled={briefing.status === "loading"}>
            {briefing.status === "loading" ? <Loader2 size={14} className="lg-spin" /> : <RefreshCw size={14} />}
            {briefing.status === "loading" ? "Analyzing…" : "Refresh briefing"}
          </button>
        </div>
      </header>

      {showCustomize && (
        <div className="lg-card">
          <div className="lg-form-section-title">News interests</div>
          <div className="lg-chip-row">
            {BRIEFING_INTERESTS.map((name) => (
              <button
                key={name}
                className={`lg-chip ${prefs.interests.includes(name) ? "lg-chip-active" : ""}`}
                onClick={() => toggleInterest(name)}
              >
                {name}
              </button>
            ))}
          </div>

          <div className="lg-form-section-title lg-mt">Geographic interests</div>
          <div className="lg-form-grid lg-form-grid-1">
            <Field label="States, cities, or markets" hint="Comma-separated. Leave blank to use your property locations.">
              <TextInput
                value={prefs.geoInterests}
                onChange={(v) => onUpdatePrefs((p) => ({ ...p, geoInterests: v }))}
                placeholder="e.g. Texas, Charleston SC"
              />
            </Field>
          </div>

          <div className="lg-form-section-title lg-mt">Briefing length</div>
          <div className="lg-chip-row">
            {["short", "standard", "detailed"].map((len) => (
              <button
                key={len}
                className={`lg-chip ${prefs.length === len ? "lg-chip-active" : ""}`}
                onClick={() => onUpdatePrefs((p) => ({ ...p, length: len }))}
              >
                {len[0].toUpperCase() + len.slice(1)}
              </button>
            ))}
          </div>

          <div className="lg-form-section-title lg-mt">Delivery</div>
          <div className="lg-delivery-row">
            <div className="lg-delivery-option lg-delivery-option-active">
              <Newspaper size={14} /> In-app <span className="lg-pill lg-pill-active">Active</span>
            </div>
            <button className="lg-delivery-option" onClick={() => setDeliveryNote(true)}>
              <Mail size={14} /> Email <span className="lg-pill">Coming soon</span>
            </button>
            <button className="lg-delivery-option" onClick={() => setDeliveryNote(true)}>
              <BellRing size={14} /> Push notifications <span className="lg-pill">Coming soon</span>
            </button>
          </div>
          {deliveryNote && (
            <p className="lg-field-hint lg-mt-sm">Email and push delivery are planned for a future version of Ledgerstone.</p>
          )}

          <div className="lg-modal-actions lg-modal-actions-inline">
            <button
              className="lg-btn lg-btn-primary"
              onClick={() => {
                setShowCustomize(false);
                onGenerate();
              }}
            >
              <Check size={14} /> Apply & refresh
            </button>
          </div>
        </div>
      )}

      {properties.length > 0 ? (
        <div className="lg-stat-grid lg-stat-grid-compact">
          <StatCard label="Portfolio Value" value={fmtMoney(totals.totalValue)} />
          <StatCard label="Equity" value={fmtMoney(totals.totalEquity)} />
          <StatCard label="Debt" value={fmtMoney(totals.totalDebt)} />
          <StatCard label="Monthly Cash Flow" value={fmtMoney(totals.monthlyCashFlow)} tone={totals.monthlyCashFlow >= 0 ? "up" : "down"} />
        </div>
      ) : (
        <div className="lg-card lg-briefing-note">
          <Info size={14} />
          <span>
            You have no properties yet, so this briefing shows general market intelligence rather than portfolio-specific
            analysis.{" "}
            <button className="lg-inline-link" onClick={() => goTo("properties")}>
              Add a property
            </button>{" "}
            to personalize it.
          </span>
        </div>
      )}

      {briefing.status === "loading" && (
        <div className="lg-empty-page">
          <Loader2 size={28} strokeWidth={1.3} className="lg-spin" />
          <h2>Matching today's coverage to your portfolio…</h2>
          <p>Scoring today's stories against your properties, locations, and preferences.</p>
        </div>
      )}

      {briefing.status === "error" && (
        <div className="lg-empty-page">
          <AlertTriangle size={28} strokeWidth={1.3} />
          <h2>Couldn't build today's briefing</h2>
          <p>{briefing.error}</p>
          <button className="lg-btn lg-btn-primary" onClick={onGenerate}>
            <RefreshCw size={14} /> Try again
          </button>
        </div>
      )}

      {briefing.status === "unavailable" && (
        <div className="lg-empty-page">
          <Info size={28} strokeWidth={1.3} />
          <h2>No news source connected</h2>
          <p>This prototype ships with a curated snapshot of real news. If that snapshot is ever empty, the briefing shows this state rather than inventing stories.</p>
        </div>
      )}

      {briefing.status === "ready" && data && (
        <>
          {data.personalizationLevel === "limited" && (
            <div className="lg-card lg-briefing-note">
              <Info size={14} />
              <span>Personalization is limited — add properties or set news and geographic interests above for a more tailored briefing.</span>
            </div>
          )}

          <div className="lg-card lg-outlook-card">
            <div className="lg-outlook-label">Today's outlook</div>
            <div className={`lg-outlook-headline lg-impact-text-${(data.outlook.label || "mixed").toLowerCase()}`}>
              {data.outlook.label}
            </div>
            <p className="lg-outlook-summary">{data.outlook.summary}</p>
          </div>

          <div className="lg-section-label">Top stories</div>
          {data.topStories.length === 0 ? (
            <div className="lg-empty-page">
              <h2>No relevant stories found</h2>
              <p>Try widening your news interests or geographic focus in Customize.</p>
            </div>
          ) : (
            data.topStories.map((story, idx) => (
              <div className="lg-card lg-story-card" key={idx}>
                <button className="lg-story-head" onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}>
                  <div className="lg-story-head-main">
                    <div className="lg-story-badges">
                      <ImpactBadge impact={story.impact} />
                      <LevelBadge level={story.impactLevel} />
                      <span className="lg-badge lg-badge-neutral">{story.category}</span>
                      <span className="lg-badge lg-badge-neutral">{story.relevance}</span>
                    </div>
                    <div className="lg-story-headline">{story.headline}</div>
                    <div className="lg-story-meta">
                      {story.sourceType === "primary" && <ShieldCheck size={12} />} {story.source}
                      {story.publishedDate ? ` · ${story.publishedDate}` : ""}
                      {story.market ? ` · ${story.market}` : ""}
                    </div>
                  </div>
                  <ChevronDown size={16} className={expandedIdx === idx ? "lg-chevron-flip" : ""} />
                </button>

                {showBody(idx) && (
                  <div className="lg-story-body">
                    {story.summary && (
                      <div className="lg-story-block">
                        <span className="lg-story-label">Fact</span>
                        {story.summary}
                      </div>
                    )}
                    {story.whyItMatters && (
                      <div className="lg-story-block">
                        <span className="lg-story-label">Why it matters to you</span>
                        {story.whyItMatters}
                      </div>
                    )}
                    {showFull(idx) && story.takeaway && (
                      <div className="lg-story-block">
                        <span className="lg-story-label">Takeaway</span>
                        {story.takeaway}
                      </div>
                    )}
                    {story.affectedAreas.length > 0 && (
                      <div className="lg-story-tags">
                        {story.affectedAreas.map((a) => (
                          <span key={a} className="lg-pill">{a}</span>
                        ))}
                      </div>
                    )}
                    {story.url ? (
                      <a className="lg-story-link" href={story.url} target="_blank" rel="noreferrer">
                        Read original source <ExternalLink size={12} />
                      </a>
                    ) : (
                      <span className="lg-story-link lg-story-link-disabled">Source link unavailable</span>
                    )}
                  </div>
                )}
              </div>
            ))
          )}

          {data.marketWatch.length > 0 && (
            <>
              <div className="lg-section-label">Market watch</div>
              <div className="lg-chart-grid">
                {data.marketWatch.map((m) => (
                  <div className="lg-card" key={m.market}>
                    <div className="lg-chart-title">{m.market}</div>
                    <ul className="lg-watch-list">
                      {m.items.map((it, i) => (
                        <li key={i}>{it}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}

          {data.financingWatch.length > 0 && (
            <div className="lg-card">
              <div className="lg-chart-title lg-chart-title-icon">
                <Landmark size={14} /> Financing watch
              </div>
              <ul className="lg-watch-list">
                {data.financingWatch.map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ul>
            </div>
          )}

          {data.portfolioImpactSummary && (
            <div className="lg-card">
              <div className="lg-chart-title">Portfolio impact</div>
              <p className="lg-briefing-body-text">{data.portfolioImpactSummary}</p>
            </div>
          )}

          <p className="lg-briefing-disclaimer">
            This briefing applies rule-based relevance scoring to a curated snapshot of real, sourced news — it does not use
            Claude, Anthropic, or any other AI API, and it is not personalized financial advice. Always verify against the
            original source before making investment decisions.
          </p>
        </>
      )}
    </div>
  );
}

/* ============================== AI ASSISTANT PAGE ============================== */
const SUGGESTED_QUESTIONS = [
  "Analyze my portfolio",
  "What is my best property?",
  "Show me my biggest risks",
  "How much equity do I have?",
  "Analyze my cash flow",
  "What happens if rents fall 5%?",
];

function humanizeKey(k) {
  const s = k.replace(/([A-Z])/g, " $1").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ScenarioCard({ scenario, onOpenStrategy }) {
  if (!scenario) return null;
  if (scenario.error) {
    return (
      <div className="lg-card lg-scenario-card">
        <div className="lg-scenario-badge">Hypothetical Scenario</div>
        <p className="lg-briefing-note-text">{scenario.error}</p>
      </div>
    );
  }
  if (scenario.scope) {
    const rows =
      scenario.scope === "portfolio"
        ? [
            ["Portfolio value", fmtMoney(scenario.before.totalValue), fmtMoney(scenario.after.totalValue)],
            ["Equity", fmtMoney(scenario.before.totalEquity), fmtMoney(scenario.after.totalEquity)],
            ["Debt", fmtMoney(scenario.before.totalDebt), fmtMoney(scenario.after.totalDebt)],
            ["Monthly cash flow", fmtMoney(scenario.before.monthlyCashFlow), fmtMoney(scenario.after.monthlyCashFlow)],
            ["LTV", `${scenario.before.ltv}%`, `${scenario.after.ltv}%`],
          ]
        : [
            ["Value", fmtMoney(scenario.before.currentValue), fmtMoney(scenario.after.currentValue)],
            ["Equity", fmtMoney(scenario.before.equity), fmtMoney(scenario.after.equity)],
            ["Debt", fmtMoney(scenario.before.mortgageBalance), fmtMoney(scenario.after.mortgageBalance)],
            ["Monthly payment", fmtMoney(scenario.before.monthlyPayment, 2), fmtMoney(scenario.after.monthlyPayment, 2)],
            ["Cash flow", fmtMoney(scenario.before.cashFlow), fmtMoney(scenario.after.cashFlow)],
            ["Cap rate", `${scenario.before.capRate}%`, `${scenario.after.capRate}%`],
          ];
    return (
      <div className="lg-card lg-scenario-card">
        <div className="lg-scenario-badge">Hypothetical Scenario · {scenario.propertyName ? scenario.propertyName : "Whole portfolio"}</div>
        <table className="lg-table lg-scenario-table">
          <thead><tr><th></th><th>Current</th><th>Scenario</th></tr></thead>
          <tbody>
            {rows.map(([label, b, a]) => (
              <tr key={label}><td>{label}</td><td>{b}</td><td>{a}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const entries = Object.entries(scenario).filter(([k]) => k !== "hypothetical");
  return (
    <div className="lg-card lg-scenario-card">
      <div className="lg-scenario-badge">Hypothetical Scenario</div>
      <div className="lg-kv-card">
        {entries.map(([k, v]) => (
          <div className="lg-kv-row" key={k}>
            <span>{humanizeKey(k)}</span>
            <span className="lg-kv-val">{typeof v === "number" ? fmtMoney(v) : v}</span>
          </div>
        ))}
      </div>
      {onOpenStrategy && (
        <button className="lg-btn lg-btn-ghost lg-btn-sm lg-mt-sm" onClick={onOpenStrategy}>
          Open Strategy
        </button>
      )}
    </div>
  );
}

function detectActions(text, properties) {
  const actions = [];
  properties.forEach((p) => {
    if (text.includes(p.name)) actions.push({ key: `p-${p.id}`, label: `View ${p.name}`, type: "property", id: p.id });
  });
  const pageMap = [
    [/strategy calculator|strategy page/i, "strategy", "Open Strategy"],
    [/mortgage calculator|cash flow calculator|calculators page/i, "calculators", "Open Calculators"],
    [/\banalytics\b/i, "analytics", "Open Analytics"],
    [/\bproperties page\b|\bproperties list\b/i, "properties", "Open Properties"],
  ];
  const seenPages = new Set();
  pageMap.forEach(([re, page, label]) => {
    if (re.test(text) && !seenPages.has(page)) {
      actions.push({ key: `pg-${page}`, label, type: "page", page });
      seenPages.add(page);
    }
  });
  return actions.slice(0, 4);
}

function renderAssistantContent(text) {
  const lines = text.split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*\|.*\|\s*$/.test(line) && lines[i + 1] && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const header = line.split("|").map((c) => c.trim()).filter(Boolean);
      let j = i + 2;
      const rows = [];
      while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j])) {
        rows.push(lines[j].split("|").map((c) => c.trim()).filter(Boolean));
        j++;
      }
      blocks.push({ type: "table", header, rows });
      i = j;
      continue;
    }
    const boldHeader = line.match(/^\s*\*\*(.+?)\*\*\s*$/);
    if (boldHeader) {
      blocks.push({ type: "heading", text: boldHeader[1] });
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      let j = i;
      while (j < lines.length && /^\s*[-*]\s+/.test(lines[j])) {
        items.push(lines[j].replace(/^\s*[-*]\s+/, ""));
        j++;
      }
      blocks.push({ type: "list", items });
      i = j;
      continue;
    }
    if (line.trim() === "") { i++; continue; }
    let j = i;
    const para = [];
    while (j < lines.length && lines[j].trim() !== "" && !/^\s*\*\*(.+?)\*\*\s*$/.test(lines[j]) && !/^\s*[-*]\s+/.test(lines[j])) {
      para.push(lines[j]);
      j++;
    }
    blocks.push({ type: "p", text: para.join(" ") });
    i = j;
  }

  const inline = (t) => t.split(/(\*\*[^*]+\*\*)/g).map((part, idx) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={idx}>{part.slice(2, -2)}</strong> : <React.Fragment key={idx}>{part}</React.Fragment>
  );

  return blocks.map((b, idx) => {
    if (b.type === "heading") return <div className="lg-chat-heading" key={idx}>{b.text}</div>;
    if (b.type === "list") return (
      <ul className="lg-chat-list" key={idx}>
        {b.items.map((it, i2) => <li key={i2}>{inline(it)}</li>)}
      </ul>
    );
    if (b.type === "table") return (
      <table className="lg-table lg-chat-table" key={idx}>
        <thead><tr>{b.header.map((h, i2) => <th key={i2}>{h}</th>)}</tr></thead>
        <tbody>{b.rows.map((r, i2) => <tr key={i2}>{r.map((c, i3) => <td key={i3}>{inline(c)}</td>)}</tr>)}</tbody>
      </table>
    );
    return <p className="lg-chat-p" key={idx}>{inline(b.text)}</p>;
  });
}

function AssistantPage({ properties, messages, setMessages, goTo, openProperty }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const prior = messages;
    setMessages((m) => [...m, { role: "user", content: trimmed }]);
    setInput("");
    setLoading(true);
    try {
      const context = buildPortfolioContext(properties);
      const result = await AIService.ask(properties, context, prior, trimmed);
      setMessages((m) => [...m, { role: "assistant", content: result.text, scenario: result.scenario }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: "", isError: true, errorText: e?.message || "Something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <div className="lg-page lg-page-assistant">
      <header className="lg-page-head">
        <div>
          <h1>AI Assistant</h1>
          <p className="lg-page-sub">A portfolio-aware copilot that answers using your real numbers.</p>
        </div>
        {messages.length > 0 && (
          <button className="lg-btn lg-btn-ghost" onClick={() => setConfirmClear(true)}>
            <Trash2 size={14} /> Clear conversation
          </button>
        )}
      </header>

      <div className="lg-assistant-shell">
        <div className="lg-assistant-messages" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="lg-assistant-empty">
              <div className="lg-briefing-teaser-icon lg-assistant-empty-icon"><Bot size={20} /></div>
              <h2>Ask about your portfolio</h2>
              <p>I can analyze your properties, run calculations, and model hypothetical scenarios — all using your real portfolio data.</p>
              <div className="lg-chip-row lg-assistant-suggestions">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button key={q} className="lg-chip" onClick={() => send(q)}>{q}</button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, idx) => (
              <div key={idx} className={`lg-chat-row ${m.role === "user" ? "lg-chat-row-user" : "lg-chat-row-assistant"}`}>
                {m.role === "assistant" && <div className="lg-chat-avatar"><Bot size={14} /></div>}
                <div className={`lg-chat-bubble ${m.role === "user" ? "lg-chat-bubble-user" : "lg-chat-bubble-assistant"}`}>
                  {m.isError ? (
                    <div className="lg-chat-error"><AlertTriangle size={14} /> {m.errorText}</div>
                  ) : m.role === "assistant" ? (
                    <>
                      {renderAssistantContent(m.content)}
                      {m.scenario && <ScenarioCard scenario={m.scenario} onOpenStrategy={() => goTo("strategy")} />}
                      {detectActions(m.content, properties).length > 0 && (
                        <div className="lg-chip-row lg-mt-sm">
                          {detectActions(m.content, properties).map((a) => (
                            <button
                              key={a.key}
                              className="lg-chip"
                              onClick={() => (a.type === "property" ? openProperty(a.id) : goTo(a.page))}
                            >
                              {a.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="lg-chat-row lg-chat-row-assistant">
              <div className="lg-chat-avatar"><Bot size={14} /></div>
              <div className="lg-chat-bubble lg-chat-bubble-assistant lg-chat-typing">
                <span /><span /><span />
              </div>
            </div>
          )}
        </div>

        <div className="lg-assistant-inputbar">
          <input
            className="lg-assistant-input"
            placeholder="Ask about your portfolio…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          <button className="lg-btn lg-btn-primary lg-assistant-send" onClick={() => send(input)} disabled={loading || !input.trim()}>
            {loading ? <Loader2 size={15} className="lg-spin" /> : <Send size={15} />}
          </button>
        </div>
      </div>

      <p className="lg-briefing-disclaimer">
        The AI Assistant uses an AI model to analyze your portfolio and run calculations through this app's own formulas.
        It's not personalized financial advice — always double-check important numbers before acting on them.
      </p>

      {confirmClear && (
        <ConfirmModal
          title="Clear this conversation?"
          body="Your chat history with the assistant will be removed. This can't be undone."
          confirmLabel="Clear conversation"
          danger
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => { setMessages([]); setConfirmClear(false); }}
        />
      )}
    </div>
  );
}

/* ============================== AUTH SCREEN ============================== */
function AuthScreen({ view, setView, onSignIn, onSignUp, busy, error, notice }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    setLocalError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) { setLocalError("Enter your email and password."); return; }
    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) { setLocalError("Enter a valid email address."); return; }
    if (password.length < 6) { setLocalError("Password must be at least 6 characters."); return; }
    if (view === "signUp" && password !== confirmPassword) { setLocalError("Passwords don't match."); return; }
    if (view === "signUp") onSignUp(trimmedEmail, password);
    else onSignIn(trimmedEmail, password);
  };

  const shownError = localError || error;

  return (
    <div className="lg-auth-root">
      <div className="lg-auth-card">
        <div className="lg-brand lg-auth-brand">
          <div className="lg-brand-mark">L</div>
          <div>
            <div className="lg-auth-brand-name">Ledgerstone</div>
            <div className="lg-auth-brand-tag">Portfolio Tracker</div>
          </div>
        </div>

        <h1 className="lg-auth-title">{view === "signUp" ? "Create your account" : "Welcome back"}</h1>
        <p className="lg-auth-sub">{view === "signUp" ? "Set up your portfolio workspace." : "Sign in to your portfolio."}</p>

        {notice && <div className="lg-auth-notice">{notice}</div>}

        <form onSubmit={submit} className="lg-auth-form">
          <Field label="Email">
            <TextInput value={email} onChange={setEmail} placeholder="you@example.com" type="email" autoComplete="email" />
          </Field>
          <Field label="Password">
            <div className="lg-input-wrap">
              <input
                type="password"
                className="lg-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={view === "signUp" ? "new-password" : "current-password"}
                placeholder="••••••••"
              />
            </div>
          </Field>
          {view === "signUp" && (
            <Field label="Confirm password">
              <div className="lg-input-wrap">
                <input
                  type="password"
                  className="lg-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
              </div>
            </Field>
          )}
          {shownError && (
            <div className="lg-auth-error"><AlertTriangle size={13} /> {shownError}</div>
          )}
          <button type="submit" className="lg-btn lg-btn-primary lg-auth-submit" disabled={busy}>
            {busy ? <Loader2 size={15} className="lg-spin" /> : <Lock size={14} />}
            {busy ? "Please wait…" : view === "signUp" ? "Create account" : "Sign in"}
          </button>
        </form>

        <div className="lg-auth-switch">
          {view === "signUp" ? (
            <>Already have an account? <button type="button" onClick={() => { setView("signIn"); setLocalError(null); }}>Sign in</button></>
          ) : (
            <>New to Ledgerstone? <button type="button" onClick={() => { setView("signUp"); setLocalError(null); }}>Create an account</button></>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================== APP ROOT ============================== */
export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authView, setAuthView] = useState("signIn");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authNotice, setAuthNotice] = useState(null);

  const [profile, setProfile] = useState(null);
  const [properties, setProperties] = useState([]);
  const [propertiesLoading, setPropertiesLoading] = useState(false);
  const [dataError, setDataError] = useState(null);

  const [page, setPage] = useState("dashboard");
  const [selectedId, setSelectedId] = useState(null);
  const [formModal, setFormModal] = useState(null); // null | 'add' | property object (edit)
  const [detailDeleteConfirm, setDetailDeleteConfirm] = useState(false);
  const [themeName, setThemeName] = useState("light");
  const T = themeName === "dark" ? DARK_THEME : LIGHT_THEME;
  const [briefingPrefs, setBriefingPrefs] = useState(DEFAULT_BRIEFING_PREFS);
  const [briefing, setBriefing] = useState({ status: "idle", data: null, error: null });
  const [assistantMessages, setAssistantMessages] = useState([]);

  // Restore a session from this artifact's persistent storage on first load —
  // the equivalent of "restore session on return" without browser localStorage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadStoredSession();
      if (!stored) { if (!cancelled) setAuthLoading(false); return; }
      const fresh = await ensureFreshSession(stored);
      if (cancelled) return;
      if (fresh) { setSession(fresh); await saveStoredSession(fresh); }
      else { await clearStoredSession(); }
      setAuthLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Load this user's profile + properties from Supabase whenever the session changes.
  useEffect(() => {
    if (!session) { setProperties([]); setProfile(null); return; }
    let cancelled = false;
    (async () => {
      setPropertiesLoading(true);
      setDataError(null);
      try {
        const [prof, props] = await Promise.all([ensureProfile(session), fetchPropertiesForUser(session)]);
        if (cancelled) return;
        setProfile(prof);
        setProperties(props);
      } catch (e) {
        if (!cancelled) setDataError(e?.message || "Couldn't load your portfolio from Supabase.");
      } finally {
        if (!cancelled) setPropertiesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session]);

  const handleSignUp = async (email, password) => {
    setAuthBusy(true); setAuthError(null); setAuthNotice(null);
    try {
      const data = await SupabaseAuth.signUp(email, password);
      const s = sessionFromAuthResponse(data);
      if (s) { setSession(s); await saveStoredSession(s); }
      else { setAuthNotice("Check your email to confirm your account, then sign in."); setAuthView("signIn"); }
    } catch (e) {
      setAuthError(e?.message || "Sign up failed. Please try again.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignIn = async (email, password) => {
    setAuthBusy(true); setAuthError(null); setAuthNotice(null);
    try {
      const data = await SupabaseAuth.signIn(email, password);
      const s = sessionFromAuthResponse(data);
      if (s) { setSession(s); await saveStoredSession(s); }
      else { setAuthError("Couldn't sign in. Please try again."); }
    } catch (e) {
      setAuthError(e?.message || "Incorrect email or password.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogOut = async () => {
    if (session) await SupabaseAuth.signOut(session.accessToken);
    await clearStoredSession();
    setSession(null);
    setProfile(null);
    setProperties([]);
    setPage("dashboard");
    setAuthView("signIn");
  };

  const generateBriefing = useCallback(() => {
    setBriefing((b) => ({ ...b, status: "loading", error: null }));
    // Rule-based, entirely local — no network call and no AI API. The brief delay is just for a
    // smooth loading transition while the relevance engine scores today's stories.
    setTimeout(() => {
      try {
        const result = buildBriefing(properties, briefingPrefs);
        if (result.unavailable) {
          setBriefing({ status: "unavailable", data: null, error: null });
        } else {
          setBriefing({ status: "ready", data: result, error: null });
        }
      } catch (e) {
        setBriefing({ status: "error", data: null, error: e?.message || "Something went wrong building your briefing." });
      }
    }, 220);
  }, [properties, briefingPrefs]);

  const goTo = useCallback((p) => {
    setPage(p);
    if (p !== "propertyDetail") setSelectedId(null);
  }, []);

  const openProperty = useCallback((id) => {
    setSelectedId(id);
    setPage("propertyDetail");
  }, []);

  const addProperty = async (p) => {
    if (!session) return;
    try {
      const inserted = await insertPropertyRow(session, p);
      setProperties((prev) => [...prev, inserted]);
      setFormModal(null);
    } catch (e) {
      setDataError(e?.message || "Couldn't add that property. Please try again.");
    }
  };
  const updateProperty = async (id, patch) => {
    if (!session) return;
    try {
      const updated = await updatePropertyRow(session, id, patch);
      setProperties((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (e) {
      setDataError(e?.message || "Couldn't save that change. Please try again.");
    }
  };
  const saveEdit = async (p) => {
    if (!session) return;
    try {
      const updated = await updatePropertyRow(session, p.id, p);
      setProperties((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
      setFormModal(null);
    } catch (e) {
      setDataError(e?.message || "Couldn't save changes. Please try again.");
    }
  };
  const deleteProperty = async (id) => {
    if (!session) return;
    try {
      await deletePropertyRow(session, id);
      setProperties((prev) => prev.filter((p) => p.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setPage("properties");
      }
    } catch (e) {
      setDataError(e?.message || "Couldn't delete that property. Please try again.");
    }
  };
  const onResetDemo = async () => {
    if (!session) return;
    try {
      await deleteAllPropertiesForUser(session);
      const inserted = await bulkInsertProperties(session, makeDemoProperties());
      setProperties(inserted);
      setPage("dashboard");
    } catch (e) {
      setDataError(e?.message || "Couldn't restore demo data.");
    }
  };
  const onClearAll = async () => {
    if (!session) return;
    try {
      await deleteAllPropertiesForUser(session);
      setProperties([]);
      setPage("dashboard");
    } catch (e) {
      setDataError(e?.message || "Couldn't clear your properties.");
    }
  };
  const onSaveDisplayName = async (name) => {
    if (!session) return;
    try {
      const updated = await updateProfileDisplayName(session, name);
      setProfile(updated);
    } catch (e) {
      setDataError(e?.message || "Couldn't save your preferences.");
      throw e;
    }
  };

  const selected = properties.find((p) => p.id === selectedId) || null;

  return (
    <div className="lg-app">
      <style>{`
        ${FONT_IMPORT}
        * { box-sizing: border-box; }
        .lg-app {
          font-family: 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif;
          background: ${T.bg};
          color: ${T.text};
          min-height: 100vh;
          display: flex;
          width: 100%;
          transition: background 0.18s ease, color 0.18s ease;
        }
        h1, h2, h3 { font-family: 'Fraunces', ui-serif, Georgia, serif; margin: 0; font-weight: 500; letter-spacing: -0.01em; }
        h1 { font-size: 26px; color: ${T.text}; }
        h2 { font-size: 19px; color: ${T.text}; }
        h3 { font-size: 18px; color: ${T.text}; }
        p { margin: 0; }
        button { font-family: inherit; cursor: pointer; }
        select, input { font-family: inherit; }

        /* Sidebar — a fixed dark brand rail in both themes */
        .lg-sidebar {
          width: 224px;
          flex-shrink: 0;
          background: ${C.ink};
          color: ${C.ivory};
          display: flex;
          flex-direction: column;
          padding: 22px 14px;
          min-height: 100vh;
          position: sticky;
          top: 0;
        }
        .lg-brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px 22px 8px; }
        .lg-brand-mark {
          width: 32px; height: 32px; border-radius: 7px;
          background: linear-gradient(155deg, ${C.gold}, #8f7136);
          display: flex; align-items: center; justify-content: center;
          font-family: 'Fraunces', serif; font-weight: 600; font-size: 16px; color: ${C.ink};
        }
        .lg-brand-name { font-family: 'Fraunces', serif; font-size: 15.5px; letter-spacing: 0.01em; }
        .lg-brand-tag { font-size: 10.5px; color: ${C.mutedOnDark}; margin-top: 1px; }
        .lg-nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
        .lg-nav-item {
          display: flex; align-items: center; gap: 10px;
          background: transparent; border: none; color: ${C.mutedOnDark};
          padding: 10px 10px; border-radius: 7px; font-size: 13.5px; text-align: left;
          position: relative; transition: background 0.15s, color 0.15s;
        }
        .lg-nav-item:hover { background: rgba(246,242,232,0.06); color: ${C.ivory}; }
        .lg-nav-item-active { background: ${C.goldSoft}; color: ${C.gold}; }
        .lg-nav-dot { margin-left: auto; width: 5px; height: 5px; border-radius: 50%; background: ${C.gold}; }
        .lg-sidebar-foot { padding: 10px 8px 2px 8px; }
        .lg-sidebar-foot-line { height: 1px; background: ${C.lineOnDark}; margin-bottom: 10px; }
        .lg-sidebar-foot-text { font-size: 10.5px; color: ${C.mutedOnDark}; }

        /* Page layout */
        .lg-page { flex: 1; padding: 34px 42px 60px; max-width: 1180px; }
        .lg-page-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 22px; gap: 16px; flex-wrap: wrap; }
        .lg-page-sub { color: ${T.muted}; font-size: 13.5px; margin-top: 5px; }
        .lg-head-actions { display: flex; gap: 8px; flex-shrink: 0; }
        .lg-back-link {
          display: inline-flex; align-items: center; gap: 4px; background: none; border: none;
          color: ${T.muted}; font-size: 13px; padding: 0; margin-bottom: 14px;
        }
        .lg-back-link:hover { color: ${T.text}; }

        /* Stat grid — always the dark brand card, regardless of theme */
        .lg-stat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; margin-bottom: 24px; }
        .lg-stat {
          background: ${C.ink}; color: ${C.ivory}; border-radius: 10px; padding: 16px 17px;
          border: 1px solid ${C.ink2};
        }
        .lg-stat-label { font-size: 11px; color: ${C.mutedOnDark}; margin-bottom: 8px; letter-spacing: 0.01em; }
        .lg-stat-value { font-family: 'Fraunces', serif; font-size: 21px; font-weight: 500; color: ${C.gold}; }
        .lg-stat-sub { font-size: 11.5px; margin-top: 6px; color: ${C.mutedOnDark}; display: flex; align-items: center; gap: 3px; }
        .lg-up { color: #7FAE86 !important; }
        .lg-down { color: #C77B62 !important; }

        /* Cards */
        .lg-card { background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 12px; padding: 20px 22px; margin-bottom: 16px; }
        .lg-chart-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
        .lg-chart-card { padding-bottom: 8px; }
        .lg-chart-title { font-size: 13.5px; font-weight: 600; margin-bottom: 12px; color: ${T.text}; }

        /* Table */
        .lg-table-wrap { padding: 0; overflow: hidden; }
        .lg-table { width: 100%; border-collapse: collapse; }
        .lg-table th {
          text-align: left; font-size: 11px; color: ${T.muted}; font-weight: 600;
          padding: 12px 22px; border-bottom: 1px solid ${T.border}; text-transform: none;
        }
        .lg-table td { padding: 13px 22px; border-bottom: 1px solid ${T.border}; font-size: 13.5px; vertical-align: middle; color: ${T.text}; }
        .lg-table tr:last-child td { border-bottom: none; }
        .lg-row-click { cursor: pointer; transition: background 0.12s; }
        .lg-row-click:hover { background: ${C.goldSoft}; }
        .lg-table-name { font-weight: 500; color: ${T.text}; }
        .lg-table-sub { font-size: 12px; color: ${T.muted}; margin-top: 2px; }
        .lg-table-arrow { color: ${T.muted}; text-align: right; }
        .lg-row-actions { display: flex; gap: 6px; justify-content: flex-end; }

        .lg-pill {
          display: inline-block; font-size: 11px; padding: 3px 9px; border-radius: 20px;
          background: ${C.goldSoft}; color: #8a6a2e; font-weight: 500;
        }
        .lg-tag { display: inline-flex; align-items: center; gap: 4px; font-size: 12.5px; font-weight: 500; padding: 3px 8px; border-radius: 6px; }
        .lg-tag-green { background: ${C.greenSoft}; color: ${C.green}; }
        .lg-tag-rust { background: ${C.rustSoft}; color: ${C.rust}; }

        /* Toolbar */
        .lg-toolbar { display: flex; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; }
        .lg-search {
          display: flex; align-items: center; gap: 8px; background: ${T.inputBg}; border: 1px solid ${T.border};
          border-radius: 8px; padding: 9px 12px; flex: 1; min-width: 220px; color: ${T.muted};
        }
        .lg-search input { border: none; outline: none; flex: 1; font-size: 13.5px; background: transparent; color: ${T.text}; }
        .lg-search-clear { background: none; border: none; color: ${T.muted}; display: flex; }
        .lg-select {
          border: 1px solid ${T.border}; border-radius: 8px; padding: 9px 30px 9px 12px; font-size: 13px;
          background-color: ${T.inputBg}; color: ${T.text}; appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238A8372'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 12px center;
        }
        .lg-select-full { width: 100%; }

        /* Buttons */
        .lg-btn {
          display: inline-flex; align-items: center; gap: 6px; border-radius: 8px; padding: 9px 15px;
          font-size: 13px; font-weight: 500; border: 1px solid transparent; transition: opacity 0.12s, background 0.12s;
        }
        .lg-btn-sm { padding: 6px 11px; font-size: 12.5px; }
        .lg-btn-primary { background: ${C.ink}; color: ${C.gold}; }
        .lg-btn-primary:hover { opacity: 0.88; }
        .lg-btn-ghost { background: ${T.surface}; color: ${T.text}; border-color: ${T.border}; }
        .lg-btn-ghost:hover { background: ${T.hover}; }
        .lg-btn-danger { background: ${T.surface}; color: ${C.rust}; border-color: ${C.rustSoft}; }
        .lg-btn-danger:hover { background: ${C.rustSoft}; }
        .lg-icon-btn { background: none; border: 1px solid transparent; border-radius: 6px; padding: 6px; color: ${T.muted}; display: flex; }
        .lg-icon-btn:hover { background: ${T.hover}; color: ${T.text}; }
        .lg-icon-btn-danger:hover { color: ${C.rust}; background: ${C.rustSoft}; }

        /* Empty states */
        .lg-empty-page {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          text-align: center; padding: 64px 20px; color: ${T.muted}; gap: 10px;
          background: ${T.surface}; border: 1px dashed ${T.border}; border-radius: 12px;
        }
        .lg-empty-page h2 { color: ${T.text}; margin-top: 6px; }
        .lg-empty-page p { max-width: 320px; font-size: 13.5px; margin-bottom: 6px; }

        /* Tabs */
        .lg-tabs { display: flex; gap: 4px; border-bottom: 1px solid ${T.border}; margin-bottom: 20px; }
        .lg-tab { background: none; border: none; padding: 10px 4px; margin-right: 20px; font-size: 13.5px; color: ${T.muted}; border-bottom: 2px solid transparent; position: relative; top: 1px; }
        .lg-tab-active { color: ${T.text}; border-bottom-color: ${C.gold}; font-weight: 600; }

        /* KV card */
        .lg-kv-card { display: flex; flex-direction: column; }
        .lg-kv-row { display: flex; justify-content: space-between; padding: 11px 0; border-bottom: 1px solid ${T.border}; font-size: 13.5px; color: ${T.text}; }
        .lg-kv-row:last-child { border-bottom: none; }
        .lg-kv-row span:first-child { color: ${T.muted}; }
        .lg-kv-val { font-weight: 600; }
        .lg-kv-row-total { border-top: 1px solid ${T.text}; margin-top: 4px; padding-top: 13px; }
        .lg-section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }

        /* Forms */
        .lg-form-section { margin-bottom: 22px; }
        .lg-form-section:last-child { margin-bottom: 0; }
        .lg-form-section-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: ${C.gold}; margin-bottom: 12px; }
        .lg-mt { margin-top: 20px; }
        .lg-form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
        .lg-form-grid-1 { grid-template-columns: repeat(2, 1fr); }
        .lg-field { display: flex; flex-direction: column; gap: 6px; }
        .lg-field-label { font-size: 12.5px; color: ${T.text}; font-weight: 500; }
        .lg-field-hint { font-size: 11px; color: ${T.muted}; }
        .lg-field-error { font-size: 11px; color: ${C.rust}; display: flex; align-items: center; gap: 4px; }
        .lg-input-wrap {
          display: flex; align-items: center; border: 1px solid ${T.border}; border-radius: 7px;
          padding: 0 10px; background: ${T.inputBg};
        }
        .lg-input-wrap:focus-within { border-color: ${C.gold}; }
        .lg-input-err { border-color: ${C.rust} !important; }
        .lg-input { border: none; outline: none; padding: 9px 4px; font-size: 13.5px; width: 100%; background: transparent; color: ${T.text}; }
        .lg-input-affix { font-size: 12.5px; color: ${T.muted}; white-space: nowrap; }
        input[type=date].lg-input { color: ${T.text}; color-scheme: ${themeName}; }

        /* Modals */
        .lg-overlay {
          position: fixed; inset: 0; background: ${T.overlay}; display: flex;
          align-items: center; justify-content: center; z-index: 50; padding: 20px;
        }
        .lg-modal { background: ${T.surface}; border-radius: 14px; padding: 24px 26px; width: 100%; max-width: 420px; }
        .lg-modal-lg { max-width: 720px; }
        .lg-modal-sm { max-width: 380px; text-align: left; }
        .lg-modal-icon { width: 34px; height: 34px; border-radius: 8px; background: ${C.rustSoft}; color: ${C.rust}; display: flex; align-items: center; justify-content: center; margin-bottom: 12px; }
        .lg-modal-body { color: ${T.muted}; font-size: 13.5px; margin-top: 8px; line-height: 1.5; }
        .lg-modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .lg-modal-scroll { max-height: 62vh; overflow-y: auto; padding-right: 6px; margin-bottom: 18px; }
        .lg-modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
        .lg-modal-actions-inline { margin-top: 14px; align-items: center; }
        .lg-saved-note { font-size: 12.5px; color: ${C.green}; }

        /* Calculators */
        .lg-calc-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 18px; align-items: start; }
        .lg-result-card { position: sticky; top: 24px; }
        .lg-big-stat { font-family: 'Fraunces', serif; font-size: 30px; margin-bottom: 16px; display: flex; align-items: baseline; gap: 8px; color: ${T.text}; }
        .lg-big-stat span { font-family: 'IBM Plex Sans', sans-serif; font-size: 12.5px; color: ${T.muted}; font-weight: 400; }

        /* Settings */
        .lg-settings-note { font-size: 13px; color: ${T.muted}; margin-bottom: 14px; }
        .lg-settings-row { display: flex; justify-content: space-between; align-items: center; padding: 14px 0; border-top: 1px solid ${T.border}; gap: 14px; }
        .lg-settings-row-first { border-top: none; padding-top: 2px; }
        .lg-settings-row-title { font-size: 13.5px; font-weight: 500; color: ${T.text}; }
        .lg-settings-row-sub { font-size: 12px; color: ${T.muted}; margin-top: 2px; }
        .lg-theme-toggle { display: flex; gap: 4px; background: ${T.bg}; border: 1px solid ${T.border}; border-radius: 9px; padding: 3px; }
        .lg-theme-option {
          display: flex; align-items: center; gap: 6px; border: none; background: transparent; color: ${T.muted};
          padding: 7px 13px; border-radius: 6px; font-size: 12.5px; font-weight: 500; transition: background 0.15s, color 0.15s;
        }
        .lg-theme-option-active { background: ${C.ink}; color: ${C.gold}; }

        /* Daily Briefing */
        .lg-briefing-teaser {
          display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
          background: ${C.ink}; color: ${C.ivory}; border: 1px solid ${C.ink2}; border-radius: 10px;
          padding: 13px 16px; margin-bottom: 20px;
        }
        .lg-briefing-teaser:hover { opacity: 0.92; }
        .lg-briefing-teaser-icon {
          width: 30px; height: 30px; border-radius: 7px; background: ${C.goldSoft}; color: ${C.gold};
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .lg-briefing-teaser-text { flex: 1; }
        .lg-briefing-teaser-title { font-size: 13.5px; font-weight: 600; font-family: 'Fraunces', serif; }
        .lg-briefing-teaser-sub { font-size: 11.5px; color: ${C.mutedOnDark}; margin-top: 2px; }

        .lg-stat-grid-compact { margin-bottom: 18px; }
        .lg-section-label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: ${T.muted}; margin: 22px 0 10px; }
        .lg-section-label:first-of-type { margin-top: 6px; }

        .lg-briefing-note {
          display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: ${T.muted};
          background: ${C.goldSoft}; border-color: ${C.goldLine};
        }
        .lg-briefing-note svg { flex-shrink: 0; margin-top: 1px; color: ${C.gold}; }
        .lg-inline-link { background: none; border: none; padding: 0; color: ${C.gold}; font-weight: 600; text-decoration: underline; font-size: inherit; cursor: pointer; }
        .lg-briefing-body-text { font-size: 13.5px; color: ${T.text}; line-height: 1.6; }
        .lg-briefing-disclaimer { font-size: 11.5px; color: ${T.muted}; margin: 18px 0 4px; line-height: 1.5; }

        .lg-outlook-card { text-align: left; }
        .lg-outlook-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: ${T.muted}; margin-bottom: 6px; }
        .lg-outlook-headline { font-family: 'Fraunces', serif; font-size: 24px; font-weight: 500; margin-bottom: 8px; }
        .lg-outlook-summary { font-size: 13.5px; color: ${T.muted}; line-height: 1.55; max-width: 640px; }
        .lg-impact-text-positive { color: ${C.green}; }
        .lg-impact-text-negative { color: ${C.rust}; }
        .lg-impact-text-neutral { color: ${T.text}; }
        .lg-impact-text-mixed { color: ${C.gold}; }

        .lg-chip-row { display: flex; flex-wrap: wrap; gap: 7px; }
        .lg-chip {
          border: 1px solid ${T.border}; background: ${T.surface}; color: ${T.muted}; border-radius: 20px;
          padding: 6px 13px; font-size: 12px; font-weight: 500; transition: background 0.12s, color 0.12s, border-color 0.12s;
        }
        .lg-chip:hover { border-color: ${C.goldLine}; }
        .lg-chip-active { background: ${C.ink}; color: ${C.gold}; border-color: ${C.ink}; }
        .lg-mt-sm { margin-top: 8px; }

        .lg-delivery-row { display: flex; flex-wrap: wrap; gap: 8px; }
        .lg-delivery-option {
          display: flex; align-items: center; gap: 7px; border: 1px solid ${T.border}; background: ${T.surface};
          color: ${T.text}; border-radius: 8px; padding: 8px 12px; font-size: 12.5px;
        }
        .lg-delivery-option-active { border-color: ${C.goldLine}; }
        .lg-pill-active { background: ${C.greenSoft}; color: ${C.green}; }

        .lg-badge {
          display: inline-block; font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em;
          padding: 3px 8px; border-radius: 5px;
        }
        .lg-impact-positive { background: ${C.greenSoft}; color: ${C.green}; }
        .lg-impact-negative { background: ${C.rustSoft}; color: ${C.rust}; }
        .lg-impact-neutral { background: ${T.hover}; color: ${T.muted}; }
        .lg-impact-mixed { background: ${C.goldSoft}; color: #8a6a2e; }
        .lg-level-low { background: ${T.hover}; color: ${T.muted}; }
        .lg-level-moderate { background: ${C.goldSoft}; color: #8a6a2e; }
        .lg-level-high { background: ${C.rustSoft}; color: ${C.rust}; }
        .lg-badge-neutral { background: ${T.hover}; color: ${T.muted}; text-transform: none; font-weight: 500; }

        .lg-story-card { padding: 0; overflow: hidden; }
        .lg-story-head {
          width: 100%; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
          background: none; border: none; text-align: left; padding: 18px 20px; color: ${T.text};
        }
        .lg-story-head-main { display: flex; flex-direction: column; gap: 7px; }
        .lg-story-badges { display: flex; gap: 6px; }
        .lg-story-headline { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 500; color: ${T.text}; }
        .lg-story-meta { font-size: 12px; color: ${T.muted}; display: flex; align-items: center; gap: 4px; }
        .lg-story-head svg:last-child { color: ${T.muted}; flex-shrink: 0; margin-top: 2px; transition: transform 0.15s; }
        .lg-chevron-flip { transform: rotate(180deg); }
        .lg-story-body { padding: 0 20px 20px; display: flex; flex-direction: column; gap: 12px; border-top: 1px solid ${T.border}; padding-top: 14px; margin: 0 20px 20px; }
        .lg-story-block { font-size: 13.5px; color: ${T.text}; line-height: 1.55; }
        .lg-story-label { display: block; font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: ${T.muted}; margin-bottom: 4px; }
        .lg-story-tags { display: flex; flex-wrap: wrap; gap: 6px; }
        .lg-story-link { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 600; color: ${C.gold}; text-decoration: none; }
        .lg-story-link:hover { text-decoration: underline; }
        .lg-story-link-disabled { color: ${T.muted}; font-weight: 500; }

        .lg-watch-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 7px; }
        .lg-watch-list li { font-size: 13px; color: ${T.text}; line-height: 1.4; }
        .lg-chart-title-icon { display: flex; align-items: center; gap: 6px; }

        .lg-spin { animation: lg-spin-anim 0.9s linear infinite; }
        @keyframes lg-spin-anim { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .lg-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        /* AI Assistant */
        .lg-page-assistant { display: flex; flex-direction: column; }
        .lg-assistant-shell {
          display: flex; flex-direction: column; height: min(70vh, 680px); min-height: 420px;
          background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 14px; overflow: hidden; margin-bottom: 14px;
        }
        .lg-assistant-messages { flex: 1; overflow-y: auto; padding: 22px 22px 8px; display: flex; flex-direction: column; gap: 16px; }
        .lg-assistant-empty {
          flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
          text-align: center; gap: 8px; padding: 20px; color: ${T.muted};
        }
        .lg-assistant-empty-icon { width: 40px; height: 40px; margin-bottom: 4px; }
        .lg-assistant-empty h2 { color: ${T.text}; }
        .lg-assistant-empty p { max-width: 380px; font-size: 13.5px; margin-bottom: 6px; }
        .lg-assistant-suggestions { justify-content: center; max-width: 480px; }

        .lg-chat-row { display: flex; gap: 10px; align-items: flex-start; }
        .lg-chat-row-user { justify-content: flex-end; }
        .lg-chat-avatar {
          width: 26px; height: 26px; border-radius: 7px; background: ${C.ink}; color: ${C.gold};
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .lg-chat-bubble { max-width: 78%; border-radius: 12px; padding: 12px 15px; font-size: 13.5px; line-height: 1.55; }
        .lg-chat-bubble-assistant { background: ${T.bg}; border: 1px solid ${T.border}; color: ${T.text}; border-bottom-left-radius: 3px; }
        .lg-chat-bubble-user { background: ${C.ink}; color: ${C.ivory}; border-bottom-right-radius: 3px; }
        .lg-chat-error { display: flex; align-items: center; gap: 6px; color: ${C.rust}; }
        .lg-chat-p { margin: 0 0 8px; }
        .lg-chat-p:last-child { margin-bottom: 0; }
        .lg-chat-heading { font-weight: 700; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.05em; color: ${C.gold}; margin: 10px 0 6px; }
        .lg-chat-heading:first-child { margin-top: 0; }
        .lg-chat-list { margin: 0 0 8px; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
        .lg-chat-table { margin: 6px 0 10px; font-size: 12.5px; }
        .lg-chat-table th, .lg-chat-table td { padding: 7px 10px; }

        .lg-chat-typing { display: flex; gap: 4px; align-items: center; padding: 14px 15px; }
        .lg-chat-typing span { width: 6px; height: 6px; border-radius: 50%; background: ${T.muted}; display: inline-block; animation: lg-typing 1.1s infinite ease-in-out; }
        .lg-chat-typing span:nth-child(2) { animation-delay: 0.15s; }
        .lg-chat-typing span:nth-child(3) { animation-delay: 0.3s; }
        @keyframes lg-typing { 0%, 60%, 100% { opacity: 0.3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-2px); } }

        .lg-assistant-inputbar {
          display: flex; gap: 8px; padding: 14px 16px; border-top: 1px solid ${T.border}; background: ${T.surface}; flex-shrink: 0;
        }
        .lg-assistant-input {
          flex: 1; border: 1px solid ${T.border}; border-radius: 9px; padding: 11px 14px; font-size: 13.5px;
          background: ${T.inputBg}; color: ${T.text}; outline: none;
        }
        .lg-assistant-input:focus { border-color: ${C.gold}; }
        .lg-assistant-send { padding: 10px 14px; flex-shrink: 0; }

        .lg-scenario-card { margin-top: 10px; padding: 14px 16px; }
        .lg-scenario-badge {
          display: inline-block; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
          color: ${C.gold}; background: ${C.goldSoft}; border-radius: 5px; padding: 4px 9px; margin-bottom: 10px;
        }
        .lg-scenario-table { font-size: 12.5px; }
        .lg-scenario-table th, .lg-scenario-table td { padding: 7px 10px; }
        .lg-briefing-note-text { font-size: 13px; color: ${T.muted}; }

        /* Auth + boot screens */
        .lg-boot-screen {
          flex: 1; display: flex; align-items: center; justify-content: center; gap: 10px;
          color: ${T.muted}; font-size: 13.5px; min-height: 100vh;
        }
        .lg-auth-root { flex: 1; display: flex; align-items: center; justify-content: center; padding: 40px 20px; min-height: 100vh; }
        .lg-auth-card { width: 100%; max-width: 380px; background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 16px; padding: 32px 30px; }
        .lg-auth-brand { padding: 0 0 22px; }
        .lg-auth-brand-name { font-family: 'Fraunces', serif; font-size: 15.5px; color: ${T.text}; letter-spacing: 0.01em; }
        .lg-auth-brand-tag { font-size: 10.5px; color: ${T.muted}; margin-top: 1px; }
        .lg-auth-title { margin-bottom: 5px; }
        .lg-auth-sub { font-size: 13px; color: ${T.muted}; margin-bottom: 20px; }
        .lg-auth-notice { font-size: 12.5px; color: ${C.green}; background: ${C.greenSoft}; border-radius: 8px; padding: 10px 12px; margin-bottom: 16px; }
        .lg-auth-form { display: flex; flex-direction: column; gap: 14px; }
        .lg-auth-error { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: ${C.rust}; }
        .lg-auth-submit { width: 100%; justify-content: center; margin-top: 2px; }
        .lg-auth-switch { text-align: center; font-size: 12.5px; color: ${T.muted}; margin-top: 20px; }
        .lg-auth-switch button { background: none; border: none; color: ${C.gold}; font-weight: 600; padding: 0; margin-left: 3px; font-size: inherit; }

        .lg-error-banner {
          display: flex; align-items: center; gap: 8px; background: ${C.rustSoft}; color: ${C.rust};
          border: 1px solid rgba(166,84,58,0.3); border-radius: 10px; padding: 10px 14px; margin: 24px 42px 0; font-size: 13px;
        }
        .lg-error-banner span { flex: 1; }
        .lg-error-banner button { background: none; border: none; color: ${C.rust}; display: flex; }

        @media (max-width: 640px) {
          .lg-assistant-shell { height: min(76vh, 620px); }
          .lg-chat-bubble { max-width: 90%; }
        }

        @media (max-width: 980px) {
          .lg-chart-grid, .lg-calc-grid { grid-template-columns: 1fr; }
          .lg-form-grid, .lg-form-grid-1 { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 640px) {
          .lg-sidebar { display: none; }
          .lg-page { padding: 20px; }
          .lg-form-grid, .lg-form-grid-1 { grid-template-columns: 1fr; }
          .lg-error-banner { margin: 20px 20px 0; }
          .lg-auth-card { padding: 26px 22px; }
        }
      `}</style>

      {authLoading ? (
        <div className="lg-boot-screen">
          <Loader2 size={22} className="lg-spin" />
          <span>Loading Ledgerstone…</span>
        </div>
      ) : !session ? (
        <AuthScreen
          view={authView}
          setView={setAuthView}
          onSignIn={handleSignIn}
          onSignUp={handleSignUp}
          busy={authBusy}
          error={authError}
          notice={authNotice}
        />
      ) : (
        <>
      <Sidebar page={page} goTo={goTo} />

      <main style={{ flex: 1, minWidth: 0 }}>
        {dataError && (
          <div className="lg-error-banner">
            <AlertTriangle size={14} />
            <span>{dataError}</span>
            <button onClick={() => setDataError(null)}><X size={13} /></button>
          </div>
        )}

        {propertiesLoading ? (
          <div className="lg-page">
            <div className="lg-empty-page">
              <Loader2 size={26} strokeWidth={1.3} className="lg-spin" />
              <h2>Loading your portfolio…</h2>
              <p>Fetching your properties from Supabase.</p>
            </div>
          </div>
        ) : (
          <>
        {page === "dashboard" && <Dashboard properties={properties} goTo={goTo} openProperty={openProperty} theme={T} briefing={briefing} />}

        {page === "properties" && (
          <PropertiesPage
            properties={properties}
            openProperty={openProperty}
            onAdd={() => setFormModal("add")}
            onEdit={(p) => setFormModal(p)}
            onDelete={deleteProperty}
          />
        )}

        {page === "propertyDetail" && selected && (
          <PropertyDetail
            property={selected}
            onBack={() => goTo("properties")}
            onUpdate={updateProperty}
            onEdit={(p) => setFormModal(p)}
            onDeleteRequest={() => setDetailDeleteConfirm(true)}
          />
        )}
        {page === "propertyDetail" && !selected && (
          <div className="lg-page">
            <div className="lg-empty-page">
              <h2>Property not found</h2>
              <p>It may have been deleted.</p>
              <button className="lg-btn lg-btn-primary" onClick={() => goTo("properties")}>Back to properties</button>
            </div>
          </div>
        )}

        {page === "briefing" && (
          <BriefingPage
            properties={properties}
            briefing={briefing}
            prefs={briefingPrefs}
            onUpdatePrefs={setBriefingPrefs}
            onGenerate={generateBriefing}
            goTo={goTo}
          />
        )}

        {page === "assistant" && (
          <AssistantPage
            properties={properties}
            messages={assistantMessages}
            setMessages={setAssistantMessages}
            goTo={goTo}
            openProperty={openProperty}
          />
        )}

        {page === "analytics" && <AnalyticsPage properties={properties} theme={T} />}
        {page === "strategy" && <StrategyPage />}
        {page === "calculators" && <CalculatorsPage />}
        {page === "settings" && (
          <SettingsPage
            propertyCount={properties.length}
            onResetDemo={onResetDemo}
            onClearAll={onClearAll}
            theme={themeName}
            onSetTheme={setThemeName}
            session={session}
            profile={profile}
            onSaveDisplayName={onSaveDisplayName}
            onLogOut={handleLogOut}
          />
        )}
          </>
        )}
      </main>

      {formModal && (
        <PropertyFormModal
          initial={formModal === "add" ? null : formModal}
          onCancel={() => setFormModal(null)}
          onSave={(p) => (formModal === "add" ? addProperty(p) : saveEdit(p))}
        />
      )}

      {detailDeleteConfirm && selected && (
        <ConfirmModal
          title="Delete this property?"
          body={`"${selected.name}" will be permanently removed from your portfolio. This can't be undone.`}
          confirmLabel="Delete property"
          danger
          onCancel={() => setDetailDeleteConfirm(false)}
          onConfirm={() => { deleteProperty(selected.id); setDetailDeleteConfirm(false); }}
        />
      )}
        </>
      )}
    </div>
  );
}
