# Running SEO Forge on the tailnet

SEO Forge runs permanently on `sinfa-core` and is reachable from any device on the tailnet at:

**https://sinfa-core.tail401389.ts.net:8450/**

It is tailnet-only (`tailscale serve`, never `funnel`) and not on Netlify.
It cannot go on Netlify as-is: it is a Cloudflare Workers app with D1 and Durable Objects, not a static site.

## How it is wired

```
phone / laptop on tailnet
  -> https://sinfa-core.tail401389.ts.net:8450   tailscale serve (HTTPS, tailnet only)
  -> http://127.0.0.1:3001                       vite dev, run by seo-forge.service
```

- `~/.config/systemd/user/seo-forge.service` runs `vite dev` on `127.0.0.1:3001`, loopback only.
  It starts at boot (linger is enabled for `sinfa`) and restarts on failure.
- `tailscale serve` maps HTTPS port 8450 to it.
  The mapping is stored by tailscaled and also survives a reboot.
- It is the dev server, so code changes in this checkout show up live, and it uses the same local D1 database in `.wrangler/state/` as `pnpm dev`.
- `.env.local` sets `AUTH_MODE=local_noauth`, so anyone on the tailnet is signed in as `admin@localhost`.

## Day to day

```bash
systemctl --user status seo-forge.service          # is it running
journalctl --user -u seo-forge.service -f          # server logs
systemctl --user restart seo-forge.service         # after changing vite.config.ts or .env.local
curl -s -o /dev/null -w '%{http_code}\n' https://sinfa-core.tail401389.ts.net:8450/   # expect 200
```

A cold start takes about 40 seconds before Vite answers, and the first page load after that is slow while Vite optimizes dependencies.

To stop sharing without stopping the server: `sudo tailscale serve --https=8450 off`.
To stop the server too: `systemctl --user disable --now seo-forge.service`.

## Setting it up again from scratch

Only needed if the unit file or the serve mapping is gone.

1. Write `~/.config/systemd/user/seo-forge.service`:

   ```ini
   [Unit]
   Description=SEO Forge dev server (tailnet only, via tailscale serve)
   After=network-online.target tailscaled.service

   [Service]
   Type=simple
   WorkingDirectory=%h/projects/seo-forge
   ExecStart=%h/.local/bin/pnpm exec vite dev --host 127.0.0.1 --port 3001 --strictPort
   Environment=ALLOWED_HOST=sinfa-core.tail401389.ts.net
   Environment=PATH=%h/.local/bin:/usr/local/bin:/usr/bin:/bin
   Restart=on-failure
   RestartSec=5

   [Install]
   WantedBy=default.target
   ```

2. Start it and wait for a 200 on the local port:

   ```bash
   systemctl --user daemon-reload
   systemctl --user enable --now seo-forge.service
   until curl -sf -o /dev/null http://127.0.0.1:3001/; do sleep 2; done
   ```

3. Check which tailnet ports are taken, then map a free one (8450 unless it has been reused):

   ```bash
   sudo tailscale serve status --json    # read the "TCP" keys; never assume a port is free
   sudo tailscale serve --bg --https=8450 http://127.0.0.1:3001
   ```

4. Verify through the real URL, not localhost: `curl` must return 200, then load it in a browser.

## Gotchas

- **`ALLOWED_HOST` is required.**
  Vite rejects any Host header it does not know with `403 Blocked request. This host is not allowed`.
  `vite.config.ts` adds `ALLOWED_HOST` to `server.allowedHosts`, and the unit sets it to the MagicDNS name.
- **Use the full MagicDNS name** `sinfa-core.tail401389.ts.net`.
  Bare `sinfa-core` only resolves on the box itself, so a link using it fails on a phone.
- **No `EnvironmentFile` in the unit.**
  The Cloudflare Vite plugin loads the repo's `.env` (a symlink to `~/.secrets/.env`) and `.env.local` as Worker vars on its own.
- **Port 3000 is taken** by the Hermes WhatsApp bridge; 3001 is the app's own default.
- **`tailnet-share` is the wrong tool here.**
  It serves static directories; this is a running server, so the mapping is made with `tailscale serve` directly.
- **`GET /api/auth/get-session` returns 404** in the browser console.
  That is expected in `local_noauth` mode and happens on `127.0.0.1:3001` too, so it is not a proxy problem.
- **Headless browser checks:** Playwright's `networkidle` never fires because the TanStack devtools hold an SSE stream open (`/__tsd/console-pipe/sse`).
  Wait for `load` plus a few seconds instead.
  The repo's Playwright wants a `chromium_headless_shell` build that is not downloaded on this box; pass `executablePath` pointing at the one in `~/.cache/ms-playwright/` rather than installing another.
