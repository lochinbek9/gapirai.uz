import { StyleSheet } from 'react-native';

import { InfoScreenLayout, InfoSection } from '../src/components/InfoScreenLayout';
import { ThemedText } from '../src/components/ThemedText';

// Content mirrors frontend/app/privacy/page.tsx verbatim (last updated 2026-08-04).
export default function PrivacyScreen() {
  return (
    <InfoScreenLayout title="Maxfiylik siyosati" subtitle="Oxirgi yangilanish: 2026-yil 4-avgust">
      <InfoSection heading="1. Biz to'playdigan ma'lumotlar">
        <ThemedText variant="secondary" style={styles.p}>
          Platformamizdan foydalanganingizda, xizmat ko&apos;rsatish sifatini oshirish maqsadida quyidagi
          ma&apos;lumotlarni to&apos;playmiz:
        </ThemedText>
        <ThemedText variant="secondary" style={styles.p}>
          {'•'} Siz kiritgan YouTube video manzillari va davomiyligi{'\n'}
          {'•'} Tizimga kirish uchun foydalanadigan login va elektron pochta manzili{'\n'}
          {'•'} To&apos;lov tafsilotlari (to&apos;lovlar bevosita Click to&apos;lov shlyuzi orqali amalga
          oshiriladi va biz kartangiz ma&apos;lumotlarini saqlamaymiz)
        </ThemedText>
      </InfoSection>

      <InfoSection heading="2. Ma'lumotlardan foydalanish">
        <ThemedText variant="secondary" style={styles.p}>
          To&apos;plangan ma&apos;lumotlar faqat quyidagi maqsadlarda ishlatiladi:{'\n'}
          {'•'} Dublyaj va tarjima jarayonini amalga oshirish{'\n'}
          {'•'} Hisob-kitoblar va to&apos;lovlarni amalga oshirish hamda tasdiqlash{'\n'}
          {'•'} Texnik muammolarni bartaraf etish va foydalanuvchilarni qo&apos;llab-quvvatlash
        </ThemedText>
      </InfoSection>

      <InfoSection heading="3. Ma'lumotlar xavfsizligi">
        <ThemedText variant="secondary" style={styles.p}>
          Biz sizning shaxsiy ma&apos;lumotlaringiz xavfsizligini ta&apos;minlash uchun SSL shifrlash va
          zamonaviy xavfsizlik protokollaridan foydalanamiz. Biroq, internet orqali ma&apos;lumot
          uzatishning 100% xavfsizligini kafolatlab bo&apos;lmaydi.
        </ThemedText>
      </InfoSection>

      <InfoSection heading="4. Uchinchi shaxslarga ma'lumot uzatish">
        <ThemedText variant="secondary" style={styles.p}>
          Xizmat ko&apos;rsatish jarayonida matnlarni tarjima qilish uchun OpenAI va nutq sintezi uchun
          Microsoft Azure xizmatlariga faqatgina videodagi matnli ma&apos;lumotlar uzatiladi. Sizning
          shaxsiy ma&apos;lumotlaringiz uchinchi shaxslarga sotilmaydi.
        </ThemedText>
      </InfoSection>
    </InfoScreenLayout>
  );
}

const styles = StyleSheet.create({
  p: { fontSize: 13, lineHeight: 20 },
});
