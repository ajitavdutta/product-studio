import { useQuery } from '@tanstack/react-query';
import { apiRequest } from './client';
import type { components } from './types';

export type WatermarkPresetRead = components['schemas']['WatermarkPresetRead'];

export const watermarkPresetKeys = { list: ['watermarkPresets'] as const };

export function useWatermarkPresets() {
  return useQuery({
    queryKey: watermarkPresetKeys.list,
    queryFn: () => apiRequest<WatermarkPresetRead[]>('GET', '/watermark-presets'),
  });
}
