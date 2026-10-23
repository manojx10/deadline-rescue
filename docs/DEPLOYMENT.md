# Private-preview deployment

Hosting is not required for the Alexa+ track: a locally runnable public repository and demo video are sufficient. This optional Docker deployment is for a **private, single-user preview** only. It does not turn the current shared SQLite database into a safe multi-user product.

## What this configuration does

- Builds the FastAPI backend as a non-root container with a persistent named data volume.
- Builds the React app and serves it with Caddy over HTTPS at one origin.
- Keeps the backend off the public network; only Caddy can reach it.
- Uses Caddy HTTP basic authentication to gate a private demo and injects the backend bearer token server-side. The token is never bundled into Vite output.
- Configures exact CORS/MCP origins, HTTPS headers, production fail-closed auth, and per-process rate limits.

## Deploy

1. Point a DNS name at the server and allow inbound ports 80 and 443.
2. Copy `deploy/.env.example` to the ignored `deploy/.env`, replacing all five values. Generate the Caddy password hash with the command in that file; do not place the plaintext password or API token in Git.
3. From the repository root, run:

   ```bash
   docker compose --env-file deploy/.env up --build -d
   ```

4. Open the HTTPS URL, authenticate through the preview gate, create a task, then verify the browser MCP simulator can initialize and list tools.

## Security boundary

Every person who passes the preview gate reaches the same local database. That is acceptable for the owner's private demo but not for public users. Before a public multi-user release, add real identity-aware sessions, user-scoped data ownership and authorization, durable backups, a production database, audit logging appropriate to the product, and gateway/WAF limits. Do not remove the backend bearer check or put its token in a `VITE_*` variable to work around this.

## Operational notes

- Caddy obtains and renews TLS certificates when the host is reachable on ports 80 and 443.
- The named `deadline-rescue-data` volume contains the private SQLite database. Back it up using the host's approved encrypted backup procedure; never add it to the repository.
- Use one backend worker with SQLite. Horizontal workers or replicas require a shared production database and a distributed rate limiter.
- For an external MCP client, configure `DEADLINE_RESCUE_MCP_TOKEN` separately on the backend and send that token directly only from a trusted client. The browser simulator should continue to use the same-origin private-preview proxy.
