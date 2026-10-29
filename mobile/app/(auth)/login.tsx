import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet } from 'react-native';

import { getErrorMessage } from '../../src/api/errors';
import { Notice } from '../../src/components/Notice';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ThemedText } from '../../src/components/ThemedText';
import { ThemedTextInput } from '../../src/components/ThemedTextInput';
import * as authApi from '../../src/features/auth/api';
import { AuthLink } from '../../src/features/auth/components/AuthLink';
import { AuthScreenLayout, OrDivider } from '../../src/features/auth/components/AuthScreenLayout';
import { GoogleSignInButton } from '../../src/features/auth/components/GoogleSignInButton';
import { TelegramSignInButton } from '../../src/features/auth/components/TelegramSignInButton';
import { loginSchema, type LoginFormValues } from '../../src/features/auth/schemas';
import { useAuthStore } from '../../src/store/useAuthStore';

export default function LoginScreen() {
  const router = useRouter();
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
    <AuthScreenLayout
      title="Hisobingizga kiring"
      subtitle="GapirAI.uz hisobingiz bilan davom eting."
      footer={<AuthLink label="Hisobingiz yoʻqmi?" actionLabel="Roʻyxatdan oʻting" onPress={() => router.push('/(auth)/register')} />}
    >
      <GoogleSignInButton
        onCredential={(credential) => googleMutation.mutate(credential)}
        onError={setGoogleError}
        loading={googleMutation.isPending}
      />
      <TelegramSignInButton />
      {googleError && <Notice>{googleError}</Notice>}
      <OrDivider />

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
            autoComplete="email"
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
            labelAccessory={
              <Pressable onPress={() => router.push('/(auth)/forgot-password')} accessibilityRole="link" hitSlop={12}>
                <ThemedText variant="secondary" style={styles.forgot}>
                  Parolni unutdingizmi?
                </ThemedText>
              </Pressable>
            }
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            isPassword
            autoComplete="current-password"
            error={errors.password?.message}
            placeholder="••••••••"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
          />
        )}
      />

      {mutation.isError && <Notice>{getErrorMessage(mutation.error, 'Kirishda xatolik yuz berdi.')}</Notice>}

      <PrimaryButton label={mutation.isPending ? 'Kirilmoqda...' : 'Kirish'} onPress={onSubmit} loading={mutation.isPending} />
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  forgot: { fontSize: 14 },
});
