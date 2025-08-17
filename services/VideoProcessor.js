const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs-extra');
const path = require('path');

class VideoProcessor {
  constructor() {
    this.preset = require('../video-preset.json');
    this.processedDir = process.env.PROCESSED_FOLDER || 'processed';
    this.thumbnailDir = process.env.THUMBNAIL_FOLDER || 'thumbnails';
    this.maxVideoSize = parseInt(process.env.MAX_VIDEO_SIZE) || 98000000; // 98MB
  }

  async analyzeVideo(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');

        const properties = {
          duration: metadata.format.duration,
          size: metadata.format.size,
          bitrate: metadata.format.bit_rate,
          videoCodec: videoStream ? videoStream.codec_name : null,
          audioCodec: audioStream ? audioStream.codec_name : null,
          width: videoStream ? videoStream.width : null,
          height: videoStream ? videoStream.height : null,
          fps: videoStream ? eval(videoStream.r_frame_rate) : null,
          audioChannels: audioStream ? audioStream.channels : null,
          audioSampleRate: audioStream ? audioStream.sample_rate : null
        };

        resolve(properties);
      });
    });
  }

  async processVideo(inputPath, videoId, progressCallback) {
    const outputPath = path.join(this.processedDir, `processed-${videoId}.mp4`);
    
    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath)
        .videoCodec(this.preset.videoCodec)
        .audioCodec(this.preset.audioCodec)
        .size(this.preset.resolution)
        .videoBitrate(this.preset.bitrate + 'k')
        .fps(this.preset.fps)
        .audioChannels(this.preset.audioChannels)
        .audioFrequency(this.preset.audioSampleRate)
        .outputOptions([
          '-preset', 'slow', // Better compression
          '-crf', '18', // High quality
          '-movflags', '+faststart' // Optimize for web streaming
        ])
        .output(outputPath);

      // Progress tracking
      command.on('progress', (progress) => {
        if (progressCallback) {
          progressCallback(progress.percent || 0);
        }
      });

      command.on('end', async () => {
        try {
          // Check if file size exceeds limit
          const stats = await fs.stat(outputPath);
          if (stats.size > this.maxVideoSize) {
            // Split video into parts
            const parts = await this.splitVideo(outputPath, videoId);
            await fs.remove(outputPath);
            resolve(parts);
          } else {
            resolve(outputPath);
          }
        } catch (error) {
          reject(error);
        }
      });

      command.on('error', (err) => {
        reject(err);
      });

      command.run();
    });
  }

  async splitVideo(videoPath, videoId) {
    const duration = await this.getVideoDuration(videoPath);
    const maxDuration = this.calculateMaxDuration(videoPath);
    const parts = [];

    for (let i = 0; i < Math.ceil(duration / maxDuration); i++) {
      const startTime = i * maxDuration;
      const endTime = Math.min((i + 1) * maxDuration, duration);
      const partPath = path.join(this.processedDir, `part-${i + 1}-${videoId}.mp4`);

      await this.extractVideoSegment(videoPath, partPath, startTime, endTime);
      parts.push(partPath);
    }

    return parts;
  }

  async getVideoDuration(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(parseFloat(metadata.format.duration));
      });
    });
  }

  calculateMaxDuration(videoPath) {
    // Estimate max duration based on target file size
    // This is a simplified calculation
    return 300; // 5 minutes per part
  }

  async extractVideoSegment(inputPath, outputPath, startTime, endTime) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(endTime - startTime)
        .videoCodec(this.preset.videoCodec)
        .audioCodec(this.preset.audioCodec)
        .size(this.preset.resolution)
        .videoBitrate(this.preset.bitrate + 'k')
        .fps(this.preset.fps)
        .audioChannels(this.preset.audioChannels)
        .audioFrequency(this.preset.audioSampleRate)
        .outputOptions([
          '-preset', 'slow',
          '-crf', '18',
          '-movflags', '+faststart'
        ])
        .output(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', (err) => reject(err))
        .run();
    });
  }

  async generateThumbnail(videoPath, videoId, timeInSeconds = 2) {
    const thumbnailPath = path.join(this.thumbnailDir, `thumbnail-${videoId}.jpg`);
    
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          timestamps: [timeInSeconds],
          filename: path.basename(thumbnailPath),
          folder: path.dirname(thumbnailPath),
          size: '320x240'
        })
        .on('end', () => resolve(thumbnailPath))
        .on('error', (err) => reject(err));
    });
  }

  async cleanupFiles(filePaths) {
    for (const filePath of filePaths) {
      try {
        await fs.remove(filePath);
      } catch (error) {
        console.error(`Error cleaning up file ${filePath}:`, error);
      }
    }
  }
}

module.exports = VideoProcessor;
