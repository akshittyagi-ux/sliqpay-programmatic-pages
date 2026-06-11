import type { CSSProperties, ReactNode } from 'react';

const colors = {
  bg: '#fafafa',
  border: '#e4e4e7',
  text: '#18181b',
  muted: '#52525b',
  accent: '#0f766e',
  accentBg: '#f0fdfa',
  warn: '#b45309',
  warnBg: '#fffbeb',
  sliq: '#0f766e',
  comp: '#4338ca',
};

export const sectionTitleStyle: CSSProperties = {
  fontSize: '1.25rem',
  fontWeight: 600,
  marginBottom: '0.75rem',
  color: colors.text,
  textTransform: 'capitalize',
};

function formatLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b(sliqpay|sliq pay)\b/gi, 'Sliq pay')
    .replace(/\bcomp\b/gi, 'Competitor')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function isObjectArray(v: unknown): v is Record<string, unknown>[] {
  return Array.isArray(v) && v.length > 0 && v.every(isRecord);
}

function getFaqItems(
  items: Record<string, unknown>[]
): { question: string; answer: string }[] {
  return items.map((item) => ({
    question: String(item.question ?? item.q ?? item.title ?? ''),
    answer: String(item.answer ?? item.a ?? item.body ?? item.content ?? ''),
  }));
}

function Banner({ data }: { data: Record<string, unknown> }) {
  const headline = data.headline ?? data.title ?? data.verdict ?? data.winner;
  const body = data.body ?? data.subheadline ?? data.summary ?? data.message ?? data.text;

  return (
    <div
      style={{
        background: colors.accentBg,
        border: `1px solid ${colors.accent}`,
        borderRadius: '10px',
        padding: '1rem 1.25rem',
        marginBottom: '0.5rem',
      }}
    >
      {headline ? (
        <p style={{ fontWeight: 600, fontSize: '1.05rem', margin: '0 0 0.35rem', color: colors.accent }}>
          {String(headline)}
        </p>
      ) : null}
      {body ? <p style={{ margin: 0, color: colors.muted, lineHeight: 1.55 }}>{String(body)}</p> : null}
      {Object.entries(data)
        .filter(([k]) => !['headline', 'title', 'verdict', 'winner', 'body', 'subheadline', 'summary', 'message', 'text'].includes(k))
        .map(([k, v]) =>
          v != null && v !== '' ? (
            <p key={k} style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', color: colors.text }}>
              <strong>{formatLabel(k)}:</strong> {typeof v === 'object' ? JSON.stringify(v) : String(v)}
            </p>
          ) : null)}
    </div>
  );
}

