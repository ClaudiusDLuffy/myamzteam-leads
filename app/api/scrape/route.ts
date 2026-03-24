import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const ACTORS: Record<string, string> = {
  google: 'apify~google-search-scraper',
'harvestapi~linkedin-profile-search',
}

function buildApifyInput(source: string, input: Record<string, unknown>) {
  if (source === 'google') {
    const query = (input.query as string) || 'Amazon FBA brand founder overwhelmed agency'
    return {
      queries: query,
      resultsPerPage: Number(input.maxResults) || 10,
      maxPagesPerQuery: 1,
    }
  }
  if (source === 'linkedin') {
  return {
    query: (input.query as string) || 'Amazon FBA brand founder',
    maxResults: Number(input.maxResults) || 5,
    scrapeMode: 'Short',
  }
}
  return input
}

export async function POST(req: NextRequest) {
  const { source, input } = await req.json()
  const apifyToken = process.env.APIFY_TOKEN
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!apifyToken || !anthropicKey) {
    return NextResponse.json({ error: 'Missing API keys.' }, { status: 500 })
  }
  const actorId = ACTORS[source]
  if (!actorId) return NextResponse.json({ error: 'Unknown source' }, { status: 400 })

  let rawItems: unknown[] = []
  try {
    const apifyUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}&timeout=60&memory=1024`
    const apifyRes = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildApifyInput(source, input)),
    })
    if (!apifyRes.ok) {
      const txt = await apifyRes.text()
      throw new Error(`Apify ${apifyRes.status}: ${txt.slice(0, 300)}`)
    }
    rawItems = await apifyRes.json()
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }

  if (!rawItems.length) {
    return NextResponse.json({ error: 'No results returned. Try a different query.' }, { status: 404 })
  }

  const client = new Anthropic({ apiKey: anthropicKey })
  const prompt = `You are the MYAMZTEAM Lead Qualification Agent for an Amazon FBA management agency.

MYAMZTEAM ICP:
- Amazon brand doing $500K–$10M/yr
- Founder/operator overwhelmed, DIY-ing their account
- Listing quality issues (weak images, thin copy, low reviews, no A+)
- No current full-service Amazon agency
- FBA-first, US marketplace primary

RAW DATA from ${source} scrape:
${JSON.stringify(rawItems.slice(0, 12), null, 2)}

Analyze each result. Extract any contact info (name, email, LinkedIn URL, website). Qualify against ICP.

Return ONLY a raw JSON array. Each object:
- name: string (brand or person name)
- contact: string (email, LinkedIn URL, or website if found — otherwise "Not found")
- score: number 1-10 (ICP fit)
- verdict: "Qualified" | "Maybe" | "Disqualified"
- pain: string (one specific pain point you spotted)
- outreach: string (1-2 sentence personalized cold opener referencing something specific)
- action: "Email" | "LinkedIn DM" | "Skip"
- source: "${source}"`

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = msg.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('No JSON in response')
    return NextResponse.json({ leads: JSON.parse(match[0]), raw: rawItems.length })
  } catch (e: unknown) {
    return NextResponse.json({ error: 'Claude error: ' + String(e) }, { status: 500 })
  }
}
