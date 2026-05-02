import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['127.0.0.1'],
  devIndicators: false,
  serverExternalPackages: ['openai', '@supabase/supabase-js'],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
