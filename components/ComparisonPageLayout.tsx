import Head from 'next/head';

export type ComparisonPageProps = {
  pageType: string;
  competitor: string;
  content: Record<string, unknown>;
  metaTitle?: string;
  metaDescription?: string;
};

function Section({ title, data }: { title: string; data: unknown }) {
  if (data == null) return null;
  return (
    <section style={{ marginBottom: '2rem' }}>
      <h2>{title}</h2>
      <pre
        style={{
          background: '#f4f4f5',
          padding: '1rem',
          borderRadius: '8px',
          overflow: 'auto',
          fontSize: '0.875rem',
        }}
      >
        {JSON.stringify(data, null, 2)}
      </pre>
    </section>
  );
}

export default function ComparisonPageLayout({
  pageType,
  competitor,
  content,
  metaTitle,
  metaDescription,
}: ComparisonPageProps) {
  const title =
    metaTitle ||
    (typeof content.page_title === 'string' ? content.page_title : undefined) ||
    (typeof content.meta_title === 'string' ? content.meta_title : undefined) ||
    `Sliq pay vs ${competitor}`;
  const description =
    metaDescription ||
    (typeof content.meta_description === 'string' ? content.meta_description : undefined);

  const hero = content.hero as Record<string, unknown> | undefined;
  const faqs = content.faqs;

  return (
    <>
      <Head>
        <title>{title}</title>
        {description ? <meta name="description" content={description} /> : null}
      </Head>
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem' }}>
        {typeof content.page_title === 'string' ? null : (
          <p style={{ color: '#71717a', fontSize: '0.75rem' }}>{pageType}</p>
        )}
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
          {(hero?.headline as string) || title}
        </h1>
        {hero?.subheadline ? (
          <p style={{ fontSize: '1.125rem', color: '#3f3f46' }}>{String(hero.subheadline)}</p>
        ) : null}

        {Object.entries(content)
          .filter(([key]) =>
            !['meta_title', 'meta_description', 'page_title', 'hero', 'faqs', 'cta'].includes(key)
          )
          .map(([key, value]) => (
            <Section key={key} title={key.replace(/_/g, ' ')} data={value} />
          ))}

        <Section title="FAQs" data={faqs} />
        <Section title="CTA" data={content.cta} />
      </main>
    </>
  );
}
