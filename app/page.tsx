'use client'
import { useState } from 'react'

const ACTORS: Record<string, string> = {
  amazon: 'junglee/free-amazon-product-scraper',
  google: 'apify~google-search-scraper',
  reddit: 'trudax/reddit-scraper-lite',
  linkedin: 'curious_coder/linkedin-profile-scraper',
}

interface Lead {
  name: string
  score: number
  verdict: 'Qualified' | 'Maybe' | 'Disqualified'
  pain: string
  outreach: string
  action: string
  source: string
}

type LogEntry = { msg: string; type: 'ok' | 'err' | 'info' }

function buildInput(source: string, fields: Record<string, string>) {
  if (source === 'amazon') return { searchTerms: [fields.keyword || 'gun cleaning'], maxItemsPerQuery: parseInt(fields.max || '10'), scrapeProductDetails: false }
  if (source === 'google') return { queries: fields.query || 'Amazon FBA brand struggling', maxPagesPerQuery: 1, resultsPerPage: parseInt(fields.max || '10') }
  if (source === 'reddit') return { searches: [{ term: fields.keyword || 'struggling PPC help' }], subreddits: [fields.subreddit || 'FulfillmentByAmazon'], maxItems: parseInt(fields.max || '10') }
  return { queries: fields.query || 'Amazon FBA founder', maxItems: parseInt(fields.max || '5'), scrapeMode: 'Short' }
}

const inp = "w-full bg-[#1a1a24] border border-white/[0.13] rounded-lg px-2.5 py-2 text-[#f0f0f8] font-mono text-[12px] outline-none focus:border-[#00e5a0] transition-colors"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2.5">
      <label className="block text-[11px] text-[#8888aa] font-mono mb-1">{label}</label>
      {children}
    </div>
  )
}

