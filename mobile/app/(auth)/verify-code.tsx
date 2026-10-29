import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';

import { getErrorMessage } from '../../src/api/errors';
import { Notice } from '../../src/components/Notice';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ThemedText } from '../../src/components/ThemedText';
import { ThemedTextInput } from '../../src/components/ThemedTextInput';
import * as authApi from '../../src/features/auth/api';
import { AuthScreenLayout } from '../../src/features/auth/components/AuthScreenLayout';
import { verifyCodeSchema, type VerifyCodeFormValues } from '../../src/features/auth/schemas';
import { useAuthStore } from '../../src/store/useAuthStore';

// Saytdagi kod maydoni: markazda, katta, keng harf oralig'i
const CODE_STYLE = { textAlign: 'center' as const, fontSize: 24, letterSpacing: 12, fontFamily: 'Geist_600SemiBold' };

export default function VerifyCodeScreen() {
  const router = useRouter();
  const { email, message } = useLocalSearchParams<{ email: string; message?: string }>();
  const setSession = useAuthStore((s) => s.setSession);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<VerifyCodeFormValues>({
    resolver: zodResolver(verifyCodeSchema),
    defaultValues: { code: '' },
  });

  const verifyMutation = useMutation({
    mutationFn: (values: VerifyCodeFormValues) => authApi.verifyCode(email, values.code),
    onSuccess: async (data) => {
      await setSession(data.user, data.access_token);
      router.replace('/');
    },
  });

  const resendMutation = useMutation({
    mutationFn: () => authApi.resendCode(email),
  });

  const onSubmit = handleSubmit((values) => verifyMutation.mutate(values));

  return (
    <AuthScreenLayout
      title="Kodni tasdiqlang"
      subtitle={message || `${email} manziliga yuborilgan 6 xonali kodni kiriting`}
    >
      <Controller
        control={control}
        name="code"
        render={({ field: { onChange, onBlur, value } }) => (
          <ThemedTextInput
            label="Tasdiqlash kodi"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            keyboardType="number-pad"
            maxLength={6}
            error={errors.code?.message}
            placeholder="000000"
            style={CODE_STYLE}
          />
        )}
      />

      {verifyMutation.isError && (
        <Notice>{getErrorMessage(verifyMutation.error, 'Kod tasdiqlanmadi.')}</Notice>
      )}
      {resendMutation.isSuccess && (
        <Notice tone="success">Kod qayta yuborildi.</Notice>
      )}
      {resendMutation.isError && (
        <Notice>{getErrorMessage(resendMutation.error, 'Kodni qayta yuborishda xatolik yuz berdi.')}</Notice>
      )}

      <PrimaryButton label="Tasdiqlash" onPress={onSubmit} loading={verifyMutation.isPending} />
      <PrimaryButton
        label="Kodni qayta yuborish"
        variant="secondary"
        onPress={() => resendMutation.mutate()}
        loading={resendMutation.isPending}
      />
    </AuthScreenLayout>
  );
}
