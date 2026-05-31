import type { APIRoute } from 'astro';
import { connectAdminDB } from '../../../../../lib/mongodb';
import { requireAdmin, jsonResponse } from '../../../../../lib/events/adminAuth';
import { uploadEventHeaderToCloudinary } from '../../../../../lib/cloudinary';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE = 5 * 1024 * 1024;

export const POST: APIRoute = async ({ request }) => {
  try {
    const admin = await requireAdmin(request);
    if (!admin.ok) return admin.response;

    await connectAdminDB();

    const formData = await request.formData();
    const file = formData.get('header');
    if (!(file instanceof File)) {
      return jsonResponse(400, { success: false, message: 'No image uploaded' });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return jsonResponse(400, { success: false, message: 'Only JPG, PNG, or WebP images are supported' });
    }
    if (file.size > MAX_SIZE) {
      return jsonResponse(400, { success: false, message: 'Image must be under 5MB' });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const safeFilename = `event-header-${admin.user._id}-${Date.now()}`;
    const headerImageUrl = await uploadEventHeaderToCloudinary(buffer, safeFilename);

    return jsonResponse(200, { success: true, headerImageUrl });
  } catch (error) {
    console.error('[events/admin/upload-header] failed', error);
    return jsonResponse(500, { success: false, message: 'Failed to upload header image' });
  }
};
