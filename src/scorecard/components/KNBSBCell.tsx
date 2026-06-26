import React from 'react'

// KNBSB scorecard: 40x40 cell split into 4 equal 20x20 quadrants by divider lines.
// Quadrant mapping: Bottom-right=1st, Top-right=2nd, Top-left=3rd, Bottom-left=Home.
// Uses currentColor so lines/circles are visible in both light and dark mode.

function dividers() {
  return (
    <g stroke="currentColor" strokeWidth={0.5} opacity={0.3}>
      <line x1={20} y1={0} x2={20} y2={40} />
      <line x1={0} y1={20} x2={40} y2={20} />
    </g>
  )
}

function baseLine(qx: number, qy: number) {
  const cx = qx + 10
  return <line x1={cx} y1={qy + 4} x2={cx} y2={qy + 16} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
}

const BR = { qx: 20, qy: 20 } // 1st base
const TR = { qx: 20, qy: 0  } // 2nd base
const TL = { qx: 0,  qy: 0  } // 3rd base
const BL = { qx: 0,  qy: 20 } // home plate

function bases(reached: Array<{ qx: number; qy: number }>) {
  return reached.map((q, i) => <React.Fragment key={i}>{baseLine(q.qx, q.qy)}</React.Fragment>)
}

function centerText(text: string, size = 9) {
  return (
    <text x={20} y={23} textAnchor="middle" fontSize={size} fontWeight="bold"
      fill="currentColor" fontFamily="monospace">
      {text}
    </text>
  )
}

function outCircle(r = 12) {
  return <circle cx={20} cy={20} r={r} fill="none" stroke="currentColor" strokeWidth={1.5} />
}

function scoredDot() {
  return <circle cx={20} cy={20} r={3} fill="currentColor" />
}

interface Props {
  result: string | undefined
  scoredInInning?: boolean
  size?: number
}

export function KNBSBCell({ result, scoredInInning = false, size = 40 }: Props) {
  let content: React.ReactNode

  switch (result) {
    case '1B':
      content = bases([BR]); break
    case '2B':
      content = bases([BR, TR]); break
    case '3B':
      content = bases([BR, TR, TL]); break
    case 'HR':
      content = bases([BR, TR, TL, BL]); break
    case 'BB':
      content = bases([BR]); break
    case 'HBP':
      content = <>{bases([BR])}{centerText('HP', 7)}</>; break
    case 'ROE':
      content = <>{bases([BR])}{centerText('E', 8)}</>; break
    case 'FC':
      content = <>{bases([BR])}{centerText('FC', 7)}</>; break
    case 'SAC':
      content = <>{bases([BR])}{centerText('S', 8)}</>; break
    case 'SF':
      content = centerText('SF', 8); break
    case 'K':
      content = <>{outCircle()}{centerText('K', 13)}</>; break
    case 'KL':
      content = <>{outCircle()}{centerText('KL', 10)}</>; break
    case 'FO':
      content = <>{outCircle()}{centerText('FO', 9)}</>; break
    case 'GO':
      content = <>{outCircle()}{centerText('GO', 9)}</>; break
    case 'GDP':
      content = <>{outCircle(12)}{outCircle(7)}{centerText('DP', 8)}</>; break
    default:
      content = result ? centerText(result.slice(0, 3), 7) : null; break
  }

  return (
    <svg
      width={size} height={size} viewBox="0 0 40 40"
      aria-label={result ?? 'empty'}
      className="text-gray-800 dark:text-gray-100"
    >
      {dividers()}
      {content}
      {scoredInInning && scoredDot()}
    </svg>
  )
}
