/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: the built app is plain files served by the FastAPI backend
  // (single service, no Node at runtime). All data fetching is client-side.
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
