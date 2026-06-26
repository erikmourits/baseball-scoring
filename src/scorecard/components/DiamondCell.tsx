import React from 'react'

const HOME   = [20, 36] as const
const FIRST  = [36, 20] as const
const SECOND = [20,  4] as const
const THIRD  = [ 4, 20] as const
const MID    = [20, 20] as const

const GHOST = `M${HOME[0]},${HOME[1]} L${FIRST[0]},${FIRST[1]} L${SECOND[0]},${SECOND[1]} L${THIRD[0]},${THIRD[1]} Z`
const SEG_H1 = `M${HOME[0]},${HOME[1]} L${FIRST[0]},${FIRST[1]}`
const SEG_12 = `M${FIRST[0]},${FIRST[1]} L${SECOND[0]},${SECOND[1]}`
const SEG_23 = `M${SECOND[0]},${SECOND[1]} L${THIRD[0]},${THIRD[1]}`
const SEG_3H = `M${THIRD[0]},${THIRD[1]} L${HOME[0]},${HOME[1]}`

const GREEN  = '#16a34a'
const BLUE   = '#2563eb'
const ORANGE = '#ea580c'
const RED    = '#dc2626'
const AMBER  = '#d97706'
const GRAY   = '#6b7280'

const ghost = <path d={GHOST} fill="none" stroke="#9ca3af" strokeWidth={0.75} strokeDasharray="2 2" />

function seg(paths: string[], color: string, dashed?: boolean) {
  return (
    <path d={paths.join(' ')} fill="none" stroke={color} strokeWidth={2.5}
      strokeLinecap="round" strokeDasharray={dashed ? '3 2' : undefined} />
  )
}

function txt(label: string, color: string, fontSize = 9) {
  return (
    <text x={MID[0]} y={MID[1] + fontSize * 0.35} textAnchor="middle"
      fontSize={fontSize} fontWeight="bold" fill={color} fontFamily="monospace">
      {label}
    </text>
  )
}

function circle(cx: number, cy: number, r: number, color: string) {
  return <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={1.5} />
}

interface Props { result: string | undefined; size?: number }

export function DiamondCell({ result, size = 40 }: Props) {
  let content: React.ReactNode

  switch (result) {
    case '1B':  content = <>{ghost}{seg([SEG_H1], GREEN)}</>; break
    case '2B':  content = <>{ghost}{seg([SEG_H1, SEG_12], GREEN)}</>; break
    case '3B':  content = <>{ghost}{seg([SEG_H1, SEG_12, SEG_23], GREEN)}</>; break
    case 'HR':
      content = <>{ghost}{seg([SEG_H1, SEG_12, SEG_23, SEG_3H], AMBER)}
        <circle cx={MID[0]} cy={MID[1]} r={4} fill={AMBER} /></>; break
    case 'BB':  content = <>{ghost}{seg([SEG_H1], BLUE, true)}</>; break
    case 'HBP':
      content = <>{ghost}{seg([SEG_H1], BLUE, true)}
        <circle cx={HOME[0]} cy={HOME[1]} r={2.5} fill={BLUE} /></>; break
    case 'ROE': content = <>{ghost}{seg([SEG_H1], ORANGE, true)}{txt('E', ORANGE, 8)}</>; break
    case 'FC':  content = <>{ghost}{seg([SEG_H1], ORANGE, true)}{txt('FC', ORANGE, 7)}</>; break
    case 'K':   content = <>{ghost}{txt('K', RED, 13)}</>; break
    case 'KL':  content = <>{ghost}{txt('KL', RED, 10)}</>; break
    case 'FO':  content = <>{ghost}{circle(MID[0], MID[1], 9, RED)}{txt('FO', RED, 8)}</>; break
    case 'GO':  content = <>{ghost}{circle(MID[0], MID[1], 9, RED)}{txt('GO', RED, 8)}</>; break
    case 'GDP':
      content = <>{ghost}{circle(MID[0], MID[1] - 5, 6, RED)}{circle(MID[0], MID[1] + 5, 6, RED)}{txt('DP', RED, 7)}</>; break
    case 'SAC': content = <>{ghost}{seg([SEG_H1], GRAY, true)}{txt('S', GRAY, 8)}</>; break
    case 'SF':  content = <>{ghost}{txt('SF', GRAY, 8)}</>; break
    default:    content = <>{ghost}{result ? txt(result.slice(0, 3), GRAY, 7) : null}</>; break
  }

  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-label={result ?? 'empty'}>
      {content}
    </svg>
  )
}
