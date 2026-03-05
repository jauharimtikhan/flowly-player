import { cn } from '@/lib/utils'
import { ListMusic, Play, Sliders } from 'lucide-react'
import React from 'react'

interface TabInerface {
  tab: string
  setTab: any
  playlist: Record<string, any>
}

const Tabs = ({ tab, setTab, playlist }: TabInerface) => {
  return (
    <div className="tabbar">
      <button className={cn('tab', tab === 'player' && 'active')} onClick={() => setTab('player')}>
        <div className="flex flex-row justify-center items-center gap-x-2">
          <Play size={14} />
          <span>Player</span>
        </div>
      </button>
      <button className={cn('tab', tab === 'playlist' && 'active')} onClick={() => setTab('playlist')}>
        <div className="flex items-center gap-x-2 flex-row justify-center">
          <ListMusic size={14} />
          <span>Playlist</span>
          <span className="badge">{playlist.length}</span>
        </div>
      </button>
      <button className={cn('tab', tab === 'equalizer' && 'active')} onClick={() => setTab('equalizer')}>
        <div className="flex items-center gap-x-2 flex-row justify-center">
          <Sliders size={14} />
          <span>Equalizer</span>
        </div>
      </button>
    </div>
  )
}

export default Tabs
