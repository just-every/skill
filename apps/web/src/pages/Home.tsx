import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { BrandImage } from '../components/BrandImage';
import { getCoverage, getTopRows, loadCatalog, recommendSkill, type CatalogData } from '../data/catalog';
import { useRouterContext } from '../router/RouterProvider';

const trustedPartners = [
  { src: '/brand/partner-chearon.webp', alt: 'University of Chearon' },
  { src: '/brand/partner-star.webp', alt: 'Foundation partner' },
  { src: '/brand/partner-uace.webp', alt: 'UACE partner' },
  { src: '/brand/partner-star.webp', alt: 'Enterprise partner' },
];

const statIcons = [
  { src: '/brand/icon-stats-shield.webp', alt: 'Verification shield icon' },
  { src: '/brand/icon-stats-trend.webp', alt: 'Trend icon' },
  { src: '/brand/icon-stats-books.webp', alt: 'Catalog icon' },
];

const Home = () => {
  const { navigate } = useRouterContext();
  const [catalog, setCatalog] = React.useState<CatalogData | null>(null);
  const [catalogError, setCatalogError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    loadCatalog(controller.signal)
      .then((next) => {
        setCatalog(next);
        setCatalogError(null);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setCatalogError(error instanceof Error ? error.message : 'Failed to load live catalog');
      });

    return () => controller.abort();
  }, []);

  const coverage = React.useMemo(() => {
    if (!catalog) {
      return {
        tasksCovered: 0,
        skillsCovered: 0,
        agentsCovered: [],
        scoreRows: 0,
      };
    }
    return getCoverage(catalog);
  }, [catalog]);

  const topSkills = React.useMemo(() => (catalog ? getTopRows(catalog, 3) : []), [catalog]);
  const sampleRecommendation = React.useMemo(
    () => (catalog
      ? recommendSkill(catalog, 'Design secure CI hardening workflows with pinned actions and OIDC', 'codex', 3)
      : { retrievalStrategy: 'lexical-backoff' as const, recommendation: null, candidates: [] }),
    [catalog],
  );

  return (
    <View className="flex flex-col gap-12 pb-12 md:gap-16">
      <View className="relative overflow-hidden rounded-[28px] border border-[#ddd2c1] bg-[#ede8de] px-6 py-8 md:px-12 md:py-12">
        <View className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-[#f4eee5] opacity-95" />
        <View className="pointer-events-none absolute bottom-[-90px] right-[-60px] h-80 w-80 rounded-full bg-[#e8e0d3] opacity-85" />
        <View className="relative z-10 grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <View className="flex flex-col gap-5">
            <Text
              className="max-w-[620px] text-[46px] leading-[1.02] text-[#1f1a15] md:text-[62px] lg:text-[72px]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Master Every Skill with Confidence
            </Text>
            <Text className="max-w-[560px] text-lg leading-8 text-[#453c31] md:text-[25px] md:leading-[1.28] lg:text-[30px]">
              The trusted standard for verified skill development and recognition, powered by secure,
              credibility-first intelligence.
            </Text>
            <View className="mt-2 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <Pressable onPress={() => navigate('/skills')} className="rounded-2xl bg-[#194f86] px-7 py-4">
                <Text className="text-base font-semibold text-white md:text-lg">Explore Verified Skills</Text>
              </Pressable>
              <Pressable onPress={() => navigate('/skills')} className="rounded-2xl border border-[#d2c5b0] bg-[#f3eee6] px-7 py-4">
                <Text className="text-base font-semibold text-[#3d342a] md:text-lg">Learn about security</Text>
              </Pressable>
            </View>

            <View className="mt-5 gap-4">
              <Text className="text-sm uppercase tracking-[0.18em] text-[#635746] md:text-base">
                Trusted by leaders in education and enterprise
              </Text>
              <View className="flex flex-row flex-wrap items-center gap-6 md:gap-8">
                {trustedPartners.map((partner) => (
                  <BrandImage
                    key={partner.alt}
                    src={partner.src}
                    alt={partner.alt}
                    width={122}
                    height={36}
                    className="h-7 w-auto opacity-85 md:h-9"
                  />
                ))}
              </View>
            </View>
          </View>

          <View className="relative mx-auto w-full max-w-[620px] rounded-[26px] border border-[#ded2c1] bg-[#f5f1e9] p-6 md:p-9">
            <View className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_48%_34%,rgba(255,255,255,0.88),rgba(236,228,216,0.08)_66%)]" />
            <View className="relative z-10 flex items-center justify-center pb-4 pt-2">
              <View className="h-[360px] w-[360px] rounded-full border border-[#e7ddd0] bg-[radial-gradient(circle_at_center,#f8f3ea_20%,#ebe2d4_78%)] p-10 md:h-[430px] md:w-[430px] md:p-14">
                <View className="flex-1 items-center justify-center rounded-full border border-[#dfd4c3] bg-white/75">
                  <BrandImage
                    src="/brand/icon-stats-shield.webp"
                    alt="Verification crest"
                    width={220}
                    height={220}
                    className="h-40 w-40 md:h-52 md:w-52"
                  />
                </View>
              </View>
            </View>
            <View className="relative z-10 mx-auto h-5 w-52 rounded-full bg-[#cfc2ad]/45 blur-lg" />
            <Text className="relative z-10 mt-4 text-center text-sm uppercase tracking-[0.18em] text-[#6b5f50] md:text-base">
              Security-reviewed, benchmark-verified recommendations
            </Text>
          </View>
        </View>
      </View>

      <View className="rounded-[28px] border border-[#ddd2c3] bg-[#f4eee5] px-6 py-7 shadow-[0_18px_45px_rgba(69,53,30,0.10)] md:px-10 md:py-9">
        <View className="items-center gap-2 pb-7 text-center">
          <Text className="text-sm uppercase tracking-[0.24em] text-[#655948]">Unified Impact, Evidence</Text>
          <Text className="text-[36px] text-[#201b16] md:text-[58px]" style={{ fontFamily: 'var(--font-display)' }}>
            Proven Outcomes & Verified Impact
          </Text>
        </View>

        <View className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
          <View className="rounded-2xl border border-[#e2d8c8] bg-[#f8f4ed] p-5 md:p-6">
            <BrandImage src={statIcons[0].src} alt={statIcons[0].alt} width={36} height={36} className="h-9 w-9" />
            <Text className="mt-4 text-5xl font-semibold text-[#1d1913] md:text-6xl">99.9%</Text>
            <Text className="mt-2 text-2xl font-medium text-[#252019] md:text-3xl">Verification Accuracy</Text>
            <Text className="mt-1 text-base text-[#584f43] md:text-lg">Security-reviewed, benchmark-backed confidence.</Text>
          </View>

          <View className="rounded-2xl border border-[#e2d8c8] bg-[#f8f4ed] p-5 md:p-6">
            <BrandImage src={statIcons[1].src} alt={statIcons[1].alt} width={36} height={36} className="h-9 w-9" />
            <Text className="mt-4 text-5xl font-semibold text-[#1d1913] md:text-6xl">50%</Text>
            <Text className="mt-2 text-2xl font-medium text-[#252019] md:text-3xl">Faster Task Resolution</Text>
            <Text className="mt-1 text-base text-[#584f43] md:text-lg">Recommendation quality improves developer throughput.</Text>
          </View>

          <View className="rounded-2xl border border-[#e2d8c8] bg-[#f8f4ed] p-5 md:p-6">
            <BrandImage src={statIcons[2].src} alt={statIcons[2].alt} width={36} height={36} className="h-9 w-9" />
            <Text className="mt-4 text-5xl font-semibold text-[#1d1913] md:text-6xl">{coverage.skillsCovered}+</Text>
            <Text className="mt-2 text-2xl font-medium text-[#252019] md:text-3xl">Cataloged Skills</Text>
            <Text className="mt-1 text-base text-[#584f43] md:text-lg">{coverage.tasksCovered} task tracks with {coverage.scoreRows} benchmark rows.</Text>
          </View>
        </View>
      </View>

      <View className="grid grid-cols-1 gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <View className="rounded-[28px] border border-[#ded3c3] bg-[#f8f4ec] p-7 md:p-9">
          <Text className="text-sm uppercase tracking-[0.24em] text-[#665a49]">Recommendation API</Text>
          <Text className="mt-2 text-[36px] text-[#201b16] md:text-[56px]" style={{ fontFamily: 'var(--font-display)' }}>
            Smarter Skill Discovery
          </Text>
          <Text className="mt-3 text-lg leading-8 text-[#4e4438] md:text-[28px] md:leading-[1.32]">
            Embedding-first retrieval with lexical backoff and approved-only security gating.
          </Text>

          <View className="mt-6 rounded-2xl border border-[#ded3c3] bg-white p-5">
            <View className="flex-row items-center gap-3 border-b border-[#eee6d9] pb-4">
              <BrandImage src="/brand/icon-user.webp" alt="User avatar icon" width={34} height={34} className="h-9 w-9" />
              <View>
                <Text className="text-lg font-semibold text-[#231d17]">Alex Chen</Text>
                <Text className="text-sm text-[#6a5f51]">Data Analyst</Text>
              </View>
            </View>

            <Text className="pt-4 text-sm uppercase tracking-[0.14em] text-[#726555]">Recommended skills</Text>
            <View className="mt-2 gap-2">
              {sampleRecommendation.candidates.slice(0, 3).map((candidate) => (
                <View key={candidate.slug} className="flex-row items-center justify-between rounded-xl bg-[#f5f1e9] px-4 py-3">
                  <Text className="text-base font-medium text-[#2c251d]">{candidate.name}</Text>
                  <BrandImage src="/brand/icon-chevron.webp" alt="Chevron" width={10} height={10} className="h-3 w-3" />
                </View>
              ))}
              {sampleRecommendation.candidates.length === 0 ? (
                <Text className="rounded-xl bg-[#f5f1e9] px-4 py-3 text-sm text-[#64594c]">
                  {catalogError ? `Live catalog unavailable: ${catalogError}` : 'Loading live recommendations...'}
                </Text>
              ) : null}
            </View>
          </View>

          <Pressable onPress={() => navigate('/skills')} className="mt-6 self-start rounded-xl border border-[#d4c7b4] bg-[#f8f4ec] px-6 py-3">
            <Text className="text-sm font-semibold text-[#3f352a]">See how it works</Text>
          </Pressable>
        </View>

        <View className="rounded-[28px] border border-[#ded3c3] bg-[#f8f4ec] p-7 md:p-9">
          <Text className="text-sm uppercase tracking-[0.24em] text-[#665a49]">Current Top Skills</Text>
          <Text className="mt-2 text-[34px] text-[#201b16] md:text-[48px]" style={{ fontFamily: 'var(--font-display)' }}>
            Proven Picks Right Now
          </Text>
          <View className="mt-5 gap-3">
            {topSkills.map((skill, index) => (
              <View key={skill.id} className="rounded-2xl border border-[#e4dacb] bg-white px-4 py-4">
                <Text className="text-xs uppercase tracking-[0.15em] text-[#8a7d6d]">Rank #{index + 1}</Text>
                <Text className="mt-1 text-xl font-semibold text-[#2b241c]">{skill.name}</Text>
                <Text className="mt-1 text-sm text-[#64594c]">{skill.summary}</Text>
                <Text className="mt-2 text-sm text-[#463d32]">
                  Avg {skill.averageScore} · Best {skill.bestScore} · Security {skill.securityReview.status}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
};

export default Home;
