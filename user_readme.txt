SEO FORGE - HOW TO RUN IT
=========================

Link (tailnet only, works from any device on the tailnet):
  https://sinfa-core.tail401389.ts.net:8450/

The server runs as a systemd user service called seo-forge.service.
It starts at boot, so you normally don't need to do anything.


CHECK IT IS RUNNING
-------------------
  systemctl --user status seo-forge.service


START IT (if it is stopped)
---------------------------
  systemctl --user start seo-forge.service

A cold start takes about 40 seconds before the page answers.
The first page load after that is slow while dependencies optimize.


RESTART IT (after changing vite.config.ts or .env.local)
--------------------------------------------------------
  systemctl --user restart seo-forge.service


STOP IT
-------
  systemctl --user stop seo-forge.service

To stop it from starting at boot as well:
  systemctl --user disable --now seo-forge.service


SEE THE LOGS
------------
  journalctl --user -u seo-forge.service -f

Press Ctrl+C to leave the log view. The server keeps running.


STOP SHARING WITHOUT STOPPING THE SERVER
----------------------------------------
  sudo tailscale serve --https=8450 off


RUN IT LOCALLY INSTEAD (for development on this machine)
--------------------------------------------------------
Stop the service first, because it holds port 3001:
  systemctl --user stop seo-forge.service

Then, from /home/sinfa/projects/seo-forge:
  pnpm dev:agents


MORE DETAIL
-----------
  /home/sinfa/projects/seo-forge/docs/seoforge/TAILSCALE.md
