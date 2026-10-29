import { InfoScreenLayout, LegalDocument } from '../src/components/InfoScreenLayout';
import { LEGAL } from '../src/content/legal';

// Matn frontend/app/privacy/page.tsx dan avtomatik ko'chirilgan (src/content/legal.ts)
export default function PrivacyScreen() {
  return (
    <InfoScreenLayout title={LEGAL.privacy.title} subtitle={LEGAL.privacy.lead}>
      <LegalDocument doc={LEGAL.privacy} />
    </InfoScreenLayout>
  );
}
