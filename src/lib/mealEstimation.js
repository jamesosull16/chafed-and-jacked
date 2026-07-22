/**
 * MEAL ESTIMATION CLIENT — Chafed & Jacked
 *
 * Thin wrapper over the `estimateMealCallable` Cloud Function. No API keys are
 * involved here — the client sends an image and/or a description and receives
 * an estimate back for confirmation.
 *
 * Photos are downscaled and re-encoded before upload: a modern phone camera
 * produces 4-8MB files, the function caps input at 5MB, and food identification
 * gains nothing from resolution beyond about 1568px on the long edge while
 * image token cost keeps climbing.
 */

import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'

/**
 * Long-edge cap. Claude Opus 4.8 accepts up to 2576px, but a plate of food is
 * fully legible well below that and the token cost roughly triples at the top
 * of the range.
 */
export const MAX_IMAGE_EDGE = 1568

const JPEG_QUALITY = 0.85

/**
 * Thread thumbnails are stored as data URLs inside the chat message document,
 * so they must stay well clear of Firestore's 1MB per-document limit. 320px at
 * low quality lands around 10-20KB — plenty for a 200px-wide preview bubble,
 * and it avoids standing up a Storage bucket just to show a thumbnail.
 */
const THUMB_EDGE = 320
const THUMB_QUALITY = 0.6

function drawScaled(img, maxEdge, quality) {
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * Downscale and re-encode a File into base64 JPEG.
 *
 * @returns {Promise<{ base64: string, mediaType: string, previewUrl: string }>}
 */
export function prepareImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('That file is not an image.'))
      return
    }

    const objectUrl = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      try {
        const full = drawScaled(img, MAX_IMAGE_EDGE, JPEG_QUALITY)
        resolve({
          base64: full.split(',')[1],
          mediaType: 'image/jpeg',
          // Full-size for the local preview, tiny for anything persisted.
          previewUrl: full,
          thumbnailUrl: drawScaled(img, THUMB_EDGE, THUMB_QUALITY),
        })
      } catch (err) {
        reject(err)
      } finally {
        URL.revokeObjectURL(objectUrl)
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not read that image.'))
    }

    img.src = objectUrl
  })
}

/**
 * Estimate a meal's macros.
 *
 * @param params.description free-text description (optional if an image is given)
 * @param params.imageBase64 base64 JPEG/PNG data, no data: prefix
 * @param params.mediaType   e.g. 'image/jpeg'
 * @returns the estimate: { items, kcal, protein_g, carbs_g, fat_g, confidence, assumptions, grounded }
 */
export async function estimateMeal({ description, imageBase64, mediaType }) {
  if (!description && !imageBase64) {
    throw new Error('Describe the meal or add a photo.')
  }

  const callable = httpsCallable(functions, 'estimateMealCallable', { timeout: 120_000 })

  try {
    const { data } = await callable({ description, imageBase64, mediaType })
    return data
  } catch (err) {
    // Callable errors arrive with a `code` like 'functions/unavailable'; the
    // message the function set is the useful part.
    throw new Error(err?.message || 'Could not estimate this meal.')
  }
}

/** Turn an estimate into the entry shape NutritionTracker stores. */
export function estimateToEntry(estimate, { description, source }) {
  return {
    id: crypto.randomUUID(),
    label:
      description?.trim() ||
      estimate.items.map((i) => i.name).join(', ').slice(0, 120) ||
      'Meal',
    kcal: estimate.kcal,
    protein: estimate.protein_g,
    carbs: estimate.carbs_g,
    fat: estimate.fat_g,
    loggedAt: new Date().toISOString(),
    source,
    ...(description?.trim() && { description: description.trim() }),
    ...(estimate.items?.length && { items: estimate.items }),
    ...(estimate.confidence && { confidence: estimate.confidence }),
    ...(estimate.assumptions?.length && { assumptions: estimate.assumptions }),
  }
}

export const CONFIDENCE_COPY = {
  high: { label: 'High confidence', tone: 'success' },
  medium: { label: 'Estimated portions', tone: 'warning' },
  low: { label: 'Rough estimate', tone: 'danger' },
}
