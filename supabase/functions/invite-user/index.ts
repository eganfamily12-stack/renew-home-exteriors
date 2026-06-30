import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    // Create admin client (service role) for user management
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Create regular client to verify the caller's role
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify caller is admin
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const { data: callerProfile } = await adminClient
      .from('users')
      .select('role, tenant_id')
      .eq('id', caller.id)
      .single();

    const INVITE_ROLES = ['platform_owner', 'super_admin', 'admin'];
    if (!INVITE_ROLES.includes(callerProfile?.role)) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions to invite users' }), { status: 403, headers: corsHeaders });
    }

    const { name, email, phone, role, tenant_id: bodyTenantId } = await req.json();
    if (!email) return new Response(JSON.stringify({ error: 'Email is required' }), { status: 400, headers: corsHeaders });

    const VALID_ROLES = ['platform_owner', 'super_admin', 'admin', 'director', 'user', 'rep'];
    const validRole = VALID_ROLES.includes(role) ? role : 'rep';
    // platform.html passes tenant_id in body; admin.html uses caller's own tenant
    const tenantId = bodyTenantId || callerProfile.tenant_id;

    // Invite user via Supabase Auth Admin API
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name: name || email },
      redirectTo: `${Deno.env.get('SITE_URL') || 'http://localhost:3000'}/PricingEstimator.html`,
    });

    let userId = inviteData?.user?.id;

    if (inviteError) {
      // User already exists in auth — look them up by email
      if (inviteError.message.toLowerCase().includes('already')) {
        const { data: existing } = await adminClient
          .from('users')
          .select('id')
          .eq('email', email)
          .maybeSingle();
        userId = existing?.id;
      } else {
        return new Response(JSON.stringify({ error: inviteError.message }), { status: 400, headers: corsHeaders });
      }
    }

    // Upsert row in public.users
    if (userId) {
      await adminClient.from('users').upsert({
        id:        userId,
        tenant_id: tenantId,
        email,
        name:      name || email,
        phone:     phone || null,
        role:      validRole,
        active:    true,
      }, { onConflict: 'id' });
    }

    return new Response(JSON.stringify({ success: true, userId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('invite-user error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
