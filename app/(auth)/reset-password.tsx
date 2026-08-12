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
import { resetPasswordSchema, type ResetPasswordFormValues } from '../../src/features/auth/schemas';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { email, message } = useLocalSearchParams<{ email: string; message?: string }>();
  const setSession = useAuthStore((s) => s.setSession);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { code: '', newPassword: '', confirmPassword: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: ResetPasswordFormValues) => authApi.resetPassword(email, values.code, values.newPassword),
    onSuccess: async (data) => {
      await setSession(data.user, data.access_token);
      router.replace('/');
    },
  });

  const onSubmit = handleSubmit((values) => mutation.mutate(values));

  return (
    <AuthScreenLayout
      title="Yangi parol"
      subtitle={message || `${email} manziliga yuborilgan kod va yangi parolni kiriting`}
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
      <Controller
        control={control}
        name="newPassword"
        render={({ field: { onChange, onBlur, value } }) => (
          <ThemedTextInput
            label="Yangi parol"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            isPassword
            error={errors.newPassword?.message}
            placeholder="Kamida 6 ta belgi"
          />
        )}
      />
      <Controller
        control={control}
        name="confirmPassword"
        render={({ field: { onChange, onBlur, value } }) => (
          <ThemedTextInput
            label="Parolni tasdiqlang"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            isPassword
            error={errors.confirmPassword?.message}
            placeholder="Parolni qayta kiriting"
          />
        )}
      />

      {mutation.isError && (
        <ThemedText style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>
          {getErrorMessage(mutation.error, 'Parolni tiklashda xatolik yuz berdi.')}
        </ThemedText>
      )}

      <PrimaryButton label="Parolni yangilash" onPress={onSubmit} loading={mutation.isPending} />
    </AuthScreenLayout>
  );
}
