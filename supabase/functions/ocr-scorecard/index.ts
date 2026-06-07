const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── KNBSB notation system prompt ────────────────────────────────────────────────
// Covers the Dutch KNBSB baseball scorecard format used by Erik's club.

const SYSTEM_PROMPT = `You are an expert at reading Dutch KNBSB baseball scorecards.
Your task is to transcribe a handwritten scorecard photo into a structured JSON game log.

## KNBSB Scorecard Notation

### Outs (circled on the card)
- (K) or (K/) = strikeout swinging
- (KL) or (ꓘ) = strikeout looking
- (F7), (F8), (F9) etc = flyout to left/center/right field
- (F3), (F4) etc = flyout to first, second base
- (3-U), (6-3), (4-3) etc = groundout (fielder positions: 1=P, 2=C, 3=1B, 4=2B, 5=3B, 6=SS, 7=LF, 8=CF, 9=RF)
- (6-4-3) or (4-6-3) = double play (GDP)
- (SAC) or (S) circled = sacrifice bunt
- (SF) circled = sacrifice fly
- (FC) circled = fielder's choice (batter out)

### Reached base (NOT circled)
- 1B or single line = single
- 2B or double line = double
- 3B or triple line = triple
- HR = home run
- W or BB = base on balls (walk)
- HP or HBP = hit by pitch
- E followed by position number (E6, E3 etc) = reached on error → use result "ROE"
- FC = fielder's choice (safe)
- SB = stolen base (baserunning event, not an at-bat result)
- CS = caught stealing → out on bases

### Scoring and advancement
- Arrow up (↑) or plus (+) next to a base = runner scored
- X = runner out/stranded
- Number in diamond = which base reached after play (1, 2, 3, or H for home)
- Slashed column header = batting order turned over within same inning

### Pitcher changes
- Horizontal line through column = new pitcher started

## Output format

Return ONLY valid JSON matching this exact schema. No explanation, no markdown.

{
  "gameInfo": {
    "date": "YYYY-MM-DD or null",
    "homeTeam": "team name or null",
    "awayTeam": "team name or null",
    "location": "field name or null"
  },
  "innings": [
    {
      "inningNumber": 1,
      "half": "top",
      "atBats": [
        {
          "batterName": "player name or null",
          "result": "1B|2B|3B|HR|BB|HBP|ROE|FC|K|KL|FO|GO|SAC|SF|GDP",
          "rbiCount": 0,
          "fielders": "e.g. 6-3 or null",
          "runnerOutcomes": [
            {
              "runnerName": "player name or null",
              "startBase": "first|second|third",
              "endBase": "second|third|home|out"
            }
          ],
          "baserunningEvents": [
            {
              "runnerName": "player name or null",
              "eventType": "SB|CS|WP|PB",
              "startBase": "first|second|third",
              "endBase": "second|third|home|out"
            }
          ],
          "confidence": "high|medium|low",
          "notes": "anything ambiguous or unclear"
        }
      ]
    }
  ]
}

Rules:
- confidence = "high" when notation is clear and unambiguous
- confidence = "medium" when you can make a reasonable inference
- confidence = "low" when notation is unclear, smudged, or inconsistent
- Always include all innings visible on the card
- If a cell is blank or illegible, set result to null and confidence to "low"
- RBI count should reflect runs scored due to this at-bat
- Include baserunningEvents that happen between at-bats or during the at-bat
- Do not hallucinate — if you cannot read something, use null and low confidence`

// ── Handler ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'OPENAI_API_KEY secret not set' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const { imageBase64, mimeType = 'image/jpeg' } = body

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: 'imageBase64 is required' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Call GPT-4o-mini Vision
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 4096,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Please transcribe this KNBSB baseball scorecard into the JSON format specified.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${imageBase64}`,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
      }),
    })

    if (!openaiResponse.ok) {
      const err = await openaiResponse.text()
      return new Response(
        JSON.stringify({ error: 'OpenAI API error', detail: err }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const openaiData = await openaiResponse.json()
    const content = openaiData.choices?.[0]?.message?.content

    if (!content) {
      return new Response(
        JSON.stringify({ error: 'Empty response from OpenAI' }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Parse and return the game log JSON
    const gameLog = JSON.parse(content)
    const usage = openaiData.usage

    return new Response(
      JSON.stringify({ gameLog, usage }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
