import React from 'react';
import { ActivityIndicator, Image, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faArrowLeft, faDownload, faExternalLink } from '@fortawesome/pro-solid-svg-icons';

import type { DesignRunDetail } from '../types';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui';
import { cn } from '../../lib/cn';

type DesignDetailScreenProps = {
  readonly run?: DesignRunDetail;
  readonly isLoading?: boolean;
  readonly error?: string | null;
  readonly onBack: () => void;
};

const statusVariant = (status: DesignRunDetail['status']) => {
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

const statusLabel = (status: DesignRunDetail['status']) => {
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

const formatTime = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return dateString;
  }
};

const handleDownload = (url: string, filename?: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else {
    void Linking.openURL(url);
  }
};

const DesignDetailScreen = ({ run, isLoading, error, onBack }: DesignDetailScreenProps) => {
  if (isLoading) {
    return (
      <View className="flex flex-1 items-center justify-center gap-3 py-12">
        <ActivityIndicator size="large" color="#0f172a" />
        <Text className="text-base text-slate-500">Loading run details...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Error Loading Run</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" onPress={onBack}>
              <FontAwesomeIcon icon={faArrowLeft} size={14} color="#ffffff" />
              <Text className="ml-2 font-semibold text-white">Back to Runs</Text>
            </Button>
          </CardContent>
        </Card>
      </View>
    );
  }

  if (!run) {
    return (
      <View className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Run Not Found</CardTitle>
            <CardDescription>The requested design run could not be found.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" onPress={onBack}>
              <FontAwesomeIcon icon={faArrowLeft} size={14} color="#ffffff" />
              <Text className="ml-2 font-semibold text-white">Back to Runs</Text>
            </Button>
          </CardContent>
        </Card>
      </View>
    );
  }

  const hasOutputs = run.outputs && run.outputs.length > 0;
  const hasTimeline = run.timeline && run.timeline.length > 0;

  return (
    <View className="flex flex-col gap-6">
      <View className="rounded-3xl bg-gradient-to-br from-ink via-ink to-brand-900 p-6 text-white">
        <Pressable onPress={onBack} className="mb-4 flex flex-row items-center gap-2">
          <FontAwesomeIcon icon={faArrowLeft} size={16} color="#f8fafc" />
          <Text className="text-sm font-semibold text-white">Back to Runs</Text>
        </Pressable>
        <View className="flex flex-row items-start justify-between gap-4">
          <View className="flex-1">
            <Text className="text-xs uppercase tracking-[0.35em] text-slate-200">Design Run</Text>
            <Text className="mt-2 text-3xl font-bold text-white">{run.name}</Text>
            {run.config?.prompt ? (
              <Text className="mt-2 text-base text-slate-200">{run.config.prompt}</Text>
            ) : null}
          </View>
          <Badge variant={statusVariant(run.status)}>{statusLabel(run.status)}</Badge>
        </View>
      </View>

      <Card>
        <CardHeader>
          <CardTitle>Run Details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <View className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <View>
              <Text className="text-xs uppercase tracking-[0.3em] text-slate-400">Created</Text>
              <Text className="mt-1 text-sm font-medium text-slate-700">{formatDate(run.createdAt)}</Text>
            </View>
            <View>
              <Text className="text-xs uppercase tracking-[0.3em] text-slate-400">Updated</Text>
              <Text className="mt-1 text-sm font-medium text-slate-700">{formatDate(run.updatedAt)}</Text>
            </View>
            {run.completedAt ? (
              <View>
                <Text className="text-xs uppercase tracking-[0.3em] text-slate-400">Completed</Text>
                <Text className="mt-1 text-sm font-medium text-slate-700">{formatDate(run.completedAt)}</Text>
              </View>
            ) : null}
            {run.config?.variants ? (
              <View>
                <Text className="text-xs uppercase tracking-[0.3em] text-slate-400">Variants</Text>
                <Text className="mt-1 text-sm font-medium text-slate-700">{run.config.variants}</Text>
              </View>
            ) : null}
          </View>
          {run.config?.style ? (
            <View>
              <Text className="text-xs uppercase tracking-[0.3em] text-slate-400">Style</Text>
              <Text className="mt-1 text-sm font-medium text-slate-700">{run.config.style}</Text>
            </View>
          ) : null}
          {run.progress !== undefined && run.status === 'running' ? (
            <View>
              <Text className="text-xs uppercase tracking-[0.3em] text-slate-400">Progress</Text>
              <View className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <View
                  className="h-full bg-brand-600"
                  style={{ width: `${Math.round(run.progress * 100)}%` }}
                />
              </View>
              <Text className="mt-1 text-xs text-slate-500">{Math.round(run.progress * 100)}%</Text>
            </View>
          ) : null}
          {run.error ? (
            <View className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
              <Text className="text-xs uppercase tracking-[0.3em] text-red-600">Error</Text>
              <Text className="mt-1 text-sm text-red-800">{run.error}</Text>
            </View>
          ) : null}
        </CardContent>
      </Card>

      {hasOutputs ? (
        <Card>
          <CardHeader>
            <CardTitle>Outputs ({run.outputs?.length ?? 0})</CardTitle>
            <CardDescription>Preview and download generated design assets</CardDescription>
          </CardHeader>
          <CardContent>
            <View className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {run.outputs?.map((output) => (
                <View key={output.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  {output.type === 'image' ? (
                    <View className="mb-3 overflow-hidden rounded-xl bg-slate-100">
                      <Image
                        source={{ uri: output.thumbnail || output.url }}
                        className="aspect-video w-full"
                        resizeMode="cover"
                      />
                    </View>
                  ) : (
                    <View className="mb-3 flex aspect-video items-center justify-center rounded-xl bg-slate-100">
                      <Text className="text-2xl uppercase text-slate-400">{output.type}</Text>
                    </View>
                  )}
                  <View className="flex flex-row gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onPress={() => void Linking.openURL(output.url)}
                      className="flex-1"
                    >
                      <FontAwesomeIcon icon={faExternalLink} size={12} color="#ffffff" />
                      <Text className="ml-1 text-xs font-semibold text-white">View</Text>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onPress={() => handleDownload(output.url, `${run.name}-${output.id}`)}
                      className="flex-1"
                    >
                      <FontAwesomeIcon icon={faDownload} size={12} color="#0f172a" />
                      <Text className="ml-1 text-xs font-semibold text-ink">Save</Text>
                    </Button>
                  </View>
                </View>
              ))}
            </View>
          </CardContent>
        </Card>
      ) : null}

      {hasTimeline ? (
        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
            <CardDescription>Processing events and status updates</CardDescription>
          </CardHeader>
          <CardContent>
            <View className="space-y-3">
              {run.timeline?.map((event, index) => (
                <View
                  key={index}
                  className={cn(
                    'flex flex-row gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4',
                    index === 0 && 'bg-brand-50 border-brand-200'
                  )}
                >
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-slate-800">{event.event}</Text>
                    {event.message ? (
                      <Text className="mt-1 text-sm text-slate-600">{event.message}</Text>
                    ) : null}
                  </View>
                  <Text className="text-xs text-slate-500">{formatTime(event.timestamp)}</Text>
                </View>
              ))}
            </View>
          </CardContent>
        </Card>
      ) : null}
    </View>
  );
};

export default DesignDetailScreen;
