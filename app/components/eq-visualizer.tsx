import AudioEngine from '@/lib/AudioEngine'
import { useEffect, useRef } from 'react'

export default function EqualizerVisualizer({
  audioEngine,
  isPlaying,
}: {
  audioEngine: AudioEngine | null
  isPlaying: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !audioEngine) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const frequencyData = audioEngine.getFrequencyData()
      const width = canvas.width
      const height = canvas.height

      ctx.clearRect(0, 0, width, height)

      const barCount = 32
      const barWidth = width / barCount - 2

      for (let i = 0; i < barCount; i++) {
        const dataIndex = Math.floor((i * frequencyData.length) / barCount)
        const value = isPlaying ? frequencyData[dataIndex] || 0 : 10 + Math.random() * 5
        const barHeight = isPlaying ? (value / 255) * height * 0.9 + 5 : value
        const x = i * (barWidth + 2)
        const hue = 280 + (i / barCount) * 60

        const gradient = ctx.createLinearGradient(x, height, x, height - barHeight)
        gradient.addColorStop(0, `hsl(${hue}, 80%, 50%)`)
        gradient.addColorStop(1, `hsl(${hue}, 80%, 70%)`)

        ctx.fillStyle = gradient
        ctx.fillRect(x, height - barHeight, barWidth, barHeight)

        if (isPlaying) {
          ctx.shadowColor = `hsl(${hue}, 80%, 50%)`
          ctx.shadowBlur = 10
        }
      }

      if (isPlaying) {
        animationRef.current = requestAnimationFrame(draw)
      }
    }

    draw()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [audioEngine, isPlaying])

  return <canvas ref={canvasRef} width={380} height={80} className="w-full h-20 rounded-lg" />
}