function Sel({ value, onChange, opts }: { value: string; onChange: (v: string) => void; opts: string[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full bg-[#1a1a24] border border-white/[0.13] rounded-lg px-2.5 py-2 text-[#f0f0f8] font-mono text-[12px] outline-none focus:border-[#00e5a0] transition-colors">
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

export default function Home() {
  const [source, setSource] = useState('amazon')
  const [fields, setFields] = useState<Record<string, string>>({
    keyword: 'gun cleaning kit', max: '10',
    subreddit: 'FulfillmentByAmazon',
    query: 'Amazon FBA brand struggling listing optimization'
  })
  const [leads, setLeads] = useState<Lead[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [pushed, setPushed] = useState<Set<string>>(new Set())
  const [pushing, setPushing] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState<string | null>(null)

  const addLog = (msg: string, type: LogEntry['type'] = 'info') =>
    setLogs(l => [...l, { msg, type }])

  const f = (k: string, v: string) => setFields(prev => ({ ...prev, [k]: v }))

  const run = async () => {
    if (running) return
    setRunning(true); setLeads([]); setLogs([]); setPushed(new Set()); setProgress(10)
    addLog(`Calling Apify actor: ${ACTORS[source]}`)
    try {
      setProgress(30)
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, input: buildInput(source, fields) }),
      })
      setProgress(70)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Server error')
      addLog(`Apify returned ${data.raw} raw results`, 'ok')
      addLog(`Claude qualified ${data.leads.length} leads`, 'ok')
      setLeads(data.leads)
      setProgress(100)
    } catch (e: unknown) {
      addLog(String(e), 'err')
      setProgress(0)
    }
    setRunning(false)
  }

  const pushToNotion = async (lead: Lead) => {
    const key = lead.name
    setPushing(p => new Set([...p, key]))
    try {
      const res = await fetch('/api/notion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lead),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPushed(p => new Set([...p, key]))
      addLog(`✓ "${lead.name}" pushed to Notion CRM`, 'ok')
    } catch (e: unknown) {
      addLog(`Notion error for ${lead.name}: ${String(e)}`, 'err')
    }
    setPushing(p => { const n = new Set(p); n.delete(key); return n })
  }

  const copyOutreach = (lead: Lead) => {
    navigator.clipboard.writeText(lead.outreach)
    setCopied(lead.name)
    setTimeout(() => setCopied(null), 1800)
  }

  const qualified = leads.filter(l => l.verdict === 'Qualified').length
  const scoreColor = (s: number) => s >= 7 ? '#00e5a0' : s >= 4 ? '#ffaa00' : '#ff4466'
  const borderColor = (v: string) => v === 'Qualified' ? '#00e5a0' : v === 'Maybe' ? '#ffaa00' : '#ff4466'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#0a0a0f', color: '#f0f0f8', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', background: '#111118', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', color: '#00e5a0' }}>MYAMZTEAM</span>
          <span style={{ color: '#8888aa', fontSize: 13 }}>/ Lead Gen</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'monospace', fontSize: 12, color: '#8888aa' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: running ? '#ffaa00' : leads.length ? '#00e5a0' : '#8888aa', boxShadow: running ? '0 0 6px #ffaa00' : leads.length ? '0 0 6px #00e5a0' : 'none' }} />
          {running ? 'Running…' : leads.length ? `${qualified} qualified` : 'Idle'}
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Sidebar */}
        <aside style={{ width: 280, flexShrink: 0, background: '#111118', borderRight: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', color: '#8888aa', textTransform: 'uppercase', padding: '14px 16px 6px' }}>Source</div>
          <div style={{ padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {[
              { id: 'amazon', icon: '📦', label: 'Amazon Brand', badge: 'ASIN' },
              { id: 'google', icon: '🔍', label: 'Google Search', badge: null },
              { id: 'reddit', icon: '💬', label: 'Reddit', badge: null },
              { id: 'linkedin', icon: '💼', label: 'LinkedIn', badge: null },
            ].map(s => (
              <button key={s.id} onClick={() => setSource(s.id)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8,
                border: `1px solid ${source === s.id ? 'rgba(255,255,255,0.13)' : 'transparent'}`,
                background: source === s.id ? '#1a1a24' : 'transparent',
                color: source === s.id ? '#f0f0f8' : '#8888aa',
                fontSize: 13, fontWeight: 500, cursor: 'pointer', textAlign: 'left', width: '100%',
                fontFamily: 'inherit'
              }}>
                <span style={{ width: 20, textAlign: 'center' }}>{s.icon}</span>
                <span style={{ flex: 1 }}>{s.label}</span>
                {s.badge && <span style={{ fontSize: 10, fontFamily: 'monospace', padding: '2px 6px', borderRadius: 4, background: 'rgba(0,229,160,0.1)', color: '#00e5a0' }}>{s.badge}</span>}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', color: '#8888aa', textTransform: 'uppercase', padding: '6px 16px 6px' }}>Config</div>
          <div style={{ padding: '0 12px 12px', flex: 1 }}>
            {source === 'amazon' && <>
              <Field label="Keyword"><input style={inpStyle} value={fields.keyword} onChange={e => f('keyword', e.target.value)} /></Field>
              <Field label="Max Products"><Sel value={fields.max} onChange={v => f('max', v)} opts={['5','10','20']} /></Field>
            </>}
            {source === 'google' && <>
              <Field label="Query"><textarea style={{ ...inpStyle, height: 68, resize: 'none' }} value={fields.query} onChange={e => f('query', e.target.value)} /></Field>
              <Field label="Results"><Sel value={fields.max} onChange={v => f('max', v)} opts={['10','20']} /></Field>
            </>}
            {source === 'reddit' && <>
              <Field label="Subreddit"><input style={inpStyle} value={fields.subreddit} onChange={e => f('subreddit', e.target.value)} /></Field>
              <Field label="Keywords"><input style={inpStyle} value={fields.keyword} onChange={e => f('keyword', e.target.value)} /></Field>
              <Field label="Post Limit"><Sel value={fields.max} onChange={v => f('max', v)} opts={['10','25']} /></Field>
            </>}
            {source === 'linkedin' && <>
              <Field label="Query"><input style={inpStyle} value={fields.query} onChange={e => f('query', e.target.value)} /></Field>
              <Field label="Profiles"><Sel value={fields.max} onChange={v => f('max', v)} opts={['5','10']} /></Field>
            </>}

            <button onClick={run} disabled={running} style={{
              width: '100%', padding: '11px 0', background: running ? 'rgba(0,229,160,0.4)' : '#00e5a0',
              color: '#001a10', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
              cursor: running ? 'not-allowed' : 'pointer', letterSpacing: '0.04em', marginBottom: 8,
              fontFamily: 'inherit'
            }}>
              {running ? '⏳ Running…' : '▶ Scrape & Qualify'}
            </button>
          </div>

          <div style={{ margin: '0 12px 12px', padding: '8px 12px', background: '#1a1a24', borderRadius: 7, border: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ fontSize: 10, color: '#8888aa', fontFamily: 'monospace', marginBottom: 2 }}>Actor</div>
            <div style={{ fontSize: 11, color: '#0066ff', fontFamily: 'monospace', wordBreak: 'break-all' }}>{ACTORS[source]}</div>
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 22px', background: '#111118', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {leads.length ? `${qualified} qualified lead${qualified !== 1 ? 's' : ''} found` : 'Ready to Prospect'}
              </div>
              <div style={{ fontSize: 12, color: '#8888aa', fontFamily: 'monospace' }}>
                {leads.length ? `${leads.length} total · ${source} pipeline` : 'Select a source and run the pipeline'}
              </div>
            </div>
            {leads.length > 0 && <div style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 12, color: '#8888aa' }}>{leads.length} leads</div>}
          </div>

          {running && (
            <div style={{ height: 2, background: 'rgba(255,255,255,0.07)', flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#00e5a0', width: `${progress}%`, transition: 'width 0.4s ease' }} />
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {logs.map((l, i) => (
              <div key={i} style={{ fontFamily: 'monospace', fontSize: 11, padding: '1px 0', color: l.type === 'ok' ? '#00e5a0' : l.type === 'err' ? '#ff4466' : '#8888aa' }}>
                › {l.msg}
              </div>
            ))}

            {!leads.length && !running && logs.length === 0 && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#8888aa', gap: 10, fontFamily: 'monospace', fontSize: 13, minHeight: 300 }}>
                <div style={{ fontSize: 38, opacity: 0.2 }}>🎯</div>
                <div>No leads yet — run the pipeline</div>
                <div style={{ fontSize: 11, opacity: 0.5 }}>Apify scrapes → Claude qualifies → push to Notion</div>
              </div>
            )}

            {leads.map((lead, i) => {
              const initials = lead.name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase()
              const isPushed = pushed.has(lead.name)
              const isPushing = pushing.has(lead.name)
              const isCopied = copied === lead.name
              return (
                <div key={i} style={{ background: '#111118', border: '1px solid rgba(255,255,255,0.07)', borderLeft: `3px solid ${borderColor(lead.verdict)}`, borderRadius: 11, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 16px' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 7, background: '#1a1a24', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: '#00e5a0', flexShrink: 0 }}>{initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{lead.name}</div>
                      <div style={{ fontSize: 11, color: '#8888aa', fontFamily: 'monospace' }}>{lead.source} · {lead.verdict} · {lead.action}</div>
                      <div style={{ display: 'flex', gap: 2, marginTop: 6 }}>
                        {Array.from({ length: 10 }, (_, j) => (
                          <div key={j} style={{ height: 3, flex: 1, borderRadius: 2, background: j < lead.score ? scoreColor(lead.score) : 'rgba(255,255,255,0.1)' }} />
                        ))}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 500, color: scoreColor(lead.score) }}>
                        {lead.score}<span style={{ fontSize: 12, color: '#8888aa' }}>/10</span>
                      </div>
                      <div style={{ fontSize: 9, color: '#8888aa', letterSpacing: '0.08em' }}>ICP SCORE</div>
                    </div>
                  </div>
                  <div style={{ padding: '0 16px 13px' }}>
                    <div style={{ display: 'inline-block', fontSize: 11, padding: '3px 9px', borderRadius: 20, background: 'rgba(0,229,160,0.07)', color: '#00e5a0', fontFamily: 'monospace', marginBottom: 8, border: '1px solid rgba(0,229,160,0.2)' }}>
                      ⚡ {lead.pain}
                    </div>
                    <div style={{ fontSize: 12, color: '#8888aa', background: '#1a1a24', borderRadius: 7, padding: '9px 11px', border: '1px solid rgba(255,255,255,0.07)', fontFamily: 'monospace', lineHeight: 1.65, whiteSpace: 'pre-wrap', marginBottom: 10 }}>
                      {lead.outreach}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => copyOutreach(lead)} style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid #00e5a0', background: 'transparent', color: '#00e5a0', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {isCopied ? 'Copied!' : 'Copy Outreach'}
                      </button>
                      <button onClick={() => pushToNotion(lead)} disabled={isPushed || isPushing} style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.13)', background: isPushed ? 'rgba(0,229,160,0.07)' : 'transparent', color: isPushed ? '#00e5a0' : '#f0f0f8', fontSize: 11, fontWeight: 500, cursor: isPushed || isPushing ? 'not-allowed' : 'pointer', opacity: isPushing ? 0.5 : 1, fontFamily: 'inherit' }}>
                        {isPushed ? '✓ In Notion' : isPushing ? 'Pushing…' : 'Push to Notion'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </main>
      </div>
    </div>
  )
}

const inpStyle: React.CSSProperties = {
  width: '100%', background: '#1a1a24', border: '1px solid rgba(255,255,255,0.13)',
  borderRadius: 7, padding: '8px 10px', color: '#f0f0f8', fontFamily: 'monospace',
  fontSize: 12, outline: 'none'
}
