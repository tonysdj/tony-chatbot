import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    const body = await req.json();

    const lead = {
      nombre: body.nombre,
      fecha_evento: body.fecha_evento,
      horario: body.horario,
      lugar: body.lugar,
      tipo_evento: body.tipo_evento,
      email: body.email,
      telefono: body.telefono,
      precio_cotizado: body.precio_cotizado,
      duracion_horas: body.duracion_horas,
      notas_cotizacion: body.notas_cotizacion
    };

    const { error } = await supabase
      .from('leads')
      .insert([lead]);

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500 }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200 }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Error interno' }),
      { status: 500 }
    );
  }
}
