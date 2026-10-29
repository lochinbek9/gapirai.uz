import { InfoScreenLayout, LegalDocument } from '../src/components/InfoScreenLayout';
import { LEGAL } from '../src/content/legal';

// Matn frontend/app/terms/page.tsx dan avtomatik ko'chirilgan (src/content/legal.ts)
export default function TermsScreen() {
  return (
    <InfoScreenLayout title={LEGAL.terms.title} subtitle={LEGAL.terms.lead}>
      <LegalDocument doc={LEGAL.terms} />
    </InfoScreenLayout>
  );
}
