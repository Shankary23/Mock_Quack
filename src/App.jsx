import { useState, useEffect, useRef } from 'react'
import './App.css'

const GEMINI_API_KEY = "YOUR_KEY_HERE"

const STAGES = ["Freshman", "Sophomore", "Junior", "Senior", "Early Career", "Mid Career"]
const STAGE_AGES = { Freshman: 18, Sophomore: 19, Junior: 20, Senior: 21, "Early Career": 23, "Mid Career": 27 }
const PLAYER_COLORS = ["#10b981", "#f43f5e", "#8b5cf6", "#f59e0b"]
const PLAYER_SYMBOLS = ["◈", "◆", "★", "▲"]

// Cell colors per life stage — bright fills for the colorful board
const STAGE_COLORS = [
  { bg: '#dbeafe', border: '#3b82f6', glow: '#2563eb', label: '#1e40af' },  // Freshman - blue
  { bg: '#cffafe', border: '#22d3ee', glow: '#0891b2', label: '#0e7490' },  // Sophomore - cyan
  { bg: '#ede9fe', border: '#8b5cf6', glow: '#7c3aed', label: '#4c1d95' },  // Junior - violet
  { bg: '#fce7f3', border: '#f472b6', glow: '#db2777', label: '#9d174d' },  // Senior - pink
  { bg: '#dcfce7', border: '#4ade80', glow: '#16a34a', label: '#166534' },  // Early Career - green
  { bg: '#fef9c3', border: '#fbbf24', glow: '#d97706', label: '#78350f' },  // Mid Career - amber
]

// SVG board dimensions (viewBox units) — wide aspect ratio fills projection screens
const VW = 900
const VH = 415

// Winding snake path: 6 rows × 6 cells, row spacing 65px, cell spacing 160px
const CELL_DATA = Array.from({ length: 36 }, (_, i) => {
  const stageIdx = Math.floor(i / 6)
  const pos = i % 6
  const row = stageIdx
  const x = row % 2 === 0 ? 50 + pos * 160 : 850 - pos * 160
  const y = 46 + row * 65
  const type = i === 0 ? 'start'
    : i === 35 ? 'finish'
    : pos === 0 ? 'milestone'
    : (pos === 2 || pos === 5) ? 'payday'
    : 'normal'
  return { i, stageIdx, pos, x, y, type }
})

// SVG path: arc radius = 65/2 = 32 (half row-spacing)
const ROAD_PATH = [
  'M 50,46 L 850,46',
  'A 32,32 0 0,1 850,111',
  'L 50,111',
  'A 32,32 0 0,0 50,176',
  'L 850,176',
  'A 32,32 0 0,1 850,241',
  'L 50,241',
  'A 32,32 0 0,0 50,306',
  'L 850,306',
  'A 32,32 0 0,1 850,371',
  'L 50,371',
].join(' ')

const SYSTEM_PROMPT = `You are a brutal, funny narrator for "CS Life" — a board game about surviving college and early career as a CS major.

Given a player's current stats and dice roll, generate ONE contextual life event.

Rules:
- A broke freshman with low GPA gets different events than a senior with a FAANG offer
- Reference real CS culture: LeetCode grind, imposter syndrome, side projects, hackathons, internships, tech layoffs, stack overflow, GitHub stars, HackerNews, Reddit r/cscareerquestions, etc.
- Be funny, relatable, and sometimes brutal
- Events must be contextually appropriate for the life stage
- Stat changes should be realistic: GPA changes -0.3 to +0.3, money -5000 to +15000, mental_health -30 to +20, clout -15 to +20
- Higher dice rolls (5-6) trend positive, lower (1-2) trend negative, middle is mixed

ALWAYS return ONLY valid JSON, no markdown, no preamble, exactly this schema:
{
  "event_title": "string (5-8 words, punchy)",
  "narrative": "string (2-3 sentences, vivid and specific)",
  "gpa_change": number,
  "money_change": number,
  "mental_health_change": number,
  "clout_change": number
}`

