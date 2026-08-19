import { StyleSheet } from 'react-native';

import { InfoScreenLayout, InfoSection } from '../src/components/InfoScreenLayout';
import { ThemedText } from '../src/components/ThemedText';

// Content mirrors frontend/app/terms/page.tsx verbatim (last updated 2026-08-04).
export default function TermsScreen() {
  return (
    <InfoScreenLayout title="Foydalanish shartlari" subtitle="Oxirgi yangilanish: 2026-yil 4-avgust">
      <InfoSection heading="1. Umumiy qoidalar">
        <ThemedText variant="secondary" style={styles.p}>
          GapirAI.uz platformasidan foydalanish orqali siz mazkur Foydalanish shartlariga to&apos;liq
          rozilik bildirasiz. Agar siz ushbu shartlarga rozi bo&apos;lmasangiz, platforma xizmatlaridan
          foydalanmasligingiz so&apos;raladi.
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
          {'•'} Qonunga xilof, zo&apos;ravonlik, nafrat uyg&apos;otuvchi yoki kattalar uchun mo&apos;ljallangan
          kontentlarni dublyaj qilish{'\n'}
          {'•'} Platforma infratuzilmasiga zarar yetkazish, sun&apos;iy yuklamalar (DDoS) hosil qilish
          yoki tizimni skanerlash{'\n'}
          {'•'} Dublyaj natijalarini uchinchi shaxslarning mualliflik huquqlarini buzgan holda tijoriy
          maqsadlarda tarqatish
        </ThemedText>
      </InfoSection>

      <InfoSection heading="4. To'lovlar va qaytarish shartlari">
        <ThemedText variant="secondary" style={styles.p}>
          Davomiyligi 45 daqiqadan kam bo&apos;lgan videolar bepul taqdim etiladi. 45 daqiqadan ortiq davom
          etadigan videolarni qayta ishlash uchun Click to&apos;lov tizimi orqali to&apos;lov amalga
          oshirilishi lozim (daqiqasiga 500 so&apos;m). Xizmat ko&apos;rsatilgandan so&apos;ng, to&apos;langan
          mablag&apos;lar qaytarilmaydi.
        </ThemedText>
      </InfoSection>

      <InfoSection heading="5. Javobgarlikni cheklash">
        <ThemedText variant="secondary" style={styles.p}>
          GapirAI.uz ma&apos;lumotlar yo&apos;qolishi, uchinchi shaxslar tomonidan kontent bloklanishi yoki
          platformadan foydalanish natijasida kelib chiqadigan bilvosita zararlar uchun javobgarlikni
          o&apos;z zimmasiga olmaydi.
        </ThemedText>
      </InfoSection>
    </InfoScreenLayout>
  );
}

const styles = StyleSheet.create({
  p: { fontSize: 13, lineHeight: 20 },
});
