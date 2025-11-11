/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  webpack: (config) => {
    // See https://webpack.js.org/configuration/resolve/#resolvealias
    config.resolve.alias = {
      ...config.resolve.alias,
      sharp$: false,
      "onnxruntime-node$": false,
    };
    return config;
  },
  experimental: {
    outputFileTracingIncludes: {
      "/*": ["./cache/**/*"],
    },
  },
  env: {
    NEXT_PUBLIC_CHAT_API: "http://localhost:8000/api/chat"    
  }
};

module.exports = nextConfig;
