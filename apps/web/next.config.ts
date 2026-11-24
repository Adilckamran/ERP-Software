import type { NextConfig } from 'next';
import fs from 'fs';
import path from 'path';

function loadRootEnvLocalIntoProcess() {
  const candidates = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '..', '.env.local'),
    path.resolve(process.cwd(), '..', '..', '.env.local'),
  ];
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx <= 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1).trim();
        }
        if (key && !process.env[key]) {
          process.env[key] = val;
        }
      }
    } catch {
      // Ignore read errors
    }
  }
}

loadRootEnvLocalIntoProcess();

const nextConfig: NextConfig = {
  transpilePackages: ['@juice-erp/shared-types', '@juice-erp/shared-validation'],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

