import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateTicketRequest {
  unit_id: string;
  ticket_type: 'normal' | 'preferential';
  client_name?: string;
  client_cpf?: string;
  manual_ticket_number?: number;
  organ_id?: string;
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
    const { unit_id, ticket_type, client_name, client_cpf, manual_ticket_number } = body;

    if (!unit_id || !ticket_type) {
      return new Response(
        JSON.stringify({ error: 'unit_id e ticket_type são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Creating ticket for unit:', unit_id, 'type:', ticket_type, 'manual_number:', manual_ticket_number);

    const today = new Date().toISOString().split('T')[0];

    // Get settings for priority and manual mode
    const { data: settings } = await supabaseAdmin
      .from('settings')
      .select('normal_priority, preferential_priority, manual_mode_enabled, manual_mode_min_number, manual_mode_min_number_preferential, calling_system_active')
      .eq('unit_id', unit_id)
      .single();

    // Check if calling system is active
    const callingSystemActive = settings?.calling_system_active ?? false;
    if (!callingSystemActive) {
      return new Response(
        JSON.stringify({ error: 'Sistema de chamadas não está ativo. Contate o administrador.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const manualModeEnabled = settings?.manual_mode_enabled ?? false;
    const manualModeMinNumber = settings?.manual_mode_min_number ?? 500;
    const manualModeMinNumberPreferential = settings?.manual_mode_min_number_preferential ?? 0;

    let nextNumber: number;

    if (manualModeEnabled && manual_ticket_number !== undefined) {
      // Manual mode with explicit number from reception
      
      // Determine the minimum based on ticket type
      const effectiveMinNumber = ticket_type === 'preferential' 
        ? manualModeMinNumberPreferential 
        : manualModeMinNumber;
      
      // Validate minimum - number must be >= configured minimum
      if (manual_ticket_number < effectiveMinNumber) {
        return new Response(
          JSON.stringify({ error: `Número mínimo permitido para ${ticket_type === 'preferential' ? 'preferencial' : 'normal'} é ${effectiveMinNumber}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Check if number already exists today (same type)
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
      
      // Update or create the counter to track this number
      const { data: existingCounter } = await supabaseAdmin
        .from('ticket_counters')
        .select('*')
        .eq('unit_id', unit_id)
        .eq('ticket_type', ticket_type)
        .eq('counter_date', today)
        .maybeSingle();
      
      if (existingCounter) {
        await supabaseAdmin
          .from('ticket_counters')
          .update({ last_number: nextNumber })
          .eq('id', existingCounter.id);
      } else {
        await supabaseAdmin
          .from('ticket_counters')
          .insert({
            unit_id,
            ticket_type,
            counter_date: today,
            last_number: nextNumber,
          });
      }
    } else {
      // Automatic mode - use counter logic
      
      // Determine starting number based on mode and ticket type
      let startingNumber: number;
      if (manualModeEnabled) {
        startingNumber = ticket_type === 'preferential' 
          ? manualModeMinNumberPreferential 
          : manualModeMinNumber;
      } else {
        startingNumber = ticket_type === 'preferential' 
          ? manualModeMinNumberPreferential 
          : manualModeMinNumber;
      }

      // Get or create the counter for today
      const { data: existingCounter } = await supabaseAdmin
        .from('ticket_counters')
        .select('*')
        .eq('unit_id', unit_id)
        .eq('ticket_type', ticket_type)
        .eq('counter_date', today)
        .maybeSingle();

      if (!existingCounter) {
        nextNumber = startingNumber;
        
        const { error: createError } = await supabaseAdmin
          .from('ticket_counters')
          .insert({
            unit_id,
            ticket_type,
            counter_date: today,
            last_number: nextNumber,
          });

        if (createError) {
          console.error('Error creating counter:', createError);
          return new Response(
            JSON.stringify({ error: 'Erro ao criar contador' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        nextNumber = existingCounter.last_number + 1;
        
        const effectiveMin = ticket_type === 'preferential' 
          ? manualModeMinNumberPreferential 
          : manualModeMinNumber;
        
        if (nextNumber < effectiveMin) {
          nextNumber = effectiveMin;
        }
        
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
    }

    // Generate display code
    const prefix = ticket_type === 'preferential' ? 'P' : 'N';
    const displayCode = `${prefix}-${nextNumber.toString().padStart(3, '0')}`;

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
        client_name: client_name || null,
        client_cpf: client_cpf || null,
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

    console.log('Ticket created successfully:', displayCode, 'number:', nextNumber);

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
