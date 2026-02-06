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
❌ NO puedes dar precios, rangos ni cantidades
❌ NO puedes insinuar costos
HASTA que el cliente provea TODA la información obligatoria.

INFORMACIÓN OBLIGATORIA PARA COTIZAR (TODOS REQUERIDOS):
1) Nombre completo
2) Fecha del evento
3) Horario del evento (hora inicio y fin)
4) Lugar del evento (pueblo y tipo de lugar)
5) Tipo de actividad
6) Correo electrónico (OBLIGATORIO, sin excepción)
7) Número de teléfono

REGLA CRÍTICA SOBRE EL HORARIO:
- DEBES obtener hora de inicio Y hora de fin.
- Sin ambas horas NO se puede cotizar.
- Se usan para calcular horas adicionales.
- Si falta una, pide SOLO la que falte.

FORMA DE HACER LAS PREGUNTAS:
- UNA pregunta a la vez.
- Nunca hagas listas.
- Espera respuesta antes de continuar.
- PROHIBIDO repetir preguntas ya contestadas.

PRECIO BASE:
- $350 por 5 horas en área metropolitana.

HORAS ADICIONALES:
- $25 cada 30 minutos adicionales.
- Fracciones se redondean hacia arriba.
`;

/**
 * ================================
 *  Helpers de tiempo
 * ================================
 */
function normalizeTimeStr(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

function looksLikeTimeToken(msg) {
  const s = normalizeTimeStr(msg);
  if (!s) return false;
  return (
    /^(\d{1,2})(am|pm)$/.test(s) ||
    /^(\d{1,2}):(\d{2})(am|pm)$/.test(s) ||
    /^(\d{1,2}):(\d{2})$/.test(s)
  );
}

function parseTimeToMinutes(raw) {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");

  let m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) return hh * 60 + mm;
  }

  m = s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
  if (m) {
    let hh = Number(m[1]);
    const mm = m[2] ? Number(m[2]) : 0;
    const ap = m[3];

    if (hh < 1 || hh > 12 || mm < 0 || mm > 59) return null;

    if (ap === "am") {
      if (hh === 12) hh = 0;
    } else {
      if (hh !== 12) hh += 12;
    }
    return hh * 60 + mm;
  }

  return null;
}

function computeDurationMinutes(startRaw, endRaw) {
  const start = parseTimeToMinutes(startRaw);
  const end = parseTimeToMinutes(endRaw);
  if (start == null || end == null) return null;

  let diff = end - start;
  if (diff < 0) diff += 24 * 60;
  return diff;
}

function computeExtraTimeCharge(startRaw, endRaw) {
  const dur = computeDurationMinutes(startRaw, endRaw);
  if (dur == null) return { durationMinutes: null, extraTimeCharge: 0 };

  const base = 5 * 60;
  if (dur <= base) return { durationMinutes: dur, extraTimeCharge: 0 };

  const extraMinutes = dur - base;
  const blocks30 = Math.ceil(extraMinutes / 30);
  return { durationMinutes: dur, extraTimeCharge: blocks30 * 25 };
}

/**
 * ================================
 *  Parser básico del lead
 * ================================
 */
function extractFieldsFromMessage(message, lead) {
  const text = message.toLowerCase();

  // Email
  const emailMatch = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) lead.email = emailMatch[0];

  // Teléfono PR
  const phoneMatch = message.match(/(\+?1?\s?)?(787[\s.-]?\d{3}[\s.-]?\d{4})/);
  if (phoneMatch) lead.phone = phoneMatch[0];

  // Nombre simple
  if (!lead.name && /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]{3,40}$/.test(message.trim())) {
    const words = message.trim().split(" ");
    if (words.length <= 3) {
      lead.name = message.trim();
    }
  }

  // Fecha simple (15/03/2026 o 15-03-2026)
  const dateMatch = message.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/);
  if (dateMatch) {
    lead.date = dateMatch[0];
  }

  // Detección de pueblo
  const towns = [
    "san juan","caguas","carolina","trujillo alto","guaynabo","bayamon",
    "cataño","catano","toa baja","toa alta","dorado","vega baja","vega alta",
    "arecibo","manati","humacao","ponce","mayaguez","aguadilla"
  ];

  for (const t of towns) {
    if (text.includes(t)) {
      lead.town = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      break;
    }
  }

  return lead;
}


  const text = message.toLowerCase();

  const emailMatch = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) lead.email = emailMatch[0];

  const phoneMatch = message.match(/(\+?1?\s?)?(787[\s.-]?\d{3}[\s.-]?\d{4})/);
  if (phoneMatch) lead.phone = phoneMatch[0];

  const towns = [
    "san juan","caguas","carolina","trujillo alto","guaynabo","bayamon",
    "cataño","catano","toa baja","toa alta","dorado","vega baja","vega alta",
    "arecibo","manati","humacao","ponce","mayaguez","aguadilla"
  ];

  for (const t of towns) {
    if (text.includes(t)) {
      lead.town = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      break;
    }
  }

  return lead;
}

/**
 * ================================
 *  CORS
 * ================================
 */
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

/**
 * ================================
 *  POST /api/chat
 * ================================
 */
export async function POST(req) {
  try {
    let { message, lead = {} } = await req.json();

    lead = extractFieldsFromMessage(message, lead);

    const REQUIRED_FIELDS = [
      "name","date","startTime","endTime",
      "town","venueType","eventType","email","phone"
    ];

    let missing = REQUIRED_FIELDS.filter((f) => !lead?.[f]);

    if (looksLikeTimeToken(message)) {
      const t = normalizeTimeStr(message);
      if (!lead.startTime) lead.startTime = t;
      else if (!lead.endTime) lead.endTime = t;

      missing = REQUIRED_FIELDS.filter((f) => !lead?.[f]);
    }

    const { durationMinutes, extraTimeCharge } =
      computeExtraTimeCharge(lead?.startTime, lead?.endTime);

    const apiKey = process.env.OPENAI_API_KEY;

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        input: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: message },
        ],
      }),
    });

    const data = await r.json();
    const text =
      data.output_text ||
      data?.output?.[0]?.content?.map((c) => c.text).join("") ||
      "";

    // Guardar lead cuando esté completo
    if (missing.length === 0) {
      try {
        // ================================
        // CÁLCULO DE PRECIO FINAL
        // ================================
        let precioBase = 350;
        let cargoDistancia = 0;
        let cargoComplejidad = 0;

        const town = (lead.town || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        const zonaB = ["caguas"];
        if (zonaB.includes(town)) cargoDistancia = 25;

        const lugarCompleto = `${lead.town || ""} ${lead.venueType || ""}`
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        if (lugarCompleto.includes("the place") && lugarCompleto.includes("condado")) {
          precioBase = 500;
          cargoDistancia = 0;
        }

        if (lugarCompleto.includes("centro de convenciones") && lugarCompleto.includes("catano")) {
          cargoComplejidad = 100;
        }

        let precioFinal =
          precioBase +
          extraTimeCharge +
          cargoDistancia +
          cargoComplejidad;

        await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/save-lead`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nombre: lead.name,
            fecha_evento: lead.date,
            horario: `${lead.startTime} a ${lead.endTime}`,
            lugar: `${lead.town} - ${lead.venueType}`,
            tipo_evento: lead.eventType,
            email: lead.email,
            telefono: lead.phone,
            precio_cotizado: precioFinal,
            duracion_horas: durationMinutes
              ? (durationMinutes / 60).toFixed(1)
              : null,
          }),
        });

        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.EMAIL_FROM,
          to: process.env.EMAIL_TO,
          subject: `Nuevo lead – Tony’s DJ – ${lead?.name || ""}`,
          html: `<pre>${text}</pre>`,
        });

      } catch (e) {
        console.error("Error guardando lead:", e);
      }
    }

    return Response.json({ reply: text, lead, missing }, { headers: corsHeaders() });
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: "Server error", details: String(err) },
      { status: 500, headers: corsHeaders() }
    );
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": process.env.WP_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
