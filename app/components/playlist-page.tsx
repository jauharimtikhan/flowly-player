import React, { KeyboardEvent } from 'react'
import { cn, SearchResult, Track, YouTubeAuth, YouTubePlaylist } from '@/lib/utils'
import { ListMusic, Loader2, Music, Play, Plus, Search, Shuffle, Trash2 } from 'lucide-react'

interface PlaylistPageProps {
  tab: string
  youtubeAuth: YouTubeAuth | null
  userPlaylists: YouTubePlaylist[]
  playlist: Track[]
  curIdx: number
  isPlaying: boolean
  ytdlpStatus: { installed: boolean; downloading: boolean; error?: string }

  /* ===== moved states ===== */
  searchQuery: string
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>

  searchResults: SearchResult[]
  setSearchResults: React.Dispatch<React.SetStateAction<SearchResult[]>>

  isSearching: boolean
  setIsSearching: React.Dispatch<React.SetStateAction<boolean>>

  isLoadingMore: boolean
  setIsLoadingMore: React.Dispatch<React.SetStateAction<boolean>>

  plUrl: string
  setPlUrl: React.Dispatch<React.SetStateAction<string>>

  searchContainerRef: React.RefObject<HTMLDivElement | null>

  /* ===== actions ===== */

  searchYouTube: (query: string) => Promise<void>
  addSearchResultToPlaylist: (result: SearchResult) => void
  loadPlaylistItems: (playlistId: string) => void
  plAdd: (value: string) => void
  plPlayAll: () => void
  plShuffleAll: () => void
  plClear: () => void
  playAt: (index: number) => void
  plRemove: (index: number) => void
}

const PlaylistPage: React.FC<PlaylistPageProps> = ({
  tab,
  youtubeAuth,
  userPlaylists,
  playlist,
  curIdx,
  isPlaying,
  ytdlpStatus,

  searchQuery,
  setSearchQuery,
  searchResults,
  setSearchResults,
  isSearching,
  setIsSearching,
  isLoadingMore,
  plUrl,
  setPlUrl,
  searchContainerRef,

  searchYouTube,
  addSearchResultToPlaylist,
  loadPlaylistItems,
  plAdd,
  plPlayAll,
  plShuffleAll,
  plClear,
  playAt,
  plRemove,
}) => {
  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setIsSearching(true)
    await searchYouTube(searchQuery)
    setIsSearching(false)
  }

  const handleManualAdd = () => {
    if (!plUrl.trim()) return
    plAdd(plUrl)
    setPlUrl('')
  }

  const handleKeyDownSearch = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch()
  }

  const handleKeyDownManual = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleManualAdd()
  }

  return (
    <div className={cn('page', tab === 'playlist' && 'active')}>
      <div
        className="scroll overflow-y-auto max-h-150"
        style={{
          scrollbarWidth: 'none',
        }}
      >
        {youtubeAuth && (
          <div
            className="pl-add-card "
            style={{
              marginBottom: 12,
            }}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <div className="pl-add-title flex items-center gap-2">
                <Search size={14} /> Cari di YouTube
              </div>
              <div>
                {searchResults.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchResults([])
                      setSearchQuery('')
                    }}
                    className="hover:cursor-pointer"
                    title="Bersihkan Hasil Pencarian!"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
              </div>
            </div>

            <div className="pl-add-row">
              <input
                className="pl-url-in"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDownSearch}
                placeholder="Cari video..."
              />

              <button className="pl-add-btn" onClick={handleSearch} disabled={isSearching}>
                {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div
                ref={searchContainerRef}
                className=" max-h-60 overflow-y-auto"
                style={{ scrollbarWidth: 'thin', marginTop: 12 }}
              >
                {searchResults.map((result, i) => (
                  <div
                    key={`${result.id}-${i}`}
                    className="flex items-center gap-2 hover:bg-gray-800 rounded cursor-pointer"
                    style={{
                      padding: 6,
                    }}
                    onClick={() => addSearchResultToPlaylist(result)}
                  >
                    <img src={result.thumb} className="w-14 h-10 object-cover rounded" alt={result.title} />

                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-white truncate">{result.title}</div>
                      <div className="text-[9px] text-gray-400">{result.channel}</div>
                    </div>

                    <Plus size={12} className="text-gray-400" />
                  </div>
                ))}

                {isLoadingMore && (
                  <div
                    className=" text-center flex items-center justify-center"
                    style={{
                      paddingTop: 8,
                      paddingBottom: 8,
                    }}
                  >
                    <Loader2 size={16} className="animate-spin mx-auto" />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {youtubeAuth && userPlaylists.length > 0 && (
          <div
            className="pl-add-card"
            style={{
              marginBottom: 12,
            }}
          >
            <div className="pl-add-title flex items-center gap-2 ">
              <ListMusic size={14} /> Playlist Saya
            </div>

            <div className="grid grid-cols-3 gap-1.5  max-h-40 overflow-y-auto">
              {userPlaylists.map((pl) => (
                <div
                  key={pl.id}
                  className=" bg-gray-800 hover:bg-gray-700 rounded cursor-pointer"
                  onClick={() => loadPlaylistItems(pl.id)}
                  style={{
                    padding: 6,
                  }}
                >
                  <img
                    src={pl.thumbnail}
                    className="w-full h-12 object-cover rounded mb-1"
                    style={{ marginBottom: 4 }}
                    alt={pl.title}
                  />
                  <div className="text-[9px] text-white truncate">{pl.title}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pl-add-card ">
          <div className="pl-add-title">Tambah Manual</div>

          <div className="pl-add-row">
            <input
              className="pl-url-in"
              value={plUrl}
              onChange={(e) => setPlUrl(e.target.value)}
              onKeyDown={handleKeyDownManual}
              placeholder="URL atau ID..."
            />

            <button className="pl-add-btn" onClick={handleManualAdd}>
              <Plus size={14} />
            </button>
          </div>
        </div>

        <div
          className="flex items-center justify-between"
          style={{
            marginBottom: 8,
          }}
        >
          <span className="text-xs text-gray-400">{playlist.length} track</span>

          <div className="flex gap-1">
            <button className="pl-act-btn" onClick={plPlayAll} disabled={!ytdlpStatus.installed}>
              <Play size={14} />
            </button>

            <button className="pl-act-btn" onClick={plShuffleAll} disabled={!ytdlpStatus.installed}>
              <Shuffle size={14} />
            </button>

            <button className="pl-act-btn danger" onClick={plClear}>
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <div className="max-h-52 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {playlist.length === 0 ? (
            <div
              className="text-center text-gray-500"
              style={{
                paddingTop: 32,
              }}
            >
              <Music size={32} className="mx-auto mb-2 opacity-50" />
              <div className="text-sm">Playlist kosong</div>
            </div>
          ) : (
            playlist.map((track, i) => (
              <div
                key={`${track.id}-${i}`}
                className={cn('pl-item', i === curIdx && 'current')}
                onClick={() => playAt(i)}
                style={{
                  marginTop: 8,
                  marginBottom: 8,
                }}
              >
                <div className="pl-num">{i === curIdx ? (isPlaying ? '▶' : '⏸') : i + 1}</div>

                <div className="pl-thumb">
                  <img src={track.thumb} alt={track.title} />
                </div>

                <div className="pl-info">
                  <div className="pl-item-title">{track.title}</div>
                  <div className="pl-item-sub">{track.channel ?? track.id}</div>
                </div>

                <button
                  className="pl-btn del"
                  onClick={(e) => {
                    e.stopPropagation()
                    plRemove(i)
                  }}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default PlaylistPage
