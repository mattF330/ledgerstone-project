// supabase/functions/rentcast/index.ts
//
// Ledgerstone -> this Edge Function -> RentCast -> this Edge Function -> Ledgerstone
//
// Two modes, chosen by the JSON body:
//   1) Search (default)       { city, state, minPrice, ... }  -> active sale listings
//   2) Lookup { mode: "lookup", address: "123 Main St, Austin, TX" }
//        -> RentCast's property record + value estimate + rent estimate for ONE address,
//           used to link a property in Ledgerstone to its real RentCast data.
//
// The RentCast API key is read ONLY from the RENTCAST_API_KEY secret (Deno.env.get). It is
// never hardcoded, never logged, never returned to the caller, and never stored in a table.
// The frontend never talks to RentCast directly.

const RENTCAST_BASE_URL = "https://api.rentcast.io/v1";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Reads one field from a RentCast record, trying several possible key names.
function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null) return v;
  }
  return null;
}

function hoaFeeOf(item: Record<string, unknown>): unknown {
  const hoaRaw = pick(item, ["hoa", "hoaFee"]);
  return hoaRaw && typeof hoaRaw === "object"
    ? pick(hoaRaw as Record<string, unknown>, ["fee", "amount"])
    : hoaRaw;
}

const ALLOWED_PARAMS = [
  "address", "city", "state", "zipCode", "propertyType",
  "bedrooms", "bathrooms", "minPrice", "maxPrice", "limit",
] as const;
const NUMERIC_PARAMS = ["bedrooms", "bathrooms", "minPrice", "maxPrice", "limit"];

// ---- one RentCast GET, classified so callers can react without ever seeing raw errors ----
type Part =
  | { status: "ok"; body: any }
  | { status: "not_found" | "rate_limited" | "unauthorized" | "error" };

