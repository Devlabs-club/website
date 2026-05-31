import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadEventHeaderToCloudinary(buffer: Buffer, filename: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        resource_type: 'image',
        public_id: `events/headers/${filename.replace(/\.[^/.]+$/, '')}`,
        folder: 'events/headers',
        overwrite: true,
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result!.secure_url);
        }
      }
    ).end(buffer);
  });
}

export async function uploadResumeToCloudinary(buffer: Buffer, filename: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw',
        public_id: `resumes/${filename.replace('.pdf', '')}`,
        folder: 'resumes',
        overwrite: true,
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result!.secure_url);
        }
      }
    ).end(buffer);
  });
}



export async function deleteResumeFromCloudinary(resumeUrl: string): Promise<boolean> {
  try {
    // Extract public_id from Cloudinary URL
    const publicId = extractPublicIdFromUrl(resumeUrl);
    
    if (!publicId) {
      console.error('Could not extract public ID from URL:', resumeUrl);
      return false;
    }
    
    console.log('Attempting to delete from Cloudinary, public_id:', publicId);
    
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'raw'
    });
    
    console.log('Cloudinary deletion result:', result);
    
    // Cloudinary returns "ok" for successful deletion, "not found" if file doesn't exist
    return result.result === 'ok' || result.result === 'not found';
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    return false;
  }
}

// Helper function to extract public ID from Cloudinary URL
export function extractPublicIdFromUrl(resumeUrl: string): string | null {
  try {
    // Handle different Cloudinary URL formats
    const urlParts = resumeUrl.split('/');
    
    // Find the index of 'upload'
    const uploadIndex = urlParts.findIndex(part => part === 'upload');
    if (uploadIndex === -1) return null;
    
    // The public_id starts after version (v{number}) or directly after 'upload'
    let publicIdStart = uploadIndex + 1;
    
    // Skip version if present
    if (urlParts[publicIdStart] && urlParts[publicIdStart].startsWith('v')) {
      publicIdStart++;
    }
    
    // Get all parts from publicIdStart to end and join them
    const publicIdParts = urlParts.slice(publicIdStart);
    const publicId = publicIdParts.join('/');
    
    // Remove file extension if present
    return publicId.replace(/\.[^/.]+$/, '');
  } catch (error) {
    console.error('Error extracting public ID from URL:', error);
    return null;
  }
}