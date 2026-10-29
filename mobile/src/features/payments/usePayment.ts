import { useMutation } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { Alert } from 'react-native';

import { getErrorMessage } from '../../api/errors';
import { initiatePayment, type PaymentProvider, type PaymentTarget } from './api';

/**
 * Click yoki Payme tanlatib, to'lov sahifasini ilova ustida ochadi (saytga qayta kirish
 * shart emas -- havola ilovadagi sessiya bilan yaratiladi). To'lovdan keyin ilovaga
 * qaytilganda tarif/daqiqa so'rovlari fokusda o'zi yangilanadi (_layout.tsx focusManager).
 */
export function usePayment() {
  const mutation = useMutation({
    mutationFn: async ({ target, provider }: { target: PaymentTarget; provider: PaymentProvider }) => {
      const url = await initiatePayment(target, provider);
      await WebBrowser.openBrowserAsync(url, { showTitle: true });
    },
  });

  const pay = (target: PaymentTarget) =>
    Alert.alert('Toʻlov usuli', 'Qaysi ilova orqali toʻlaysiz?', [
      { text: 'Bekor qilish', style: 'cancel' },
      { text: 'Payme', onPress: () => mutation.mutate({ target, provider: 'payme' }) },
      { text: 'Click', onPress: () => mutation.mutate({ target, provider: 'click' }) },
    ]);

  return {
    pay,
    pending: mutation.isPending,
    error: mutation.isError ? getErrorMessage(mutation.error, 'Toʻlov havolasini yaratishda xatolik yuz berdi.') : null,
  };
}
