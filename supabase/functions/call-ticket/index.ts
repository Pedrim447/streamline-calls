import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CallTicketRequest {
  action: 'call_next' | 'repeat' | 'skip';
  unit_id?: string;
  counter_id?: string;
  ticket_id?: string;
  skip_reason?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with service role for admin operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify the user's token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User authenticated:', user.id);

    const body: CallTicketRequest = await req.json();
    const { action, unit_id, counter_id, ticket_id, skip_reason } = body;

    console.log('Action:', action, 'Unit:', unit_id, 'Counter:', counter_id, 'Ticket:', ticket_id);

    if (action === 'call_next') {
      if (!unit_id || !counter_id) {
        return new Response(
          JSON.stringify({ error: 'unit_id e counter_id são obrigatórios' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Find the next waiting ticket with highest priority
      const { data: nextTicket, error: findError } = await supabaseAdmin
        .from('tickets')
        .select('*')
        .eq('unit_id', unit_id)
        .eq('status', 'waiting')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      let ticketToCall = nextTicket;

      // If no ticket in queue, create one automatically (Normal type by default)
      if (findError || !nextTicket) {
        console.log('No tickets in queue, creating new one automatically');
        
        const today = new Date().toISOString().split('T')[0];
        const ticket_type = 'normal';
        const startingNumber = 500; // Normal starts at 500

        // Get or create the counter for today
        const { data: existingCounter } = await supabaseAdmin
          .from('ticket_counters')
          .select('*')
          .eq('unit_id', unit_id)
          .eq('ticket_type', ticket_type)
          .eq('counter_date', today)
          .single();

        let nextNumber: number;

        if (!existingCounter) {
          // Create new counter for today
          nextNumber = startingNumber;
          await supabaseAdmin
            .from('ticket_counters')
            .insert({
              unit_id,
              ticket_type,
              counter_date: today,
              last_number: nextNumber,
            });
        } else {
          // Increment the counter
          nextNumber = existingCounter.last_number + 1;
          await supabaseAdmin
            .from('ticket_counters')
            .update({ last_number: nextNumber })
            .eq('id', existingCounter.id);
        }

        // Generate display code
        const displayCode = `N-${nextNumber.toString().padStart(3, '0')}`;

        // Get settings for priority
        const { data: settings } = await supabaseAdmin
          .from('settings')
          .select('normal_priority')
          .eq('unit_id', unit_id)
          .single();

        const priority = settings?.normal_priority || 5;

        // Create the ticket directly as 'called'
        const { data: newTicket, error: createError } = await supabaseAdmin
          .from('tickets')
          .insert({
            unit_id,
            ticket_type,
            ticket_number: nextNumber,
            display_code: displayCode,
            priority,
            status: 'called',
            called_at: new Date().toISOString(),
            counter_id: counter_id,
            attendant_id: user.id,
            locked_by: user.id,
            locked_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (createError || !newTicket) {
          console.error('Error creating ticket:', createError);
          return new Response(
            JSON.stringify({ error: 'Erro ao criar senha' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('Ticket created and called:', newTicket.display_code);

        // Log the action
        await supabaseAdmin.from('audit_logs').insert({
          action: 'ticket_called',
          entity_type: 'ticket',
          entity_id: newTicket.id,
          user_id: user.id,
          unit_id: unit_id,
          details: { counter_id, display_code: newTicket.display_code, auto_created: true },
        });

        return new Response(
          JSON.stringify({ success: true, ticket: newTicket }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Found next ticket:', ticketToCall.display_code);

      // Try to lock and update the ticket atomically
      const { data: updatedTicket, error: updateError } = await supabaseAdmin
        .from('tickets')
        .update({
          status: 'called',
          called_at: new Date().toISOString(),
          counter_id: counter_id,
          attendant_id: user.id,
          locked_by: user.id,
          locked_at: new Date().toISOString(),
        })
        .eq('id', ticketToCall.id)
        .eq('status', 'waiting') // Ensure it's still waiting (optimistic lock)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating ticket:', updateError);
        // If update failed, another attendant probably got it
        return new Response(
          JSON.stringify({ error: 'Senha já foi chamada por outro atendente' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Ticket called successfully:', updatedTicket.display_code);

      // Log the action
      await supabaseAdmin.from('audit_logs').insert({
        action: 'ticket_called',
        entity_type: 'ticket',
        entity_id: updatedTicket.id,
        user_id: user.id,
        unit_id: unit_id,
        details: { counter_id, display_code: updatedTicket.display_code },
      });

      return new Response(
        JSON.stringify({ success: true, ticket: updatedTicket }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'repeat') {
      if (!ticket_id) {
        return new Response(
          JSON.stringify({ error: 'ticket_id é obrigatório' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get the ticket
      const { data: ticket, error: ticketError } = await supabaseAdmin
        .from('tickets')
        .select('*')
        .eq('id', ticket_id)
        .single();

      if (ticketError || !ticket) {
        return new Response(
          JSON.stringify({ error: 'Senha não encontrada' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Repeating call for ticket:', ticket.display_code);

      // Log the repeat action
      await supabaseAdmin.from('audit_logs').insert({
        action: 'ticket_repeat_call',
        entity_type: 'ticket',
        entity_id: ticket.id,
        user_id: user.id,
        unit_id: ticket.unit_id,
        details: { counter_id: ticket.counter_id, display_code: ticket.display_code },
      });

      return new Response(
        JSON.stringify({ success: true, ticket }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'skip') {
      if (!ticket_id) {
        return new Response(
          JSON.stringify({ error: 'ticket_id é obrigatório' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!skip_reason || skip_reason.trim().length < 3) {
        return new Response(
          JSON.stringify({ error: 'Motivo para pular é obrigatório (mínimo 3 caracteres)' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update ticket to skipped
      const { data: skippedTicket, error: skipError } = await supabaseAdmin
        .from('tickets')
        .update({
          status: 'skipped',
          skip_reason: skip_reason,
          locked_by: null,
          locked_at: null,
        })
        .eq('id', ticket_id)
        .select()
        .single();

      if (skipError) {
        console.error('Error skipping ticket:', skipError);
        return new Response(
          JSON.stringify({ error: 'Erro ao pular senha' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Ticket skipped:', skippedTicket.display_code);

      // Log the action
      await supabaseAdmin.from('audit_logs').insert({
        action: 'ticket_skipped',
        entity_type: 'ticket',
        entity_id: skippedTicket.id,
        user_id: user.id,
        unit_id: skippedTicket.unit_id,
        details: { skip_reason, display_code: skippedTicket.display_code },
      });

      return new Response(
        JSON.stringify({ success: true, ticket: skippedTicket }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Ação inválida' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
