import { StyleSheet } from 'react-native';

import { Accordion } from '../src/components/Accordion';
import { InfoScreenLayout } from '../src/components/InfoScreenLayout';

// frontend/app/faq/faqs.ts bilan bir xil -- saytdagi savollar o'zgarsa, bu yerni ham yangilang.
const FAQS = [
  {
    "q": "GapirAI.uz qanday ishlaydi?",
    "a": "YouTube havolasini yoki video faylni yuborasiz. Tizim videodagi nutqni matnga aylantiradi, uni sun'iy intellekt yordamida tabiiy o'zbek tiliga tarjima qiladi, spikerning jinsiga mos o'zbekcha ovoz bilan qayta yozadi va videoga qo'shadi. Xohlasangiz, ovozsiz faqat subtitr (.srt / .vtt) yoki qisqa tahlil (xulosa, konspekt, test) olishingiz mumkin."
  },
  {
    "q": "Platformadan foydalanish bepulmi?",
    "a": "Bepul tarifda har 30 kunda 5 daqiqa beriladi. Ko'proq kerak bo'lsa obuna bo'ling (Standart — 350 daqiqa, 49 000 so'm; Pro — 600 daqiqa, 1080p va ovoz variantlari, 199 000 so'm) yoki bir martalik daqiqa paketi oling (+35 daqiqa — 15 000 so'm, +70 — 25 000, +140 — 45 000, +350 — 100 000). Sarf videoning haqiqiy davomiyligi bo'yicha hisoblanadi. Sotib olingan daqiqalar kuymaydi. Bitta video — 120 daqiqagacha. Tezkor tahlil daqiqa sarflamaydi."
  },
  {
    "q": "Dublyaj qilish qancha vaqt oladi?",
    "a": "Bu video uzunligiga va navbatdagi videolar soniga bog'liq: qisqa videolar tezroq, uzun ma'ruzalar ko'proq vaqt oladi. Jarayon bosqichlari sahifada jonli ko'rinib turadi; sahifani yopsangiz ham ish davom etadi va tayyor video \"Mening videolarim\" bo'limida saqlanadi."
  },
  {
    "q": "Dublyaj jarayonini bekor qilsa bo'ladimi?",
    "a": "Ha, jarayon davomida \"Jarayonni bekor qilish\" tugmasini bosishingiz mumkin. Dastlabki 30 soniya ichida bekor qilinsa, daqiqalar to'liq qaytariladi. Video texnik sabab bilan tayyor bo'lmasa, sarflangan daqiqalar avtomatik qaytariladi."
  },
  {
    "q": "Agar dublyaj jarayonida xatolik yuz bersa nima bo'ladi?",
    "a": "Tizim avval jarayonni avtomatik qayta urinib ko'radi. Baribir muvaffaqiyatsiz bo'lsa, xatolik sababi ekranda ko'rsatiladi va daqiqalar balansingizga qaytadi. YouTube videoni yuklashga ruxsat bermasa, videoni fayl sifatida yuklab dublyaj qilishingiz mumkin."
  }
];

export default function FaqScreen() {
  return (
    <InfoScreenLayout title="Yordam va savollar" subtitle="Eng koʻp beriladigan savollarga javoblar.">
      <Accordion items={FAQS} style={styles.list} />
    </InfoScreenLayout>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: 40 },
});
