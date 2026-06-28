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

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-x-auto mb-5">
      <table className="border-collapse w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 dark:border-gray-700">
            <th className="text-left px-4 py-2 text-gray-400 font-medium min-w-[100px]">
              {t('scorecardView.linescore')}
            </th>
            {innings.map(n => (
              <th key={n} className="text-center px-1.5 py-2 text-gray-400 font-medium min-w-[28px]">{n}</th>
            ))}
            <th className="text-center px-2 py-2 text-gray-700 dark:text-gray-300 font-semibold border-l border-gray-100 dark:border-gray-700 min-w-[28px]">R</th>
            <th className="text-center px-2 py-2 text-gray-400 font-medium min-w-[28px]">H</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-gray-50 dark:border-gray-800">
            <td className="px-4 py-2.5 font-medium text-gray-700 dark:text-gray-300 truncate max-w-[100px]">{awayName}</td>
            {innings.map(n => {
              const val = linescore.get(n)?.top ?? 0
              return (
                <td key={n} className="text-center px-1.5 py-2.5 text-gray-600 dark:text-gray-400 tabular-nums">
                  {val > 0 ? val : <span className="text-gray-300">·</span>}
                </td>
              )
            })}
            <td className={`text-center px-2 py-2.5 font-bold tabular-nums border-l border-gray-100 dark:border-gray-700 ${awayTotal > homeTotal ? 'text-brand-600 dark:text-brand-100' : 'text-gray-700 dark:text-gray-300'}`}>
              {awayTotal}
            </td>
            <td className="text-center px-2 py-2.5 text-gray-500 tabular-nums">{awayHits}</td>
          </tr>
          <tr>
            <td className="px-4 py-2.5 font-medium text-gray-700 dark:text-gray-300 truncate max-w-[100px]">{homeName}</td>
            {innings.map(n => {
              const val = linescore.get(n)?.bottom ?? 0
              return (
                <td key={n} className="text-center px-1.5 py-2.5 text-gray-600 dark:text-gray-400 tabular-nums">
                  {val > 0 ? val : <span className="text-gray-300">·</span>}
                </td>
              )
            })}
            <td className={`text-center px-2 py-2.5 font-bold tabular-nums border-l border-gray-100 dark:border-gray-700 ${homeTotal > awayTotal ? 'text-brand-600 dark:text-brand-100' : 'text-gray-700 dark:text-gray-300'}`}>
              {homeTotal}
            </td>
            <td className="text-center px-2 py-2.5 text-gray-500 tabular-nums">{homeHits}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
