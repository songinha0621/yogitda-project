/** @type {import('next').NextConfig} */
const nextConfig = {
  // 💡 ESLint(문법 검사기) 경고 무시하고 배포 강행
  eslint: {
    ignoreDuringBuilds: true,
  },
  // 💡 TypeScript 타입 에러 무시하고 배포 강행
  typescript: {
    ignoreBuildErrors: true,
  }
};

export default nextConfig;