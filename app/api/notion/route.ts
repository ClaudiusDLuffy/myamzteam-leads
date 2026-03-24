import { NextRequest, NextResponse } from 'next/server'
import { Client } from '@notionhq/client'

export async function POST(req: NextRequest) {
  const lead = await req.json()

  const notionToken = process.env.NOTION_TOKEN
  const dbId = process.env.NOTION_LEADS_DB_ID

  if (!notionToken || !dbId) {
    return NextResponse.json({ error: 'Notion env vars not set (NOTION_TOKEN, NOTION_LEADS_DB_ID).' }, { status: 500 })
  }

  const notion = new Client({ auth: notionToken })

  try {
    const page = await notion.pages.create({
      parent: { database_id: dbId },
      properties: {
        Name: {
          title: [{ text: { content: lead.name || 'Unknown Lead' } }],
        },
        'ICP Score': {
          number: lead.score ?? 0,
        },
        Verdict: {
          select: { name: lead.verdict || 'Maybe' },
        },
        Source: {
          select: { name: lead.source || 'Unknown' },
        },
        Action: {
          select: { name: lead.action || 'Skip' },
        },
        'Pain Point': {
          rich_text: [{ text: { content: lead.pain || '' } }],
        },
        'Outreach Copy': {
          rich_text: [{ text: { content: lead.outreach || '' } }],
        },
        Status: {
          select: { name: 'New Lead' },
        },
        'Added Date': {
          date: { start: new Date().toISOString().split('T')[0] },
        },
      },
    })
    return NextResponse.json({ success: true, pageId: page.id })
  } catch (e: unknown) {
    return NextResponse.json({ error: 'Notion error: ' + String(e) }, { status: 500 })
  }
}
