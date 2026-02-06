import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export async function POST(req) {
  try {
    const lead = await req.json();

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
