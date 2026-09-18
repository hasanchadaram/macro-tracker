import { supabase } from '@/lib/supabase';

interface ScanFoodParams {
  text?: string;
  imageUri?: string;
  imageBase64?: string;
  mealType?: string;
  idempotencyKey?: string;
  taggedFoods?: any[];
  onUploadProgress?: (progress: number) => void;
  onUploadComplete?: () => void;
}

export function invokeScanFoodWithProgress({
  text,
  imageUri,
  imageBase64,
  mealType,
  idempotencyKey,
  taggedFoods,
  onUploadProgress,
  onUploadComplete,
}: ScanFoodParams): Promise<any> {
  return new Promise(async (resolve, reject) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      const functionUrl = `${supabaseUrl}/functions/v1/scan-food`;

      const xhr = new XMLHttpRequest();
      xhr.open('POST', functionUrl);

      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      xhr.setRequestHeader('apikey', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '');
      if (idempotencyKey) {
        xhr.setRequestHeader('x-idempotency-key', idempotencyKey);
      }

      let uploadCompleted = false;
      const triggerUploadComplete = () => {
        if (!uploadCompleted) {
          uploadCompleted = true;
          if (onUploadComplete) {
            onUploadComplete();
          }
        }
      };

      // Exact network-level upload tracking across all React Native / OS layers
      if (xhr.upload) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onUploadProgress) {
            onUploadProgress(e.loaded / e.total);
          }
          if (e.lengthComputable && e.loaded >= e.total) {
            triggerUploadComplete();
          }
        };

        xhr.upload.onload = () => {
          triggerUploadComplete();
        };

        if (typeof xhr.upload.addEventListener === 'function') {
          xhr.upload.addEventListener('load', triggerUploadComplete);
          xhr.upload.addEventListener('progress', (e: any) => {
            if (e.lengthComputable && e.loaded >= e.total) {
              triggerUploadComplete();
            }
          });
        }
      }

      // Safety fallback: Since 720px binary upload completes in < 50ms over Wi-Fi,
      // guarantee upload state triggers in at most 250ms even if native bridge lags on event delivery
      const fallbackTimer = setTimeout(() => {
        triggerUploadComplete();
      }, 250);

      xhr.onload = () => {
        clearTimeout(fallbackTimer);
        triggerUploadComplete();
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch (_e) {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({ success: true, raw: xhr.responseText });
          } else {
            resolve({ error: xhr.responseText || `Server responded with HTTP ${xhr.status}` });
          }
        }
      };

      xhr.onerror = () => {
        clearTimeout(fallbackTimer);
        reject(new Error('Network request failed. Please check your connection.'));
      };

      xhr.ontimeout = () => {
        clearTimeout(fallbackTimer);
        reject(new Error('Request timed out. Please try again.'));
      };

      if (imageUri) {
        // Stream binary file directly via multipart FormData (0% base64 bloat)
        const formData = new FormData();
        formData.append('image', {
          uri: imageUri,
          name: 'food.jpg',
          type: 'image/jpeg',
        } as any);

        if (text) formData.append('text', text);
        if (mealType) formData.append('meal_type', mealType);
        if (idempotencyKey) formData.append('idempotency_key', idempotencyKey);
        if (taggedFoods && taggedFoods.length > 0) {
          formData.append('tagged_foods', JSON.stringify(taggedFoods));
        }

        xhr.send(formData);
      } else if (imageBase64) {
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(
          JSON.stringify({
            text,
            image_base64: imageBase64,
            meal_type: mealType,
            idempotency_key: idempotencyKey,
            tagged_foods: taggedFoods,
          })
        );
        triggerUploadComplete();
      } else {
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(
          JSON.stringify({
            text,
            meal_type: mealType,
            idempotency_key: idempotencyKey,
            tagged_foods: taggedFoods,
          })
        );
        triggerUploadComplete();
      }
    } catch (err) {
      reject(err);
    }
  });
}
