import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateTicketRequest {
  unit_id: string;
  ticket_type: 'normal' | 'preferential';
  client_name?: string;
  manual_ticket_number?: number;
  organ_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body: CreateTicketRequest = await req.json();
    const { unit_id, ticket_type, client_name, manual_ticket_number, organ_id } = body;

    if (!unit_id || !ticket_type) {
      return new Response(
        JSON.stringify({ error: 'unit_id e ticket_type são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const today = new Date().toISOString().split('T')[0];

    // Parallel fetch: settings and counter
    const [settingsResult, counterResult] = await Promise.all([
      supabaseAdmin
        .from('settings')
        .select('normal_priority, preferential_priority, manual_mode_enabled, manual_mode_min_number, manual_mode_min_number_preferential, calling_system_active')
        .eq('unit_id', unit_id)
        .single(),
      supabaseAdmin
        .from('ticket_counters')
        .select('id, last_number')
        .eq('unit_id', unit_id)
        .eq('ticket_type', ticket_type)
        .eq('counter_date', today)
        .maybeSingle()
    ]);

    const settings = settingsResult.data;

    // Check if calling system is active
    if (!(settings?.calling_system_active ?? false)) {
      return new Response(
        JSON.stringify({ error: 'Sistema de chamadas não está ativo. Contate o administrador.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const manualModeEnabled = settings?.manual_mode_enabled ?? false;
    const minNumber = ticket_type === 'preferential' 
      ? (settings?.manual_mode_min_number_preferential ?? 0)
      : (settings?.manual_mode_min_number ?? 500);

    let nextNumber: number;
    const existingCounter = counterResult.data;

    if (manualModeEnabled && manual_ticket_number !== undefined) {
      // Manual mode validation
      if (manual_ticket_number < minNumber) {
        return new Response(
          JSON.stringify({ error: `Número mínimo permitido para ${ticket_type === 'preferential' ? 'preferencial' : 'normal'} é ${minNumber}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Check duplicate in parallel with nothing - we need this check
      const { data: existingTicket } = await supabaseAdmin
        .from('tickets')
        .select('id')
        .eq('unit_id', unit_id)
        .eq('ticket_number', manual_ticket_number)
        .eq('ticket_type', ticket_type)
        .gte('created_at', `${today}T00:00:00`)
        .maybeSingle();
      
      if (existingTicket) {
        return new Response(
          JSON.stringify({ error: `Senha ${ticket_type === 'preferential' ? 'P' : 'N'}-${manual_ticket_number} já foi gerada hoje` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      nextNumber = manual_ticket_number;
    } else {
      // Automatic mode
      nextNumber = existingCounter 
        ? Math.max(existingCounter.last_number + 1, minNumber)
        : minNumber;
    }

    // Generate display code
    const prefix = ticket_type === 'preferential' ? 'P' : 'N';
    const displayCode = `${prefix}-${nextNumber.toString().padStart(3, '0')}`;
    const priority = ticket_type === 'preferential' 
      ? (settings?.preferential_priority || 10)
      : (settings?.normal_priority || 5);

    // Upsert counter and create ticket in parallel
    const counterPromise = existingCounter
      ? supabaseAdmin
          .from('ticket_counters')
          .update({ last_number: nextNumber })
          .eq('id', existingCounter.id)
      : supabaseAdmin
          .from('ticket_counters')
          .insert({
            unit_id,
            ticket_type,
            counter_date: today,
            last_number: nextNumber,
          });

    const ticketPromise = supabaseAdmin
      .from('tickets')
      .insert({
        unit_id,
        ticket_type,
        ticket_number: nextNumber,
        display_code: displayCode,
        priority,
        status: 'waiting',
        client_name: client_name || null,
        organ_id: organ_id || null,
      })
      .select()
      .single();

    const [, ticketResult] = await Promise.all([counterPromise, ticketPromise]);

    if (ticketResult.error) {
      console.error('Error creating ticket:', ticketResult.error);
      return new Response(
        JSON.stringify({ error: 'Erro ao criar senha' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, ticket: ticketResult.data }),
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
