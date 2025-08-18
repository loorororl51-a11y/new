// Initialize Socket.IO connection
const socket = io();

// DOM elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const uploadLoading = document.getElementById('uploadLoading');
const videosGrid = document.getElementById('videosGrid');
const videosLoading = document.getElementById('videosLoading');
const errorMessage = document.getElementById('errorMessage');
const successMessage = document.getElementById('successMessage');

// Stats elements
const totalVideos = document.getElementById('totalVideos');
const activeVideos = document.getElementById('activeVideos');
const completedVideos = document.getElementById('completedVideos');
const errorVideos = document.getElementById('errorVideos');

// Video tracking
let videos = new Map();

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeUploadArea();
    initializeSocketEvents();
    loadVideos();
    checkGitHubConnection();
});

// Initialize upload area with drag and drop
function initializeUploadArea() {
    // File input change event
    fileInput.addEventListener('change', handleFileSelect);
    
    // Upload button click
    uploadBtn.addEventListener('click', () => fileInput.click());
    
    // Drag and drop events
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    uploadArea.addEventListener('click', () => fileInput.click());
}

// Handle file selection
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        uploadFile(file);
    }
}

// Handle drag over
function handleDragOver(event) {
    event.preventDefault();
    uploadArea.classList.add('dragover');
}

// Handle drag leave
function handleDragLeave(event) {
    event.preventDefault();
    uploadArea.classList.remove('dragover');
}

// Handle drop
function handleDrop(event) {
    event.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        uploadFile(files[0]);
    }
}

// Upload file to server
async function uploadFile(file) {
    // Validate file type
    if (!file.type.startsWith('video/')) {
        showError('Please select a valid video file.');
        return;
    }

    // Validate file size (500MB limit)
    const maxSize = 500 * 1024 * 1024; // 500MB
    if (file.size > maxSize) {
        showError('File size must be less than 500MB.');
        return;
    }

    const formData = new FormData();
    formData.append('video', file);

    try {
        showUploadLoading(true);
        
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            showSuccess(`Video uploaded successfully! Processing started. Video ID: ${result.videoId}`);
            fileInput.value = ''; // Reset file input

            // If using GitHub processing mode, start polling for results from the repository
            if ((result.mode === 'github' || result.mode === 'gofile') && result.videoId) {
                startPollingResults(result.videoId);
            }
        } else {
            showError(result.error || 'Upload failed');
        }
    } catch (error) {
        console.error('Upload error:', error);
        showError('Upload failed. Please try again.');
    } finally {
        showUploadLoading(false);
    }
}

// Show/hide upload loading
function showUploadLoading(show) {
    uploadLoading.style.display = show ? 'block' : 'none';
    uploadBtn.disabled = show;
}

// Show error message
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 5000);
}

// Show success message
function showSuccess(message) {
    successMessage.textContent = message;
    successMessage.style.display = 'block';
    setTimeout(() => {
        successMessage.style.display = 'none';
    }, 5000);
}

// Initialize Socket.IO events
function initializeSocketEvents() {
    // Connection events
    socket.on('connect', () => {
        console.log('Connected to server');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });

    // Video events
    socket.on('new-video-upload', (video) => {
        addVideo(video);
        updateStats();
    });

    socket.on('video-status-update', (video) => {
        updateVideo(video);
        updateStats();
    });

    socket.on('video-completed', (video) => {
        updateVideo(video);
        updateStats();
        showSuccess(`Video "${video.originalName}" processing completed!`);
    });

    socket.on('videos-status', (videosList) => {
        videos.clear();
        videosList.forEach(video => {
            videos.set(video.id, video);
        });
        renderVideos();
        updateStats();
    });

    socket.on('system-stats', (stats) => {
        updateStatsDisplay(stats);
    });
}

// Load videos from server
async function loadVideos() {
    try {
        videosLoading.style.display = 'block';
        
        const response = await fetch('/videos');
        const videosList = await response.json();
        
        videos.clear();
        videosList.forEach(video => {
            videos.set(video.id, video);
        });
        
        renderVideos();
        updateStats();
    } catch (error) {
        console.error('Error loading videos:', error);
        showError('Failed to load videos');
    } finally {
        videosLoading.style.display = 'none';
    }
}

// Add new video to tracking
function addVideo(video) {
    videos.set(video.id, video);
    renderVideos();
}

