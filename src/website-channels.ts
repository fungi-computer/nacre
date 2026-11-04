/**
 * What a host's owner settings read about a website chat channel: the web
 * origin grammar both the Oyster and Hub enforce and the Settings form checks,
 * and the wire shapes of a website, its conversations and a transcript.
 */
import { z } from "zod";

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** One refused-origin reason, keyed for callers that name it to a person. */
export type WebOriginProblem =
  "tooLong" | "notUrl" | "insecure" | "credentials" | "path" | "notAllowed";
const webOriginProblems = {
  tooLong: "Origin is too long",
  notUrl: "Origin is not a URL",
  insecure: "Origin must use https",
  credentials: "Origin must not carry credentials",
  path: "Origin must not carry a path, query or fragment",
  notAllowed: "Origin is not allowed",
} as const satisfies Record<WebOriginProblem, string>;
const webOriginProblemNames: readonly WebOriginProblem[] = [
  "tooLong",
  "notUrl",
  "insecure",
  "credentials",
  "path",
  "notAllowed",
];

/** The reason a refused origin's first issue names. */
export function webOriginProblem(error: z.ZodError): WebOriginProblem {
  const message = error.issues[0]?.message;
  return (
    webOriginProblemNames.find(
      (problem) => webOriginProblems[problem] === message,
    ) ?? "notAllowed"
  );
}

/**
 * Parse one allowed embed origin: exact `https://host[:port]`, one leading
 * `*.` subdomain level, or `http` only on loopback for development. Paths,
 * credentials, queries and bare wildcards are rejected. The Hub stores and
 * enforces these; Settings runs the same schema before it sends one.
 */
export const webOriginSchema = z
  .string()
  .max(253, webOriginProblems.tooLong)
  .transform((value, context) => {
    const refuse = (problem: WebOriginProblem) => {
      context.addIssue({ code: "custom", message: webOriginProblems[problem] });
      return z.NEVER;
    };
    const wildcard = value.startsWith("https://*.");
    const candidate = wildcard ? value.replace("*.", "") : value;
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      return refuse("notUrl");
    }
    const secure =
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        !wildcard &&
        loopbackHosts.has(url.hostname));
    if (!secure) return refuse("insecure");
    if (url.username !== "" || url.password !== "")
      return refuse("credentials");
    if (url.pathname !== "/" || url.search !== "" || url.hash !== "")
      return refuse("path");
    if (
      url.origin !== candidate.toLowerCase() ||
      url.hostname.includes("*") ||
      (wildcard && url.hostname.split(".").length < 2)
    )
      return refuse("notAllowed");
    return wildcard ? `https://*.${url.host}` : url.origin;
  });

const identity = z.string().min(1).max(256);

/** How a website is found and where it may appear. */
export type WebsiteSelector = {
  /** Websites are the web provider's bindings. */
  provider: "web";
  /** The public key in the pasted snippet. */
  siteKey: string;
  /** The origins allowed to embed the chat. */
  origins: string[];
  /** The owner's accent colour, `#rrggbb`. */
  accent?: string | undefined;
  /** Visitors must pass Cloudflare Turnstile before they can chat. */
  turnstile?: boolean | undefined;
};

/** One website as an owner's Settings read it. */
export type WebsiteSite = {
  /** The binding's identity on its host. */
  bindingId: string;
  /** The Agent visitors chat with, named by its id in the host's directory. */
  agentId: string;
  /** How the embed finds the website and where it may appear. */
  selector: WebsiteSelector;
  /** Whether visitors can chat now. */
  lifecycle: "active" | "suspended";
  /** The version an edit must name; it advances on every edit. */
  authorityVersion: number;
  /** The owner's brief for this website; visitors never see it. */
  persona: string;
};
/** One website as an owner's Settings read it. */
export const websiteSiteSchema: z.ZodType<WebsiteSite> = z.object({
  bindingId: identity,
  agentId: identity,
  selector: z.object({
    provider: z.literal("web"),
    siteKey: identity,
    origins: z.array(z.string()).min(1).max(16),
    accent: z.string().optional(),
    turnstile: z.boolean().optional(),
  }),
  lifecycle: z.enum(["active", "suspended"]),
  authorityVersion: z.number().int().positive(),
  persona: z.string().max(4_000),
});

/** One conversation of a website, newest first. */
export type WebsiteConversation = {
  /** The conversation's Session on the website's Agent. */
  sessionId: string;
  /** A short label for the visitor. */
  label: string;
  /** When the visitor or the Agent last wrote, in epoch milliseconds. */
  lastEventAt: number;
};
/** One conversation of a website. */
export const websiteConversationSchema: z.ZodType<WebsiteConversation> =
  z.object({
    sessionId: identity,
    label: z.string(),
    lastEventAt: z.number().int().nonnegative(),
  });

/** One line of a website conversation as its owner reads it. */
export type TranscriptLine = {
  /** Who wrote the line. */
  role: "visitor" | "agent";
  /** What was written. */
  text: string;
};

/** An owner's read of one website conversation. */
export type WebsiteTranscript = {
  /** The conversation's Session on the website's Agent. */
  sessionId: string;
  /** A short label for the visitor. */
  label: string;
  /** What visitor and Agent said, oldest first. */
  lines: TranscriptLine[];
};
/** An owner's read of one website conversation. */
export const websiteTranscriptSchema: z.ZodType<WebsiteTranscript> =
  z.strictObject({
    sessionId: identity,
    label: z.string(),
    lines: z.array(
      z.strictObject({
        role: z.enum(["visitor", "agent"]),
        text: z.string(),
      }),
    ),
  });

/** One content part of a message; only text parts are read. */
export type TranscriptPart = {
  /** The part's kind; `text` parts carry the words. */
  type: string;
  /** The words of a text part. */
  text?: string | undefined;
};

/**
 * The part of a Session message a transcript reads: who said it and what the
 * content holds. A Shiitake message satisfies it without this package knowing
 * Shiitake.
 */
export type TranscriptMessage = {
  /** The model message. */
  value: {
    /** `user` for a visitor's prompt, `assistant` for the Agent's reply. */
    role: string;
    /** Plain text, or content parts of which only text parts are read. */
    content: string | readonly TranscriptPart[];
  };
};

/**
 * The visible line of one message: a visitor's prompt or the Agent's reply.
 * Tool traffic and empty turns are not conversation, so they have no line.
 */
export function transcriptLine(
  message: TranscriptMessage,
): TranscriptLine | null {
  const { role, content } = message.value;
  if (role !== "user" && role !== "assistant") return null;
  const text = hasParts(content)
    ? content
        .flatMap((part) => (part.type === "text" ? [part.text ?? ""] : []))
        .join("")
    : content;
  if (text.trim() === "") return null;
  return { role: role === "user" ? "visitor" : "agent", text };
}

/** `Array.isArray` does not narrow a readonly array out of the union. */
function hasParts(
  content: TranscriptMessage["value"]["content"],
): content is readonly TranscriptPart[] {
  return Array.isArray(content);
}
