<div align="center">

<img src="resources/build/icon.png" width="96" height="96" alt="Flowly Player Logo" />

# Flowly Player

**A music streaming desktop application for Windows, powered by YouTube.**

[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%2F%2011-blue?style=flat-square&logo=windows)](https://github.com/flowlyplayer)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-e8ff47?style=flat-square&labelColor=09090e)](https://github.com/flowlyplayer/releases)
[![API](https://img.shields.io/badge/YouTube%20Data%20API-v3-red?style=flat-square&logo=youtube)](https://developers.google.com/youtube/v3)
[![Built with Electron](https://img.shields.io/badge/built%20with-Electron-47848f?style=flat-square&logo=electron)](https://www.electronjs.org/)

[Download](https://flowlyplayer.jtech.my.id/#download) · [Privacy Policy](https://flowlyplayer.app/privacy) · [Terms of Service](https://flowlyplayer.app/terms) · [Report a Bug](mailto:support@flowlyplayer.app)

---

</div>

## What is Flowly Player?

Flowly Player is a free, lightweight Windows desktop application that turns YouTube into a dedicated music streaming experience. Instead of opening a browser, managing tabs, or dealing with video autoplay, Flowly gives you a clean, purpose-built music player interface — search a song, click play, and just listen.

It is built with [Electron](https://www.electronjs.org/) and uses the [YouTube Data API v3](https://developers.google.com/youtube/v3) to search for music and retrieve track metadata, while streaming audio through YouTube's official IFrame Player API. All playback goes through YouTube's official infrastructure — Flowly does not download, extract, or store any audio content.

> **Flowly Player is not affiliated with, endorsed by, or sponsored by YouTube or Google LLC.**

---

## Why Flowly?

Most people listen to music on YouTube not because they want to watch videos — but because YouTube has everything. Every song, every artist, every obscure live recording or rare remix. The problem is that YouTube's web interface is built for video, not for focused music listening.

Flowly Player solves this by layering a music-first experience on top of YouTube's massive catalog:

- **No browser tabs.** Flowly lives in your taskbar and system tray like a native music app.
- **No video distractions.** The interface is focused entirely on the listening experience.
- **No subscriptions.** Flowly is and will always be free to download and use.
- **No account required** for basic usage. Sign in with Google to unlock personalized features.
- **No bloatware.** The installer is under 50MB and the app has minimal RAM usage.

---

## Core Features

### 🔍 Music Search

Search any song, artist, album, or playlist directly from the app. Results are pulled from YouTube's public catalog in real-time via the YouTube Data API v3, complete with thumbnails, track duration, and channel information. Results appear instantly as you type.

### 🎵 Seamless Music Playback

Music streams through YouTube's official IFrame Player API, embedded inside the Flowly interface. You get the same audio quality as YouTube — no re-encoding, no quality loss, no third-party streams. Because it uses YouTube's own player, content is delivered reliably and compliantly.

### 📋 Playlist Management

Build and manage personal playlists entirely within Flowly. Add tracks to a queue, reorder songs via drag-and-drop, remove entries, and save named playlists for later. All playlist data is stored locally on your device in encrypted JSON files — nothing is sent to Flowly's servers.

### ❤️ Favorites & Library

Mark any track as a favorite with one click. Your library of saved songs persists across sessions and is accessible from the sidebar. Library data is stored locally and does not require a cloud account.

### 🖥️ System Tray & Background Mode

Minimize Flowly to the Windows system tray and continue listening without keeping a window open. The tray icon shows the currently playing track and provides quick controls for play/pause and skip. Flowly supports Windows media keys (⏯ ⏭ ⏮) so you can control playback from your keyboard without switching apps.

### 🔐 Google Sign-In (Optional)

Sign in with your Google account via OAuth 2.0 to unlock higher API quota limits. Flowly requests only the `youtube.readonly` scope — the minimum needed to search for music and retrieve metadata. Flowly cannot modify your YouTube account, playlists, subscriptions, or any other data. You can revoke access at any time from your Google Account settings.

---

## Tech Stack

| Layer                  | Technology                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------- |
| **Runtime**            | [Electron](https://www.electronjs.org/) (Node.js + Chromium)                            |
| **Frontend**           | HTML, CSS, Vanilla JavaScript                                                           |
| **Music Data**         | [YouTube Data API v3](https://developers.google.com/youtube/v3)                         |
| **Playback**           | [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference) |
| **Authentication**     | [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)             |
| **Credential Storage** | Windows Credential Manager (DPAPI)                                                      |
| **Local Data**         | Encrypted JSON via Electron's app data directory                                        |
| **Packaging**          | [electron-builder](https://www.electron.build/)                                         |

---

## How It Works

Flowly Player operates as a thin orchestration layer between the user and YouTube's APIs. Here is the full data flow:

```
User types a search query
        │
        ▼
Flowly sends request to YouTube Data API v3 (search.list)
        │
        ▼
YouTube returns: video IDs, titles, thumbnails, duration, channel names
        │
        ▼
Flowly renders results in the search panel
        │
        ▼
User selects a track
        │
        ▼
Flowly passes the video ID to the embedded YouTube IFrame Player
        │
        ▼
YouTube streams the audio/video directly from its CDN to the user
        │
        ▼
Flowly displays playback controls, progress, and metadata
```

At no point does Flowly intercept, cache, re-serve, or modify the audio stream. The audio goes directly from YouTube's servers to the user's device.

---

## Privacy & Data Handling

Flowly Player is designed to be privacy-first. Here is a plain-language summary of what happens with your data:

| Data                  | Where It Goes                              | Stored By              |
| --------------------- | ------------------------------------------ | ---------------------- |
| Search queries        | YouTube Data API (to retrieve results)     | Not stored by Flowly   |
| OAuth tokens          | Windows Credential Manager (encrypted)     | Your local device only |
| Playlists & favorites | `%APPDATA%\FlowlyPlayer\`                  | Your local device only |
| Crash reports         | Anonymized, sent to Flowly's error tracker | Deleted after 90 days  |
| Listening history     | Nowhere                                    | Not collected          |
| Personal profile data | Not accessed beyond login session          | Not collected          |

Flowly does **not** sell, share, or monetize any user data. For the complete policy, see [Privacy Policy](https://flowlyplayer.app/privacy).

---

## YouTube API Compliance

Flowly Player is built in full compliance with the [YouTube API Services Terms of Service](https://developers.google.com/youtube/terms/api-services-terms-of-service).

Key compliance points:

- **Official playback only.** All music is streamed via YouTube's IFrame Player API — never through direct URL extraction or third-party streams.
- **No downloading.** Flowly does not provide any mechanism to download, record, or create offline copies of YouTube content.
- **Minimum scope.** Only the `youtube.readonly` OAuth scope is requested. No write operations are ever performed on a user's YouTube account.
- **Quota management.** Flowly implements client-side caching and request throttling to stay within responsible API quota limits.
- **Attribution.** All content is attributed to its YouTube source. Video IDs and source URLs are preserved throughout the application.

By using Flowly Player, users also agree to be bound by the [YouTube Terms of Service](https://www.youtube.com/t/terms) and [Google Privacy Policy](https://policies.google.com/privacy).

---

## System Requirements

| Requirement  | Minimum              | Recommended                    |
| ------------ | -------------------- | ------------------------------ |
| **OS**       | Windows 10 (64-bit)  | Windows 11 (64-bit)            |
| **RAM**      | 256 MB available     | 512 MB available               |
| **Storage**  | 120 MB               | 250 MB                         |
| **Internet** | Required (streaming) | Stable broadband               |
| **Account**  | None (guest mode)    | Google Account (full features) |

---

## Branding & Design

Flowly Player uses a custom dark color palette designed for extended listening sessions:

| Token       | Value     | Usage                       |
| ----------- | --------- | --------------------------- |
| `--bg`      | `#09090e` | App background              |
| `--surface` | `#0f0f17` | Panels, sidebars            |
| `--card`    | `#13131c` | Track cards, modals         |
| `--accent`  | `#e8ff47` | Primary actions, highlights |
| `--purple`  | `#7c6bff` | Secondary accent            |
| `--teal`    | `#00e5c0` | Status indicators           |
| `--text`    | `#eeeeff` | Primary text                |
| `--muted`   | `#50506a` | Secondary text, labels      |

Typography is set in [Syne](https://fonts.google.com/specimen/Syne) for headings and [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) for body text.

---

## License

Flowly Player is released under the [MIT License](LICENSE).

```
MIT License

Copyright (c) 2025 Flowly Player

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software, and to
permit persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
```

---

## Legal

- [Privacy Policy](https://flowlyplayer.jtech.my.id/privacy.php)
- [Terms of Service](https://flowlyplayer.jtech.my.id/terms.php)
- Flowly Player is not affiliated with YouTube or Google LLC.
- "YouTube" and "Google" are registered trademarks of Google LLC.
- Music content accessed through Flowly Player is subject to YouTube's Terms of Service and respective copyright holders.

---

<div align="center">

Made with ♪ by the Flowly Player team · [flowlyplayer.app](https://flowlyplayer.jtech.my.id)

</div>
