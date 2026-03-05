import React from 'react'
import { Power, RotateCcw, Sliders } from 'lucide-react'
import BandSlider from './band-slider'
import EqualizerVisualizer from './eq-visualizer'
import { cn, EqualizerBand, EqualizerPreset } from '@/lib/utils'
import AudioEngine from '@/lib/AudioEngine'

/* ================= PROPS ================= */

interface EqualizerPageProps {
  tab: string

  eqEnabled: boolean
  toggleEQ: () => void

  resetEqualizer: () => void

  audioEngineRef: React.RefObject<AudioEngine | null>

  isPlaying: boolean

  activePreset: string

  EQUALIZER_PRESETS: EqualizerPreset[]

  applyPreset: (preset: EqualizerPreset) => void

  eqBands: EqualizerBand[]

  updateBand: (index: number, gain: number) => void
}

/* ================= COMPONENT ================= */

const EqualizerPage: React.FC<EqualizerPageProps> = ({
  tab,
  eqEnabled,
  toggleEQ,
  resetEqualizer,
  audioEngineRef,
  isPlaying,
  activePreset,
  EQUALIZER_PRESETS,
  applyPreset,
  eqBands,
  updateBand,
}) => {
  return (
    <div className={cn('page', tab === 'equalizer' && 'active')}>
      <div className="scroll overflow-auto max-h-150" style={{ scrollbarWidth: 'none' }}>
        {/* ================= HEADER ================= */}

        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <div className="flex items-center gap-2">
            <Sliders size={18} className="text-purple-400" />
            <h2 className="text-base font-bold">Equalizer</h2>
            <span className="text-[10px] text-gray-500">10-Band</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleEQ}
              className={cn(
                'rounded-full text-[10px] font-semibold flex items-center gap-1 transition-all',
                eqEnabled ? 'bg-purple-500 text-white' : 'bg-gray-700 text-gray-400'
              )}
              style={{
                paddingTop: 4,
                paddingBottom: 4,
                paddingRight: 10,
                paddingLeft: 10,
              }}
            >
              <Power size={10} />
              {eqEnabled ? 'ON' : 'OFF'}
            </button>

            <button
              onClick={resetEqualizer}
              style={{ padding: 6 }}
              className=" rounded bg-gray-800 hover:bg-gray-700 text-gray-400"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        {/* ================= VISUALIZER ================= */}

        <div
          className="bg-linear-to-b from-gray-800/50 to-gray-900/50 rounded-xl border border-gray-700/50"
          style={{ marginBottom: 12, padding: 12 }}
        >
          <EqualizerVisualizer audioEngine={audioEngineRef.current} isPlaying={isPlaying && eqEnabled} />

          <div style={{ marginTop: 6 }} className="text-center  text-[10px] text-gray-500">
            {isPlaying ? '🎵 Playing' : '⏸ Paused'} • {activePreset}
          </div>
        </div>

        {/* ================= PRESETS ================= */}

        <div style={{ marginBottom: 12 }}>
          <div className="text-xs font-semibold text-gray-300" style={{ marginBottom: 6 }}>
            Presets
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {EQUALIZER_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => applyPreset(preset)}
                disabled={!eqEnabled}
                style={{ padding: 6 }}
                className={cn(
                  ' rounded-lg text-[10px] font-medium transition-all border',
                  activePreset === preset.name
                    ? 'bg-purple-500/20 border-purple-500 text-purple-300'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700',
                  !eqEnabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                <div className="text-sm">{preset.icon}</div>
                <div className="truncate">{preset.name}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ================= BAND SLIDERS ================= */}

        <div
          style={{ padding: 12 }}
          className={cn('bg-gray-800/50 rounded-xl border border-gray-700/50', !eqEnabled && 'opacity-50')}
        >
          <div className="text-xs font-semibold text-gray-300" style={{ marginBottom: 8 }}>
            Frequency Bands
          </div>

          <div className="flex justify-between items-end">
            {eqBands.map((band, i) => (
              <BandSlider key={band.frequency} band={band} onChange={(val) => updateBand(i, val)} enabled={eqEnabled} />
            ))}
          </div>

          <div className="flex justify-between text-[9px] text-gray-500" style={{ marginTop: 8 }}>
            <span>Bass</span>
            <span>Mids</span>
            <span>Treble</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default EqualizerPage