async function callGemini(playerState, diceRoll) {
  const userPrompt = `Player: ${playerState.name}
Stage: ${playerState.stage}
Age: ${playerState.age}
GPA: ${playerState.gpa.toFixed(2)}
Money: $${playerState.money.toLocaleString()}
Mental Health: ${playerState.mental_health}/100
Clout: ${playerState.clout}/100
Dice Roll: ${diceRoll}/6
Recent Events: ${playerState.recent_events.slice(-3).join(', ') || 'none yet'}

Generate a life event for this player.`

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 300 }
      })
    }
  )
  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim()
  return JSON.parse(cleaned)
}

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)) }

function calcLifeScore(p) {
  return Math.round(p.gpa * 15 + (p.money / 1000) * 0.5 + p.mental_health * 0.4 + p.clout * 0.3)
}

// Returns which board cell (0-35) a player currently occupies
function getPlayerCell(player) {
  const stageIdx = STAGES.indexOf(player.stage)
  return Math.min(stageIdx * 6 + player.turnsInStage, 35)
}

const DICE_DOTS = {
  1: [[50,50]],
  2: [[25,25],[75,75]],
  3: [[25,25],[50,50],[75,75]],
  4: [[25,25],[75,25],[25,75],[75,75]],
  5: [[25,25],[75,25],[50,50],[25,75],[75,75]],
  6: [[25,25],[75,25],[25,50],[75,50],[25,75],[75,75]]
}

function DiceFace({ value, size = 80 }) {
  const dots = DICE_DOTS[value] || []
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <defs>
        <filter id="glow2">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect x="5" y="5" width="90" height="90" rx="15" ry="15"
        fill="#1e1b4b" stroke="#818cf8" strokeWidth="3" />
      {dots.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="8" fill="#a5b4fc" filter="url(#glow2)" />
      ))}
    </svg>
  )
}

