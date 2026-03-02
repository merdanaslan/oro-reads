export interface BlinkActionLink {
  href?: string;
  label?: string;
  [key: string]: unknown;
}

export interface BlinkLinks {
  actions?: BlinkActionLink[];
  [key: string]: unknown;
}

export interface BlinkMetadataPayload {
  links?: BlinkLinks;
  [key: string]: unknown;
}

export interface UpstreamResponse {
  payload: unknown;
  actionVersion: string | null;
  blockchainIds: string | null;
}

export interface BlinkErrorPayload {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class BlinkHttpError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  public constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
