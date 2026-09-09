import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
    Dev-only: lets this dev server's client JS/HMR assets load when the app
    is opened from somewhere other than localhost - over the LAN, or through
    a cloudflared quick tunnel (phone-scanner testing - see
    src/components/scanner/camera-scanner.tsx's desktop handoff mode, and the
    HTTPS/secure-context note in CHANGELOG.md's v0.34.0 entry for why a
    tunnel is needed at all for the camera itself). Without this, Next's
    dev-origin protection 403s every `_next/*` request from a non-allowed
    origin, the page shell renders but never hydrates, and every button on
    the page - camera, notification bell, all of them - looks present but
    does nothing.
    `allowedDevOrigins` takes bare hostnames (optionally with a `*.` wildcard
    prefix) - no CIDR ranges, no protocol, no port:
      - the LAN entry is this machine's actual IP - update it if that
        changes (`ipconfig getifaddr en0` on macOS; it already has once this
        engagement, when Wi-Fi reconnected)
      - the wildcard covers a cloudflared quick tunnel's URL, which is a new
        random subdomain of trycloudflare.com every time the tunnel restarts
        - so this never needs updating for that case
  */
  allowedDevOrigins: ["192.168.8.44", "*.trycloudflare.com"],
};

export default nextConfig;
