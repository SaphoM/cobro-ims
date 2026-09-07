import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
    Dev-only: lets this dev server's client JS/HMR assets load when the app
    is opened over the LAN (phone-scanner testing - see
    src/components/scanner/camera-scanner.tsx's desktop handoff mode) instead
    of localhost. Without this, Next's dev-origin protection 403s every
    `_next/*` request from a non-localhost origin, the page shell renders but
    never hydrates, and every button on the page looks present but does
    nothing - exactly the "click, nothing happens" symptom this fixes.
    `allowedDevOrigins` takes bare hostnames (optionally with a `*.` wildcard
    prefix) - no CIDR ranges, no protocol, no port - so this is this
    machine's actual LAN IP, not a subnet. Update it if that IP changes
    (`ipconfig getifaddr en0` on macOS).
  */
  allowedDevOrigins: ["192.168.8.40"],
};

export default nextConfig;
