export const runtime = "nodejs";

const STEPS = [
  { key: "name", question: "¿Cuál es tu nombre completo?" },
  { key: "date", question: "¿Para qué fecha es el evento?" },
  { key: "startTime", question: "¿A qué hora comienza la actividad?" },
  { key: "endTime", question: "¿Y a qué hora termina?" },
  { key: "town", question: "¿En qué pueblo será el evento?" },
  { key: "venueType", question: "¿Es en casa, salón, hotel o restaurante?" },
  { key: "eventType", question: "¿Qué tipo de actividad es?" },
  { key: "email", question: "¿Cuál es tu correo electrónico?" },
  { key: "phone", question: "¿Y tu número de teléfono?" }
];

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

  const metro = [
    "san juan","guaynabo","carolina",
    "trujillo alto","bayamon","cataño"
  ];

  const town = (lead.town || "").toLowerCase();

  if (!metro.includes(town)) {
    const far = [
      "ponce","mayaguez","aguadilla","rincon",
      "cabo rojo","fajardo","humacao","yauco"
    ];

    if (far.includes(town)) {
      price += 100;
      breakdown += ` + recargo por distancia ($100)`;
    } else {
      price += 50;
      breakdown += ` + recargo por distancia ($50)`;
    }
  }

  return { price, hours, breakdown };
}

// CORS
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: corsHeaders(),
  });
}

export async function POST(req) {
  try {
    const { lead = {} } = await req.json();

    // buscar siguiente paso
    const nextStep = STEPS.find(step => !lead[step.key]);

    if (nextStep) {
      return new Response(
        JSON.stringify({ reply: nextStep.question }),
        { status: 200, headers: corsHeaders() }
      );
    }

    // todo completo → calcular
    const quote = calculateQuote(lead);

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

    return new Response(
      JSON.stringify({
        reply:
          `¡Perfecto! Aquí tienes tu cotización:\n` +
          `${quote.breakdown}\n` +
          `Total: $${quote.price}`
      }),
      { status: 200, headers: corsHeaders() }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ reply: "Error en el servidor" }),
      { status: 500, headers: corsHeaders() }
    );
  }
}
