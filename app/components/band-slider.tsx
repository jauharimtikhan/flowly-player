import { cn, EqualizerBand } from '@/lib/utils'

export default function BandSlider({
  band,
  onChange,
  enabled,
}: {
  band: EqualizerBand
  onChange: (value: number) => void
  enabled: boolean
}) {
  const percentage = ((band.gain + 12) / 24) * 100

  return (
    <div className="flex flex-col items-center gap-1">
      <span className={cn('text-[10px] font-mono', enabled ? 'text-gray-300' : 'text-gray-600')}>
        {band.gain > 0 ? '+' : ''}
        {band.gain}
      </span>
      <div className="relative h-28 w-5 flex items-center justify-center">
        <div
          className={cn('absolute h-full w-1 rounded-full overflow-hidden', enabled ? 'bg-gray-700' : 'bg-gray-800')}
        >
          <div
            className={cn(
              'absolute bottom-0 w-full rounded-full transition-all',
              enabled ? 'bg-linear-to-t from-purple-500 to-pink-500' : 'bg-gray-600'
            )}
            style={{ height: `${percentage}%` }}
          />
        </div>
        <input
          type="range"
          min={-12}
          max={12}
          step={1}
          value={band.gain}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={!enabled}
          className="absolute h-full w-5 opacity-0 cursor-pointer disabled:cursor-not-allowed"
          style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
        />
        <div
          className={cn(
            'absolute w-3 h-3 rounded-full shadow-lg pointer-events-none transition-all',
            enabled ? 'bg-white border-2 border-purple-500' : 'bg-gray-500 border-2 border-gray-600'
          )}
          style={{ bottom: `calc(${percentage}% - 6px)` }}
        />
      </div>
      <span className={cn('text-[9px] font-medium', enabled ? 'text-gray-400' : 'text-gray-600')}>{band.label}</span>
    </div>
  )
}
