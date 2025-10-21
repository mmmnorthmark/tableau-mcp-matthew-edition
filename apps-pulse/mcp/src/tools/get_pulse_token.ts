import jwt from "jsonwebtoken";
import { z } from "zod";

const GetPulseTokenSchema = z.object({
  metricUrl: z.string().url(),
  sub: z.string(),
  ttlSec: z.number().min(60).max(600).default(300),
});

export const getPulseTokenTool = {
  name: "get_pulse_token",
  description:
    "Generate a short-lived Connected Apps JWT token for embedding a Tableau Pulse metric. " +
    "The token is valid for the specified TTL (default 300s, max 600s) and signed server-side " +
    "with Direct Trust credentials. Validates that the metric URL matches the configured Tableau host.",
  inputSchema: {
    type: "object",
    properties: {
      metricUrl: {
        type: "string",
        description: "Full URL of the Pulse metric to embed (e.g., https://online.tableau.com/#/site/mysite/pulse/metrics/12345)",
      },
      sub: {
        type: "string",
        description: "Tableau username (subject claim) for the authenticated user",
      },
      ttlSec: {
        type: "number",
        description: "Token time-to-live in seconds (default: 300, max: 600)",
        default: 300,
      },
    },
    required: ["metricUrl", "sub"],
  },
  _meta: {
    "openai/outputTemplate": "ui://widget/pulse.html",
    "openai/componentInitiable": true,
  },
};

export async function getPulseToken(args: unknown) {
  const parsed = GetPulseTokenSchema.parse(args);
  const { metricUrl, sub, ttlSec } = parsed;

  // Validate environment
  const clientId = process.env.CONNECTED_APP_CLIENT_ID;
  const secretId = process.env.CONNECTED_APP_SECRET_ID;
  const secretValue = process.env.CONNECTED_APP_SECRET_VALUE;
  const tableauHost = process.env.TABLEAU_HOST;
  const siteName = process.env.SITE_NAME;

  if (!clientId || !secretId || !secretValue || !tableauHost || !siteName) {
    throw new Error(
      "Missing required environment variables: CONNECTED_APP_CLIENT_ID, " +
      "CONNECTED_APP_SECRET_ID, CONNECTED_APP_SECRET_VALUE, TABLEAU_HOST, SITE_NAME"
    );
  }

  // Security: validate metric URL matches configured Tableau host
  const metricUrlObj = new URL(metricUrl);
  const expectedHost = new URL(tableauHost).host;
  if (metricUrlObj.host !== expectedHost) {
    throw new Error(
      `Metric URL host (${metricUrlObj.host}) does not match configured Tableau host (${expectedHost})`
    );
  }

  // Validate site in URL matches configured site
  if (!metricUrl.includes(`/site/${siteName}/`)) {
    throw new Error(
      `Metric URL does not contain expected site: ${siteName}`
    );
  }

  // Generate Connected Apps JWT (Direct Trust)
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + ttlSec;

  const payload = {
    iss: clientId,
    exp: expiresAt,
    jti: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    aud: "tableau",
    sub,
    scp: ["tableau:views:embed", "tableau:metrics:embed"],
    // Optional: add custom claims for user attributes
    // "https://tableau.com/groups": ["All Users"],
  };

  const header = {
    alg: "HS256",
    typ: "JWT",
    kid: secretId,
    iss: clientId,
  };

  const token = jwt.sign(payload, secretValue, {
    algorithm: "HS256",
    header,
  });

  // Security: never log the token itself
  console.log(`[get_pulse_token] Generated token for sub=${sub}, ttl=${ttlSec}s, expires=${new Date(expiresAt * 1000).toISOString()}`);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            token,
            expiresAt: new Date(expiresAt * 1000).toISOString(),
            metricUrl,
            tableauHost,
          },
          null,
          2
        ),
      },
    ],
  };
}
