import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet } from 'react-native';

import { getErrorMessage } from '../../src/api/errors';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ThemedText } from '../../src/components/ThemedText';
import { ThemedTextInput } from '../../src/components/ThemedTextInput';
import { ThemedView } from '../../src/components/ThemedView';
import * as authApi from '../../src/features/auth/api';
import { AuthLink } from '../../src/features/auth/components/AuthLink';
import { AuthScreenLayout } from '../../src/features/auth/components/AuthScreenLayout';
import { GoogleSignInButton } from '../../src/features/auth/components/GoogleSignInButton';
import { loginSchema, type LoginFormValues } from '../../src/features/auth/schemas';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const setSession = useAuthStore((s) => s.setSession);
  const [googleError, setGoogleError] = useState<string | null>(null);
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
    onSuccess: async (data) => {
      if ('access_token' in data) {
        await setSession(data.user, data.access_token);
        router.replace('/');
        return;
      }
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

      <ThemedView style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <ThemedView style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
        <ThemedText variant="secondary" style={{ fontSize: 12, fontWeight: '600' }}>
          yoki
        </ThemedText>
        <ThemedView style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
      </ThemedView>

      {googleError && (
        <ThemedText style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>{googleError}</ThemedText>
      )}
      <GoogleSignInButton
        onCredential={(credential) => googleMutation.mutate(credential)}
        onError={setGoogleError}
        loading={googleMutation.isPending}
      />

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
