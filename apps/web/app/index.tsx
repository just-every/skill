import { Head } from 'expo-router';
import { Image, Platform, ScrollView, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { PlaceholderCard } from '@justevery/ui';

import { WORKER_ORIGIN, WorkerLink, workerUrl } from './_components/RouteRedirect';

const featureHighlights = [
  {
    title: 'Cloudflare-native hosting',
    description:
      'Deploy Workers, D1, and R2 with opinionated defaults so the marketing site and app shell ship together.',
  },
  {
    title: 'Authentication baked-in',
    description: 'Stytch SSO flows are wired up end to end with session storage handled in Workers KV.',
  },
  {
    title: 'Stripe-ready billing',
    description: 'Expose products from the Worker API and iterate on pricing without touching the client.',
  },
];

export default function LandingScreen() {
  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        paddingVertical: 48,
        paddingHorizontal: 24,
        backgroundColor: '#0f172a',
        gap: 32,
      }}
    >
      <Head>
        <title>justevery • Launch faster</title>
        <meta
          name="description"
          content="Launch your next project faster with a Cloudflare-first stack that ships auth, storage, and payments placeholders."
        />
      </Head>
      <View
        style={{
          maxWidth: 960,
          width: '100%',
          alignSelf: 'center',
          gap: 32,
          backgroundColor: 'rgba(15, 23, 42, 0.55)',
          borderRadius: 32,
          borderWidth: 1,
          borderColor: 'rgba(148, 163, 184, 0.2)',
          padding: 32,
        }}
      >
        <View style={{ gap: 16 }}>
          <Text style={{ color: '#38bdf8', textTransform: 'uppercase', letterSpacing: 4 }}>justevery</Text>
          <Text
            style={{
              color: '#e2e8f0',
              fontSize: 36,
              fontWeight: '700',
              lineHeight: 42,
            }}
          >
            Ship marketing, auth, and billing on day one.
          </Text>
          <Text style={{ color: '#cbd5f5', maxWidth: 540, lineHeight: 22 }}>
            This Expo-powered web experience mirrors the Worker-hosted routes so you can iterate locally, then
            publish to Cloudflare in minutes.
          </Text>
          {Platform.OS === 'web' ? (
            WORKER_ORIGIN ? (
              <Image
                source={{ uri: workerUrl('/api/assets/get?key=marketing/hero.png') }}
                resizeMode="cover"
                style={{
                  width: '100%',
                  maxWidth: 640,
                  height: 320,
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor: 'rgba(56, 189, 248, 0.35)',
                  backgroundColor: 'rgba(15, 23, 42, 0.6)',
                }}
              />
            ) : (
              <View
                style={{
                  width: '100%',
                  maxWidth: 640,
                  height: 320,
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor: 'rgba(148, 163, 184, 0.25)',
                  backgroundColor: 'rgba(15, 23, 42, 0.4)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center', paddingHorizontal: 24 }}>
                  Add a marketing hero image to `marketing/hero.png` in R2 for web visitors, or configure
                  `EXPO_PUBLIC_WORKER_ORIGIN` to preview it locally.
                </Text>
              </View>
            )
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <WorkerLink path="/login" label="Enter the app" />
          <WorkerLink path="/payments" label="Preview pricing" variant="secondary" />
        </View>
        <Text style={{ color: '#64748b', fontSize: 12 }}>
          Worker origin {WORKER_ORIGIN ? `set to ${WORKER_ORIGIN}` : 'not set; using Expo routes for local preview'}.
        </Text>
      </View>

      <View
        style={{
          maxWidth: 960,
          width: '100%',
          alignSelf: 'center',
          gap: 20,
        }}
      >
        <Text style={{ color: '#e2e8f0', fontSize: 24, fontWeight: '600' }}>What this starter includes</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20, justifyContent: 'space-between' }}>
          {featureHighlights.map((feature) => (
            <PlaceholderCard key={feature.title} title={feature.title} description={feature.description} />
          ))}
        </View>
        <Text style={{ color: '#94a3b8' }}>
          Looking for implementation details? Jump into the{' '}
          <Link href={workerUrl('/app')} style={{ color: '#38bdf8', textDecorationLine: 'underline' }}>
            authenticated shell
          </Link>{' '}
          or review the docs folder locally for deeper architecture notes.
        </Text>
      </View>
    </ScrollView>
  );
}
