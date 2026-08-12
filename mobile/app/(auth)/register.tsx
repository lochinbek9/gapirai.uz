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
import { registerSchema, type RegisterFormValues } from '../../src/features/auth/schemas';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function RegisterScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: RegisterFormValues) => authApi.register(values.name, values.email, values.password),
    onSuccess: (data) => {
      router.push({ pathname: '/(auth)/verify-code', params: { email: data.email, message: data.message } });
    },
  });

  const onSubmit = handleSubmit((values) => mutation.mutate(values));

  return (
    <AuthScreenLayout title="Ro'yxatdan o'tish" subtitle="Bepul hisob oching va videolaringizni saqlang">
      <Controller
        control={control}
        name="name"
        render={({ field: { onChange, onBlur, value } }) => (
          <ThemedTextInput
            label="Ism"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.name?.message}
            placeholder="Ismingiz"
          />
        )}
      />
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
            placeholder="Kamida 6 ta belgi"
          />
        )}
      />

      {mutation.isError && (
        <ThemedText style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>
          {getErrorMessage(mutation.error, "Ro'yxatdan o'tishda xatolik yuz berdi.")}
        </ThemedText>
      )}

      <PrimaryButton label="Ro'yxatdan o'tish" onPress={onSubmit} loading={mutation.isPending} />

      <AuthLink label="Hisobingiz bormi?" actionLabel="Kirish" onPress={() => router.push('/(auth)/login')} />
    </AuthScreenLayout>
  );
}
