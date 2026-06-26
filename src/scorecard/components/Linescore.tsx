import { useTranslation } from 'react-i18next'

interface Props {
  awayName: string
  homeName: string
  maxInning: number
  linescore: Map<number, { top: number; bottom: number }>
  awayTotal: number
  homeTotal: number
  awayHits: number
  homeHits: number
}

export function Linescore({ awayName, homeName, maxInning, linescore, awayTotal, homeTotal, awayHits, homeHits }: Props) {
  const { t } = useTranslation()
  const innings = Array.from({ length: maxInning }, (_, i) => i + 1)

  const th = (label: string, key: string) => (
    <th key={key} className="px-1.5 py-1 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 min-w-[28px]">
      {label}
    </th>
  )

  const td = (val: number | string, key: string, bold = false) => (
    <td key={key} className={`px-1.5 py-1 text-center text-sm tabular-nums ${bold ? 'font-bold' : ''}`}>
      {val}
    </td>
  )

  return (
    <div className="overflow-x-auto mb-5">
      <table className="border-collapse w-full">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="px-2 py-1 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 min-w-[100px]">
              {t('scorecardView.linescore')}
            </th>
            {innings.map(n => th(String(n), `h${n}`))}
            <th className="px-1.5 py-1 border-l border-gray-300 dark:border-gray-600">{th('H', 'hH')}</th>
            <th className="px-1.5 py-1 border-l border-gray-300 dark:border-gray-600">{th('R', 'hR')}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-gray-100 dark:border-gray-800">
            <td className="px-2 py-1 text-sm font-medium truncate max-w-[120px]">{awayName}</td>
            {innings.map(n => td(linescore.get(n)?.top ?? 0, `a${n}`))}
            <td className="border-l border-gray-300 dark:border-gray-600">{td(awayHits, 'aH', true)}</td>
            <td className="border-l border-gray-300 dark:border-gray-600">{td(awayTotal, 'aT', true)}</td>
          </tr>
          <tr>
            <td className="px-2 py-1 text-sm font-medium truncate max-w-[120px]">{homeName}</td>
            {innings.map(n => td(linescore.get(n)?.bottom ?? 0, `h${n}`))}
            <td className="border-l border-gray-300 dark:border-gray-600">{td(homeHits, 'hH', true)}</td>
            <td className="border-l border-gray-300 dark:border-gray-600">{td(homeTotal, 'hT', true)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
