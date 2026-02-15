import React from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import {
  catalog,
  getBenchmarkRows,
  getCoverage,
  getSkillDetail,
  getSkillSummaries,
  recommendSkill,
  type Agent,
} from '../data/catalog';

const initialTask = 'Harden our GitHub Actions pipeline, pin actions, and secure secrets with OIDC.';
const agentOptions: Agent[] = ['codex', 'claude', 'gemini'];
const statusOptions = ['all', 'approved', 'pending', 'rejected'] as const;

type StatusFilter = (typeof statusOptions)[number];
type ScopeFilter = 'selected' | 'all';

const Skills = () => {
  const [taskQuery, setTaskQuery] = React.useState(initialTask);
  const [agent, setAgent] = React.useState<Agent>('codex');
  const [submittedTask, setSubmittedTask] = React.useState(initialTask);
  const [lastEvaluatedAt, setLastEvaluatedAt] = React.useState<Date>(new Date());

  const [skillQuery, setSkillQuery] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [selectedSkillId, setSelectedSkillId] = React.useState<string | null>(null);

  const [benchmarkScope, setBenchmarkScope] = React.useState<ScopeFilter>('selected');
  const [benchmarkRunFilter, setBenchmarkRunFilter] = React.useState<'all' | string>('all');
  const [benchmarkTaskFilter, setBenchmarkTaskFilter] = React.useState<'all' | string>('all');
  const [benchmarkAgentFilter, setBenchmarkAgentFilter] = React.useState<'all' | Agent>('all');
  const [benchmarkQuery, setBenchmarkQuery] = React.useState('');

  const summaries = React.useMemo(() => getSkillSummaries(), []);
  const coverage = React.useMemo(() => getCoverage(), []);
  const recommendation = React.useMemo(() => recommendSkill(submittedTask, agent, 5), [submittedTask, agent]);

  const skillsById = React.useMemo(() => new Map(catalog.skills.map((skill) => [skill.id, skill])), []);
  const tasksById = React.useMemo(() => new Map(catalog.tasks.map((task) => [task.id, task])), []);
  const categories = React.useMemo(() => ['all', ...Array.from(new Set(catalog.tasks.map((task) => task.category))).sort()], []);

  const filteredSkills = React.useMemo(() => {
    const query = skillQuery.trim().toLowerCase();
    return summaries.filter((summary) => {
      const skill = skillsById.get(summary.id);
      if (!skill) return false;
      const task = tasksById.get(skill.taskId);

      if (statusFilter !== 'all' && summary.securityStatus !== statusFilter) return false;
      if (categoryFilter !== 'all' && task?.category !== categoryFilter) return false;

      if (!query) return true;
      const haystack = [
        summary.name,
        summary.slug,
        summary.summary,
        skill.description,
        skill.keywords.join(' '),
        task?.name ?? '',
        task?.slug ?? '',
        task?.category ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [summaries, skillsById, tasksById, statusFilter, categoryFilter, skillQuery]);

  React.useEffect(() => {
    if (filteredSkills.length === 0) {
      setSelectedSkillId(null);
      return;
    }
    if (!selectedSkillId || !filteredSkills.some((entry) => entry.id === selectedSkillId)) {
      setSelectedSkillId(filteredSkills[0].id);
    }
  }, [filteredSkills, selectedSkillId]);

  const selectedDetail = React.useMemo(() => {
    if (!selectedSkillId) return null;
    return getSkillDetail(selectedSkillId);
  }, [selectedSkillId]);

  const benchmarkRows = React.useMemo(() => {
    return getBenchmarkRows({
      skillId: benchmarkScope === 'selected' ? selectedSkillId ?? undefined : undefined,
      runId: benchmarkRunFilter === 'all' ? undefined : benchmarkRunFilter,
      taskId: benchmarkTaskFilter === 'all' ? undefined : benchmarkTaskFilter,
      agent: benchmarkAgentFilter === 'all' ? undefined : benchmarkAgentFilter,
      query: benchmarkQuery,
    });
  }, [benchmarkScope, selectedSkillId, benchmarkRunFilter, benchmarkTaskFilter, benchmarkAgentFilter, benchmarkQuery]);

  const onSubmit = React.useCallback(() => {
    const next = taskQuery.trim();
    if (next.length >= 8) {
      setSubmittedTask(next);
      setLastEvaluatedAt(new Date());
    }
  }, [taskQuery]);

  return (
    <View className="flex flex-col gap-8 pb-12 md:gap-10">
      <View className="rounded-[24px] border border-[#ddd2c3] bg-[#f5efe5] p-6 md:p-8">
        <Text className="text-sm uppercase tracking-[0.24em] text-[#6a5d4c]">Every Skill Catalog</Text>
        <Text className="mt-2 text-[38px] text-[#211b15] md:text-[56px]" style={{ fontFamily: 'var(--font-display)' }}>
          Skills, Benchmarks, and Retrieval Results
        </Text>
        <Text className="mt-3 max-w-[980px] text-base leading-7 text-[#4d4337] md:text-[24px] md:leading-[1.34]">
          Start here to inspect the full skill packets and benchmark rows behind every recommendation. Filter, drill into a skill,
          and inspect the exact run/task/agent evidence used by this UI.
        </Text>
      </View>

      <View className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="Catalog skills" value={String(catalog.skills.length)} detail={`${filteredSkills.length} visible with current filters`} />
        <StatCard label="Task tracks" value={String(catalog.tasks.length)} detail="Coverage across benchmark scenarios" />
        <StatCard label="Benchmark runs" value={String(catalog.runs.length)} detail="Daytona manifests currently loaded" />
        <StatCard label="Score rows" value={String(coverage.scoreRows)} detail={`Agents: ${coverage.agentsCovered.join(', ')}`} />
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
                  accessibilityRole="button"
                  key={candidate}
                  onPress={() => {
                    setAgent(candidate);
                    setLastEvaluatedAt(new Date());
                  }}
                  className={active ? 'rounded-full bg-[#184f87] px-4 py-2' : 'rounded-full border border-[#d3c6b3] bg-white px-4 py-2'}
                >
                  <Text className={active ? 'text-sm font-semibold text-white' : 'text-sm font-semibold text-[#463d32]'}>{candidate}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable accessibilityRole="button" onPress={onSubmit} className="self-start rounded-2xl bg-[#174f87] px-6 py-3">
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
            <Text className="mt-1 text-sm text-[#554b3f]">evaluated for {agent.toUpperCase()} at {lastEvaluatedAt.toLocaleTimeString()}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSelectedSkillId(recommendation.recommendation.id)}
              className="mt-4 self-start rounded-xl border border-[#d8ccbb] bg-[#f9f4ea] px-4 py-2"
            >
              <Text className="text-sm font-semibold text-[#3f352b]">Open skill dossier</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View className="grid grid-cols-1 gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <View className="rounded-[24px] border border-[#dbcfbe] bg-white p-6">
          <Text className="text-sm uppercase tracking-[0.16em] text-[#6d6254]">Skill explorer</Text>
          <Text className="mt-2 text-xl font-semibold text-[#231d17] md:text-2xl">Browse and filter the catalog</Text>

          <View className="mt-4 gap-3">
            <TextInput
              value={skillQuery}
              onChangeText={setSkillQuery}
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#ded3c3',
                backgroundColor: '#fffdf9',
                color: '#221c16',
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 15,
              }}
              placeholder="Search by skill, slug, keyword, or task"
            />

            <View>
              <Text className="mb-2 text-xs uppercase tracking-[0.16em] text-[#7d705f]">Status</Text>
              <View className="flex-row flex-wrap gap-2">
                {statusOptions.map((status) => (
                  <FilterPill
                    key={status}
                    label={status}
                    active={statusFilter === status}
                    onPress={() => setStatusFilter(status)}
                  />
                ))}
              </View>
            </View>

            <View>
              <Text className="mb-2 text-xs uppercase tracking-[0.16em] text-[#7d705f]">Task category</Text>
              <View className="flex-row flex-wrap gap-2">
                {categories.map((category) => (
                  <FilterPill
                    key={category}
                    label={category}
                    active={categoryFilter === category}
                    onPress={() => setCategoryFilter(category)}
                  />
                ))}
              </View>
            </View>

            <View className="rounded-2xl border border-[#ece2d4] bg-[#f9f5ef] p-3">
              <Text className="text-xs uppercase tracking-[0.14em] text-[#796d5e]">Matching skills</Text>
              <ScrollView style={{ maxHeight: 420 }} className="mt-2">
                <View className="gap-2 pb-1">
                  {filteredSkills.map((skillSummary, index) => {
                    const active = skillSummary.id === selectedSkillId;
                    const skill = skillsById.get(skillSummary.id);
                    const task = skill ? tasksById.get(skill.taskId) : undefined;

                    return (
                      <Pressable
                        accessibilityRole="button"
                        key={skillSummary.id}
                        onPress={() => setSelectedSkillId(skillSummary.id)}
                        className={active ? 'rounded-xl border border-[#cdbda6] bg-white px-3 py-3' : 'rounded-xl border border-[#e6dccd] bg-[#fffaf3] px-3 py-3'}
                      >
                        <Text className="text-[11px] uppercase tracking-[0.16em] text-[#8b7f70]">Rank #{index + 1}</Text>
                        <Text className="mt-1 text-base font-semibold text-[#2e271f]">{skillSummary.name}</Text>
                        <Text className="mt-1 text-xs text-[#695e50]">{skillSummary.slug}</Text>
                        <Text className="mt-1 text-xs text-[#695e50]">
                          avg {skillSummary.averageScore} · best {skillSummary.bestScore} · task {task?.category ?? 'unknown'}
                        </Text>
                      </Pressable>
                    );
                  })}

                  {filteredSkills.length === 0 ? (
                    <View className="rounded-xl border border-[#e6dccd] bg-[#fffaf3] px-3 py-4">
                      <Text className="text-sm text-[#615648]">No skills match the current filters.</Text>
                    </View>
                  ) : null}
                </View>
              </ScrollView>
            </View>
          </View>
        </View>

        <View className="rounded-[24px] border border-[#dbcfbe] bg-white p-6">
          <Text className="text-sm uppercase tracking-[0.16em] text-[#6d6254]">Skill dossier</Text>
          {!selectedDetail ? (
            <Text className="mt-3 text-sm text-[#665a4c]">Choose a skill to inspect full content and benchmark evidence.</Text>
          ) : (
            <View className="mt-2 gap-4">
              <View>
                <Text className="text-2xl font-semibold text-[#231d17]">{selectedDetail.skill.name}</Text>
                <Text className="mt-1 text-sm text-[#665a4c]">slug `{selectedDetail.skill.slug}` · source {selectedDetail.skill.provenance.repository}</Text>
                <Text className="mt-2 text-sm text-[#4f453a]">{selectedDetail.skill.description}</Text>
              </View>

              <View className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <MetricStat label="Average score" value={String(selectedDetail.summary.averageScore)} detail="Across all benchmark rows" />
                <MetricStat label="Best score" value={String(selectedDetail.summary.bestScore)} detail="Top single benchmark row" />
                <MetricStat
                  label="Mapped task"
                  value={selectedDetail.task?.name ?? 'Unknown'}
                  detail={selectedDetail.task?.slug ?? 'missing-task'}
                />
              </View>

              <View className="rounded-2xl border border-[#ece2d4] bg-[#fcfaf7] p-4">
                <Text className="text-xs uppercase tracking-[0.18em] text-[#7b6e5d]">Full skill content used by Every Skill</Text>
                <ScrollView style={{ maxHeight: 280 }} className="mt-2 rounded-xl border border-[#e6dccd] bg-white p-3">
                  <Text className="text-xs leading-5 text-[#3d342a]" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                    {selectedDetail.skill.content}
                  </Text>
                </ScrollView>
              </View>

              <View className="rounded-2xl border border-[#ece2d4] bg-[#fcfaf7] p-4">
                <Text className="text-xs uppercase tracking-[0.18em] text-[#7b6e5d]">Benchmark evidence by agent</Text>
                <View className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                  {selectedDetail.byAgent.map((row) => (
                    <View key={row.agent} className="rounded-xl border border-[#e6dccd] bg-white p-3">
                      <Text className="text-sm font-semibold text-[#2f281f]">{row.agent.toUpperCase()}</Text>
                      <Text className="mt-1 text-xs text-[#685d4e]">rows {row.rows}</Text>
                      <Text className="text-xs text-[#685d4e]">avg {row.averageScore} · best {row.bestScore}</Text>
                      <Text className="text-xs text-[#685d4e]">quality {row.averageQuality} · security {row.averageSecurity}</Text>
                      <Text className="text-xs text-[#685d4e]">speed {row.averageSpeed} · cost {row.averageCost}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}
        </View>
      </View>

          <View id="top-candidates" className="rounded-[24px] border border-[#dbcfbe] bg-white p-6">
        <Text className="text-sm uppercase tracking-[0.16em] text-[#6d6254]">Benchmark explorer</Text>
        <Text className="mt-2 text-xl font-semibold text-[#231d17] md:text-2xl">Raw benchmark rows backing this UI</Text>

        <View className="mt-4 gap-3">
          <View>
            <Text className="mb-2 text-xs uppercase tracking-[0.16em] text-[#7d705f]">Scope</Text>
            <View className="flex-row flex-wrap gap-2">
              <FilterPill label="selected" active={benchmarkScope === 'selected'} onPress={() => setBenchmarkScope('selected')} />
              <FilterPill label="all" active={benchmarkScope === 'all'} onPress={() => setBenchmarkScope('all')} />
            </View>
          </View>

          <View>
            <Text className="mb-2 text-xs uppercase tracking-[0.16em] text-[#7d705f]">Run</Text>
            <View className="flex-row flex-wrap gap-2">
              <FilterPill label="all" active={benchmarkRunFilter === 'all'} onPress={() => setBenchmarkRunFilter('all')} />
              {catalog.runs.map((run) => (
                <FilterPill
                  key={run.id}
                  label={run.id.replace('bench-2026-02-14-', '')}
                  active={benchmarkRunFilter === run.id}
                  onPress={() => setBenchmarkRunFilter(run.id)}
                />
              ))}
            </View>
          </View>

          <View className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <View>
              <Text className="mb-2 text-xs uppercase tracking-[0.16em] text-[#7d705f]">Agent</Text>
              <View className="flex-row flex-wrap gap-2">
                <FilterPill label="all" active={benchmarkAgentFilter === 'all'} onPress={() => setBenchmarkAgentFilter('all')} />
                {agentOptions.map((candidate) => (
                  <FilterPill
                    key={candidate}
                    label={candidate}
                    active={benchmarkAgentFilter === candidate}
                    onPress={() => setBenchmarkAgentFilter(candidate)}
                  />
                ))}
              </View>
            </View>

            <View>
              <Text className="mb-2 text-xs uppercase tracking-[0.16em] text-[#7d705f]">Task</Text>
              <View className="flex-row flex-wrap gap-2">
                <FilterPill label="all" active={benchmarkTaskFilter === 'all'} onPress={() => setBenchmarkTaskFilter('all')} />
                {catalog.tasks.map((task) => (
                  <FilterPill
                    key={task.id}
                    label={task.slug}
                    active={benchmarkTaskFilter === task.id}
                    onPress={() => setBenchmarkTaskFilter(task.id)}
                  />
                ))}
              </View>
            </View>
          </View>

          <TextInput
            value={benchmarkQuery}
            onChangeText={setBenchmarkQuery}
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#ded3c3',
              backgroundColor: '#fffdf9',
              color: '#221c16',
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 15,
            }}
            placeholder="Search benchmark rows by skill, task, slug, or agent"
          />

          <Text className="text-sm text-[#5f5446]">Showing {benchmarkRows.length} benchmark rows from the same dataset used to rank recommendations.</Text>

          <ScrollView style={{ maxHeight: 420 }}>
            <View className="gap-2 pb-1">
              {benchmarkRows.slice(0, 160).map((row, index) => {
                const skill = skillsById.get(row.skillId);
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={`${row.id}-${index}`}
                    onPress={() => setSelectedSkillId(row.skillId)}
                    className="rounded-xl border border-[#e7ddcf] bg-[#fcfaf7] px-3 py-3"
                  >
                    <Text className="text-sm font-semibold text-[#2f281f]">
                      {skill?.name ?? row.skillId} · {row.agent.toUpperCase()} · {row.overallScore}
                    </Text>
                    <Text className="mt-1 text-xs text-[#685d4e]">
                      run {row.runId} · task {row.taskSlug} · quality {row.qualityScore} · security {row.securityScore} · speed {row.speedScore} · cost {row.costScore}
                    </Text>
                  </Pressable>
                );
              })}

              {benchmarkRows.length > 160 ? (
                <View className="rounded-xl border border-[#e7ddcf] bg-[#fcfaf7] px-3 py-3">
                  <Text className="text-xs text-[#685d4e]">Showing first 160 rows. Narrow filters to inspect more precisely.</Text>
                </View>
              ) : null}

              {benchmarkRows.length === 0 ? (
                <View className="rounded-xl border border-[#e7ddcf] bg-[#fcfaf7] px-3 py-3">
                  <Text className="text-xs text-[#685d4e]">No benchmark rows match the current filters.</Text>
                </View>
              ) : null}
            </View>
          </ScrollView>
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

type MetricStatProps = {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
};

const MetricStat = ({ label, value, detail }: MetricStatProps) => (
  <View className="rounded-xl border border-[#e6dccd] bg-[#fffaf3] p-3">
    <Text className="text-[11px] uppercase tracking-[0.16em] text-[#7f7262]">{label}</Text>
    <Text className="mt-1 text-base font-semibold text-[#2f281f]">{value}</Text>
    <Text className="mt-1 text-xs text-[#685d4e]">{detail}</Text>
  </View>
);

type FilterPillProps = {
  readonly label: string;
  readonly active: boolean;
  readonly onPress: () => void;
};

const FilterPill = ({ label, active, onPress }: FilterPillProps) => (
  <Pressable
    accessibilityRole="button"
    onPress={onPress}
    className={active ? 'rounded-full bg-[#184f87] px-3 py-2' : 'rounded-full border border-[#d3c6b3] bg-white px-3 py-2'}
  >
    <Text className={active ? 'text-xs font-semibold text-white' : 'text-xs font-semibold text-[#463d32]'}>{label}</Text>
  </Pressable>
);

export default Skills;
