import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url   = new URL(req.url)
  const token = url.searchParams.get('token')

  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing token' }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  const sb = serviceClient()

  // ── GET: return invite info (public, no auth required) ────────────────────
  if (req.method === 'GET') {
    const { data: invite, error } = await sb
      .from('team_invites')
      .select('id, email, role, expires_at, accepted_at, team:teams(id, name)')
      .eq('id', token)
      .single()

    if (error || !invite) {
      return new Response(JSON.stringify({ error: 'Invalid or expired invite link' }),
        { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ invite }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  // ── POST: accept invite (requires auth) ───────────────────────────────────
  if (req.method === 'POST') {
    // Verify the caller is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Get user from their JWT
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Fetch and validate invite
    const { data: invite, error: inviteErr } = await sb
      .from('team_invites')
      .select('*')
      .eq('id', token)
      .single()

    if (inviteErr || !invite) {
      return new Response(JSON.stringify({ error: 'Invite not found' }),
        { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
    if (invite.accepted_at) {
      return new Response(JSON.stringify({ error: 'Invite already used' }),
        { status: 409, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
    if (new Date(invite.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Invite has expired' }),
        { status: 410, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Insert team member (upsert in case they're already a member)
    const { error: memberErr } = await sb
      .from('team_members')
      .upsert({ team_id: invite.team_id, user_id: user.id, role: invite.role, email: user.email },
               { onConflict: 'team_id,user_id' })

    if (memberErr) {
      return new Response(JSON.stringify({ error: memberErr.message }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Mark invite as accepted
    await sb.from('team_invites')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', token)

    return new Response(JSON.stringify({ teamId: invite.team_id }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  return new Response('Method not allowed', { status: 405, headers: CORS })
})
