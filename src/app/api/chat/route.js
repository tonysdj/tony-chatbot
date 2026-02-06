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
- Usa ejemplos cuando ayuden al cliente.

PREGUNTA SOBRE LUGAR:
“¿En qué pueblo será el evento y qué tipo de lugar es?
Por ejemplo: casa, salón de actividades, negocio, restaurante, hotel, centro comunal, terraza, etc.”

PREGUNTA SOBRE ACTIVIDAD:
“¿Qué tipo de actividad será?
Por ejemplo: cumpleaños, boda, quinceañero, evento corporativo, bautizo, aniversario, actividad familiar, etc.”

UBICACIÓN:
- Base: San Juan (Río Piedras).

PRECIO BASE:
- $350 por 5 horas en área metropolitana.

HORAS ADICIONALES:
- $25 cada 30 minutos adicionales.
- Fracciones se redondean hacia arriba.

ZONAS:
ZONA A: San Juan, Río Piedras, Santurce, Hato Rey, Cupey, Carolina,
Trujillo Alto, Guaynabo, Bayamón, Cataño, Toa Baja, Dorado.

ZONA B (+$25): Caguas, Gurabo, Canóvanas, Loíza, Río Grande, Toa Alta,
Vega Baja, Vega Alta, Naranjito.

ZONA C (+$100): Arecibo, Barceloneta, Manatí, Humacao, Juncos,
San Lorenzo, Fajardo, Guayama.

ZONA D (+$150): Ponce, Mayagüez, Aguadilla, Cabo Rojo,
Isabela, Hatillo, Jayuya, Utuado, Yauco.

REGLAS ESPECIALES:
- THE PLACE – CONDADO → Tarifa fija $500 (incluye 5 horas)
- CENTRO DE CONVENCIONES – CATAÑO → +$100 por complejidad

SALIDA FINAL OBLIGATORIA (FORMATO FIJO):
- Mostrar SOLO los cargos que apliquen.

Precio base (incluye 5 horas de servicio): $XXX
Tiempo adicional: $XXX
Cargo por distancia: $XXX
Cargo por complejidad: $XXX
Total: $XXX

Tony se comunicará contigo para confirmar disponibilidad.
`;

/**
 * ================================
 *  Helpers de tiempo (backend)
 * ================================
 */
function normalizeTimeStr(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

// Detecta si el mensaje es una hora “sueltita” (6pm, 1am, 18:00, 6:30pm)
function looksLikeTimeToken(msg) {
  const s = normalizeTimeStr(msg);
  if (!s) return false;
  return (
    /^(\d{1,2})(am|pm)$/.test(s) ||
    /^(\d{1,2}):(\d{2})(am|pm)$/.test(s) ||
    /^(\d{1,2}):(\d{2})$/.test(s)
  );
}

// Convierte "6pm", "6:30pm", "18:00" a minutos desde 00:00
function parseTimeToMinutes(raw) {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");

  // 24h: 18:00 / 18:30
  let m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) return hh * 60 + mm;
  }

  // am/pm: 6pm, 6:30pm
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

// Duración en minutos (soporta cruce de medianoche)
function computeDurationMinutes(startRaw, endRaw) {
  const start = parseTimeToMinutes(startRaw);
  const end = parseTimeToMinutes(endRaw);
  if (start == null || end == null) return null;

  let diff = end - start;
  if (diff < 0) diff += 24 * 60;
  return diff;
}

// Cargo por tiempo adicional: base 300 min, +$25 por cada 30 min (redondeo arriba)
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
 *  PARSER BACKEND (ANTI-LOOP)
 * ================================
 */
function extractFieldsFromMessage(message, lead) {
  const text = message.toLowerCase();

  // Email
  if (!lead.email) {
    const m = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (m) lead.email = m[0];
  }

  // Teléfono PR
  if (!lead.phone) {
    const m = message.match(/(\+?1?\s?)?(787[\s.-]?\d{3}[\s.-]?\d{4})/);
    if (m) lead.phone = m[0];
  }

  // Horario en un solo mensaje: "6pm a 1am" / "6:30pm hasta 11pm" / "18:00-23:00"
  if (!lead.startTime || !lead.endTime) {
    const m = message.match(
      /(\d{1,2}(?::\d{2})?\s?(?:am|pm)|\d{1,2}:\d{2})\s*(?:-|a|hasta)\s*(\d{1,2}(?::\d{2})?\s?(?:am|pm)|\d{1,2}:\d{2})/i
    );
    if (m) {
      lead.startTime = lead.startTime || m[1].replace(/\s+/g, "");
      lead.endTime = lead.endTime || m[2].replace(/\s+/g, "");
    }
  }

  // Horas por separado: "empieza..." / "termina..."
  if (!lead.startTime) {
    const m = message.match(
      /(empieza|comienza|inicio)\s*(?:a\s*las?\s*)?(\d{1,2}(?::\d{2})?\s?(?:am|pm)|\d{1,2}:\d{2})/i
    );
    if (m) lead.startTime = m[2].replace(/\s+/g, "");
  }

  if (!lead.endTime) {
    const m = message.match(
      /(termina|finaliza|se\s*acaba|fin)\s*(?:a\s*las?\s*)?(\d{1,2}(?::\d{2})?\s?(?:am|pm)|\d{1,2}:\d{2})/i
    );
    if (m) lead.endTime = m[2].replace(/\s+/g, "");
  }

  // Tipo de actividad (básico)
  if (!lead.eventType) {
    const keywords = [
      "cumple",
      "cumpleaños",
      "boda",
      "quince",
      "quinceañero",
      "corporativo",
      "bautizo",
      "aniversario",
    ];
    if (keywords.some((k) => text.includes(k))) lead.eventType = message;
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
    let { message, lead = {}, sendEmail = false } = await req.json();

    if (!message) {
      return Response.json(
        { error: "Missing message" },
        { status: 400, headers: corsHeaders() }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "OPENAI_API_KEY missing" },
        { status: 500, headers: corsHeaders() }
      );
    }

    // ✅ Actualiza lead con lo último que dijo el usuario
    lead = extractFieldsFromMessage(message, lead);

    const REQUIRED_FIELDS = [
      "name",
      "date",
      "startTime",
      "endTime",
      "town",
      "venueType",
      "eventType",
      "email",
      "phone",
    ];

    // ✅ Missing recalculado en backend
    let missing = REQUIRED_FIELDS.filter((f) => !lead?.[f]);

    /**
     * ✅ FIX CLAVE:
     * Si el usuario responde con una hora suelta (6pm / 1am / 18:00 / 6:30pm),
     * guárdala automáticamente en el campo de horario que falte.
     */
    if (looksLikeTimeToken(message)) {
      const t = normalizeTimeStr(message);

      // si faltan ambas, primero llenamos startTime
      if (!lead.startTime) {
        lead.startTime = t;
      } else if (!lead.endTime) {
        lead.endTime = t;
      }

      // recalcula missing después de asignar
      missing = REQUIRED_FIELDS.filter((f) => !lead?.[f]);
    }

    // ✅ Cálculo determinístico de tiempo adicional (backend)
    const { durationMinutes, extraTimeCharge } = computeExtraTimeCharge(
      lead?.startTime,
      lead?.endTime
    );

    const SYSTEM_PROMPT_DYNAMIC = `
