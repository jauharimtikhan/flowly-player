import { cn } from '@/lib/utils'
import { User } from 'lucide-react'
import { useState } from 'react'

export default function Avatar({
  src,
  alt,
  fallback,
  className,
}: {
  src?: string
  alt?: string
  fallback?: string
  className?: string
}) {
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const showFallback = error || !src

  return (
    <div
      className={cn('relative overflow-hidden rounded-full bg-gray-700 flex items-center justify-center', className)}
    >
      {!showFallback && (
        <img
          src={src}
          alt={alt || 'Avatar'}
          className={cn('w-full h-full object-cover', loading && 'opacity-0')}
          onLoad={() => setLoading(false)}
          onError={() => {
            setError(true)
            setLoading(false)
          }}
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
        />
      )}
      {(showFallback || loading) && (
        <div className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-purple-500 to-pink-500">
          {fallback ? (
            <span className="text-white font-semibold text-xs">{fallback.slice(0, 2).toUpperCase()}</span>
          ) : (
            <User size={14} className="text-white" />
          )}
        </div>
      )}
    </div>
  )
}