function StatBar({ label, value, max, color }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="stat-bar-wrap">
      <div className="stat-label">
        <span>{label}</span>
        <span style={{ color }}>{label === 'GPA' ? Number(value).toFixed(2) : value}</span>
      </div>
      <div className="stat-track">
        <div className="stat-fill" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}` }} />
      </div>
    </div>
  )
}

function PlayerStats({ player }) {
  const moneyColor = player.money >= 0 ? '#00ff41' : '#ff4444'
  const moneyDisplay = (player.money >= 0 ? '+$' : '-$') + Math.abs(player.money).toLocaleString()
  const moneyPct = clamp(((player.money + 50000) / 100000) * 100, 0, 100)
  const pidx = player.idx

  return (
    <div className="stats-panel">
      <div className="panel-header">PLAYER STATS</div>
      <div className="player-name-display">
        <span className="player-symbol-big" style={{ color: PLAYER_COLORS[pidx] }}>{PLAYER_SYMBOLS[pidx]}</span>
        <div>
          <div className="player-name">{player.name}</div>
          <div className="player-stage-label">{player.stage} · Age {player.age}</div>
        </div>
      </div>
      <div className="stats-list">
        <StatBar label="GPA" value={player.gpa} max={4.0} color="#6366f1" />
        <StatBar label="Mental" value={player.mental_health} max={100} color="#8b5cf6" />
        <StatBar label="Clout" value={player.clout} max={100} color="#f59e0b" />
        <div className="stat-bar-wrap">
          <div className="stat-label">
            <span>Money</span>
            <span style={{ color: moneyColor }}>{moneyDisplay}</span>
          </div>
          <div className="stat-track">
            <div className="stat-fill" style={{ width: `${moneyPct}%`, background: moneyColor, boxShadow: `0 0 8px ${moneyColor}` }} />
          </div>
        </div>
        <div className="life-score-row">
          <span>LIFE SCORE</span>
          <span style={{ color: '#f59e0b', fontSize: '1.5rem', fontWeight: 'bold' }}>{calcLifeScore(player)}</span>
        </div>
        <div className="turns-progress">
          <span style={{ color: '#555' }}>Stage progress</span>
          <div className="turns-dots">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`turn-dot ${i < player.turnsInStage ? 'filled' : ''}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function GameBoard({ players, currentPlayerIdx }) {
  const playersByCell = {}
  players.forEach((p, pi) => {
    const cell = getPlayerCell(p)
    if (!playersByCell[cell]) playersByCell[cell] = []
    playersByCell[cell].push(pi)
  })

  return (
    <div className="board-panel">
      <div className="board-game-area">

        {/* ── SVG winding board ── */}
        <div className="board-frame-wrap">
          <svg className="board-svg"
            viewBox={`0 0 ${VW} ${VH}`}
            preserveAspectRatio="xMidYMid meet"
            xmlns="http://www.w3.org/2000/svg">

            <defs>
              {/* Subtle dot pattern for board texture */}
              <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="10" cy="10" r="0.9" fill="#1e3a5f" />
              </pattern>
              {/* Glow filters per zone */}
              <filter id="glow-blue">
                <feGaussianBlur stdDeviation="3" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="glow-purple">
                <feGaussianBlur stdDeviation="3" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="cell-glow">
                <feGaussianBlur stdDeviation="4" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            {/* ── Board background — dark navy, CS/tech aesthetic ── */}
            <rect x="0" y="0" width={VW} height={VH} fill="#0f172a" rx="10"/>
            <rect x="0" y="0" width={VW} height={VH} fill="url(#dots)" rx="10" opacity="0.5"/>

            {/* ── Zone overlays ── */}
            <rect x="0" y="0"   width={VW} height={143} fill="#3b82f6" opacity="0.07" rx="10"/>
            <rect x="0" y={143} width={VW} height={130} fill="#8b5cf6" opacity="0.08"/>
            <rect x="0" y={273} width={VW} height={142} fill="#06b6d4" opacity="0.07" rx="10"/>

            {/* ── Zone watermark labels ── */}
            <text x={VW/2} y="18"  textAnchor="middle" fill="rgba(255,255,255,0.15)" fontSize="13" fontFamily="Courier New" letterSpacing="6" fontWeight="bold">COLLEGE</text>
            <text x={VW/2} y="162" textAnchor="middle" fill="rgba(255,255,255,0.15)" fontSize="13" fontFamily="Courier New" letterSpacing="4" fontWeight="bold">SENIOR YEARS</text>
            <text x={VW/2} y="289" textAnchor="middle" fill="rgba(255,255,255,0.15)" fontSize="13" fontFamily="Courier New" letterSpacing="6" fontWeight="bold">INDUSTRY</text>

            {/* ── Flavor text between rows ── */}
            <text x={VW/2} y="80"  textAnchor="middle" fill="rgba(148,163,184,0.35)" fontSize="7.5" fontFamily="Courier New" letterSpacing="1">// TODO: pick a major before advisor yells at you</text>
            <text x={VW/2} y="144" textAnchor="middle" fill="rgba(148,163,184,0.35)" fontSize="7.5" fontFamily="Courier New" letterSpacing="1">git commit -m "survived junior year somehow"</text>
            <text x={VW/2} y="209" textAnchor="middle" fill="rgba(148,163,184,0.35)" fontSize="7.5" fontFamily="Courier New" letterSpacing="1">$ leetcode --mode=panic --days-until-oa=3</text>
            <text x={VW/2} y="274" textAnchor="middle" fill="rgba(148,163,184,0.35)" fontSize="7.5" fontFamily="Courier New" letterSpacing="1">ERROR: work_life_balance not found in PATH</text>
            <text x={VW/2} y="339" textAnchor="middle" fill="rgba(148,163,184,0.35)" fontSize="7.5" fontFamily="Courier New" letterSpacing="1">{'while (true) { grind(); if (burnout) break; }'}</text>

            {/* ── Road: indigo/purple, CS/circuit-trace aesthetic ── */}
            <path d={ROAD_PATH} stroke="#1e1b4b" strokeWidth="44" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            <path d={ROAD_PATH} stroke="#3730a3" strokeWidth="34" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            <path d={ROAD_PATH} stroke="#6366f1" strokeWidth="26" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            <path d={ROAD_PATH} stroke="#a5b4fc" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeDasharray="14,20" opacity="0.65"/>

            {/* ── Row direction arrows ── */}
            {[0,1,2,3,4,5].map(row => {
              const isEven = row % 2 === 0
              const y = 46 + row * 65
              return (
                <text key={row}
                  x={isEven ? 20 : VW - 20}
                  y={y + 5}
                  textAnchor="middle"
                  fill="rgba(165,180,252,0.7)"
                  fontSize="13"
                  fontFamily="Courier New">
                  {isEven ? '▶' : '◀'}
                </text>
              )
            })}

            {/* ── Stage name banners ── */}
            {STAGES.map((stage, si) => {
              const isEven = si % 2 === 0
              const y = 46 + si * 65
              const x = isEven ? 38 : VW - 38
              return (
                <text key={si}
                  x={x} y={y - 10}
                  textAnchor="middle"
                  fill="rgba(165,180,252,0.8)"
                  fontSize="6"
                  fontFamily="Courier New"
                  letterSpacing="1.5"
                  fontWeight="bold">
                  {stage.toUpperCase()}
                </text>
              )
            })}

            {/* ── Cell circles ── */}
            {CELL_DATA.map(cell => {
              const sc = STAGE_COLORS[cell.stageIdx]
              const playersHere = playersByCell[cell.i] || []
              const hasPlayers = playersHere.length > 0
              const isStart = cell.type === 'start'
              const isFinish = cell.type === 'finish'
              const isMilestone = cell.type === 'milestone'
              const isPayday = cell.type === 'payday'

              const r = isStart || isFinish ? 18 : isMilestone ? 16 : 14
              let fill   = sc.bg          // bright light fill (blue, purple, etc.)
              let stroke = hasPlayers ? sc.glow : sc.border
              let sw     = isMilestone || isStart || isFinish ? 2.5 : 1.5

              if (isPayday) { fill = '#bbf7d0'; stroke = hasPlayers ? '#16a34a' : '#4ade80' }
              if (isStart)  { fill = '#dcfce7'; stroke = '#16a34a' }
              if (isFinish) { fill = '#fef9c3'; stroke = '#d97706' }

              return (
                <g key={cell.i}>
                  {/* Outer glow ring for occupied cells */}
                  {hasPlayers && (
                    <circle cx={cell.x} cy={cell.y} r={r + 7}
                      fill="none" stroke={sc.glow} strokeWidth="1" opacity="0.35"
                      filter="url(#cell-glow)"/>
                  )}
                  {/* Cell disc */}
                  <circle cx={cell.x} cy={cell.y} r={r}
                    fill={fill} stroke={stroke} strokeWidth={sw}/>

                  {/* Labels when unoccupied */}
                  {!hasPlayers && (
                    <>
                      {isStart && (
                        <text x={cell.x} y={cell.y + 3} textAnchor="middle" fill="#166534" fontSize="6" fontFamily="Courier New" fontWeight="bold">START</text>
                      )}
                      {isFinish && (
                        <text x={cell.x} y={cell.y - 2} textAnchor="middle" fill="#78350f" fontSize="5.5" fontFamily="Courier New" fontWeight="bold">FINISH</text>
                      )}
                      {isPayday && (
                        <text x={cell.x} y={cell.y + 4} textAnchor="middle" fill="#166534" fontSize="12" fontFamily="Courier New" fontWeight="bold">$</text>
                      )}
                      {isMilestone && (
                        <text x={cell.x} y={cell.y + 3} textAnchor="middle" fill={sc.label} fontSize="5.5" fontFamily="Courier New" fontWeight="bold">
                          {STAGES[cell.stageIdx].split(' ')[0].slice(0,5).toUpperCase()}
                        </text>
                      )}
                      {cell.type === 'normal' && (
                        <text x={cell.x} y={cell.y + 3} textAnchor="middle" fill={sc.label} fontSize="7" fontFamily="Courier New" fontWeight="600">
                          {cell.i + 1}
                        </text>
                      )}
                    </>
                  )}

                  {/* Player tokens */}
                  {hasPlayers && playersHere.map((pi, ti) => (
                    <text key={pi}
                      x={cell.x + (playersHere.length > 1 ? (ti - (playersHere.length - 1) / 2) * 10 : 0)}
                      y={cell.y + 5}
                      textAnchor="middle"
                      fill={PLAYER_COLORS[pi]}
                      fontSize={playersHere.length > 2 ? 11 : 14}
                      fontFamily="Courier New"
                      filter="url(#cell-glow)">
                      {PLAYER_SYMBOLS[pi]}
                    </text>
                  ))}
                </g>
              )
            })}

            {/* Board border frame */}
            <rect x="1" y="1" width={VW - 2} height={VH - 2} fill="none" stroke="rgba(99,102,241,0.4)" strokeWidth="2" rx="10"/>
          </svg>
        </div>


      </div>
    </div>
  )
}

