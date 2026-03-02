import { BlinkActionLink, BlinkMetadataPayload } from "./types";

export function rewriteActionHrefs(payload: BlinkMetadataPayload, localBaseUrl: string): BlinkMetadataPayload {
  if (!payload.links || !Array.isArray(payload.links.actions)) {
    return payload;
  }

  const rewrittenActions = payload.links.actions.map((action) => rewriteAction(action, localBaseUrl));

  return {
    ...payload,
    links: {
      ...payload.links,
      actions: rewrittenActions
    }
  };
}

function rewriteAction(action: BlinkActionLink, localBaseUrl: string): BlinkActionLink {
  if (typeof action.href !== "string" || action.href.trim().length === 0) {
    return action;
  }

  const rewrittenHref = toLocalHref(action.href, localBaseUrl);
  return {
    ...action,
    href: rewrittenHref
  };
}

function toLocalHref(href: string, localBaseUrl: string): string {
  const trimmed = href.trim();

  if (trimmed.startsWith("/")) {
    return new URL(trimmed, localBaseUrl).toString();
  }

  try {
    const parsed = new URL(trimmed);
    return new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, localBaseUrl).toString();
  } catch {
    return new URL(`/${trimmed.replace(/^\/+/, "")}`, localBaseUrl).toString();
  }
}
