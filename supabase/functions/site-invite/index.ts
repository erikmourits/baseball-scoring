import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const url   = new URL(req.url)
  const token = url.searchParams.get('token')

  // ── GET /site-invite?token=… — return invite info (public) ───────────────

  if (req.method === 'GET') {
    if (!token) return json({ error: 'Missing token' }, 400)

    const { data: invite, error } = await serviceClient
      .from('site_invites')
      .select('token, name, expires_at, accepted_at')
      .eq('token', token)
      .single()

    if (error || !invite) return json({ error: 'Invite not found' }, 404)
    if (invite.accepted_at) return json({ error: 'Invite already used' }, 410)
    if (new Date(invite.expires_at) < new Date()) return json({ error: 'Invite has expired' }, 410)

    return json({ name: invite.name, expires_at: invite.expires_at })
  }

  // ── POST /site-invite — create invite (admin only) ────────────────────────
  //    Body: { name: string }
  //    Requires Authorization header from a site admin.

  if (req.method === 'POST' && !token) {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: 'Invalid session' }, 401)

    const { data: adminCheck } = await userClient.rpc('is_site_admin')
    if (!adminCheck) return json({ error: 'Forbidden' }, 403)

    const body = await req.json().catch(() => ({}))
    const name = (body.name ?? '').trim()
    if (!name) return json({ error: 'name is required' }, 400)

    const { data: invite, error: insertError } = await serviceClient
      .from('site_invites')
      .insert({ name, created_by: user.id })
      .select('token')
      .single()

    if (insertError || !invite) {
      return json({ error: insertError?.message ?? 'Failed to create invite' }, 500)
    }

    return json({ token: invite.token })
  }

  // ── POST /site-invite?token=… — accept invite ─────────────────────────────
  //    Body: { email: string, password: string }
  //    Creates the account via admin API (works even when open signups are disabled).

  if (req.method === 'POST' && token) {
    const { data: invite, error } = await serviceClient
      .from('site_invites')
      .select('token, name, accepted_at, expires_at')
      .eq('token', token)
      .single()

    if (error || !invite) return json({ error: 'Invite not found' }, 404)
    if (invite.accepted_at) return json({ error: 'Invite already used' }, 410)
    if (new Date(invite.expires_at) < new Date()) return json({ error: 'Invite has expired' }, 410)

    const body = await req.json().catch(() => ({}))
    const email    = (body.email    ?? '').trim().toLowerCase()
    const password = (body.password ?? '').trim()

    if (!email)    return json({ error: 'email is required' }, 400)
    if (!password) return json({ error: 'password is required' }, 400)
    if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400)

    // Create the account — works regardless of whether open signups are enabled
    const { data: newUser, error: createError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // skip confirmation email; they already proved intent via invite link
    })

    if (createError) return json({ error: createError.message }, 500)

    // Mark token as used
    await serviceClient
      .from('site_invites')
      .update({ accepted_at: new Date().toISOString() })
      .eq('token', token)

    return json({ success: true, userId: newUser.user?.id })
  }

  return json({ error: 'Method not allowed' }, 405)
})
