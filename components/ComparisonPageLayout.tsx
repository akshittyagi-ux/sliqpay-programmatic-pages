import Head from 'next/head';
import {
  orderedSectionKeys,
  renderSectionContent,
  sectionTitleStyle,
} from './comparison/renderContent';

export type ComparisonPageProps = {
  pageType: string;
  competitor: string;
  content: Record<string, unknown>;
  metaTitle?: string;
  metaDescription?: string;
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: '2.5rem' }}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      {children}
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
  const sectionKeys = orderedSectionKeys(content);

  return (
    <>
      <Head>
        <title>{title}</title>
        {description ? <meta name="description" content={description} /> : null}
      </Head>
      <main
        style={{
          maxWidth: 960,
          margin: '0 auto',
          padding: '2rem 1.5rem 3rem',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          color: '#18181b',
        }}
      >
        <header style={{ marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid #e4e4e7' }}>
          {typeof content.page_title !== 'string' ? (
            <p style={{ color: '#a1a1aa', fontSize: '0.75rem', margin: '0 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {pageType.replace(/-/g, ' ')}
            </p>
          ) : null}
          <h1 style={{ fontSize: '2rem', margin: '0 0 0.5rem', lineHeight: 1.25, fontWeight: 700 }}>
            {(hero?.headline as string) || title}
          </h1>
          {hero?.subheadline ? (
            <p style={{ fontSize: '1.125rem', color: '#52525b', margin: 0, lineHeight: 1.55 }}>
              {String(hero.subheadline)}
            </p>
          ) : description ? (
            <p style={{ fontSize: '1.05rem', color: '#52525b', margin: 0, lineHeight: 1.55 }}>{description}</p>
          ) : null}
        </header>

        {sectionKeys.map((key) => {
          const rendered = renderSectionContent(key, content[key], competitor);
          if (rendered == null) return null;

          const sectionTitle = key
            .replace(/_/g, ' ')
            .replace(/\b(sliqpay|sliq pay)\b/gi, 'Sliq pay')
            .replace(/\bcomp\b/gi, competitor);

          return (
            <Section key={key} title={sectionTitle}>
              {rendered}
            </Section>
          );
        })}
      </main>
    </>
  );
}
