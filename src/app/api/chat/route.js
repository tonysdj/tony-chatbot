import { Resend } from "resend";

export const runtime = "nodejs";

const resend = new Resend(process.env.RESEND_API_KEY);

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

  const town = (lead.town || "").toLowerCase();

const metro = [
  "san juan","guaynabo","carolina",
  "trujillo alto","bayamon","cataño"
];

const dist1 = [
  "toa baja","toa alta","dorado",
  "vega alta","vega baja",
  "naranjito","aguas buenas","loiza"
];

const dist2 = [
  "arecibo","manati","ciales",
  "morovis","barranquitas","orocovis",
  "caguas","cayey","san lorenzo","gurabo"
];

const dist3 = [
  "ponce","juana diaz","villalba",
  "coamo","santa isabel","salinas",
  "yabucoa","maunabo"
];

const dist4 = [
  "guayama","arroyo","patillas",
  "adjuntas","lares","utuado"
];

const dist5 = [
  "mayaguez","aguadilla","rincon",
  "cabo rojo","san german",
  "hormigueros","lajas",
  "isabela","aguada"
];

const manualQuote = ["vieques","culebra"];

if (manualQuote.includes(town)) {
  return {
    price: null,
    hours,
    breakdown: "Este destino requiere cotización manual. Te estaremos contactando."
  };
}

let distanceFee = 0;

if (metro.includes(town)) {
  distanceFee = 0;
} else if (dist1.includes(town)) {
  distanceFee = 25;
} else if (dist2.includes(town)) {
  distanceFee = 50;
} else if (dist3.includes(town)) {
  distanceFee = 75;
} else if (dist4.includes(town)) {
  distanceFee = 100;
} else if (dist5.includes(town)) {
  distanceFee = 200;
} else {
  distanceFee = 50;
}

if (distanceFee > 0) {
  price += distanceFee;
  breakdown += ` + recargo por distancia ($${distanceFee})`;
}


  return { price, hours, breakdown };
}

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

    const nextStep = STEPS.find(step => !lead[step.key]);

    if (nextStep) {
      return new Response(
        JSON.stringify({ reply: nextStep.question }),
        { status: 200, headers: corsHeaders() }
      );
    }

    const quote = calculateQuote(lead);

    const origin = req.nextUrl?.origin || new URL(req.url).origin;

    // Guardar en Supabase
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

    // Enviar email
    await resend.emails.send({
      from: "Tony’s DJ <onboarding@resend.dev>",
      to: [lead.email],
      subject: "Tu cotización de Tony’s DJ",
      html: `
        <h2>¡Gracias por tu interés en Tony’s DJ!</h2>
        <p><strong>Fecha:</strong> ${lead.date}</p>
        <p><strong>Horario:</strong> ${lead.startTime} - ${lead.endTime}</p>
        <p><strong>Lugar:</strong> ${lead.town} (${lead.venueType})</p>
        <p><strong>Actividad:</strong> ${lead.eventType}</p>
        <hr>
        <p>${quote.breakdown}</p>
        <h3>Total: $${quote.price}</h3>
        <p>Para reservar tu fecha, contáctanos al 787-463-5655.</p>
      `
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
