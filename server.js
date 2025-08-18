const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const cors = require('cors');
require('dotenv').config();

const VideoProcessor = require('./services/VideoProcessor');
const ImageKitService = require('./services/ImageKitService');
const WebSocketManager = require('./services/WebSocketManager');
const GitHubService = require('./services/GitHubService');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Create necessary directories
const uploadDir = process.env.UPLOAD_FOLDER || 'uploads';
const processedDir = process.env.PROCESSED_FOLDER || 'processed';
const thumbnailDir = process.env.THUMBNAIL_FOLDER || 'thumbnails';

fs.ensureDirSync(uploadDir);
fs.ensureDirSync(processedDir);
fs.ensureDirSync(thumbnailDir);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 500000000 // 500MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp4|avi|mov|mkv|wmv|flv|webm/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only video files are allowed!'));
    }
  }
});

// Initialize services
const videoProcessor = new VideoProcessor();
const imageKitService = new ImageKitService();
const wsManager = new WebSocketManager(io);
const githubService = new GitHubService();

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Upload endpoint
app.post('/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    const videoInfo = {
      id: Date.now().toString(),
      originalName: req.file.originalname,
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size,
      status: 'uploaded',
      progress: 0,
      timestamp: new Date().toISOString()
    };

    // Notify connected clients about new upload
    wsManager.notifyNewUpload(videoInfo);

    const processingMode = (process.env.PROCESSING_MODE || 'local').toLowerCase();

    if (processingMode === 'github') {
      // Commit uploaded file to GitHub repo uploads/ folder and let Actions process it
      const repoUploadPath = `uploads/${videoInfo.filename}`;
      const commitMessage = `Upload video ${videoInfo.originalName} (id: ${videoInfo.id})`;

      try {
        await githubService.commitLocalFileToRepo(videoInfo.path, repoUploadPath, commitMessage);
        // Optionally remove local file after committing
        await fs.remove(videoInfo.path).catch(() => {});

        wsManager.updateVideoStatus(videoInfo.id, 'processing', 15);

        res.json({
          success: true,
          videoId: videoInfo.id,
          mode: 'github',
          message: 'Video uploaded. GitHub Action will process it shortly.'
        });
      } catch (err) {
        console.error('GitHub commit error:', err);
        wsManager.updateVideoStatus(videoInfo.id, 'error', 0, err.message);
        return res.status(500).json({ success: false, error: 'Failed to push video to GitHub' });
      }
    } else {
      // Local processing path (existing behavior)
      processVideo(videoInfo);

      res.json({
        success: true,
        videoId: videoInfo.id,
        mode: 'local',
        message: 'Video uploaded successfully. Processing started.'
      });
    }

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Get processing status
app.get('/status/:videoId', (req, res) => {
  const videoId = req.params.videoId;
  const status = wsManager.getVideoStatus(videoId);
  
  if (status) {
    res.json(status);
  } else {
    res.status(404).json({ error: 'Video not found' });
  }
});

// Get all videos status
app.get('/videos', (req, res) => {
  const videos = wsManager.getAllVideos();
  res.json(videos);
});

// Poll for results produced by GitHub Action (or local process committed to repo)
app.get('/results/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const result = await githubService.tryGetResultsById(videoId);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Results not found yet' });
    }
    res.json({ success: true, data: result.json, path: result.path });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Test GitHub connection
app.get('/test-github', async (req, res) => {
  try {
    const isConnected = await githubService.testConnection();
    res.json({ 
      success: isConnected, 
      message: isConnected ? 'GitHub connection successful' : 'GitHub connection failed' 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get repository info
app.get('/repo-info', async (req, res) => {
  try {
    const repoInfo = await githubService.getRepositoryInfo();
    res.json({ success: true, data: repoInfo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// List issues
app.get('/issues', async (req, res) => {
  try {
    const state = req.query.state || 'open';
    const issues = await githubService.listIssues(state);
    res.json({ success: true, data: issues });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Process video function
async function processVideo(videoInfo) {
  try {
    // Update status to processing
    wsManager.updateVideoStatus(videoInfo.id, 'processing', 10);

    // Analyze video properties
    const videoProperties = await videoProcessor.analyzeVideo(videoInfo.path);
    wsManager.updateVideoStatus(videoInfo.id, 'processing', 20);

    // Apply video preset and compress
    const processedPath = await videoProcessor.processVideo(
      videoInfo.path, 
      videoInfo.id,
      (progress) => {
        const adjustedProgress = 20 + (progress * 0.4); // 20-60%
        wsManager.updateVideoStatus(videoInfo.id, 'processing', adjustedProgress);
      }
    );
    wsManager.updateVideoStatus(videoInfo.id, 'processing', 60);

    // Generate thumbnail
    const thumbnailPath = await videoProcessor.generateThumbnail(
      processedPath, 
      videoInfo.id,
      parseInt(process.env.THUMBNAIL_TIME) || 2
    );
    wsManager.updateVideoStatus(videoInfo.id, 'processing', 70);

    // Upload to ImageKit
    const uploadResults = await imageKitService.uploadFiles([
      { path: processedPath, type: 'video' },
      { path: thumbnailPath, type: 'image' }
    ], (progress) => {
      const adjustedProgress = 70 + (progress * 0.25); // 70-95%
      wsManager.updateVideoStatus(videoInfo.id, 'processing', adjustedProgress);
    });

    // Update video info with results
    videoInfo.processedVideoUrl = uploadResults.videoUrl;
    videoInfo.thumbnailUrl = uploadResults.thumbnailUrl;
    videoInfo.status = 'completed';
    videoInfo.progress = 100;

    wsManager.updateVideoStatus(videoInfo.id, 'completed', 100);

    // Create GitHub issue for completed processing
    try {
      await githubService.createVideoProcessingIssue(videoInfo, uploadResults);
      console.log(`GitHub issue created for video ${videoInfo.id}`);
    } catch (error) {
      console.error('Error creating GitHub issue:', error);
    }

    // Commit results to GitHub repository
    try {
      await githubService.commitResults(uploadResults, videoInfo);
      console.log(`Results committed to GitHub for video ${videoInfo.id}`);
    } catch (error) {
      console.error('Error committing results to GitHub:', error);
    }

    // Cleanup original file
    await fs.remove(videoInfo.path);

    console.log(`Video ${videoInfo.id} processed successfully`);

  } catch (error) {
    console.error(`Error processing video ${videoInfo.id}:`, error);
    wsManager.updateVideoStatus(videoInfo.id, 'error', 0, error.message);
    
    // Create GitHub issue for error
    try {
      await githubService.createErrorIssue(videoInfo, error);
      console.log(`Error issue created for video ${videoInfo.id}`);
    } catch (githubError) {
      console.error('Error creating GitHub error issue:', githubError);
    }
  }
}

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('join-video-room', (videoId) => {
    socket.join(`video-${videoId}`);
    console.log(`Client ${socket.id} joined room for video ${videoId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server ready for real-time updates`);
  
  // Test GitHub connection on startup
  if (process.env.GITHUB_TOKEN) {
    console.log('Testing GitHub connection...');
    await githubService.testConnection();
  } else {
    console.log('⚠️  GitHub token not configured. GitHub features will be disabled.');
  }
});
