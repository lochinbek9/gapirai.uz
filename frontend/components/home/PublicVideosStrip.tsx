'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listPublicVideos, type PublicVideo } from '@/lib/api'

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
    <section aria-labelledby="public-title" className="mx-auto max-w-6xl px-4 pt-24 sm:px-6">
      <div className="flex items-end justify-between gap-4">
        <h2 id="public-title" className="text-3xl font-semibold tracking-[-0.03em] text-ui-ink sm:text-4xl">Oʻzbekchaga oʻgirilgan videolar</h2>
        <Link href="/videos" className="hidden text-sm font-medium text-ui-accent-ink hover:underline sm:inline">Barchasi</Link>
      </div>
      <ul className="mt-8 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {videos.map((v) => (
          <li key={v.id}>
            <Link href={`/video/${v.id}`} className="group block rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-accent">
              <div className="aspect-video overflow-hidden rounded-xl bg-ui-ground">
                {v.video_thumbnail && (
                  <img src={v.video_thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                )}
              </div>
              <h3 className="mt-3 line-clamp-2 text-base font-medium leading-snug text-ui-ink">{v.video_title || 'Nomsiz video'}</h3>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