async function fetchPart(path: string, params: URLSearchParams, apiKey: string): Promise<Part> {
  try {
    const res = await fetch(`${RENTCAST_BASE_URL}${path}?${params.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json", "X-Api-Key": apiKey },
    });
    if (res.status === 404) return { status: "not_found" };
    if (res.status === 429) return { status: "rate_limited" };
    if (res.status === 401 || res.status === 403) {
      console.error(`rentcast: RentCast rejected a request to ${path} (${res.status}).`);
      return { status: "unauthorized" };
    }
    if (!res.ok) {
      console.error(`rentcast: RentCast returned ${res.status} for ${path}.`);
      return { status: "error" };
    }
    return { status: "ok", body: await res.json() };
  } catch (_err) {
    return { status: "error" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return json({ error: "Method not allowed. Send a POST request with a JSON body." }, 405);
  }

  // ---- 1. Require a valid, authenticated Ledgerstone/Supabase user ----
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Missing authentication. Please sign in and try again." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("rentcast: SUPABASE_URL or SUPABASE_ANON_KEY is not set.");
    return json({ error: "Server configuration is incomplete. Please contact support." }, 500);
  }

  let user: { id?: string } | null = null;
  try {
    const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` },
    });
    if (!authRes.ok) return json({ error: "Not authenticated. Please sign in and try again." }, 401);
    user = await authRes.json();
  } catch (_err) {
    return json({ error: "Could not verify authentication. Please try again." }, 401);
  }
  if (!user?.id) return json({ error: "Not authenticated. Please sign in and try again." }, 401);

  // ---- 2. Parse the request body ----
  let payload: Record<string, unknown>;
  try {
    const text = await req.text();
    payload = text ? JSON.parse(text) : {};
  } catch (_err) {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  // ---- 3. RentCast key from secrets — never from code, never logged ----
  const rentcastApiKey = Deno.env.get("RENTCAST_API_KEY");
  if (!rentcastApiKey) {
    console.error("rentcast: RENTCAST_API_KEY secret is not set.");
    return json(
      { error: "Server configuration is incomplete: the RentCast integration has not been fully set up yet." },
      500,
    );
  }

  // =====================================================================
  // MODE: lookup — link ONE address to its RentCast record + estimates
  // =====================================================================
  if (payload.mode === "lookup") {
    const address = typeof payload.address === "string" ? payload.address.trim() : "";
    if (!address) return json({ error: "Provide the property's address to look it up." }, 400);
    if (address.length > 250) return json({ error: "That address is too long." }, 400);

    const q = new URLSearchParams({ address });
    // Three independent calls; one failing shouldn't throw away the other two.
    const [record, value, rent] = await Promise.all([
      fetchPart("/properties", q, rentcastApiKey),
      fetchPart("/avm/value", q, rentcastApiKey),
      fetchPart("/avm/rent/long-term", q, rentcastApiKey),
    ]);
    const parts = [record, value, rent];

    if (parts.some((p) => p.status === "unauthorized")) {
      return json({ error: "RentCast rejected this request. Please contact support." }, 502);
    }
    if (parts.every((p) => p.status === "rate_limited")) {
      return json({ error: "RentCast's rate limit was reached. Please try again in a moment." }, 429);
    }
    if (parts.every((p) => p.status === "error" || p.status === "rate_limited")) {
      return json({ error: "Could not get data from RentCast. Please try again shortly." }, 502);
    }

    const recordBody = record.status === "ok" ? (Array.isArray(record.body) ? record.body[0] : record.body) : null;
    const valueBody = value.status === "ok" ? value.body : null;
    const rentBody = rent.status === "ok" ? rent.body : null;

    // Property facts: prefer the property record, fall back to the subject property
    // that RentCast embeds in its estimate responses.
    const subject: Record<string, unknown> | null =
      recordBody ?? valueBody?.subjectProperty ?? rentBody?.subjectProperty ?? null;

    const property = subject
      ? {
          id: pick(subject, ["id"]),
          formattedAddress: pick(subject, ["formattedAddress", "addressLine1"]),
          propertyType: pick(subject, ["propertyType"]),
          bedrooms: pick(subject, ["bedrooms"]),
          bathrooms: pick(subject, ["bathrooms"]),
          squareFootage: pick(subject, ["squareFootage", "livingArea"]),
          lotSize: pick(subject, ["lotSize"]),
          yearBuilt: pick(subject, ["yearBuilt"]),
          lastSaleDate: pick(subject, ["lastSaleDate"]),
          lastSalePrice: pick(subject, ["lastSalePrice"]),
          latitude: pick(subject, ["latitude"]),
          longitude: pick(subject, ["longitude"]),
          hoaFee: hoaFeeOf(subject),
        }
      : null;

    const valueEstimate = valueBody && valueBody.price != null
      ? {
          price: valueBody.price,
          low: valueBody.priceRangeLow ?? null,
          high: valueBody.priceRangeHigh ?? null,
          comparableCount: Array.isArray(valueBody.comparables) ? valueBody.comparables.length : null,
        }
      : null;

    const rentEstimate = rentBody && rentBody.rent != null
      ? {
          rent: rentBody.rent,
          low: rentBody.rentRangeLow ?? null,
          high: rentBody.rentRangeHigh ?? null,
          comparableCount: Array.isArray(rentBody.comparables) ? rentBody.comparables.length : null,
        }
      : null;

    return json({
      address,
      found: Boolean(property || valueEstimate || rentEstimate),
      property,
      valueEstimate,
      rentEstimate,
      // Per-part outcome ("ok" | "not_found" | "rate_limited" | "error") so the UI can say
      // exactly what was and wasn't available.
      sources: { record: record.status, value: value.status, rent: rent.status },
      fetchedAt: new Date().toISOString(),
    });
  }

  // =====================================================================
  // MODE: search (default) — active sale listings
  // =====================================================================
  const search: Record<string, string> = {};
  for (const key of ALLOWED_PARAMS) {
    const value = payload[key];
    if (value === undefined || value === null || value === "") continue;
    search[key] = String(value);
  }
  for (const key of NUMERIC_PARAMS) {
    if (search[key] !== undefined && Number.isNaN(Number(search[key]))) {
      return json({ error: `"${key}" must be a number.` }, 400);
    }
  }
  const hasLocation = search.address || search.city || search.state || search.zipCode;
  if (!hasLocation) {
    return json({ error: "Provide at least one of: address, city, state, or zipCode to search." }, 400);
  }
  if (search.state && !/^[A-Za-z]{2}$/.test(search.state)) {
    return json({ error: "\"state\" must be a 2-letter state abbreviation, e.g. \"TX\"." }, 400);
  }

  const rentcastParams = new URLSearchParams();
  if (search.address) rentcastParams.set("address", search.address);
  if (search.city) rentcastParams.set("city", search.city);
  if (search.state) rentcastParams.set("state", search.state.toUpperCase());
  if (search.zipCode) rentcastParams.set("zipCode", search.zipCode);
  if (search.propertyType) rentcastParams.set("propertyType", search.propertyType);
  if (search.bedrooms) rentcastParams.set("bedrooms", search.bedrooms);
  if (search.bathrooms) rentcastParams.set("bathrooms", search.bathrooms);
  // RentCast filters listing price with a single "price" range param ("200000:500000").
  if (search.minPrice || search.maxPrice) {
    rentcastParams.set("price", `${search.minPrice ?? ""}:${search.maxPrice ?? ""}`);
  }
  const limitNum = Math.min(Math.max(parseInt(search.limit || "20", 10) || 20, 1), 100);
  rentcastParams.set("limit", String(limitNum));
  rentcastParams.set("status", "Active");

  let rentcastRes: Response;
  try {
    rentcastRes = await fetch(`${RENTCAST_BASE_URL}/listings/sale?${rentcastParams.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json", "X-Api-Key": rentcastApiKey },
    });
  } catch (_err) {
    return json({ error: "Could not reach RentCast. Please try again shortly." }, 502);
  }

  if (rentcastRes.status === 401 || rentcastRes.status === 403) {
    console.error(`rentcast: RentCast rejected the request (${rentcastRes.status}).`);
    return json({ error: "RentCast rejected this request. Please contact support." }, 502);
  }
  if (rentcastRes.status === 429) {
    return json({ error: "RentCast's rate limit was reached. Please try again in a moment." }, 429);
  }
  if (!rentcastRes.ok) {
    let detail = "";
    try {
      const errBody = await rentcastRes.json();
      detail = typeof errBody?.message === "string" ? errBody.message : "";
    } catch (_err) { /* ignore unparsable error body */ }
    return json({ error: detail || `RentCast returned an unexpected error (status ${rentcastRes.status}).` }, 502);
  }

  let raw: unknown;
  try {
    raw = await rentcastRes.json();
  } catch (_err) {
    return json({ error: "RentCast returned a response that couldn't be read." }, 502);
  }
  const list: Record<string, any>[] = Array.isArray(raw) ? (raw as Record<string, any>[]) : [];

  const properties = list.map((item) => ({
    id: pick(item, ["id", "listingId", "propertyId"]),
    address: pick(item, ["addressLine1", "formattedAddress", "address"]),
    city: pick(item, ["city"]),
    state: pick(item, ["state"]),
    zipCode: pick(item, ["zipCode", "zip"]),
    propertyType: pick(item, ["propertyType"]),
    price: pick(item, ["price", "listPrice"]),
    rentEstimate: pick(item, ["rentEstimate", "rent", "avmRent"]),
    bedrooms: pick(item, ["bedrooms"]),
    bathrooms: pick(item, ["bathrooms"]),
    squareFootage: pick(item, ["squareFootage", "livingArea"]),
    yearBuilt: pick(item, ["yearBuilt"]),
    latitude: item.latitude ?? item.subjectProperty?.latitude ?? null,
    longitude: item.longitude ?? item.subjectProperty?.longitude ?? null,
    status: pick(item, ["status"]),
    hoaFee: hoaFeeOf(item),
    listingType: pick(item, ["listingType"]),
    listedDate: pick(item, ["listedDate", "listingDate"]),
    daysOnMarket: pick(item, ["daysOnMarket"]),
    mlsNumber: pick(item, ["mlsNumber"]),
  }));

  const totalCountHeader = rentcastRes.headers.get("X-Total-Count");
  return json({
    count: properties.length,
    totalCount: totalCountHeader ? Number(totalCountHeader) : properties.length,
    properties,
  });
});
