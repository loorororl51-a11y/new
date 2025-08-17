class WebSocketManager {
  constructor(io) {
    this.io = io;
    this.videos = new Map(); // Store video processing status
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);

      // Send current videos status to new client
      socket.emit('videos-status', Array.from(this.videos.values()));

      socket.on('join-video-room', (videoId) => {
        socket.join(`video-${videoId}`);
        console.log(`Client ${socket.id} joined room for video ${videoId}`);
        
        // Send current status for this video
        const videoStatus = this.videos.get(videoId);
        if (videoStatus) {
          socket.emit('video-status-update', videoStatus);
        }
      });

      socket.on('leave-video-room', (videoId) => {
        socket.leave(`video-${videoId}`);
        console.log(`Client ${socket.id} left room for video ${videoId}`);
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });
  }

  notifyNewUpload(videoInfo) {
    this.videos.set(videoInfo.id, {
      id: videoInfo.id,
      originalName: videoInfo.originalName,
      status: videoInfo.status,
      progress: videoInfo.progress,
      timestamp: videoInfo.timestamp,
      size: videoInfo.size
    });

    // Notify all connected clients about new upload
    this.io.emit('new-video-upload', {
      id: videoInfo.id,
      originalName: videoInfo.originalName,
      status: videoInfo.status,
      progress: videoInfo.progress,
      timestamp: videoInfo.timestamp,
      size: videoInfo.size
    });

    console.log(`New video upload notified: ${videoInfo.id}`);
  }

  updateVideoStatus(videoId, status, progress, error = null) {
    const video = this.videos.get(videoId);
    if (!video) {
      console.warn(`Video ${videoId} not found for status update`);
      return;
    }

    const updatedVideo = {
      ...video,
      status,
      progress,
      lastUpdate: new Date().toISOString()
    };

    if (error) {
      updatedVideo.error = error;
    }

    this.videos.set(videoId, updatedVideo);

    // Notify clients in the specific video room
    this.io.to(`video-${videoId}`).emit('video-status-update', updatedVideo);

    // Also notify all clients about the update
    this.io.emit('video-status-update', updatedVideo);

    console.log(`Video ${videoId} status updated: ${status} (${progress}%)`);
  }

  updateVideoResults(videoId, results) {
    const video = this.videos.get(videoId);
    if (!video) {
      console.warn(`Video ${videoId} not found for results update`);
      return;
    }

    const updatedVideo = {
      ...video,
      processedVideoUrl: results.videoUrl,
      thumbnailUrl: results.thumbnailUrl,
      videoParts: results.videoParts || [],
      status: 'completed',
      progress: 100,
      completedAt: new Date().toISOString()
    };

    this.videos.set(videoId, updatedVideo);

    // Notify clients in the specific video room
    this.io.to(`video-${videoId}`).emit('video-completed', updatedVideo);

    // Also notify all clients about the completion
    this.io.emit('video-completed', updatedVideo);

    console.log(`Video ${videoId} completed with results`);
  }

  getVideoStatus(videoId) {
    return this.videos.get(videoId);
  }

  getAllVideos() {
    return Array.from(this.videos.values());
  }

  getVideosByStatus(status) {
    return Array.from(this.videos.values()).filter(video => video.status === status);
  }

  getActiveVideos() {
    return Array.from(this.videos.values()).filter(video => 
      video.status === 'uploaded' || video.status === 'processing'
    );
  }

  getCompletedVideos() {
    return Array.from(this.videos.values()).filter(video => video.status === 'completed');
  }

  getErrorVideos() {
    return Array.from(this.videos.values()).filter(video => video.status === 'error');
  }

  removeVideo(videoId) {
    const removed = this.videos.delete(videoId);
    if (removed) {
      this.io.emit('video-removed', { id: videoId });
      console.log(`Video ${videoId} removed from tracking`);
    }
    return removed;
  }

  clearCompletedVideos() {
    const completedVideos = this.getCompletedVideos();
    completedVideos.forEach(video => {
      this.videos.delete(video.id);
    });

    this.io.emit('videos-cleared', { count: completedVideos.length });
    console.log(`Cleared ${completedVideos.length} completed videos`);
  }

  getSystemStats() {
    const total = this.videos.size;
    const uploaded = this.getVideosByStatus('uploaded').length;
    const processing = this.getVideosByStatus('processing').length;
    const completed = this.getVideosByStatus('completed').length;
    const error = this.getVideosByStatus('error').length;

    return {
      total,
      uploaded,
      processing,
      completed,
      error,
      active: uploaded + processing
    };
  }

  broadcastSystemStats() {
    const stats = this.getSystemStats();
    this.io.emit('system-stats', stats);
  }

  // Periodic stats broadcast
  startStatsBroadcast(interval = 30000) { // 30 seconds
    setInterval(() => {
      this.broadcastSystemStats();
    }, interval);
  }
}

module.exports = WebSocketManager;
