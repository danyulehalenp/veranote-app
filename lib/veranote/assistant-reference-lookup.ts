import type { AssistantExternalAnswerMeta, AssistantReferenceSource } from '@/types/assistant';
import { getAssistantReferencePolicy } from '@/lib/veranote/assistant-source-policy';

type Fetcher = typeof fetch;

const DEFAULT_TIMEOUT_MS = 3000;

export async function hydrateTrustedReferenceSources(
  query: string,
  initialReferences: AssistantReferenceSource[] = [],
  fetcher: Fetcher = fetch,
): Promise<AssistantReferenceSource[]> {
  const policy = getAssistantReferencePolicy(query);
  const candidates = dedupeReferences([
    ...policy.directReferences,
    ...filterToAllowedDomains(initialReferences, policy.allowedDomains),
    ...policy.searchReferences,
  ]).slice(0, 4);

  const hydrated = await Promise.all(
    candidates.map(async (reference) => {
      const title = await fetchPageTitle(reference.url, fetcher);
      if (title && !isGenericTitle(title) && isPlaceholderLabel(reference.label)) {
        return {
          ...reference,
          label: title,
        };
      }

      return reference;
    }),
  );

  return dedupeReferences(hydrated);
}

export function buildExternalAnswerMeta(message: string, references: AssistantReferenceSource[] = []): AssistantExternalAnswerMeta {
  const normalizedMessage = message.trim().toLowerCase();

  if (normalizedMessage.startsWith("i don't have a trusted reference answer")) {
    return {
      level: 'not-yet-taught',
      label: 'Not yet taught',
      detail: 'Vera does not have a trusted reference answer for this yet and should not guess.',
    };
  }

  const hasDirectTrustedPage = references.some((reference) => !isSearchReference(reference.url));
  const hasSearchReference = references.some((reference) => isSearchReference(reference.url));

  if (hasDirectTrustedPage) {
    return {
      level: 'direct-trusted-page',
      label: 'Direct trusted page',
      detail: 'This answer is backed by at least one direct approved source page rather than only a search route.',
    };
  }

  if (hasSearchReference) {
    return {
      level: 'trusted-search-path',
      label: 'Trusted search path',
      detail: 'This answer is anchored to approved search routes, but not yet tied to a direct source page.',
    };
  }

  return {
    level: 'not-yet-taught',
    label: 'Not yet taught',
    detail: 'Vera should stay cautious here because she does not have a direct approved source answer yet.',
  };
}

async function fetchPageTitle(url: string, fetcher: Fetcher) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const response = await fetcher(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Veranote-Vera-ReferenceLookup/1.0',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (!titleMatch?.[1]) {
      return null;
    }

    return cleanupTitle(titleMatch[1]);
  } catch {
    return null;
  }
}

function cleanupTitle(title: string) {
  return decodeHtmlEntities(title)
    .replace(/\s+/g, ' ')
    .replace(/\s*[|·-]\s*(CDC|CMS).*$/i, '')
    .trim();
}

function isGenericTitle(title: string) {
  return /^(search|search results)$/i.test(title.trim());
}

function isPlaceholderLabel(label: string) {
  return /site search|documentation search|search path|search route/i.test(label.trim());
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function dedupeReferences(references: AssistantReferenceSource[]) {
  const seen = new Set<string>();
  return references.filter((reference) => {
    if (!reference.url || seen.has(reference.url)) {
      return false;
    }

    seen.add(reference.url);
    return true;
  });
}

function filterToAllowedDomains(references: AssistantReferenceSource[], allowedDomains: string[]) {
  if (!allowedDomains.length) {
    return references;
  }

  return references.filter((reference) => allowedDomains.some((domain) => reference.url.includes(domain)));
}

function isSearchReference(url: string) {
  return /\/search\/|\/search\?|\bcms\/search\/cms\b/i.test(url);
}
