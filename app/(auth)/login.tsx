import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';

import { getErrorMessage } from '../../src/api/errors';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ThemedText } from '../../src/components/ThemedText';
import { ThemedTextInput } from '../../src/components/ThemedTextInput';
import * as authApi from '../../src/features/auth/api';
import { AuthLink } from '../../src/features/auth/components/AuthLink';
import { AuthScreenLayout } from '../../src/features/auth/components/AuthScreenLayout';
import { loginSchema, type LoginFormValues } from '../../src/features/auth/schemas';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: LoginFormValues) => authApi.login(values.email, values.password),
    onSuccess: (data) => {
      router.push({ pathname: '/(auth)/verify-code', params: { email: data.email, message: data.message } });
    },
  });

  const onSubmit = handleSubmit((values) => mutation.mutate(values));

  return (
    <AuthScreenLayout title="Kirish" subtitle="Hisobingizga kirish uchun email va parolni kiriting">
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
      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <ThemedTextInput
            label="Parol"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            isPassword
            error={errors.password?.message}
            placeholder="Parolingiz"
          />
        )}
      />

      {mutation.isError && (
        <ThemedText style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>
          {getErrorMessage(mutation.error, 'Kirishda xatolik yuz berdi.')}
        </ThemedText>
      )}

      <PrimaryButton label="Kirish" onPress={onSubmit} loading={mutation.isPending} />

      <AuthLink
        label="Parolni unutdingizmi?"
        actionLabel="Tiklash"
        onPress={() => router.push('/(auth)/forgot-password')}
      />
      <AuthLink
        label="Hisobingiz yo'qmi?"
        actionLabel="Ro'yxatdan o'tish"
        onPress={() => router.push('/(auth)/register')}
      />
    </AuthScreenLayout>
  );
}
