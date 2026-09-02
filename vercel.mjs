const configuredOrigin = process.env.RAILWAY_API_URL

if (!configuredOrigin) {
  throw new Error('RAILWAY_API_URL must be configured in the Vercel project')
}

const apiOrigin = new URL(configuredOrigin)
if (apiOrigin.protocol !== 'https:') {
  throw new Error('RAILWAY_API_URL must use HTTPS')
}
apiOrigin.pathname = ''
apiOrigin.search = ''
apiOrigin.hash = ''

export const config = {
  framework: 'vite',
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  rewrites: [
    {
      source: '/api/:path*',
      destination: `${apiOrigin.origin}/api/:path*`,
    },
    {
      source: '/(.*)',
      destination: '/index.html',
    },
  ],
}
