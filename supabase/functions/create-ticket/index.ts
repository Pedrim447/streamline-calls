import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateTicketRequest {
  unit_id: string;
  ticket_type: 'normal' | 'preferential';
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body: CreateTicketRequest = await req.json();
    const { unit_id, ticket_type } = body;

    if (!unit_id || !ticket_type) {
      return new Response(
        JSON.stringify({ error: 'unit_id e ticket_type são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Creating ticket for unit:', unit_id, 'type:', ticket_type);

    const today = new Date().toISOString().split('T')[0];

    // Get or create the counter for today
    const { data: existingCounter, error: counterFetchError } = await supabaseAdmin
      .from('ticket_counters')
      .select('*')
      .eq('unit_id', unit_id)
      .eq('ticket_type', ticket_type)
      .eq('counter_date', today)
      .single();

    let nextNumber: number;

    if (!existingCounter) {
      // Create new counter for today
      const { data: newCounter, error: createError } = await supabaseAdmin
        .from('ticket_counters')
        .insert({
          unit_id,
          ticket_type,
          counter_date: today,
          last_number: 1,
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating counter:', createError);
        return new Response(
          JSON.stringify({ error: 'Erro ao criar contador' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      nextNumber = 1;
    } else {
      // Increment the counter
      nextNumber = existingCounter.last_number + 1;
      
      const { error: updateError } = await supabaseAdmin
        .from('ticket_counters')
        .update({ last_number: nextNumber })
        .eq('id', existingCounter.id);

      if (updateError) {
        console.error('Error updating counter:', updateError);
        return new Response(
          JSON.stringify({ error: 'Erro ao atualizar contador' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Generate display code
    const prefix = ticket_type === 'preferential' ? 'P' : 'N';
    const displayCode = `${prefix}-${nextNumber.toString().padStart(3, '0')}`;

    // Get settings for priority
    const { data: settings } = await supabaseAdmin
      .from('settings')
      .select('normal_priority, preferential_priority')
      .eq('unit_id', unit_id)
      .single();

    const priority = ticket_type === 'preferential' 
      ? (settings?.preferential_priority || 10)
      : (settings?.normal_priority || 5);

    // Create the ticket
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('tickets')
      .insert({
        unit_id,
        ticket_type,
        ticket_number: nextNumber,
        display_code: displayCode,
        priority,
        status: 'waiting',
      })
      .select()
      .single();

    if (ticketError) {
      console.error('Error creating ticket:', ticketError);
      return new Response(
        JSON.stringify({ error: 'Erro ao criar senha' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Ticket created successfully:', displayCode);

    return new Response(
      JSON.stringify({ success: true, ticket }),
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