// Update existing video
function updateVideo(video) {
    videos.set(video.id, video);
    updateVideoCard(video);
}

// Render all videos
function renderVideos() {
    if (videos.size === 0) {
        videosGrid.innerHTML = '<p style="text-align: center; color: #666; grid-column: 1 / -1;">No videos uploaded yet</p>';
        return;
    }

    videosGrid.innerHTML = '';
    videos.forEach(video => {
        const videoCard = createVideoCard(video);
        videosGrid.appendChild(videoCard);
    });
}

// Create video card element
function createVideoCard(video) {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.id = `video-${video.id}`;
    
    card.innerHTML = `
        <div class="video-header">
            <div class="video-name">${video.originalName}</div>
            <div class="video-status status-${video.status}">${getStatusText(video.status)}</div>
        </div>
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${video.progress}%"></div>
        </div>
        <div class="video-info">
            <div>Size: ${formatFileSize(video.size)}</div>
            <div>Uploaded: ${formatDate(video.timestamp)}</div>
            ${video.lastUpdate ? `<div>Last Update: ${formatDate(video.lastUpdate)}</div>` : ''}
        </div>
        <div class="video-actions">
            ${video.status === 'completed' ? `
                <button class="action-btn btn-view" onclick="viewVideo('${video.id}')">
                    <i class="fas fa-eye"></i> View
                </button>
                <button class="action-btn btn-download" onclick="downloadVideo('${video.id}')">
                    <i class="fas fa-download"></i> Download
                </button>
            ` : ''}
        </div>
    `;
    
    return card;
}

// Update specific video card
function updateVideoCard(video) {
    const card = document.getElementById(`video-${video.id}`);
    if (card) {
        const newCard = createVideoCard(video);
        card.replaceWith(newCard);
    }
}

// Get status text
function getStatusText(status) {
    const statusMap = {
        'uploaded': 'Uploaded',
        'processing': 'Processing',
        'completed': 'Completed',
        'error': 'Error'
    };
    return statusMap[status] || status;
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString();
}

// Update stats
function updateStats() {
    const stats = {
        total: videos.size,
        uploaded: 0,
        processing: 0,
        completed: 0,
        error: 0,
        active: 0
    };

    videos.forEach(video => {
        stats[video.status]++;
        if (video.status === 'uploaded' || video.status === 'processing') {
            stats.active++;
        }
    });

    updateStatsDisplay(stats);
}

// Update stats display
function updateStatsDisplay(stats) {
    totalVideos.textContent = stats.total;
    activeVideos.textContent = stats.active;
    completedVideos.textContent = stats.completed;
    errorVideos.textContent = stats.error;
}

// View video
function viewVideo(videoId) {
    const video = videos.get(videoId);
    if (video && video.processedVideoUrl) {
        window.open(video.processedVideoUrl, '_blank');
    }
}

