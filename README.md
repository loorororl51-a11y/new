# Video Processing System

A complete video processing system with real-time tracking via WebSocket, automated processing pipeline, and cloud storage integration.

## Features

- 🎥 **Video Upload**: Drag & drop interface for video uploads
- 🔄 **Real-time Tracking**: WebSocket-based progress tracking
- ⚙️ **Automated Processing**: GitHub Actions pipeline for processing
- 🎨 **Video Presets**: Configurable video processing settings
- 📊 **Quality Compression**: High-quality video compression
- ✂️ **Auto-splitting**: Automatic video splitting for large files (>98MB)
- 🖼️ **Thumbnail Generation**: Automatic thumbnail capture at 2 seconds
- ☁️ **Cloud Storage**: ImageKit integration for processed videos
- 🧹 **Auto Cleanup**: Automatic cleanup of original files
- 📱 **Responsive UI**: Modern, mobile-friendly interface

## System Architecture

```
1. Upload → Web Interface
2. Storage → Upload Folder
3. Trigger → GitHub Actions
4. Process → Video Analysis + Preset Application + Compression
5. Split → If >98MB, split into parts
6. Thumbnail → Capture frame at 2 seconds
7. Upload → ImageKit Cloud Storage
8. Results → Save URLs to repository
9. Cleanup → Remove original files
```

## Prerequisites

- Node.js 18+ 
- FFmpeg installed on your system
- ImageKit account and API credentials
- GitHub repository for automated processing

## Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd video-processing-system
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Install FFmpeg**
   
   **Windows:**
   ```bash
   # Download from https://ffmpeg.org/download.html
   # Add to PATH environment variable
   ```
   
   **macOS:**
   ```bash
   brew install ffmpeg
   ```
   
   **Ubuntu/Debian:**
   ```bash
   sudo apt update
   sudo apt install ffmpeg
   ```

4. **Configure environment variables**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` file with your configuration:
   ```env
   # Server Configuration
   PORT=3000
   NODE_ENV=development
   
   # GitHub Configuration
   GITHUB_TOKEN=your_github_token_here
   GITHUB_REPO_OWNER=your_github_username
   GITHUB_REPO_NAME=your_repository_name
   
   # ImageKit Configuration
   IMAGEKIT_PUBLIC_KEY=your_imagekit_public_key
   IMAGEKIT_PRIVATE_KEY=your_imagekit_private_key
   IMAGEKIT_URL_ENDPOINT=your_imagekit_url_endpoint
   
   # File Upload Configuration
   MAX_FILE_SIZE=500000000
   UPLOAD_FOLDER=uploads
   PROCESSED_FOLDER=processed
   THUMBNAIL_FOLDER=thumbnails
   
   # Video Processing Configuration
   MAX_VIDEO_SIZE=98000000
   THUMBNAIL_TIME=2
   ```

5. **Get GitHub Token**
   - Go to GitHub Settings → Developer settings → Personal access tokens
   - Generate a new token with the following permissions:
     - `repo` (Full control of private repositories)
     - `issues` (Create and edit issues)
   - Copy the token and add it to your `.env` file

6. **Get ImageKit Credentials**
   - Sign up at [ImageKit.io](https://imagekit.io)
   - Go to Developer Options → API Keys
   - Copy Public Key, Private Key, and URL Endpoint

## Usage

### Local Development

1. **Start the server**
   ```bash
   npm run dev
   ```

2. **Open the web interface**
   - Navigate to `http://localhost:3000`
   - Upload videos through the drag & drop interface
   - Watch real-time progress updates

### Production Deployment

1. **Deploy to your preferred hosting platform**
   ```bash
   npm start
   ```

2. **Set up GitHub Actions**
   - Push videos to the `uploads/` folder
   - GitHub Actions will automatically process them
   - Results will be saved to `results/video-results.json`

## Video Processing Pipeline

### 1. Upload Process
- User uploads video through web interface
- File is saved to `uploads/` folder
- WebSocket notification sent to all connected clients

### 2. Processing Steps
1. **Analysis**: Extract video properties (duration, resolution, codec, etc.)
2. **Preset Application**: Apply settings from `video-preset.json`
3. **Compression**: High-quality compression with minimal quality loss
4. **Splitting**: If file >98MB, split into multiple parts
5. **Thumbnail**: Capture frame at 2 seconds mark
6. **Upload**: Send processed files to ImageKit
7. **Cleanup**: Remove original uploaded file

