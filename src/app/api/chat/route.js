import { Resend } from "resend";

/**
 * ================================
 *  PROMPT BASE (NEGOCIO)
 * ================================
 */
const SYSTEM_PROMPT = `
Eres “Asistente de Tony’s DJ”, asistente oficial de servicios de DJ en Puerto Rico.
Hablas en español boricua, con tono profesional, claro y amable.

REGLA CRÍTICA:
❌ NO puedes dar precios ni calcular costos
❌ SOLO puedes MOSTRAR los valores que te da el backend

FORMA DE HACER LAS PREGUNTAS:
- UNA pregunta a la vez
- NO repetir preguntas ya contestadas
- Si falta algo, pregunta SOLO eso
`;

/**
 * ================================
 *  HELPERS DE TIEMPO
 * ================================
 */
function normalizeTimeStr(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

function looksLikeTimeToken(msg) {
  const s = normalizeTimeStr(msg);
  return (
    /^(\d{1,2})(am|pm)$/.test(s) ||
    /^(\d{1,2}):(\d{2})(am|pm)$/.test(s) ||
    /^(\d{1,2}):(\d{2})$/.test(s)
  );
}

function parseTimeToMinutes(raw) {
  if (!raw) return null;
  const s = raw.toLowerCase();

  let m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);

  m = s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
  if (!m) return null;

  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (m[3] === "pm" && h !== 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;

  return h * 60 + min;
}

function computeDurationMinutes(start, end) {
  const s = parseTimeToMinutes(start);
  const e = parseTimeToMinutes(end);
  if (s == null || e == null) return null;
  let diff = e - s;
  if (diff < 0) diff += 1440;
  return diff;
}

function computeExtraTimeCharge(start, end) {
  const dur = computeDurationMinutes(start, end);
  if (!dur) return { durationMinutes: null, extraTimeCharge: 0 };
  const base = 300;
  if (dur <= base) return { durationMinutes: dur, extraTimeCharge: 0 };
  return {
    durationMinutes: dur,
    extraTimeCharge: Math.ceil((dur - base) / 30) * 25,
  };
}

/**
 * ================================
 *  PRECIOS (BACKEND)
 * ================================
 */
const BASE_PRICE = 350;

function computeZoneCharge(town = "") {
  const t = town.toLowerCase();

  if (["caguas","gurabo","canóvanas","loíza","río grande","toa alta","vega baja","vega alta","naranjito"].some(z => t.includes(z))) return 25;
  if (["arecibo","barceloneta","manatí","humacao","juncos","san lorenzo","fajardo","guayama"].some(z => t.includes(z))) return 100;
  if (["ponce","mayagüez","aguadilla","cabo rojo","isabela","hatillo","jayuya","utuado","yauco"].some(z => t.includes(z))) return 150;

  return 0;
}

function computeComplexityCharge(venue = "") {
  const v = venue.toLowerCase();
  if (v.includes("the place")) return 500;
  if (v.includes("centro de convenciones")) return 100;
  return 0;
}

/**
 * ================================
 *  POST /api/chat
 * ================================
 */
export async function POST(req) {
  const { message, lead = {} } = await req.json();

  if (looksLikeTimeToken(message)) {
    if (!lead.startTime) lead.startTime = message;
    else if (!lead.endTime) lead.endTime = message;
  }

  const REQUIRED = ["name","date","startTime","endTime","town","venueType","eventType","email","phone"];
  const missing = REQUIRED.filter(f => !lead[f]);

  const { extraTimeCharge } = computeExtraTimeCharge(lead.startTime, lead.endTime);
  const zoneCharge = computeZoneCharge(lead.town);
  const complexityCharge = computeComplexityCharge(lead.venueType);

  const total =
    complexityCharge === 500
      ? 500 + extraTimeCharge
      : BASE_PRICE + extraTimeCharge + zoneCharge + complexityCharge;

  const SYSTEM_PROMPT_DYNAMIC = `
ESTADO DEL LEAD:
${REQUIRED.map(f => `${f}: ${lead[f] || "❌"}`).join("\n")}

CÁLCULOS OFICIALES:
Precio base: $${BASE_PRICE}
Tiempo adicional: $${extraTimeCharge}
Cargo por distancia: $${zoneCharge}
Cargo por complejidad: $${complexityCharge}
TOTAL FINAL: $${total}

REGLA:
❌ NO recalcular
❌ NO cambiar cantidades
`;

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: SYSTEM_PROMPT + SYSTEM_PROMPT_DYNAMIC },
        { role: "user", content: message },
      ],
      max_output_tokens: 250,
    }),
  });

  const data = await r.json();
  const reply =
    data.output_text ||
    data?.output?.[0]?.content?.map(c => c.text).join("") ||
    "";

  return Response.json({ reply, lead, total });
}
