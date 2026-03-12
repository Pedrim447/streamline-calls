import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  role: 'admin' | 'attendant' | 'recepcao' | 'painel';
  unit_id: string;
  matricula?: string;
  avatar_url?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
    const { email, password, full_name, role, unit_id, matricula, avatar_url } = body;

    console.log('Creating user:', email, 'with role:', role);

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

    // Check if matricula already exists (excluding inactive/deleted profiles)
    if (matricula) {
      const { data: existingMatricula } = await supabaseAdmin
        .from('profiles')
        .select('id, is_active')
        .eq('matricula', matricula)
        .eq('is_active', true)
        .single();

      if (existingMatricula) {
        return new Response(
          JSON.stringify({ error: 'Matrícula já cadastrada' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    let userId: string;

    // Try to create the user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError) {
      // If user already exists in auth, re-activate them
      if (createError.message.includes('already been registered')) {
        console.log('User already exists in auth, re-activating:', email);
        
        // Find the existing auth user
        const { data: { users: existingUsers }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        
        if (listError) {
          console.error('Error listing users:', listError);
          return new Response(
            JSON.stringify({ error: 'Erro ao buscar usuário existente' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const existingUser = existingUsers?.find(u => u.email === email);
        if (!existingUser) {
          return new Response(
            JSON.stringify({ error: 'Erro ao localizar usuário existente' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        userId = existingUser.id;

        // Update password and metadata
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          password,
          email_confirm: true,
          user_metadata: { full_name },
        });

        console.log('Re-activated existing auth user:', userId);
      } else {
        console.error('Error creating user:', createError);
        return new Response(
          JSON.stringify({ error: createError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      userId = newUser.user!.id;
      console.log('User created:', userId);
    }

    // Upsert profile - update if exists, create handled by trigger
    const profileUpdate: Record<string, unknown> = { 
      unit_id, 
      full_name,
      is_active: true,
    };
    if (matricula) profileUpdate.matricula = matricula;
    if (avatar_url) profileUpdate.avatar_url = avatar_url;

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update(profileUpdate)
      .eq('user_id', userId);

    if (profileError) {
      console.error('Error updating profile:', profileError);
    }

    // Remove old roles and assign new one
    await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', userId);

    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({ user_id: userId, role });

    if (roleError) {
      console.error('Error assigning role:', roleError);
    }

    console.log('User setup complete:', email, 'role:', role);

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: { id: userId, email } 
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
