'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listPublicVideos, type PublicVideo } from '@/lib/api'
import { SpineStop } from './Spine'

/** Admin chiqargan haqiqiy dublajlar. Kutubxona bo'sh bo'lsa bo'lim umuman chizilmaydi. */
export default function PublicVideosStrip() {
  const [videos, setVideos] = useState<PublicVideo[]>([])

  useEffect(() => {
    listPublicVideos(1, 4)
      .then((res) => setVideos(res.videos))
      .catch(() => setVideos([]))
  }, [])

  if (videos.length === 0) return null

  return (
    <SpineStop id="ommaviy" title="O'zbekchaga o'girilgan videolar">
      <ul className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {videos.map((v) => (
          <li key={v.id}>
            <Link href={`/video/${v.id}`} className="group block rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metro-blue">
              <div className="aspect-video overflow-hidden rounded-[6px] bg-metro-plaque">
                {v.video_thumbnail && (
                  <img src={v.video_thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                )}
              </div>
              <h3 className="mt-3 line-clamp-2 text-base font-bold leading-snug text-metro-ink group-hover:underline">{v.video_title || 'Nomsiz video'}</h3>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/videos" className="m-btn m-btn-ghost mt-8">
        Barcha ommaviy videolar
      </Link>
    </SpineStop>
  )
}
