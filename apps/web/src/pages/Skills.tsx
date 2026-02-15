import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { catalog, getCoverage, getSkillSummaries, recommendSkill, type Agent } from '../data/catalog';

const initialTask = 'Harden our GitHub Actions pipeline, pin actions, and secure secrets with OIDC.';

const agentOptions: Agent[] = ['codex', 'claude', 'gemini'];

const Skills = () => {
  const [taskQuery, setTaskQuery] = React.useState(initialTask);
  const [agent, setAgent] = React.useState<Agent>('codex');
  const [submittedTask, setSubmittedTask] = React.useState(initialTask);

  const summaries = React.useMemo(() => getSkillSummaries(), []);
  const approvedSkills = React.useMemo(() => summaries.filter((entry) => entry.securityReview.status === 'approved'), [summaries]);
  const coverage = React.useMemo(() => getCoverage(), []);
  const recommendation = React.useMemo(() => recommendSkill(submittedTask, agent, 5), [submittedTask, agent]);

  const onSubmit = React.useCallback(() => {
    const next = taskQuery.trim();
    if (next.length >= 8) {
      setSubmittedTask(next);
    }
  }, [taskQuery]);

  return (
    <View className="flex flex-col gap-8 pb-12 md:gap-10">
      <View className="rounded-[24px] border border-[#ddd2c3] bg-[#f5efe5] p-6 md:p-8">
        <Text className="text-sm uppercase tracking-[0.24em] text-[#6a5d4c]">Every Skill Catalog</Text>
        <Text className="mt-2 text-[38px] text-[#211b15] md:text-[56px]" style={{ fontFamily: 'var(--font-display)' }}>
          Skills, Benchmarks, and Retrieval Results
        </Text>
        <Text className="mt-3 max-w-[900px] text-base leading-7 text-[#4d4337] md:text-[24px] md:leading-[1.34]">
          Frontend-only catalog powered by local benchmark data. No runtime API dependency required.
        </Text>
      </View>

      <View className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="Approved skills" value={String(approvedSkills.length)} detail="Security-reviewed" />
        <StatCard label="Task tracks" value={String(catalog.tasks.length)} detail="Coverage across domains" />
        <StatCard label="Benchmark runs" value={String(catalog.runs.length)} detail="Daytona manifests" />
        <StatCard
          label="Score rows"
          value={String(coverage.scoreRows)}
          detail={`Agents: ${coverage.agentsCovered.join(', ')}`}
        />
      </View>

      <View className="rounded-[24px] border border-[#dbd0bf] bg-[#f8f4ec] p-6 md:p-8">
        <Text className="text-sm uppercase tracking-[0.22em] text-[#6c5f4f]">Recommendation simulator</Text>
        <Text className="mt-2 text-2xl font-semibold text-[#211b15] md:text-4xl">Task → best skill</Text>

        <View className="mt-4 gap-4">
          <TextInput
            value={taskQuery}
            onChangeText={setTaskQuery}
            style={{
              minHeight: 124,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#d8ccbc',
              backgroundColor: '#fffdf9',
              color: '#201a14',
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: 17,
              lineHeight: 24,
            }}
            placeholder="Describe the task your coding agent should solve"
          />

          <View className="flex-row flex-wrap gap-2">
            {agentOptions.map((candidate) => {
              const active = candidate === agent;
              return (
                <Pressable
                  key={candidate}
                  onPress={() => setAgent(candidate)}
                  className={active ? 'rounded-full bg-[#184f87] px-4 py-2' : 'rounded-full border border-[#d3c6b3] bg-white px-4 py-2'}
                >
                  <Text className={active ? 'text-sm font-semibold text-white' : 'text-sm font-semibold text-[#463d32]'}>
                    {candidate}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable onPress={onSubmit} className="self-start rounded-2xl bg-[#174f87] px-6 py-3">
            <Text className="text-base font-semibold text-white">Recommend Skill</Text>
          </Pressable>

          <View className="rounded-2xl border border-[#d9ccba] bg-white p-5">
            <Text className="text-xs uppercase tracking-[0.2em] text-[#7a6d5d]">Top recommendation</Text>
            <Text className="mt-2 text-2xl font-semibold text-[#231d17]">{recommendation.recommendation.name}</Text>
            <Text className="mt-2 text-sm text-[#554b3f]">
              slug `{recommendation.recommendation.slug}` · strategy {recommendation.retrievalStrategy} · final score{' '}
              {recommendation.recommendation.finalScore}
            </Text>
            <Text className="mt-1 text-sm text-[#554b3f]">
              similarity {recommendation.recommendation.embeddingSimilarity} · benchmark {recommendation.recommendation.averageBenchmarkScore}
            </Text>
          </View>
        </View>
      </View>

      <View className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <View className="rounded-[24px] border border-[#dbcfbe] bg-white p-6">
          <Text className="text-lg font-semibold text-[#231d17] md:text-2xl">Approved skills ({approvedSkills.length})</Text>
          <View className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {approvedSkills.map((skill) => (
              <View key={skill.id} className="rounded-2xl border border-[#ece2d4] bg-[#f9f5ef] p-4">
                <Text className="text-xs uppercase tracking-[0.12em] text-[#8a7c6a]">{skill.slug}</Text>
                <Text className="mt-1 text-lg font-semibold text-[#241e18]">{skill.name}</Text>
                <Text className="mt-1 text-sm leading-6 text-[#5b5043]">{skill.summary}</Text>
                <Text className="mt-2 text-xs text-[#615648]">
                  avg {skill.averageScore} · best {skill.bestScore} · tasks {skill.benchmarkedTasks}
                </Text>
                <Text className="mt-1 text-xs text-[#615648]">source: {skill.provenance.repository}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="flex flex-col gap-6">
          <View className="rounded-[24px] border border-[#dbcfbe] bg-white p-6">
            <Text className="text-lg font-semibold text-[#231d17] md:text-2xl">Benchmark runs</Text>
            <View className="mt-3 gap-3">
              {catalog.runs.map((run) => (
                <View key={run.id} className="rounded-2xl border border-[#ece2d4] bg-[#f9f5ef] p-4">
                  <Text className="text-sm font-semibold text-[#2a241c]">{run.id}</Text>
                  <Text className="text-xs text-[#665a4c]">
                    {run.runner} · {run.mode} · {run.status}
                  </Text>
                  <Text className="mt-1 text-xs text-[#665a4c]">artifact: {run.artifactPath}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="rounded-[24px] border border-[#dbcfbe] bg-white p-6">
            <Text className="text-lg font-semibold text-[#231d17] md:text-2xl">Task coverage</Text>
            <View className="mt-3 gap-2">
              {catalog.tasks.map((task) => (
                <View key={task.id} className="rounded-xl border border-[#efe6d8] bg-[#fcfaf7] px-3 py-2">
                  <Text className="text-sm font-medium text-[#352d24]">{task.name}</Text>
                  <Text className="text-xs text-[#6f6253]">{task.category} · {task.slug}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="rounded-[24px] border border-[#dbcfbe] bg-white p-6">
            <Text className="text-lg font-semibold text-[#231d17] md:text-2xl">Top candidates</Text>
            <View className="mt-3 gap-2">
              {recommendation.candidates.slice(0, 5).map((candidate, index) => (
                <View key={candidate.id} className="rounded-xl border border-[#efe6d8] bg-[#fcfaf7] px-3 py-2">
                  <Text className="text-sm font-semibold text-[#352d24]">
                    #{index + 1} {candidate.name}
                  </Text>
                  <Text className="text-xs text-[#6f6253]">
                    final {candidate.finalScore} · sim {candidate.embeddingSimilarity} · bench {candidate.averageBenchmarkScore}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

type StatCardProps = {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
};

const StatCard = ({ label, value, detail }: StatCardProps) => (
  <View className="rounded-2xl border border-[#ddd2c3] bg-white p-4 md:p-5">
    <Text className="text-xs uppercase tracking-[0.15em] text-[#7d705f]">{label}</Text>
    <Text className="mt-2 text-3xl font-semibold text-[#201b15] md:text-5xl">{value}</Text>
    <Text className="mt-1 text-sm text-[#5e5345]">{detail}</Text>
  </View>
);

export default Skills;
