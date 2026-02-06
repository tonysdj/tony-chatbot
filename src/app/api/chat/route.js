export const runtime = "nodejs";

const REQUIRED = [
  "name","date","startTime","endTime",
  "town","venueType","eventType","email","phone"
];

function missingFields(lead) {
  return REQUIRED.filter(k => !lead[k]);
}

function parseTime(t) {
  if (!t) return null;
  const m = t.toLowerCase().match(/(\d{1,2})(:(\d{2}))?\s*(am|pm)?/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[3] ? parseInt(m[3], 10) : 0;
  const ap = m[4];
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return h + min / 60;
}

function calculateQuote(lead) {
  const start = parseTime(lead.startTime);
  const end = parseTime(lead.endTime);
  if (start == null || end == null) {
    return { price: null, hours: null, breakdown: "" };
  }

  let hours = end - start;
  if (hours <= 0) hours += 24;

  let price = 350;
  let breakdown = `Servicio base DJ 5 horas: $350`;

  if (hours > 5) {
    const extra = hours - 5;
    const extraCost = extra * 50;
    price += extraCost;
    breakdown += ` + ${extra} hora(s) extra ($${extraCost})`;
  }

  return { price, hours, breakdown };
}

export async function POST(req) {
  try {
    const { message, lead = {} } = await req.json();
    const missing = missingFields(lead);

    let quote = { price: null, hours: null, breakdown: "" };

    if (missing.length === 0) {
      quote = calculateQuote(lead);

      const origin = req.nextUrl?.origin || new URL(req.url).origin;

      await fetch(`${origin}/api/save-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: lead.name,
          fecha_evento: lead.date,
          horario: `${lead.startTime} - ${lead.endTime}`,
          lugar: `${lead.town} (${lead.venueType})`,
          tipo_evento: lead.eventType,
          email: lead.email,
          telefono: lead.phone,
          precio_cotizado: quote.price,
          duracion_horas: quote.hours,
          notas_cotizacion: quote.breakdown
        }),
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          {
            role: "system",
            content: `
Eres el asistente oficial de Tony’s DJ en Puerto Rico.
Hablas en español boricua, profesional y amable.

Reglas:
- Haz solo una pregunta a la vez.
- Nunca repitas preguntas.
- Solo pregunta por el próximo dato faltante.
- No hables de precios hasta tener toda la información.
`
          },
          {
            role: "user",
            content: `Estado del lead:\n${JSON.stringify({ lead, missing }, null, 2)}`
          },
          { role: "user", content: message }
        ],
      }),
    });

    const data = await response.json();
    const reply =
      data.output?.[0]?.content?.[0]?.text ||
      "Perfecto. Continuamos con la información.";

    if (missing.length === 0 && quote.price) {
      return new Response(
        JSON.stringify({
          reply:
            `¡Perfecto! Aquí tienes tu cotización:\n` +
            `${quote.breakdown}\n` +
            `Total: $${quote.price}`,
        }),
        { status: 200 }
      );
    }

    return new Response(JSON.stringify({ reply }), { status: 200 });

  } catch (err) {
    return new Response(
      JSON.stringify({ reply: "Error en el servidor" }),
      { status: 500 }
    );
  }
}
