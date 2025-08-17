const ImageKit = require('imagekit');
const fs = require('fs-extra');
const path = require('path');

class ImageKitService {
  constructor() {
    this.imagekit = new ImageKit({
      publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
      urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
    });
  }

  async uploadFiles(files, progressCallback) {
    const results = {
      videoUrl: null,
      thumbnailUrl: null,
      videoParts: []
    };

    let uploadedCount = 0;
    const totalFiles = files.length;

    for (const file of files) {
      try {
        const uploadResult = await this.uploadFile(file.path, file.type);
        
        if (file.type === 'video') {
          if (Array.isArray(uploadResult)) {
            // Multiple video parts
            results.videoParts = uploadResult;
            results.videoUrl = uploadResult[0]; // First part as main URL
          } else {
            results.videoUrl = uploadResult;
          }
        } else if (file.type === 'image') {
          results.thumbnailUrl = uploadResult;
        }

        uploadedCount++;
        if (progressCallback) {
          progressCallback((uploadedCount / totalFiles) * 100);
        }

      } catch (error) {
        console.error(`Error uploading ${file.type}:`, error);
        throw error;
      }
    }

    return results;
  }

  async uploadFile(filePath, fileType) {
    return new Promise((resolve, reject) => {
      const fileName = path.basename(filePath);
      const folder = this.getFolderForType(fileType);
      
      fs.readFile(filePath, (err, data) => {
        if (err) {
          reject(err);
          return;
        }

        const uploadOptions = {
          file: data,
          fileName: fileName,
          folder: folder,
          useUniqueFileName: true,
          tags: [fileType, 'video-processing-system']
        };

        this.imagekit.upload(uploadOptions, (error, result) => {
          if (error) {
            reject(error);
            return;
          }

          // Clean up local file after successful upload
          fs.remove(filePath).catch(console.error);

          resolve(result.url);
        });
      });
    });
  }

  async uploadVideoParts(videoPaths) {
    const uploadedUrls = [];
    
    for (const videoPath of videoPaths) {
      try {
        const url = await this.uploadFile(videoPath, 'video');
        uploadedUrls.push(url);
      } catch (error) {
        console.error(`Error uploading video part ${videoPath}:`, error);
        throw error;
      }
    }

    return uploadedUrls;
  }

  getFolderForType(fileType) {
    switch (fileType) {
      case 'video':
        return '/videos/processed';
      case 'image':
        return '/thumbnails';
      default:
        return '/uploads';
    }
  }

  async deleteFile(fileUrl) {
    return new Promise((resolve, reject) => {
      // Extract file ID from URL
      const fileId = this.extractFileIdFromUrl(fileUrl);
      
      if (!fileId) {
        reject(new Error('Invalid file URL'));
        return;
      }

      this.imagekit.deleteFile(fileId, (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      });
    });
  }

  extractFileIdFromUrl(url) {
    // Extract file ID from ImageKit URL
    // This is a simplified extraction - adjust based on your ImageKit URL structure
    const match = url.match(/\/([a-zA-Z0-9_-]+)\.[a-zA-Z0-9]+$/);
    return match ? match[1] : null;
  }

  async getFileInfo(fileUrl) {
    return new Promise((resolve, reject) => {
      const fileId = this.extractFileIdFromUrl(fileUrl);
      
      if (!fileId) {
        reject(new Error('Invalid file URL'));
        return;
      }

      this.imagekit.getFileDetails(fileId, (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      });
    });
  }
}

module.exports = ImageKitService;
