/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build autonome pour l'image Docker (copie minimale dans .next/standalone)
  output: "standalone",
};

export default nextConfig;
