import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const ACTORS: Record<string, string> = {
  amazon: 'junglee/amazon-crawler',
  google: 'apify~google-search-scraper',
  reddit: 'crawlerbros/reddit-scraper',
  linkedin: 'harvestapi/linkedin-profile-search',
}

export async function POST(req: NextRequest) {
  const { source, input } = await req.json()

  const apifyToken = process.env.APIFY_TOKEN
  const anthropicKey = process.env.ANTHROPIC_API_KEY

  if (!apifyToken || !anthropicKey) {
    return NextResponse.json({ error: 'Missing API keys in environment variables.' }, { status: 500 })
  }

  const actorId = ACTORS[source]
  if (!actorId) return NextResponse.json({ error: 'Unknown source' }, { status: 400 })

  // Step 1: Call Apify server-side (no CORS here)
  let rawItems: unknown[] = []
  try {
    const apifyUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}&timeout=90&memory=512`
    const apifyRes = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!apifyRes.ok) {
      const txt = await apifyRes.text()
      throw new Error(`Apify ${apifyRes.status}: ${txt.slice(0, 200)}`)
    }
    rawItems = await apifyRes.json()
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }

  if (!rawItems.length) {
    return NextResponse.json({ error: 'Apify returned 0 results. Try a different keyword.' }, { status: 404 })
  }

  // Step 2: Qualify with Claude
  const client = new Anthropic({ apiKey: anthropicKey })

  const prompt = `You are the MYAMZTEAM Lead Qualification Agent for an Amazon FBA management agency.

MYAMZTEAM Ideal Client Profile (ICP):
- Amazon brand doing $500K–$10M/yr revenue
- Founder/operator overwhelmed and DIY-ing their account
- Visible listing quality issues: weak images, thin copy, low reviews, no A+ content
- No current full-service Amazon agency
- FBA-first, US marketplace primary

RAW SCRAPED DATA from ${source} (actor: ${actorId}):
${JSON.stringify(rawItems.slice(0, 12), null, 2)}

Qualify each item and return ONLY a raw JSON array. Each object must have:
- name: string (brand or company name — extract from title/brand field)
- score: number 1-10 (ICP fit score)
- verdict: "Qualified" | "Maybe" | "Disqualified"
- pain: string (one specific, observable pain point)
- outreach: string (1-2 sentence personalized cold opener — reference something specific)
- action: "Email" | "LinkedIn DM" | "Skip"
- source: "${source}"

No markdown. No explanation. Just the JSON array.`

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = msg.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('No JSON array in Claude response')
    const leads = JSON.parse(match[0])
    return NextResponse.json({ leads, raw: rawItems.length })
  } catch (e: unknown) {
    return NextResponse.json({ error: 'Claude error: ' + String(e) }, { status: 500 })
  }
}