// Download video
function downloadVideo(videoId) {
    const video = videos.get(videoId);
    if (video && video.processedVideoUrl) {
        const link = document.createElement('a');
        link.href = video.processedVideoUrl;
        link.download = video.originalName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// Poll for GitHub Action results and update UI when ready
function startPollingResults(videoId) {
    const pollIntervalMs = 15000; // 15 seconds
    const maxAttempts = 80; // ~20 minutes
    let attempts = 0;

    const intervalId = setInterval(async () => {
        attempts++;
        try {
            const resp = await fetch(`/results/${videoId}`);
            if (resp.ok) {
                const payload = await resp.json();
                if (payload && payload.success && payload.data) {
                    // Support either flat structure or nested under `results`
                    const data = payload.data.results || payload.data;
                    const existing = videos.get(videoId) || { id: videoId };
                    const updated = {
                        ...existing,
                        status: 'completed',
                        progress: 100,
                        processedVideoUrl: data.videoUrl || existing.processedVideoUrl,
                        thumbnailUrl: data.thumbnailUrl || existing.thumbnailUrl,
                        videoParts: data.videoParts || existing.videoParts || []
                    };
                    videos.set(videoId, updated);
                    updateVideoCard(updated);
                    updateStats();
                    showSuccess(`Video processing completed!`);
                    clearInterval(intervalId);
                }
            }
        } catch (e) {
            // ignore and continue polling
        }

        if (attempts >= maxAttempts) {
            clearInterval(intervalId);
            showError('Timed out waiting for processing results.');
        }
    }, pollIntervalMs);
}

// Join video room for real-time updates
function joinVideoRoom(videoId) {
    socket.emit('join-video-room', videoId);
}

// Leave video room
function leaveVideoRoom(videoId) {
    socket.emit('leave-video-room', videoId);
}

// GitHub Integration Functions
async function checkGitHubConnection() {
    const githubStatus = document.getElementById('githubStatus');
    
    try {
        const response = await fetch('/test-github');
        const result = await response.json();
        
        if (result.success) {
            githubStatus.innerHTML = `
                <div class="github-status success">
                    <i class="fas fa-check-circle"></i>
                    <strong>GitHub Connected</strong><br>
                    Repository: ${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}
                </div>
            `;
        } else {
            githubStatus.innerHTML = `
                <div class="github-status error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>GitHub Connection Failed</strong><br>
                    ${result.error || 'Unable to connect to GitHub'}
                </div>
            `;
        }
    } catch (error) {
        githubStatus.innerHTML = `
            <div class="github-status error">
                <i class="fas fa-exclamation-triangle"></i>
                <strong>GitHub Connection Error</strong><br>
                ${error.message}
            </div>
        `;
    }
}

async function testGitHubConnection() {
    const githubStatus = document.getElementById('githubStatus');
    githubStatus.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>Testing GitHub connection...</p>
        </div>
    `;
    
    await checkGitHubConnection();
}

async function showRepoInfo() {
    try {
        const response = await fetch('/repo-info');
        const result = await response.json();
        
        if (result.success) {
            const repoInfo = result.data;
            showModal('Repository Information', `
                <div style="line-height: 1.6;">
                    <p><strong>Name:</strong> ${repoInfo.name}</p>
                    <p><strong>Full Name:</strong> ${repoInfo.fullName}</p>
                    <p><strong>Description:</strong> ${repoInfo.description || 'No description'}</p>
                    <p><strong>URL:</strong> <a href="${repoInfo.url}" target="_blank">${repoInfo.url}</a></p>
                    <p><strong>Default Branch:</strong> ${repoInfo.defaultBranch}</p>
                    <p><strong>Size:</strong> ${repoInfo.size} KB</p>
                    <p><strong>Language:</strong> ${repoInfo.language || 'Not specified'}</p>
                </div>
            `);
        } else {
            showModal('Error', `<p>Failed to get repository information: ${result.error}</p>`);
        }
    } catch (error) {
        showModal('Error', `<p>Error: ${error.message}</p>`);
    }
}

async function showIssues() {
    try {
        const response = await fetch('/issues?state=open');
        const result = await response.json();
        
        if (result.success) {
            const issues = result.data;
            let issuesHtml = '<div style="line-height: 1.6;">';
            
            if (issues.length === 0) {
                issuesHtml += '<p>No open issues found.</p>';
            } else {
                issuesHtml += `<p><strong>Found ${issues.length} open issues:</strong></p>`;
                issues.forEach(issue => {
                    const labels = issue.labels.map(label => 
                        `<span style="background: #${label.color}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 0.8em; margin-right: 5px;">${label.name}</span>`
                    ).join('');
                    
                    issuesHtml += `
                        <div style="border: 1px solid #e0e0e0; padding: 10px; margin: 10px 0; border-radius: 5px;">
                            <h4><a href="${issue.html_url}" target="_blank">${issue.title}</a></h4>
                            <p><strong>#${issue.number}</strong> opened by ${issue.user.login}</p>
                            <p>${labels}</p>
                            <p style="color: #666; font-size: 0.9em;">${issue.body ? issue.body.substring(0, 200) + '...' : 'No description'}</p>
                        </div>
                    `;
                });
            }
            
            issuesHtml += '</div>';
            showModal('Open Issues', issuesHtml);
        } else {
            showModal('Error', `<p>Failed to get issues: ${result.error}</p>`);
        }
    } catch (error) {
        showModal('Error', `<p>Error: ${error.message}</p>`);
    }
}

function showModal(title, content) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = content;
    document.getElementById('githubModal').style.display = 'block';
}

function closeModal() {
    document.getElementById('githubModal').style.display = 'none';
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('githubModal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
}
