const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['127.0.0.1', 'localhost', '192.168.1.73'],
  devIndicators: false,
  serverExternalPackages: ['openai', '@supabase/supabase-js'],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