ESTADO ACTUAL DEL LEAD:
${REQUIRED_FIELDS.map((f) => `${f}: ${lead?.[f] || "❌"}`).join("\n")}

DATOS FALTANTES:
${missing.length ? missing.join(", ") : "NINGUNO"}

TIEMPO (USAR ESTO, NO INVENTAR):
- startTime: ${lead?.startTime || "❌"}
- endTime: ${lead?.endTime || "❌"}
- durationMinutes: ${durationMinutes == null ? "❌" : durationMinutes}
- extraTimeCharge: $${extraTimeCharge}

REGLAS ANTI-REPETICIÓN / CIERRE:
- Si hay datos faltantes, pregunta SOLO el PRIMERO de la lista.
- PROHIBIDO repetir preguntas ya contestadas.
- Si NO falta ninguno:
  - CIERRA
  - COTIZA
  - Si extraTimeCharge > 0, DEBES mostrar la línea: "Tiempo adicional: $${extraTimeCharge}"
  - Usa EXACTAMENTE el formato final obligatorio del prompt (mismo orden y texto).
`;

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        input: [
          { role: "system", content: SYSTEM_PROMPT + "\n" + SYSTEM_PROMPT_DYNAMIC },
          { role: "user", content: message },
        ],
        max_output_tokens: 240,
        truncation: "auto",
      }),
    });

    const data = await r.json();

    if (!r.ok) {
      console.error("OpenAI error:", data);
      return Response.json(
        { error: "OpenAI error", details: data },
        { status: r.status, headers: corsHeaders() }
      );
    }

    const text =
      data.output_text ||
      data?.output?.[0]?.content?.map((c) => c.text).join("") ||
      "";

    // 📧 Email solo cuando lead está completo
    if (sendEmail && missing.length === 0) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);

        await resend.emails.send({
          from: process.env.EMAIL_FROM,
          to: process.env.EMAIL_TO,
          subject: `Nuevo lead – Tony’s DJ – ${lead?.name || ""}`,
          html: `<pre style="font-family:ui-monospace, SFMono-Regular, Menlo, monospace; white-space:pre-wrap">${text}</pre>`,
        });
      } catch (err) {
        console.error("Email error:", err);
      }
    }

// 💾 Guardar lead en Supabase cuando esté completo
if (missing.length === 0) {
  try {
    // Calcular precio final
    let precioFinal = 350 + extraTimeCharge;

    // Cargo por distancia
    const town = (lead.town || "").toLowerCase();

    const zonaB = ["caguas","gurabo","canóvanas","loíza","río grande","toa alta","vega baja","vega alta","naranjito"];
    const zonaC = ["arecibo","barceloneta","manatí","humacao","juncos","san lorenzo","fajardo","guayama"];
    const zonaD = ["ponce","mayagüez","aguadilla","cabo rojo","isabela","hatillo","jayuya","utuado","yauco"];

    if (zonaB.includes(town)) precioFinal += 25;
    if (zonaC.includes(town)) precioFinal += 100;
    if (zonaD.includes(town)) precioFinal += 150;

    // Reglas especiales
    const lugarCompleto = `${lead.town || ""} ${lead.venueType || ""}`.toLowerCase();

    if (lugarCompleto.includes("the place") && lugarCompleto.includes("condado")) {
      precioFinal = 500;
    }

    if (lugarCompleto.includes("centro de convenciones") && lugarCompleto.includes("cataño")) {
      precioFinal += 100;
    }

    await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/save-lead`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
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
        notas_cotizacion: "Cotización generada automáticamente por el chatbot"
      })
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



/**
 * ================================
 *  HEADERS
 * ================================
 */
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": process.env.WP_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
