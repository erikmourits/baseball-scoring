import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const url   = new URL(req.url)
    const token = url.searchParams.get('token')

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Missing token' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Use service role key — bypasses RLS so we can read any game
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Validate token
    const { data: share, error: shareErr } = await supabase
      .from('game_shares')
      .select('game_id')
      .eq('id', token)
      .single()

    if (shareErr || !share) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired share link' }),
        { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const gameId = share.game_id

    // Fetch game
    const { data: game } = await supabase
      .from('games')
      .select('*, home_team:teams!home_team_id(name), away_team:teams!away_team_id(name)')
      .eq('id', gameId)
      .single()

    // Fetch innings
    const { data: innings } = await supabase
      .from('innings')
      .select('*')
      .eq('game_id', gameId)
      .order('inning_number')
      .order('half')

    // Fetch at-bats
    const inningIds = (innings ?? []).map((i: any) => i.id)
    let atBats: any[] = []
    if (inningIds.length > 0) {
      const { data } = await supabase
        .from('at_bats')
        .select('*, batter:players!batter_id(name)')
        .in('inning_id', inningIds)
        .order('sequence_number')
      atBats = data ?? []
    }

    return new Response(
      JSON.stringify({ game, innings, atBats }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
