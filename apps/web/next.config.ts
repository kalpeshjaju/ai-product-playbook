import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@playbook/shared-ui', '@playbook/shared-types'],
};

export default nextConfig;
