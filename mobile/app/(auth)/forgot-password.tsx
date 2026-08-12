import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';

import { getErrorMessage } from '../../src/api/errors';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ThemedText } from '../../src/components/ThemedText';
import { ThemedTextInput } from '../../src/components/ThemedTextInput';
import * as authApi from '../../src/features/auth/api';
import { AuthScreenLayout } from '../../src/features/auth/components/AuthScreenLayout';
import { forgotPasswordSchema, type ForgotPasswordFormValues } from '../../src/features/auth/schemas';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: ForgotPasswordFormValues) => authApi.forgotPassword(values.email),
    onSuccess: (data) => {
      router.push({ pathname: '/(auth)/reset-password', params: { email: data.email, message: data.message } });
    },
  });

  const onSubmit = handleSubmit((values) => mutation.mutate(values));

  return (
    <AuthScreenLayout
      title="Parolni tiklash"
      subtitle="Emailingizni kiriting — tiklash kodi shu manzilga yuboriladi"
    >
      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <ThemedTextInput
            label="Email"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            keyboardType="email-address"
            error={errors.email?.message}
            placeholder="siz@example.com"
          />
        )}
      />

      {mutation.isError && (
        <ThemedText style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>
          {getErrorMessage(mutation.error, 'Kod yuborishda xatolik yuz berdi.')}
        </ThemedText>
      )}

      <PrimaryButton label="Kod yuborish" onPress={onSubmit} loading={mutation.isPending} />
    </AuthScreenLayout>
  );
}
