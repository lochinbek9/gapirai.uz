import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';

import { getErrorMessage } from '../../src/api/errors';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ThemedText } from '../../src/components/ThemedText';
import { ThemedTextInput } from '../../src/components/ThemedTextInput';
import * as authApi from '../../src/features/auth/api';
import { AuthScreenLayout } from '../../src/features/auth/components/AuthScreenLayout';
import { verifyCodeSchema, type VerifyCodeFormValues } from '../../src/features/auth/schemas';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function VerifyCodeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
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
          />
        )}
      />

      {verifyMutation.isError && (
        <ThemedText style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>
          {getErrorMessage(verifyMutation.error, 'Kod tasdiqlanmadi.')}
        </ThemedText>
      )}
      {resendMutation.isSuccess && (
        <ThemedText style={{ color: colors.success, fontSize: 13, fontWeight: '600' }}>
          Kod qayta yuborildi.
        </ThemedText>
      )}
      {resendMutation.isError && (
        <ThemedText style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>
          {getErrorMessage(resendMutation.error, 'Kodni qayta yuborishda xatolik yuz berdi.')}
        </ThemedText>
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
