import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing token' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── GET: return invite info (no auth required) ────────────────────────────

  if (req.method === 'GET') {
    const { data: invite, error } = await serviceClient
      .from('league_invites')
      .select('id, email, role, expires_at, accepted_at, league_id, leagues(name)')
      .eq('id', token)
      .single()

    if (error || !invite) {
      return new Response(JSON.stringify({ error: 'Invite not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (invite.accepted_at) {
      return new Response(JSON.stringify({ error: 'Invite already used' }), {
        status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (new Date(invite.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Invite has expired' }), {
        status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const leagueName = (invite.leagues as any)?.name ?? 'a league'

    return new Response(JSON.stringify({
      invite: {
        id:          invite.id,
        league_id:   invite.league_id,
        league_name: leagueName,
        role:        invite.role,
        expires_at:  invite.expires_at,
      },
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── POST: accept invite (requires auth) ───────────────────────────────────

  if (req.method === 'POST') {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify the user's JWT
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch and validate the invite
    const { data: invite, error: inviteError } = await serviceClient
      .from('league_invites')
      .select('*')
      .eq('id', token)
      .single()

    if (inviteError || !invite) {
      return new Response(JSON.stringify({ error: 'Invite not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (invite.accepted_at) {
      return new Response(JSON.stringify({ error: 'Invite already used' }), {
        status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (new Date(invite.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Invite has expired' }), {
        status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Insert league member (ignore if already a member)
    const { error: memberError } = await serviceClient
      .from('league_members')
      .upsert({
        league_id: invite.league_id,
        user_id:   user.id,
        role:      invite.role,
        email:     user.email,
      }, { onConflict: 'league_id,user_id' })

    if (memberError) {
      return new Response(JSON.stringify({ error: memberError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Mark invite as accepted
    await serviceClient
      .from('league_invites')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', token)

    return new Response(JSON.stringify({ success: true, leagueId: invite.league_id }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