### 3. Real-time Tracking
- WebSocket connections provide live progress updates
- Status updates: Uploaded → Processing → Completed/Error
- Progress percentage updates during processing
- System statistics dashboard

### 4. GitHub Integration
- Automatic issue creation for completed processing
- Error issue creation for failed processing
- Results committed to repository
- Repository information and issue management

## Configuration

### Video Preset (`video-preset.json`)
```json
{
  "videoCodec": "h264",
  "audioCodec": "aac",
  "resolution": "1920x1080",
  "bitrate": 974,
  "fps": 29.97,
  "audioChannels": 2,
  "audioSampleRate": 48000
}
```

### Environment Variables
- `PORT`: Server port (default: 3000)
- `GITHUB_TOKEN`: GitHub personal access token
- `GITHUB_REPO_OWNER`: GitHub username or organization
- `GITHUB_REPO_NAME`: Repository name
- `MAX_FILE_SIZE`: Maximum upload size in bytes (default: 500MB)
- `MAX_VIDEO_SIZE`: Maximum processed video size before splitting (default: 98MB)
- `THUMBNAIL_TIME`: Time in seconds for thumbnail capture (default: 2)

## API Endpoints

### Upload Video
```
POST /upload
Content-Type: multipart/form-data

Body: video file
Response: { success: true, videoId: "123", message: "..." }
```

### Get Video Status
```
GET /status/:videoId
Response: { id: "123", status: "processing", progress: 50, ... }
```

### Get All Videos
```
GET /videos
Response: [{ id: "123", status: "completed", ... }, ...]
```

### Test GitHub Connection
```
GET /test-github
Response: { success: true, message: "GitHub connection successful" }
```

### Get Repository Info
```
GET /repo-info
Response: { success: true, data: { name: "...", fullName: "...", ... } }
```

### List Issues
```
GET /issues?state=open
Response: { success: true, data: [{ number: 1, title: "...", ... }, ...] }
```

## WebSocket Events

### Client → Server
- `join-video-room`: Join room for specific video updates
- `leave-video-room`: Leave video room

### Server → Client
- `new-video-upload`: New video uploaded
- `video-status-update`: Video processing status update
- `video-completed`: Video processing completed
- `videos-status`: All videos status
- `system-stats`: System statistics

## GitHub Integration

The system integrates with GitHub in several ways:

### Local Development
- **Issue Creation**: Automatically creates issues for completed video processing
- **Error Reporting**: Creates detailed error issues for failed processing
- **Results Storage**: Commits processing results to the repository
- **Repository Management**: Provides API endpoints for repository information

### GitHub Actions Workflow

The `.github/workflows/video-processing.yml` workflow:

1. **Triggers**: When files are pushed to `uploads/` folder
2. **Environment**: Ubuntu with Node.js 18 and FFmpeg
3. **Processing**: Runs the complete video processing pipeline
4. **Results**: Saves processed video URLs to repository
5. **Cleanup**: Removes original uploaded files
6. **Notification**: Creates GitHub issue with results

## File Structure

```
video-processing-system/
├── server.js                 # Main server file
├── package.json             # Dependencies and scripts
├── video-preset.json        # Video processing settings
├── env.example              # Environment variables template
├── .github/
│   └── workflows/
│       └── video-processing.yml  # GitHub Actions workflow
├── services/
│   ├── VideoProcessor.js    # Video processing logic
│   ├── ImageKitService.js   # Cloud storage integration
│   └── WebSocketManager.js  # Real-time communication
├── public/
│   ├── index.html           # Web interface
│   └── app.js              # Client-side JavaScript
├── uploads/                 # Upload directory
├── processed/               # Processed videos
├── thumbnails/              # Generated thumbnails
└── results/                 # Processing results
```

## Troubleshooting

### Common Issues

1. **FFmpeg not found**
   ```bash
   # Ensure FFmpeg is installed and in PATH
   ffmpeg -version
   ```

2. **ImageKit upload fails**
   - Verify API credentials in `.env`
   - Check ImageKit account status
   - Ensure sufficient storage quota

3. **WebSocket connection issues**
   - Check if server is running
   - Verify CORS settings
   - Check browser console for errors

4. **Large file upload fails**
   - Increase `MAX_FILE_SIZE` in `.env`
   - Check server timeout settings
   - Verify available disk space

### Logs

Enable debug logging by setting `NODE_ENV=development` in `.env`.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review GitHub Issues
3. Create a new issue with detailed information

---

**Note**: This system requires FFmpeg to be installed on the processing environment (local development and GitHub Actions runner).
