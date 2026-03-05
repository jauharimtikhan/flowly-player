import React from 'react'
import Avatar from './avatar'
import { LogOut, Minus, X } from 'lucide-react'

const TitleBar = ({ youtubeAuth, handleLogout, eAPI }: { youtubeAuth: any; handleLogout: any; eAPI: any }) => {
  return (
    <div className="titlebar">
      <div className="tb-left">
        <div className="tb-name">
          Flow<span style={{ marginRight: 6 }}>ly</span>
        </div>
        {youtubeAuth && (
          <div className="flex items-center gap-2 ml-3">
            <Avatar src={youtubeAuth.userAvatar} fallback={youtubeAuth.userName} className="w-5 h-5" />
            <span className="text-[10px] text-gray-400 max-w-17.5 truncate">{youtubeAuth.userName}</span>
            <button
              onClick={handleLogout}
              className="text-red-400 hover:text-red-300 p-0.5 tb-no-drag hover:cursor-pointer"
              title="Logout"
            >
              <LogOut size={12} />
            </button>
          </div>
        )}
      </div>
      <div className="tb-btns">
        <button className="tb-btn" onClick={eAPI.minimizeToTray}>
          <Minus size={12} />
        </button>
        <button className="tb-btn x" onClick={eAPI.closeToTray}>
          <X size={12} />
        </button>
      </div>
    </div>
  )
}

export default TitleBar
