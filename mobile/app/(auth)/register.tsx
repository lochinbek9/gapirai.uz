import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { getErrorMessage } from '../../src/api/errors';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Notice } from '../../src/components/Notice';
import { ThemedTextInput } from '../../src/components/ThemedTextInput';
import * as authApi from '../../src/features/auth/api';
import { AuthLink } from '../../src/features/auth/components/AuthLink';
import { AuthScreenLayout, OrDivider } from '../../src/features/auth/components/AuthScreenLayout';
import { GoogleSignInButton } from '../../src/features/auth/components/GoogleSignInButton';
import { TelegramSignInButton } from '../../src/features/auth/components/TelegramSignInButton';
import { registerSchema, type RegisterFormValues } from '../../src/features/auth/schemas';
import { useAuthStore } from '../../src/store/useAuthStore';

export default function RegisterScreen() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [googleError, setGoogleError] = useState<string | null>(null);
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

  const googleMutation = useMutation({
    mutationFn: (credential: string) => authApi.googleAuth(credential),
    onMutate: () => setGoogleError(null),
    onSuccess: async (data) => {
      await setSession(data.user, data.access_token);
      router.replace('/');
    },
    onError: (err) => setGoogleError(getErrorMessage(err, 'Google orqali kirishda xatolik yuz berdi.')),
  });

  const onSubmit = handleSubmit((values) => mutation.mutate(values));

  return (
    <AuthScreenLayout
      title="Yangi hisob yarating"
      subtitle="Har 30 kunda 5 daqiqa bepul. Videolaringiz hisobingizda saqlanadi."
      footer={<AuthLink label="Hisobingiz bormi?" actionLabel="Kirish" onPress={() => router.push('/(auth)/login')} />}
    >
      <GoogleSignInButton
        onCredential={(credential) => googleMutation.mutate(credential)}
        onError={setGoogleError}
        loading={googleMutation.isPending}
        text="signup_with"
      />
      <TelegramSignInButton text="signup_with" />
      {googleError && <Notice>{googleError}</Notice>}
      <OrDivider />

      <Controller
        control={control}
        name="name"
        render={({ field: { onChange, onBlur, value } }) => (
          <ThemedTextInput
            label="Ismingiz"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.name?.message}
            placeholder="Ism Familiya"
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
            placeholder="email@example.com"
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

      {mutation.isError && <Notice>{getErrorMessage(mutation.error, "Ro'yxatdan o'tishda xatolik yuz berdi.")}</Notice>}

      <PrimaryButton label={mutation.isPending ? 'Yaratilmoqda...' : 'Hisob yaratish'} onPress={onSubmit} loading={mutation.isPending} />
    </AuthScreenLayout>
  );
}
