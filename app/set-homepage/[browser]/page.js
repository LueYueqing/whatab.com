import { notFound } from 'next/navigation';
import SetHomepageGuide from '../../../components/SetHomepageGuide';
import { BROWSER_SLUGS, getBrowserGuide, SHARED_FAQ } from '../../../lib/setHomepageBrowsers';
import { pageMeta, SITE } from '../../../lib/seo';

export function generateStaticParams() {
  return BROWSER_SLUGS.map((browser) => ({ browser }));
}

export function generateMetadata({ params }) {
  const guide = getBrowserGuide(params.browser);
  if (!guide) return {};
  return pageMeta({
    title: guide.title,
    description: guide.description,
    path: `/set-homepage/${guide.slug}`,
  });
}

export default function BrowserHomepagePage({ params }) {
  const guide = getBrowserGuide(params.browser);
  if (!guide) notFound();

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: SHARED_FAQ.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };

  const howToLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: guide.h1,
    description: guide.description,
    url: `${SITE}/set-homepage/${guide.slug}`,
    step: guide.steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.title,
      text: step.body,
      ...(step.image ? { image: `${SITE}${step.image}` } : {}),
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([howToLd, faqLd]) }}
      />
      <SetHomepageGuide guide={guide} />
    </>
  );
}
