import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ManualCallRequest {
  unit_id: string;
  ticket_number: number;
  ticket_type: 'normal' | 'preferential';
  counter_id: string;
  attendant_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body: ManualCallRequest = await req.json();
    const { unit_id, ticket_number, ticket_type, counter_id, attendant_id } = body;

    if (!unit_id || !ticket_number || !ticket_type || !counter_id || !attendant_id) {
      return new Response(
        JSON.stringify({ error: 'Todos os campos são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Manual call request:', { unit_id, ticket_number, ticket_type, counter_id, attendant_id });

    // Get settings to check manual mode and min number
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('settings')
      .select('manual_mode_enabled, manual_mode_min_number')
      .eq('unit_id', unit_id)
      .single();

    if (settingsError || !settings) {
      console.error('Error fetching settings:', settingsError);
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar configurações' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!settings.manual_mode_enabled) {
      return new Response(
        JSON.stringify({ error: 'Modo manual não está habilitado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const minNumber = settings.manual_mode_min_number ?? 500;
    if (ticket_number < minNumber) {
      return new Response(
        JSON.stringify({ error: `Número mínimo permitido é ${minNumber}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if ticket already exists today
    const today = new Date().toISOString().split('T')[0];
    const { data: existingTicket } = await supabaseAdmin
      .from('tickets')
      .select('id')
      .eq('unit_id', unit_id)
      .eq('ticket_number', ticket_number)
      .eq('ticket_type', ticket_type)
      .gte('created_at', today)
      .lt('created_at', new Date(new Date(today).getTime() + 86400000).toISOString().split('T')[0])
      .maybeSingle();

    if (existingTicket) {
      return new Response(
        JSON.stringify({ error: 'Esta senha já foi chamada hoje' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate display code
    const prefix = ticket_type === 'preferential' ? 'P' : 'N';
    const displayCode = `${prefix}-${ticket_number.toString().padStart(3, '0')}`;

    // Get priority from settings
    const { data: prioritySettings } = await supabaseAdmin
      .from('settings')
      .select('normal_priority, preferential_priority')
      .eq('unit_id', unit_id)
      .single();

    const priority = ticket_type === 'preferential' 
      ? (prioritySettings?.preferential_priority || 10)
      : (prioritySettings?.normal_priority || 5);

    // Create and immediately call the ticket
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('tickets')
      .insert({
        unit_id,
        ticket_type,
        ticket_number,
        display_code: displayCode,
        priority,
        status: 'called',
        counter_id,
        attendant_id,
        called_at: new Date().toISOString(),
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

    console.log('Manual ticket created and called:', displayCode);

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
