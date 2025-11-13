import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import {
  faChartLine,
  faGauge,
  faUsers,
  faGear,
  faShieldHalved,
} from '@fortawesome/pro-solid-svg-icons';

import { cn } from '../lib/cn';
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion';
import { STARFIELD_VARIANTS, Starfield, type Hotspot } from '../app/components/Starfield';
import { StarfieldVariantSwitcher } from '../app/components/StarfieldVariantSwitcher';
import { useStarfieldVariant } from '../app/hooks/useStarfieldVariant';

type ControlRowProps = {
  label: string;
  value: string | number;
  min: number;
  max: number;
  step: number;
  onIncrease: () => void;
  onDecrease: () => void;
};

const ControlRow = ({ label, value, onIncrease, onDecrease }: ControlRowProps) => (
  <View className="flex flex-row items-center justify-between gap-4">
    <View>
      <Text className="text-[11px] uppercase tracking-[0.4em] text-slate-400">{label}</Text>
      <Text className="text-base font-semibold text-white">{value}</Text>
    </View>
    <View className="flex flex-row gap-2">
      <Pressable onPress={onDecrease} className="rounded-full border border-white/20 px-3 py-1">
        <Text className="text-xs">–</Text>
      </Pressable>
      <Pressable onPress={onIncrease} className="rounded-full border border-white/20 px-3 py-1">
        <Text className="text-xs">+</Text>
      </Pressable>
    </View>
  </View>
);

const SANDBOX_NAV_ITEMS = [
  { key: 'overview', label: 'Overview', description: 'Guides & metrics', icon: faGauge },
  { key: 'growth', label: 'Growth', description: 'Funnel snapshot', icon: faChartLine },
  { key: 'team', label: 'Team', description: 'Invites & roles', icon: faUsers },
  { key: 'settings', label: 'Settings', description: 'Guardrails', icon: faShieldHalved },
  { key: 'integrations', label: 'Integrations', description: 'Deploy hooks', icon: faGear },
];

const densityKey = 'starfield.sandbox.density';
const hoverGainKey = 'starfield.sandbox.hoverGain';
const microFreqKey = 'starfield.sandbox.microFreq';
const defaults = {
  density: 120,
  hoverGain: 1.18,
  microFreq: 0.0025,
};

const CONTROL_LIMITS = {
  density: { min: 60, max: 180 },
  hoverGain: { min: 1, max: 1.4 },
  microFreq: { min: 0.0005, max: 0.004 }
} as const;

