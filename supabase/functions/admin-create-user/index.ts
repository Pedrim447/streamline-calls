import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  role: 'admin' | 'attendant' | 'recepcao';
  unit_id: string;
  matricula?: string;
  cpf?: string;
  birth_date?: string;
  avatar_url?: string;
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

    // Create admin client
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

    // Check if user is admin
    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const isAdmin = roles?.some(r => r.role === 'admin');
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Acesso negado. Apenas administradores podem criar usuários.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: CreateUserRequest = await req.json();
    const { email, password, full_name, role, unit_id, matricula, cpf, birth_date, avatar_url } = body;

    console.log('Creating user:', email, 'with role:', role);

    // Validate required inputs
    if (!email || !password || !full_name || !role || !unit_id) {
      return new Response(
        JSON.stringify({ error: 'Email, senha, nome completo, permissão e unidade são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: 'A senha deve ter pelo menos 6 caracteres' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate CPF format (11 digits)
    if (cpf && !/^\d{11}$/.test(cpf.replace(/\D/g, ''))) {
      return new Response(
        JSON.stringify({ error: 'CPF deve conter 11 dígitos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if matricula already exists
    if (matricula) {
      const { data: existingMatricula } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('matricula', matricula)
        .single();

      if (existingMatricula) {
        return new Response(
          JSON.stringify({ error: 'Matrícula já cadastrada' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Check if CPF already exists
    if (cpf) {
      const cleanCpf = cpf.replace(/\D/g, '');
      const { data: existingCpf } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('cpf', cleanCpf)
        .single();

      if (existingCpf) {
        return new Response(
          JSON.stringify({ error: 'CPF já cadastrado' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Create the user with admin API
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
      },
    });

    if (createError) {
      console.error('Error creating user:', createError);
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User created:', newUser.user?.id);

    // Update the profile with additional fields
    const profileUpdate: Record<string, unknown> = { unit_id };
    if (matricula) profileUpdate.matricula = matricula;
    if (cpf) profileUpdate.cpf = cpf.replace(/\D/g, '');
    if (birth_date) profileUpdate.birth_date = birth_date;
    if (avatar_url) profileUpdate.avatar_url = avatar_url;

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update(profileUpdate)
      .eq('user_id', newUser.user!.id);

    if (profileError) {
      console.error('Error updating profile:', profileError);
    }

    // Assign role
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: newUser.user!.id,
        role,
      });

    if (roleError) {
      console.error('Error assigning role:', roleError);
    }

    console.log('User setup complete:', email, 'role:', role);

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: { 
          id: newUser.user!.id, 
          email: newUser.user!.email 
        } 
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
