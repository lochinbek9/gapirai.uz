// AVTOMATIK yaratilgan: frontend/app/privacy/page.tsx va frontend/app/terms/page.tsx matni
// (sayt bilan so'zma-so'z bir xil bo'lsin). Saytdagi matn o'zgarsa, qayta yarating:
//   python3 <scratch>/legal2ts.py > mobile/src/content/legal.ts

export type Run = { t: string; b?: boolean; href?: string };
export type Block = { p: Run[] } | { list: Run[][] };
export interface LegalDoc {
  title: string;
  lead: string;
  sections: { id: string | null; heading: string; blocks: Block[] }[];
}

export const LEGAL: Record<'privacy' | 'terms', LegalDoc> = {
  "privacy": {
    "title": "Maxfiylik siyosati",
    "lead": "Oxirgi yangilanish: 2026-yil 28-oktabr",
    "sections": [
      {
        "id": null,
        "heading": "1. Biz to'playdigan ma'lumotlar",
        "blocks": [
          {
            "p": [
              {
                "t": "Platformamizdan foydalanganingizda, xizmat ko'rsatish sifatini oshirish maqsadida quyidagi ma'lumotlarni to'playmiz:"
              }
            ]
          },
          {
            "list": [
              [
                {
                  "t": "Siz kiritgan YouTube video manzillari va davomiyligi;"
                }
              ],
              [
                {
                  "t": "Tizimga kirish uchun foydalanadigan login va elektron pochta manzili;"
                }
              ],
              [
                {
                  "t": "To'lov tafsilotlari (to'lovlar bevosita Click to'lov shlyuzi orqali amalga oshiriladi va biz kartangiz ma'lumotlarini saqlamaymiz)."
                }
              ]
            ]
          }
        ]
      },
      {
        "id": null,
        "heading": "2. Ma'lumotlardan foydalanish",
        "blocks": [
          {
            "p": [
              {
                "t": "To'plangan ma'lumotlar faqat quyidagi maqsadlarda ishlatiladi:"
              }
            ]
          },
          {
            "list": [
              [
                {
                  "t": "Dublyaj va tarjima jarayonini amalga oshirish;"
                }
              ],
              [
                {
                  "t": "Hisob-kitoblar va to'lovlarni amalga oshirish hamda tasdiqlash;"
                }
              ],
              [
                {
                  "t": "Texnik muammolarni bartaraf etish va foydalanuvchilarni qo'llab-quvvatlash."
                }
              ]
            ]
          }
        ]
      },
      {
        "id": null,
        "heading": "3. Ma'lumotlar xavfsizligi",
        "blocks": [
          {
            "p": [
              {
                "t": "Biz sizning shaxsiy ma'lumotlaringiz xavfsizligini ta'minlash uchun SSL shifrlash va zamonaviy xavfsizlik protokollaridan foydalanamiz. Biroq, internet orqali ma'lumot uzatishning 100% xavfsizligini kafolatlab bo'lmaydi."
              }
            ]
          }
        ]
      },
      {
        "id": null,
        "heading": "4. Uchinchi shaxslarga ma'lumot uzatish",
        "blocks": [
          {
            "p": [
              {
                "t": "Xizmat ko'rsatish jarayonida matnlarni tarjima qilish uchun OpenAI va nutq sintezi uchun Microsoft Azure xizmatlariga faqatgina videodagi matnli ma'lumotlar uzatiladi. Sizning shaxsiy ma'lumotlaringiz uchinchi shaxslarga sotilmaydi."
              }
            ]
          }
        ]
      },
      {
        "id": "chrome-extension",
        "heading": "5. Chrome kengaytmasi «GapirAI — YouTube oʻzbekcha»",
        "blocks": [
          {
            "p": [
              {
                "t": "Kengaytma faqat YouTube videolarini oʻzbekcha ovoz va subtitr bilan koʻrsatish uchun ishlaydi va quyidagilardan foydalanadi:"
              }
            ]
          },
          {
            "list": [
              [
                {
                  "t": "Kirish maʼlumoti.",
                  "b": true
                },
                {
                  "t": " Brauzeringizda gapirai.uz saytiga kirgan boʻlsangiz, kengaytma saytning kirish cookie'sini (auth_token) oʻqiydi va undan faqat api.gapirai.uz ga soʻrov yuborishda foydalanadi. Parol yoki boshqa maʼlumot oʻqilmaydi."
                }
              ],
              [
                {
                  "t": "Ochilgan YouTube video identifikatori.",
                  "b": true
                },
                {
                  "t": " GapirAI hisobingizga kirgan boʻlsangiz, YouTube video sahifasini ochganingizda shu videoning identifikatori (masalan, dQw4w9WgXcQ) siz uchun tayyor dublaj bor-yoʻqligini tekshirish uchun serverimizga yuboriladi. «Dublaj qilish» tugmasini bossangizgina video havolasi dublaj uchun yuboriladi. Boshqa saytlar yoki YouTube'dagi boshqa faoliyatingiz kuzatilmaydi."
                }
              ],
              [
                {
                  "t": "Sozlamalar.",
                  "b": true
                },
                {
                  "t": " Asl ovoz darajasi, subtitr va ovoz tanlovi faqat brauzeringizning oʻzida (chrome.storage) saqlanadi."
                }
              ]
            ]
          },
          {
            "p": [
              {
                "t": "Kengaytma reklama koʻrsatmaydi, analitika yoki kuzatuv vositalaridan foydalanmaydi, maʼlumotlarni sotmaydi va uchinchi shaxslarga bermaydi. Kengaytma orqali olingan maʼlumotlardan foydalanish Chrome Web Store User Data Policy talablariga, jumladan Limited Use talablariga mos keladi."
              }
            ]
          }
        ]
      }
    ]
  },
  "terms": {
    "title": "Foydalanish shartlari",
    "lead": "Ommaviy oferta · Oxirgi yangilanish: 2026-yil 3-sentyabr",
    "sections": [
      {
        "id": null,
        "heading": "1. Umumiy qoidalar",
        "blocks": [
          {
            "p": [
              {
                "t": "Mazkur hujjat O'zbekiston Respublikasi Fuqarolik kodeksining 369-moddasiga muvofiq "
              },
              {
                "t": "ommaviy oferta",
                "b": true
              },
              {
                "t": " hisoblanadi. GapirAI.uz platformasida ro'yxatdan o'tish yoki uning xizmatlaridan foydalanish ushbu ofertani va Foydalanish shartlarini to'liq aksept qilish (qabul qilish) deb hisoblanadi. Agar siz ushbu shartlarga rozi bo'lmasangiz, platforma xizmatlaridan foydalanmasligingiz so'raladi."
              }
            ]
          }
        ]
      },
      {
        "id": null,
        "heading": "2. Xizmat tavsifi",
        "blocks": [
          {
            "p": [
              {
                "t": "GapirAI.uz foydalanuvchilarga YouTube va boshqa manbalardagi xorijiy video kontentlarni o'zbek tiliga sun'iy intellekt (AI) yordamida avtomatik ravishda tarjima va dublyaj qilish imkonini beradi. Tizim tarjima natijasini kafolatlamaydi va sinxron ovozlashtirishda kichik xatolar bo'lishi tabiiy hol hisoblanadi."
              }
            ]
          }
        ]
      },
      {
        "id": null,
        "heading": "3. Foydalanish cheklovlari",
        "blocks": [
          {
            "p": [
              {
                "t": "Foydalanuvchilarga quyidagilarni dublyaj qilish qat'iyan tavsiya etilmaydi:"
              }
            ]
          },
          {
            "list": [
              [
                {
                  "t": "Qonunga xilof, zo'ravonlik, nafrat uyg'otuvchi, terrorizm/ekstremizmni targ'ib qiluvchi yoki kattalar (18+) uchun mo'ljallangan kontent;"
                }
              ],
              [
                {
                  "t": "Bolalarga nisbatan jinsiy zo'ravonlik/ekspluatatsiya tasvirlangan kontent (CSAM) — bunday kontent uchun dublyaj so'rovi "
                },
                {
                  "t": "hech qanday holatda",
                  "b": true
                },
                {
                  "t": " bajarilmaydi va hisob qaydnomasi bloklanishi mumkin;"
                }
              ],
              [
                {
                  "t": "Platforma infratuzilmasiga zarar yetkazish, sun'iy yuklamalar (DDoS) hosil qilish yoki tizimni skanerlash;"
                }
              ],
              [
                {
                  "t": "Dublyaj natijalarini uchinchi shaxslarning mualliflik huquqlarini buzgan holda tijoriy maqsadlarda tarqatish."
                }
              ]
            ]
          },
          {
            "p": [
              {
                "t": "Yuqoridagi diniy, 18+, zo'ravonlik va shunga o'xshash kategoriyalar (CSAM bundan mustasno) uchun dublyaj jarayonining o'zi to'xtatilmaydi — video shaxsiy foydalanish uchun tayyorlanadi. Lekin bunday kontentni yubormaslikni so'raymiz; takroriy holatlarda hisob bloklanishi mumkin."
              }
            ]
          }
        ]
      },
      {
        "id": "tolovlar",
        "heading": "4. Tariflar, to'lovlar va to'lov usullari",
        "blocks": [
          {
            "p": [
              {
                "t": "GapirAI.uz xizmatlari oylik obuna tariflari va qo'shimcha daqiqa paketlari asosida taqdim etiladi. Sarf haqiqiy video davomiyligi (daqiqa) bo'yicha o'lchanadi:"
              }
            ]
          },
          {
            "list": [
              [
                {
                  "t": "Bepul (Free)",
                  "b": true
                },
                {
                  "t": " — 0 so'm, oyiga 5 daqiqagacha dublyaj;"
                }
              ],
              [
                {
                  "t": "Standart",
                  "b": true
                },
                {
                  "t": " — oyiga 49 000 so'm (yoki yiliga 490 000 so'm), oyiga 350 daqiqa;"
                }
              ],
              [
                {
                  "t": "Pro",
                  "b": true
                },
                {
                  "t": " — oyiga 199 000 so'm (yoki yiliga 1 990 000 so'm), oyiga 600 daqiqa, premium ovoz va 1080p sifat."
                }
              ]
            ]
          },
          {
            "p": [
              {
                "t": "Oylik daqiqa hajmi tugagach, foydalanuvchi qo'shimcha daqiqa paketlarini sotib olishi mumkin: +35 daqiqa — 15 000 so'm, +70 daqiqa — 25 000 so'm, +140 daqiqa — 45 000 so'm, +350 daqiqa — 100 000 so'm. Sotib olingan daqiqalar muddatsiz bo'lib, keyingi oyga o'tadi. Bitta video uchun maksimal davomiylik — 120 daqiqa. Barcha narxlar yakuniy va O'zbekiston so'mida ko'rsatilgan."
              }
            ]
          },
          {
            "p": [
              {
                "t": "To'lov usullari"
              }
            ]
          },
          {
            "p": [
              {
                "t": "To'lovlar O'zbekiston Respublikasining milliy to'lov tizimlari orqali, so'mda amalga oshiriladi:"
              }
            ]
          },
          {
            "list": [
              [
                {
                  "t": "Click",
                  "b": true
                },
                {
                  "t": " (click.uz) — UZCARD va HUMO kartalari;"
                }
              ],
              [
                {
                  "t": "Payme",
                  "b": true
                },
                {
                  "t": " (payme.uz) — UZCARD va HUMO kartalari."
                }
              ]
            ]
          },
          {
            "p": [
              {
                "t": "To'lov to'lov tashkilotining himoyalangan sahifasida amalga oshiriladi. GapirAI.uz foydalanuvchining karta raqami, amal qilish muddati va maxfiy kodlarini (CVV/CVC, SMS-tasdiqlash kodi) "
              },
              {
                "t": "ko'rmaydi, qabul qilmaydi va saqlamaydi",
                "b": true
              },
              {
                "t": " — bu ma'lumotlar bevosita to'lov tizimi tomonidan PCI DSS xalqaro standartiga muvofiq qayta ishlanadi."
              }
            ]
          },
          {
            "p": [
              {
                "t": "Avtomatik to'lov (ixtiyoriy)"
              }
            ]
          },
          {
            "p": [
              {
                "t": "Foydalanuvchi o'z hisobida kartani bog'lab, "
              },
              {
                "t": "avtomatik to'lov",
                "b": true
              },
              {
                "t": "ni yoqishi mumkin: (a) obunani avtomatik uzaytirish — tarif muddati tugaganda bog'langan kartadan tarif narxi yechiladi; (b) daqiqani avtomatik to'ldirish — oylik daqiqa hajmi tugaganda dublyaj to'xtamasligi uchun mos daqiqa paketi avtomatik sotib olinadi. Avtomatik to'lov faqat foydalanuvchi kartani tasdiqlab, aniq rozilik bergandagina ishlaydi. Kartani bog'lashda SMS-kod orqali tasdiqlash talab qilinadi. Foydalanuvchi avtomatik to'lovni istalgan vaqtda hisobidagi sozlamalardan o'chirishi yoki kartani uzishi mumkin. Har bir avtomatik yechishdan so'ng foydalanuvchiga bildirishnoma yuboriladi. Kartadan to'lov amalga oshmasa, obuna bir necha kun imtiyozli muddat (grace) bilan saqlanadi, so'ng Bepul rejaga o'tkaziladi."
              }
            ]
          },
          {
            "p": [
              {
                "t": "Qaytarish shartlari"
              }
            ]
          },
          {
            "p": [
              {
                "t": "Xizmat ko'rsatilgunga qadar (dublyaj jarayoni boshlanmagan bo'lsa) foydalanuvchi to'lovni bekor qilishni so'rashi mumkin — mablag' o'sha karta hisobiga qaytariladi. Dublyaj yakunlangach yoki daqiqalar sarflanganidan so'ng to'langan mablag' qaytarilmaydi. Platforma tomonidagi texnik nosozlik tufayli xizmat ko'rsatilmagan taqdirda, sarflangan daqiqalar avtomatik ravishda foydalanuvchi hisobiga qaytariladi. Qaytarish bo'yicha murojaatlar: "
              },
              {
                "t": "lodexgroups@gmail.com",
                "href": "mailto:lodexgroups@gmail.com"
              },
              {
                "t": "."
              }
            ]
          }
        ]
      },
      {
        "id": "firibgarlik",
        "heading": "5. Firibgarlik operatsiyalari xavfini cheklash va nazorat qilish choralari",
        "blocks": [
          {
            "p": [
              {
                "t": "GapirAI.uz platformasi (bundan keyin — \"Ijrochi\") O'zbekiston Respublikasi qonunchiligi hamda bank va to'lov tashkilotlari bilan tuzilgan Elektron tijorat shartnomasi (Договор ИЭ) talablariga muvofiq firibgarlik operatsiyalarining oldini olish va ularni cheklash choralarini ko'radi. Ijrochi shubhali operatsiyalarni bankning firibgarlikka qarshi kurash imkoniyatlaridan foydalangan holda nazorat qiladi va cheklaydi."
              }
            ]
          },
          {
            "list": [
              [
                {
                  "t": "to'lovlar va tranzaksiyalarni firibgarlik belgilari mavjudligiga tekshirish;"
                }
              ],
              [
                {
                  "t": "bank yoki to'lov tizimining xavfsizlik tizimida shubha uyg'otgan operatsiyalarni cheklash;"
                }
              ],
              [
                {
                  "t": "ma'lumotlarni uzatishning himoyalangan kanallari (SSL/TLS shifrlash) va zamonaviy axborot xavfsizligi vositalaridan foydalanish;"
                }
              ],
              [
                {
                  "t": "to'lov amalga oshirilayotganda foydalanuvchini identifikatsiya va verifikatsiya qilish (elektron pochta va/yoki telefon raqamini tasdiqlash);"
                }
              ],
              [
                {
                  "t": "firibgarlik xavfi aniqlanganda operatsiyani vaqtincha to'xtatib turish;"
                }
              ],
              [
                {
                  "t": "ruxsatsiz operatsiyalarning oldini olish uchun bank va to'lov tizimlari bilan hamkorlik qilish;"
                }
              ],
              [
                {
                  "t": "Elektron tijorat shartnomasi va Ijrochining ichki xavfsizlik qoidalariga rioya qilish."
                }
              ]
            ]
          },
          {
            "p": [
              {
                "t": "Foydalanuvchining majburiyatlari"
              }
            ]
          },
          {
            "list": [
              [
                {
                  "t": "o'zining shaxsiy ma'lumotlari, parollari va tasdiqlash kodlarini (SMS-kod, CVV/CVC) uchinchi shaxslarga oshkor qilmaslik;"
                }
              ],
              [
                {
                  "t": "shubhali yoki ruxsatsiz operatsiyalar haqida zudlik bilan xabar berish: "
                },
                {
                  "t": "lodexgroups@gmail.com",
                  "href": "mailto:lodexgroups@gmail.com"
                },
                {
                  "t": ";"
                }
              ],
              [
                {
                  "t": "elektron to'lov tizimlaridan xavfsiz foydalanish qoidalariga rioya qilish."
                }
              ]
            ]
          },
          {
            "p": [
              {
                "t": "Ijrochi firibgarlik belgilari yoki xavfsizlik talablarining buzilishi aniqlangan taqdirda operatsiyani cheklash yoki rad etish huquqini o'zida saqlab qoladi."
              }
            ]
          }
        ]
      },
      {
        "id": null,
        "heading": "6. Javobgarlikni cheklash",
        "blocks": [
          {
            "p": [
              {
                "t": "GapirAI.uz ma'lumotlar yo'qolishi, uchinchi shaxslar tomonidan kontent bloklanishi yoki platformadan foydalanish natijasida kelib chiqadigan bilvosita zararlar uchun javobgarlikni o'z zimmasiga olmaydi."
              }
            ]
          }
        ]
      }
    ]
  }
};
