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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's token for auth validation
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    // Verify the user's token using getClaims
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: authError } = await supabaseAuth.auth.getClaims(token);
    
    if (authError || !claimsData?.claims) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub as string;
    console.log('User authenticated:', userId);
    
    // Create client with service role for admin operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

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

      // If no ticket in queue, return message to attendant
      if (findError || !nextTicket) {
        console.log('No tickets in queue');
        return new Response(
          JSON.stringify({ 
            error: 'Não há senhas na fila para chamar. Aguarde a recepção entregar novas senhas.',
            no_tickets: true,
            queue_empty: true
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const ticketToCall = nextTicket;

      console.log('Found next ticket:', ticketToCall.display_code);

      // Try to lock and update the ticket atomically
      const { data: updatedTicket, error: updateError } = await supabaseAdmin
        .from('tickets')
        .update({
          status: 'called',
          called_at: new Date().toISOString(),
          counter_id: counter_id,
          attendant_id: userId,
          locked_by: userId,
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

      // Get the ticket with counter info
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

      // Update called_at to trigger realtime update for panel
      const { data: updatedTicket, error: updateError } = await supabaseAdmin
        .from('tickets')
        .update({
          called_at: new Date().toISOString(),
        })
        .eq('id', ticket_id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating ticket for repeat:', updateError);
      }

      return new Response(
        JSON.stringify({ success: true, ticket: updatedTicket || ticket, is_repeat: true }),
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
        user_id: userId,
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