const clampNumber = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const DevSidebarSandbox = () => {
  const [starfieldVariant, setStarfieldVariant] = useStarfieldVariant();
  const [forceReducedMotion, setForceReducedMotion] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [density, setDensity] = useState(defaults.density);
  const [hoverGain, setHoverGain] = useState(defaults.hoverGain);
  const [microEventFreqValue, setMicroEventFreqValue] = useState(defaults.microFreq);
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const [sandboxHotspot, setSandboxHotspot] = useState<Hotspot | null>(null);
  const [demoInteraction, setDemoInteraction] = useState(0);
  const reducesMotion = prefersReducedMotion || forceReducedMotion;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const storedDensity = Number(window.localStorage.getItem(densityKey));
    const storedHover = Number(window.localStorage.getItem(hoverGainKey));
    const storedMicro = Number(window.localStorage.getItem(microFreqKey));
    if (!Number.isNaN(storedDensity)) {
      setDensity(clampNumber(storedDensity, CONTROL_LIMITS.density.min, CONTROL_LIMITS.density.max));
    }
    if (!Number.isNaN(storedHover)) {
      setHoverGain(clampNumber(storedHover, CONTROL_LIMITS.hoverGain.min, CONTROL_LIMITS.hoverGain.max));
    }
    if (!Number.isNaN(storedMicro)) {
      setMicroEventFreqValue(
        clampNumber(storedMicro, CONTROL_LIMITS.microFreq.min, CONTROL_LIMITS.microFreq.max)
      );
    }
  }, []);

  const persistValue = (key: string, value: number) => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(key, value.toString());
  };

  const setDensityValue = (value: number) => {
    const clamped = clampNumber(value, CONTROL_LIMITS.density.min, CONTROL_LIMITS.density.max);
    setDensity(clamped);
    persistValue(densityKey, clamped);
  };

  const setHoverGainValue = (value: number) => {
    const clamped = clampNumber(value, CONTROL_LIMITS.hoverGain.min, CONTROL_LIMITS.hoverGain.max);
    setHoverGain(clamped);
    persistValue(hoverGainKey, clamped);
  };

  const setMicroFreqValue = (value: number) => {
    const clamped = clampNumber(value, CONTROL_LIMITS.microFreq.min, CONTROL_LIMITS.microFreq.max);
    setMicroEventFreqValue(clamped);
    persistValue(microFreqKey, clamped);
  };

  const resetDefaults = () => {
    setDensityValue(defaults.density);
    setHoverGainValue(defaults.hoverGain);
    setMicroFreqValue(defaults.microFreq);
  };

  const safeDensity = clampNumber(density, CONTROL_LIMITS.density.min, CONTROL_LIMITS.density.max);
  const safeHoverGain = clampNumber(hoverGain, CONTROL_LIMITS.hoverGain.min, CONTROL_LIMITS.hoverGain.max);
  const safeMicroFreq = clampNumber(
    microEventFreqValue,
    CONTROL_LIMITS.microFreq.min,
    CONTROL_LIMITS.microFreq.max
  );
  const effectiveHoverGain = reducesMotion ? 1 : safeHoverGain;
  const effectiveDensity = reducesMotion
    ? clampNumber(Math.round(safeDensity * 0.7), CONTROL_LIMITS.density.min, CONTROL_LIMITS.density.max)
    : safeDensity;
  const microEventFrequency = reducesMotion
    ? clampNumber(safeMicroFreq * 0.3, CONTROL_LIMITS.microFreq.min, CONTROL_LIMITS.microFreq.max)
    : safeMicroFreq;
  const bodyLabel = useMemo(
    () => (reducesMotion ? 'prefers reduced motion (forced)' : 'motion enabled'),
    [reducesMotion]
  );

  const variantMeta = STARFIELD_VARIANTS[starfieldVariant];

  const handleDemoEngagement = (active: boolean) => {
    setDemoInteraction(active ? 1 : 0);
  };

  const updateSandboxHotspot = (clientX: number, clientY: number) => {
    const rect = sidebarRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const x = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    const y = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1);
    setSandboxHotspot({ x, y, intensity: 0.9, radius: 0.35 });
  };

  const clearSandboxHotspot = () => setSandboxHotspot(null);

  const MICRO_FREQ_STEP = 0.0005;
  const handleMicroEventFrequencyChange = (delta: number) => {
    setMicroFreqValue(microEventFreqValue + delta * MICRO_FREQ_STEP);
  };

  const handleSandboxFocus = () => {
    handleDemoEngagement(true);
    const rect = sidebarRef.current?.getBoundingClientRect();
    if (rect) {
      updateSandboxHotspot(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
  };

  return (
    <View className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <View className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <View className="flex flex-row items-center justify-between gap-4">
          <Text className="text-xs uppercase tracking-[0.4em] text-slate-500">Left menu sandbox</Text>
          <Pressable
            onPress={() => setForceReducedMotion((prev) => !prev)}
            className="rounded-full border border-slate-700 bg-white/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-white transition hover:border-white/60"
            testID="motion-toggle"
          >
            <Text>{bodyLabel}</Text>
          </Pressable>
        </View>
        <View className="w-full flex-1">
          <div
            ref={(node) => {
              sidebarRef.current = node;
            }}
            data-testid="sidebar-card"
            data-hotspot-active={sandboxHotspot ? 'true' : 'false'}
            className="relative mx-auto flex w-full max-w-[360px] flex-col overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-b from-slate-950/90 via-slate-950 to-slate-900/70 p-6 text-white shadow-[0_30px_60px_rgba(2,6,23,0.65)]"
          >
            <Starfield
              containerRef={sidebarRef}
              variant={starfieldVariant}
              hoverGain={effectiveHoverGain}
              density={effectiveDensity}
              depthCurve={(value) => 0.25 + value * 0.75}
              interactionLevel={demoInteraction}
              reduceMotionOverride={reducesMotion}
              hotspot={sandboxHotspot ?? undefined}
              microEventFrequency={microEventFrequency}
              className="pointer-events-none opacity-80"
            />
            <View className="relative flex h-full min-h-[520px] flex-col">
              <Text className="text-sm font-semibold tracking-[0.4em] text-slate-400">JustEvery Dev</Text>
              <Text className="mt-6 text-3xl font-bold leading-tight text-white">Sidebar preview</Text>
              <View className="mt-8 flex flex-1 flex-col gap-3">
                {SANDBOX_NAV_ITEMS.map((item) => (
                  <Pressable
                    key={item.key}
                    testID={`sandbox-nav-${item.key}`}
                    className={cn(
                      'flex flex-row items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-white transition bg-white/5 bg-opacity-10 hover:bg-opacity-30'
                    )}
                    onHoverIn={(event) => {
                      handleDemoEngagement(true);
                      updateSandboxHotspot(event.nativeEvent.pageX, event.nativeEvent.pageY);
                    }}
                    onHoverOut={() => {
                      handleDemoEngagement(false);
                      clearSandboxHotspot();
                    }}
                    onFocus={handleSandboxFocus}
                    onBlur={() => {
                      handleDemoEngagement(false);
                      clearSandboxHotspot();
                    }}
                    accessibilityRole="button"
                  >
                    <View className="pt-0.5">
                      <FontAwesomeIcon icon={item.icon} size={16} color="#f8fafc" />
                    </View>
                    <View>
                      <Text>{item.label}</Text>
                      <Text className="text-[11px] font-normal uppercase tracking-[0.2em] text-slate-400">
                        {item.description}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
              <View className="mt-auto space-y-2 border-t border-white/15 pt-6">
                <Text className="text-[10px] uppercase tracking-[0.4em] text-slate-500">Sandbox controls</Text>
                <Text className="text-[12px] text-slate-300">
                  All six variants should feel airy at rest and bloom gently on hover/focus inside the menu.
                  Adjust density, hover gain, and micro-event frequency below (values persist) while the motion pill reflects reduced-motion.
                </Text>
                <View className="flex flex-col gap-2 pt-2">
                  <ControlRow
                    label="Density"
                    value={Math.round(effectiveDensity)}
                    min={60}
                    max={180}
                    step={10}
                    onIncrease={() => setDensityValue(density + 10)}
                    onDecrease={() => setDensityValue(density - 10)}
                  />
                  <ControlRow
                    label="Hover gain"
                    value={effectiveHoverGain.toFixed(2)}
                    min={1}
                    max={1.4}
                    step={0.05}
                    onIncrease={() => setHoverGainValue(hoverGain + 0.05)}
                    onDecrease={() => setHoverGainValue(hoverGain - 0.05)}
                  />
                  <ControlRow
                    label="Micro freq (/ms)"
                    value={microEventFrequency.toFixed(4)}
                    min={0.0005}
                    max={0.004}
                    step={0.0005}
                    onIncrease={() => setMicroFreqValue(microEventFreqValue + 0.0005)}
                    onDecrease={() => setMicroFreqValue(microEventFreqValue - 0.0005)}
                  />
                  <Pressable
                    onPress={resetDefaults}
                    className="w-full rounded-full border border-white/20 px-3 py-2 text-center text-[11px] uppercase tracking-[0.4em] text-white"
                  >
                    Reset defaults
                  </Pressable>
                </View>
              </View>
            </View>
            <StarfieldVariantSwitcher current={starfieldVariant} onChange={setStarfieldVariant} />
            <View className="mt-3 space-y-1 text-xs text-slate-300">
              <Text className="text-[10px] uppercase tracking-[0.4em] text-slate-400">Active variant</Text>
              <Text className="text-sm font-semibold tracking-[0.2em] text-white">{variantMeta.label}</Text>
              <Text className="text-[11px] text-slate-400">{variantMeta.description}</Text>
            </View>
            <View className="mt-2 flex items-center justify-between text-[11px] text-slate-300">
              <Text>Micro-events: {(microEventFrequency * 1000).toFixed(1)} / second</Text>
              <View className="flex flex-row gap-1">
                <Pressable
                  onPress={() => handleMicroEventFrequencyChange(-1)}
                  className="rounded-full border border-white/20 px-3 py-1"
                >
                  <Text className="text-xs">-</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleMicroEventFrequencyChange(1)}
                  className="rounded-full border border-white/20 px-3 py-1"
                >
                  <Text className="text-xs">+</Text>
                </Pressable>
              </View>
            </View>
          </div>
        </View>
        <View className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-xs text-slate-300">
          <Text className="font-semibold text-white">UX check</Text>
          <Text className="mt-1 text-[11px]">
            The canvas should sit behind the nav with pointer events off, the switcher stays bottom-left, keyboard nav works, and localStorage keeps the previous variant.
          </Text>
        </View>
      </View>
    </View>
  );
};

export default DevSidebarSandbox;
