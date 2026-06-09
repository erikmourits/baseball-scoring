import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, PATCH, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function getAdminClients(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: isAdmin } = await userClient.rpc('is_site_admin')
  if (!isAdmin) return null

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  return { serviceClient }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const clients = await getAdminClients(req)
  if (!clients) return json({ error: 'Forbidden' }, 403)

  const { serviceClient } = clients
  const url    = new URL(req.url)
  const userId = url.searchParams.get('id')

  // ── GET /admin-users — list all users ─────────────────────────────────────

  if (req.method === 'GET') {
    const page = parseInt(url.searchParams.get('page') ?? '1')

    const { data, error } = await serviceClient.auth.admin.listUsers({
      page,
      perPage: 50,
    })

    if (error) return json({ error: error.message }, 500)

    return json({
      users: data.users.map(u => ({
        id:              u.id,
        email:           u.email,
        created_at:      u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        banned:          !!u.banned_until && new Date(u.banned_until) > new Date(),
      })),
      total: data.total ?? data.users.length,
    })
  }

  // ── DELETE /admin-users?id=… — soft-ban a user ────────────────────────────

  if (req.method === 'DELETE') {
    if (!userId) return json({ error: 'Missing id' }, 400)

    const { error } = await serviceClient.auth.admin.updateUserById(userId, {
      ban_duration: '876000h', // ~100 years
    })

    if (error) return json({ error: error.message }, 500)
    return json({ success: true, banned: true })
  }

  // ── PATCH /admin-users?id=… — unban a user ────────────────────────────────

  if (req.method === 'PATCH') {
    if (!userId) return json({ error: 'Missing id' }, 400)

    const { error } = await serviceClient.auth.admin.updateUserById(userId, {
      ban_duration: 'none',
    })

    if (error) return json({ error: error.message }, 500)
    return json({ success: true, banned: false })
  }

  return json({ error: 'Method not allowed' }, 405)
})
