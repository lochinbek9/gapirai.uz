/** Natija namunasi: kadr ustida o'zbekcha subtitr. Bu illyustratsiya
 * (namunaviy video kadri + muallif yozgan satr), haqiqiy natija emas --
 * shuning uchun ko'rinadigan "namuna" yozuvi bilan. */
export default function SubtitleFrame({ className = '' }: { className?: string }) {
  return (
    <figure className={className}>
      <div className="relative aspect-video overflow-hidden rounded-[6px] border-[6px] border-metro-plaque bg-metro-plaque outline outline-1 outline-offset-2 outline-metro-brass">
        <img
          src="https://i.ytimg.com/vi/UwMS0J2eTXE/hqdefault.jpg"
          alt=""
          loading="lazy"
          className="h-full w-full object-cover opacity-90"
        />
        <p className="absolute inset-x-4 bottom-4 text-center">
          <span className="box-decoration-clone rounded-[3px] bg-black/80 px-2 py-0.5 text-lg font-semibold leading-relaxed text-white sm:text-xl">
            Qo&apos;rquvni yengish uchun avval uni tan olish kerak.
          </span>
        </p>
      </div>
      <figcaption className="mt-2 text-sm text-metro-muted">
        Namuna kadr. Saytdagi pleyer dublaj bilan birga o&apos;zbekcha subtitrni ham ko&apos;rsatadi.
      </figcaption>
    </figure>
  )
}
