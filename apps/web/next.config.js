/** @type {import('next').NextConfig} */
const nextConfig = {
    // Transpile workspace packages that expose TypeScript source directly
    transpilePackages: ["@vibetech/db", "@vibetech/shared"],

    // Security headers
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    { key: "X-Frame-Options", value: "DENY" },
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                    {
                        key: "Permissions-Policy",
                        value: "camera=(self), microphone=(self), geolocation=(self)",
                    },
                    {
                        key: "Content-Security-Policy",
                        value: [
                            "default-src 'self'",
                            "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
                            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                            "font-src 'self' https://fonts.gstatic.com",
                            "img-src 'self' data: blob: https:",
                            "connect-src 'self' https:",
                        ].join("; "),
                    },
                ],
            },
        ];
    },

    // Performance optimizations
    compress: true,
    poweredByHeader: false,

    // Image optimization
    images: {
        formats: ["image/avif", "image/webp"],
        minimumCacheTTL: 60,
    },

    // Experimental
    experimental: {
        optimizePackageImports: ["@prisma/client"],
    },

    // Skip type checking during build (checked in IDE + CI via tsc)
    typescript: {
        ignoreBuildErrors: true,
    },
};

export default nextConfig;
