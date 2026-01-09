import React from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faPlus, faTrash } from '@fortawesome/pro-solid-svg-icons';

import type { DesignRun } from '../types';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui';
import { cn } from '../../lib/cn';

const shouldHandleAnchorClick = (event: React.MouseEvent<HTMLAnchorElement>): boolean => {
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return false;
  return true;
};

type DesignListScreenProps = {
  readonly runs: DesignRun[];
  readonly isLoading?: boolean;
  readonly onCreateNew: () => void;
  readonly onViewRun: (runId: string) => void;
  readonly onDeleteRun: (runId: string) => void;
  readonly isDeletingRun?: string | null;
};

const statusVariant = (status: DesignRun['status']) => {
  switch (status) {
    case 'completed':
      return 'success';
    case 'failed':
      return 'danger';
    case 'cancelled':
      return 'muted';
    case 'running':
      return 'warning';
    case 'pending':
    default:
      return 'muted';
  }
};

const statusLabel = (status: DesignRun['status']) => {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    case 'running':
      return 'Running';
    case 'pending':
    default:
      return 'Pending';
  }
};

const formatDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
};

const DesignListScreen = ({
  runs,
  isLoading,
  onCreateNew,
  onViewRun,
  onDeleteRun,
  isDeletingRun,
}: DesignListScreenProps) => {
  if (isLoading && runs.length === 0) {
    return (
      <View className="flex flex-1 items-center justify-center gap-3 py-12">
        <ActivityIndicator size="large" color="#0f172a" />
        <Text className="text-base text-slate-500">Loading design runs...</Text>
      </View>
    );
  }

  return (
    <View className="flex flex-col gap-6">
      <View className="flex flex-row items-start justify-between gap-4 rounded-3xl bg-gradient-to-br from-ink via-ink to-brand-900 p-6 text-white">
        <View className="flex-1">
          <Text className="text-xs uppercase tracking-[0.35em] text-slate-200">Design Studio</Text>
          <Text className="mt-2 text-3xl font-bold text-white">Design Runs</Text>
          <Text className="mt-2 text-base text-slate-200">
            View and manage your AI-generated design outputs. Each run contains multiple variants.
          </Text>
        </View>
        <Button variant="secondary" onPress={onCreateNew} className="mt-6">
          <FontAwesomeIcon icon={faPlus} size={14} color="#ffffff" />
          <Text className="ml-2 font-semibold text-white">New Run</Text>
        </Button>
      </View>

      {runs.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No design runs yet</CardTitle>
            <CardDescription>
              Create your first design run to generate AI-powered design variations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onPress={onCreateNew}>
              <FontAwesomeIcon icon={faPlus} size={14} color="#ffffff" />
              <Text className="ml-2 font-semibold text-white">Create First Run</Text>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <View className="gap-4">
          {runs.map((run) => {
            const isDeleting = isDeletingRun === run.id;
            const href = `/app/design/runs/${encodeURIComponent(run.id)}`;
            return (
              <Card key={run.id}>
                <Pressable
                  onPress={() => onViewRun(run.id)}
                  disabled={isDeleting}
                  className={cn(
                    'transition-opacity',
                    isDeleting && 'opacity-60'
                  )}
                >
                  <CardHeader>
                    <View className="flex flex-row items-start justify-between gap-4">
                      <View className="flex-1">
                        <CardTitle>{run.name}</CardTitle>
                        <CardDescription>
                          {run.config?.prompt ? run.config.prompt.slice(0, 120) + (run.config.prompt.length > 120 ? '...' : '') : 'No prompt provided'}
                        </CardDescription>
                        {Platform.OS === 'web' ? (
                          <a
                            href={href}
                            className="mt-2 inline-flex text-xs font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 hover:text-brand-800"
                            onClick={(event) => {
                              if (shouldHandleAnchorClick(event)) {
                                event.preventDefault();
                                onViewRun(run.id);
                              }
                            }}
                          >
                            Open link
                          </a>
                        ) : null}
                      </View>
                      <Badge variant={statusVariant(run.status)}>{statusLabel(run.status)}</Badge>
                    </View>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 border-t border-slate-100 pt-4">
                    <View className="flex flex-row flex-wrap items-center gap-4">
                      <View className="flex-1">
                        <Text className="text-xs uppercase tracking-[0.3em] text-slate-400">Created</Text>
                        <Text className="mt-1 text-sm text-slate-700">{formatDate(run.createdAt)}</Text>
                      </View>
                      {run.config?.variants ? (
                        <View>
                          <Text className="text-xs uppercase tracking-[0.3em] text-slate-400">Variants</Text>
                          <Text className="mt-1 text-sm text-slate-700">{run.config.variants}</Text>
                        </View>
                      ) : null}
                      {run.config?.style ? (
                        <View>
                          <Text className="text-xs uppercase tracking-[0.3em] text-slate-400">Style</Text>
                          <Text className="mt-1 text-sm text-slate-700">{run.config.style}</Text>
                        </View>
                      ) : null}
                      {run.progress !== undefined && run.status === 'running' ? (
                        <View>
                          <Text className="text-xs uppercase tracking-[0.3em] text-slate-400">Progress</Text>
                          <Text className="mt-1 text-sm text-slate-700">{Math.round(run.progress * 100)}%</Text>
                        </View>
                      ) : null}
                    </View>
                    <View className="flex flex-row items-center justify-between gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onPress={() => onViewRun(run.id)}
                        disabled={isDeleting}
                      >
                        View Details
                      </Button>
                      <Pressable
                        onPress={() => onDeleteRun(run.id)}
                        disabled={isDeleting}
                        className={cn(
                          'rounded-xl border border-slate-300 px-3 py-2',
                          isDeleting && 'opacity-50'
                        )}
                      >
                        {isDeleting ? (
                          <ActivityIndicator size="small" color="#64748b" />
                        ) : (
                          <FontAwesomeIcon icon={faTrash} size={14} color="#64748b" />
                        )}
                      </Pressable>
                    </View>
                  </CardContent>
                </Pressable>
              </Card>
            );
          })}
        </View>
      )}
    </View>
  );
};

export default DesignListScreen;
