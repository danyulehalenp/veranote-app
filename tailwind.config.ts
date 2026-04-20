import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#091728',
        muted: '#5b6b7f',
        border: '#d7e3ef',
        panel: '#ffffff',
        paper: '#eef4fa',
        accent: '#0f9db4',
      },
    },
  },
  plugins: [],
};

export default config;