function EventLog({ events }) {
  return (
    <div className="log-panel">
      <div className="panel-header">EVENT LOG</div>
      <div className="log-list">
        {events.length === 0 && <div className="log-empty">// awaiting first event...</div>}
        {[...events].reverse().slice(0, 5).map((ev, i) => (
          <div key={i} className="log-entry" style={{ opacity: 1 - i * 0.18 }}>
            <div className="log-player-line">
              <span style={{ color: PLAYER_COLORS[ev.playerIdx] }}>{PLAYER_SYMBOLS[ev.playerIdx]} {ev.playerName}</span>
            </div>
            <div className="log-event-title">{ev.event_title}</div>
            <div className="log-changes-row">
              {ev.mental_health_change !== 0 && <span style={{ color: ev.mental_health_change > 0 ? '#00ff41' : '#ff4444' }}>{ev.mental_health_change > 0 ? '▲' : '▼'}MH</span>}
              {ev.money_change !== 0 && <span style={{ color: ev.money_change > 0 ? '#00ff41' : '#ff4444' }}>{ev.money_change > 0 ? '▲' : '▼'}$</span>}
              {ev.clout_change !== 0 && <span style={{ color: ev.clout_change > 0 ? '#f59e0b' : '#ff4444' }}>{ev.clout_change > 0 ? '▲' : '▼'}CLT</span>}
              {ev.gpa_change !== 0 && <span style={{ color: ev.gpa_change > 0 ? '#00ff41' : '#ff4444' }}>{ev.gpa_change > 0 ? '▲' : '▼'}GPA</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EventCard({ event, playerName, playerIdx, onDismiss }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { const t = setTimeout(() => setVisible(true), 30); return () => clearTimeout(t) }, [])

  const changes = [
    { label: 'GPA', val: event.gpa_change, fmt: v => (v > 0 ? '+' : '') + v.toFixed(2) },
    { label: 'MONEY', val: event.money_change, fmt: v => (v > 0 ? '+$' : '-$') + Math.abs(v).toLocaleString() },
    { label: 'MENTAL', val: event.mental_health_change, fmt: v => (v > 0 ? '+' : '') + v },
    { label: 'CLOUT', val: event.clout_change, fmt: v => (v > 0 ? '+' : '') + v },
  ].filter(c => c.val !== 0)

  return (
    <div className={`event-overlay ${visible ? 'event-visible' : ''}`} onClick={onDismiss}>
      <div className="event-card" onClick={e => e.stopPropagation()}>
        <div className="event-card-player" style={{ color: PLAYER_COLORS[playerIdx] }}>
          {PLAYER_SYMBOLS[playerIdx]} {playerName}
        </div>
        <div className="event-card-title">{event.event_title}</div>
        <div className="event-card-narrative">{event.narrative}</div>
        <div className="event-changes-grid">
          {changes.map((c, i) => (
            <div key={i} className={`change-chip ${c.val > 0 ? 'chip-pos' : 'chip-neg'}`}>
              <div className="chip-label">{c.label}</div>
              <div className="chip-val">{c.fmt(c.val)}</div>
            </div>
          ))}
        </div>
        <button className="dismiss-btn" onClick={onDismiss}>[ CONTINUE → ]</button>
      </div>
    </div>
  )
}

function DiceRollScreen({ finalValue, onComplete }) {
  const [current, setCurrent] = useState(1)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let count = 0
    const total = 22
    const interval = setInterval(() => {
      count++
      setCurrent(Math.floor(Math.random() * 6) + 1)
      if (count >= total) {
        clearInterval(interval)
        setCurrent(finalValue)
        setDone(true)
        setTimeout(onComplete, 1000)
      }
    }, 75)
    return () => clearInterval(interval)
  }, [finalValue, onComplete])

  return (
    <div className="dice-overlay">
      <div className={`dice-center ${done ? 'dice-done' : ''}`}>
        <div className="dice-label-top">ROLLING THE DICE</div>
        <div className={`dice-wrap ${done ? '' : 'dice-shaking'}`}>
          <DiceFace value={current} size={180} />
        </div>
        {done && <div className="dice-result-text">YOU ROLLED A {finalValue}!</div>}
        {!done && <div className="dice-result-text" style={{ opacity: 0 }}>_</div>}
      </div>
    </div>
  )
}

function StageUpOverlay({ info }) {
  return (
    <div className="stage-up-overlay">
      <div className="stage-up-box" style={{ borderColor: info.color, color: info.color }}>
        <div className="stage-up-big">LEVEL UP!</div>
        <div className="stage-up-who">{info.name}</div>
        <div className="stage-up-arrow">→</div>
        <div className="stage-up-new">{info.stage}</div>
      </div>
    </div>
  )
}

function EndScreen({ players, onRestart }) {
  const ranked = [...players].sort((a, b) => calcLifeScore(b) - calcLifeScore(a))

  return (
    <div className="end-screen">
      <div className="scanlines" />
      <div className="end-inner">
        <div className="end-big-title">◈ GAME OVER ◈</div>
        <div className="end-sub">CS Life Complete — Final Rankings</div>
        <div className="rankings-list">
          {ranked.map((p, i) => {
            const pi = p.idx
            const medals = ['🥇', '🥈', '🥉', '4th']
            return (
              <div key={pi} className={`rank-row ${i === 0 ? 'rank-first' : ''}`}
                style={{ borderColor: PLAYER_COLORS[pi] }}>
                <div className="rank-medal">{medals[i]}</div>
                <span style={{ color: PLAYER_COLORS[pi], fontSize: '1.5rem' }}>{PLAYER_SYMBOLS[pi]}</span>
                <div className="rank-player-info">
                  <div className="rank-player-name">{p.name}</div>
                  <div className="rank-player-stats">
                    GPA {p.gpa.toFixed(2)} &nbsp;·&nbsp; MH {p.mental_health} &nbsp;·&nbsp; CLT {p.clout} &nbsp;·&nbsp;
                    <span style={{ color: p.money >= 0 ? '#00ff41' : '#ff4444' }}>
                      {p.money >= 0 ? '+' : ''}${Math.round(p.money / 1000)}k
                    </span>
                  </div>
                </div>
                <div className="rank-score-big" style={{ color: PLAYER_COLORS[pi] }}>
                  {calcLifeScore(p)}
                  <div className="rank-score-sub">LIFE SCORE</div>
                </div>
              </div>
            )
          })}
        </div>
        <button className="restart-btn" onClick={onRestart}>[ PLAY AGAIN ]</button>
      </div>
    </div>
  )
}

function StartScreen({ onStart }) {
  const [numPlayers, setNumPlayers] = useState(2)
  const [names, setNames] = useState(['', '', '', ''])

  const handleStart = () => {
    const playerNames = names.slice(0, numPlayers).map((n, i) => n.trim() || `Player ${i + 1}`)
    onStart(playerNames)
  }

  return (
    <div className="start-screen">
      <div className="scanlines" />
      <div className="start-inner">
        <div className="big-title">
          <span className="title-cs">CS</span>
          <span className="title-life">LIFE</span>
        </div>
        <div className="game-tagline">Survive. Grind. Leetcode. Repeat.</div>
        <div className="setup-card">
          <div className="setup-row">
            <div className="setup-label">PLAYERS</div>
            <div className="count-btns">
              {[2, 3, 4].map(n => (
                <button key={n}
                  className={`count-btn ${numPlayers === n ? 'count-active' : ''}`}
                  onClick={() => setNumPlayers(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="names-section">
            {Array.from({ length: numPlayers }).map((_, i) => (
              <div key={i} className="name-row">
                <span className="name-icon" style={{ color: PLAYER_COLORS[i] }}>{PLAYER_SYMBOLS[i]}</span>
                <input
                  className="name-input"
                  placeholder={`Player ${i + 1}`}
                  value={names[i]}
                  onChange={e => { const n = [...names]; n[i] = e.target.value; setNames(n) }}
                  style={{ '--fc': PLAYER_COLORS[i] }}
                />
              </div>
            ))}
          </div>
          <button className="start-btn" onClick={handleStart}>[ START GAME ]</button>
        </div>
        <div className="start-hint">
          Roll dice → Gemini generates your fate → survive CS life
        </div>
      </div>
    </div>
  )
}

function createPlayer(name, idx) {
  return { name, idx, age: 18, stage: 'Freshman', gpa: 3.5, money: -5000, mental_health: 80, clout: 5, turnsInStage: 0, totalTurns: 0, recent_events: [] }
}

export default function App() {
  const [screen, setScreen] = useState('start')
  const [players, setPlayers] = useState([])
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0)
  const [turnNumber, setTurnNumber] = useState(1)
  const [eventLog, setEventLog] = useState([])
  const [phase, setPhase] = useState('idle')
  const [diceValue, setDiceValue] = useState(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen()
    else document.exitFullscreen()
  }
  const [currentEvent, setCurrentEvent] = useState(null)
  const [stageUpInfo, setStageUpInfo] = useState(null)

  const handleStart = (playerNames) => {
    setPlayers(playerNames.map(createPlayer))
    setScreen('game')
  }

  const handleRoll = () => {
    if (phase !== 'idle') return
    const roll = Math.floor(Math.random() * 6) + 1
    setDiceValue(roll)
    setPhase('rolling')
  }

  const handleDiceComplete = async () => {
    setPhase('loading')
    const player = players[currentPlayerIdx]
    try {
      const event = await callGemini(player, diceValue)
      setCurrentEvent(event)
      setPhase('event')
    } catch {
      const fallbacks = [
        { event_title: "API Timeout — Story of CS Life", narrative: "The Gemini API ghosted you, just like that recruiter from Meta. You stare at the loading spinner, questioning everything.", gpa_change: 0, money_change: 0, mental_health_change: -5, clout_change: 0 },
        { event_title: "WiFi Drops Mid-Interview", narrative: "Your connection dies at minute 42 of a 45-minute technical screen. The follow-up email bounces.", gpa_change: 0, money_change: 0, mental_health_change: -10, clout_change: -5 },
        { event_title: "Your Side Project Goes Viral", narrative: "You pushed a toy project to GitHub at midnight. By morning it had 200 stars. You don't know why.", gpa_change: 0, money_change: 500, mental_health_change: 15, clout_change: 10 },
      ]
      setCurrentEvent(fallbacks[Math.floor(Math.random() * fallbacks.length)])
      setPhase('event')
    }
  }

  const handleDismissEvent = () => {
    const event = currentEvent
    const player = players[currentPlayerIdx]
    const newPlayers = players.map((p, i) => {
      if (i !== currentPlayerIdx) return p
      const updated = { ...p }
      updated.gpa = clamp(updated.gpa + (event.gpa_change || 0), 0, 4.0)
      updated.money = updated.money + (event.money_change || 0)
      updated.mental_health = clamp(updated.mental_health + (event.mental_health_change || 0), 0, 100)
      updated.clout = clamp(updated.clout + (event.clout_change || 0), 0, 100)
      updated.turnsInStage = updated.turnsInStage + 1
      updated.totalTurns = updated.totalTurns + 1
      updated.recent_events = [...updated.recent_events.slice(-4), event.event_title]
      return updated
    })

    const updatedPlayer = newPlayers[currentPlayerIdx]
    let stageAdvanced = false
    let finalPlayers = newPlayers

    if (updatedPlayer.turnsInStage >= 6) {
      const stageIdx = STAGES.indexOf(updatedPlayer.stage)
      if (stageIdx < STAGES.length - 1) {
        finalPlayers = newPlayers.map((p, i) => {
          if (i !== currentPlayerIdx) return p
          return { ...p, stage: STAGES[stageIdx + 1], age: STAGE_AGES[STAGES[stageIdx + 1]], turnsInStage: 0 }
        })
        stageAdvanced = true
        setStageUpInfo({ name: updatedPlayer.name, stage: STAGES[stageIdx + 1], color: PLAYER_COLORS[currentPlayerIdx] })
      }
    }

    setEventLog(prev => [...prev, { ...event, playerIdx: currentPlayerIdx, playerName: player.name }])
    setPlayers(finalPlayers)
    setCurrentEvent(null)

    const allDone = finalPlayers.every(p => p.stage === 'Mid Career' && p.turnsInStage >= 6)
    if (allDone) { setScreen('end'); return }

    if (stageAdvanced) {
      setPhase('stageup')
      setTimeout(() => {
        setStageUpInfo(null)
        setCurrentPlayerIdx(prev => (prev + 1) % finalPlayers.length)
        setTurnNumber(t => t + 1)
        setPhase('idle')
      }, 2500)
    } else {
      setCurrentPlayerIdx(prev => (prev + 1) % finalPlayers.length)
      setTurnNumber(t => t + 1)
      setPhase('idle')
    }
  }

  const handleRestart = () => {
    setScreen('start'); setPlayers([]); setCurrentPlayerIdx(0); setTurnNumber(1)
    setEventLog([]); setPhase('idle'); setDiceValue(null); setCurrentEvent(null); setStageUpInfo(null)
  }

  if (screen === 'start') return <StartScreen onStart={handleStart} />
  if (screen === 'end') return <EndScreen players={players} onRestart={handleRestart} />

  const currentPlayer = players[currentPlayerIdx]

  return (
    <div className="game-root">
      <div className="scanlines" />
      <div className="game-layout">
        <GameBoard players={players} currentPlayerIdx={currentPlayerIdx} />
      </div>

      <div className="bottom-bar">
        {/* Left: active player stats */}
        <div className="bottom-active">
          <div className="ba-header">
            <span className="ba-sym" style={{ color: PLAYER_COLORS[currentPlayerIdx] }}>{PLAYER_SYMBOLS[currentPlayerIdx]}</span>
            <div className="ba-identity">
              <span className="ba-name">{currentPlayer.name}</span>
              <span className="ba-stage">{currentPlayer.stage} · Age {currentPlayer.age} · Turn {turnNumber}</span>
            </div>
          </div>
          <div className="ba-stats">
            <span className="ba-stat"><span className="ba-stat-lbl">GPA</span>{currentPlayer.gpa.toFixed(2)}</span>
            <span className="ba-stat"><span className="ba-stat-lbl">$</span>{currentPlayer.money >= 0 ? '+' : ''}{(currentPlayer.money / 1000).toFixed(1)}K</span>
            <span className="ba-stat"><span className="ba-stat-lbl">MH</span>{currentPlayer.mental_health}</span>
            <span className="ba-stat"><span className="ba-stat-lbl">CLT</span>{currentPlayer.clout}</span>
          </div>
          <div className="ba-progress">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className={`ba-dot ${i < currentPlayer.turnsInStage ? 'ba-dot-filled' : ''}`}
                style={i < currentPlayer.turnsInStage ? { background: PLAYER_COLORS[currentPlayerIdx] } : {}} />
            ))}
          </div>
        </div>

        {/* Center: roll button */}
        <button
          className={`roll-btn ${phase !== 'idle' ? 'roll-btn-disabled' : ''}`}
          onClick={handleRoll}
          disabled={phase !== 'idle'}
        >
          {phase === 'loading' ? '[ GENERATING FATE... ]' : '[ ROLL DICE ]'}
        </button>

        {/* Right: all players mini-cards */}
        <div className="bottom-players">
          {players.map((p, i) => (
            <div key={i} className={`bp-card ${i === currentPlayerIdx ? 'bp-active' : ''}`}
              style={{ '--pc': PLAYER_COLORS[i] }}>
              <span className="bp-sym" style={{ color: PLAYER_COLORS[i] }}>{PLAYER_SYMBOLS[i]}</span>
              <div className="bp-info">
                <span className="bp-name">{p.name}</span>
                <span className="bp-stage">{p.stage}</span>
              </div>
              <span className="bp-score" style={{ color: PLAYER_COLORS[i] }}>{calcLifeScore(p)}</span>
            </div>
          ))}
        </div>
        <button className="fs-btn" onClick={toggleFullscreen} title="Toggle fullscreen">
          {isFullscreen ? '⊡' : '⛶'}
        </button>
      </div>

      {phase === 'rolling' && <DiceRollScreen finalValue={diceValue} onComplete={handleDiceComplete} />}
      {phase === 'event' && currentEvent && (
        <EventCard event={currentEvent} playerName={currentPlayer.name} playerIdx={currentPlayerIdx} onDismiss={handleDismissEvent} />
      )}
      {stageUpInfo && <StageUpOverlay info={stageUpInfo} />}
    </div>
  )
}
