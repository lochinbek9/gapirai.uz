import { StyleSheet } from 'react-native';

import { InfoScreenLayout, InfoSection } from '../src/components/InfoScreenLayout';
import { ThemedText } from '../src/components/ThemedText';

// Content mirrors frontend/app/terms/page.tsx (Ommaviy oferta, 2026-09-03).
export default function TermsScreen() {
  return (
    <InfoScreenLayout
      title="Foydalanish shartlari"
      subtitle="Ommaviy oferta · Oxirgi yangilanish: 2026-yil 3-sentyabr"
    >
      <InfoSection heading="1. Umumiy qoidalar">
        <ThemedText variant="secondary" style={styles.p}>
          Mazkur hujjat O&apos;zbekiston Respublikasi Fuqarolik kodeksining 369-moddasiga muvofiq ommaviy
          oferta hisoblanadi. GapirAI.uz platformasida ro&apos;yxatdan o&apos;tish yoki uning xizmatlaridan
          foydalanish ushbu ofertani to&apos;liq aksept qilish deb hisoblanadi. Agar siz ushbu shartlarga rozi
          bo&apos;lmasangiz, platforma xizmatlaridan foydalanmasligingiz so&apos;raladi.
        </ThemedText>
      </InfoSection>

      <InfoSection heading="2. Xizmat tavsifi">
        <ThemedText variant="secondary" style={styles.p}>
          GapirAI.uz foydalanuvchilarga YouTube va boshqa manbalardagi xorijiy video kontentlarni o&apos;zbek
          tiliga sun&apos;iy intellekt (AI) yordamida avtomatik ravishda tarjima va dublyaj qilish imkonini
          beradi. Tizim tarjima natijasini kafolatlamaydi va sinxron ovozlashtirishda kichik xatolar
          bo&apos;lishi tabiiy hol hisoblanadi.
        </ThemedText>
      </InfoSection>

      <InfoSection heading="3. Foydalanish cheklovlari">
        <ThemedText variant="secondary" style={styles.p}>
          Foydalanuvchilarga quyidagilar qat&apos;iyan taqiqlanadi:{'\n'}
          {'•'} Qonunga xilof, zo&apos;ravonlik, nafrat uyg&apos;otuvchi yoki kattalar uchun
          mo&apos;ljallangan kontentlarni dublyaj qilish{'\n'}
          {'•'} Platforma infratuzilmasiga zarar yetkazish, sun&apos;iy yuklamalar (DDoS) hosil qilish yoki
          tizimni skanerlash{'\n'}
          {'•'} Dublyaj natijalarini uchinchi shaxslarning mualliflik huquqlarini buzgan holda tijoriy
          maqsadlarda tarqatish
        </ThemedText>
      </InfoSection>

      <InfoSection heading="4. Tariflar, to'lovlar va to'lov usullari">
        <ThemedText variant="secondary" style={styles.p}>
          Xizmatlar oylik obuna tariflari va qo&apos;shimcha daqiqa paketlari asosida taqdim etiladi. Sarf
          haqiqiy video davomiyligi bo&apos;yicha o&apos;lchanadi: Bepul — oyiga 25 daqiqa; Standart — 49 000
          so&apos;m/oy, 300 daqiqa; Pro — 199 000 so&apos;m/oy, 400 daqiqa. Oylik hajm tugagach
          qo&apos;shimcha paket sotib olinadi (+30 / +60 / +120 / +300 daqiqa); sotib olingan daqiqalar
          muddatsiz. 1 video — maksimum 120 daqiqa. Narxlar yakuniy va so&apos;mda.
        </ThemedText>
        <ThemedText variant="secondary" style={styles.p}>
          To&apos;lov usullari: Click (click.uz) va Payme (payme.uz) — UZCARD va HUMO kartalari. To&apos;lov
          to&apos;lov tashkilotining himoyalangan sahifasida amalga oshiriladi. GapirAI.uz karta raqami, amal
          muddati va maxfiy kodlarni (CVV, SMS-kod) ko&apos;rmaydi va saqlamaydi — bular bevosita to&apos;lov
          tizimi tomonidan PCI DSS standartiga muvofiq qayta ishlanadi.
        </ThemedText>
        <ThemedText variant="secondary" style={styles.p}>
          Avtomatik to&apos;lov (ixtiyoriy): foydalanuvchi kartani bog&apos;lab, obunani avtomatik uzaytirish
          yoki daqiqani avtomatik to&apos;ldirishni yoqishi mumkin. Bu faqat karta SMS-kod orqali tasdiqlanib,
          aniq rozilik berilgandagina ishlaydi va istalgan vaqtda o&apos;chiriladi. Har yechishdan so&apos;ng
          bildirishnoma yuboriladi. To&apos;lov amalga oshmasa, obuna bir necha kun imtiyozli muddat bilan
          saqlanadi, so&apos;ng Bepul rejaga o&apos;tkaziladi.
        </ThemedText>
        <ThemedText variant="secondary" style={styles.p}>
          Qaytarish: xizmat ko&apos;rsatilgunga qadar to&apos;lovni bekor qilish mumkin — mablag&apos; kartaga
          qaytariladi. Dublyaj yakunlangach yoki daqiqalar sarflangach mablag&apos; qaytarilmaydi. Texnik
          nosozlik tufayli xizmat ko&apos;rsatilmasa, sarflangan daqiqalar avtomatik qaytariladi. Murojaat:
          lodexgroups@gmail.com.
        </ThemedText>
      </InfoSection>

      <InfoSection heading="5. Firibgarlik xavfini cheklash va nazorat qilish">
        <ThemedText variant="secondary" style={styles.p}>
          GapirAI.uz (Ijrochi) O&apos;zbekiston Respublikasi qonunchiligi va bank hamda to&apos;lov
          tashkilotlari bilan tuzilgan Elektron tijorat shartnomasi (Договор ИЭ) talablariga muvofiq
          firibgarlik operatsiyalarining oldini olish choralarini ko&apos;radi. Ijrochi shubhali
          operatsiyalarni bankning firibgarlikka qarshi imkoniyatlaridan foydalangan holda nazorat qiladi va
          cheklaydi:
        </ThemedText>
        <ThemedText variant="secondary" style={styles.p}>
          {'•'} to&apos;lovlarni firibgarlik belgilariga tekshirish{'\n'}
          {'•'} xavfsizlik tizimida shubha uyg&apos;otgan operatsiyalarni cheklash{'\n'}
          {'•'} himoyalangan kanallar (SSL/TLS) va zamonaviy axborot xavfsizligi vositalari{'\n'}
          {'•'} to&apos;lovda foydalanuvchini identifikatsiya va verifikatsiya qilish{'\n'}
          {'•'} xavf aniqlanganda operatsiyani vaqtincha to&apos;xtatib turish{'\n'}
          {'•'} bank va to&apos;lov tizimlari bilan hamkorlik
        </ThemedText>
        <ThemedText variant="secondary" style={styles.p}>
          Foydalanuvchi majburiyatlari: shaxsiy ma&apos;lumotlar, parollar va tasdiqlash kodlarini (SMS, CVV)
          uchinchi shaxslarga bermaslik; shubhali operatsiyalar haqida zudlik bilan xabar berish
          (lodexgroups@gmail.com); elektron to&apos;lov tizimlaridan xavfsiz foydalanish. Ijrochi firibgarlik
          belgilari yoki xavfsizlik buzilishi aniqlansa operatsiyani rad etish huquqini saqlab qoladi.
        </ThemedText>
      </InfoSection>

      <InfoSection heading="6. Javobgarlikni cheklash">
        <ThemedText variant="secondary" style={styles.p}>
          GapirAI.uz ma&apos;lumotlar yo&apos;qolishi, uchinchi shaxslar tomonidan kontent bloklanishi yoki
          platformadan foydalanish natijasida kelib chiqadigan bilvosita zararlar uchun javobgarlikni o&apos;z
          zimmasiga olmaydi.
        </ThemedText>
      </InfoSection>
    </InfoScreenLayout>
  );
}

const styles = StyleSheet.create({
  p: { fontSize: 13, lineHeight: 20 },
});
