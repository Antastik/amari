/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The agent runtime uses Node built-ins (fs, child_process) in API routes.
  // Keep the SDKs external so they aren't bundled oddly for the server runtime.
  serverExternalPackages: ["@anthropic-ai/sdk", "openai"],
};

export default nextConfig;
