import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const jsonResponse = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Auth validation
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Não autorizado' }, 401);
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: authError } = await supabaseAuth.auth.getClaims(token);

    if (authError || !claimsData?.claims) {
      return jsonResponse({ error: 'Token inválido' }, 401);
    }

    const userId = claimsData.claims.sub as string;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { action, unit_id, counter_id, ticket_id, skip_reason, organ_ids, ticket_type } = await req.json();

    // === CALL NEXT (atomic via DB function) ===
    if (action === 'call_next') {
      if (!unit_id || !counter_id) {
        return jsonResponse({ error: 'unit_id e counter_id são obrigatórios' }, 400);
      }

      const { data, error } = await supabaseAdmin.rpc('claim_next_ticket', {
        _unit_id: unit_id,
        _counter_id: counter_id,
        _attendant_id: userId,
        _organ_ids: organ_ids?.length > 0 ? organ_ids : null,
        _ticket_type: ticket_type || null,
      });

      if (error) {
        console.error('Error claiming ticket:', error);
        return jsonResponse({ error: 'Erro ao buscar próxima senha' }, 500);
      }

      if (!data.success) {
        return jsonResponse({
          error: 'Não há senhas na fila para chamar.',
          no_tickets: true,
          queue_empty: true,
        });
      }

      return jsonResponse({ success: true, ticket: data.ticket });
    }

    // === REPEAT ===
    if (action === 'repeat') {
      if (!ticket_id) {
        return jsonResponse({ error: 'ticket_id é obrigatório' }, 400);
      }

      const { data: updatedTicket, error } = await supabaseAdmin
        .from('tickets')
        .update({ called_at: new Date().toISOString() })
        .eq('id', ticket_id)
        .select('id, display_code')
        .single();

      if (error) {
        console.error('Error repeating call:', error);
      }

      return jsonResponse({ success: true, ticket: updatedTicket, is_repeat: true });
    }

    // === SKIP ===
    if (action === 'skip') {
      if (!ticket_id) {
        return jsonResponse({ error: 'ticket_id é obrigatório' }, 400);
      }

      if (!skip_reason || skip_reason.trim().length < 3) {
        return jsonResponse({ error: 'Motivo para pular é obrigatório (mínimo 3 caracteres)' }, 400);
      }

      const { data: skippedTicket, error } = await supabaseAdmin
        .from('tickets')
        .update({
          status: 'skipped',
          skip_reason,
          locked_by: null,
          locked_at: null,
        })
        .eq('id', ticket_id)
        .select('id, display_code')
        .single();

      if (error) {
        console.error('Error skipping ticket:', error);
        return jsonResponse({ error: 'Erro ao pular senha' }, 500);
      }

      return jsonResponse({ success: true, ticket: skippedTicket });
    }

    return jsonResponse({ error: 'Ação inválida' }, 400);
  } catch (error) {
    console.error('Unexpected error:', error);
    return jsonResponse({ error: 'Erro interno do servidor' }, 500);
  }
});
