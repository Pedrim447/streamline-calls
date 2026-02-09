import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BatchCreateRequest {
  unit_id: string;
  organ_id: string;
  ticket_type: 'normal' | 'preferential';
  start_number: number;
  end_number: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller is admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check admin role
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: 'Acesso restrito a administradores' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: BatchCreateRequest = await req.json();
    const { unit_id, organ_id, ticket_type, start_number, end_number } = body;

    if (!unit_id || !organ_id || !ticket_type || start_number == null || end_number == null) {
      return new Response(
        JSON.stringify({ error: 'Todos os campos são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (start_number > end_number) {
      return new Response(
        JSON.stringify({ error: 'Número inicial deve ser menor ou igual ao final' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (end_number - start_number + 1 > 500) {
      return new Response(
        JSON.stringify({ error: 'Máximo de 500 senhas por lote' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const today = new Date().toISOString().split('T')[0];
    const prefix = ticket_type === 'preferential' ? 'P' : 'N';

    // Fetch settings for priority
    const { data: settings } = await supabaseAdmin
      .from('settings')
      .select('normal_priority, preferential_priority')
      .eq('unit_id', unit_id)
      .single();

    const priority = ticket_type === 'preferential'
      ? (settings?.preferential_priority || 10)
      : (settings?.normal_priority || 5);

    // Check for existing tickets in range to avoid duplicates
    const { data: existingTickets } = await supabaseAdmin
      .from('tickets')
      .select('ticket_number')
      .eq('unit_id', unit_id)
      .eq('organ_id', organ_id)
      .eq('ticket_type', ticket_type)
      .gte('ticket_number', start_number)
      .lte('ticket_number', end_number)
      .gte('created_at', `${today}T00:00:00`);

    const existingNumbers = new Set((existingTickets || []).map(t => t.ticket_number));

    // Build tickets to insert (skip duplicates)
    const tickets = [];
    for (let num = start_number; num <= end_number; num++) {
      if (existingNumbers.has(num)) continue;
      tickets.push({
        unit_id,
        organ_id,
        ticket_type,
        ticket_number: num,
        display_code: `${prefix}-${num.toString().padStart(3, '0')}`,
        priority,
        status: 'waiting',
        client_name: null,
      });
    }

    if (tickets.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Todas as senhas nesse intervalo já existem hoje' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert tickets in batches of 100
    let insertedCount = 0;
    for (let i = 0; i < tickets.length; i += 100) {
      const batch = tickets.slice(i, i + 100);
      const { error: insertError } = await supabaseAdmin
        .from('tickets')
        .insert(batch);

      if (insertError) {
        console.error('Batch insert error:', insertError);
        return new Response(
          JSON.stringify({ error: `Erro ao inserir lote: ${insertError.message}`, inserted: insertedCount }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      insertedCount += batch.length;
    }

    // Update ticket_counters so reception continues from end_number
    const { data: existingCounter } = await supabaseAdmin
      .from('ticket_counters')
      .select('id, last_number')
      .eq('unit_id', unit_id)
      .eq('organ_id', organ_id)
      .eq('ticket_type', ticket_type)
      .eq('counter_date', today)
      .maybeSingle();

    if (existingCounter) {
      // Only update if the end_number is greater than current counter
      if (end_number > existingCounter.last_number) {
        await supabaseAdmin
          .from('ticket_counters')
          .update({ last_number: end_number })
          .eq('id', existingCounter.id);
      }
    } else {
      await supabaseAdmin
        .from('ticket_counters')
        .insert({
          unit_id,
          organ_id,
          ticket_type,
          counter_date: today,
          last_number: end_number,
        });
    }

    return new Response(
      JSON.stringify({
        success: true,
        inserted: insertedCount,
        skipped: (end_number - start_number + 1) - insertedCount,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
