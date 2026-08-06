'use server';

import { revalidatePath } from 'next/cache';

import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createClient } from '@/lib/supabase/server';

export type TrackActionResult = {
  error?: string;
  fieldErrors?: {
    slug?: string;
    name?: string;
    full_price?: string;
    id?: string;
  };
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseFullPrice(raw: string): { value?: number; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { error: 'Full price is required' };
  }

  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { error: 'Enter a valid price' };
  }

  if (value < 0) {
    return { error: 'Full price must be zero or greater' };
  }

  return { value: Math.round(value * 100) / 100 };
}

function validateSlug(raw: string): { value?: string; error?: string } {
  const slug = raw.trim().toLowerCase();
  if (!slug) {
    return { error: 'Slug is required' };
  }

  if (!SLUG_PATTERN.test(slug)) {
    return {
      error:
        'Slug must be lowercase letters, numbers, and hyphens (no leading/trailing hyphens)',
    };
  }

  return { value: slug };
}

function validateName(raw: string): { value?: string; error?: string } {
  const name = raw.trim();
  if (!name) {
    return { error: 'Name is required' };
  }

  return { value: name };
}

export async function createTrack(
  _prevState: TrackActionResult,
  formData: FormData
): Promise<TrackActionResult> {
  await requireAdmin();

  const slugResult = validateSlug(String(formData.get('slug') ?? ''));
  const nameResult = validateName(String(formData.get('name') ?? ''));
  const priceResult = parseFullPrice(String(formData.get('full_price') ?? ''));

  const fieldErrors: TrackActionResult['fieldErrors'] = {};
  if (slugResult.error) fieldErrors.slug = slugResult.error;
  if (nameResult.error) fieldErrors.name = nameResult.error;
  if (priceResult.error) fieldErrors.full_price = priceResult.error;

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('tracks').insert({
    slug: slugResult.value!,
    name: nameResult.value!,
    full_price: priceResult.value!,
  });

  if (error) {
    if (error.code === '23505') {
      return { fieldErrors: { slug: 'A track with this slug already exists' } };
    }
    return { error: error.message };
  }

  revalidatePath('/admin/tracks');
  return {};
}

export async function updateTrackPrice(
  _prevState: TrackActionResult,
  formData: FormData
): Promise<TrackActionResult> {
  await requireAdmin();

  const id = String(formData.get('id') ?? '').trim();
  const priceResult = parseFullPrice(String(formData.get('full_price') ?? ''));

  const fieldErrors: TrackActionResult['fieldErrors'] = {};
  if (!id) fieldErrors.id = 'Track id is required';
  if (priceResult.error) fieldErrors.full_price = priceResult.error;

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('tracks')
    .update({ full_price: priceResult.value! })
    .eq('id', id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/admin/tracks');
  return {};
}
