import { FREQUENCIES } from './utils'

export default class AudioEngine {
  private audioContext: AudioContext | null = null
  private audioElement: HTMLAudioElement | null = null
  private sourceNode: MediaElementAudioSourceNode | null = null
  private gainNode: GainNode | null = null
  private analyserNode: AnalyserNode | null = null
  private filters: BiquadFilterNode[] = []
  private isInitialized = false
  private eventCallbacks: { [key: string]: (() => void)[] } = {}

  constructor() {
    this.eventCallbacks = {
      timeupdate: [],
      ended: [],
      play: [],
      pause: [],
      error: [],
      canplay: [],
      loadedmetadata: [],
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    this.audioContext = new AudioContext()
    this.audioElement = new Audio()
    this.audioElement.crossOrigin = 'anonymous'
    this.audioElement.preload = 'auto'

    // Bind event handlers
    this.audioElement.addEventListener('timeupdate', () => this.emit('timeupdate'))
    this.audioElement.addEventListener('ended', () => this.emit('ended'))
    this.audioElement.addEventListener('play', () => this.emit('play'))
    this.audioElement.addEventListener('pause', () => this.emit('pause'))
    this.audioElement.addEventListener('error', () => this.emit('error'))
    this.audioElement.addEventListener('canplay', () => this.emit('canplay'))
    this.audioElement.addEventListener('loadedmetadata', () => this.emit('loadedmetadata'))

    this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement)
    this.gainNode = this.audioContext.createGain()
    this.analyserNode = this.audioContext.createAnalyser()
    this.analyserNode.fftSize = 256

    // Create EQ filters
    this.filters = FREQUENCIES.map((freq) => {
      const filter = this.audioContext!.createBiquadFilter()
      filter.type = 'peaking'
      filter.frequency.value = freq
      filter.Q.value = 1.4
      filter.gain.value = 0
      return filter
    })

    // Connect chain
    let lastNode: AudioNode = this.sourceNode
    for (const filter of this.filters) {
      lastNode.connect(filter)
      lastNode = filter
    }
    lastNode.connect(this.gainNode)
    this.gainNode.connect(this.analyserNode)
    this.analyserNode.connect(this.audioContext.destination)

    this.isInitialized = true
  }

  private emit(event: string): void {
    const callbacks = this.eventCallbacks[event] || []
    callbacks.forEach((cb) => cb())
  }

  on(event: string, callback: () => void): void {
    if (!this.eventCallbacks[event]) {
      this.eventCallbacks[event] = []
    }
    this.eventCallbacks[event].push(callback)
  }

  off(event: string, callback: () => void): void {
    if (!this.eventCallbacks[event]) return
    this.eventCallbacks[event] = this.eventCallbacks[event].filter((cb) => cb !== callback)
  }

  clearAllListeners(): void {
    Object.keys(this.eventCallbacks).forEach((key) => {
      this.eventCallbacks[key] = []
    })
  }

  async loadAndPlay(url: string): Promise<void> {
    await this.initialize()

    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume()
    }

    if (this.audioElement) {
      this.audioElement.src = url
      this.audioElement.load()
      await this.audioElement.play()
    }
  }

  play(): void {
    this.audioElement?.play()
  }

  pause(): void {
    this.audioElement?.pause()
  }

  stop(): void {
    if (this.audioElement) {
      this.audioElement.pause()
      this.audioElement.currentTime = 0
      this.audioElement.src = ''
    }
  }

  setVolume(volume: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = volume / 100
    }
    if (this.audioElement) {
      this.audioElement.volume = volume / 100
    }
  }

  mute(): void {
    if (this.audioElement) {
      this.audioElement.muted = true
    }
  }

  unmute(): void {
    if (this.audioElement) {
      this.audioElement.muted = false
    }
  }

  get isMuted(): boolean {
    return this.audioElement?.muted ?? false
  }

  seekTo(time: number): void {
    if (this.audioElement) {
      this.audioElement.currentTime = time
    }
  }

  seekToPercent(percent: number): void {
    if (this.audioElement && this.audioElement.duration) {
      this.audioElement.currentTime = (percent / 100) * this.audioElement.duration
    }
  }

  get currentTime(): number {
    return this.audioElement?.currentTime ?? 0
  }

  get duration(): number {
    return this.audioElement?.duration ?? 0
  }

  get isPlaying(): boolean {
    return this.audioElement ? !this.audioElement.paused : false
  }

  setEQBand(index: number, gain: number): void {
    if (this.filters[index]) {
      this.filters[index].gain.value = gain
    }
  }

  setAllEQBands(gains: number[]): void {
    gains.forEach((gain, index) => {
      if (this.filters[index]) {
        this.filters[index].gain.value = gain
      }
    })
  }

  resetEQ(): void {
    this.filters.forEach((filter) => {
      filter.gain.value = 0
    })
  }

  getFrequencyData(): Uint8Array {
    if (!this.analyserNode) return new Uint8Array(0)
    const data = new Uint8Array(this.analyserNode.frequencyBinCount)
    this.analyserNode.getByteFrequencyData(data)
    return data
  }

  destroy(): void {
    this.stop()
    this.clearAllListeners()
    this.audioContext?.close()
    this.audioContext = null
    this.audioElement = null
    this.sourceNode = null
    this.gainNode = null
    this.analyserNode = null
    this.filters = []
    this.isInitialized = false
  }
}
