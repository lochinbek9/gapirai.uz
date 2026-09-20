import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { InfoScreenLayout } from '../src/components/InfoScreenLayout';
import { ThemedText } from '../src/components/ThemedText';
import { ThemedView } from '../src/components/ThemedView';
import { useTheme } from '../src/theme/ThemeProvider';

// Content mirrors frontend/app/faq/faqs.ts.
const FAQS = [
  {
    q: 'GapirAI.uz qanday ishlaydi?',
    a: "Platformamizga xorijiy tildagi YouTube video havolasini kiritganingizda, tizim avtomatik ravishda audioni ajratib oladi, nutqni matnga aylantiradi (OpenAI Whisper), o'zbek tiliga professional darajada tarjima qiladi (GPT-4o) hamda eng so'nggi ovoz sintezi (Azure Speech AI) yordamida o'zbek tilida tabiiy ovoz beradi.",
  },
  {
    q: 'Platformadan foydalanish bepulmi?',
    a: "Bepul tarifda oyiga 5 daqiqa dublyaj bepul. Ko'proq kerak bo'lsa oylik tarifga o'ting (Standart — oyiga 300 daqiqa, 49 000 so'm; Pro — oyiga 400 daqiqa, 199 000 so'm) yoki qo'shimcha daqiqa paketi sotib oling. Sotib olingan daqiqalar tugamaydi va keyingi oyga o'tadi.",
  },
  {
    q: 'Dublyaj qilish qancha vaqt oladi?',
    a: "O'rtacha hisobda videoni qayta ishlash davomiyligi video uzunligining 30% ini tashkil qiladi. Masalan, 10 daqiqalik video taxminan 3 daqiqa ichida tayyor bo'ladi. Jarayon davomida taxminiy vaqt ekranda ko'rsatib turiladi.",
  },
  {
    q: "Dublyaj jarayonini bekor qilsa bo'ladimi?",
    a: "Ha, jarayon davomida xohlagan vaqtingizda jarayonni bekor qilishingiz mumkin. Agar video bepul bo'lsa, hech qanday to'lov yo'qolmaydi.",
  },
  {
    q: 'Agar dublyaj jarayonida xatolik yuz bersa nima bo\'ladi?',
    a: "Agar tizimda yoki tarjimada xatolik yuz bersa, tizim avtomatik ravishda jarayonni qayta tiklashga (retry) harakat qiladi. Agar butunlay muvaffaqiyatsiz bo'lsa, to'liq xatolik sababi ekranda ko'rsatiladi va siz bosh sahifaga qaytib qaytadan urinib ko'rishingiz mumkin.",
  },
];

export default function FaqScreen() {
  const { colors } = useTheme();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <InfoScreenLayout title="Yordam va Savollar (FAQ)" subtitle="Eng ko'p beriladigan savollarga javoblar">
      <ThemedView style={styles.list}>
        {FAQS.map((faq, i) => {
          const isOpen = openIndex === i;
          return (
            <ThemedView
              key={faq.q}
              style={[styles.item, { borderColor: colors.border, backgroundColor: colors.background }]}
            >
              <Pressable onPress={() => setOpenIndex(isOpen ? null : i)} style={styles.question}>
                <ThemedText style={styles.questionText}>{faq.q}</ThemedText>
                <ThemedText style={{ color: colors.accent, fontWeight: '700' }}>{isOpen ? '−' : '+'}</ThemedText>
              </Pressable>
              {isOpen && (
                <ThemedText variant="secondary" style={styles.answer}>
                  {faq.a}
                </ThemedText>
              )}
            </ThemedView>
          );
        })}
      </ThemedView>
    </InfoScreenLayout>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  item: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  question: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  questionText: { flex: 1, fontSize: 13, fontWeight: '700' },
  answer: { fontSize: 13, lineHeight: 19, paddingHorizontal: 16, paddingBottom: 14 },
});
