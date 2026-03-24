import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const ACTORS: Record<string, string> = {
  amazon: 'junglee~Amazon-crawler',
  google: 'apify~google-search-scraper',
  reddit: 'trudax/reddit-scraper-lite',
  linkedin: 'curious_coder/linkedin-profile-scraper',
}

function buildApifyInput(source: string, input: Record<string, unknown>) {
  if (source === 'amazon') {
    const keyword = (input.searchTerms as string[])?.[0] || 'gun cleaning kit'
    return {
      categoryOrProductUrls: [{ url: `https://www.amazon.com/s?k=${encodeURIComponent(keyword)}` }],
      maxItemsPerPage: Number(input.maxItemsPerQuery) || 10,
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
    const apifyUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}&timeout=90&memory=512`
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
    return NextResponse.json({ error: 'Apify returned 0 results.' }, { status: 404 })
  }

  const client = new Anthropic({ apiKey: anthropicKey })
  const prompt = `You are the MYAMZTEAM Lead Qualification Agent for an Amazon FBA agency.

ICP: Amazon brand $500K-$10M/yr, overwhelmed founder, weak listings, no full-service agency, FBA-first US.

RAW DATA from ${source}:
${JSON.stringify(rawItems.slice(0, 12), null, 2)}

Return ONLY a raw JSON array. Each object: name, score (1-10), verdict ("Qualified"|"Maybe"|"Disqualified"), pain, outreach, action ("Email"|"LinkedIn DM"|"Skip"), source ("${source}")`

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