function DataGaps({ items }: { items: string[] }) {
  return (
    <div
      style={{
        background: colors.warnBg,
        border: `1px solid ${colors.warn}`,
        borderRadius: '10px',
        padding: '1rem 1.25rem',
      }}
    >
      <p style={{ margin: '0 0 0.5rem', fontWeight: 600, color: colors.warn, fontSize: '0.9rem' }}>
        Information we could not verify from sources
      </p>
      <ul style={{ margin: 0, paddingLeft: '1.25rem', color: colors.muted, lineHeight: 1.6 }}>
        {items.map((item, i) => (
          <li key={i} style={{ marginBottom: '0.35rem' }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.65, color: colors.text }}>
      {items.map((item, i) => (
        <li key={i} style={{ marginBottom: '0.4rem' }}>
          {item}
        </li>
      ))}
    </ul>
  );
}

function ComparisonTable({
  rows,
  competitorName,
}: {
  rows: Record<string, unknown>[];
  competitorName: string;
}) {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const columnOrder = ['category', 'feature', 'aspect', 'dimension', 'criterion'];
  const orderedKeys = [
    ...columnOrder.filter((k) => keys.includes(k)),
    ...keys.filter((k) => !columnOrder.includes(k)),
  ];

  const headerLabel = (key: string): string => {
    const lower = key.toLowerCase();
    if (lower === 'sliqpay' || lower === 'sliq_pay') return 'Sliq pay';
    if (lower === 'wise' || lower === 'comp' || lower === 'competitor') return competitorName;
    if (lower === 'takeaway' || lower === 'summary' || lower === 'notes') return 'Summary';
    return formatLabel(key);
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.9rem',
          background: '#fff',
          border: `1px solid ${colors.border}`,
          borderRadius: '8px',
        }}
      >
        <thead>
          <tr style={{ background: colors.bg }}>
            {orderedKeys.map((key) => (
              <th
                key={key}
                style={{
                  textAlign: 'left',
                  padding: '0.65rem 0.85rem',
                  borderBottom: `1px solid ${colors.border}`,
                  fontWeight: 600,
                  color: colors.muted,
                  fontSize: '0.8rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.02em',
                }}
              >
                {headerLabel(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${colors.border}` : undefined }}>
              {orderedKeys.map((key) => {
                const val = row[key];
                const isSliq = key.toLowerCase().includes('sliq');
                const isComp =
                  ['wise', 'comp', 'competitor'].some((k) => key.toLowerCase() === k) ||
                  key.toLowerCase() === competitorName.toLowerCase();
                return (
                  <td
                    key={key}
                    style={{
                      padding: '0.75rem 0.85rem',
                      verticalAlign: 'top',
                      lineHeight: 1.5,
                      color: isSliq ? colors.sliq : isComp ? colors.comp : colors.text,
                      fontWeight: key === 'category' || key === 'feature' ? 500 : 400,
                    }}
                  >
                    {val == null ? '—' : String(val)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cards({ items }: { items: Record<string, unknown>[] }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: '1rem',
      }}
    >
      {items.map((item, i) => {
        const title = item.title ?? item.headline ?? item.name ?? item.category ?? item.label;
        const body =
          item.body ??
          item.description ??
          item.content ??
          item.text ??
          item.summary ??
          item.takeaway;
        return (
          <div
            key={i}
            style={{
              border: `1px solid ${colors.border}`,
              borderRadius: '10px',
              padding: '1rem 1.15rem',
              background: '#fff',
            }}
          >
            {title ? (
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 600 }}>{String(title)}</h3>
            ) : null}
            {body ? (
              <p style={{ margin: 0, color: colors.muted, lineHeight: 1.55, fontSize: '0.9rem' }}>{String(body)}</p>
            ) : null}
            {Object.entries(item)
              .filter(
                ([k]) =>
                  !['title', 'headline', 'name', 'category', 'label', 'body', 'description', 'content', 'text', 'summary', 'takeaway'].includes(
                    k
                  )
              )
              .map(([k, v]) =>
                v != null && v !== '' ? (
                  <p key={k} style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: colors.text }}>
                    <span style={{ color: colors.muted }}>{formatLabel(k)}: </span>
                    {String(v)}
                  </p>
                ) : null)}
          </div>
        );
      })}
    </div>
  );
}

function KeyValueBlock({ data }: { data: Record<string, unknown> }) {
  return (
    <dl style={{ margin: 0, display: 'grid', gap: '0.5rem' }}>
      {Object.entries(data).map(([key, value]) => (
        <div
          key={key}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(120px, 180px) 1fr',
            gap: '0.75rem',
            padding: '0.5rem 0',
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <dt style={{ margin: 0, fontWeight: 500, color: colors.muted, fontSize: '0.875rem' }}>
            {formatLabel(key)}
          </dt>
          <dd style={{ margin: 0, color: colors.text, lineHeight: 1.5 }}>
            {Array.isArray(value) ? (
              isStringArray(value) ? (
                <BulletList items={value} />
              ) : (
                String(value)
              )
            ) : isRecord(value) ? (
              <KeyValueBlock data={value} />
            ) : (
              String(value ?? '—')
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function FaqList({ items }: { items: { question: string; answer: string }[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {items.map((faq, i) => (
        <details
          key={i}
          style={{
            border: `1px solid ${colors.border}`,
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            background: '#fff',
          }}
        >
          <summary
            style={{
              cursor: 'pointer',
              fontWeight: 600,
              color: colors.text,
              lineHeight: 1.45,
            }}
          >
            {faq.question || `Question ${i + 1}`}
          </summary>
          <p style={{ margin: '0.75rem 0 0', color: colors.muted, lineHeight: 1.6 }}>{faq.answer}</p>
        </details>
      ))}
    </div>
  );
}

function CtaBlock({ data }: { data: Record<string, unknown> }) {
  const headline = data.headline ?? data.title ?? data.text;
  const button = data.button_text ?? data.cta_text ?? data.label ?? data.button;
  const url = data.url ?? data.href ?? data.link;

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #0f766e 0%, #115e59 100%)',
        color: '#fff',
        borderRadius: '12px',
        padding: '1.5rem 1.75rem',
        textAlign: 'center',
      }}
    >
      {headline ? <p style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 600 }}>{String(headline)}</p> : null}
      {button ? (
        url ? (
          <a
            href={String(url)}
            style={{
              display: 'inline-block',
              background: '#fff',
              color: colors.accent,
              padding: '0.65rem 1.5rem',
              borderRadius: '8px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            {String(button)}
          </a>
        ) : (
          <span
            style={{
              display: 'inline-block',
              background: '#fff',
              color: colors.accent,
              padding: '0.65rem 1.5rem',
              borderRadius: '8px',
              fontWeight: 600,
            }}
          >
            {String(button)}
          </span>
        )
      ) : null}
      {Object.entries(data)
        .filter(([k]) => !['headline', 'title', 'text', 'button_text', 'cta_text', 'label', 'button', 'url', 'href', 'link'].includes(k))
        .map(([k, v]) =>
          v ? (
            <p key={k} style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', opacity: 0.9 }}>
              {formatLabel(k)}: {String(v)}
            </p>
          ) : null)}
    </div>
  );
}

function SideBySideLists({
  left,
  right,
  leftLabel,
  rightLabel,
}: {
  left: string[];
  right: string[];
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
      <div>
        <h4 style={{ margin: '0 0 0.5rem', color: colors.sliq, fontSize: '0.95rem' }}>{leftLabel}</h4>
        <BulletList items={left} />
      </div>
      <div>
        <h4 style={{ margin: '0 0 0.5rem', color: colors.comp, fontSize: '0.95rem' }}>{rightLabel}</h4>
        <BulletList items={right} />
      </div>
    </div>
  );
}

function DeepDiveSections({ items }: { items: Record<string, unknown>[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {items.map((section, i) => {
        const heading = section.title ?? section.heading ?? section.name;
        const body =
          section.body ??
          section.content ??
          section.text ??
          section.paragraphs ??
          section.description;
        return (
          <article key={i}>
            {heading ? (
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', fontWeight: 600 }}>{String(heading)}</h3>
            ) : null}
            {Array.isArray(body) && isStringArray(body) ? (
              body.map((p, j) => (
                <p key={j} style={{ margin: '0 0 0.75rem', color: colors.muted, lineHeight: 1.65 }}>
                  {p}
                </p>
              ))
            ) : body ? (
              <p style={{ margin: 0, color: colors.muted, lineHeight: 1.65 }}>{String(body)}</p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

export function renderSectionContent(
  sectionKey: string,
  data: unknown,
  competitorName: string
): ReactNode {
  if (data == null) return null;

  const key = sectionKey.toLowerCase();

  if (key === 'data_gaps' && isStringArray(data)) {
    return <DataGaps items={data} />;
  }

  if ((key.includes('banner') || key === 'verdict_banner' || key === 'winner_banner') && isRecord(data)) {
    return <Banner data={data} />;
  }

  if (key === 'cta' && isRecord(data)) {
    return <CtaBlock data={data} />;
  }

  if (key === 'faqs') {
    if (isObjectArray(data)) return <FaqList items={getFaqItems(data)} />;
    if (isStringArray(data)) return <BulletList items={data} />;
  }

  if (isStringArray(data)) {
    return <BulletList items={data} />;
  }

  if (isObjectArray(data)) {
    const sample = data[0];
    const keys = Object.keys(sample);

    if (key.includes('deep_dive')) {
      return <DeepDiveSections items={data} />;
    }

    if (keys.some((k) => ['question', 'q'].includes(k.toLowerCase()))) {
      return <FaqList items={getFaqItems(data)} />;
    }

    if (
      keys.some((k) => ['sliqpay', 'wise', 'comp', 'competitor', 'takeaway'].includes(k.toLowerCase())) ||
      key.includes('table') ||
      key.includes('rows') ||
      key.includes('score') ||
      key.includes('rails') ||
      key.includes('security') ||
      key.includes('scenarios') ||
      key.includes('feature')
    ) {
      return <ComparisonTable rows={data} competitorName={competitorName} />;
    }

    if (
      keys.some((k) => ['title', 'headline', 'name'].includes(k.toLowerCase())) &&
      keys.some((k) => ['body', 'description', 'content', 'text'].includes(k.toLowerCase()))
    ) {
      return <Cards items={data} />;
    }

    return <ComparisonTable rows={data} competitorName={competitorName} />;
  }

  if (isRecord(data)) {
    const stepsSliq = data.steps_sliq;
    const stepsComp = data.steps_comp;
    if (isStringArray(stepsSliq) && isStringArray(stepsComp)) {
      return (
        <SideBySideLists
          left={stepsSliq}
          right={stepsComp}
          leftLabel="Sliq pay"
          rightLabel={competitorName}
        />
      );
    }

    return <KeyValueBlock data={data} />;
  }

  return <p style={{ color: colors.muted, lineHeight: 1.6 }}>{String(data)}</p>;
}

/** Section keys in a sensible display order */
export function orderedSectionKeys(content: Record<string, unknown>): string[] {
  const skip = new Set(['meta_title', 'meta_description', 'page_title', 'hero']);
  const priority = [
    'verdict_banner',
    'winner_banner',
    'data_gaps',
    'score_cards',
    'comparison_table_rows',
    'comparison_summary',
    'deep_dive_sections',
    'fee_breakdown_sliq',
    'fee_breakdown_comp',
    'transfer_scenarios',
    'timeline_sliq',
    'timeline_comp',
    'transfer_rails_table',
    'trust_badges',
    'security_comparison_rows',
    'steps_sliq',
    'steps_comp',
    'feature_checklist',
    'use_case_cards',
    'comparison_points_sliq',
    'comparison_points_comp',
    'savings_cards',
    'nri_feature_table',
    'reasons_to_switch',
    'switch_steps',
    'faqs',
    'cta',
  ];

  const keys = Object.keys(content).filter((k) => !skip.has(k));
  return [
    ...priority.filter((k) => keys.includes(k)),
    ...keys.filter((k) => !priority.includes(k)),
  ];
}
