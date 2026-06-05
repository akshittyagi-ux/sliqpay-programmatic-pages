import { GetStaticPaths, GetStaticProps } from 'next';
import { db } from '../../../db/finalInfoDB';
import ComparisonPageLayout from '../../../components/ComparisonPageLayout';

type PageProps = {
  content: Record<string, unknown>;
  competitor: string;
  pageType: string;
  metaTitle?: string;
  metaDescription?: string;
};

export default function ComparisonPage(props: PageProps) {
  return <ComparisonPageLayout {...props} />;
}

export const getStaticPaths: GetStaticPaths = async () => {
  if (!process.env.DATABASE_URL) {
    return { paths: [], fallback: 'blocking' };
  }

  const { rows } = await db.query<{ slug: string; page_type: string }>(`
    SELECT c.slug, pc.page_type
    FROM page_content pc
    JOIN competitors c ON c.id = pc.competitor_id
  `);

  return {
    paths: rows.map((r) => ({
      params: { competitor: r.slug, pageType: r.page_type },
    })),
    fallback: 'blocking',
  };
};

export const getStaticProps: GetStaticProps<PageProps> = async ({ params }) => {
  if (!process.env.DATABASE_URL || !params?.competitor || !params?.pageType) {
    return { notFound: true };
  }

  const competitorSlug = String(params.competitor);
  const pageType = String(params.pageType);

  const { rows } = await db.query<{
    content: Record<string, unknown>;
    name: string;
    meta_title: string | null;
    meta_description: string | null;
  }>(
    `
    SELECT pc.content, c.name, pc.meta_title, pc.meta_description
    FROM page_content pc
    JOIN competitors c ON c.id = pc.competitor_id
    WHERE c.slug = $1 AND pc.page_type = $2
  `,
    [competitorSlug, pageType]
  );

  if (!rows[0]) return { notFound: true };

  return {
    props: {
      content: rows[0].content,
      competitor: rows[0].name,
      pageType,
      metaTitle: rows[0].meta_title ?? undefined,
      metaDescription: rows[0].meta_description ?? undefined,
    },
    revalidate: 60 * 60 * 24 * 30,
  };
};
