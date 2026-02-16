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
  const [selectedBenchmarkId, setSelectedBenchmarkId] = React.useState<string | null>(null);

  const summaries = React.useMemo(() => getSkillSummaries(), []);
  const coverage = React.useMemo(() => getCoverage(), []);
  const recommendation = React.useMemo(() => recommendSkill(submittedTask, agent, 5), [submittedTask, agent]);

  const skillsById = React.useMemo(() => new Map(catalog.skills.map((skill) => [skill.id, skill])), []);
  const tasksById = React.useMemo(() => new Map(catalog.tasks.map((task) => [task.id, task])), []);
  const runsById = React.useMemo(() => new Map(catalog.runs.map((run) => [run.id, run])), []);
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

  React.useEffect(() => {
    if (benchmarkRows.length === 0) {
      setSelectedBenchmarkId(null);
      return;
    }
    if (!selectedBenchmarkId || !benchmarkRows.some((row) => row.id === selectedBenchmarkId)) {
      setSelectedBenchmarkId(benchmarkRows[0].id);
    }
  }, [benchmarkRows, selectedBenchmarkId]);

  const selectedBenchmark = React.useMemo(() => {
    if (!selectedBenchmarkId) return null;
    const row = benchmarkRows.find((entry) => entry.id === selectedBenchmarkId);
    if (!row) return null;
    return {
      row,
      run: runsById.get(row.runId) ?? null,
      task: tasksById.get(row.taskId) ?? null,
      skill: skillsById.get(row.skillId) ?? null,
    };
  }, [selectedBenchmarkId, benchmarkRows, runsById, tasksById, skillsById]);

  const onSubmit = React.useCallback(() => {
    const next = taskQuery.trim();
    if (next.length >= 8) {
      setSubmittedTask(next);
      setLastEvaluatedAt(new Date());
    }
  }, [taskQuery]);

  return (
    <View className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-4 pb-14 md:gap-10 md:px-8">
      <View className="rounded-[28px] border border-[#cfd8e8] bg-[#f4f8ff] p-6 md:p-8">
        <Text className="text-xs uppercase tracking-[0.26em] text-[#44607f]">Every Skill Catalog</Text>
        <Text className="mt-3 text-[34px] text-[#10243d] md:max-w-[920px] md:text-[54px]" style={{ fontFamily: 'var(--font-display)' }}>
          Skills, Benchmarks, and Retrieval Results
        </Text>
        <Text className="mt-4 max-w-[980px] text-base leading-7 text-[#2f445f] md:text-[22px] md:leading-[1.38]">
          Explore all 50 skills, inspect every benchmark result row, and validate provenance and security review metadata behind each recommendation.
        </Text>
      </View>

      <View className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Catalog skills" value={String(catalog.skills.length)} detail={`${filteredSkills.length} visible with current filters`} />
        <StatCard label="Task tracks" value={String(catalog.tasks.length)} detail="Coverage across benchmark scenarios" />
        <StatCard label="Benchmark runs" value={String(catalog.runs.length)} detail="Codex, Claude, and Gemini" />
        <StatCard label="Score rows" value={String(coverage.scoreRows)} detail="Result rows visible in benchmark explorer" />
        <StatCard label="Approved skills" value={String(summaries.filter((skill) => skill.securityStatus === 'approved').length)} detail="Security-reviewed skills eligible for retrieval" />
      </View>

      <View className="rounded-[28px] border border-[#cfd8e8] bg-white p-6 md:p-8">
        <Text className="text-xs uppercase tracking-[0.24em] text-[#4a6480]">Recommendation simulator</Text>
        <Text className="mt-2 text-2xl font-semibold text-[#10243d] md:text-[38px]">Task to skill retrieval</Text>

        <View className="mt-5 gap-4">
          <TextInput
            value={taskQuery}
            onChangeText={setTaskQuery}
            style={{
              minHeight: 132,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: '#cfd8e8',
              backgroundColor: '#f9fbff',
              color: '#10243d',
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
                  className={active ? 'rounded-full bg-[#145fa9] px-4 py-2' : 'rounded-full border border-[#c7d3e5] bg-[#f8fbff] px-4 py-2'}
                >
                  <Text className={active ? 'text-sm font-semibold text-white' : 'text-sm font-semibold text-[#26415f]'}>{candidate}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable accessibilityRole="button" onPress={onSubmit} className="self-start rounded-2xl bg-[#145fa9] px-6 py-3">
            <Text className="text-base font-semibold text-white">Recommend Skill</Text>
          </Pressable>

          <View className="rounded-2xl border border-[#cfdaea] bg-[#f8fbff] p-5">
            <Text className="text-xs uppercase tracking-[0.22em] text-[#5a7594]">Top recommendation</Text>
            <Text className="mt-2 text-2xl font-semibold text-[#10243d]">{recommendation.recommendation.name}</Text>
            <Text className="mt-2 text-sm text-[#2e4864]">
              slug `{recommendation.recommendation.slug}` · strategy {recommendation.retrievalStrategy} · final score{' '}
              {recommendation.recommendation.finalScore}
            </Text>
            <Text className="mt-1 text-sm text-[#2e4864]">
              similarity {recommendation.recommendation.embeddingSimilarity} · benchmark {recommendation.recommendation.averageBenchmarkScore}
            </Text>
            <Text className="mt-1 text-sm text-[#2e4864]">evaluated for {agent.toUpperCase()} at {lastEvaluatedAt.toLocaleTimeString()}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSelectedSkillId(recommendation.recommendation.id)}
              className="mt-4 self-start rounded-xl border border-[#bdd0e8] bg-white px-4 py-2"
            >
              <Text className="text-sm font-semibold text-[#233f5c]">Open skill dossier</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View className="grid grid-cols-1 gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <View className="rounded-[26px] border border-[#d7e0ed] bg-white p-6">
          <Text className="text-xs uppercase tracking-[0.22em] text-[#536f8f]">Skill explorer</Text>
          <Text className="mt-2 text-xl font-semibold text-[#132a46] md:text-2xl">Browse all skills</Text>

          <View className="mt-4 gap-4">
            <TextInput
              value={skillQuery}
              onChangeText={setSkillQuery}
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#d3deec',
                backgroundColor: '#f8fbff',
                color: '#17304c',
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 15,
              }}
              placeholder="Search skill, slug, task, keyword"
            />

            <View>
              <Text className="mb-2 text-xs uppercase tracking-[0.16em] text-[#607c9b]">Status</Text>
              <View className="flex-row flex-wrap gap-2">
                {statusOptions.map((status) => (
                  <FilterPill key={status} label={status} active={statusFilter === status} onPress={() => setStatusFilter(status)} />
                ))}
              </View>
            </View>

            <View>
              <Text className="mb-2 text-xs uppercase tracking-[0.16em] text-[#607c9b]">Task category</Text>
              <View className="flex-row flex-wrap gap-2">
                {categories.map((category) => (
                  <FilterPill key={category} label={category} active={categoryFilter === category} onPress={() => setCategoryFilter(category)} />
                ))}
              </View>
            </View>

            <View className="rounded-2xl border border-[#dce6f3] bg-[#f8fbff] p-3">
              <Text className="text-xs uppercase tracking-[0.14em] text-[#607b98]">Matching skills</Text>
              <ScrollView style={{ maxHeight: 440 }} className="mt-2">
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
                        className={active ? 'rounded-xl border border-[#8fb3dc] bg-white px-3 py-3' : 'rounded-xl border border-[#d9e2ef] bg-[#fdfefe] px-3 py-3'}
                      >
                        <Text className="text-[11px] uppercase tracking-[0.16em] text-[#6e88a3]">Rank #{index + 1}</Text>
                        <Text className="mt-1 text-base font-semibold text-[#17304c]">{skillSummary.name}</Text>
                        <Text className="mt-1 text-xs text-[#4e6884]">{skillSummary.slug}</Text>
                        <Text className="mt-1 text-xs text-[#4e6884]">
                          avg {skillSummary.averageScore} · best {skillSummary.bestScore} · {task?.category ?? 'unknown'}
                        </Text>
                      </Pressable>
                    );
                  })}

                  {filteredSkills.length === 0 ? (
                    <View className="rounded-xl border border-[#d9e2ef] bg-[#fdfefe] px-3 py-4">
                      <Text className="text-sm text-[#4e6884]">No skills match the current filters.</Text>
                    </View>
                  ) : null}
                </View>
              </ScrollView>
            </View>
          </View>
        </View>

        <View className="rounded-[26px] border border-[#d7e0ed] bg-white p-6">
          <Text className="text-xs uppercase tracking-[0.22em] text-[#536f8f]">Skill dossier</Text>
          {!selectedDetail ? (
            <Text className="mt-3 text-sm text-[#556f8c]">Choose a skill to inspect full content and benchmark evidence.</Text>
          ) : (
            <View className="mt-3 gap-4">
              <View>
                <Text className="text-2xl font-semibold text-[#132a46] md:text-[34px]">{selectedDetail.skill.name}</Text>
                <Text className="mt-1 text-sm text-[#4f6882]">slug `{selectedDetail.skill.slug}` · source {selectedDetail.skill.provenance.repository}</Text>
                <Text className="mt-2 text-sm leading-6 text-[#24405f]">{selectedDetail.skill.description}</Text>
              </View>

              <View className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <MetricStat label="Average score" value={String(selectedDetail.summary.averageScore)} detail="Across all benchmark rows" />
                <MetricStat label="Best score" value={String(selectedDetail.summary.bestScore)} detail="Top single benchmark row" />
                <MetricStat label="Mapped task" value={selectedDetail.task?.name ?? 'Unknown'} detail={selectedDetail.task?.slug ?? 'missing-task'} />
              </View>

              <View className="rounded-2xl border border-[#dce6f3] bg-[#f8fbff] p-4">
                <Text className="text-xs uppercase tracking-[0.18em] text-[#5f7997]">Provenance and security review</Text>
                <View className="mt-2 gap-1">
                  <KeyValueRow label="sourceUrl" value={selectedDetail.skill.provenance.sourceUrl} />
                  <KeyValueRow label="repository" value={selectedDetail.skill.provenance.repository} />
                  <KeyValueRow label="importedFrom" value={selectedDetail.skill.provenance.importedFrom} />
                  <KeyValueRow label="reviewStatus" value={selectedDetail.skill.securityReview.status} />
                  <KeyValueRow label="reviewMethod" value={selectedDetail.skill.securityReview.reviewMethod} />
                  <KeyValueRow label="reviewedAt" value={selectedDetail.skill.securityReview.reviewedAt} />
                </View>
              </View>

              <View className="rounded-2xl border border-[#dce6f3] bg-[#f8fbff] p-4">
                <Text className="text-xs uppercase tracking-[0.18em] text-[#5f7997]">Benchmark evidence by agent</Text>
                <View className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                  {selectedDetail.byAgent.map((row) => (
                    <View key={row.agent} className="rounded-xl border border-[#d5e1f0] bg-white p-3">
                      <Text className="text-sm font-semibold text-[#17304c]">{row.agent.toUpperCase()}</Text>
                      <Text className="mt-1 text-xs text-[#4e6884]">rows {row.rows}</Text>
                      <Text className="text-xs text-[#4e6884]">avg {row.averageScore} · best {row.bestScore}</Text>
                      <Text className="text-xs text-[#4e6884]">quality {row.averageQuality} · security {row.averageSecurity}</Text>
                      <Text className="text-xs text-[#4e6884]">speed {row.averageSpeed} · cost {row.averageCost}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View className="rounded-2xl border border-[#dce6f3] bg-[#f8fbff] p-4">
                <Text className="text-xs uppercase tracking-[0.18em] text-[#5f7997]">Full skill content</Text>
                <ScrollView style={{ maxHeight: 240 }} className="mt-2 rounded-xl border border-[#d5e1f0] bg-white p-3">
                  <Text className="text-xs leading-5 text-[#17304c]" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                    {selectedDetail.skill.content}
                  </Text>
                </ScrollView>
              </View>

              <View className="rounded-2xl border border-[#dce6f3] bg-[#f8fbff] p-4">
                <Text className="text-xs uppercase tracking-[0.18em] text-[#5f7997]">Raw skill record JSON</Text>
                <ScrollView style={{ maxHeight: 220 }} className="mt-2 rounded-xl border border-[#d5e1f0] bg-white p-3">
                  <Text className="text-xs leading-5 text-[#17304c]" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                    {JSON.stringify(selectedDetail.skill, null, 2)}
                  </Text>
                </ScrollView>
              </View>
            </View>
          )}
        </View>
      </View>

      <View className="rounded-[26px] border border-[#d7e0ed] bg-white p-6">
        <Text className="text-xs uppercase tracking-[0.22em] text-[#536f8f]">Benchmark explorer</Text>
        <Text className="mt-2 text-xl font-semibold text-[#132a46] md:text-2xl">Raw benchmark rows and result artifacts</Text>

        <View className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {catalog.runs.map((run) => (
            <View key={run.id} className="rounded-xl border border-[#d5e1f0] bg-[#f8fbff] p-3">
              <Text className="text-xs uppercase tracking-[0.16em] text-[#607b98]">{run.id.replace('bench-2026-02-14-', '')}</Text>
              <Text className="mt-1 text-sm font-semibold text-[#17304c]">{run.mode} · {run.status}</Text>
              <Text className="mt-1 text-xs text-[#4e6884]">started {new Date(run.startedAt).toLocaleString()}</Text>
              <Text className="text-xs text-[#4e6884]">completed {new Date(run.completedAt).toLocaleString()}</Text>
            </View>
          ))}
        </View>

        <View className="mt-5 gap-4">
          <View>
            <Text className="mb-2 text-xs uppercase tracking-[0.16em] text-[#607c9b]">Scope</Text>
            <View className="flex-row flex-wrap gap-2">
              <FilterPill label="selected" active={benchmarkScope === 'selected'} onPress={() => setBenchmarkScope('selected')} />
              <FilterPill label="all" active={benchmarkScope === 'all'} onPress={() => setBenchmarkScope('all')} />
            </View>
          </View>

          <View className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <View>
              <Text className="mb-2 text-xs uppercase tracking-[0.16em] text-[#607c9b]">Run</Text>
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

            <View>
              <Text className="mb-2 text-xs uppercase tracking-[0.16em] text-[#607c9b]">Agent</Text>
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
              <Text className="mb-2 text-xs uppercase tracking-[0.16em] text-[#607c9b]">Task</Text>
              <View className="flex-row flex-wrap gap-2">
                <FilterPill label="all" active={benchmarkTaskFilter === 'all'} onPress={() => setBenchmarkTaskFilter('all')} />
                {catalog.tasks.map((task) => (
                  <FilterPill key={task.id} label={task.slug} active={benchmarkTaskFilter === task.id} onPress={() => setBenchmarkTaskFilter(task.id)} />
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
              borderColor: '#d3deec',
              backgroundColor: '#f8fbff',
              color: '#17304c',
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 15,
            }}
            placeholder="Search rows by skill, task, slug, run, or agent"
          />

          <Text className="text-sm text-[#4e6884]">Showing {benchmarkRows.length} rows (of {catalog.scores.length} total benchmark rows).</Text>

          <View className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <View className="rounded-2xl border border-[#dce6f3] bg-[#f8fbff] p-3">
              <ScrollView style={{ maxHeight: 500 }}>
                <View className="gap-2 pb-1">
                  {benchmarkRows.slice(0, 220).map((row, index) => {
                    const active = row.id === selectedBenchmarkId;
                    const skill = skillsById.get(row.skillId);
                    return (
                      <Pressable
                        accessibilityRole="button"
                        key={`${row.id}-${index}`}
                        onPress={() => {
                          setSelectedBenchmarkId(row.id);
                          setSelectedSkillId(row.skillId);
                        }}
                        className={active ? 'rounded-xl border border-[#8fb3dc] bg-white px-3 py-3' : 'rounded-xl border border-[#d9e2ef] bg-white px-3 py-3'}
                      >
                        <Text className="text-sm font-semibold text-[#17304c]">
                          {skill?.name ?? row.skillId} · {row.agent.toUpperCase()} · {row.overallScore}
                        </Text>
                        <Text className="mt-1 text-xs text-[#4e6884]">
                          run {row.runId} · task {row.taskSlug} · success {row.successRate} · quality {row.qualityScore} · security {row.securityScore}
                        </Text>
                      </Pressable>
                    );
                  })}

                  {benchmarkRows.length > 220 ? (
                    <View className="rounded-xl border border-[#d9e2ef] bg-white px-3 py-3">
                      <Text className="text-xs text-[#4e6884]">Showing first 220 rows. Narrow filters to inspect specific result sets.</Text>
                    </View>
                  ) : null}

                  {benchmarkRows.length === 0 ? (
                    <View className="rounded-xl border border-[#d9e2ef] bg-white px-3 py-3">
                      <Text className="text-xs text-[#4e6884]">No benchmark rows match the current filters.</Text>
                    </View>
                  ) : null}
                </View>
              </ScrollView>
            </View>

            <View className="rounded-2xl border border-[#dce6f3] bg-[#f8fbff] p-4">
              {!selectedBenchmark ? (
                <Text className="text-sm text-[#4e6884]">Select a benchmark row to inspect complete result metadata.</Text>
              ) : (
                <View className="gap-3">
                  <Text className="text-xs uppercase tracking-[0.18em] text-[#5f7997]">Selected benchmark result</Text>
                  <Text className="text-xl font-semibold text-[#132a46]">{selectedBenchmark.skill?.name ?? selectedBenchmark.row.skillId}</Text>
                  <KeyValueRow label="runId" value={selectedBenchmark.row.runId} />
                  <KeyValueRow label="agent" value={selectedBenchmark.row.agent} />
                  <KeyValueRow label="task" value={`${selectedBenchmark.row.taskName} (${selectedBenchmark.row.taskSlug})`} />
                  <KeyValueRow label="overall" value={String(selectedBenchmark.row.overallScore)} />
                  <KeyValueRow label="quality/security" value={`${selectedBenchmark.row.qualityScore} / ${selectedBenchmark.row.securityScore}`} />
                  <KeyValueRow label="speed/cost" value={`${selectedBenchmark.row.speedScore} / ${selectedBenchmark.row.costScore}`} />
                  <KeyValueRow label="successRate" value={String(selectedBenchmark.row.successRate)} />
                  <KeyValueRow label="createdAt" value={selectedBenchmark.row.createdAt} />
                  <KeyValueRow label="artifactPath" value={selectedBenchmark.row.artifactPath} />

                  {selectedBenchmark.run ? (
                    <View className="rounded-xl border border-[#d6e1f0] bg-white p-3">
                      <Text className="text-xs uppercase tracking-[0.14em] text-[#607b98]">Run metadata</Text>
                      <Text className="mt-1 text-xs text-[#4e6884]">mode {selectedBenchmark.run.mode} · status {selectedBenchmark.run.status}</Text>
                      <Text className="text-xs text-[#4e6884]">runner {selectedBenchmark.run.runner}</Text>
                      <Text className="text-xs text-[#4e6884]">artifact {selectedBenchmark.run.artifactPath}</Text>
                    </View>
                  ) : null}

                  <View className="rounded-xl border border-[#d6e1f0] bg-white p-3">
                    <Text className="text-xs uppercase tracking-[0.14em] text-[#607b98]">Raw result JSON</Text>
                    <ScrollView style={{ maxHeight: 220 }} className="mt-2">
                      <Text className="text-xs leading-5 text-[#17304c]" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                        {JSON.stringify(selectedBenchmark, null, 2)}
                      </Text>
                    </ScrollView>
                  </View>
                </View>
              )}
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
  <View className="rounded-2xl border border-[#d7e0ed] bg-white p-4 md:p-5">
    <Text className="text-xs uppercase tracking-[0.16em] text-[#5f7a98]">{label}</Text>
    <Text className="mt-2 text-3xl font-semibold text-[#132a46] md:text-4xl">{value}</Text>
    <Text className="mt-1 text-sm text-[#4e6884]">{detail}</Text>
  </View>
);

type MetricStatProps = {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
};

const MetricStat = ({ label, value, detail }: MetricStatProps) => (
  <View className="rounded-xl border border-[#d5e1f0] bg-white p-3">
    <Text className="text-[11px] uppercase tracking-[0.16em] text-[#63809f]">{label}</Text>
    <Text className="mt-1 text-base font-semibold text-[#17304c]">{value}</Text>
    <Text className="mt-1 text-xs text-[#4e6884]">{detail}</Text>
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
    className={active ? 'rounded-full bg-[#145fa9] px-3 py-2' : 'rounded-full border border-[#c7d3e5] bg-[#f8fbff] px-3 py-2'}
  >
    <Text className={active ? 'text-xs font-semibold text-white' : 'text-xs font-semibold text-[#2b4663]'}>{label}</Text>
  </Pressable>
);

type KeyValueRowProps = {
  readonly label: string;
  readonly value: string;
};

const KeyValueRow = ({ label, value }: KeyValueRowProps) => (
  <View className="flex-row items-start gap-2">
    <Text className="w-[116px] text-xs uppercase tracking-[0.08em] text-[#5f7997]">{label}</Text>
    <Text className="flex-1 text-xs leading-5 text-[#22405f]">{value}</Text>
  </View>
);

export default Skills;
